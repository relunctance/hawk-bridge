// Embeddings module — handles vectorization
// Supports: OpenAI, Qianwen (阿里云), Jina AI, Cohere, Ollama, OpenAI-Compatible

import http from 'http';
import https from 'https';
import { URL } from 'url';
import { HawkConfig } from './types.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { logger } from './logger.js';
import { embeddingLatency } from './metrics.js';
import { CircuitBreaker, CircuitOpenError } from './utils/circuit-breaker.js';

const FETCH_TIMEOUT_MS = 15000;

// Circuit breaker for embedding calls — opens after 5 consecutive failures
const embedBreaker = new CircuitBreaker(5, 30_000);

// ─── Retry helper ──────────────────────────────────────────────────────────────

/**
 * Fetch with retry and exponential backoff.
 * Catches timeout/network errors and retries up to `retries` times.
 * Delays: 500ms, 1s, 2s (exponential backoff).
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number } = {},
  retries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, options.timeout ?? FETCH_TIMEOUT_MS);
      return response;
    } catch (err: any) {
      lastError = err;
      const isNetworkError =
        err?.message?.includes('timeout') ||
        err?.message?.includes('ECONNREFUSED') ||
        err?.message?.includes('ENOTFOUND') ||
        err?.message?.includes('socket hang up') ||
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'ENOTFOUND' ||
        err?.code === 'ETIMEDOUT';

      if (isNetworkError && attempt < retries) {
        const delay = 500 * Math.pow(2, attempt - 1);
        logger.warn({ attempt, retries, delayMs: delay, url, error: err.message }, 'fetchWithRetry: retrying after network error');
        await new Promise(res => setTimeout(res, delay));
      } else if (attempt < retries && err?.message?.includes('status code 5')) {
        // Retry on 5xx errors
        const delay = 500 * Math.pow(2, attempt - 1);
        logger.warn({ attempt, retries, delayMs: delay, url, error: err.message }, 'fetchWithRetry: retrying after 5xx error');
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * Module-level proxy URL — set by Embedder constructor from config.proxy.
 * Also falls back to HAWK_PROXY / HTTPS_PROXY / https_proxy env vars.
 * This lets standalone functions (fetchWithTimeout) use the same proxy as the Embedder.
 */
let _activeProxyUrl: string = process.env.HAWK_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || '';
let _proxyAgent: HttpsProxyAgent<string> | null = null;

/**
 * Update the active proxy URL (called by Embedder on init).
 * Setting to '' clears and forces re-read from env vars on next call.
 */
export function setProxyUrl(url: string): void {
  _activeProxyUrl = url;
  _proxyAgent = null; // force re-create with new URL
}

/** Get the active proxy URL (env var takes precedence if set) */
export function getProxyUrl(): string {
  return process.env.HAWK_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || _activeProxyUrl;
}

/** Lazily-created proxy agent — reads from config.proxy (via _activeProxyUrl) or env vars */
function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return undefined;
  if (!_proxyAgent) {
    _proxyAgent = new HttpsProxyAgent(proxyUrl);
  }
  return _proxyAgent;
}

/** Fetch with AbortController timeout + proxy agent (uses https.request for proper CONNECT tunneling) */
async function fetchWithTimeout(url: string, init?: RequestInit & { timeout?: number }, timeoutMs?: number): Promise<Response> {
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const agent = getProxyAgent();
  const body = init?.body || null;
  const timeout = timeoutMs ?? FETCH_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const headers: http.OutgoingHttpHeaders = {
      ...(init?.headers as http.OutgoingHttpHeaders || {}),
    };
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: init?.method || 'GET',
      headers,
      ...(agent ? { agent } : {}),
    };

    const timer = setTimeout(() => {
      req.destroy(new Error('Fetch timeout'));
    }, timeout);

    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        const responseBody = Buffer.concat(chunks);
        const response = new Response(responseBody, {
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: new Headers(res.headers as Record<string, string>),
        });
        resolve(response);
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

export class Embedder {
  private config: HawkConfig['embedding'];
  // TTL cache: normalized_text → { vector, timestamp }
  private cache: Map<string, { vector: number[]; ts: number }> = new Map();
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  constructor(config: HawkConfig['embedding']) {
    this.config = config;
    // If config specifies a proxy, activate it (overrides env var until env var is set)
    if (config.proxy) {
      setProxyUrl(config.proxy);
    }
  }

  private normalizeForCache(text: string): string {
    // Normalize: lowercase, trim, collapse whitespace — for cache key
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private getCached(text: string): number[] | null {
    const key = this.normalizeForCache(text);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > Embedder.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.vector;
  }

  private setCached(text: string, vector: number[]): void {
    const key = this.normalizeForCache(text);
    this.cache.set(key, { vector, ts: Date.now() });
    // Evict old entries if cache grows too large
    if (this.cache.size > 10000) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].ts - b[1].ts)
        .slice(0, Math.floor(this.cache.size * 0.3));
      for (const [k] of oldest) this.cache.delete(k);
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Check cache first
    const uncached: string[] = [];
    const results: (number[][] | null)[] = texts.map(t => this.getCached(t));

    for (let i = 0; i < texts.length; i++) {
      if (results[i] === null) uncached.push(texts[i]);
    }

    if (uncached.length === 0) return results as number[][];

    const { provider } = this.config;

    // Build index map: uncached text → result index in the full API response
    const uncachedIdxMap = new Map<string, number>();
    texts.forEach((t, i) => { if (results[i] === null) uncachedIdxMap.set(t, i); });

    let freshVectors: number[][];
    if (provider === 'qianwen') {
      freshVectors = await this.embedQianwen(uncached);
    } else if (provider === 'openai-compat') {
      freshVectors = await this.embedOpenAICompat(uncached);
    } else if (provider === 'ollama') {
      freshVectors = await this.embedOllama(uncached);
    } else if (provider === 'jina') {
      freshVectors = await this.embedJina(uncached);
    } else if (provider === 'cohere') {
      freshVectors = await this.embedCohere(uncached);
    } else {
      freshVectors = await this.embedOpenAI(uncached);
    }

    // Merge fresh results back and cache them
    const finalResults: number[][] = [...results] as number[][];
    for (let i = 0; i < uncached.length; i++) {
      const originalIdx = uncachedIdxMap.get(uncached[i])!;
      finalResults[originalIdx] = freshVectors[i];
      this.setCached(uncached[i], freshVectors[i]);
    }
    return finalResults;
  }

  async embedQuery(text: string): Promise<number[]> {
    const vectors = await this.embed([text]);
    return vectors[0];
  }

  // ---- Qianwen (阿里云 DashScope) — OpenAI-compatible, 国内首选 ----
  private async embedQianwen(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    try {
      const apiKey = this.config.apiKey || process.env.QWEN_API_KEY || '';
      const baseURL = this.config.baseURL || 'https://dashscope.aliyuncs.com/api/v1';
      const resp = await fetchWithRetry(
        `${baseURL}/services/embeddings/text-embedding/text-embedding`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model || 'text-embedding-v1',
            input: { text: texts },
          }),
        }
      );
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Qianwen embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json() as any;
      // Qianwen response: { output: { embeddings: [{ embedding: number[] }] }
      if (!data.output?.embeddings?.length) {
        throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
      }
      const result = data.output.embeddings.map((e: any) => e.embedding);
      embeddingLatency.observe({ provider: 'qianwen' }, (Date.now() - start) / 1000);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: 'qianwen' }, (Date.now() - start) / 1000);
      throw err;
    }
  }

  // ---- OpenAI-Compatible (generic endpoint — user provides baseURL + apiKey) ----
  private async embedOpenAICompat(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    try {
      const baseURL = this.config.baseURL;
      const apiKey = this.config.apiKey;
      if (!baseURL || !apiKey) {
        throw new Error('openai-compat provider requires both baseURL and apiKey in config');
      }
      const resp = await fetchWithRetry(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'text-embedding-3-small',
          input: texts,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI-compatible embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json() as any;
      if (!data.data?.length) {
        throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
      }
      const result = data.data.map((item: any) => item.embedding);
      embeddingLatency.observe({ provider: 'openai-compat' }, (Date.now() - start) / 1000);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: 'openai-compat' }, (Date.now() - start) / 1000);
      throw err;
    }
  }

  // ---- OpenAI ----
  // NOTE: Use raw fetch instead of OpenAI SDK to avoid dimension truncation issues
  // with OpenAI-compatible servers (e.g. Xinference returns 1024-dim but SDK truncates to 256)
  private async embedOpenAI(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    try {
      const baseURL = this.config.baseURL;
      const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY || '';
      const model = this.config.model || 'text-embedding-3-small';
      const resp = await fetchWithRetry(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json() as any;
      const result = data.data.map((item: any) => item.embedding);
      embeddingLatency.observe({ provider: 'openai' }, (Date.now() - start) / 1000);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: 'openai' }, (Date.now() - start) / 1000);
      throw err;
    }
  }

  // ---- Jina AI (free tier) ----
  private async embedJina(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    try {
      const apiKey = this.config.apiKey || process.env.JINA_API_KEY || '';
      const model = this.config.model || 'jina-embeddings-v5-small';
      const resp = await fetchWithRetry('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!resp.ok) throw new Error(`Jina error: ${resp.status}`);
      const data = await resp.json() as any;
      const result = data.data.map((item: any) => item.embedding);
      embeddingLatency.observe({ provider: 'jina' }, (Date.now() - start) / 1000);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: 'jina' }, (Date.now() - start) / 1000);
      throw err;
    }
  }

  // ---- Cohere (free tier) ----
  private async embedCohere(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    try {
      const apiKey = this.config.apiKey || process.env.COHERE_API_KEY || '';
      const resp = await fetchWithRetry('https://api.cohere.ai/v1/embed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'embed-english-v3.0',
          texts,
          input_type: 'search_document',
        }),
      });
      if (!resp.ok) throw new Error(`Cohere error: ${resp.status}`);
      const data = await resp.json() as any;
      const result = data.embeddings;
      embeddingLatency.observe({ provider: 'cohere' }, (Date.now() - start) / 1000);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: 'cohere' }, (Date.now() - start) / 1000);
      throw err;
    }
  }

  // ---- Ollama (local free) ----
  private async embedOllama(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    try {
      const baseURL = (this.config.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
      const model = this.config.model || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
      const embedPath = process.env.OLLAMA_EMBED_PATH || '/embeddings';
      const normalizedBase = baseURL.replace(/\/$/, '');
      const url = `${normalizedBase}${embedPath}`;
      const resp = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Ollama embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json() as any;
      // OpenAI-compatible response: { data: [{ embedding: [...], index: 0 }, ...] }
      if (Array.isArray(data.data)) {
        const sorted = data.data.sort((a: any, b: any) => a.index - b.index);
        const result = sorted.map((item: any) => item.embedding);
        embeddingLatency.observe({ provider: 'ollama' }, (Date.now() - start) / 1000);
        return result;
      }
      // Ollama native response: { embeddings: [[...]] }
      if (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0])) {
        embeddingLatency.observe({ provider: 'ollama' }, (Date.now() - start) / 1000);
        return data.embeddings;
      } else if (Array.isArray(data.embeddings)) {
        embeddingLatency.observe({ provider: 'ollama' }, (Date.now() - start) / 1000);
        return [data.embeddings];
      }
      throw new Error(`Unexpected embedding response: ${JSON.stringify(data)}`);
    } catch (err) {
      embeddingLatency.observe({ provider: 'ollama' }, (Date.now() - start) / 1000);
      throw err;
    }
  }
}

export function formatRecallForContext(
  memories: Array<{ text: string; score: number; category: string }>,
  emoji: string = '🦅'
): string {
  if (!memories.length) return '';
  const lines = [`${emoji} ** hawk 记忆检索结果 **`];
  for (const m of memories) {
    lines.push(`[${m.category}] (${(m.score * 100).toFixed(0)}%相关): ${m.text}`);
  }
  return lines.join('\n');
}

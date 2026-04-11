// Embeddings module — handles vectorization
// Supports: OpenAI, Qianwen (阿里云), Jina AI, Cohere, Ollama, OpenAI-Compatible

import { HawkConfig } from './types.js';

const FETCH_TIMEOUT_MS = 15000;

/** Fetch with AbortController timeout — prevents hanging on network issues */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

export class Embedder {
  private config: HawkConfig['embedding'];
  // TTL cache: normalized_text → { vector, timestamp }
  private cache: Map<string, { vector: number[]; ts: number }> = new Map();
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  constructor(config: HawkConfig['embedding']) {
    this.config = config;
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
    const apiKey = this.config.apiKey || process.env.QWEN_API_KEY || '';
    const baseURL = this.config.baseURL || 'https://dashscope.aliyuncs.com/api/v1';
    const resp = await fetchWithTimeout(
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
    return data.output.embeddings.map((e: any) => e.embedding);
  }

  // ---- OpenAI-Compatible (generic endpoint — user provides baseURL + apiKey) ----
  private async embedOpenAICompat(texts: string[]): Promise<number[][]> {
    const baseURL = this.config.baseURL;
    const apiKey = this.config.apiKey;
    if (!baseURL || !apiKey) {
      throw new Error('openai-compat provider requires both baseURL and apiKey in config');
    }
    const resp = await fetchWithTimeout(`${baseURL}/embeddings`, {
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
    return data.data.map((item: any) => item.embedding);
  }

  // ---- OpenAI ----
  private async embedOpenAI(texts: string[]): Promise<number[][]> {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
      timeout: FETCH_TIMEOUT_MS,
    });
    const model = this.config.model || 'text-embedding-3-small';
    const resp = await client.embeddings.create({ model, input: texts });
    return resp.data.map((item: any) => item.embedding);
  }

  // ---- Jina AI (free tier) ----
  private async embedJina(texts: string[]): Promise<number[][]> {
    const apiKey = this.config.apiKey || process.env.JINA_API_KEY || '';
    const model = this.config.model || 'jina-embeddings-v5-small';
    const resp = await fetchWithTimeout('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!resp.ok) throw new Error(`Jina error: ${resp.status}`);
    const data = await resp.json() as any;
    return data.data.map((item: any) => item.embedding);
  }

  // ---- Cohere (free tier) ----
  private async embedCohere(texts: string[]): Promise<number[][]> {
    const apiKey = this.config.apiKey || process.env.COHERE_API_KEY || '';
    const resp = await fetchWithTimeout('https://api.cohere.ai/v1/embed', {
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
    return data.embeddings;
  }

  // ---- Ollama (local free) ----
  private async embedOllama(texts: string[]): Promise<number[][]> {
    const baseURL = (this.config.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    const model = this.config.model || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    const resp = await fetchWithTimeout(`${baseURL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Ollama embedding error: ${resp.status} ${err}`);
    }
    const data = await resp.json() as any;
    if (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0])) {
      return data.embeddings;
    } else if (Array.isArray(data.embeddings)) {
      return [data.embeddings];
    }
    throw new Error(`Unexpected Ollama response: ${JSON.stringify(data)}`);
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

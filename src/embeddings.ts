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

  constructor(config: HawkConfig['embedding']) {
    this.config = config;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const { provider } = this.config;

    if (provider === 'qianwen') {
      return this.embedQianwen(texts);
    } else if (provider === 'openai-compat') {
      return this.embedOpenAICompat(texts);
    } else if (provider === 'ollama') {
      return this.embedOllama(texts);
    } else if (provider === 'jina') {
      return this.embedJina(texts);
    } else if (provider === 'cohere') {
      return this.embedCohere(texts);
    } else {
      return this.embedOpenAI(texts);
    }
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

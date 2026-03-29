// Embeddings module — handles vectorization for recall and storage
// Supports: OpenAI, Jina AI, Ollama (local, free), Cohere

import { HawkConfig } from './types.js';

export class Embedder {
  private config: HawkConfig['embedding'];
  private openai: any;

  constructor(config: HawkConfig['embedding']) {
    this.config = config;
  }

  private async getClient() {
    if (this.openai) return this.openai;
    const { OpenAI } = await import('openai');
    this.openai = new OpenAI({
      apiKey: this.config.apiKey || 'free-tier',
      baseURL: this.config.baseURL || undefined,
    });
    return this.openai;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const { provider } = this.config;

    if (provider === 'ollama') {
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

  private async embedOpenAI(texts: string[]): Promise<number[][]> {
    const client = await this.getClient();
    const model = this.config.model || 'text-embedding-3-small';
    const resp = await client.embeddings.create({ model, input: texts });
    return resp.data.map((item: any) => item.embedding);
  }

  private async embedJina(texts: string[]): Promise<number[][]> {
    // Jina AI free tier (no key needed for basic use, or use key)
    const apiKey = this.config.apiKey || process.env.JINA_API_KEY || '';
    const model = this.config.model || 'jina-embeddings-v5-small';
    const url = 'https://api.jina.ai/v1/embeddings';

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, input: texts }),
    });

    if (!resp.ok) throw new Error(`Jina API error: ${resp.status}`);
    const data = await resp.json() as any;
    return data.data.map((item: any) => item.embedding);
  }

  private async embedCohere(texts: string[]): Promise<number[][]> {
    // Cohere free embed v3 (1M tokens/month free)
    const apiKey = this.config.apiKey || process.env.COHERE_API_KEY || '';
    const model = 'embed-english-v3.0';
    const url = 'https://api.cohere.ai/v1/embed';

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, texts, input_type: 'search_document' }),
    });

    if (!resp.ok) throw new Error(`Cohere API error: ${resp.status}`);
    const data = await resp.json() as any;
    return data.embeddings;
  }

  private async embedOllama(texts: string[]): Promise<number[][]> {
    // Ollama local embeddings (completely free, no internet)
    const baseURL = this.config.baseURL || 'http://localhost:11434';
    const model = this.config.model || 'nomic-embed-text';

    const results: number[][] = [];
    for (const text of texts) {
      const resp = await fetch(`${baseURL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text }),
      });
      if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
      const data = await resp.json() as any;
      results.push(data.embeddings);
    }
    return results;
  }
}

// Build the recall prompt that gets injected into context
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

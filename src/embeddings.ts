// Embeddings module — handles vectorization for recall and storage
// Supports OpenAI (text-embedding-3-small) and Jina (jina-embeddings-v5)

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
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || 'https://api.openai.com/v1',
    });
    return this.openai;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const model = this.config.model || 'text-embedding-3-small';
    const client = await this.getClient();

    const resp = await client.embeddings.create({
      model,
      input: texts,
    });

    return resp.data.map((item: any) => item.embedding);
  }

  async embedQuery(text: string): Promise<number[]> {
    const vectors = await this.embed([text]);
    return vectors[0];
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

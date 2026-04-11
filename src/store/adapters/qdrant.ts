// TODO: Qdrant adapter — implement MemoryStore interface
// Planned features:
// - Use Qdrant collections for vector storage
// - JSON fields for metadata
// - Sparse/dense hybrid search support

import type { MemoryStore } from '../interface.js';

export class QdrantAdapter implements MemoryStore {
  async init(): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async close(): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async store(m, sessionId?: string): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async update(id: string, fields: Record<string, any>): Promise<boolean> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async delete(id: string): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async getById(id: string) {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async getAllMemories(agentId?: string | null) {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async listRecent(limit: number) {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async getReviewCandidates(minReliability: number, batchSize: number) {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async embed(texts: string[]): Promise<number[][]> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async vectorSearch(query: string, topK: number) {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async findSimilarEntity(text: string, threshold?: number) {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async verify(id: string, correct: boolean, correctText?: string): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async lock(id: string): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async unlock(id: string): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async flagUnhelpful(id: string, penalty?: number): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async incrementAccess(id: string): Promise<void> {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async decay() {
    throw new Error('Qdrant adapter not implemented yet');
  }

  async purgeForgotten(graceDays?: number): Promise<number> {
    throw new Error('Qdrant adapter not implemented yet');
  }
}

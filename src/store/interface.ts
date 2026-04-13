import type { RetrievedMemory, MemoryEntry } from '../../types.js';

export interface MemoryStore {
  init(): Promise<void>;
  close(): Promise<void>;

  // Core storage
  store(m: MemoryEntry, sessionId?: string): Promise<void>;
  update(id: string, fields: Record<string, any>): Promise<boolean>;
  delete(id: string): Promise<void>;  // soft delete
  getById(id: string): Promise<MemoryEntry | null>;
  getAllMemories(agentId?: string | null): Promise<MemoryEntry[]>;

  // Retrieval
  listRecent(limit: number): Promise<MemoryEntry[]>;
  getReviewCandidates(minReliability: number, batchSize: number): Promise<MemoryEntry[]>;

  // Vector search
  embed(texts: string[]): Promise<number[][]>;
  vectorSearch(query: string, topK: number): Promise<RetrievedMemory[]>;
  findSimilarEntity(text: string, threshold?: number): Promise<MemoryEntry | null>;

  // Write operations
  verify(id: string, correct: boolean, correctText?: string): Promise<void>;
  lock(id: string): Promise<void>;
  unlock(id: string): Promise<void>;
  flagUnhelpful(id: string, penalty?: number): Promise<void>;
  incrementAccess(id: string): Promise<void>;

  // Maintenance
  reset(): Promise<void>;  // Drop table & re-init — for dimension migration
  decay(): Promise<{ updated: number; deleted: number }>;
  purgeForgotten(graceDays?: number): Promise<number>;

  // Feedback loop
  rateMemory(id: string, rating: 'helpful' | 'neutral' | 'harmful', sessionId?: string): Promise<void>;
  demoteMemory(id: string): Promise<void>;
  incrementImportance(id: string, delta: number): Promise<void>;
}

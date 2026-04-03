// hawk-bridge type definitions

export interface HawkConfig {
  embedding: {
    /** Embedding provider: openai | qianwen | jina | cohere | ollama | openai-compat */
    provider: 'openai' | 'qianwen' | 'jina' | 'cohere' | 'ollama' | 'openai-compat';
    apiKey: string;
    model: string;
    baseURL: string;
    dimensions: number;
  };
  llm: {
    provider: string;
    apiKey: string;
    model: string;
    baseURL: string;
  };
  recall: {
    topK: number;
    minScore: number;
    injectEmoji: string;
  };
  audit: {
    enabled: boolean;
  };
  capture: {
    enabled: boolean;
    maxChunks: number;
    importanceThreshold: number;
    ttlMs: number;         // 0 = never expire
    maxChunkSize: number;  // max chars per chunk
    minChunkSize: number;  // min chars for valid chunk
    dedupSimilarity: number;  // 0–1, skip similar memories
  };
  python: {
    pythonPath: string;
    hawkDir: string;
  };
}

export interface MemoryEntry {
  id: string;
  text: string;
  vector: number[];
  category: 'fact' | 'preference' | 'decision' | 'entity' | 'other';
  scope: string;
  importance: number;
  timestamp: number;
  expiresAt: number;  // 0 = never expire
  accessCount: number;
  lastAccessedAt: number;
  metadata: Record<string, unknown>;
}

export interface RetrievedMemory {
  id: string;
  text: string;
  score: number;
  category: string;
  metadata: Record<string, unknown>;
}

export interface ExtractionResult {
  memories: Array<{
    text: string;
    category: 'fact' | 'preference' | 'decision' | 'entity' | 'other';
    importance: number;
    abstract: string;
    overview: string;
  }>;
}

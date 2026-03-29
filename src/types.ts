// hawk-bridge type definitions

export interface HawkConfig {
  embedding: {
    provider: 'openai' | 'jina';
    apiKey: string;
    model: string;
    baseURL: string;
    dimensions: number;
  };
  recall: {
    topK: number;
    minScore: number;
    injectEmoji: string;
  };
  capture: {
    enabled: boolean;
    maxChunks: number;
    importanceThreshold: number;
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
  accessCount: number;
  lastAccessedAt: number;
  metadata: {
    source?: string;
    l0_abstract?: string;
    l1_overview?: string;
  };
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

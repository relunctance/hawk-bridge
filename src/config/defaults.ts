// Default configuration values — lowest priority, overridden by yaml config and env vars
import { DEFAULT_MIN_SCORE, MAX_CHUNK_SIZE } from '../constants.js';
import type { HawkConfig } from '../types.js';

export const DEFAULT_CONFIG: HawkConfig = {
  embedding: {
    provider: 'jina',
    apiKey: '',
    model: 'jina-embeddings-v5-small',
    baseURL: '',
    dimensions: 1024,
  },
  llm: {
    provider: 'groq',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    baseURL: '',
  },
  recall: {
    topK: 5,
    minScore: DEFAULT_MIN_SCORE,
    injectEmoji: '🦅',
  },
  audit: {
    enabled: true,
  },
  capture: {
    enabled: true,
    maxChunks: 3,
    importanceThreshold: 0.5,
    ttlMs: 30 * 24 * 60 * 60 * 1000,
    maxChunkSize: MAX_CHUNK_SIZE,
    minChunkSize: 20,
    dedupSimilarity: 0.95,
  },
  python: {
    pythonPath: 'python3.12',
    hawkDir: '~/.openclaw/hawk',
  },
};

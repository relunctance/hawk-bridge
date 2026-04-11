// Default configuration values — lowest priority, overridden by yaml config and env vars
import { DEFAULT_MIN_SCORE, MAX_CHUNK_SIZE } from '../constants.js';
import type { HawkConfig } from '../types.js';

export const DEFAULT_CONFIG: HawkConfig = {
  embedding: {
    // provider/apiKey/model are resolved by config.ts async getConfig()
    // using OpenClaw zero-config discovery (minimax first, then legacy env vars)
    provider: 'minimax',
    apiKey: '',
    model: '',
    baseURL: '',
    dimensions: 1024,
  },
  llm: {
    // provider/apiKey/model are resolved by config.ts async getConfig()
    // using OpenClaw zero-config discovery (minimax)
    provider: 'minimax',
    apiKey: '',
    model: '',
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

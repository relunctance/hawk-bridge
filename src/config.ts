// Config loader — reads hawk-bridge config from openclaw.json
// Falls back to environment variables and defaults

import { getConfigValue } from '../../../.npm-global/lib/node_modules/openclaw/dist/v10/shared/config.js';
import type { HawkConfig } from './types.js';

const PLUGIN_ID = 'hawk-bridge';

const DEFAULT_CONFIG: HawkConfig = {
  embedding: {
    provider: 'ollama',      // Default: Ollama (free local, no key needed)
    apiKey: '',
    model: 'nomic-embed-text',
    baseURL: 'http://localhost:11434',
    dimensions: 768,
  },
  recall: {
    topK: 5,
    minScore: 0.6,
    injectEmoji: '🦅',
  },
  capture: {
    enabled: true,
    maxChunks: 3,
    importanceThreshold: 0.5,
  },
  python: {
    pythonPath: 'python3.12',
    hawkDir: '~/.openclaw/hawk',
  },
};

let cachedConfig: HawkConfig | null = null;

export async function getConfig(): Promise<HawkConfig> {
  if (cachedConfig) return cachedConfig;

  const config: HawkConfig = { ...DEFAULT_CONFIG };

  try {
    const pluginConfig = await getConfigValue(`plugins.entries.${PLUGIN_ID}.config`);
    if (pluginConfig && typeof pluginConfig === 'object') {
      const pc = pluginConfig as any;
      if (pc.embedding) {
        config.embedding = { ...config.embedding, ...pc.embedding };
      }
      if (pc.recall) config.recall = { ...config.recall, ...pc.recall };
      if (pc.capture) config.capture = { ...config.capture, ...pc.capture };
      if (pc.python) config.python = { ...config.python, ...pc.python };
    }
  } catch { /* no config */ }

  // Env var overrides
  if (process.env.HAWK_EMBEDDING_PROVIDER) {
    config.embedding.provider = process.env.HAWK_EMBEDDING_PROVIDER;
  }
  if (process.env.HAWK_EMBEDDING_API_KEY) {
    config.embedding.apiKey = process.env.HAWK_EMBEDDING_API_KEY;
  }
  if (process.env.OLLAMA_BASE_URL) {
    config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
    config.embedding.provider = 'ollama';
  }
  if (process.env.JINA_API_KEY) {
    config.embedding.provider = 'jina';
    config.embedding.apiKey = process.env.JINA_API_KEY;
  }
  if (process.env.COHERE_API_KEY) {
    config.embedding.provider = 'cohere';
    config.embedding.apiKey = process.env.COHERE_API_KEY;
  }
  if (process.env.LLM_PROVIDER) {
    // Used by python extractor
    process.env.LLM_PROVIDER = process.env.LLM_PROVIDER;
  }

  cachedConfig = config;
  return config;
}

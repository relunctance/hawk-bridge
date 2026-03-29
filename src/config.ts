// Config loader — reads hawk-bridge config from openclaw.json
// Falls back to environment variables and defaults

import { getConfigValue } from '../../../.npm-global/lib/node_modules/openclaw/dist/v10/shared/config.js';
import type { HawkConfig } from './types.js';

const PLUGIN_ID = 'hawk-bridge';

const DEFAULT_CONFIG: HawkConfig = {
  embedding: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'text-embedding-3-small',
    baseURL: 'https://api.openai.com/v1',
    dimensions: 1536,
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
    // Try to read from openclaw.json plugins.entries.hawk-bridge.config
    const pluginConfig = await getConfigValue(
      `plugins.entries.${PLUGIN_ID}.config`
    );

    if (pluginConfig && typeof pluginConfig === 'object') {
      // Merge with defaults
      const pc = pluginConfig as any;

      if (pc.embedding) {
        config.embedding = {
          ...config.embedding,
          ...pc.embedding,
          apiKey: pc.embedding.apiKey || DEFAULT_CONFIG.embedding.apiKey,
        };
      }
      if (pc.recall) {
        config.recall = { ...config.recall, ...pc.recall };
      }
      if (pc.capture) {
        config.capture = { ...config.capture, ...pc.capture };
      }
      if (pc.python) {
        config.python = { ...config.python, ...pc.python };
      }
    }
  } catch {
    // Config not found, use defaults + env vars
  }

  // Env var overrides
  if (process.env.OPENAI_API_KEY) {
    config.embedding.apiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.JINA_API_KEY) {
    config.embedding.provider = 'jina';
    config.embedding.apiKey = process.env.JINA_API_KEY;
    config.embedding.model = 'jina-embeddings-v5-text-small';
    config.embedding.baseURL = 'https://api.jina.ai/v1';
    config.embedding.dimensions = 1024;
  }

  cachedConfig = config;
  return config;
}

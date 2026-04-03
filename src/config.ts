// Config Provider — auto-reads OpenClaw's built-in model config
// No extra API keys needed, uses whatever is already configured in openclaw.json

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_MIN_SCORE, DEFAULT_EMBEDDING_DIM } from './constants.js';
import type { HawkConfig } from './types.js';

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

export interface OpenClawModelProvider {
  id: string;
  baseUrl: string;
  apiKey?: string;
  api?: string;
  authHeader?: boolean;
  models?: Array<{
    id: string;
    name: string;
    input?: string[];
    contextWindow?: number;
    maxTokens?: number;
  }>;
}

export interface OpenClawConfig {
  models?: {
    mode?: string;
    providers?: Record<string, OpenClawModelProvider>;
  };
  auth?: {
    profiles?: Record<string, { provider: string; mode: string; apiKey?: string }>;
  };
}

let cachedOpenClawConfig: OpenClawConfig | null = null;

function loadOpenClawConfig(): OpenClawConfig | null {
  if (cachedOpenClawConfig) return cachedOpenClawConfig;
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
    cachedOpenClawConfig = JSON.parse(raw);
    return cachedOpenClawConfig;
  } catch {
    return null;
  }
}

export function getConfiguredProvider(providerName: string = 'minimax'): OpenClawModelProvider | null {
  const config = loadOpenClawConfig();
  if (!config?.models?.providers) return null;
  return config.models.providers[providerName] || null;
}

export function getDefaultModelId(): string {
  const config = loadOpenClawConfig();
  if (!config?.models?.providers) return 'MiniMax-M2.7';
  const prov = config.models.providers['minimax'];
  if (!prov?.models?.length) return 'MiniMax-M2.7';
  // Return first model (usually the latest/default)
  return prov.models[0].id;
}

const DEFAULT_CONFIG: HawkConfig = {
  embedding: {
    provider: 'qianwen', // 阿里云 DashScope, 国内首选
    apiKey: '',
    model: 'text-embedding-v1',
    baseURL: 'https://dashscope.aliyuncs.com/api/v1',
    dimensions: 1024,  // Qianwen text-embedding-v1 输出 1024 维
  },
  llm: {
    provider: 'groq',  // Default: free groq Llama-3, no API key needed
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    baseURL: '',
  },
  recall: {
    topK: 5,
    minScore: DEFAULT_MIN_SCORE,  // from constants.ts
    injectEmoji: '🦅',
  },
  audit: {
    enabled: true,
  },
  capture: {
    enabled: true,
    maxChunks: 3,
    importanceThreshold: 0.5,
    ttlMs: 30 * 24 * 60 * 60 * 1000,  // 30 days
    maxChunkSize: 2000,
    minChunkSize: 20,
    dedupSimilarity: 0.95,
  },
  python: {
    pythonPath: 'python3.12',
    hawkDir: '~/.openclaw/hawk',
  },
};

// Promise-based cache prevents concurrent initialization
let configPromise: Promise<HawkConfig> | null = null;

export async function getConfig(): Promise<HawkConfig> {
  if (!configPromise) {
    configPromise = (async () => {
      const config: HawkConfig = { ...DEFAULT_CONFIG };

      // Env var overrides (highest priority) — OLLAMA > QWEN > JINA > default
      if (process.env.OLLAMA_BASE_URL) {
        config.embedding.provider = 'ollama';
        config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
        config.embedding.model = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
        config.embedding.dimensions = 768;  // nomic-embed-text is 768-dim
      } else if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) {
        config.embedding.provider = 'qianwen';
        config.embedding.apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
        config.embedding.baseURL = 'https://dashscope.aliyuncs.com/api/v1';
        config.embedding.model = 'text-embedding-v1';
        config.embedding.dimensions = 1024;
      } else if (process.env.JINA_API_KEY) {
        config.embedding.provider = 'jina';
        config.embedding.apiKey = process.env.JINA_API_KEY;
        config.embedding.baseURL = '';
        config.embedding.model = 'jina-embeddings-v5-small';
        config.embedding.dimensions = 1024;
      } else if (process.env.OPENAI_API_KEY) {
        config.embedding.provider = 'openai';
        config.embedding.apiKey = process.env.OPENAI_API_KEY;
        config.embedding.baseURL = '';
        config.embedding.model = 'text-embedding-3-small';
        config.embedding.dimensions = 1536;
      } else if (process.env.COHERE_API_KEY) {
        config.embedding.provider = 'cohere';
        config.embedding.apiKey = process.env.COHERE_API_KEY;
        config.embedding.baseURL = '';
        config.embedding.model = 'embed-english-v3.0';
        config.embedding.dimensions = 1024;
      }

      return config;
    })();
  }
  return configPromise;
}

export function hasEmbeddingProvider(): boolean {
  return !!(
    process.env.OLLAMA_BASE_URL ||
    process.env.QWEN_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.JINA_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.COHERE_API_KEY
  );
}

// Config Provider — auto-reads OpenClaw's built-in model config
// No extra API keys needed, uses whatever is already configured in openclaw.json

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
    provider: 'openclaw', // New: uses openclaw's configured provider
    apiKey: '',
    model: 'text-embedding-3-small',
    baseURL: '',
    dimensions: 1536,
  },
  llm: {
    provider: 'openclaw',
    apiKey: '',
    model: '',
    baseURL: '',
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

  // Read MINIMAX_API_KEY from env (user provided)
  const minimaxApiKey = process.env.MINIMAX_API_KEY || '';

  // Auto-detect from openclaw.json
  const provider = getConfiguredProvider('minimax');
  if (provider) {
    config.llm.baseURL = provider.baseUrl || 'https://api.minimaxi.com/anthropic';
    config.llm.model = getDefaultModelId() || 'MiniMax-M2.7';
    config.llm.provider = 'openclaw';
  }

  // Env var overrides — priority: explicit env vars
  if (minimaxApiKey) {
    // Use Minimax for both LLM and embedding
    config.embedding.provider = 'minimax';
    config.embedding.apiKey = minimaxApiKey;
    config.embedding.baseURL = 'https://api.minimaxi.com/v1';
    config.embedding.model = 'embedding-2-normal';
    config.embedding.dimensions = 1024;
    config.llm.apiKey = minimaxApiKey;
    config.llm.provider = 'minimax';
  }
  if (process.env.OLLAMA_BASE_URL) {
    config.embedding.provider = 'ollama';
    config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
  }
  if (process.env.JINA_API_KEY) {
    config.embedding.provider = 'jina';
    config.embedding.apiKey = process.env.JINA_API_KEY;
  }

  cachedConfig = config;
  return config;
}

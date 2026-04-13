// Config Provider — auto-reads OpenClaw's built-in model config
// Config file: ~/.hawk/config.yaml (YAML) with ${ENV_VAR} support, falls back to ~/.hawk/config.json

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { DEFAULT_MIN_SCORE } from './constants.js';
import { getEnvOverrides, deepMerge } from './config/env.js';
import type { HawkConfig } from './types.js';

const OPENCLAW_CONFIG_PATH    = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const OPENCLAW_AGENT_MODELS = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'models.json');
const HAWK_CONFIG_DIR = path.join(os.homedir(), '.hawk');

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
let cachedAgentModels: Record<string, unknown> | null = null;

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

function loadAgentModels(): Record<string, unknown> | null {
  if (cachedAgentModels !== null) return cachedAgentModels;
  try {
    cachedAgentModels = JSON.parse(fs.readFileSync(OPENCLAW_AGENT_MODELS, 'utf-8'));
    return cachedAgentModels;
  } catch {
    cachedAgentModels = null;
    return null;
  }
}

/** Get apiKey + baseUrl for a provider from OpenClaw's agent models.json (contains real credentials). */
function getAgentModelKey(provider: string): { apiKey: string; baseUrl: string } | null {
  const agents = loadAgentModels();
  if (!agents) return null;
  const providers = (agents.providers as Record<string, Record<string, unknown>> | undefined);
  if (!providers) return null;
  const p = providers[provider];
  if (!p) return null;
  return {
    apiKey:  (p.apiKey  as string | undefined) ?? '',
    baseUrl: (p.baseUrl as string | undefined) ?? '',
  };
}

export function getConfiguredProvider(providerName: string = 'minimax'): OpenClawModelProvider | null {
  const config = loadOpenClawConfig();
  if (!config?.models?.providers) return null;
  return config.models.providers[providerName] || null;
}

export function getDefaultModelId(): string {
  // Priority: agents.defaults.model.primary > first minimax model
  const cfg = loadOpenClawConfig();
  const primary = cfg?.auth?.profiles?.default?.mode; // just provider name
  const openclawPrimary = (cfg as any)?.agents?.defaults?.model?.primary;
  if (openclawPrimary && typeof openclawPrimary === 'string') {
    return openclawPrimary; // e.g. "minimax/MiniMax-M2.7-highspeed"
  }
  if (!cfg?.models?.providers) return 'MiniMax-M2.7';
  const prov = cfg.models.providers['minimax'];
  if (!prov?.models?.length) return 'MiniMax-M2.7';
  return prov.models[0].id;
}

const DEFAULT_CONFIG: HawkConfig = {
  embedding: {
    provider: 'qianwen',
    apiKey: '',
    model: 'text-embedding-v1',
    baseURL: 'https://dashscope.aliyuncs.com/api/v1',
    dimensions: 1024,
    proxy: '',
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
    maxChunkSize: 2000,
    minChunkSize: 20,
    dedupSimilarity: 0.95,
  },
  python: {
    pythonPath: 'python3',
    hawkDir: '~/.openclaw/hawk',
  },
};

function resolveEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? '';
  });
}

/** Recursively convert snake_case keys to camelCase (for legacy JSON config compatibility) */
function snakeToCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        snakeToCamel(v),
      ])
    );
  }
  return obj;
}

function loadYamlConfig(): Record<string, any> {
  const yamlPath = path.join(HAWK_CONFIG_DIR, 'config.yaml');
  const legacyPath = path.join(HAWK_CONFIG_DIR, 'config.json');

  if (fs.existsSync(yamlPath)) {
    try {
      const raw = fs.readFileSync(yamlPath, 'utf-8');
      const resolved = resolveEnvVars(raw);
      return yaml.load(resolved) as Record<string, any>;
    } catch (e) {
      console.warn('[hawk-bridge] Failed to load config.yaml:', e);
    }
  } else if (fs.existsSync(legacyPath)) {
    try {
      const raw = fs.readFileSync(legacyPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, any>;
      // Legacy config.json uses snake_case; convert to camelCase to match HawkConfig type
      const camel = snakeToCamel(parsed) as Record<string, any>;
      // Promote top-level embedding keys (embeddingModel, baseUrl, etc.) into embedding object
      // so deepMerge works correctly with DEFAULT_CONFIG.embedding
      const embeddingKeys = ['embeddingModel', 'embeddingDimensions', 'baseUrl', 'proxy',
        'openaiApiKey', 'apiKey', 'model', 'dimensions', 'provider'];
      const embedding: Record<string, any> = {};
      for (const key of embeddingKeys) {
        if (camel[key] !== undefined) {
          // Map camelCase → HawkConfig embedding field names
          const embeddingField = key === 'embeddingModel' ? 'model'
            : key === 'embeddingDimensions' ? 'dimensions'
            : key === 'openaiApiKey' ? 'apiKey'
            : key;
          (embedding as any)[embeddingField] = camel[key];
          delete camel[key];
        }
      }
      if (Object.keys(embedding).length > 0) {
        camel.embedding = embedding;
      }
      return camel;
    } catch (e) {
      console.warn('[hawk-bridge] Failed to load legacy config.json:', e);
    }
  }
  return {};
}

let configPromise: Promise<HawkConfig> | null = null;

export async function getConfig(): Promise<HawkConfig> {
  if (!configPromise) {
    configPromise = (async () => {
      // 1. Start with defaults
      let config: HawkConfig = { ...DEFAULT_CONFIG } as HawkConfig;

      // 2. Merge YAML config file (yaml > defaults)
      const yamlConfig = loadYamlConfig();
      if (Object.keys(yamlConfig).length > 0) {
        config = deepMerge(DEFAULT_CONFIG, yamlConfig as Partial<HawkConfig>);
      }

      // 3. Env var overrides (env > yaml > defaults)
      const envOverrides = getEnvOverrides();
      if (Object.keys(envOverrides).length > 0) {
        config = deepMerge(config, envOverrides);
      }

      // 4. Auto-detect embedding provider — only if user did NOT explicitly set HAWK_EMBED_*
      //    HAWK_EMBED_* env vars take absolute priority over auto-detection
      const hasExplicitEmbedConfig = process.env.HAWK_EMBED_PROVIDER || process.env.HAWK_EMBED_API_KEY || process.env.HAWK_EMBED_MODEL;
      if (!hasExplicitEmbedConfig) {
        // OLLAMA_BASE_URL is checked first — it overrides config file values (e.g. config.json's Jina settings)
        if (process.env.OLLAMA_BASE_URL) {
          config.embedding.provider = 'ollama';
          config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
          config.embedding.model = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
          config.embedding.dimensions = 768;
        } else {
          const openclawkEmbed = getAgentModelKey('minimax');
          if (openclawkEmbed?.apiKey) {
            config.embedding.provider = 'minimax';
            config.embedding.apiKey  = openclawkEmbed.apiKey;
            config.embedding.baseURL = openclawkEmbed.baseUrl || 'https://api.minimaxi.com/v1';
            config.embedding.model  = 'text-embedding-v2';
            config.embedding.dimensions = 1024;
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
        }
      }

      // 5. Default LLM to OpenClaw's configured model (if not set in yaml or env)
      //    Uses agents/main/agent/models.json for real credentials (getAgentModelKey)
      if (!config.llm.model || !config.llm.apiKey) {
        const openclawkKey = getAgentModelKey('minimax');
        if (openclawkKey?.apiKey) {
          config.llm = config.llm || {} as any;
          config.llm.model    = config.llm.model || getDefaultModelId();
          config.llm.apiKey   = openclawkKey.apiKey;
          config.llm.baseURL  = config.llm.baseURL || openclawkKey.baseUrl || '';
          config.llm.provider = config.llm.provider || 'minimax';
        }
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

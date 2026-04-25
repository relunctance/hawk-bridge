// hawk-bridge Config Provider
//
// Config file:  ~/.hawk/config.yaml  (YAML with ${ENV_VAR} support)
// Env vars:     HAWK__* (unified prefix, double-underscore = nested)
// Priority:     Defaults < config.yaml < HAWK__* env vars
//
// Unified env var format (HAWK__SECTION__KEY):
//   HAWK__EMBEDDING__PROVIDER   → config.embedding.provider
//   HAWK__EMBEDDING__MODEL      → config.embedding.model
//   HAWK__EMBEDDING__DIMENSIONS → config.embedding.dimensions
//   HAWK__EMBEDDING__BASE_URL   → config.embedding.baseURL
//   HAWK__EMBEDDING__API_KEY    → config.embedding.apiKey
//   HAWK__EMBEDDING__PROXY      → config.embedding.proxy
//   HAWK__LLM__PROVIDER         → config.llm.provider
//   HAWK__LLM__MODEL            → config.llm.model
//   HAWK__LLM__API_KEY          → config.llm.apiKey
//   HAWK__RECALL__TOP_K         → config.recall.topK
//   HAWK__RECALL__MIN_SCORE     → config.recall.minScore
//   HAWK__CAPTURE__ENABLED      → config.capture.enabled
//   HAWK__LOGGING__LEVEL        → pino log level (info, debug, warn)
//
// Legacy env vars (still work, but deprecated):
//   OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL, HAWK_EMBED_*, JINA_API_KEY,
//   OPENAI_API_KEY, QWEN_API_KEY, DASHSCOPE_API_KEY, COHERE_API_KEY
//   (deprecated vars log a warning on first use)

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import * as crypto from 'crypto';
import { DEFAULT_MIN_SCORE } from './constants.js';
import { getEnvOverrides, deepMerge } from './config/env.js';
import type { HawkConfig } from './types.js';

const OPENCLAW_CONFIG_PATH    = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const OPENCLAW_AGENT_MODELS  = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'models.json');
const HAWK_CONFIG_DIR        = path.join(os.homedir(), '.hawk');

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
  const cfg = loadOpenClawConfig();
  const openclawPrimary = (cfg as any)?.agents?.defaults?.model?.primary;
  if (openclawPrimary && typeof openclawPrimary === 'string') {
    return openclawPrimary;
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
  logging: {
    level: 'info',
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
    httpMode: false,
    httpBase: 'http://127.0.0.1:18368',
  },
};

function resolveEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? '';
  });
}

function loadYamlConfig(): Record<string, any> {
  const yamlPath = path.join(HAWK_CONFIG_DIR, 'config.yaml');
  if (fs.existsSync(yamlPath)) {
    try {
      const raw = fs.readFileSync(yamlPath, 'utf-8');
      const resolved = resolveEnvVars(raw);
      return yaml.load(resolved) as Record<string, any>;
    } catch (e) {
      console.warn('[hawk-bridge] Failed to load config.yaml:', e);
    }
  }
  return {};
}

let configPromise: Promise<HawkConfig> | null = null;
let cachedConfig: HawkConfig | null = null;

export async function getConfig(): Promise<HawkConfig> {
  if (cachedConfig) return cachedConfig;
  if (!configPromise) {
    configPromise = (async () => {
      // 1. Defaults
      let config: HawkConfig = { ...DEFAULT_CONFIG } as HawkConfig;

      // 2. YAML config file (config.yaml > defaults)
      const yamlConfig = loadYamlConfig();
      if (Object.keys(yamlConfig).length > 0) {
        config = deepMerge(DEFAULT_CONFIG, yamlConfig as Partial<HawkConfig>);
      }

      // 3. Env var overrides — unified HAWK__* vars + deprecated compat vars
      //    (env > yaml > defaults)
      const envOverrides = getEnvOverrides();
      if (Object.keys(envOverrides).length > 0) {
        config = deepMerge(config, envOverrides);
      }

      // 4. Auto-detect embedding provider — only if no embedding config is set
      //    (yaml/env didn't provide any embedding settings)
      const hasEmbedding =
        config.embedding?.provider ||
        config.embedding?.apiKey ||
        config.embedding?.baseURL;
      if (!hasEmbedding) {
        if (process.env.OLLAMA_BASE_URL) {
          // Already handled in getEnvOverrides, but we keep this as final fallback
          config.embedding.provider = 'ollama';
          config.embedding.baseURL  = process.env.OLLAMA_BASE_URL;
          config.embedding.model    = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
          config.embedding.dimensions = parseInt(process.env.HAWK_EMBEDDING_DIM || '768', 10);
        } else {
          const openclawkKey = getAgentModelKey('minimax');
          if (openclawkKey?.apiKey) {
            config.embedding.provider = 'minimax';
            config.embedding.apiKey  = openclawkKey.apiKey;
            config.embedding.baseURL = openclawkKey.baseUrl || 'https://api.minimaxi.com/v1';
            config.embedding.model   = 'text-embedding-v2';
            config.embedding.dimensions = 1024;
          } else if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) {
            config.embedding.provider = 'qianwen';
            config.embedding.apiKey   = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
            config.embedding.baseURL = 'https://dashscope.aliyuncs.com/api/v1';
            config.embedding.model   = 'text-embedding-v1';
            config.embedding.dimensions = 1024;
          } else if (process.env.JINA_API_KEY) {
            config.embedding.provider = 'jina';
            config.embedding.apiKey   = process.env.JINA_API_KEY;
            config.embedding.baseURL  = '';
            config.embedding.model    = 'jina-embeddings-v5-small';
            config.embedding.dimensions = 1024;
          } else if (process.env.OPENAI_API_KEY) {
            config.embedding.provider = 'openai';
            config.embedding.apiKey   = process.env.OPENAI_API_KEY;
            config.embedding.baseURL   = '';
            config.embedding.model    = 'text-embedding-3-small';
            config.embedding.dimensions = 1536;
          } else if (process.env.COHERE_API_KEY) {
            config.embedding.provider = 'cohere';
            config.embedding.apiKey   = process.env.COHERE_API_KEY;
            config.embedding.baseURL  = '';
            config.embedding.model    = 'embed-english-v3.0';
            config.embedding.dimensions = 1024;
          }
        }
      }

      // 5. Default LLM from OpenClaw (if not set in yaml or env)
      if (!config.llm.model || !config.llm.apiKey) {
        const openclawkKey = getAgentModelKey('minimax');
        if (openclawkKey?.apiKey) {
          config.llm = config.llm || {} as any;
          config.llm.model    = config.llm.model || getDefaultModelId();
          config.llm.apiKey   = openclawkKey.apiKey;
          config.llm.baseURL = config.llm.baseURL || openclawkKey.baseUrl || '';
          config.llm.provider = config.llm.provider || 'minimax';
        }
      }

      // Record config version history (non-critical, never fails config load)
      await recordConfigHistory(config);

      return config;
    })();
  }
  const config = await configPromise;
  cachedConfig = config;
  return config;
}

export function hasEmbeddingProvider(): boolean {
  // Check env vars (legacy)
  if (
    process.env.OLLAMA_BASE_URL ||
    process.env.QWEN_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.JINA_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.COHERE_API_KEY ||
    process.env.HAWK_EMBED_API_KEY ||
    process.env.HAWK_EMBED_PROVIDER
  ) return true;
  // Check config file embedding.baseURL
  const cfg = getConfig();
  return !!(cfg.embedding?.baseURL && cfg.embedding?.model);
}

// ─── Config Version History ─────────────────────────────────────────────────────

const HAWK_CONFIG_VERSION = process.env.HAWK_CONFIG_VERSION || '1';

interface ConfigHistoryEntry {
  timestamp: string;
  version: string;
  env: Record<string, string>;
  hash: string;
}

async function recordConfigHistory(config: HawkConfig): Promise<void> {
  try {
    const historyPath = path.join(HAWK_CONFIG_DIR, 'config-history.jsonl');
    const relevantKeys = [
      'OLLAMA_BASE_URL', 'OLLAMA_EMBED_MODEL',
      'HAWK__EMBEDDING__PROVIDER', 'HAWK__EMBEDDING__MODEL', 'HAWK__EMBEDDING__DIMENSIONS',
      'HAWK__EMBEDDING__BASE_URL', 'HAWK__EMBEDDING__API_KEY',
      'HAWK__LLM__PROVIDER', 'HAWK__LLM__MODEL', 'HAWK__LLM__API_KEY',
      'HAWK__LOGGING__LEVEL',
      'HAWK_CONFIG_VERSION',
    ];
    const envSnapshot: Record<string, string> = {};
    for (const key of relevantKeys) {
      const val = process.env[key];
      if (val !== undefined) envSnapshot[key] = val;
    }
    envSnapshot['__resolved_provider'] = config.embedding.provider;
    envSnapshot['__resolved_dim'] = String(config.embedding.dimensions);

    const entry: ConfigHistoryEntry = {
      timestamp: new Date().toISOString(),
      version: HAWK_CONFIG_VERSION,
      env: envSnapshot,
      hash: crypto.createHash('md5').update(JSON.stringify(envSnapshot)).digest('hex'),
    };

    let entries: ConfigHistoryEntry[] = [];
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, 'utf-8');
      entries = raw.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line) as ConfigHistoryEntry; }
        catch { return null; }
      }).filter((e): e is ConfigHistoryEntry => e !== null);
    }

    entries.push(entry);
    if (entries.length > 100) entries = entries.slice(-100);

    const dir = path.dirname(historyPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(historyPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  } catch {
    // Non-critical — never fail config load due to history write failure
  }
}

export function printConfigHistory(limit: number = 20): void {
  const historyPath = path.join(HAWK_CONFIG_DIR, 'config-history.jsonl');
  if (!fs.existsSync(historyPath)) {
    console.log('No config history found.');
    return;
  }
  try {
    const raw = fs.readFileSync(historyPath, 'utf-8');
    const entries = raw.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line) as ConfigHistoryEntry; }
      catch { return null; }
    }).filter((e): e is ConfigHistoryEntry => e !== null);

    const recent = entries.slice(-limit);
    console.log('\n🦅 hawk config-history (last ' + recent.length + ' entries)\n' + '─'.repeat(60));
    for (const e of recent.reverse()) {
      const date = new Date(e.timestamp).toLocaleString('zh-CN');
      const provider = e.env['__resolved_provider'] || '-';
      const dim = e.env['__resolved_dim'] || '-';
      const hash = e.hash.slice(0, 8);
      console.log(`${date}  v${e.version}  provider=${provider}  dim=${dim}  hash=${hash}`);
    }
    console.log('─'.repeat(60) + '\n');
  } catch (err: any) {
    console.error('Failed to read config history:', err.message);
  }
}

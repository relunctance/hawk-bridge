/**
 * Unified environment variable parser for hawk-bridge.
 *
 * Prefix: HAWK__ (double underscore = nested key separator)
 * Example: HAWK__EMBEDDING__DIMENSIONS → config.embedding.dimensions
 * Compound keys: HAWK__EMBEDDING__BASE_URL → config.embedding.baseURL
 *
 * Backward compatibility: old env vars are still honored but log a
 * deprecation warning on first use.
 */

import type { HawkConfig } from '../types.js';
import { logger } from '../logger.js';

const DEPRECATED_VARS: Array<{ var: string; message: string }> = [
  { var: 'OLLAMA_BASE_URL', message: 'Use HAWK__EMBEDDING__BASE_URL instead' },
  { var: 'OLLAMA_EMBED_MODEL', message: 'Use HAWK__EMBEDDING__MODEL instead' },
  { var: 'OLLAMA_EMBED_PATH', message: 'Use HAWK__EMBEDDING__BASE_URL instead' },
  { var: 'HAWK_EMBED_PROVIDER', message: 'Use HAWK__EMBEDDING__PROVIDER instead' },
  { var: 'HAWK_EMBED_API_KEY', message: 'Use HAWK__EMBEDDING__API_KEY instead' },
  { var: 'HAWK_EMBED_MODEL', message: 'Use HAWK__EMBEDDING__MODEL instead' },
  { var: 'HAWK_EMBEDDING_DIM', message: 'Use HAWK__EMBEDDING__DIMENSIONS instead' },
  { var: 'HAWK_PROXY', message: 'Use HAWK__EMBEDDING__PROXY instead' },
  { var: 'HAWK_BM25_QUERY_LIMIT', message: 'Use HAWK__STORAGE__BM25_QUERY_LIMIT instead' },
  { var: 'HAWK_MIN_SCORE', message: 'Use HAWK__RECALL__MIN_SCORE instead' },
  { var: 'HAWK_RERANK', message: 'Use HAWK__RECALL__RERANK_ENABLED instead' },
  { var: 'HAWK_RERANK_MODEL', message: 'Use HAWK__RECALL__RERANK_MODEL instead' },
  { var: 'HAWK_LOG_LEVEL', message: 'Use HAWK__LOGGING__LEVEL instead (or use HAWK__LOGGING__LEVEL directly — handled by logger, not config)' },
  { var: 'HAWK_PYTHON_HTTP_MODE', message: 'Use HAWK__PYTHON__HTTP_MODE instead' },
  { var: 'HAWK_API_BASE', message: 'Use HAWK__PYTHON__HTTP_BASE instead' },
];

let deprecationWarningsPrinted = false;

function printDeprecationWarnings(): void {
  if (deprecationWarningsPrinted) return;
  deprecationWarningsPrinted = true;
  for (const { var: v, message } of DEPRECATED_VARS) {
    if (process.env[v] !== undefined) {
      logger.warn({ var: v }, `DEPRECATED: ${v} is deprecated. ${message}`);
    }
  }
}

// ─── Unified env var parser ───────────────────────────────────────────────────

/**
 * Convert SCREAMING_SNAKE key to camelCase.
 * DIMENSIONS  → dimensions
 * BASE_URL    → baseUrl
 * API_KEY     → apiKey
 * RERANK_MODEL → rerankModel
 */
function toCamel(s: string): string {
  const parts = s.split('_').map(p => p.toLowerCase());
  if (parts.length === 1) return parts[0];
  return parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function applyValue(obj: Record<string, any>, key: string, value: string): void {
  if (value === 'true' || value === 'false') {
    obj[key] = value === 'true';
  } else if (/^\d+$/.test(value)) {
    obj[key] = parseInt(value, 10);
  } else if (/^\d+\.\d+$/.test(value)) {
    obj[key] = parseFloat(value);
  } else {
    obj[key] = value;
  }
}

/**
 * Parse HAWK__* environment variables into a HawkConfig partial.
 *
 * Format: HAWK__SECTION__KEY or HAWK__SECTION__COMPOUND_KEY
 *   HAWK__EMBEDDING__DIMENSIONS  → embedding.dimensions
 *   HAWK__EMBEDDING__BASE_URL    → embedding.baseURL
 *   HAWK__EMBEDDING__API_KEY     → embedding.apiKey
 *   HAWK__LLM__MODEL             → llm.model
 *   HAWK__RECALL__TOP_K          → recall.topK
 *   HAWK__RECALL__RERANK_MODEL   → recall.rerankModel
 *   HAWK__LOGGING__LEVEL         → logging.level
 */
function parseUnifiedEnvVars(): Partial<HawkConfig> {
  const result: Record<string, any> = {};

  for (const [rawKey, rawValue] of Object.entries(process.env)) {
    if (!rawKey.startsWith('HAWK__')) continue;

    const parts = rawKey.slice(6).split('__'); // Remove 'HAWK__' (6 chars), split by '__'
    if (parts.length < 2 || parts[0] === '') continue;

    const topLevel = parts[0].toLowerCase();
    const current = result[topLevel] ?? {};
    result[topLevel] = current;

    // Remaining parts form the nested key
    // e.g. ['EMBEDDING', 'DIMENSIONS'] → key = 'dimensions'
    // e.g. ['EMBEDDING', 'BASE', 'URL'] → key = 'baseURL'
    const nestedKey = toCamel(parts.slice(1).join('_'));
    applyValue(current, nestedKey, rawValue);
  }

  // Strip undefined values (prevents deepMerge from overwriting YAML values)
  const keys = Object.keys(result);
  if (keys.length > 0) {
  }
  return stripUndefined(result) as Partial<HawkConfig>;
}

function stripUndefined(obj: any): any {
  if (obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) result[k] = stripUndefined(v);
    }
    return result;
  }
  return obj;
}

// ─── Deprecated env var parser (backward compat) ─────────────────────────────

function parseDeprecatedEnvVars(): Partial<HawkConfig> {
  printDeprecationWarnings();
  const config: Partial<HawkConfig> = {};

  if (process.env.OLLAMA_BASE_URL) {
    config.embedding = {
      ...(config.embedding || {}),
      provider: 'ollama',
      baseURL: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
      dimensions: parseInt(process.env.HAWK_EMBEDDING_DIM || '768', 10),
    };
  }

  if (process.env.HAWK_EMBED_PROVIDER && !process.env.OLLAMA_BASE_URL) {
    config.embedding = { ...(config.embedding || {}), provider: process.env.HAWK_EMBED_PROVIDER as any };
  }
  if (process.env.HAWK_EMBED_API_KEY) {
    config.embedding = { ...(config.embedding || {}), apiKey: process.env.HAWK_EMBED_API_KEY };
  }
  if (process.env.HAWK_EMBED_MODEL) {
    config.embedding = { ...(config.embedding || {}), model: process.env.HAWK_EMBED_MODEL };
  }
  if (process.env.HAWK_EMBEDDING_DIM) {
    config.embedding = { ...(config.embedding || {}), dimensions: parseInt(process.env.HAWK_EMBEDDING_DIM, 10) };
  }
  if (process.env.HAWK_PROXY) {
    config.embedding = { ...(config.embedding || {}), proxy: process.env.HAWK_PROXY };
  }
  if (process.env.HAWK_LLM_PROVIDER) {
    config.llm = { ...(config.llm || {}), provider: process.env.HAWK_LLM_PROVIDER as any };
  }
  if (process.env.HAWK_LLM_MODEL) {
    config.llm = { ...(config.llm || {}), model: process.env.HAWK_LLM_MODEL };
  }
  if (process.env.HAWK_LLM_API_KEY) {
    config.llm = { ...(config.llm || {}), apiKey: process.env.HAWK_LLM_API_KEY };
  }
  if (process.env.HAWK_MIN_SCORE) {
    config.recall = { ...(config.recall || {}), minScore: parseFloat(process.env.HAWK_MIN_SCORE) };
  }
  if (process.env.HAWK_RERANK) {
    config.recall = { ...(config.recall || {}), rerankEnabled: process.env.HAWK_RERANK === 'true' };
  }
  if (process.env.HAWK_RERANK_MODEL) {
    config.recall = { ...(config.recall || {}), rerankModel: process.env.HAWK_RERANK_MODEL };
  }
  if (process.env.HAWK_CAPTURE_ENABLED !== undefined) {
    config.capture = { ...(config.capture || {}), enabled: process.env.HAWK_CAPTURE_ENABLED !== 'false' };
  }
  if (process.env.HAWK_PYTHON_HTTP_MODE !== undefined) {
    config.python = { ...(config.python || {}), httpMode: process.env.HAWK_PYTHON_HTTP_MODE === 'true' };
  }
  if (process.env.HAWK_API_BASE) {
    config.python = { ...(config.python || {}), httpBase: process.env.HAWK_API_BASE };
  }

  return config;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getEnvOverrides(): Partial<HawkConfig> {
  const unified = parseUnifiedEnvVars();
  const deprecated = parseDeprecatedEnvVars();

  // Normalize embedding.baseUrl → baseURL (YAML uses baseURL; deepMerge needs matching keys)
  const unifiedEmbed = (unified as any)?.embedding;
  if (unifiedEmbed) {
    if (unifiedEmbed.baseUrl && !unifiedEmbed.baseURL) {
      unifiedEmbed.baseURL = unifiedEmbed.baseUrl;
      delete unifiedEmbed.baseUrl;
    }
    // If embedding.baseURL is a localhost URL and no provider is set,
    // infer provider=ollama (common case: HAWK__EMBEDDING__BASE_URL=http://localhost:...)
    if (unifiedEmbed.baseURL && !unifiedEmbed.provider) {
      const url = unifiedEmbed.baseURL as string;
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        unifiedEmbed.provider = 'ollama';
      }
    }
  }

  // unified HAWK__* vars take priority over deprecated vars
  return deepMerge(deprecated, unified);
}

// ─── Deep merge ───────────────────────────────────────────────────────────────

export function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result: Record<string, any> = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = (override as any)[key];
    if (
      baseVal !== undefined &&
      overrideVal !== undefined &&
      typeof baseVal === 'object' &&
      typeof overrideVal === 'object' &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overrideVal)
    ) {
      (result as any)[key] = deepMerge(baseVal, overrideVal);
    } else if (overrideVal !== undefined) {
      (result as any)[key] = overrideVal;
    }
  }
  return result as T;
}

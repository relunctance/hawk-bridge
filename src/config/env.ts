// Environment variable overrides — highest priority after yaml config
// These override whatever is in config.yaml

import type { HawkConfig } from '../types.js';

export function getEnvOverrides(): Partial<HawkConfig> {
  const overrides: Partial<HawkConfig> = {};

  // DB provider
  if (process.env.HAWK_DB_PROVIDER) {
    overrides.db = { provider: process.env.HAWK_DB_PROVIDER as any };
  }

  // Embedding
  if (process.env.HAWK_EMBED_PROVIDER) {
    overrides.embedding = {
      ...overrides.embedding,
      provider: process.env.HAWK_EMBED_PROVIDER as any,
    };
  }
  if (process.env.HAWK_EMBED_API_KEY) {
    overrides.embedding = {
      ...overrides.embedding,
      apiKey: process.env.HAWK_EMBED_API_KEY,
    };
  }

  // Capture
  if (process.env.HAWK_CAPTURE_ENABLED !== undefined) {
    overrides.capture = {
      ...overrides.capture,
      enabled: process.env.HAWK_CAPTURE_ENABLED !== 'false',
    };
  }

  return overrides;
}

/**
 * Deep merge two objects. Second argument overrides first.
 * Only merges plain objects; arrays are replaced, not concatenated.
 */
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

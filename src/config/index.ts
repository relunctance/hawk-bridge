// Config Provider — merges YAML config + env overrides
// Config path: ~/.hawk/config.yaml (yaml) → ~/.hawk/config.json (legacy json)

export { loadYamlConfig, getEnvOverrides, deepMerge } from './env.js';

import { loadYamlConfig, getEnvOverrides, deepMerge } from './env.js';
import { DEFAULT_CONFIG } from './defaults.js';
import type { HawkConfig } from '../types.js';

/**
 * Get the final merged config:
 * 1. DEFAULT_CONFIG (lowest priority)
 * 2. ~/.hawk/config.yaml or ~/.hawk/config.json (middle priority)
 * 3. Environment variables (highest priority)
 */
export function getConfig(): HawkConfig {
  const yamlConfig = loadYamlConfig();
  const envOverrides = getEnvOverrides();
  return deepMerge(deepMerge(DEFAULT_CONFIG, yamlConfig as Partial<HawkConfig>), envOverrides);
}

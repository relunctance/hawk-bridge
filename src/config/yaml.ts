// YAML config loader — supports ${ENV_VAR} placeholders
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

const CONFIG_DIR = path.join(os.homedir(), '.hawk');

function resolveEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? '';
  });
}

export function loadYamlConfig(): Record<string, any> {
  // Try yaml first, fall back to legacy json
  const yamlPath = path.join(CONFIG_DIR, 'config.yaml');
  const legacyPath = path.join(CONFIG_DIR, 'config.json');

  if (fs.existsSync(yamlPath)) {
    try {
      const raw = fs.readFileSync(yamlPath, 'utf-8');
      const resolved = resolveEnvVars(raw);
      return yaml.load(resolved) as Record<string, any>;
    } catch (e) {
      console.warn('[hawk-bridge] Failed to load config.yaml, falling back to defaults:', e);
    }
  } else if (fs.existsSync(legacyPath)) {
    try {
      const raw = fs.readFileSync(legacyPath, 'utf-8');
      return JSON.parse(raw) as Record<string, any>;
    } catch (e) {
      console.warn('[hawk-bridge] Failed to load legacy config.json:', e);
    }
  }

  return {};
}

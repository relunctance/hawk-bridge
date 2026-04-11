import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Load legacy config.json for backward compatibility.
 * Converts old JSON format to the new flat structure.
 */
export function loadLegacyConfig(): Record<string, any> {
  const legacyPath = path.join(os.homedir(), '.hawk', 'config.json');

  if (!fs.existsSync(legacyPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(legacyPath, 'utf-8');
    const config = JSON.parse(raw);

    // Handle the plugins.entries.hawk-bridge.config structure (from config.example.json)
    if (config.plugins?.entries?.['hawk-bridge']?.config) {
      return config.plugins.entries['hawk-bridge'].config;
    }

    // Handle direct config structure
    return config;
  } catch {
    return {};
  }
}

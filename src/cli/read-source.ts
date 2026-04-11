/**
 * hawk read --source — CLI tool to read memories filtered by source
 *
 * Usage:
 *   node dist/cli/read-source.js --source evolution-success --source evolution-failure --limit 20
 */

import { getMemoryStore } from '../store/factory.js';

const ARGV = process.argv.slice(2);

function getAllArgs(arg: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < ARGV.length; i++) {
    if (ARGV[i] === arg && ARGV[i + 1] !== undefined && !ARGV[i + 1].startsWith('--')) {
      values.push(ARGV[i + 1]);
    }
  }
  return values;
}

function getArg(arg: string, fallback?: string): string | undefined {
  const idx = ARGV.indexOf(arg);
  return idx >= 0 && ARGV[idx + 1] !== undefined ? ARGV[idx + 1] : fallback;
}

const sources = getAllArgs('--source');
const limit  = parseInt(getArg('--limit', '20') || '20', 10);

if (sources.length === 0) {
  console.error('Usage: node dist/cli/read-source.js --source <source1> [--source <source2> ...] [--limit N]');
  process.exit(1);
}

async function main() {
  const store = await getMemoryStore();
  await store.init();

  const allMemories = await store.getAllMemories();

  // Filter by source field (match any of the --source values)
  const filtered = allMemories
    .filter(m => sources.includes(m.source))
    .slice(0, limit);

  // Output as JSON array: [{id, text, category, source, importance, timestamp}]
  const result = filtered.map(m => ({
    id: m.id,
    text: m.text,
    category: m.category,
    source: m.source,
    importance: m.importance,
    timestamp: m.timestamp,
  }));

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('[hawk read --source] Error:', err.message);
  process.exit(1);
});

/**
 * hawk write — CLI tool to write a memory entry directly
 *
 * Usage:
 *   node dist/cli/write.js --text "..." --category fact --importance 0.9 \
 *     --source evolution-success --metadata '{"issue_id": "CODE-001"}'
 */

import { getMemoryStore } from '../store/factory.js';
import type { MemoryEntry } from '../types.js';
import { randomUUID } from 'crypto';

const ARGV = process.argv.slice(2);

function getArg(arg: string, fallback?: string): string | undefined {
  const idx = ARGV.indexOf(arg);
  return idx >= 0 && ARGV[idx + 1] !== undefined ? ARGV[idx + 1] : fallback;
}

function hasFlag(flag: string): boolean {
  return ARGV.includes(flag);
}

const text      = getArg('--text');
const category  = getArg('--category', 'fact') as MemoryEntry['category'];
const importance = parseFloat(getArg('--importance', '0.5') || '0.5');
const source    = getArg('--source', 'user-import');
const metadataArg = getArg('--metadata');

if (!text) {
  console.error('Usage: node dist/cli/write.js --text "..." --category fact --importance 0.9 --source evolution-success [--metadata \'{"key":"val"}\']');
  process.exit(1);
}

const metadata: Record<string, unknown> = metadataArg ? JSON.parse(metadataArg) : {};

async function main() {
  const store = await getMemoryStore();
  await store.init();

  // Generate vector via embed()
  const vectors = await store.embed([text]);
  const vector = vectors[0];

  const now = Date.now();
  const entry: MemoryEntry = {
    id: randomUUID(),
    name: text.slice(0, 80),
    description: text.slice(0, 200),
    text,
    vector,
    category,
    importance,
    timestamp: now,
    expiresAt: 0,
    accessCount: 0,
    lastAccessedAt: now,
    deletedAt: null,
    reliability: 0.5,
    verificationCount: 0,
    lastVerifiedAt: null,
    locked: false,
    correctionHistory: [],
    sessionId: null,
    createdAt: now,
    updatedAt: now,
    scope: 'personal',
    importanceOverride: 1.0,
    coldStartUntil: null,
    metadata,
    source_type: 'text',
    source,
    driftNote: null,
    driftDetectedAt: null,
  };

  await store.store(entry);

  // Print the created memory id
  console.log(JSON.stringify({ id: entry.id, success: true }));
}

main().catch(err => {
  console.error('[hawk write] Error:', err.message);
  process.exit(1);
});

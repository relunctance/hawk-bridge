/**
 * hawk write — CLI tool to write a memory entry directly
 *
 * Usage:
 *   node dist/cli/write.js --text "..." --category fact --importance 0.9 \
 *     --source evolution-success --metadata '{"issue_id": "CODE-001"}'
 *
 * Migration (re-embed all records with new dimension):
 *   HAWK_EMBEDDING_DIM=1024 node dist/cli/write.js --reinit
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

// ── Re-init (dimension migration) ────────────────────────────────────────────
async function reinit() {
  const store = await getMemoryStore();
  await store.init();

  // 1. Read ALL existing records (keep all fields; vector will be regenerated)
  const memories = await (store as any).getAllMemories();
  console.log(`[hawk migrate] Found ${memories.length} records to migrate`);

  // 2. Drop old table so init() re-creates with current DEFAULT_EMBEDDING_DIM
  await store.reset();
  await store.init();
  console.log(`[hawk migrate] Table recreated with HAWK_EMBEDDING_DIM=${process.env.HAWK_EMBEDDING_DIM || '384'}`);

  // 3. Re-embed and write each record (batched for efficiency)
  const BATCH = 50;
  let migrated = 0;
  let errors = 0;

  for (let i = 0; i < memories.length; i += BATCH) {
    const batch = memories.slice(i, i + BATCH);
    const texts = batch.map((m: MemoryEntry) => m.text);
    const vectors = await store.embed(texts);

    for (let j = 0; j < batch.length; j++) {
      const mem = batch[j];
      const vector = vectors[j];
      const now = Date.now();
      const entry: MemoryEntry = {
        ...mem,
        id: randomUUID(),          // New ID (old vector IDs can't be reused across schema)
        vector,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        accessCount: 0,
        verificationCount: mem.verificationCount ?? 0,
        reliability: mem.reliability ?? 0.5,
        correctionHistory: mem.correctionHistory ?? [],
        coldStartUntil: mem.coldStartUntil ?? null,
        driftNote: mem.driftNote ?? null,
        driftDetectedAt: mem.driftDetectedAt ?? null,
        last_used_at: mem.last_used_at ?? null,
        usefulness_score: mem.usefulness_score ?? null,
      };
      try {
        await store.store(entry);
        migrated++;
      } catch (e: any) {
        console.warn(`[hawk migrate] Failed to migrate record: ${e.message}`);
        errors++;
      }
    }
    process.stdout.write(`[hawk migrate] Progress: ${Math.min(i + BATCH, memories.length)}/${memories.length}\r`);
  }

  console.log(`\n[hawk migrate] Done — ${migrated} migrated, ${errors} errors`);
  return { migrated, errors };
}

// ── Normal write ─────────────────────────────────────────────────────────────
async function writeEntry() {
  const text       = getArg('--text');
  const category   = getArg('--category', 'fact') as MemoryEntry['category'];
  const importance = parseFloat(getArg('--importance', '0.5') || '0.5');
  const source     = getArg('--source', 'user-import');
  const metadataArg = getArg('--metadata');

  if (!text) {
    console.error('Usage: node dist/cli/write.js --text "..." --category fact --importance 0.9\nOr: node dist/cli/write.js --reinit (to migrate to new embedding dimension)');
    process.exit(1);
  }

  const metadata: Record<string, unknown> = metadataArg ? JSON.parse(metadataArg) : {};
  const store = await getMemoryStore();
  await store.init();

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
    last_used_at: null,
    usefulness_score: null,
  };

  await store.store(entry);
  console.log(JSON.stringify({ id: entry.id, success: true }));
}

// ── Entry point ───────────────────────────────────────────────────────────────
const reinitMode = hasFlag('--reinit');

if (reinitMode) {
  reinit().catch(err => {
    console.error('[hawk migrate] Error:', err.message);
    process.exit(1);
  });
} else {
  writeEntry().catch(err => {
    console.error('[hawk write] Error:', err.message);
    process.exit(1);
  });
}

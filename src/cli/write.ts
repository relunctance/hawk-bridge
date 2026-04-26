/**
 * hawk write — CLI tool to write a memory entry directly
 *
 * Usage:
 *   node dist/cli/write.js --text "..." --category fact --importance 0.9 \
 *     --source evolution-success --metadata '{"issue_id": "CODE-001"}'
 *
 * Migration (re-embed all records with new dimension):
 *   HAWK_EMBEDDING_DIM=1024 node dist/cli/write.js --reinit

/**
 * Safe JSON parse — wraps JSON.parse in try-catch to prevent crashes on malformed input.
 * Exits with error for migration-critical parses (backup), warns for optional parses (metadata).
 */
function safeParseJSON<T>(raw: string, context: string, exitOnError = false): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (e: any) {
    if (exitOnError) {
      console.error(`[hawk migrate] FATAL: Failed to parse ${context}: ${e.message}`);
      process.exit(1);
    }
    console.warn(`[hawk write] WARNING: Failed to parse ${context}: ${e.message}`);
    return null;
  }
}

import * as path from 'path';
import * as os from 'os';
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
  const fs = await import('fs/promises');
  const store = await getMemoryStore();
  await store.init();

  // 1. Export ALL existing records to backup before dropping
  const memories = await (store as any).exportAll();
  const timestamp = Date.now();
  const backupPath = path.join(os.homedir(), '.hawk', `migrate-backup-${timestamp}.json`);
  await fs.mkdir(path.join(os.homedir(), '.hawk'), { recursive: true });
  await fs.writeFile(backupPath, JSON.stringify({ memories, exportedAt: new Date().toISOString() }, null, 2));
  console.log(`[hawk migrate] Found ${memories.length} records to migrate`);
  console.log(`[hawk migrate] Backup written to ${backupPath}`);

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

  // 4. Verify new vectors are non-zero (check first 3)
  const verifyCount = Math.min(3, migrated);
  let verifyFailed = false;
  for (let k = 0; k < verifyCount; k++) {
    // Re-fetch a few entries to check vectors
    const all = await (store as any).getAllMemories();
    if (all.length > 0) {
      const sample = all[k % all.length];
      const nonZero = sample.vector && sample.vector.some((v: number) => v !== 0);
      if (!nonZero) {
        console.warn(`[hawk migrate] WARNING: Memory ${sample.id} has zero vector`);
        verifyFailed = true;
      }
    }
  }

  if (verifyFailed) {
    // Restore from backup
    console.error(`[hawk migrate] VERIFICATION FAILED — restoring from backup`);
    try {
      const raw = await fs.readFile(backupPath, 'utf-8');
      const backup = safeParseJSON<{ memories: any[]; exportedAt: string }>(raw, 'backup file', true);
      if (!backup) return; // safeParseJSON already exited
      await store.reset();
      await store.init();
      for (const mem of backup.memories) {
        await store.store(mem);
      }
      console.log(`[hawk migrate] Restored ${backup.memories.length} records from backup`);
    } catch (restoredErr: any) {
      console.error(`[hawk migrate] RESTORE FAILED: ${restoredErr.message}`);
    }
    throw new Error(`Migration verification failed — restored from backup at ${backupPath}`);
  }

  // 5. Success: delete backup file
  console.log(`[hawk migrate] Verification passed (${verifyCount} samples checked)`);
  try {
    await fs.unlink(backupPath);
    console.log(`[hawk migrate] Backup file deleted`);
  } catch {
    console.warn(`[hawk migrate] Could not delete backup file (non-critical)`);
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

  const metadata: Record<string, unknown> = safeParseJSON<Record<string, unknown>>(metadataArg || '{}', '--metadata JSON', false) ?? {};
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
    createdAt: now,
    timestamp: now,          // ← fix: BigInt(undefined) bug（entry.timestamp 之前从未设置）
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

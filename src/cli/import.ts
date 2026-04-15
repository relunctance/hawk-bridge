/**
 * hawk import — bulk import memories from a JSON backup file.
 *
 * Usage:
 *   node dist/cli/import.js --file ~/.hawk/backup-1712345678900.json
 *   node dist/cli/import.js --file data.jsonl --format jsonl
 *
 * Supports:
 *   - JSON:  { "memories": [...], "exportedAt": "..." }  (hawk export format)
 *   - JSONL: one MemoryEntry per line
 */

import * as path from 'path';
import * as fs from 'fs';
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

interface BackupFormat {
  memories: MemoryEntry[];
  exportedAt: string;
}

async function main() {
  const filepath = getArg('--file');
  const format = getArg('--format', 'json');
  const dryRun = hasFlag('--dry-run');
  const skipErrors = hasFlag('--skip-errors');

  if (!filepath) {
    console.error('Usage: node dist/cli/import.js --file <path> [--format json|jsonl] [--dry-run] [--skip-errors]');
    console.error('  JSON:  { "memories": [...], "exportedAt": "..." }  (hawk export format)');
    console.error('  JSONL: one MemoryEntry per line');
    process.exit(1);
  }

  if (!fs.existsSync(filepath)) {
    console.error(`❌ File not found: ${filepath}`);
    process.exit(1);
  }

  const store = await getMemoryStore();
  await store.init();

  let memories: MemoryEntry[] = [];

  if (format === 'jsonl') {
    // JSONL: one MemoryEntry per line
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        memories.push(JSON.parse(line) as MemoryEntry);
      } catch {
        console.warn(`⚠️  Skipped invalid JSON line: ${line.slice(0, 80)}`);
      }
    }
  } else {
    // JSON: backup format { memories: [...] }
    const raw = fs.readFileSync(filepath, 'utf-8');
    const backup = JSON.parse(raw) as BackupFormat;
    if (!Array.isArray(backup.memories)) {
      console.error('❌ Invalid backup format: expected { "memories": [...] }');
      process.exit(1);
    }
    memories = backup.memories;
  }

  if (memories.length === 0) {
    console.log('📭 No memories to import.');
    return;
  }

  console.log(`📥 Importing ${memories.length} memories from ${filepath}...`);
  if (dryRun) console.log('🔍 Dry-run mode — no changes will be written.\n');

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  // Batch processing for efficiency
  const BATCH = 20;
  for (let i = 0; i < memories.length; i += BATCH) {
    const batch = memories.slice(i, i + BATCH);

    for (const mem of batch) {
      if (dryRun) {
        console.log(`   [dry-run] would import: ${mem.text?.slice(0, 60) ?? mem.id}...`);
        imported++;
        continue;
      }

      try {
        // Re-generate ID to avoid conflicts
        const now = Date.now();
        const entry: MemoryEntry = {
          ...mem,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
          accessCount: 0,
          // Preserve original vector only if present and non-zero
          vector: (mem.vector && mem.vector.some((v: number) => v !== 0))
            ? mem.vector
            : [],
          // Reset derived fields
          correctionHistory: mem.correctionHistory ?? [],
          verificationCount: mem.verificationCount ?? 0,
          lastVerifiedAt: mem.lastVerifiedAt ?? null,
          locked: mem.locked ?? false,
          importanceOverride: mem.importanceOverride ?? 1.0,
          coldStartUntil: mem.coldStartUntil ?? null,
          driftNote: mem.driftNote ?? null,
          driftDetectedAt: mem.driftDetectedAt ?? null,
          last_used_at: mem.last_used_at ?? null,
          usefulness_score: mem.usefulness_score ?? null,
          recall_count: mem.recall_count ?? 0,
        };

        await store.store(entry);
        imported++;
      } catch (err: any) {
        if (err.message?.includes('duplicate') || err.message?.includes('already exists')) {
          skipped++;
        } else {
          failed++;
          if (!skipErrors) {
            console.error(`❌ Failed to import memory: ${err.message}`);
          }
        }
      }
    }

    process.stdout.write(
      `\r   Progress: ${Math.min(i + BATCH, memories.length)}/${memories.length} ` +
      `| ✅ ${imported}  ⏭️ ${skipped}  ❌ ${failed}`
    );
  }

  console.log('\n');
  if (dryRun) {
    console.log(`🔍 Dry-run complete: would import ${imported} memories`);
  } else {
    console.log(
      `✅ Restore complete: ${imported} imported, ${skipped} skipped, ${failed} failed`
    );
  }

  if (failed > 0 && !skipErrors) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Import failed:', err.message);
  process.exit(1);
});

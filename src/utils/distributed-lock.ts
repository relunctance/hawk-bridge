/**
 * Distributed file lock for multi-process coordination.
 *
 * Uses mkdir() as atomic lock acquisition (POSIX guarantees atomicity
 * when the directory does not exist). Lock files contain PID and
 * expiry timestamp for deadlock detection.
 *
 * Usage:
 *   const lock = acquireLock('bm25_rebuild', 60_000);
 *   if (!lock) return; // another process holds the lock
 *   try {
 *     // critical section
 *   } finally {
 *     releaseLock('bm25_rebuild');
 *   }
 */

import { mkdirSync, unlinkSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../logger.js';

const LOCK_DIR = process.env.HAWK_LOCK_DIR ?? join(homedir(), '.hawk', 'locks');

// Map of held locks (for nested release within same process)
const heldLocks = new Map<string, string>();

function ensureLockDir(): void {
  if (!existsSync(LOCK_DIR)) mkdirSync(LOCK_DIR, { recursive: true });
}

function lockFileFor(name: string): string {
  return join(LOCK_DIR, `${name}.lock`);
}

/**
 * Try to acquire a named lock with the given TTL (milliseconds).
 * Returns the lock path on success, null if already held.
 */
export function acquireLock(name: string, ttlMs = 60_000): string | null {
  ensureLockDir();
  const lf = lockFileFor(name);

  try {
    // mkdirSync is atomic on POSIX when dir doesn't exist
    mkdirSync(lf, { recursive: false });
    const content = `${process.pid}:${Date.now() + ttlMs}`;
    require('fs').writeFileSync(lf, content, 'utf8');
    heldLocks.set(name, lf);
    return lf;
  } catch (e: any) {
    // Lock already exists — check if it's expired
    try {
      if (existsSync(lf)) {
        const content = readFileSync(lf, 'utf8');
        const parts = content.split(':');
        const expiry = parseInt(parts[1], 10);
        if (Date.now() > expiry) {
          // Expired — steal it
          try { unlinkSync(lf); } catch { /* ignore */ }
          return acquireLock(name, ttlMs);
        }
      }
    } catch {
      // Couldn't read lock file — treat as expired
      try { unlinkSync(lf); } catch { /* ignore */ }
      return acquireLock(name, ttlMs);
    }
    return null;
  }
}

/**
 * Release a previously acquired lock.
 * Safe to call even if lock has expired (idempotent).
 */
export function releaseLock(name: string): void {
  const lf = heldLocks.get(name) ?? lockFileFor(name);
  heldLocks.delete(name);
  try {
    if (existsSync(lf)) {
      const content = readFileSync(lf, 'utf8');
      const pid = parseInt(content.split(':')[0], 10);
      if (pid === process.pid) {
        unlinkSync(lf);
      }
    }
  } catch {
    // ignore errors
  }
}

/**
 * Check if a lock is currently held (by any process).
 */
export function isLocked(name: string): boolean {
  const lf = lockFileFor(name);
  if (!existsSync(lf)) return false;
  try {
    const content = readFileSync(lf, 'utf8');
    const expiry = parseInt(content.split(':')[1], 10);
    return Date.now() <= expiry;
  } catch {
    return false;
  }
}

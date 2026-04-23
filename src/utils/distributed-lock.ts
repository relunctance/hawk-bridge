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
 *
 * Test usage:
 *   import { setLockDir } from './distributed-lock.js';
 *   setLockDir('/tmp/my-test-locks');
 */

import { mkdirSync, unlinkSync, readFileSync, existsSync, openSync, writeSync, closeSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../logger.js';

// Module-level state — mutable for testing
let _LOCK_DIR: string | null = null;

// Exported for testing — overrides LOCK_DIR for the lifetime of the process
export function setLockDir(dir: string): void {
  _LOCK_DIR = dir;
}

function getLockDir(): string {
  return _LOCK_DIR ?? process.env.HAWK_LOCK_DIR ?? join(homedir(), '.hawk', 'locks');
}

// Map of held locks (for nested release within same process)
const heldLocks = new Map<string, string>();

function ensureLockDir(): void {
  const dir = getLockDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function lockFileFor(name: string): string {
  return join(getLockDir(), `${name}.lock`);
}

/**
 * Try to acquire a named lock with the given TTL (milliseconds).
 * Returns the lock path on success, null if already held.
 */
export function acquireLock(name: string, ttlMs = 60_000): string | null {
  ensureLockDir();
  const lf = lockFileFor(name);

  // O_EXCL: fails if file already exists → atomic acquire
  try {
    const fd = openSync(lf, 'wx', 0o644);  // 'w' + 'x' = O_WRONLY | O_CREAT | O_EXCL
    const content = `${process.pid}:${Date.now() + ttlMs}`;
    writeSync(fd, content, 'utf8');
    closeSync(fd);
    heldLocks.set(name, lf);
    return lf;
  } catch (e: any) {
    if (e.code !== 'EEXIST') {
      logger.error({ err: e }, 'Unexpected lock acquisition error');
      return null;
    }
    // Lock file already exists — check if it's expired
    try {
      if (existsSync(lf)) {
        const content = readFileSync(lf, 'utf8');
        const parts = content.split(':');
        const expiry = parseInt(parts[1], 10);
        if (Date.now() > expiry) {
          // Expired — delete it and retry
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

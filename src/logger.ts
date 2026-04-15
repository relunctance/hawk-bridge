/**
 * Hawk-bridge logger with file rotation.
 *
 * Features:
 * - stdout + file dual output
 * - Size-based rotation: 50MB per file
 * - Max 14 files retained (auto-cleanup of oldest)
 * - All console.* calls redirected to pino in production
 */

import pino from 'pino';
import fs from 'fs';
import { WriteStream } from 'fs';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';

// ─── Log directory & file ─────────────────────────────────────────────────────

const LOG_DIR = process.env.HAWK_LOG_DIR ?? join(homedir(), '.hawk', 'logs');
const LOG_FILE_BASE = join(LOG_DIR, 'hawk-bridge.log');
const MAX_FILE_SIZE = parseInt(process.env.HAWK_LOG_MAX_SIZE ?? String(50 * 1024 * 1024), 10); // 50MB
const MAX_FILES = parseInt(process.env.HAWK_LOG_MAX_FILES ?? '14', 10);

// ─── Rotating file WriteStream ────────────────────────────────────────────────

function getTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}${s}`;
}

class RotatingFileStream {
  private stream: WriteStream;
  private size = 0;

  constructor(filePath: string) {
    this.ensureDir(dirname(filePath));
    this.stream = this.openStream(filePath);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private openStream(filePath: string): WriteStream {
    const fd = existsSync(filePath)
      ? undefined  // append mode
      : undefined;
    // We use regular fs WriteStream in append mode
    const s = fs.createWriteStream(filePath, { flags: 'a', highWaterMark: 64 * 1024 });
    if (existsSync(filePath)) {
      this.size = statSync(filePath).size;
    }
    return s;
  }

  private rotate(): void {
    this.stream.end();
    const rotatedPath = `${LOG_FILE_BASE}.${getTimestamp()}.log`;
    try {
      const dir = dirname(LOG_FILE_BASE);
      // Rename current log to timestamped backup
      if (existsSync(LOG_FILE_BASE)) {
        fs.renameSync(LOG_FILE_BASE, rotatedPath);
      }
    } catch {
      // ignore rename errors
    }
    this.stream = this.openStream(LOG_FILE_BASE);
    this.size = 0;
    this.cleanupOldRotations();
  }

  private cleanupOldRotations(): void {
    try {
      const dir = dirname(LOG_FILE_BASE);
      const base = basename(LOG_FILE_BASE);
      const files = readdirSync(dir)
        .filter(f => f.startsWith(base + '.') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: join(dir, f),
          mtime: statSync(join(dir, f)).mtime.getTime(),
        }))
        .sort((a, b) => a.mtime - b.mtime); // oldest first

      const excess = files.length - MAX_FILES;
      if (excess > 0) {
        for (const f of files.slice(0, excess)) {
          try { unlinkSync(f.path); } catch { /* ignore */ }
        }
      }
    } catch {
      // ignore cleanup errors
    }
  }

  write(chunk: string, cb?: () => void): void {
    const len = Buffer.byteLength(chunk, 'utf8');
    if (this.size + len > MAX_FILE_SIZE) {
      this.rotate();
    }
    this.size += len;
    this.stream.write(chunk, cb as () => void);
  }

  end(cb?: () => void): void {
    this.stream.end(cb);
  }

  // Expose for pino
  get fd(): number {
    return (this.stream as any).fd ?? -1;
  }
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

// ─── Ensure log directory exists ──────────────────────────────────────────────

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ─── Create rotating file stream ─────────────────────────────────────────────

const rotatingStream = new RotatingFileStream(LOG_FILE_BASE);

// ─── Pino logger ─────────────────────────────────────────────────────────────

const logLevel = process.env.HAWK__LOGGING__LEVEL || process.env.HAWK_LOG_LEVEL || 'info';

export const logger = pino({
  level: logLevel,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}, rotatingStream as any);

// ─── Patch console.* in production ───────────────────────────────────────────

export function patchConsole(): void {
  // Only patch in production/strict mode
  if (process.env.NODE_ENV !== 'production' && process.env.HAWK_STRICT_LOG !== '1') return;

  // eslint-disable-next-line no-console
  const origError = console.error.bind(console);
  // eslint-disable-next-line no-console
  const origWarn = console.warn.bind(console);
  // eslint-disable-next-line no-console
  const origLog = console.log.bind(console);

  // eslint-disable-next-line no-console
  console.error = (...args: unknown[]) => {
    logger.error({ ctx: 'console' }, ...args.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
  };
  // eslint-disable-next-line no-console
  console.warn = (...args: unknown[]) => {
    logger.warn({ ctx: 'console' }, ...args.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
  };
  // eslint-disable-next-line no-console
  console.log = (...args: unknown[]) => {
    logger.info({ ctx: 'console' }, ...args.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
  };

  // Also patch console.info, console.debug
  // eslint-disable-next-line no-console
  console.info = (...args: unknown[]) => {
    logger.info({ ctx: 'console' }, ...args.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
  };
  // eslint-disable-next-line no-console
  console.debug = (...args: unknown[]) => {
    logger.debug({ ctx: 'console' }, ...args.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
  };
}

patchConsole();

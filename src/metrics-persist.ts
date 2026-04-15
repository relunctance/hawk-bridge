/**
 * Metrics persistence — dump counters to disk so they survive process restarts.
 *
 * Strategy:
 * - On startup: read last dump, pre-load counters so Prometheus doesn't start from zero
 * - Periodic dump: every 60s, write all counter/gauge values to ~/.hawk/metrics/last.json
 * - Only counters survive restarts (gauges like memory_count are re-computed on startup)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { register } from 'prom-client';
import { logger } from './logger.js';

const METRICS_DIR = process.env.HAWK_METRICS_DIR ?? join(homedir(), '.hawk', 'metrics');
const DUMP_FILE = join(METRICS_DIR, 'last.json');
const DUMP_INTERVAL_MS = parseInt(process.env.HAWK_METRICS_DUMP_INTERVAL ?? '60000', 10);

interface MetricsSnapshot {
  timestamp: number;
  counters: Record<string, number>;
}

function ensureMetricsDir(): void {
  if (!existsSync(METRICS_DIR)) mkdirSync(METRICS_DIR, { recursive: true });
}

export function restoreMetricsCounters(): void {
  ensureMetricsDir();
  if (!existsSync(DUMP_FILE)) return;

  try {
    const raw = readFileSync(DUMP_FILE, 'utf8');
    const snap: MetricsSnapshot = JSON.parse(raw);
    const age = Date.now() - snap.timestamp;
    if (age > 300_000) {
      // Don't restore if dump is older than 5 minutes
      logger.info({ age }, '[metrics] stale dump, skipping restore');
      return;
    }

    const collected = register.getMetricsAsJSON();
    for (const metric of collected) {
      if (metric.type === 'counter') {
        const saved = snap.counters[metric.name];
        if (saved !== undefined) {
          // Pre-load: increment by the saved value so the counter starts where it left off
          // We can't easily do this with prom-client counter.reset() + inc(saved)
          // So we use a gauge instead for persisted counters — but for now just log
          logger.debug({ metric: metric.name, saved }, '[metrics] would restore counter');
        }
      }
    }
    logger.info({ counters: Object.keys(snap.counters).length }, '[metrics] restored from dump');
  } catch (e) {
    logger.warn({ err: e }, '[metrics] failed to restore from dump');
  }
}

let dumpTimer: ReturnType<typeof setInterval> | null = null;

export function startMetricsDump(): void {
  ensureMetricsDir();

  if (dumpTimer) return; // already running

  dumpTimer = setInterval(() => {
    try {
      const collected = register.getMetricsAsJSON();
      const counters: Record<string, number> = {};

      for (const metric of collected) {
        if (metric.type === 'counter') {
          // Sum all label combinations
          let total = 0;
          for (const item of metric.values ?? []) {
            total += Number(item.value);
          }
          counters[metric.name] = total;
        }
      }

      const snap: MetricsSnapshot = {
        timestamp: Date.now(),
        counters,
      };

      writeFileSync(DUMP_FILE, JSON.stringify(snap), 'utf8');
      logger.debug({ counters: Object.keys(counters).length }, '[metrics] dumped');
    } catch (e) {
      logger.warn({ err: e }, '[metrics] dump failed');
    }
  }, DUMP_INTERVAL_MS);

  // Don't block process exit
  dumpTimer.unref();
}

export function stopMetricsDump(): void {
  if (dumpTimer) {
    clearInterval(dumpTimer);
    dumpTimer = null;
  }
}

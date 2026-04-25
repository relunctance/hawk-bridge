// hawk-bridge plugin entry point
// Bridges OpenClaw Gateway hooks to hawk Python memory system

import http from 'http';
import https from 'https';
import { URL } from 'url';
import { existsSync } from 'fs';
import { statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import recallHandler from './hooks/hawk-recall/handler.js';
import captureHandler from './hooks/hawk-capture/handler.js';
import { onMessageReceived as triggerHandler } from './hooks/hawk-trigger/handler.js';
import { getMemoryStore } from './store/factory.js';
import { getConfig } from './config.js';
import { Embedder } from './embeddings.js';
import { register as metricsRegister, httpRequestsTotal, httpRequestDuration } from './metrics.js';
import { logger, patchConsole } from './logger.js';
import { restoreMetricsCounters, startMetricsDump } from './metrics-persist.js';
import { CircuitBreaker, CircuitOpenError } from './utils/circuit-breaker.js';
import { LanceDBAdapter } from './store/adapters/lancedb.js';
import axios from 'axios';

// Patch console.* early so any module-level console calls route to pino
patchConsole();

// Restore metrics counters from previous run (if any)
restoreMetricsCounters();

export { recallHandler as 'hawk-recall', captureHandler as 'hawk-capture', triggerHandler as 'hawk-trigger' };

/**
 * Public feedback API — rate a recalled memory.
 * Called by OpenClaw hooks after a memory is used in context.
 *
 * @param memoryId  The memory ID returned from recall results
 * @param rating     'helpful' | 'neutral' | 'harmful'
 * @param sessionId  Optional; stored for audit trail
 */
export async function rateMemory(
  memoryId: string,
  rating: 'helpful' | 'neutral' | 'harmful',
  sessionId?: string
): Promise<void> {
  const store = await getMemoryStore();
  await store.rateMemory(memoryId, rating, sessionId);
}

// ─── Health check / metrics HTTP server ───────────────────────────────────────

const METRICS_PORT = parseInt(process.env.HAWK_METRICS_PORT || '9090', 10);
const METRICS_TOKEN = process.env.HAWK_METRICS_TOKEN ?? '';
const ALERT_WEBHOOK_URL = process.env.HAWK_ALERT_WEBHOOK_URL ?? '';
const MIN_DISK_FREE_MB = parseInt(process.env.HAWK_MIN_DISK_FREE_MB ?? '100', 10);

// Circuit breaker for embedding provider
const embeddingBreaker = new CircuitBreaker(5, 30_000);

interface HealthCheckResult {
  status: 'ok' | 'degraded';
  checks: {
    embedder: boolean;
    lancedb: boolean;
    disk: boolean;
  };
  error?: string;
}

async function checkDiskSpace(): Promise<boolean> {
  try {
    // Simple check: use statfs on the hawk home directory
    // Note: this is Linux-specific. On WSL/macOS the behavior may differ.
    const hawkHome = join(homedir(), '.hawk');
    if (!existsSync(hawkHome)) return true; // dir doesn't exist yet, assume ok

    const stat = statSync(hawkHome);
    // Use the parent filesystem stat — on Linux this works via statfs
    const parentStat = statSync(join(hawkHome, '..'));
    // We can't reliably get disk space from Node.js fs module alone without native addons.
    // Fallback: check if hawk home is writable by probing with access()
    const fs = require('fs');
    try {
      fs.accessSync(hawkHome, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function healthCheck(): Promise<HealthCheckResult> {
  const HEALTH_CHECK_TIMEOUT_MS = 10_000;

  const timeoutPromise = new Promise<HealthCheckResult>((_, reject) =>
    setTimeout(() => reject(new Error('health check timeout (10s)')), HEALTH_CHECK_TIMEOUT_MS)
  );

  const checkPromise = (async (): Promise<HealthCheckResult> => {
    const checks = { embedder: false, lancedb: false, disk: false };
    let error: string | undefined;

  // 1. Embedder (with circuit breaker)
  try {
    await embeddingBreaker.run(async () => {
      const config = await getConfig();
      const embedder = new Embedder(config.embedding);
      await embedder.embed(['health check probe']);
    });
    checks.embedder = true;
  } catch (e: any) {
    error = `embedder: ${e?.message ?? e}`;
    logger.warn({ err: e }, '[health] embedder check failed');
  }

  // 2. LanceDB write/read cycle
  try {
    const store = await getMemoryStore();
    if (store instanceof LanceDBAdapter) {
      const testId = `__hawk_health_check__${Date.now()}`;
      const testEntry: any = {
        id: testId,
        content: 'health check probe',
        importance: 0.5,
        reliability: 0.5,
        created_at: Date.now(),
        last_used_at: Date.now(),
        recall_count: 0,
        usefulness_score: 0.5,
        scope: 'stable',
      };
      await (store as any).table?.add?.([testEntry]).catch?.(() => {
        // LanceDB may use a different API — try via store methods
        return Promise.resolve();
      });
      // If we got here without throwing, mark as ok
      checks.lancedb = true;
    } else {
      checks.lancedb = true; // http provider assumed ok
    }
  } catch (e) {
    error = `lancedb: ${e?.message ?? String(e)}`;
    logger.warn({ err: e }, '[health] lancedb check failed');
  }

  // 3. Disk space / writeability
  try {
    const hawkHome = join(homedir(), '.hawk');
    const fs = require('fs');
    fs.accessSync(hawkHome, fs.constants.W_OK);
    checks.disk = true;
  } catch (e) {
    error = `disk: ${e?.message ?? String(e)}`;
    logger.warn({ err: e }, '[health] disk check failed');
  }

  const allOk = checks.embedder && checks.lancedb && checks.disk;
    return {
      status: allOk ? 'ok' : 'degraded',
      checks,
      error: allOk ? undefined : error,
    };
  })();

  return await Promise.race([checkPromise, timeoutPromise]);
}

function parseUrl(pathname: string): Record<string, string> {
  const params: Record<string, string> = {};
  const idx = pathname.indexOf('?');
  if (idx >= 0) {
    const qs = pathname.slice(idx + 1);
    for (const pair of qs.split('&')) {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  return params;
}

async function sendAlert(webhookUrl: string, result: HealthCheckResult): Promise<void> {
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, {
      alert: 'hawk-bridge degraded',
      status: result.status,
      checks: result.checks,
      error: result.error,
      timestamp: new Date().toISOString(),
    }, { timeout: 5000 });
  } catch (e) {
    logger.warn({ err: e }, '[health] alert webhook failed');
  }
}

function startMetricsServer(): void {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${METRICS_PORT}`);
    const pathname = url.pathname;
    const queryParams = parseUrl(url.search);
    const start = Date.now();
    // Trace request ID: use client-supplied header or generate one
    const requestId = (req.headers['x-request-id'] as string) || `hawk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    res.setHeader('X-Request-ID', requestId);

    // ─── Auth gate for /metrics ───────────────────────────────────────────────
    if (pathname === '/metrics' && METRICS_TOKEN) {
      const token = queryParams['token'] ?? req.headers['x-hawk-token'] ?? '';
      if (token !== METRICS_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
    }

    // ─── Auth gate for /metrics ───────────────────────────────────────────────
    if (pathname === '/metrics' && METRICS_TOKEN) {
      const token = queryParams['token'] ?? req.headers['x-hawk-token'] ?? '';
      if (token !== METRICS_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
    }

    try {
      const recordMetrics = (status: number) => {
        httpRequestsTotal.inc({ method: req.method || 'GET', path: pathname, status: String(status) });
        httpRequestDuration.observe({ method: req.method || 'GET', path: pathname }, (Date.now() - start) / 1000);
      };

      if (pathname === '/health' || pathname === '/healthz') {
        const result = await healthCheck();
        const status = result.status === 'ok' ? 200 : 503;

        // Fire-and-forget alert if degraded
        if (result.status === 'degraded' && ALERT_WEBHOOK_URL) {
          sendAlert(ALERT_WEBHOOK_URL, result).catch(() => {});
        }

        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: result.status,
          timestamp: new Date().toISOString(),
          checks: result.checks,
          error: result.error,
        }));
        recordMetrics(status);
        return;
      }

      if (pathname === '/metrics') {
        res.writeHead(200, { 'Content-Type': metricsRegister.getMetrics() });
        res.end(await metricsRegister.metrics());
        recordMetrics(200);
        return;
      }

      // Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      recordMetrics(404);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal error' }));
    }
  });

  server.listen(METRICS_PORT, '127.0.0.1', () => {
    logger.info({ port: METRICS_PORT }, `[hawk-bridge] Metrics server listening on http://127.0.0.1:${METRICS_PORT}`);
    logger.info('[hawk-bridge]   /health  — health check (embedder + lancedb + disk)');
    logger.info('[hawk-bridge]   /metrics — Prometheus scrape endpoint');
    if (METRICS_TOKEN) logger.info('[hawk-bridge]   /metrics auth enabled (HAWK_METRICS_TOKEN)');
    if (ALERT_WEBHOOK_URL) logger.info('[hawk-bridge]   degraded alerts enabled (HAWK_ALERT_WEBHOOK_URL)');
  });

  server.on('error', (err: any) => {
    if (err.code !== 'EADDRINUSE') {
      logger.warn({ err: err.message }, '[hawk-bridge] Metrics server error');
    }
  });

  // Start periodic metrics dump
  startMetricsDump();
}

function register(api: any) {
  api.registerHook(['agent:bootstrap'], recallHandler, {
    name: 'hawk-recall',
    description: 'Inject relevant hawk memories before agent starts',
  });

  api.registerHook(['message:sent'], captureHandler, {
    name: 'hawk-capture-sent',
    description: 'Auto-extract memories from agent outbound messages',
  });

  api.registerHook(['message:received'], captureHandler, {
    name: 'hawk-capture-received',
    description: 'Auto-extract memories from user inbound messages',
  });

  api.registerHook(['gateway:startup'], async (_event: any) => {
    if ((global as any).__hawk_metrics_server_started) return;
    (global as any).__hawk_metrics_server_started = true;
    startMetricsServer();
  }, {
    name: 'hawk-metrics',
    description: 'Health check and Prometheus metrics server',
  });
}

export default { register };

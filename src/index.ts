// hawk-bridge plugin entry point
// Bridges OpenClaw Gateway hooks to hawk Python memory system

import http from 'http';
import https from 'https';
import { URL } from 'url';
import recallHandler from './hooks/hawk-recall/handler.js';
import captureHandler from './hooks/hawk-capture/handler.js';
import { getMemoryStore } from './store/factory.js';
import { getConfig } from './config.js';
import { Embedder } from './embeddings.js';
import { register as metricsRegister, httpRequestsTotal, httpRequestDuration } from './metrics.js';

export { recallHandler as 'hawk-recall', captureHandler as 'hawk-capture' };

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

async function healthCheck(): Promise<{ status: 'ok' | 'degraded'; error?: string }> {
  try {
    const config = await getConfig();
    const embedder = new Embedder(config.embedding);
    // Test with a cheap, short string
    await embedder.embed(['health check probe']);
    return { status: 'ok' };
  } catch (err) {
    return { status: 'degraded', error: 'embedding unavailable' };
  }
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

function startMetricsServer(): void {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${METRICS_PORT}`);
    const pathname = url.pathname;
    const start = Date.now();

    try {
      // Track metrics
      const recordMetrics = (status: number) => {
        httpRequestsTotal.inc({ method: req.method || 'GET', path: pathname, status: String(status) });
        httpRequestDuration.observe({ method: req.method || 'GET', path: pathname }, (Date.now() - start) / 1000);
      };

      if (pathname === '/health' || pathname === '/healthz') {
        const result = await healthCheck();
        const status = result.status === 'ok' ? 200 : 503;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: result.status,
          timestamp: new Date().toISOString(),
          error: result.error,
        }));
        recordMetrics(status);
        return;
      }

      if (pathname === '/metrics') {
        res.writeHead(200, { 'Content-Type': register.getMetrics() });
        res.end(await register.metrics());
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
    console.log(`[hawk-bridge] Metrics server listening on http://127.0.0.1:${METRICS_PORT}`);
    console.log(`[hawk-bridge]   /health  — health check`);
    console.log(`[hawk-bridge]   /metrics — Prometheus scrape endpoint`);
  });

  server.on('error', (err: any) => {
    // Only log if port is not already in use (ignore EADDRINUSE)
    if (err.code !== 'EADDRINUSE') {
      console.warn(`[hawk-bridge] Metrics server error: ${err.message}`);
    }
  });
}

function register(api: any) {
  api.registerHook(['agent:bootstrap'], recallHandler, {
    name: 'hawk-recall',
    description: 'Inject relevant hawk memories before agent starts',
  });

  // Internal hook: message:sent (outbound agent responses)
  api.registerHook(['message:sent'], captureHandler, {
    name: 'hawk-capture-sent',
    description: 'Auto-extract memories from agent outbound messages',
  });

  // Typed plugin hook: message_received (inbound user messages)
  // This is the hook that dispatchReplyFromConfig actually calls
  api.on('message_received', captureHandler, {
    name: 'hawk-capture-received',
    description: 'Auto-extract memories from user inbound messages',
  });

  // Start metrics/health server on gateway startup
  api.registerHook(['gateway:startup'], async (event: any) => {
    // Only start server once (in case of re-registration)
    if ((global as any).__hawk_metrics_server_started) return;
    (global as any).__hawk_metrics_server_started = true;
    startMetricsServer();
  }, {
    name: 'hawk-metrics',
    description: 'Health check and Prometheus metrics server',
  });
}

export default { register };

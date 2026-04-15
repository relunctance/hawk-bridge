/**
 * OpenTelemetry tracing for hawk-bridge.
 *
 * Enabled by HAWK_TRACING=1 and OTEL_EXPORTER_OTLP_ENDPOINT env vars.
 * When disabled or SDK not installed, all tracing calls become no-ops.
 *
 * Usage:
 *   import { tracer, withSpan } from './tracing.js';
 *   await withSpan('hawk-capture', async (span) => {
 *     span.setAttribute('conversation_id', id);
 *     // ... logic
 *   });
 */

let _tracer: any = null;
let _sdk: any = null;

// Try to load OTel packages — gracefully skip if not installed
try {
  const sdkPath = require.resolve('@opentelemetry/sdk-node');
  const apiPath = require.resolve('@opentelemetry/api');
  if (sdkPath && apiPath) {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const api = require('@opentelemetry/api');

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';

    _sdk = new NodeSDK({
      serviceName: 'hawk-bridge',
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    _tracer = api.trace.getTracer('hawk-bridge');
  }
} catch {
  // OTel packages not installed — tracing is a no-op
}

/**
 * Get the hawk-bridge tracer (or null if tracing disabled).
 */
export function tracer() {
  return _tracer;
}

/**
 * Run a callback inside a named span.
 * If tracing is disabled, just calls fn() directly.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: any) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  if (!_tracer) {
    return fn({}); // no-op span
  }

  return _tracer.startActiveSpan(name, async (span: any) => {
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        span.setAttribute(k, v);
      }
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: 0 }); // OK
      return result;
    } catch (e: any) {
      span.setStatus({ code: 2, message: e?.message }); // ERROR
      span.recordException(e);
      throw e;
    } finally {
      span.end();
    }
  });
}

/**
 * Start the OTel SDK. Call once at startup.
 */
export async function startTracing(): Promise<void> {
  if (_sdk) {
    try {
      _sdk.start();
      console.log('[tracing] OpenTelemetry SDK started');
    } catch (e) {
      console.warn('[tracing] Failed to start OTel SDK:', e);
    }
  }
}

/**
 * Shutdown the OTel SDK. Call on process exit.
 */
export async function stopTracing(): Promise<void> {
  if (_sdk) {
    try {
      await _sdk.shutdown();
    } catch {
      // ignore
    }
  }
}

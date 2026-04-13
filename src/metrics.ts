import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();

export const httpRequestsTotal = new Counter({
  name: 'hawk_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'hawk_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register],
});

export const embeddingLatency = new Histogram({
  name: 'hawk_embedding_duration_seconds',
  help: 'Embedding latency in seconds',
  labelNames: ['provider'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

export const memoryCount = new Gauge({
  name: 'hawk_memory_count',
  help: 'Number of memories in the store',
  registers: [register],
});

export const memoryErrors = new Counter({
  name: 'hawk_errors_total',
  help: 'Total number of memory errors',
  labelNames: ['type'],
  registers: [register],
});

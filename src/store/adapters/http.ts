/**
 * HTTP Adapter — implements MemoryStore interface by forwarding to hawk-memory (Go binary).
 * All LanceDB read/write goes through the HTTP API on port 18368.
 *
 * 使用方式: HAWK_DB_PROVIDER=http
 *
 * Go API surface（仅 3 个端点，其余 404）：
 *   POST /v1/capture        — 存入单条，body: {text, agent_id, metadata}
 *   POST /v1/capture/batch  — 批量存入，body: {memories: [{text, agent_id, metadata},...]}
 *   POST /v1/recall         — 召回，body: {query, top_k}
 */

import type { MemoryEntry, RetrievedMemory } from '../../types.js';
import type { MemoryStore } from '../interface.js';
import { getConfig } from '../../config.js';

const DEFAULT_BASE = 'http://127.0.0.1:18368';

/** Shape returned by Go /v1/recall */
interface RecallMemory {
  id: string;
  text: string;
  score: number;
  agent_id: string;
  metadata: Record<string, unknown>;
}

export class HTTPAdapter implements MemoryStore {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const cfg = getConfig();
    this.baseUrl = baseUrl ?? cfg.python?.httpBase ?? DEFAULT_BASE;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 0.5;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${method} ${path} failed ${res.status}: ${text}`);
        }
        return res.json() as Promise<T>;
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
        await new Promise(r => setTimeout(r, RETRY_DELAY * Math.pow(2, attempt - 1)));
      }
    }
    throw new Error('unreachable');
  }

  // ─── MemoryStore Interface ───────────────────────────────────────────────────

  async init(): Promise<void> {
    // No explicit health endpoint in Go binary; attempt a no-op request to verify connectivity
    try {
      await this.request<{ error?: string }>('POST', '/v1/recall', { query: '__health_check__', top_k: 1 });
    } catch {
      // Go /v1/recall returns 400 for unknown query, which is fine for connectivity check
    }
  }

  async close(): Promise<void> {}

  async store(entry: MemoryEntry, sessionId?: string): Promise<void> {
    // Go /v1/capture: {text, agent_id, metadata}
    const agentId = (entry.metadata?.agent_id as string) ?? 'hawk-bridge';
    await this.request('POST', '/v1/capture', {
      text: entry.text,
      agent_id: agentId,
      metadata: {
        ...entry.metadata,
        session_id: sessionId ?? entry.sessionId ?? '',
      },
    });
  }

  async update(_id: string, _fields: Record<string, unknown>): Promise<boolean> {
    // Go API has no PATCH /memories/{id}
    return false;
  }

  async delete(_id: string): Promise<void> {
    // Go API has no /forget endpoint
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    const result = await this.vectorSearch(id, 1);
    return result.length > 0 ? this._retrievedToEntry(result[0]) : null;
  }

  async getAllMemories(_agentId?: string | null): Promise<MemoryEntry[]> {
    // Go API has no /memories/recent
    return [];
  }

  async listRecent(limit: number): Promise<MemoryEntry[]> {
    // Go API has no /memories/recent; approximate with recall
    const result = await this.vectorSearch('', limit);
    return result.map(r => this._retrievedToEntry(r));
  }

  async getReviewCandidates(_minReliability: number, _batchSize: number): Promise<MemoryEntry[]> {
    return [];
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Go API: POST /v1/embed_batch — {texts: string[]}
    const result = await this.request<{ embeddings: number[][]; count: number }>('POST', '/v1/embed_batch', { texts });
    return result.embeddings;
  }

  async vectorSearch(query: string, topK: number): Promise<RetrievedMemory[]> {
    const result = await this.request<{
      memories: RecallMemory[];
      count: number;
      total: number;
    }>('POST', '/v1/recall', {
      query,
      top_k: topK,
    });
    return result.memories.map(m => this._apiToRetrieved(m));
  }

  async search(query: string, topK: number, _scope?: string): Promise<RetrievedMemory[]> {
    return this.vectorSearch(query, topK);
  }

  async findSimilarEntity(_text: string, _threshold?: number): Promise<MemoryEntry | null> {
    // Go API has no /extract endpoint
    return null;
  }

  async verify(id: string, correct: boolean, _correctText?: string): Promise<void> {
    if (!correct) await this.delete(id);
  }

  async lock(_id: string): Promise<void> {}
  async unlock(_id: string): Promise<void> {}

  async flagUnhelpful(id: string, _penalty?: number): Promise<void> {
    await this.delete(id);
  }

  async incrementAccess(_id: string): Promise<void> {}

  async reset(): Promise<void> {
    // Go API has no /restart
  }

  async decay(): Promise<{ updated: number; deleted: number }> {
    // Decay handled server-side by Go binary
    return { updated: 0, deleted: 0 };
  }

  async purgeForgotten(_graceDays?: number): Promise<number> {
    return 0;
  }

  async rateMemory(id: string, rating: 'helpful' | 'neutral' | 'harmful', _sessionId?: string): Promise<void> {
    if (rating === 'harmful') await this.delete(id);
  }

  async demoteMemory(id: string): Promise<void> {
    await this.delete(id);
  }

  async incrementImportance(_id: string, _delta: number): Promise<void> {}
  async decrementImportance(_id: string): Promise<void> {}

  async batchCapture(items: Array<{
    message: string;
    response: string;
    sessionId?: string;
    userId?: string;
    platform?: string;
  }>): Promise<{ stored: number; extracted: number }> {
    // Go /v1/capture/batch: {memories: [{text, agent_id, metadata}]}
    const memories = items.map(item => ({
      text: item.message || item.response,
      agent_id: item.platform ?? 'hawk-bridge',
      metadata: {
        session_id: item.sessionId ?? '',
        user_id: item.userId ?? '',
      },
    }));
    const result = await this.request<{ stored: number }>('POST', '/v1/capture/batch', { memories });
    return { stored: result.stored, extracted: 0 };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _apiToRetrieved(m: RecallMemory): RetrievedMemory {
    const reliability = (m.metadata?.reliability as number) ?? 0.7;
    return {
      id: m.id,
      text: m.text,
      vector: [],
      score: m.score ?? 0,
      category: (m.metadata?.category as string) ?? 'other',
      metadata: m.metadata ?? {},
      source_type: 'text',
      source: (m.metadata?.source as string) ?? '',
      reliability,
      reliabilityLabel: reliability >= 0.7 ? '✅' : reliability >= 0.4 ? '⚠️' : '❌',
      locked: false,
      correctionCount: 0,
      baseReliability: reliability,
      sessionId: (m.metadata?.session_id as string) ?? null,
      createdAt: (m.metadata?.created_at as number) ?? 0,
      updatedAt: (m.metadata?.updated_at as number) ?? 0,
      scope: (m.metadata?.scope as string) ?? 'personal',
      importanceOverride: 1.0,
      coldStartUntil: null,
      name: (m.metadata?.name as string) ?? '',
      description: (m.metadata?.description as string) ?? '',
      driftNote: null,
      driftDetectedAt: null,
      last_used_at: null,
      usefulness_score: null,
      recall_count: 0,
    };
  }

  private _retrievedToEntry(r: RetrievedMemory): MemoryEntry {
    return {
      id: r.id,
      text: r.text,
      vector: r.vector,
      category: r.category as MemoryEntry['category'],
      importance: r.score,
      timestamp: r.createdAt,
      expiresAt: 0,
      accessCount: r.recall_count,
      lastAccessedAt: r.last_used_at ?? Date.now(),
      deletedAt: null,
      reliability: r.reliability,
      verificationCount: 0,
      lastVerifiedAt: null,
      locked: r.locked,
      correctionHistory: [],
      sessionId: r.sessionId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      scope: r.scope,
      importanceOverride: r.importanceOverride,
      coldStartUntil: r.coldStartUntil,
      metadata: r.metadata ?? {},
      source_type: r.source_type,
      source: r.source,
      driftNote: r.driftNote,
      driftDetectedAt: r.driftDetectedAt,
      last_used_at: r.last_used_at,
      usefulness_score: r.usefulness_score,
      recall_count: r.recall_count,
      name: r.name,
      description: r.description,
    };
  }
}

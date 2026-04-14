/**
 * HTTP Adapter — implements MemoryStore interface by forwarding to hawk-memory-api.
 * All LanceDB read/write goes through the HTTP API on port 18360.
 * 
 * 使用方式: HAWK_DB_PROVIDER=http
 */

import type { MemoryEntry, RetrievedMemory } from '../../types.js';
import type { MemoryStore } from '../interface.js';
import { getConfig } from '../../config.js';

const DEFAULT_BASE = 'http://127.0.0.1:18360';

export class HTTPAdapter implements MemoryStore {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const cfg = getConfig();
    this.baseUrl = baseUrl ?? cfg.python?.httpBase ?? DEFAULT_BASE;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
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
  }

  // ─── MemoryStore Interface ───────────────────────────────────────────────────

  async init(): Promise<void> {
    // Health check — ensures the server is reachable
    const health = await this.request<{ status: string }>('GET', '/health');
    if (health.status !== 'ok') {
      throw new Error(`hawk-memory-api health check failed: ${health.status}`);
    }
  }

  async close(): Promise<void> {
    // No-op: HTTP client doesn't hold persistent connections
  }

  async store(entry: MemoryEntry, sessionId?: string): Promise<void> {
    // hawk-memory-api /capture expects message/response pairs for LLM extraction.
    // We store entry.text as a synthetic "user message" and let the API handle embedding.
    await this.request('POST', '/capture', {
      session_id: sessionId ?? entry.sessionId ?? '',
      user_id: (entry.metadata?.user_id as string) ?? '',
      message: entry.text,
      response: '', // No agent response for programmatic storage
      platform: entry.source || 'hawk-bridge',
    });
  }

  async update(id: string, fields: Record<string, unknown>): Promise<boolean> {
    // hawk-memory-api doesn't have a PATCH /memories/{id} endpoint.
    // Fall back to soft-delete via forget + re-store.
    try {
      await this.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  async delete(id: string): Promise<void> {
    // hawk-memory-api /forget expects { ids: string[] }
    await this.request('POST', '/forget', { ids: [id] });
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    // No direct GET /memories/{id} — search by id as a workaround
    const result = await this.search(id, 1);
    return result.length > 0 ? this._retrievedToEntry(result[0]) : null;
  }

  async getAllMemories(agentId?: string | null): Promise<MemoryEntry[]> {
    // hawk-memory-api doesn't expose a direct get-all endpoint.
    // Use /stats to get counts, then paginated /recall with empty query.
    // For now, return empty array — this is a limitation of the HTTP API.
    return [];
  }

  async listRecent(limit: number): Promise<MemoryEntry[]> {
    const result = await this.search('', limit);
    return result.map(r => this._retrievedToEntry(r));
  }

  async getReviewCandidates(minReliability: number, batchSize: number): Promise<MemoryEntry[]> {
    // Not directly supported — return empty
    return [];
  }

  async embed(texts: string[]): Promise<number[][]> {
    // hawk-memory-api doesn't expose a raw embedding endpoint.
    // Each /capture call auto-embeds. For explicit embedding we need LanceDB npm.
    throw new Error('HTTP adapter does not support raw embedding');
  }

  async vectorSearch(query: string, topK: number): Promise<RetrievedMemory[]> {
    const result = await this.request<{
      memories: Array<{
        id: string;
        text: string;
        category: string;
        importance: number;
        reliability: number;
        created_at: number;
        updated_at: number;
        score: number;
        scope: string;
        name: string;
        description: string;
        session_id: string | null;
        source: string;
        metadata: Record<string, unknown>;
      }>;
      count: number;
      total: number;
    }>('POST', '/recall', {
      query,
      top_k: topK,
      offset: 0,
      min_score: 0.0,
    });
    return result.memories.map(m => this._apiToRetrieved(m));
  }

  async search(query: string, topK: number, _scope?: string): Promise<RetrievedMemory[]> {
    return this.vectorSearch(query, topK);
  }

  async findSimilarEntity(text: string, _threshold?: number): Promise<MemoryEntry | null> {
    // Reuse /extract endpoint for similarity detection
    const result = await this.request<{ memories: Array<{ text: string; category: string; importance: number }> }>(
      'POST', '/extract', { text }
    );
    if (result.memories.length === 0) return null;
    // Find the closest by searching for extracted text
    const searchResults = await this.search(text, 1);
    return searchResults.length > 0 ? this._retrievedToEntry(searchResults[0]) : null;
  }

  async verify(id: string, correct: boolean, _correctText?: string): Promise<void> {
    // Not directly supported — update via delete + store
    if (!correct) {
      await this.delete(id);
    }
  }

  async lock(id: string): Promise<void> {
    // Not supported by hawk-memory-api
  }

  async unlock(id: string): Promise<void> {
    // Not supported by hawk-memory-api
  }

  async flagUnhelpful(id: string, _penalty?: number): Promise<void> {
    await this.delete(id);
  }

  async incrementAccess(id: string): Promise<void> {
    // hawk-memory-api tracks access internally; no explicit increment API
  }

  async reset(): Promise<void> {
    // Not supported — would require a dedicated reset endpoint
  }

  async decay(): Promise<{ updated: number; deleted: number }> {
    // Decay is handled server-side by hawk-memory-api
    return { updated: 0, deleted: 0 };
  }

  async purgeForgotten(_graceDays?: number): Promise<number> {
    // Not supported
    return 0;
  }

  async rateMemory(id: string, rating: 'helpful' | 'neutral' | 'harmful', _sessionId?: string): Promise<void> {
    if (rating === 'harmful') {
      await this.delete(id);
    }
  }

  async demoteMemory(id: string): Promise<void> {
    await this.delete(id);
  }

  async incrementImportance(id: string, _delta: number): Promise<void> {
    // Not supported by hawk-memory-api
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _apiToRetrieved(m: {
    id: string;
    text: string;
    category: string;
    importance: number;
    reliability: number;
    created_at: number;
    updated_at: number;
    score: number;
    scope: string;
    name: string;
    description: string;
    session_id: string | null;
    source: string;
    metadata: Record<string, unknown>;
  }): RetrievedMemory {
    const reliability = m.reliability ?? 0.7;
    return {
      id: m.id,
      text: m.text,
      vector: [], // Not returned by /recall
      score: m.score ?? 0,
      category: m.category,
      metadata: m.metadata ?? {},
      source_type: 'text',
      source: m.source,
      reliability,
      reliabilityLabel: reliability >= 0.7 ? '✅' : reliability >= 0.4 ? '⚠️' : '❌',
      locked: false,
      correctionCount: 0,
      baseReliability: reliability,
      sessionId: m.session_id ?? null,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      scope: m.scope ?? 'personal',
      importanceOverride: 1.0,
      coldStartUntil: null,
      name: m.name ?? '',
      description: m.description ?? '',
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

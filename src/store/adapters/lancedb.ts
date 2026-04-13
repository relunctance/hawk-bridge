// LanceDB adapter — implements MemoryStore interface
// Migrated from ../lancedb.ts (formerly HawkDB)

import * as path from 'path';
import * as os from 'os';
import type { SourceType, MemoryEntry, RetrievedMemory } from '../../types.js';
import { Embedder } from '../../embeddings.js';
import { getConfig } from '../../config.js';
import {
  BM25_QUERY_LIMIT, DEFAULT_EMBEDDING_DIM, INITIAL_RELIABILITY, FORGET_GRACE_DAYS,
  RELIABILITY_BOOST_CONFIRM, RELIABILITY_PENALTY_CORRECT,
  RECENCY_GRACE_DAYS, RECENCY_DECAY_RATE, RECENCY_FACTOR_FLOOR,
  CONSISTENCY_MAX, CORRECTION_PENALTY_MULTIPLIER,
  DECAY_RATE_HIGH_RELIABILITY, DECAY_RATE_MEDIUM_RELIABILITY, DECAY_RATE_LOW_RELIABILITY,
  ENTITY_DEDUP_THRESHOLD, COLD_START_GRACE_DAYS, COLD_START_DECAY_MULTIPLIER, CONFLICT_SIMILARITY_THRESHOLD,
  TIER_PERMANENT_MIN_SCORE, TIER_STABLE_MIN_SCORE, TIER_DECAY_MIN_SCORE,
  RECENCY_HALF_LIFE_MS, WEIGHT_BASE, WEIGHT_USEFULNESS, WEIGHT_RECENCY, ACCESS_BONUS_MAX,
} from '../../constants.js';
import type { MemoryStore } from '../interface.js';

const TABLE_NAME = 'hawk_memories';

export class LanceDBAdapter implements MemoryStore {
  private db: any = null;
  private table: any = null;
  private dbPath: string;
  private embedder: Embedder | null = null;

  constructor(dbPath?: string) {
    const home = os.homedir();
    this.dbPath = dbPath ?? path.join(home, '.hawk', 'lancedb');
  }

  async init(): Promise<void> {
    try {
      const lancedb = await import('@lancedb/lancedb');
      this.db = await lancedb.connect(this.dbPath);

      const tableNames = await this.db.tableNames();
      if (!tableNames.includes(TABLE_NAME)) {
        const { makeArrowTable } = lancedb;
        const sampleRow = this._makeRow({
          id: '__init__',
          text: '__init__',
          vector: new Float32Array(0),
          category: 'fact',
          scope: 'system',
          importance: 0,
          timestamp: Date.now(),
          expires_at: 0,
          created_at: Date.now(),
          access_count: 0,
          last_accessed_at: Date.now(),
          deleted_at: null,
          reliability: 0.5,
          verification_count: 0,
          last_verified_at: null,
          locked: false,
          correction_history: '[]',
          session_id: null,
          updated_at: Date.now(),
          scope_mem: 'personal',
          importance_override: 1.0,
          cold_start_until: null,
          metadata: '{}',
          source_type: 'text',
          source: '',
          drift_note: null,
          drift_detected_at: null,
          last_used_at: null,
          usefulness_score: 0.5,
          recall_count: 0,
          name: '__init__',
          description: '__init__',
        });
        const table = makeArrowTable([sampleRow]);
        this.table = await this.db.createTable(TABLE_NAME, table);
        await this.table.delete(`id = '__init__'`);

        // Create FTS index on text column for full-text search
        try {
          const { Index } = await import('@lancedb/lancedb');
          await this.table.createIndex('text', Index.fts());
        } catch (err: any) {
          console.warn(`[hawk-bridge] FTS index creation failed (non-fatal): ${err?.message}`);
        }
      } else {
        this.table = await this.db.openTable(TABLE_NAME);
        try {
          await this.table.alterAddColumns([
            { name: 'expires_at', type: { type: 'int64' } },
            { name: 'created_at', type: { type: 'int64' } },
            { name: 'source_type', type: { type: 'utf8' } },
            { name: 'deleted_at', type: { type: 'int64' } },
            { name: 'reliability', type: { type: 'float' } },
            { name: 'verification_count', type: { type: 'int32' } },
            { name: 'last_verified_at', type: { type: 'int64' } },
            { name: 'locked', type: { type: 'int8' } },
            { name: 'correction_history', type: { type: 'utf8' } },
            { name: 'session_id', type: { type: 'utf8' } },
            { name: 'updated_at', type: { type: 'int64' } },
            { name: 'scope_mem', type: { type: 'utf8' } },
            { name: 'importance_override', type: { type: 'float' } },
            { name: 'cold_start_until', type: { type: 'int64' } },
            { name: 'name', type: { type: 'utf8' } },
            { name: 'description', type: { type: 'utf8' } },
            { name: 'drift_note', type: { type: 'utf8' } },
            { name: 'drift_detected_at', type: { type: 'int64' } },
            { name: 'source', type: { type: 'utf8' } },
            { name: 'last_used_at', type: { type: 'int64' } },
            { name: 'usefulness_score', type: { type: 'float' } },
            { name: 'recall_count', type: { type: 'int32' } },
          ]);
        } catch (_) {
          // Columns may already exist — ignore
        }
      }
    } catch (err) {
      console.error('[hawk-bridge] LanceDB init failed:', err);
      throw err;
    }
  }

  async close(): Promise<void> {
    // LanceDB doesn't have a close method; connection is released when process exits
    this.db = null;
    this.table = null;
  }

  private _makeRow(data: {
    id: string;
    text: string;
    vector: Float32Array | number[];
    category: string;
    scope: string;
    importance: number;
    timestamp: number;
    expires_at: number;
    created_at: number;
    access_count: number;
    last_accessed_at: number;
    deleted_at: number | null;
    reliability: number;
    verification_count: number;
    last_verified_at: number | null;
    locked: boolean;
    correction_history: string;
    session_id: string | null;
    updated_at: number;
    scope_mem: 'personal' | 'team' | 'project';
    importance_override: number;
    cold_start_until: number | null;
    metadata: string;
    source_type: SourceType;
    source: string;
    drift_note: string | null;
    drift_detected_at: number | null;
    last_used_at?: number | null;
    usefulness_score?: number | null;
    recall_count?: number;
    name?: string;
    description?: string;
  }): any {
    const vec = data.vector.length > 0 ? Array.from(data.vector) : new Array(DEFAULT_EMBEDDING_DIM).fill(0);
    return {
      id: data.id,
      text: data.text,
      vector: vec,
      category: data.category,
      scope: data.scope,
      importance: data.importance,
      timestamp: BigInt(data.timestamp),
      expires_at: BigInt(data.expires_at),
      created_at: BigInt(data.created_at),
      access_count: data.access_count,
      last_accessed_at: BigInt(data.last_accessed_at),
      // Note: BigInt(null) throws, so use BigInt(0) as placeholder for null timestamps
      deleted_at: BigInt(data.deleted_at ?? 0),
      reliability: data.reliability,
      verification_count: data.verification_count,
      last_verified_at: BigInt(data.last_verified_at ?? 0),
      locked: data.locked ? 1 : 0,
      correction_history: data.correction_history,
      // Use empty string for null session_id to avoid schema inference failure in makeArrowTable
      session_id: data.session_id ?? '',
      // Use ?? 0 to handle undefined (init sample row doesn't set this field)
      updated_at: BigInt(data.updated_at ?? 0),
      // Default to 'personal' if not provided (init sample row doesn't set scope_mem)
      scope_mem: data.scope_mem || 'personal',
      importance_override: data.importance_override,
      // Use BigInt(0) for null cold_start_until (LanceDB makeArrowTable can't infer null BigInt)
      cold_start_until: BigInt(data.cold_start_until ?? 0),
      metadata: data.metadata,
      source_type: data.source_type,
      source: data.source,
      // Use empty string for null drift_note (LanceDB makeArrowTable can't infer null)
      drift_note: data.drift_note ?? '',
      drift_detected_at: BigInt(data.drift_detected_at ?? 0),
      last_used_at: BigInt(data.last_used_at ?? 0),
      // Use 0.0 for null usefulness_score
      usefulness_score: data.usefulness_score ?? 0.0,
      recall_count: data.recall_count ?? 0,
    };
  }

  private computeEffectiveReliability(
    base: number,
    verificationCount: number,
    lastVerifiedAt: number | null,
    correctionCount: number
  ): number {
    let recencyFactor = 1.0;
    if (lastVerifiedAt !== null) {
      const daysSince = (Date.now() - lastVerifiedAt) / 86400000;
      if (daysSince > RECENCY_GRACE_DAYS) {
        const decayCycles = (daysSince - RECENCY_GRACE_DAYS) / RECENCY_GRACE_DAYS;
        recencyFactor = Math.max(RECENCY_FACTOR_FLOOR, Math.pow(RECENCY_DECAY_RATE, decayCycles));
      }
    }
    const confirmBoost = Math.min(1 + verificationCount * 0.05, CONSISTENCY_MAX);
    const correctionPenalty = Math.pow(CORRECTION_PENALTY_MULTIPLIER, correctionCount);
    const effective = base * recencyFactor * confirmBoost * correctionPenalty;
    return Math.max(0.0, Math.min(1.0, effective));
  }

  /**
   * Clamp helper.
   */
  private clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Value-driven importance score — single source of truth for memory "health".
   * Combines base importance, recency, usefulness, and recall frequency.
   *
   * score = base*0.4 + usefulness*0.3 + recency*0.2 + accessBonus
   * where accessBonus = min(log1p(recall_count)*0.05, 0.1)
   */
  computeEffectiveImportance(memory: MemoryEntry): number {
    const {
      importance,
      last_used_at,
      usefulness_score,
      recall_count,
    } = memory;

    const base = importance ?? 0.5;

    // Recency: exponential decay with 30-day half-life
    const recency = last_used_at
      ? Math.exp(-(Date.now() - last_used_at) / (RECENCY_HALF_LIFE_MS / Math.LN2))
      : 0;

    const usefulness = usefulness_score ?? 0.5;

    // Diminishing-returns bonus from recall count (log scale, capped)
    const accessBonus = Math.min(Math.log1p(recall_count ?? 0) * 0.05, ACCESS_BONUS_MAX);

    const score =
      base * WEIGHT_BASE +
      usefulness * WEIGHT_USEFULNESS +
      recency * WEIGHT_RECENCY +
      accessBonus;

    return this.clamp(score, 0, 1);
  }

  /**
   * Recompute the tier for a memory based on its effective importance score.
   */
  recomputeTier(memory: MemoryEntry): string {
    const score = this.computeEffectiveImportance(memory);

    if (score >= TIER_PERMANENT_MIN_SCORE && (memory.recall_count ?? 0) >= 3) {
      return 'permanent';
    }
    if (score >= TIER_STABLE_MIN_SCORE) {
      return 'stable';
    }
    if (score >= TIER_DECAY_MIN_SCORE) {
      return 'decay';
    }
    return 'archived';
  }

  /**
   * Run tier maintenance at startup: recompute effective importance and tier
   * for all memories. Tier changes are persisted back to the DB.
   * Called once per startup (not on every access) for performance.
   */
  async runTierMaintenance(): Promise<{ updated: number }> {
    if (!this.table) await this.init();

    const memories = await this.getAllMemories();
    let updated = 0;

    for (const memory of memories) {
      if (memory.locked) continue;

      const newScore = this.computeEffectiveImportance(memory);
      const oldTier = memory.scope;
      const newTier = this.recomputeTier(memory);

      if (oldTier !== newTier || Math.abs(memory.importance - newScore) > 0.001) {
        try {
          await this.table.update(
            {
              scope: newTier,
              importance: String(newScore),
              updated_at: String(Date.now()),
            },
            { where: `id = '${memory.id.replace(/'/g, "''")}'` }
          );
          updated++;
        } catch { /* ignore */ }
      }
    }

    return { updated };
  }

  private _rowToMemory(r: any): MemoryEntry {
    const correctionHistory: Array<{ ts: number; oldText: string; newText: string }> =
      typeof r.correction_history === 'string'
        ? JSON.parse(r.correction_history || '[]')
        : (r.correction_history || []);
    return {
      id: r.id,
      text: r.text,
      vector: r.vector || [],
      category: r.category,
      importance: r.importance,
      timestamp: Number(r.timestamp),
      expiresAt: Number(r.expires_at || 0),
      accessCount: r.access_count,
      lastAccessedAt: Number(r.last_accessed_at),
      deletedAt: r.deleted_at !== null ? Number(r.deleted_at) : null,
      reliability: r.reliability ?? INITIAL_RELIABILITY,
      verificationCount: r.verification_count ?? 0,
      lastVerifiedAt: r.last_verified_at !== null ? Number(r.last_verified_at) : null,
      locked: r.locked === 1,
      correctionHistory,
      sessionId: r.session_id ?? null,
      createdAt: Number(r.created_at ?? Date.now()),
      updatedAt: Number(r.updated_at ?? Date.now()),
      scope: (r.scope ?? r.scope_mem ?? 'personal') as string,
      importanceOverride: r.importance_override ?? 1.0,
      coldStartUntil: r.cold_start_until !== null ? Number(r.cold_start_until) : null,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      source_type: (r.source_type || 'text') as SourceType,
      name: r.name ?? '',
      description: r.description ?? '',
      driftNote: r.drift_note ?? null,
      driftDetectedAt: r.drift_detected_at !== null ? Number(r.drift_detected_at) : null,
      source: r.source ?? '',
      last_used_at: Number(r.last_used_at ?? 0),
      usefulness_score: r.usefulness_score ?? 0.5,
      recall_count: r.recall_count ?? 0,
    };
  }

  private _rowToRetrieved(r: any, score: number, matchReason?: string): RetrievedMemory {
    const base = r.reliability ?? INITIAL_RELIABILITY;
    const correctionHistory: Array<{ ts: number; oldText: string; newText: string }> =
      typeof r.correction_history === 'string'
        ? JSON.parse(r.correction_history || '[]')
        : (r.correction_history || []);
    const correctionCount = correctionHistory.length;
    const effective = this.computeEffectiveReliability(
      base,
      r.verification_count ?? 0,
      r.last_verified_at !== null ? Number(r.last_verified_at) : null,
      correctionCount
    );
    return {
      id: r.id,
      text: r.text,
      score,
      category: r.category,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      source_type: (r.source_type || 'text') as SourceType,
      reliability: effective,
      reliabilityLabel: effective >= 0.7 ? '✅' : effective >= 0.4 ? '⚠️' : '❌',
      locked: r.locked === 1,
      correctionCount,
      baseReliability: base,
      sessionId: r.session_id ?? null,
      createdAt: Number(r.created_at ?? Date.now()),
      updatedAt: Number(r.updated_at ?? Date.now()),
      scope: (r.scope ?? r.scope_mem ?? 'personal') as string,
      importanceOverride: r.importance_override ?? 1.0,
      coldStartUntil: r.cold_start_until !== null ? Number(r.cold_start_until) : null,
      matchReason: matchReason,
      name: r.name ?? '',
      description: r.description ?? '',
      driftNote: r.drift_note ?? null,
      driftDetectedAt: r.drift_detected_at !== null ? Number(r.drift_detected_at) : null,
      source: r.source ?? '',
      last_used_at: r.last_used_at !== null ? Number(r.last_used_at) : null,
      usefulness_score: r.usefulness_score ?? null,
      recall_count: r.recall_count ?? 0,
    };
  }

  // ─── MemoryStore Interface Implementation ───────────────────────────────────

  async store(entry: MemoryEntry, sessionId?: string): Promise<void> {
    if (!this.table) await this.init();
    const now = Date.now();
    const correctionHistory = entry.correctionHistory ?? [];
    const scope2 = ((entry as any).scope_mem ?? entry.scope ?? 'personal') as 'personal' | 'team' | 'project';
    const coldStartUntil = entry.coldStartUntil ?? (now + COLD_START_GRACE_DAYS * 86400000);
    const row = this._makeRow({
      id: entry.id,
      text: entry.text,
      name: entry.name || '',
      description: entry.description || '',
      vector: entry.vector,
      category: entry.category,
      scope: entry.scope ?? 'global',
      importance: entry.importance,
      timestamp: entry.timestamp,
      expires_at: entry.expiresAt || 0,
      created_at: now,
      access_count: entry.accessCount ?? 0,
      last_accessed_at: entry.lastAccessedAt ?? now,
      deleted_at: entry.deletedAt ?? null,
      reliability: entry.reliability ?? INITIAL_RELIABILITY,
      verification_count: entry.verificationCount ?? 0,
      last_verified_at: entry.lastVerifiedAt ?? null,
      locked: entry.locked ?? false,
      correction_history: JSON.stringify(correctionHistory),
      session_id: sessionId ?? entry.sessionId ?? null,
      updated_at: now,
      scope_mem: scope2,
      importance_override: entry.importanceOverride ?? 1.0,
      cold_start_until: coldStartUntil,
      metadata: JSON.stringify(entry.metadata || {}),
      source_type: entry.source_type || 'text',
      source: entry.source || '',
      drift_note: entry.driftNote || null,
      drift_detected_at: entry.driftDetectedAt || null,
      last_used_at: entry.last_used_at ?? null,
      usefulness_score: entry.usefulness_score ?? null,
      recall_count: entry.recall_count ?? 0,
    });
    await this.table.add([row]);
  }

  async update(id: string, fields: Record<string, any>): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      const existing = await this.getById(id);
      if (!existing) return false;
      await this.table.delete(`id = '${id.replace(/'/g, "''")}'`);
      const updated: MemoryEntry = {
        ...existing,
        text: fields.text ?? existing.text,
        name: fields.name ?? existing.name,
        description: fields.description ?? existing.description,
        category: fields.category ?? existing.category,
        scope: fields.scope ?? existing.scope,
        importance: fields.importance ?? existing.importance,
        importanceOverride: fields.importanceOverride ?? existing.importanceOverride,
        updatedAt: Date.now(),
        vector: existing.vector,
        driftNote: fields.driftNote ?? existing.driftNote,
        driftDetectedAt: fields.driftDetectedAt ?? existing.driftDetectedAt,
      };
      await this.store(updated, existing.sessionId ?? undefined);
      return true;
    } catch { return false; }
  }

  async delete(id: string): Promise<void> {
    // Soft delete via forget
    await this.forget(id);
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    if (!this.table) await this.init();
    try {
      const rows = await this.table.query().where(`id = '${id.replace(/'/g, "''")}'`).limit(1).toArray();
      if (!rows.length) return null;
      const r = rows[0];
      if (r.deleted_at !== null) return null;
      return this._rowToMemory(r);
    } catch { return null; }
  }

  /** Returns DB stats: memory count, total size in MB, directory path */
  async getDBStats(): Promise<{ count: number; sizeMB: number; path: string }> {
    if (!this.table) await this.init();
    const all = await this.table.query().limit(100000).toArray();
    const count = all.filter((r: any) => r.deleted_at === null).length;

    let sizeMB = 0;
    try {
      const sizeBytes = await this._dirSize(this.dbPath);
      sizeMB = sizeBytes / (1024 * 1024);
    } catch { /* non-critical */ }

    return { count, sizeMB, path: this.dbPath };
  }

  private async _dirSize(dirPath: string): Promise<number> {
    const fs2 = await import('fs/promises');
    let total = 0;
    try {
      const entries = await fs2.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += await this._dirSize(full);
        } else {
          const stat = await fs2.stat(full);
          total += stat.size;
        }
      }
    } catch { /* ignore */ }
    return total;
  }

  async getAllMemories(agentId?: string | null): Promise<MemoryEntry[]> {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toArray();
    return rows
      .filter((r: any) => r.deleted_at === null)
      .filter((r: any) => {
        if (!agentId) return true;
        const owner = (r.metadata?.owner_agent ?? r.metadata?.ownerAgent) ?? null;
        return owner === null || owner === agentId;
      })
      .map((r: any) => this._rowToMemory(r));
  }

  async listRecent(limit: number = 10): Promise<MemoryEntry[]> {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(limit * 2).toArray();
    return rows
      .filter((r: any) => r.deleted_at === null)
      .slice(0, limit)
      .map((r: any) => this._rowToMemory(r));
  }

  async getReviewCandidates(minReliability: number = 0.5, batchSize: number = 5): Promise<MemoryEntry[]> {
    const all = await this.getAllMemories();
    return all
      .filter(m => !m.locked && m.reliability < minReliability)
      .sort((a, b) => a.reliability - b.reliability)
      .slice(0, batchSize);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.embedder) {
      const config = await getConfig();
      this.embedder = new Embedder(config.embedding);
    }
    return this.embedder.embed(texts);
  }

  async vectorSearch(query: string, topK: number): Promise<RetrievedMemory[]> {
    if (!this.embedder) {
      const config = await getConfig();
      this.embedder = new Embedder(config.embedding);
    }
    const [queryVector] = await this.embedder.embed([query]);
    return this.search(queryVector, topK, 0.0);
  }

  async findSimilarEntity(text: string, threshold: number = ENTITY_DEDUP_THRESHOLD): Promise<MemoryEntry | null> {
    const all = await this.getAllMemories();
    const keywords = this._extractKeywords(text);
    let best: { m: MemoryEntry; score: number } | null = null;
    for (const m of all) {
      if (m.category !== 'entity') continue;
      const memKeywords = this._extractKeywords(m.text);
      const overlap = keywords.filter(k => memKeywords.includes(k)).length;
      const union = new Set([...keywords, ...memKeywords]).size;
      const score = union > 0 ? overlap / union : 0;
      if (!best || score > best.score) best = { m, score };
    }
    return best && best.score >= threshold ? best.m : null;
  }

  async verify(id: string, confirmed: boolean, correctedText?: string): Promise<void> {
    await this.verifyMemory(id, confirmed, correctedText);
  }

  async lock(id: string): Promise<void> {
    if (!this.table) await this.init();
    try {
      await this.table.update(
        { locked: '1' },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch { /* ignore */ }
  }

  async unlock(id: string): Promise<void> {
    if (!this.table) await this.init();
    try {
      await this.table.update(
        { locked: '0' },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch { /* ignore */ }
  }

  async flagUnhelpful(id: string, penalty: number = 0.05): Promise<void> {
    if (!this.table) await this.init();
    try {
      const mem = await this.getById(id);
      if (!mem) return;
      const newRel = Math.max(0, mem.reliability - penalty);
      const newVerifications = mem.verificationCount + 1;
      await this.table.update(
        { reliability: String(newRel), verification_count: String(newVerifications), last_verified_at: String(Date.now()) },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch { /* ignore */ }
  }

  async incrementAccess(id: string): Promise<void> {
    try {
      const current = await this._getAccessCount(id);
      const now = Date.now();
      await this.table.update(
        {
          access_count: String(current + 1),
          last_accessed_at: String(now),
          // Value-driven: track recall for tier computation
          last_used_at: String(now),
          recall_count: String(current + 1),
        },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch { /* ignore */ }
  }

  async decay(): Promise<{ updated: number; deleted: number }> {
    if (!this.table) await this.init();

    const ARCHIVE_TTL_DAYS = 180;

    function getDecayMultiplier(reliability: number): number {
      if (reliability >= 0.7) return DECAY_RATE_HIGH_RELIABILITY;
      if (reliability >= 0.4) return DECAY_RATE_MEDIUM_RELIABILITY;
      return DECAY_RATE_LOW_RELIABILITY;
    }

    const memories = await this.getAllMemories();
    let updated = 0;
    let deleted = 0;
    const now = Date.now();

    for (const m of memories) {
      if (m.locked) continue;
      if (m.coldStartUntil && now < m.coldStartUntil) {
        const daysInGrace = Math.ceil((m.coldStartUntil - now) / 86400000);
        if (daysInGrace > 1) {
          const newImportance = m.importance * Math.pow(COLD_START_DECAY_MULTIPLIER, 0.5);
          if (Math.abs(newImportance - m.importance) > 0.001) {
            try {
              await this.table.update(
                { importance: String(newImportance) },
                { where: `id = '${m.id.replace(/'/g, "''")}'` }
              );
              updated++;
            } catch { /* ignore */ }
          }
        }
        continue;
      }

      const daysIdle = Math.max(0, Math.floor((now - m.lastAccessedAt) / 86400000));

      // Handle both old tier name ('archive') and new ('archived') during migration
      if (m.scope === 'archived' || m.scope === 'archive') {
        if (daysIdle > ARCHIVE_TTL_DAYS) {
          try {
            await this.table.delete(`id = '${m.id.replace(/'/g, "''")}'`);
            deleted++;
          } catch { /* ignore */ }
        }
        continue;
      }

      // Value-driven: use recomputeTier() for tier decisions instead of time-only computeLayer()
      if (daysIdle > 0) {
        const decayMultiplier = getDecayMultiplier(m.reliability);
        const effectiveDays = Math.ceil(daysIdle * decayMultiplier);
        const newImportance = m.importance * Math.pow(0.95, effectiveDays);
        // Compute prospective tier with the decayed importance
        const prospectiveMem = { ...m, importance: newImportance };
        const newTier = this.recomputeTier(prospectiveMem);

        if (newTier !== m.scope) {
          try {
            await this.table.update(
              { importance: String(newImportance), scope: newTier, updated_at: String(Date.now()) },
              { where: `id = '${m.id.replace(/'/g, "''")}'` }
            );
            updated++;
          } catch { /* ignore */ }
        } else if (Math.abs(newImportance - m.importance) > 0.001) {
          try {
            await this.table.update(
              { importance: String(newImportance) },
              { where: `id = '${m.id.replace(/'/g, "''")}'` }
            );
            updated++;
          } catch { /* ignore */ }
        }
      }
    }

    const purged = await this.purgeForgotten(FORGET_GRACE_DAYS);
    deleted += purged;

    try {
      await this.table?.trygc();
    } catch { /* non-critical */ }

    return { updated, deleted };
  }

  async purgeForgotten(graceDays: number = FORGET_GRACE_DAYS): Promise<number> {
    if (!this.table) await this.init();
    const cutoff = Date.now() - graceDays * 86400000;
    let deleted = 0;
    try {
      const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toArray();
      const toDelete = rows.filter((r: any) =>
        r.deleted_at !== null && Number(r.deleted_at) < cutoff
      );
      for (const r of toDelete) {
        try {
          await this.table.delete(`id = '${r.id.replace(/'/g, "''")}'`);
          deleted++;
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return deleted;
  }

  // ─── Additional HawkDB-compatible methods ────────────────────────────────────

  async ftsSearch(
    query: string,
    topK: number,
    scope?: string,
    sourceTypes?: SourceType[]
  ): Promise<RetrievedMemory[]> {
    if (!this.table) await this.init();

    let results = await this.table
      .search(query, 'fts')
      .limit(topK * 4)
      .toArray();

    results = results.filter((r: any) => r.deleted_at === null);

    if (scope) results = results.filter((r: any) => r.scope === scope);
    if (sourceTypes && sourceTypes.length > 0) {
      results = results.filter((r: any) => {
        const type = r.source_type || 'text';
        return sourceTypes.includes(type);
      });
    }

    const now = Date.now();
    results = results.filter((r: any) => {
      const expiresAt = Number(r.expires_at || 0);
      return expiresAt === 0 || expiresAt > now;
    });

    // LanceDB FTS returns _relevance score (higher = more relevant)
    const retrieved: RetrievedMemory[] = [];
    for (const row of results) {
      const score = row._relevance ?? 0;
      retrieved.push(this._rowToRetrieved(row, score));
      if (retrieved.length >= topK) break;
    }

    return retrieved;
  }

  async search(
    queryVector: number[],
    topK: number,
    minScore: number,
    scope?: string,
    sourceTypes?: SourceType[]
  ): Promise<RetrievedMemory[]> {
    if (!this.table) await this.init();

    let results = await this.table
      .search(queryVector)
      .limit(topK * 4)
      .toArray();

    results = results.filter((r: any) => r.deleted_at === null);

    if (scope) results = results.filter((r: any) => r.scope === scope);
    if (sourceTypes && sourceTypes.length > 0) {
      results = results.filter((r: any) => {
        const type = r.source_type || 'text';
        return sourceTypes.includes(type);
      });
    }

    const now = Date.now();
    results = results.filter((r: any) => {
      const expiresAt = Number(r.expires_at || 0);
      return expiresAt === 0 || expiresAt > now;
    });

    const retrieved: RetrievedMemory[] = [];
    for (const row of results) {
      const score = 1 - (row._distance ?? 0);
      if (score < minScore) continue;
      retrieved.push(this._rowToRetrieved(row, score));
      if (retrieved.length >= topK) break;
    }

    for (const r of retrieved) {
      await this.incrementAccess(r.id);
    }

    return retrieved;
  }

  async count(): Promise<number> {
    if (!this.table) await this.init();
    return await this.table.countRows();
  }

  async getAllTexts(): Promise<Array<{ id: string; text: string }>> {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toArray();
    return rows
      .filter((r: any) => r.deleted_at === null)
      .map((r: any) => ({ id: r.id, text: r.text }));
  }

  async getByIds(ids: string[]): Promise<Map<string, any>> {
    if (!this.table) await this.init();
    const results = new Map<string, any>();
    if (!ids.length) return results;
    try {
      const predicate = ids.map(id => `id = '${id.replace(/'/g, "''")}'`).join(' OR ');
      const rows = await this.table.query().where(predicate).limit(ids.length).toArray();
      for (const r of rows) {
        if (r.deleted_at !== null) continue;
        results.set(r.id, {
          id: r.id,
          text: r.text,
          vector: r.vector || [],
          category: r.category,
          scope: r.scope,
          importance: r.importance,
          timestamp: Number(r.timestamp),
          expiresAt: Number(r.expires_at || 0),
          deletedAt: r.deleted_at !== null ? Number(r.deleted_at) : null,
          reliability: r.reliability ?? INITIAL_RELIABILITY,
          verificationCount: r.verification_count ?? 0,
          lastVerifiedAt: r.last_verified_at !== null ? Number(r.last_verified_at) : null,
          locked: r.locked === 1,
          correctionHistory: typeof r.correction_history === 'string'
            ? JSON.parse(r.correction_history || '[]')
            : (r.correction_history || []),
          sessionId: r.session_id ?? null,
          createdAt: Number(r.created_at ?? Date.now()),
          updatedAt: Number(r.updated_at ?? Date.now()),
          metadata: JSON.parse(r.metadata || '{}'),
          source_type: (r.source_type || 'text') as SourceType,
          source: r.source ?? '',
          name: r.name ?? '',
          description: r.description ?? '',
          driftNote: r.drift_note ?? null,
          driftDetectedAt: r.drift_detected_at !== null ? Number(r.drift_detected_at) : null,
          last_used_at: Number(r.last_used_at ?? 0),
          usefulness_score: r.usefulness_score ?? 0.5,
          recall_count: r.recall_count ?? 0,
        });
      }
    } catch { /* ignore */ }
    return results;
  }

  async forget(id: string): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      const memory = await this.getById(id);
      if (!memory) return false;
      if (memory.locked) {
        console.log(`[hawk-bridge] Cannot forget locked memory: ${id}`);
        return false;
      }
      await this.table.update(
        { deleted_at: String(Date.now()) },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
      return true;
    } catch { return false; }
  }

  async verifyMemory(id: string, confirmed: boolean, correctedText?: string): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      const memory = await this.getById(id);
      if (!memory) return false;
      const now = Date.now();
      const newReliability = memory.locked
        ? memory.reliability
        : confirmed
          ? Math.min(1.0, memory.reliability + RELIABILITY_BOOST_CONFIRM)
          : Math.max(0.0, memory.reliability - RELIABILITY_PENALTY_CORRECT);
      const correctionHistory = [...(memory.correctionHistory || [])];
      if (!confirmed && correctedText) {
        correctionHistory.push({ ts: now, oldText: memory.text, newText: correctedText });
      }
      await this.table.update(
        {
          reliability: String(newReliability),
          verification_count: String(memory.verificationCount + 1),
          last_verified_at: String(now),
          correction_history: JSON.stringify(correctionHistory),
          ...(!confirmed && correctedText ? { text: String(correctedText) } : {}),
        },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
      return true;
    } catch { return false; }
  }

  async markImportant(id: string, multiplier: number = 2.0): Promise<boolean> {
    return this.update(id, { importanceOverride: multiplier });
  }

  async detectConflicts(newText: string, category: string): Promise<MemoryEntry[]> {
    const all = await this.getAllMemories();
    const sameCategory = all.filter(m => m.category === category);
    const newKeywords = this._extractKeywords(newText);
    const conflicts: MemoryEntry[] = [];
    for (const m of sameCategory) {
      const memKeywords = this._extractKeywords(m.text);
      const overlap = newKeywords.filter(k => memKeywords.includes(k)).length;
      const union = new Set([...newKeywords, ...memKeywords]).size;
      const similarity = union > 0 ? overlap / union : 0;
      if (similarity >= CONFLICT_SIMILARITY_THRESHOLD && similarity < 0.95) {
        const newWords = new Set(newKeywords);
        const oldWords = new Set(memKeywords);
        const diff = [...newWords].filter(w => !oldWords.has(w)).length +
                     [...oldWords].filter(w => !newWords.has(w)).length;
        if (diff > 2) conflicts.push(m);
      }
    }
    return conflicts;
  }

  private _extractKeywords(text: string): string[] {
    const stopWords = new Set(['的', '了', '是', '在', '和', '也', '有', '就', '不', '我', '你', '他', '她', '它', '们', '这', '那', '个', '与', '或', '被', '为', '上', '下', '来', '去']);
    const words: string[] = [];
    for (let i = 0; i < text.length - 1; i++) {
      const w2 = text.slice(i, i + 2);
      if (!stopWords.has(w2)) words.push(w2);
    }
    for (let i = 0; i < text.length - 2; i++) {
      const w3 = text.slice(i, i + 3);
      if (!stopWords.has(w3)) words.push(w3);
    }
    return [...new Set(words)];
  }

  private async _getAccessCount(id: string): Promise<number> {
    const rows = await this.table.query().where(`id = '${id.replace(/'/g, "''")}'`).limit(1).toArray();
    return rows.length ? Number(rows[0].access_count || 0) : 0;
  }


  // ─── Feedback Loop ─────────────────────────────────────────────────────────────

  /** Clamp a usefulness score change based on rating */
  private _clampUsefulness(current: number | null, rating: 'helpful' | 'neutral' | 'harmful'): number {
    const base = current ?? 0.5;
    if (rating === 'neutral') return base;
    if (rating === 'helpful') return Math.min(1.0, base + 0.1);
    // harmful
    return Math.max(0.0, base - 0.2);
  }

  async rateMemory(id: string, rating: 'helpful' | 'neutral' | 'harmful', _sessionId?: string): Promise<void> {
    if (!this.table) await this.init();
    const mem = await this.getById(id);
    if (!mem) return;

    const now = Date.now();
    const newUsefulness = this._clampUsefulness(mem.usefulness_score, rating);
    const newRecallCount = (mem.recall_count ?? 0) + 1;

    try {
      await this.table.update(
        {
          last_used_at: String(now),
          usefulness_score: String(newUsefulness),
          recall_count: String(newRecallCount),
          updated_at: String(now),
        },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch (e) {
      console.warn('[hawk-bridge] rateMemory update failed:', e);
      return;
    }

    if (rating === 'harmful') {
      await this.demoteMemory(id);
    } else if (rating === 'helpful') {
      await this.incrementImportance(id, 0.05);
    }
  }

  async demoteMemory(id: string): Promise<void> {
    if (!this.table) await this.init();
    // Move from any tier → 'decay' tier (faster eventual purge)
    try {
      await this.table.update(
        { scope: 'decay', scope_mem: 'decay' },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch (e) {
      console.warn('[hawk-bridge] demoteMemory failed:', e);
    }
  }

  async incrementImportance(id: string, delta: number): Promise<void> {
    if (!this.table) await this.init();
    const mem = await this.getById(id);
    if (!mem) return;
    const newImportance = Math.min(1.0, mem.importance + delta);
    try {
      await this.table.update(
        { importance: String(newImportance), updated_at: String(Date.now()) },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch (e) {
      console.warn('[hawk-bridge] incrementImportance failed:', e);
    }
  }

}
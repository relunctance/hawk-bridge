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
import { logger } from '../../logger.js';
import { memoryErrors } from '../../metrics.js';
import { fetchWithRetry } from '../../embeddings.js';

const TABLE_NAME = 'hawk_memories';

export class LanceDBAdapter implements MemoryStore {
  private db: any = null;
  private table: any = null;
  private dbPath: string;
  private embedder: Embedder | null = null;
  private config?: HawkConfig;

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
          vector: new Float32Array(DEFAULT_EMBEDDING_DIM),
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
          platform: 'hawk-bridge',
        });
        const table = makeArrowTable([sampleRow]);
        this.table = await this.db.createTable(TABLE_NAME, table);
        await this.table.delete(`id = '__init__'`);

        // Create FTS index on text column for full-text search
        try {
          const { Index } = await import('@lancedb/lancedb');
          await this.table.createIndex('text', Index.fts());
        } catch (err: any) {
          logger.warn({ err: err?.message }, 'FTS index creation failed (non-fatal)');
        }
      } else {
        this.table = await this.db.openTable(TABLE_NAME);

        // Ensure FTS index exists on the text column (idempotent — no-op if already indexed)
        try {
          const { Index } = await import('@lancedb/lancedb');
          await this.table.createIndex('text', Index.fts());
          logger.info('FTS index ensured on text column');
        } catch (err: any) {
          logger.warn({ err: err?.message }, 'FTS index creation failed (non-fatal, index may already exist)');
        }

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
            { name: 'platform', type: { type: 'utf8' } },
            { name: 'confidence', type: { type: 'float' } },
            { name: 'supersedes', type: { type: 'utf8' } },
            { name: 'supersededBy', type: { type: 'utf8' } },
            { name: 'generation_version', type: { type: 'int32' } },
          ]);
        } catch (_) {
          // Columns may already exist — ignore
        }
      }
    } catch (err) {
      logger.error({ err }, 'LanceDB init failed');
      throw err;
    }
  }

  async close(): Promise<void> {
    // LanceDB doesn't have a close method; connection is released when process exits
    this.db = null;
    this.table = null;
  }

  /**
   * Drop the table and clear the instance so the next operation will re-init
   * with the current DEFAULT_EMBEDDING_DIM. Used for dimension migration:
   *   HAWK_EMBEDDING_DIM=1024 hawk write --reinit
   */
  async reset(): Promise<void> {
    if (!this.db) {
      // DB not connected yet — nothing to reset
      return;
    }
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      await this.db.dropTable(TABLE_NAME);
      logger.info({ table: TABLE_NAME }, 'Dropped table');
    }
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
    confidence?: number;
    supersedes?: string | null;
    supersededBy?: string | null;
    drift_note: string | null;
    drift_detected_at: number | null;
    last_used_at?: number | null;
    usefulness_score?: number | null;
    recall_count?: number;
    name?: string;
    description?: string;
    platform?: string;
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
      deleted_at: BigInt(data.deleted_at ?? 0),
      reliability: data.reliability,
      verification_count: data.verification_count,
      last_verified_at: BigInt(data.last_verified_at ?? 0),
      locked: data.locked ? 1 : 0,
      correction_history: data.correction_history,
      session_id: data.session_id ?? '',
      updated_at: BigInt(data.updated_at ?? 0),
      scope_mem: data.scope_mem || 'personal',
      importance_override: data.importance_override,
      cold_start_until: BigInt(data.cold_start_until ?? 0),
      metadata: data.metadata,
      source_type: data.source_type,
      source: data.source,
      // confidence: 0.0 for non-inference memories
      confidence: data.confidence ?? 0.0,
      // Use empty string for null supersedes/supersededBy (LanceDB makeArrowTable can't infer null)
      supersedes: data.supersedes ?? '',
      supersededBy: data.supersededBy ?? '',
      drift_note: data.drift_note ?? '',
      drift_detected_at: BigInt(data.drift_detected_at ?? 0),
      last_used_at: BigInt(data.last_used_at ?? 0),
      usefulness_score: data.usefulness_score ?? 0.0,
      recall_count: data.recall_count ?? 0,
      platform: data.platform ?? 'hawk-bridge',
      generation_version: data.generation_version ?? 0,
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
      confidence: r.confidence ?? 0.0,
      supersedes: r.supersedes ? String(r.supersedes) : null,
      supersededBy: r.supersededBy ? String(r.supersededBy) : null,
      last_used_at: Number(r.last_used_at ?? 0),
      usefulness_score: r.usefulness_score ?? 0.5,
      recall_count: r.recall_count ?? 0,
      platform: r.platform ?? 'hawk-bridge',
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
      confidence: r.confidence ?? 0.0,
      supersedes: r.supersedes ? String(r.supersedes) : null,
      supersededBy: r.supersededBy ? String(r.supersededBy) : null,
      last_used_at: r.last_used_at !== null ? Number(r.last_used_at) : null,
      usefulness_score: r.usefulness_score ?? null,
      recall_count: r.recall_count ?? 0,
      platform: r.platform ?? 'hawk-bridge',
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
      confidence: (entry as any).confidence ?? 0.0,
      supersedes: (entry as any).supersedes ?? null,
      supersededBy: (entry as any).supersededBy ?? null,
      drift_note: entry.driftNote || null,
      drift_detected_at: entry.driftDetectedAt || null,
      last_used_at: entry.last_used_at ?? null,
      usefulness_score: entry.usefulness_score ?? null,
      recall_count: entry.recall_count ?? 0,
      platform: (entry as any).platform ?? entry.metadata?.platform ?? 'hawk-bridge',
    });
    await this.table.add([row]);
  }

  async update(id: string, fields: Record<string, unknown>): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      const where = `id = '${id.replace(/'/g, "''")}'`;

      // 直接 UPDATE，避免 getById → delete → store 导致的 vector 丢失
      const args: Record<string, string> = {};

      if (fields.text !== undefined) args['text'] = String(fields.text);
      if (fields.name !== undefined) args['name'] = String(fields.name);
      if (fields.description !== undefined) args['description'] = String(fields.description);
      if (fields.category !== undefined) args['category'] = String(fields.category);
      if (fields.scope !== undefined) {
        args['scope'] = String(fields.scope);
        args['scope_mem'] = String(fields.scope); // 保持 scope_mem 与 scope 一致
      }
      if (fields.importance !== undefined) args['importance'] = String(fields.importance);
      if (fields.importanceOverride !== undefined) {
        args['importance_override'] = String(fields.importanceOverride);
      }
      if (fields.driftNote !== undefined) {
        args['drift_note'] = fields.driftNote ? String(fields.driftNote) : '';
      }
      if (fields.driftDetectedAt !== undefined) {
        args['drift_detected_at'] = fields.driftDetectedAt ? String(fields.driftDetectedAt) : '';
      }
      if (fields.supersedes !== undefined) {
        args['supersedes'] = fields.supersedes ?? '';
      }
      if (fields.supersededBy !== undefined) {
        args['superseded_by'] = fields.supersededBy ?? '';
      }
      if (fields.confidence !== undefined) {
        args['confidence'] = String(fields.confidence);
      }

      // updated_at 总是更新
      args['updated_at'] = String(Date.now());

      if (Object.keys(args).length === 1 && 'updated_at' in args) {
        // 只有 updated_at，没有实际字段变更
        return true;
      }

      await this.table.update(args, { where });
      return true;
    } catch (err) {
      logger.warn({ err, id }, 'LanceDBAdapter.update failed');
      return false;
    }
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
      // Filter out superseded memories — only return the latest version
      .filter((r: any) => !r.superseded_by)
      .filter((r: any) => {
        if (!agentId) return true;
        const owner = (r.metadata?.owner_agent ?? r.metadata?.ownerAgent) ?? null;
        return owner === null || owner === agentId;
      })
      .map((r: any) => this._rowToMemory(r));
  }

  /**
   * Export all memories as plain MemoryEntry objects (not LanceDB rows).
   * Uses cursor-based pagination to handle large datasets.
   * Used for backup before re-initialization.
   */
  async exportAll(): Promise<MemoryEntry[]> {
    if (!this.table) await this.init();
    const all: MemoryEntry[] = [];
    let cursor: string | null = null;
    do {
      const { memories, nextCursor } = await this.getAllMemoriesPaginated(undefined, cursor ?? undefined);
      all.push(...memories);
      cursor = nextCursor;
    } while (cursor !== null);
    return all;
  }

  /**
   * Paginated getAllMemories — returns { memories, nextCursor }.
   * Fetches in batches of 1000.
   */
  async getAllMemoriesPaginated(agentId?: string | null, cursor?: string): Promise<{ memories: MemoryEntry[]; nextCursor: string | null }> {
    if (!this.table) await this.init();
    const BATCH = 1000;
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const rows = await this.table.query().limit(BATCH).offset(offset).toArray();
    const filtered = rows
      .filter((r: any) => r.deleted_at === null)
      .filter((r: any) => {
        if (!agentId) return true;
        const owner = (r.metadata?.owner_agent ?? r.metadata?.ownerAgent) ?? null;
        return owner === null || owner === agentId;
      })
      .map((r: any) => this._rowToMemory(r));
    const nextCursor = rows.length === BATCH ? String(offset + BATCH) : null;
    return { memories: filtered, nextCursor };
  }

  async listRecent(limit: number = 10): Promise<MemoryEntry[]> {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(limit * 2).toArray();
    return rows
      .filter((r: any) => r.deleted_at === null)
      .filter((r: any) => !r.superseded_by)
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
        // importanceOverride 用户手动放大/缩小重要性，decay 时必须参与计算
        const baseDecay = Math.pow(0.95, effectiveDays);
        const newImportance = m.importance * baseDecay * m.importanceOverride;
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
    minScore: number = 0,
    scope?: string,
    sourceTypes?: SourceType[],
    platform?: string,
  ): Promise<RetrievedMemory[]> {
    if (!this.table) await this.init();

    let results = await this.table
      .search(query, 'fts')
      .limit(topK * 4)
      .toArray();

    results = results.filter((r: any) => r.deleted_at === null);
    // 过滤已被替代的记忆，只返回最新版本
    results = results.filter((r: any) => !r.superseded_by);

    if (scope) results = results.filter((r: any) => r.scope === scope);
    if (sourceTypes && sourceTypes.length > 0) {
      results = results.filter((r: any) => {
        const type = r.source_type || 'text';
        return sourceTypes.includes(type);
      });
    }
    if (platform) {
      results = results.filter((r: any) => r.platform === platform);
    }

    const now = Date.now();
    results = results.filter((r: any) => {
      const expiresAt = Number(r.expires_at || 0);
      return expiresAt === 0 || expiresAt > now;
    });

    // LanceDB FTS 返回 _relevance score（越高越相关，类似 BM25）
    // minScore 对 FTS relevance 同样生效：低于阈值的直接过滤
    const retrieved: RetrievedMemory[] = [];
    for (const row of results) {
      const score = row._relevance ?? 0;
      if (score < minScore) continue;
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
    sourceTypes?: SourceType[],
    queryText?: string,
    platform?: string,
  ): Promise<RetrievedMemory[]> {
    if (!this.table) await this.init();

    let results = await this.table
      .search(queryVector)
      .limit(topK * 4)
      .toArray();

    results = results.filter((r: any) => r.deleted_at === null);
    // Filter out superseded memories — only return the latest version
    results = results.filter((r: any) => !r.superseded_by);

    if (scope) results = results.filter((r: any) => r.scope === scope);
    if (sourceTypes && sourceTypes.length > 0) {
      results = results.filter((r: any) => {
        const type = r.source_type || 'text';
        return sourceTypes.includes(type);
      });
    }
    if (platform) {
      results = results.filter((r: any) => r.platform === platform);
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

    // Apply reranking if configured
    const reranked = await this.rerankResults(queryText || '', retrieved);
    return reranked;
  }

  // ─── Reranking (cross-encoder) ────────────────────────────────────────────────

  /**
   * Rerank results using a cross-encoder if HAWK_RERANK=true and HAWK_RERANK_MODEL is set.
   * Calls Ollama base URL + /v1/rerank endpoint with {query, texts}.
   */
  private async rerankResults(
    query: string,
    results: RetrievedMemory[],
  ): Promise<RetrievedMemory[]> {
    const rerankEnabled = this.config?.recall?.rerankEnabled ?? process.env.HAWK_RERANK === 'true';
    const rerankModel = this.config?.recall?.rerankModel ?? process.env.HAWK_RERANK_MODEL;
    if (!rerankEnabled || !rerankModel || !query) return results;

    try {
      const baseURL = (this.config?.embedding?.baseURL ||
        process.env.OLLAMA_BASE_URL ||
        'http://localhost:11434').replace(/\/$/, '');
      const texts = results.map(r => r.text);
      const resp = await fetchWithRetry(`${baseURL}/v1/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, texts, model: rerankModel }),
      });
      if (!resp.ok) {
        logger.warn({ status: resp.status }, 'Rerank endpoint returned error, skipping rerank');
        return results;
      }
      const data = await resp.json() as any;
      // Expected: { results: [{ index, relevance_score }, ...] }
      if (!Array.isArray(data.results)) {
        logger.warn({ data }, 'Unexpected rerank response format, skipping');
        return results;
      }
      // Build score map
      const scoreMap = new Map<number, number>();
      for (const item of data.results) {
        scoreMap.set(item.index, item.relevance_score ?? 0);
      }
      // Re-sort results by rerank score
      const reranked = results
        .map((r, idx) => ({ r, score: scoreMap.get(idx) ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .map(({ r }) => r);
      logger.debug({ reranked: reranked.length }, 'Reranking applied');
      return reranked;
    } catch (err) {
      logger.warn({ err }, 'Reranking failed, returning original results');
      return results;
    }
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
          supersededBy: r.superseded_by ? String(r.superseded_by) : null,
          supersedes: r.supersedes ? String(r.supersedes) : null,
          generation_version: Number(r.generation_version ?? 0),
          confidence: r.confidence ?? 0.0,
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
        logger.warn({ memoryId: id }, 'Cannot forget locked memory');
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
      logger.warn({ err: e }, 'rateMemory update failed');
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
      logger.warn({ err: e, memoryId: id }, 'demoteMemory failed');
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
      logger.warn({ err: e, memoryId: id }, 'incrementImportance failed');
    }
  }

  async batchCapture(items: Array<{
    message: string;
    response: string;
    sessionId?: string;
    userId?: string;
    platform?: string;
  }>): Promise<{ stored: number; extracted: number }> {
    if (!this.table) await this.init();
    const config = await getConfig();
    const captureCfg = config.capture ?? {};
    const maxChunks = captureCfg.maxChunks ?? 3;
    const threshold = captureCfg.importanceThreshold ?? 0.5;

    // Parallel LLM extraction for all items
    const extractionResults = await Promise.allSettled(
      items.map(item => this._extractMemories(item.message, item.response, config))
    );

    let totalStored = 0;
    let totalExtracted = 0;

    for (const result of extractionResults) {
      if (result.status !== 'fulfilled') continue;
      const { memories } = result.value;

      for (const mem of memories) {
        if (mem.importance < threshold) continue;
        totalExtracted++;

        const now = Date.now();
        const entry: MemoryEntry = {
          id: crypto.randomUUID(),
          name: (mem as any).name ?? mem.text.slice(0, 80),
          description: (mem as any).description ?? mem.text.slice(0, 200),
          text: mem.text,
          vector: [], // Will be populated below
          category: mem.category,
          importance: mem.importance,
          timestamp: now,
          expiresAt: 0,
          accessCount: 0,
          lastAccessedAt: now,
          deletedAt: null,
          reliability: 0.5,
          verificationCount: 0,
          lastVerifiedAt: null,
          locked: false,
          correctionHistory: [],
          sessionId: null,
          createdAt: now,
          updatedAt: now,
          scope: 'personal',
          importanceOverride: 1.0,
          coldStartUntil: null,
          metadata: {},
          source_type: 'text',
          source: 'batch-capture',
          driftNote: null,
          driftDetectedAt: null,
          last_used_at: null,
          usefulness_score: null,
          recall_count: 0,
          platform: (mem as any).platform ?? 'hawk-bridge',
        };

        const [vector] = await this.embed([mem.text]);
        entry.vector = vector;
        await this.store(entry);
        totalStored++;
      }
    }

    logger.info({ items: items.length, extracted: totalExtracted, stored: totalStored }, 'batchCapture complete');
    return { stored: totalStored, extracted: totalExtracted };
  }

  /**
   * Extract memories from a conversation turn via LLM (subprocess mode).
   * Mirrors the logic from hawk-capture/handler.ts.
   */
  private async _extractMemories(
    message: string,
    response: string,
    config: any
  ): Promise<{ memories: Array<{ text: string; category: string; importance: number; name?: string; description?: string }> }> {
    const conversation = `用户: ${message}\n助手: ${response}`;

    const apiKey = config.llm?.apiKey || config.embedding?.apiKey || '';
    const model = config.llm?.model || 'MiniMax-M2.7';
    const provider = config.llm?.provider || 'openclaw';
    const baseURL = config.llm?.baseURL || '';

    // Build LLM prompt for extraction
    const prompt = `你是一个记忆提取助手。从以下对话中提取值得保存的记忆片段（事实、偏好、决定、实体等），用 JSON 格式返回。
返回格式：
{"memories":[{"text":"记忆内容","category":"fact|preference|decision|entity|other","importance":0.0-1.0,"name":"简短名称","description":"一句话描述"}]}

对话：
${conversation}

只返回 JSON，不要其他内容。`;

    try {
      const { fetchWithRetry: fetchRetry } = await import('../../embeddings.js');
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.1,
      });

      const response2 = await fetchRetry(
        `${baseURL}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body,
        },
        3
      );

      const data = await response2.json() as any;
      const content = data.choices?.[0]?.message?.content ?? '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { memories: Array.isArray(parsed.memories) ? parsed.memories : [] };
      }
    } catch (err) {
      logger.warn({ err }, 'batchCapture _extractMemories failed');
    }

    return { memories: [] };
  }

}
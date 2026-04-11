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
          metadata: '{}',
          source_type: 'text',
        });
        const table = makeArrowTable([sampleRow]);
        this.table = await this.db.createTable(TABLE_NAME, table);
        await this.table.delete(`id = '__init__'`);
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
      deleted_at: data.deleted_at !== null ? BigInt(data.deleted_at) : null,
      reliability: data.reliability,
      verification_count: data.verification_count,
      last_verified_at: data.last_verified_at !== null ? BigInt(data.last_verified_at) : null,
      locked: data.locked ? 1 : 0,
      correction_history: data.correction_history,
      session_id: data.session_id ?? null,
      updated_at: BigInt(data.updated_at),
      scope_mem: data.scope_mem,
      importance_override: data.importance_override,
      cold_start_until: data.cold_start_until !== null ? BigInt(data.cold_start_until) : null,
      metadata: data.metadata,
      source_type: data.source_type,
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
      scope: (r.scope_mem ?? 'personal') as 'personal' | 'team' | 'project',
      importanceOverride: r.importance_override ?? 1.0,
      coldStartUntil: r.cold_start_until !== null ? Number(r.cold_start_until) : null,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      source_type: (r.source_type || 'text') as SourceType,
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
      scope: (r.scope_mem ?? 'personal') as 'personal' | 'team' | 'project',
      importanceOverride: r.importance_override ?? 1.0,
      coldStartUntil: r.cold_start_until !== null ? Number(r.cold_start_until) : null,
      matchReason: matchReason,
    };
  }

  // ─── MemoryStore Interface Implementation ───────────────────────────────────

  async store(entry: MemoryEntry, sessionId?: string): Promise<void> {
    if (!this.table) await this.init();
    const now = Date.now();
    const correctionHistory = entry.correctionHistory ?? [];
    const scope2 = entry.scope ?? 'personal';
    const coldStartUntil = entry.coldStartUntil ?? (now + COLD_START_GRACE_DAYS * 86400000);
    const row = this._makeRow({
      id: entry.id,
      text: entry.text,
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
        category: fields.category ?? existing.category,
        scope: fields.scope ?? existing.scope,
        importance: fields.importance ?? existing.importance,
        importanceOverride: fields.importanceOverride ?? existing.importanceOverride,
        updatedAt: Date.now(),
        vector: existing.vector,
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
      await this.table.update(
        { access_count: String(current + 1), last_accessed_at: String(Date.now()) },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch { /* ignore */ }
  }

  async decay(): Promise<{ updated: number; deleted: number }> {
    if (!this.table) await this.init();

    const ARCHIVE_TTL_DAYS = 180;
    const IMPORTANCE_THRESHOLD_LOW = 0.3;
    const IMPORTANCE_THRESHOLD_HIGH = 0.8;
    const LAYER_THRESHOLDS = { working: 0, short: 3, long: 10, archive: 100 };
    const LAYERS = ['working', 'short', 'long', 'archive'];

    function computeLayer(importance: number, accessCount: number): string {
      if (accessCount >= LAYER_THRESHOLDS.long || importance >= IMPORTANCE_THRESHOLD_HIGH) return 'long';
      if (accessCount >= LAYER_THRESHOLDS.short || importance >= IMPORTANCE_THRESHOLD_HIGH * 0.75) return 'short';
      if (importance < IMPORTANCE_THRESHOLD_LOW) return 'archive';
      return 'working';
    }

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

      if (m.scope === 'archive') {
        if (daysIdle > ARCHIVE_TTL_DAYS) {
          try {
            await this.table.delete(`id = '${m.id.replace(/'/g, "''")}'`);
            deleted++;
          } catch { /* ignore */ }
        }
        continue;
      }

      if (daysIdle > 0) {
        const decayMultiplier = getDecayMultiplier(m.reliability);
        const effectiveDays = Math.ceil(daysIdle * decayMultiplier);
        const newImportance = m.importance * Math.pow(0.95, effectiveDays);
        const newLayer = computeLayer(newImportance, m.accessCount);

        if (LAYERS.indexOf(newLayer) < LAYERS.indexOf(m.scope as string)) {
          try {
            await this.table.update(
              { importance: String(newImportance), scope: newLayer },
              { where: `id = '${m.id.replace(/'/g, "''")}'` }
            );
            updated++;
          } catch { /* ignore */ }
        } else if (newImportance !== m.importance) {
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
}

// LanceDB wrapper for hawk-bridge
// Handles memory storage, retrieval, and schema management

import * as path from 'path';
import * as os from 'os';
import type { SourceType } from './types.js';

// Batch memory map type — avoids '>>' TypeScript parsing ambiguity in generic return types
type MemoryMap = Map<string, {
  id: string;
  text: string;
  vector: number[];
  category: string;
  scope: string;
  importance: number;
  timestamp: number;
  expiresAt: number;
  deletedAt: number | null;
  reliability: number;
  verificationCount: number;
  lastVerifiedAt: number | null;
  locked: boolean;
  correctionHistory: Array<{ ts: number; oldText: string; newText: string }>;
  metadata: Record<string, unknown>;
  source_type: SourceType;
}>;
import {
  BM25_QUERY_LIMIT, DEFAULT_EMBEDDING_DIM, INITIAL_RELIABILITY, FORGET_GRACE_DAYS,
  RELIABILITY_BOOST_CONFIRM, RELIABILITY_PENALTY_CORRECT,
  RECENCY_GRACE_DAYS, RECENCY_DECAY_RATE, RECENCY_FACTOR_FLOOR,
  CONSISTENCY_MAX, CORRECTION_PENALTY_MULTIPLIER,
  DECAY_RATE_HIGH_RELIABILITY, DECAY_RATE_MEDIUM_RELIABILITY, DECAY_RATE_LOW_RELIABILITY,
} from './constants.js';
import type { MemoryEntry, RetrievedMemory } from './types.js';

const TABLE_NAME = 'hawk_memories';

export class HawkDB {
  private db: any = null;
  private table: any = null;
  private dbPath: string;

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
        // Use makeArrowTable to create table with schema inferred from sample data
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
        // Remove the init row
        await this.table.delete(`id = '__init__'`);
      } else {
        this.table = await this.db.openTable(TABLE_NAME);
        // Migrate schema: add new columns if missing
        try {
          await this.table.alterAddColumns([
            { name: 'expires_at', type: { type: 'int64' } },
            { name: 'created_at', type: { type: 'int64' } },
            { name: 'source_type', type: { type: 'utf8' } },
            { name: 'deleted_at', type: { type: 'int64' } },
            { name: 'reliability', type: { type: 'float' } },
            { name: 'verification_count', type: { type: 'int32' } },
            { name: 'last_verified_at', type: { type: 'int64' } },
            { name: 'locked', type: { type: 'int8' } },         // 0=unlocked, 1=locked
            { name: 'correction_history', type: { type: 'utf8' } }, // JSON array
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
    correction_history: string; // JSON string
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
      metadata: data.metadata,
      source_type: data.source_type,
    };
  }

  /**
   * Internal: run a query and return all rows as plain objects
   * (LanceDB 0.26.x uses toArray(), not toList())
   */
  private async _queryAll(limit: number = BM25_QUERY_LIMIT): Promise<any[]> {
    const rows = await this.table.query().limit(limit).toArray();
    return rows;
  }

  /**
   * 计算有效可靠性（考虑时间衰减 + 一致性因子）
   * effective = base * recency_factor * consistency_factor
   *
   * recency_factor:
   *   - 30天内验证 → 1.0
   *   - 30天外 → RECENCY_DECAY_RATE^(days/30)
   *   - 下限 RECENCY_FACTOR_FLOOR
   *
   * consistency_factor:
   *   - 多次确认 → min(1 + count * 0.05, 1.5)
   *   - 每次纠正 → ×0.7（CORRECTION_PENALTY_MULTIPLIER）
   */
  private computeEffectiveReliability(
    base: number,
    verificationCount: number,
    lastVerifiedAt: number | null,
    correctionCount: number
  ): number {
    // Recency factor
    let recencyFactor = 1.0;
    if (lastVerifiedAt !== null) {
      const daysSince = (Date.now() - lastVerifiedAt) / 86400000;
      if (daysSince > RECENCY_GRACE_DAYS) {
        const decayCycles = (daysSince - RECENCY_GRACE_DAYS) / RECENCY_GRACE_DAYS;
        recencyFactor = Math.max(RECENCY_FACTOR_FLOOR, Math.pow(RECENCY_DECAY_RATE, decayCycles));
      }
    }

    // Consistency factor: confirm boosts, correct penalizes
    const confirmBoost = Math.min(1 + verificationCount * 0.05, CONSISTENCY_MAX);
    const correctionPenalty = Math.pow(CORRECTION_PENALTY_MULTIPLIER, correctionCount);

    const effective = base * recencyFactor * confirmBoost * correctionPenalty;
    return Math.max(0.0, Math.min(1.0, effective));
  }

  private _rowToMemory(r: any): MemoryEntry {
    const base = r.reliability ?? INITIAL_RELIABILITY;
    const correctionHistory: Array<{ ts: number; oldText: string; newText: string }> =
      typeof r.correction_history === 'string'
        ? JSON.parse(r.correction_history || '[]')
        : (r.correction_history || []);
    const correctionCount = correctionHistory.length;

    return {
      id: r.id,
      text: r.text,
      vector: r.vector || [],
      category: r.category,
      scope: r.scope,
      importance: r.importance,
      timestamp: Number(r.timestamp),
      expiresAt: Number(r.expires_at || 0),
      accessCount: r.access_count,
      lastAccessedAt: Number(r.last_accessed_at),
      deletedAt: r.deleted_at !== null ? Number(r.deleted_at) : null,
      reliability: base,
      verificationCount: r.verification_count ?? 0,
      lastVerifiedAt: r.last_verified_at !== null ? Number(r.last_verified_at) : null,
      locked: r.locked === 1,
      correctionHistory,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      source_type: (r.source_type || 'text') as SourceType,
    };
  }

  private _rowToRetrieved(r: any, score: number): RetrievedMemory {
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
    };
  }

  async store(entry: Omit<MemoryEntry, 'accessCount' | 'lastAccessedAt'>): Promise<void> {
    if (!this.table) await this.init();
    const now = Date.now();
    const correctionHistory = entry.correctionHistory ?? [];
    const row = this._makeRow({
      id: entry.id,
      text: entry.text,
      vector: entry.vector,
      category: entry.category,
      scope: entry.scope,
      importance: entry.importance,
      timestamp: entry.timestamp,
      expires_at: entry.expiresAt || 0,
      created_at: now,
      access_count: 0,
      last_accessed_at: now,
      deleted_at: null,
      reliability: entry.reliability ?? INITIAL_RELIABILITY,
      verification_count: entry.verificationCount ?? 0,
      last_verified_at: null,
      locked: entry.locked ?? false,
      correction_history: JSON.stringify(correctionHistory),
      metadata: JSON.stringify(entry.metadata || {}),
      source_type: entry.source_type || 'text',
    });
    await this.table.add([row]);
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

    // Filter: soft-deleted (forgotten) memories are excluded
    results = results.filter((r: any) => r.deleted_at === null);

    if (scope) {
      results = results.filter((r: any) => r.scope === scope);
    }

    // Filter by source types (multimodal support)
    if (sourceTypes && sourceTypes.length > 0) {
      results = results.filter((r: any) => {
        const type = r.source_type || 'text';
        return sourceTypes.includes(type);
      });
    }

    // Filter expired memories
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

  private async incrementAccess(id: string): Promise<void> {
    try {
      await this.table.update({
        where: 'id = ?',
        whereParams: [id],
        updates: {
          access_count: this.db.util().scalar('access_count + 1'),
          last_accessed_at: BigInt(Date.now()),
        }
      });
    } catch {
      // Non-critical if update fails
    }
  }

  async listRecent(limit: number = 10): Promise<MemoryEntry[]> {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(limit * 2).toArray();
    return rows
      .filter((r: any) => r.deleted_at === null)
      .slice(0, limit)
      .map((r: any) => this._rowToMemory(r));
  }

  async count(): Promise<number> {
    if (!this.table) await this.init();
    return await this.table.countRows();
  }

  async getAllTexts(): Promise<Array<{ id: string; text: string }>> {
    if (!this.table) await this.init();
    // BM25_QUERY_LIMIT prevents runaway queries on very large memory stores
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toArray();
    return rows
      .filter((r: any) => r.deleted_at === null)
      .map((r: any) => ({ id: r.id, text: r.text }));
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    if (!this.table) await this.init();
    try {
      const rows = await this.table.query().where(`id = '${id.replace(/'/g, "''")}'`).limit(1).toArray();
      if (!rows.length) return null;
      const r = rows[0];
      if (r.deleted_at !== null) return null;
      return this._rowToMemory(r);
    } catch {
      return null;
    }
  }

  async getAllMemories(): Promise<MemoryEntry[]> {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toArray();
    return rows
      .filter((r: any) => r.deleted_at === null)
      .map((r: any) => this._rowToMemory(r));
  }

  /** Batch fetch multiple memories by ID in a single query — avoids N+1 round-trips */
  async getByIds(ids: string[]): Promise<MemoryMap> {
    if (!this.table) await this.init();
    const results = new Map<string, any>();
    if (!ids.length) return results;
    try {
      // Build predicate: id = 'xxx' OR id = 'yyy' OR ...
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
          metadata: JSON.parse(r.metadata || '{}'),
          source_type: (r.source_type || 'text') as SourceType,
        });
      }
    } catch {
      // On error return empty map (caller handles partial results)
    }
    return results;
  }

  /**
   * 软删除：标记记忆为已遗忘（recall 时自动过滤）
   * 30 天后 purgeForgotten 会彻底删除
   * 注意：锁定的记忆无法被遗忘
   */
  async forget(id: string): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      const memory = await this.getById(id);
      if (!memory) return false;
      if (memory.locked) {
        console.log(`[hawk-bridge] Cannot forget locked memory: ${id}`);
        return false;
      }
      await this.table.update({
        where: `id = '${id.replace(/'/g, "''")}'`,
        updates: { deleted_at: BigInt(Date.now()) },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 验证记忆可信度
   * - confirmed=true: 用户确认记忆正确 → reliability + boost（上限 1.0）
   * - confirmed=false: 用户纠正 → reliability - penalty，记录纠正历史
   * 注意：锁定的记忆也可以被验证，但不改变 reliability
   */
  async verify(id: string, confirmed: boolean, correctedText?: string): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      const memory = await this.getById(id);
      if (!memory) return false;
      const now = Date.now();

      const newReliability = memory.locked
        ? memory.reliability  // 锁定记忆不改变 reliability
        : confirmed
          ? Math.min(1.0, memory.reliability + RELIABILITY_BOOST_CONFIRM)
          : Math.max(0.0, memory.reliability - RELIABILITY_PENALTY_CORRECT);

      const correctionHistory = [...(memory.correctionHistory || [])];
      if (!confirmed && correctedText) {
        correctionHistory.push({
          ts: now,
          oldText: memory.text,
          newText: correctedText,
        });
      }

      await this.table.update({
        where: `id = '${id.replace(/'/g, "''")}'`,
        updates: {
          reliability: newReliability,
          verification_count: memory.verificationCount + 1,
          last_verified_at: BigInt(now),
          correction_history: JSON.stringify(correctionHistory),
          ...(!confirmed && correctedText ? { text: correctedText } : {}),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 锁定/解锁记忆
   * 锁定的记忆：忽略 decay，不会被自动删除
   */
  async lock(id: string): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      await this.table.update({
        where: `id = '${id.replace(/'/g, "''")}'`,
        updates: { locked: 1 },
      });
      return true;
    } catch { return false; }
  }

  async unlock(id: string): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      await this.table.update({
        where: `id = '${id.replace(/'/g, "''")}'`,
        updates: { locked: 0 },
      });
      return true;
    } catch { return false; }
  }

  /**
   * 记忆衰减：降低长期未访问记忆的 importance
   * 差异化：✅ 记忆几乎不衰减，⚠️ 正常衰减，❌ 快速消亡
   * 锁定的记忆完全跳过衰减
   */
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
      // 基于 effective reliability 计算衰减倍数
      if (reliability >= 0.7) return DECAY_RATE_HIGH_RELIABILITY;      // 0.2 → 几乎不衰减
      if (reliability >= 0.4) return DECAY_RATE_MEDIUM_RELIABILITY;  // 0.8 → 正常衰减
      return DECAY_RATE_LOW_RELIABILITY;                            // 1.5 → 加速衰减
    }

    const memories = await this.getAllMemories();
    let updated = 0;
    let deleted = 0;
    const now = Date.now();

    for (const m of memories) {
      // 锁定的记忆完全跳过衰减
      if (m.locked) continue;

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

        if (LAYERS.indexOf(newLayer) < LAYERS.indexOf(m.scope)) {
          try {
            await this.table.update({
              where: `id = '${m.id.replace(/'/g, "''")}'`,
              updates: { importance: newImportance, scope: newLayer },
            });
            updated++;
          } catch { /* ignore */ }
        } else if (newImportance !== m.importance) {
          try {
            await this.table.update({
              where: `id = '${m.id.replace(/'/g, "''")}'`,
              updates: { importance: newImportance },
            });
            updated++;
          } catch { /* ignore */ }
        }
      }
    }

    const purged = await this.purgeForgotten();
    deleted += purged;

    return { updated, deleted };
  }

  /**
   * 彻底删除软删除超过 graceDays 天的记忆
   */
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
}

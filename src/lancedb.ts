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
  metadata: Record<string, unknown>;
  source_type: SourceType;
}>;
import { BM25_QUERY_LIMIT, DEFAULT_EMBEDDING_DIM, INITIAL_RELIABILITY, FORGET_GRACE_DAYS, RELIABILITY_BOOST_CONFIRM, RELIABILITY_PENALTY_CORRECT } from './constants.js';
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
    expires_at: number;  // 0 = never expire
    created_at: number;
    access_count: number;
    last_accessed_at: number;
    deleted_at: number | null;
    reliability: number;
    verification_count: number;
    last_verified_at: number | null;
    metadata: string;
    source_type: SourceType;
  }): any {
    // Use a dummy zero vector if embedding is empty.
    // DEFAULT_EMBEDDING_DIM must match your embedding model's output dimension.
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
      metadata: data.metadata,
      source_type: data.source_type,
    };
  }

  private _rowToMemory(r: any): MemoryEntry {
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
      reliability: r.reliability ?? INITIAL_RELIABILITY,
      verificationCount: r.verification_count ?? 0,
      lastVerifiedAt: r.last_verified_at !== null ? Number(r.last_verified_at) : null,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      source_type: (r.source_type || 'text') as SourceType,
    };
  }

  private _rowToRetrieved(r: any, score: number): RetrievedMemory {
    const reliability = r.reliability ?? INITIAL_RELIABILITY;
    return {
      id: r.id,
      text: r.text,
      score,
      category: r.category,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      source_type: (r.source_type || 'text') as SourceType,
      reliability,
      reliabilityLabel: reliability >= 0.7 ? '✅' : reliability >= 0.4 ? '⚠️' : '❌',
    };
  }

  async store(entry: Omit<MemoryEntry, 'accessCount' | 'lastAccessedAt'>): Promise<void> {
    if (!this.table) await this.init();
    const now = Date.now();
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
      .toList();

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
    const rows = await this.table.query().limit(limit * 2).toList();
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
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toList();
    return rows
      .filter((r: any) => r.deleted_at === null)
      .map((r: any) => ({ id: r.id, text: r.text }));
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    if (!this.table) await this.init();
    try {
      const rows = await this.table.query().where('id = ?', [id]).limit(1).toList();
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
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toList();
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
      // Build OR query: id = ? OR id = ? OR ...
      const conditions = ids.map(() => 'id = ?').join(' OR ');
      const rows = await this.table.query().where(conditions, ids).limit(ids.length).toList();
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
   */
  async forget(id: string): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      await this.table.update({
        where: 'id = ?',
        whereParams: [id],
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
   * - confirmed=false: 用户纠正 → reliability - penalty（下限 0），记录纠正后文本
   */
  async verify(id: string, confirmed: boolean, correctedText?: string): Promise<boolean> {
    if (!this.table) await this.init();
    try {
      const memory = await this.getById(id);
      if (!memory) return false;
      const now = Date.now();
      const newReliability = confirmed
        ? Math.min(1.0, memory.reliability + RELIABILITY_BOOST_CONFIRM)
        : Math.max(0.0, memory.reliability - RELIABILITY_PENALTY_CORRECT);
      const metadata = { ...memory.metadata };
      if (!confirmed && correctedText) {
        metadata.correctedText = memory.text; // 保留原始错误文本
      }
      await this.table.update({
        where: 'id = ?',
        whereParams: [id],
        updates: {
          reliability: newReliability,
          verification_count: memory.verificationCount + 1,
          last_verified_at: BigInt(now),
          ...(!confirmed && correctedText ? { text: correctedText, metadata: JSON.stringify(metadata) } : {}),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 彻底删除软删除超过 graceDays 天的记忆
   */
  async purgeForgotten(graceDays: number = FORGET_GRACE_DAYS): Promise<number> {
    if (!this.table) await this.init();
    const cutoff = Date.now() - graceDays * 86400000;
    let deleted = 0;
    try {
      const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toList();
      const toDelete = rows.filter((r: any) =>
        r.deleted_at !== null && Number(r.deleted_at) < cutoff
      );
      for (const r of toDelete) {
        try {
          await this.table.delete(`id = '${r.id}'`);
          deleted++;
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return deleted;
  }
}

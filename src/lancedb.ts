// LanceDB wrapper for hawk-bridge
// Handles memory storage, retrieval, and schema management

import * as path from 'path';
import * as os from 'os';

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
  metadata: Record<string, unknown>;
}>;
import { BM25_QUERY_LIMIT, DEFAULT_EMBEDDING_DIM } from './constants.js';
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
        });
        const table = makeArrowTable([sampleRow]);
        this.table = await this.db.createTable(TABLE_NAME, table);
        // Remove the init row
        await this.table.delete(`id = '__init__'`);
      } else {
        this.table = await this.db.openTable(TABLE_NAME);
        // Migrate schema: add expires_at / created_at columns if missing
        try {
          await this.table.alterAddColumns([
            { name: 'expires_at', type: { type: 'int64' } },
            { name: 'created_at', type: { type: 'int64' } },
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
    metadata: string;
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
      metadata: data.metadata,
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
      metadata: JSON.stringify(entry.metadata || {}),
    });
    await this.table.add([row]);
  }

  async search(
    queryVector: number[],
    topK: number,
    minScore: number,
    scope?: string
  ): Promise<RetrievedMemory[]> {
    if (!this.table) await this.init();

    let results = await this.table
      .search(queryVector)
      .limit(topK * 4)
      .toList();

    if (scope) {
      results = results.filter((r: any) => r.scope === scope);
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
      retrieved.push({
        id: row.id,
        text: row.text,
        score,
        category: row.category,
        metadata: JSON.parse(row.metadata || '{}'),
      });
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
    const rows = await this.table.query().limit(limit).toList();
    return rows.map((r: any) => ({
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
      metadata: JSON.parse(r.metadata || '{}'),
    }));
  }

  async count(): Promise<number> {
    if (!this.table) await this.init();
    return await this.table.countRows();
  }

  async getAllTexts(): Promise<Array<{ id: string; text: string }>> {
    if (!this.table) await this.init();
    // BM25_QUERY_LIMIT prevents runaway queries on very large memory stores
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toList();
    return rows.map((r: any) => ({ id: r.id, text: r.text }));
  }

  async getById(id: string): Promise<(Omit<MemoryEntry, 'accessCount' | 'lastAccessedAt'> & { vector: number[] }) | null> {
    if (!this.table) await this.init();
    try {
      const rows = await this.table.query().where('id = ?', [id]).limit(1).toList();
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        text: r.text,
        vector: r.vector || [],
        category: r.category,
        scope: r.scope,
        importance: r.importance,
        timestamp: Number(r.timestamp),
        expiresAt: Number(r.expires_at || 0),
        metadata: JSON.parse(r.metadata || '{}'),
      };
    } catch {
      return null;
    }
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
        results.set(r.id, {
          id: r.id,
          text: r.text,
          vector: r.vector || [],
          category: r.category,
          scope: r.scope,
          importance: r.importance,
          timestamp: Number(r.timestamp),
          expiresAt: Number(r.expires_at || 0),
          metadata: JSON.parse(r.metadata || '{}'),
        });
      }
    } catch {
      // On error return empty map (caller handles partial results)
    }
    return results;
  }
}

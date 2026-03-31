// LanceDB wrapper for hawk-bridge
// Handles memory storage, retrieval, and schema management
import * as path from 'path';
import * as os from 'os';
const TABLE_NAME = 'hawk_memories';
// Schema: matches memory-lancedb-pro for potential future compatibility
const SCHEMA_FIELDS = [
    { name: 'id', type: 'string' },
    { name: 'text', type: 'string' },
    { name: 'vector', type: 'vector', vectorType: 'float32' },
    { name: 'category', type: 'string' },
    { name: 'scope', type: 'string' },
    { name: 'importance', type: 'float32' },
    { name: 'timestamp', type: 'int64' },
    { name: 'access_count', type: 'int32' },
    { name: 'last_accessed_at', type: 'int64' },
    { name: 'metadata', type: 'string' }, // JSON string
];
export class HawkDB {
    db = null;
    table = null;
    dbPath;
    constructor(dbPath) {
        const home = os.homedir();
        this.dbPath = dbPath ?? path.join(home, '.hawk', 'lancedb');
    }
    async init() {
        try {
            const lancedb = await import('@lancedb/lancedb');
            this.db = await lancedb.connect(this.dbPath);
            const tableNames = await this.db.tableNames();
            if (!tableNames.includes(TABLE_NAME)) {
                // Create table with schema
                const schema = {
                    vectorType: 'float32',
                    fields: SCHEMA_FIELDS,
                };
                this.table = await this.db.createTable(TABLE_NAME, { schema });
            }
            else {
                this.table = await this.db.openTable(TABLE_NAME);
            }
        }
        catch (err) {
            console.error('[hawk-bridge] LanceDB init failed:', err);
            throw err;
        }
    }
    async store(entry) {
        if (!this.table)
            await this.init();
        const now = Date.now();
        const row = {
            id: entry.id,
            text: entry.text,
            vector: entry.vector,
            category: entry.category,
            scope: entry.scope,
            importance: entry.importance,
            timestamp: entry.timestamp,
            access_count: 0,
            last_accessed_at: now,
            metadata: JSON.stringify(entry.metadata || {}),
        };
        await this.table.add([row]);
    }
    async search(queryVector, topK, minScore, scope) {
        if (!this.table)
            await this.init();
        let results = await this.table
            .search(queryVector)
            .limit(topK * 2) // over-fetch for filtering
            .toList();
        // Optional scope filter
        if (scope) {
            results = results.filter((r) => r.scope === scope);
        }
        const retrieved = [];
        for (const row of results) {
            const score = 1 - (row._distance ?? 0); // LanceDB uses L2 distance
            if (score < minScore)
                continue;
            retrieved.push({
                id: row.id,
                text: row.text,
                score,
                category: row.category,
                metadata: JSON.parse(row.metadata || '{}'),
            });
            if (retrieved.length >= topK)
                break;
        }
        // Update access counts
        for (const r of retrieved) {
            await this.incrementAccess(r.id);
        }
        return retrieved;
    }
    async incrementAccess(id) {
        try {
            await this.table
                .update({ where: `id = '${id}'`, updates: {
                    access_count: this.db.util().scalar('access_count + 1'),
                    last_accessed_at: Date.now(),
                } });
        }
        catch {
            // Non-critical if update fails
        }
    }
    async listRecent(limit = 10) {
        if (!this.table)
            await this.init();
        const rows = await this.table
            .query()
            .limit(limit)
            .toList();
        return rows.map((r) => ({
            id: r.id,
            text: r.text,
            vector: r.vector,
            category: r.category,
            scope: r.scope,
            importance: r.importance,
            timestamp: r.timestamp,
            accessCount: r.access_count,
            lastAccessedAt: r.last_accessed_at,
            metadata: JSON.parse(r.metadata || '{}'),
        }));
    }
    async count() {
        if (!this.table)
            await this.init();
        return await this.table.countRows();
    }
    async getAllTexts() {
        if (!this.table)
            await this.init();
        const rows = await this.table.query().limit(10000).toList();
        return rows.map((r) => ({ id: r.id, text: r.text }));
    }
    async getById(id) {
        if (!this.table)
            await this.init();
        try {
            const rows = await this.table
                .query()
                .where(`id = '${id}'`)
                .limit(1)
                .toList();
            if (!rows.length)
                return null;
            const r = rows[0];
            return {
                id: r.id,
                text: r.text,
                vector: r.vector,
                category: r.category,
                scope: r.scope,
                importance: r.importance,
                timestamp: r.timestamp,
                metadata: JSON.parse(r.metadata || '{}'),
            };
        }
        catch {
            return null;
        }
    }
}

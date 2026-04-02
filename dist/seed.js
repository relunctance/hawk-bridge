// src/lancedb.ts
import * as path from "path";
import * as os from "os";

// src/constants.ts
var BM25_K1 = parseFloat(process.env.HAWK_BM25_K1 || "1.5");
var BM25_B = parseFloat(process.env.HAWK_BM25_B || "0.75");
var RRF_K = parseFloat(process.env.HAWK_RRF_K || "60");
var RRF_VECTOR_WEIGHT = parseFloat(process.env.HAWK_RRF_VECTOR_WEIGHT || "0.7");
var NOISE_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_NOISE_THRESHOLD || "0.82");
var VECTOR_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_VECTOR_SEARCH_MULTIPLIER || "4", 10);
var BM25_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_BM25_SEARCH_MULTIPLIER || "4", 10);
var RERANK_CANDIDATE_MULTIPLIER = parseInt(process.env.HAWK_RERANK_CANDIDATE_MULTIPLIER || "3", 10);
var BM25_QUERY_LIMIT = parseInt(process.env.HAWK_BM25_QUERY_LIMIT || "10000", 10);
var DEFAULT_EMBEDDING_DIM = parseInt(process.env.HAWK_EMBEDDING_DIM || "384", 10);
var DEFAULT_MIN_SCORE = parseFloat(process.env.HAWK_MIN_SCORE || "0.6");

// src/lancedb.ts
var TABLE_NAME = "hawk_memories";
var HawkDB = class {
  db = null;
  table = null;
  dbPath;
  constructor(dbPath) {
    const home = os.homedir();
    this.dbPath = dbPath ?? path.join(home, ".hawk", "lancedb");
  }
  async init() {
    try {
      const lancedb = await import("@lancedb/lancedb");
      this.db = await lancedb.connect(this.dbPath);
      const tableNames = await this.db.tableNames();
      if (!tableNames.includes(TABLE_NAME)) {
        const { makeArrowTable } = lancedb;
        const sampleRow = this._makeRow({
          id: "__init__",
          text: "__init__",
          vector: new Float32Array(0),
          category: "fact",
          scope: "system",
          importance: 0,
          timestamp: Date.now(),
          access_count: 0,
          last_accessed_at: Date.now(),
          metadata: "{}"
        });
        const table = makeArrowTable([sampleRow]);
        this.table = await this.db.createTable(TABLE_NAME, table);
        await this.table.delete(`id = '__init__'`);
      } else {
        this.table = await this.db.openTable(TABLE_NAME);
      }
    } catch (err) {
      console.error("[hawk-bridge] LanceDB init failed:", err);
      throw err;
    }
  }
  _makeRow(data) {
    const vec = data.vector.length > 0 ? Array.from(data.vector) : new Array(DEFAULT_EMBEDDING_DIM).fill(0);
    return {
      id: data.id,
      text: data.text,
      vector: vec,
      category: data.category,
      scope: data.scope,
      importance: data.importance,
      timestamp: BigInt(data.timestamp),
      access_count: data.access_count,
      last_accessed_at: BigInt(data.last_accessed_at),
      metadata: data.metadata
    };
  }
  async store(entry) {
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
      access_count: 0,
      last_accessed_at: now,
      metadata: JSON.stringify(entry.metadata || {})
    });
    await this.table.add([row]);
  }
  async search(queryVector, topK, minScore, scope) {
    if (!this.table) await this.init();
    let results = await this.table.search(queryVector).limit(topK * 2).toList();
    if (scope) {
      results = results.filter((r) => r.scope === scope);
    }
    const retrieved = [];
    for (const row of results) {
      const score = 1 - (row._distance ?? 0);
      if (score < minScore) continue;
      retrieved.push({
        id: row.id,
        text: row.text,
        score,
        category: row.category,
        metadata: JSON.parse(row.metadata || "{}")
      });
      if (retrieved.length >= topK) break;
    }
    for (const r of retrieved) {
      await this.incrementAccess(r.id);
    }
    return retrieved;
  }
  async incrementAccess(id) {
    try {
      await this.table.update({
        where: "id = ?",
        whereParams: [id],
        updates: {
          access_count: this.db.util().scalar("access_count + 1"),
          last_accessed_at: BigInt(Date.now())
        }
      });
    } catch {
    }
  }
  async listRecent(limit = 10) {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(limit).toList();
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      vector: r.vector || [],
      category: r.category,
      scope: r.scope,
      importance: r.importance,
      timestamp: Number(r.timestamp),
      accessCount: r.access_count,
      lastAccessedAt: Number(r.last_accessed_at),
      metadata: JSON.parse(r.metadata || "{}")
    }));
  }
  async count() {
    if (!this.table) await this.init();
    return await this.table.countRows();
  }
  async getAllTexts() {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toList();
    return rows.map((r) => ({ id: r.id, text: r.text }));
  }
  async getById(id) {
    if (!this.table) await this.init();
    try {
      const rows = await this.table.query().where("id = ?", [id]).limit(1).toList();
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
        metadata: JSON.parse(r.metadata || "{}")
      };
    } catch {
      return null;
    }
  }
};

// src/seed.ts
import { createHash } from "crypto";
var SEED_MEMORIES = [
  // Generic AI agent team context
  {
    text: "hawk-bridge is an OpenClaw plugin that provides auto-capture and auto-recall of memories for AI agents. It uses LanceDB for storage and supports hybrid search (BM25 + vector).",
    category: "fact",
    importance: 0.9,
    layer: "long",
    scope: "project",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Memory system: Working (temporary) \u2192 Short (days) \u2192 Long (weeks) \u2192 Archive (months). Old memories are automatically pruned based on access patterns.",
    category: "fact",
    importance: 0.8,
    layer: "long",
    scope: "project",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Four retrieval modes: BM25-only (zero-config), Ollama local (free GPU), sentence-transformers (CPU), Jina AI (cloud API with free tier).",
    category: "fact",
    importance: 0.7,
    layer: "long",
    scope: "project",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "hawk-recall hook: Injects relevant memories into agent context before first response. hawk-capture hook: Extracts and stores meaningful content after each response.",
    category: "fact",
    importance: 0.9,
    layer: "long",
    scope: "project",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  // Generic team collaboration concepts
  {
    text: "AI agent teams work best with clear role definitions: architect (design), engineer (implement), reviewer (quality), coordinator (orchestrate).",
    category: "fact",
    importance: 0.8,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Structured task workflows improve reliability: inbox \u2192 in-progress \u2192 done. Task descriptions should include context, acceptance criteria, and priority.",
    category: "fact",
    importance: 0.8,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Memory persistence: agents benefit from remembering user preferences, project context, and past decisions across sessions.",
    category: "fact",
    importance: 0.9,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Fallback behavior: when uncertain, ask clarifying questions rather than making assumptions. Prefer conservative actions over destructive ones.",
    category: "preference",
    importance: 0.8,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Configuration changes (openclaw.json, skills, plugins) should be verified before deployment. Test in non-production environments first.",
    category: "decision",
    importance: 0.9,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Documentation lives in README files, SKILL.md files, and project wikis. Keep them updated when behavior changes.",
    category: "fact",
    importance: 0.7,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Customize this seed data after installation to reflect your actual team structure, projects, and conventions. Delete or modify these as needed.",
    category: "decision",
    importance: 0.5,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  }
];
function seedId(text) {
  return "seed_" + createHash("sha256").update(text).digest("hex").slice(0, 24);
}
async function seed() {
  console.log("[seed] Starting seed...");
  const db = new HawkDB();
  await db.init();
  let added = 0;
  let skipped = 0;
  for (const memory of SEED_MEMORIES) {
    const id = seedId(memory.text);
    const existing = await db.getById(id);
    if (existing) {
      console.log(`[seed] Skipped (already exists): ${memory.text.slice(0, 60)}...`);
      skipped++;
      continue;
    }
    await db.store({
      id,
      text: memory.text,
      vector: [],
      // Empty vector - BM25-only mode doesn't need vectors
      category: memory.category,
      scope: memory.scope,
      importance: memory.importance,
      timestamp: Date.now(),
      metadata: memory.metadata
    });
    console.log(`[seed] Added: ${memory.text.slice(0, 60)}...`);
    added++;
  }
  console.log(`[seed] Done! Added: ${added}, Skipped (already exist): ${skipped}.`);
  console.log("[seed] IMPORTANT: Customize these memories for your team in ~/.hawk/lancedb/");
  process.exit(0);
}
seed().catch((err) => {
  console.error("[seed] Seed failed:", err);
  process.exit(1);
});
export {
  seed
};

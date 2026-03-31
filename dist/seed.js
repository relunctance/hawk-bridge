// src/lancedb.ts
import * as path from "path";
import * as os from "os";
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
    const vec = data.vector.length > 0 ? Array.from(data.vector) : new Array(384).fill(0);
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
        where: `id = '${id}'`,
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
    const rows = await this.table.query().limit(1e4).toList();
    return rows.map((r) => ({ id: r.id, text: r.text }));
  }
  async getById(id) {
    if (!this.table) await this.init();
    try {
      const rows = await this.table.query().where(`id = '${id}'`).limit(1).toList();
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
import { randomBytes } from "crypto";
var SEED_MEMORIES = [
  // Team structure
  {
    text: "\u56E2\u961F\u6210\u5458\uFF1Amain\uFF08\u7EDF\u7B79/\u8001\u5927\uFF09\u3001wukong\uFF08\u609F\u7A7A/\u540E\u7AEF\uFF09\u3001bajie\uFF08\u516B\u6212/\u524D\u7AEF\uFF09\u3001bailong\uFF08\u767D\u9F99/\u6D4B\u8BD5\uFF09\u3001tseng\uFF08\u5510\u50E7/\u67B6\u6784\u5E08\uFF09",
    category: "fact",
    importance: 0.9,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "\u56E2\u961F\u534F\u4F5C\u89C4\u8303\u4ED3\u5E93\uFF1Ahttps://github.com/relunctance/gql-openclaw\uFF0C\u672C\u5730\u8DEF\u5F84 /tmp/gql-openclaw\uFF0C\u6240\u6709\u4EFB\u52A1\u6D41\u8F6C\u901A\u8FC7 GitHub inbox \u673A\u5236",
    category: "fact",
    importance: 0.9,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "\u4EFB\u52A1\u6D41\u8F6C\u89C4\u8303\uFF1Atasks/inbox/{agent}/ \u2192 tasks/in-progress/{agent}/ \u2192 tasks/done/{agent}/\uFF0C\u547D\u540D\u683C\u5F0F YYYY-MM-DD-{\u5E8F\u53F7}-{\u63CF\u8FF0}.md",
    category: "fact",
    importance: 0.8,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "\u62A5\u544A\u5236\u5EA6\uFF1A\u65E5\u62A5 reports/daily/YYYY-MM-DD/{agent}.md\uFF0C\u5468\u62A5 reports/weekly/YYYY-WXX/{agent}.md",
    category: "fact",
    importance: 0.8,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "Git \u89C4\u8303\uFF1A\u7EDF\u4E00 email 334136724@qq.com\uFF0C\u5404\u81EA agentID \u4F5C\u4E3A commit name\uFF0C\u6D88\u606F\u683C\u5F0F <agent>: <subject>",
    category: "fact",
    importance: 0.8,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  // Project context
  {
    text: "hawk-bridge\uFF1A\u8BB0\u5FC6\u7CFB\u7EDF\u63D2\u4EF6\uFF0CGitHub github.com/relunctance/hawk-bridge\uFF0Chook: hawk-recall\uFF08\u542F\u52A8\u6CE8\u5165\u8BB0\u5FC6\uFF09\u548C hawk-capture\uFF08\u54CD\u5E94\u540E\u6355\u83B7\u8BB0\u5FC6\uFF09",
    category: "fact",
    importance: 0.9,
    layer: "long",
    scope: "project",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "qujingskills\uFF1A\u6280\u672F\u89C4\u8303 Skill\uFF0C\u8DEF\u5F84 /home/gql/qujingskills/qujin-laravel-team/\uFF0C\u5B9A\u4E49 Laravel \u5F00\u53D1\u6807\u51C6\u548C\u89D2\u8272 Prompt",
    category: "fact",
    importance: 0.8,
    layer: "long",
    scope: "project",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "\u5F53\u524D\u9879\u76EE\uFF1Agoskills\uFF08Go \u591AAgent\u56E2\u961F\u89C4\u8303\uFF09\u3001user-feedback\uFF08\u7528\u6237\u53CD\u9988\u7CFB\u7EDF\uFF09\u3001context-hawk\uFF08Python \u8BB0\u5FC6\u6838\u5FC3\uFF09",
    category: "fact",
    importance: 0.7,
    layer: "long",
    scope: "project",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  // Team norms
  {
    text: "\u56E2\u961F\u89C4\u8303\uFF1A\u6240\u6709\u6B63\u5F0F\u4EFB\u52A1\u6D41\u8F6C\u8D70 GitHub \u4ED3\u5E93\uFF0C\u98DE\u4E66\u53EA\u505A\u63D0\u9192\u548C\u901A\u77E5\uFF0C\u4E0D\u4F5C\u4E3A\u6B63\u5F0F\u4EFB\u52A1\u6E20\u9053",
    category: "decision",
    importance: 0.9,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "\u6C9F\u901A\u539F\u5219\uFF1A\u53EA\u8BA9\u7528\u6237\u505A\u7B80\u5355\u53C8\u5173\u952E\u7684\u4E00\u6B65\uFF0C\u5176\u4ED6\u6211\u6765\uFF1B\u9047\u5230\u95EE\u9898\u5E26\u65B9\u6848\u6C47\u62A5\uFF0C\u4E0D\u53EA\u629B\u95EE\u9898",
    category: "preference",
    importance: 0.8,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  },
  {
    text: "\u91CD\u8981\u539F\u5219\uFF1A\u4FEE\u6539 openclaw.json \u5FC5\u987B\u5148\u786E\u8BA4\uFF0C\u5B89\u88C5 skills \u8981\u5148\u68C0\u67E5\u4F9D\u8D56\u548C\u98CE\u9669",
    category: "decision",
    importance: 0.9,
    layer: "long",
    scope: "team",
    metadata: { source: "seed", created_at: (/* @__PURE__ */ new Date()).toISOString() }
  }
];
function generateId() {
  return randomBytes(16).toString("hex");
}
async function seed() {
  console.log("[seed] Starting seed...");
  const db = new HawkDB();
  await db.init();
  const count = SEED_MEMORIES.length;
  console.log(`[seed] Seeding ${count} memories...`);
  for (const memory of SEED_MEMORIES) {
    const id = generateId();
    await db.store({
      id,
      text: memory.text,
      vector: [],
      // Empty vector - BM25-only mode doesn't need vectors
      category: memory.category,
      scope: memory.scope,
      importance: memory.importance,
      timestamp: Date.now(),
      metadata: JSON.stringify(memory.metadata)
    });
    console.log(`[seed] Added: ${memory.text.slice(0, 50)}...`);
  }
  console.log(`[seed] Done! Seeded ${count} memories.`);
  process.exit(0);
}
seed().catch((err) => {
  console.error("[seed] Seed failed:", err);
  process.exit(1);
});
export {
  seed
};

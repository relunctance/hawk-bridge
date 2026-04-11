var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/embeddings.ts
var embeddings_exports = {};
__export(embeddings_exports, {
  Embedder: () => Embedder,
  formatRecallForContext: () => formatRecallForContext
});
async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}
function formatRecallForContext(memories, emoji = "\u{1F985}") {
  if (!memories.length) return "";
  const lines = [`${emoji} ** hawk \u8BB0\u5FC6\u68C0\u7D22\u7ED3\u679C **`];
  for (const m of memories) {
    lines.push(`[${m.category}] (${(m.score * 100).toFixed(0)}%\u76F8\u5173): ${m.text}`);
  }
  return lines.join("\n");
}
var FETCH_TIMEOUT_MS, Embedder;
var init_embeddings = __esm({
  "src/embeddings.ts"() {
    "use strict";
    FETCH_TIMEOUT_MS = 15e3;
    Embedder = class _Embedder {
      config;
      // TTL cache: normalized_text → { vector, timestamp }
      cache = /* @__PURE__ */ new Map();
      static CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
      // 24h
      constructor(config) {
        this.config = config;
      }
      normalizeForCache(text) {
        return text.toLowerCase().replace(/\s+/g, " ").trim();
      }
      getCached(text) {
        const key = this.normalizeForCache(text);
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.ts > _Embedder.CACHE_TTL_MS) {
          this.cache.delete(key);
          return null;
        }
        return entry.vector;
      }
      setCached(text, vector) {
        const key = this.normalizeForCache(text);
        this.cache.set(key, { vector, ts: Date.now() });
        if (this.cache.size > 1e4) {
          const oldest = [...this.cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, Math.floor(this.cache.size * 0.3));
          for (const [k] of oldest) this.cache.delete(k);
        }
      }
      async embed(texts) {
        const uncached = [];
        const results = texts.map((t) => this.getCached(t));
        for (let i = 0; i < texts.length; i++) {
          if (results[i] === null) uncached.push(texts[i]);
        }
        if (uncached.length === 0) return results;
        const { provider } = this.config;
        const uncachedIdxMap = /* @__PURE__ */ new Map();
        texts.forEach((t, i) => {
          if (results[i] === null) uncachedIdxMap.set(t, i);
        });
        let freshVectors;
        if (provider === "qianwen") {
          freshVectors = await this.embedQianwen(uncached);
        } else if (provider === "openai-compat") {
          freshVectors = await this.embedOpenAICompat(uncached);
        } else if (provider === "ollama") {
          freshVectors = await this.embedOllama(uncached);
        } else if (provider === "jina") {
          freshVectors = await this.embedJina(uncached);
        } else if (provider === "cohere") {
          freshVectors = await this.embedCohere(uncached);
        } else {
          freshVectors = await this.embedOpenAI(uncached);
        }
        const finalResults = [...results];
        for (let i = 0; i < uncached.length; i++) {
          const originalIdx = uncachedIdxMap.get(uncached[i]);
          finalResults[originalIdx] = freshVectors[i];
          this.setCached(uncached[i], freshVectors[i]);
        }
        return finalResults;
      }
      async embedQuery(text) {
        const vectors = await this.embed([text]);
        return vectors[0];
      }
      // ---- Qianwen (阿里云 DashScope) — OpenAI-compatible, 国内首选 ----
      async embedQianwen(texts) {
        const apiKey = this.config.apiKey || process.env.QWEN_API_KEY || "";
        const baseURL = this.config.baseURL || "https://dashscope.aliyuncs.com/api/v1";
        const resp = await fetchWithTimeout(
          `${baseURL}/services/embeddings/text-embedding/text-embedding`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: this.config.model || "text-embedding-v1",
              input: { text: texts }
            })
          }
        );
        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Qianwen embedding error: ${resp.status} ${err}`);
        }
        const data = await resp.json();
        if (!data.output?.embeddings?.length) {
          throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
        }
        return data.output.embeddings.map((e) => e.embedding);
      }
      // ---- OpenAI-Compatible (generic endpoint — user provides baseURL + apiKey) ----
      async embedOpenAICompat(texts) {
        const baseURL = this.config.baseURL;
        const apiKey = this.config.apiKey;
        if (!baseURL || !apiKey) {
          throw new Error("openai-compat provider requires both baseURL and apiKey in config");
        }
        const resp = await fetchWithTimeout(`${baseURL}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: this.config.model || "text-embedding-3-small",
            input: texts
          })
        });
        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`OpenAI-compatible embedding error: ${resp.status} ${err}`);
        }
        const data = await resp.json();
        if (!data.data?.length) {
          throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
        }
        return data.data.map((item) => item.embedding);
      }
      // ---- OpenAI ----
      async embedOpenAI(texts) {
        const { OpenAI } = await import("openai");
        const client = new OpenAI({
          apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
          timeout: FETCH_TIMEOUT_MS
        });
        const model = this.config.model || "text-embedding-3-small";
        const resp = await client.embeddings.create({ model, input: texts });
        return resp.data.map((item) => item.embedding);
      }
      // ---- Jina AI (free tier) ----
      async embedJina(texts) {
        const apiKey = this.config.apiKey || process.env.JINA_API_KEY || "";
        const model = this.config.model || "jina-embeddings-v5-small";
        const resp = await fetchWithTimeout("https://api.jina.ai/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}
          },
          body: JSON.stringify({ model, input: texts })
        });
        if (!resp.ok) throw new Error(`Jina error: ${resp.status}`);
        const data = await resp.json();
        return data.data.map((item) => item.embedding);
      }
      // ---- Cohere (free tier) ----
      async embedCohere(texts) {
        const apiKey = this.config.apiKey || process.env.COHERE_API_KEY || "";
        const resp = await fetchWithTimeout("https://api.cohere.ai/v1/embed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "embed-english-v3.0",
            texts,
            input_type: "search_document"
          })
        });
        if (!resp.ok) throw new Error(`Cohere error: ${resp.status}`);
        const data = await resp.json();
        return data.embeddings;
      }
      // ---- Ollama (local free) ----
      async embedOllama(texts) {
        const baseURL = (this.config.baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
        const model = this.config.model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
        const resp = await fetchWithTimeout(`${baseURL}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, input: texts })
        });
        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Ollama embedding error: ${resp.status} ${err}`);
        }
        const data = await resp.json();
        if (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0])) {
          return data.embeddings;
        } else if (Array.isArray(data.embeddings)) {
          return [data.embeddings];
        }
        throw new Error(`Unexpected Ollama response: ${JSON.stringify(data)}`);
      }
    };
  }
});

// src/hooks/hawk-recall/handler.ts
import * as path3 from "path";
import { homedir as homedir3 } from "os";

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
var MAX_CHUNK_SIZE = parseInt(process.env.HAWK_MAX_CHUNK_SIZE || "2000", 10);
var MIN_CHUNK_SIZE = parseInt(process.env.HAWK_MIN_CHUNK_SIZE || "20", 10);
var MAX_TEXT_LEN = parseInt(process.env.HAWK_MAX_TEXT_LEN || "5000", 10);
var DEDUP_SIMILARITY = parseFloat(process.env.HAWK_DEDUP_SIMILARITY || "0.95");
var MEMORY_TTL_MS = parseInt(process.env.HAWK_MEMORY_TTL_MS || String(30 * 24 * 60 * 60 * 1e3), 10);
var INITIAL_RELIABILITY = parseFloat(process.env.HAWK_INITIAL_RELIABILITY || "0.5");
var RELIABILITY_BOOST_CONFIRM = parseFloat(process.env.HAWK_RELIABILITY_BOOST_CONFIRM || "0.1");
var RELIABILITY_PENALTY_CORRECT = parseFloat(process.env.HAWK_RELIABILITY_PENALTY_CORRECT || "0.3");
var RELIABILITY_THRESHOLD_HIGH = parseFloat(process.env.HAWK_RELIABILITY_THRESHOLD_HIGH || "0.7");
var RELIABILITY_THRESHOLD_MEDIUM = parseFloat(process.env.HAWK_RELIABILITY_THRESHOLD_MEDIUM || "0.4");
var FORGET_GRACE_DAYS = parseInt(process.env.HAWK_FORGET_GRACE_DAYS || "30", 10);
var RECENCY_GRACE_DAYS = parseInt(process.env.HAWK_RECENCY_GRACE_DAYS || "30", 10);
var RECENCY_DECAY_RATE = parseFloat(process.env.HAWK_RECENCY_DECAY_RATE || "0.95");
var RECENCY_FACTOR_FLOOR = parseFloat(process.env.HAWK_RECENCY_FACTOR_FLOOR || "0.3");
var CONSISTENCY_MAX = parseFloat(process.env.HAWK_CONSISTENCY_MAX || "1.5");
var CORRECTION_PENALTY_MULTIPLIER = parseFloat(process.env.HAWK_CORRECTION_PENALTY_MULTIPLIER || "0.7");
var DECAY_RATE_HIGH_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_HIGH || "0.2");
var DECAY_RATE_MEDIUM_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_MEDIUM || "0.8");
var DECAY_RATE_LOW_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_LOW || "1.5");
var COLD_START_GRACE_DAYS = parseInt(process.env.HAWK_COLD_START_GRACE_DAYS || "7", 10);
var COLD_START_DECAY_MULTIPLIER = parseFloat(process.env.HAWK_COLD_START_DECAY_MULTIPLIER || "0.1");
var CONFLICT_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_CONFLICT_THRESHOLD || "0.6");
var ENTITY_DEDUP_THRESHOLD = parseFloat(process.env.HAWK_ENTITY_DEDUP_THRESHOLD || "0.75");
var ENTITY_DEDUP_SESSION_WINDOW = parseInt(process.env.HAWK_ENTITY_DEDUP_SESSION_WINDOW || "10", 10);

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
          expires_at: 0,
          created_at: Date.now(),
          access_count: 0,
          last_accessed_at: Date.now(),
          metadata: "{}",
          source_type: "text"
        });
        const table = makeArrowTable([sampleRow]);
        this.table = await this.db.createTable(TABLE_NAME, table);
        await this.table.delete(`id = '__init__'`);
      } else {
        this.table = await this.db.openTable(TABLE_NAME);
        try {
          await this.table.alterAddColumns([
            { name: "expires_at", type: { type: "int64" } },
            { name: "created_at", type: { type: "int64" } },
            { name: "source_type", type: { type: "utf8" } },
            { name: "deleted_at", type: { type: "int64" } },
            { name: "reliability", type: { type: "float" } },
            { name: "verification_count", type: { type: "int32" } },
            { name: "last_verified_at", type: { type: "int64" } },
            { name: "locked", type: { type: "int8" } },
            { name: "correction_history", type: { type: "utf8" } },
            { name: "session_id", type: { type: "utf8" } },
            { name: "updated_at", type: { type: "int64" } },
            { name: "scope_mem", type: { type: "utf8" } },
            { name: "importance_override", type: { type: "float" } },
            { name: "cold_start_until", type: { type: "int64" } }
          ]);
        } catch (_) {
        }
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
      source_type: data.source_type
    };
  }
  /**
   * Internal: run a query and return all rows as plain objects
   * (LanceDB 0.26.x uses toArray(), not toList())
   */
  async _queryAll(limit = BM25_QUERY_LIMIT) {
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
  computeEffectiveReliability(base, verificationCount, lastVerifiedAt, correctionCount) {
    let recencyFactor = 1;
    if (lastVerifiedAt !== null) {
      const daysSince = (Date.now() - lastVerifiedAt) / 864e5;
      if (daysSince > RECENCY_GRACE_DAYS) {
        const decayCycles = (daysSince - RECENCY_GRACE_DAYS) / RECENCY_GRACE_DAYS;
        recencyFactor = Math.max(RECENCY_FACTOR_FLOOR, Math.pow(RECENCY_DECAY_RATE, decayCycles));
      }
    }
    const confirmBoost = Math.min(1 + verificationCount * 0.05, CONSISTENCY_MAX);
    const correctionPenalty = Math.pow(CORRECTION_PENALTY_MULTIPLIER, correctionCount);
    const effective = base * recencyFactor * confirmBoost * correctionPenalty;
    return Math.max(0, Math.min(1, effective));
  }
  _rowToMemory(r) {
    const correctionHistory = typeof r.correction_history === "string" ? JSON.parse(r.correction_history || "[]") : r.correction_history || [];
    return {
      id: r.id,
      text: r.text,
      vector: r.vector || [],
      category: r.category,
      scope: r.scope_mem ?? "personal",
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
      scope: r.scope_mem ?? "personal",
      importanceOverride: r.importance_override ?? 1,
      coldStartUntil: r.cold_start_until !== null ? Number(r.cold_start_until) : null,
      metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata || "{}") : r.metadata || {},
      source_type: r.source_type || "text"
    };
  }
  _rowToRetrieved(r, score, matchReason) {
    const base = r.reliability ?? INITIAL_RELIABILITY;
    const correctionHistory = typeof r.correction_history === "string" ? JSON.parse(r.correction_history || "[]") : r.correction_history || [];
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
      metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata || "{}") : r.metadata || {},
      source_type: r.source_type || "text",
      reliability: effective,
      reliabilityLabel: effective >= 0.7 ? "\u2705" : effective >= 0.4 ? "\u26A0\uFE0F" : "\u274C",
      locked: r.locked === 1,
      correctionCount,
      baseReliability: base,
      sessionId: r.session_id ?? null,
      createdAt: Number(r.created_at ?? Date.now()),
      updatedAt: Number(r.updated_at ?? Date.now()),
      scope: r.scope_mem ?? "personal",
      importanceOverride: r.importance_override ?? 1,
      coldStartUntil: r.cold_start_until !== null ? Number(r.cold_start_until) : null,
      matchReason
    };
  }
  async store(entry, sessionId) {
    if (!this.table) await this.init();
    const now = Date.now();
    const correctionHistory = entry.correctionHistory ?? [];
    const scope2 = entry.scope ?? "personal";
    const coldStartUntil = entry.coldStartUntil ?? now + COLD_START_GRACE_DAYS * 864e5;
    const row = this._makeRow({
      id: entry.id,
      text: entry.text,
      vector: entry.vector,
      category: entry.category,
      scope: entry.scope ?? "global",
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
      session_id: sessionId ?? null,
      updated_at: now,
      scope_mem: scope2,
      importance_override: entry.importanceOverride ?? 1,
      cold_start_until: coldStartUntil,
      metadata: JSON.stringify(entry.metadata || {}),
      source_type: entry.source_type || "text"
    });
    await this.table.add([row]);
  }
  async search(queryVector, topK, minScore, scope, sourceTypes) {
    if (!this.table) await this.init();
    let results = await this.table.search(queryVector).limit(topK * 4).toArray();
    results = results.filter((r) => r.deleted_at === null);
    if (scope) {
      results = results.filter((r) => r.scope === scope);
    }
    if (sourceTypes && sourceTypes.length > 0) {
      results = results.filter((r) => {
        const type = r.source_type || "text";
        return sourceTypes.includes(type);
      });
    }
    const now = Date.now();
    results = results.filter((r) => {
      const expiresAt = Number(r.expires_at || 0);
      return expiresAt === 0 || expiresAt > now;
    });
    const retrieved = [];
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
  async _getAccessCount(id) {
    const rows = await this.table.query().where(`id = '${id.replace(/'/g, "''")}'`).limit(1).toArray();
    return rows.length ? Number(rows[0].access_count || 0) : 0;
  }
  async incrementAccess(id) {
    try {
      const current = await this._getAccessCount(id);
      await this.table.update(
        { access_count: String(current + 1), last_accessed_at: String(Date.now()) },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch {
    }
  }
  async listRecent(limit = 10) {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(limit * 2).toArray();
    return rows.filter((r) => r.deleted_at === null).slice(0, limit).map((r) => this._rowToMemory(r));
  }
  async count() {
    if (!this.table) await this.init();
    return await this.table.countRows();
  }
  async getAllTexts() {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toArray();
    return rows.filter((r) => r.deleted_at === null).map((r) => ({ id: r.id, text: r.text }));
  }
  async getById(id) {
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
  async getAllMemories(agentId) {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toArray();
    return rows.filter((r) => r.deleted_at === null).filter((r) => {
      if (!agentId) return true;
      const owner = r.metadata?.owner_agent ?? r.metadata?.ownerAgent ?? null;
      return owner === null || owner === agentId;
    }).map((r) => this._rowToMemory(r));
  }
  /** Batch fetch multiple memories by ID in a single query — avoids N+1 round-trips */
  async getByIds(ids) {
    if (!this.table) await this.init();
    const results = /* @__PURE__ */ new Map();
    if (!ids.length) return results;
    try {
      const predicate = ids.map((id) => `id = '${id.replace(/'/g, "''")}'`).join(" OR ");
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
          correctionHistory: typeof r.correction_history === "string" ? JSON.parse(r.correction_history || "[]") : r.correction_history || [],
          sessionId: r.session_id ?? null,
          createdAt: Number(r.created_at ?? Date.now()),
          updatedAt: Number(r.updated_at ?? Date.now()),
          metadata: JSON.parse(r.metadata || "{}"),
          source_type: r.source_type || "text"
        });
      }
    } catch {
    }
    return results;
  }
  /**
   * 软删除：标记记忆为已遗忘（recall 时自动过滤）
   * 30 天后 purgeForgotten 会彻底删除
   * 注意：锁定的记忆无法被遗忘
   */
  async forget(id) {
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
  async verify(id, confirmed, correctedText) {
    if (!this.table) await this.init();
    try {
      const memory = await this.getById(id);
      if (!memory) return false;
      const now = Date.now();
      const newReliability = memory.locked ? memory.reliability : confirmed ? Math.min(1, memory.reliability + RELIABILITY_BOOST_CONFIRM) : Math.max(0, memory.reliability - RELIABILITY_PENALTY_CORRECT);
      const correctionHistory = [...memory.correctionHistory || []];
      if (!confirmed && correctedText) {
        correctionHistory.push({
          ts: now,
          oldText: memory.text,
          newText: correctedText
        });
      }
      await this.table.update(
        {
          reliability: String(newReliability),
          verification_count: String(memory.verificationCount + 1),
          last_verified_at: String(now),
          correction_history: JSON.stringify(correctionHistory),
          ...!confirmed && correctedText ? { text: String(correctedText) } : {}
        },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
      return true;
    } catch {
      return false;
    }
  }
  /**
   * 更新记忆（用于 entity merge、用户编辑、标记重要）
   * 更新 updatedAt
   */
  async update(id, updates) {
    if (!this.table) await this.init();
    try {
      const existing = await this.getById(id);
      if (!existing) return false;
      await this.table.delete(`id = '${id.replace(/'/g, "''")}'`);
      const updated = {
        ...existing,
        text: updates.text ?? existing.text,
        category: updates.category ?? existing.category,
        scope: updates.scope ?? existing.scope,
        importance: updates.importance ?? existing.importance,
        importanceOverride: updates.importanceOverride ?? existing.importanceOverride,
        updatedAt: Date.now(),
        vector: existing.vector
      };
      await this.store(updated, existing.sessionId ?? void 0);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * 标记记忆为重要（调整 importanceOverride）
   * multiplier: 1.0=不变，2.0=加倍重要，0.5=降低
   */
  async markImportant(id, multiplier = 2) {
    return this.update(id, { importanceOverride: multiplier });
  }
  /**
   * SoulForge 验证通过后的回写
   * - 将 soul_verified 标记设为 true（持久化到 metadata）
   * - 记录 soul_pattern_id 和 verified_text（通过 metadata）
   * - 不改 reliability（hawk-verify CLI 自己算 boost）
   */
  async verifySoulPattern(id, patternId, patternText, boostAmount) {
    if (!this.table) await this.init();
    try {
      const existing = await this.getById(id);
      if (!existing) return false;
      const metadata = { ...existing.metadata };
      metadata.soulVerified = true;
      metadata.soulPatternId = patternId;
      metadata.soulVerifiedText = patternText.slice(0, 200);
      metadata.soulVerifiedAt = Date.now();
      const newReliability = Math.min(1, existing.reliability + boostAmount);
      await this.table.update(
        {
          reliability: String(newReliability),
          verification_count: String(existing.verificationCount + 1),
          last_verified_at: String(Date.now()),
          metadata: JSON.stringify(metadata)
        },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
      return true;
    } catch {
      return false;
    }
  }
  /**
   * 检测与新内容可能冲突的记忆
   * 策略：在同类记忆中找相似度高但内容不同的
   */
  async detectConflicts(newText, category) {
    const all = await this.getAllMemories();
    const sameCategory = all.filter((m) => m.category === category);
    const newKeywords = this._extractKeywords(newText);
    const conflicts = [];
    for (const m of sameCategory) {
      const memKeywords = this._extractKeywords(m.text);
      const overlap = newKeywords.filter((k) => memKeywords.includes(k)).length;
      const union = (/* @__PURE__ */ new Set([...newKeywords, ...memKeywords])).size;
      const similarity = union > 0 ? overlap / union : 0;
      if (similarity >= CONFLICT_SIMILARITY_THRESHOLD && similarity < 0.95) {
        const newWords = new Set(newKeywords);
        const oldWords = new Set(memKeywords);
        const diff = [...newWords].filter((w) => !oldWords.has(w)).length + [...oldWords].filter((w) => !newWords.has(w)).length;
        if (diff > 2) {
          conflicts.push(m);
        }
      }
    }
    return conflicts;
  }
  /**
   * 获取需要主动回顾的记忆（最低可靠性，未锁定的）
   */
  async getReviewCandidates(minReliability = 0.5, batchSize = 5) {
    const all = await this.getAllMemories();
    return all.filter((m) => !m.locked && m.reliability < minReliability).sort((a, b) => a.reliability - b.reliability).slice(0, batchSize);
  }
  /**
   * 查找与给定文本相似的 entity 记忆（用于 dedup）
   * 使用关键词 Jaccard 相似度，阈值 ENTITY_DEDUP_THRESHOLD
   */
  async findSimilarEntity(text, excludeId) {
    const all = await this.getAllMemories();
    const keywords = this._extractKeywords(text);
    let best = null;
    for (const m of all) {
      if (m.category !== "entity") continue;
      if (excludeId && m.id === excludeId) continue;
      const memKeywords = this._extractKeywords(m.text);
      const overlap = keywords.filter((k) => memKeywords.includes(k)).length;
      const union = (/* @__PURE__ */ new Set([...keywords, ...memKeywords])).size;
      const score = union > 0 ? overlap / union : 0;
      if (!best || score > best.score) {
        best = { m, score };
      }
    }
    return best && best.score >= ENTITY_DEDUP_THRESHOLD ? best.m : null;
  }
  _extractKeywords(text) {
    const stopWords = /* @__PURE__ */ new Set(["\u7684", "\u4E86", "\u662F", "\u5728", "\u548C", "\u4E5F", "\u6709", "\u5C31", "\u4E0D", "\u6211", "\u4F60", "\u4ED6", "\u5979", "\u5B83", "\u4EEC", "\u8FD9", "\u90A3", "\u4E2A", "\u4E0E", "\u6216", "\u88AB", "\u4E3A", "\u4E0A", "\u4E0B", "\u6765", "\u53BB"]);
    const words = [];
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
  /**
   * 标记记忆为不可靠（效果反馈：recall 后用户否认）
   * 仅降低 reliability，不记录纠正历史，不改文本
   */
  async flagUnhelpful(id, penalty = 0.05) {
    if (!this.table) await this.init();
    try {
      const mem = await this.getById(id);
      if (!mem) return false;
      const newRel = Math.max(0, mem.reliability - penalty);
      const newVerifications = mem.verificationCount + 1;
      await this.table.update(
        { reliability: String(newRel), verification_count: String(newVerifications), last_verified_at: String(Date.now()) },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
      return true;
    } catch {
      return false;
    }
  }
  async lock(id) {
    if (!this.table) await this.init();
    try {
      await this.table.update(
        { locked: "1" },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
      return true;
    } catch {
      return false;
    }
  }
  async unlock(id) {
    if (!this.table) await this.init();
    try {
      await this.table.update(
        { locked: "0" },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
      return true;
    } catch {
      return false;
    }
  }
  /**
   * 记忆衰减：降低长期未访问记忆的 importance
   * 差异化：✅ 记忆几乎不衰减，⚠️ 正常衰减，❌ 快速消亡
   * 锁定的记忆完全跳过衰减
   */
  async decay() {
    if (!this.table) await this.init();
    const ARCHIVE_TTL_DAYS = 180;
    const IMPORTANCE_THRESHOLD_LOW = 0.3;
    const IMPORTANCE_THRESHOLD_HIGH = 0.8;
    const LAYER_THRESHOLDS = { working: 0, short: 3, long: 10, archive: 100 };
    const LAYERS = ["working", "short", "long", "archive"];
    function computeLayer(importance, accessCount) {
      if (accessCount >= LAYER_THRESHOLDS.long || importance >= IMPORTANCE_THRESHOLD_HIGH) return "long";
      if (accessCount >= LAYER_THRESHOLDS.short || importance >= IMPORTANCE_THRESHOLD_HIGH * 0.75) return "short";
      if (importance < IMPORTANCE_THRESHOLD_LOW) return "archive";
      return "working";
    }
    function getDecayMultiplier(reliability) {
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
        const daysInGrace = Math.ceil((m.coldStartUntil - now) / 864e5);
        if (daysInGrace > 1) {
          const newImportance = m.importance * Math.pow(COLD_START_DECAY_MULTIPLIER, 0.5);
          if (Math.abs(newImportance - m.importance) > 1e-3) {
            try {
              await this.table.update(
                { importance: String(newImportance) },
                { where: `id = '${m.id.replace(/'/g, "''")}'` }
              );
              updated++;
            } catch {
            }
          }
        }
        continue;
      }
      const daysIdle = Math.max(0, Math.floor((now - m.lastAccessedAt) / 864e5));
      if (m.scope === "archive") {
        if (daysIdle > ARCHIVE_TTL_DAYS) {
          try {
            await this.table.delete(`id = '${m.id.replace(/'/g, "''")}'`);
            deleted++;
          } catch {
          }
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
            await this.table.update(
              { importance: String(newImportance), scope: newLayer },
              { where: `id = '${m.id.replace(/'/g, "''")}'` }
            );
            updated++;
          } catch {
          }
        } else if (newImportance !== m.importance) {
          try {
            await this.table.update(
              { importance: String(newImportance) },
              { where: `id = '${m.id.replace(/'/g, "''")}'` }
            );
            updated++;
          } catch {
          }
        }
      }
    }
    const purged = await this.purgeForgotten();
    deleted += purged;
    try {
      await this.table?.trygc();
    } catch {
    }
    return { updated, deleted };
  }
  /**
   * 彻底删除软删除超过 graceDays 天的记忆
   */
  async purgeForgotten(graceDays = FORGET_GRACE_DAYS) {
    if (!this.table) await this.init();
    const cutoff = Date.now() - graceDays * 864e5;
    let deleted = 0;
    try {
      const rows = await this.table.query().limit(BM25_QUERY_LIMIT).toArray();
      const toDelete = rows.filter(
        (r) => r.deleted_at !== null && Number(r.deleted_at) < cutoff
      );
      for (const r of toDelete) {
        try {
          await this.table.delete(`id = '${r.id.replace(/'/g, "''")}'`);
          deleted++;
        } catch {
        }
      }
    } catch {
    }
    return deleted;
  }
};

// src/config.ts
import * as path2 from "path";
import * as os2 from "os";
var OPENCLAW_CONFIG_PATH = path2.join(os2.homedir(), ".openclaw", "openclaw.json");
var DEFAULT_CONFIG = {
  embedding: {
    provider: "qianwen",
    // 阿里云 DashScope, 国内首选
    apiKey: "",
    model: "text-embedding-v1",
    baseURL: "https://dashscope.aliyuncs.com/api/v1",
    dimensions: 1024
    // Qianwen text-embedding-v1 输出 1024 维
  },
  llm: {
    provider: "groq",
    // Default: free groq Llama-3, no API key needed
    apiKey: "",
    model: "llama-3.3-70b-versatile",
    baseURL: ""
  },
  recall: {
    topK: 5,
    minScore: DEFAULT_MIN_SCORE,
    // from constants.ts
    injectEmoji: "\u{1F985}"
  },
  audit: {
    enabled: true
  },
  capture: {
    enabled: true,
    maxChunks: 3,
    importanceThreshold: 0.5,
    ttlMs: 30 * 24 * 60 * 60 * 1e3,
    // 30 days
    maxChunkSize: 2e3,
    minChunkSize: 20,
    dedupSimilarity: 0.95
  },
  python: {
    pythonPath: "python3.12",
    hawkDir: "~/.openclaw/hawk"
  }
};
var configPromise = null;
async function getConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      const config = { ...DEFAULT_CONFIG };
      if (process.env.OLLAMA_BASE_URL) {
        config.embedding.provider = "ollama";
        config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
        config.embedding.model = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
        config.embedding.dimensions = 768;
      } else if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) {
        config.embedding.provider = "qianwen";
        config.embedding.apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "";
        config.embedding.baseURL = "https://dashscope.aliyuncs.com/api/v1";
        config.embedding.model = "text-embedding-v1";
        config.embedding.dimensions = 1024;
      } else if (process.env.JINA_API_KEY) {
        config.embedding.provider = "jina";
        config.embedding.apiKey = process.env.JINA_API_KEY;
        config.embedding.baseURL = "";
        config.embedding.model = "jina-embeddings-v5-small";
        config.embedding.dimensions = 1024;
      } else if (process.env.OPENAI_API_KEY) {
        config.embedding.provider = "openai";
        config.embedding.apiKey = process.env.OPENAI_API_KEY;
        config.embedding.baseURL = "";
        config.embedding.model = "text-embedding-3-small";
        config.embedding.dimensions = 1536;
      } else if (process.env.COHERE_API_KEY) {
        config.embedding.provider = "cohere";
        config.embedding.apiKey = process.env.COHERE_API_KEY;
        config.embedding.baseURL = "";
        config.embedding.model = "embed-english-v3.0";
        config.embedding.dimensions = 1024;
      }
      return config;
    })();
  }
  return configPromise;
}
function hasEmbeddingProvider() {
  return !!(process.env.OLLAMA_BASE_URL || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.JINA_API_KEY || process.env.OPENAI_API_KEY || process.env.COHERE_API_KEY);
}

// src/retriever.ts
var HybridRetriever = class _HybridRetriever {
  db;
  embedder;
  bm25 = null;
  // rank_bm25.BM25Okapi
  corpus = [];
  corpusIds = [];
  noisePrototypes = [];
  bm25Dirty = false;
  // set true when new memories are stored
  bm25BuildPromise = null;
  // prevents concurrent rebuilds
  lastIndexedMemoryCount = 0;
  // for incremental tracking
  pendingTexts = [];
  // texts added since last full rebuild
  pendingIds = [];
  constructor(db2, embedder2) {
    this.db = db2;
    this.embedder = embedder2;
  }
  /** Call this after store() to invalidate the BM25 index — next search() will rebuild incrementally */
  markDirty() {
    this.bm25Dirty = true;
  }
  // ---------- BM25 Setup ----------
  /** Rebuild threshold: only full-rebuild if more than 10 new memories since last build */
  static BM25_REBUILD_THRESHOLD = 10;
  async _ensureBm25Index() {
    if (!this.bm25Dirty && this.bm25) return;
    if (this.bm25BuildPromise) return this.bm25BuildPromise;
    this.bm25BuildPromise = this._buildBm25Index();
    await this.bm25BuildPromise;
    this.bm25BuildPromise = null;
    this.bm25Dirty = false;
  }
  /**
   * Incremental BM25: only full-rebuild if new memories exceed threshold.
   * Otherwise just add to pending corpus and merge at search time.
   */
  async _ensureBm25IndexIncremental() {
    if (!this.bm25Dirty && this.bm25) return;
    if (this.bm25BuildPromise) return this.bm25BuildPromise;
    this.bm25BuildPromise = this._buildBm25IndexIncremental();
    await this.bm25BuildPromise;
    this.bm25BuildPromise = null;
    this.bm25Dirty = false;
  }
  async _buildBm25Index() {
    try {
      const { BM25Okapi } = await import("rank_bm25");
      const allMemories = await this.db.getAllTexts();
      if (!allMemories.length) return;
      this.corpusIds = allMemories.map((m) => m.id);
      this.corpus = allMemories.map((m) => m.text.toLowerCase());
      this.lastIndexedMemoryCount = allMemories.length;
      this.pendingTexts = [];
      this.pendingIds = [];
      this.bm25 = new BM25Okapi(this.corpus);
    } catch {
      console.warn("[hawk-bridge] rank_bm25 not available, BM25 disabled");
    }
  }
  /**
   * Incremental BM25: check if new memories exceed threshold.
   * If few: accumulate in pending, merge at search time.
   * If many: full rebuild.
   */
  async _buildBm25IndexIncremental() {
    try {
      const { BM25Okapi } = await import("rank_bm25");
      const allMemories = await this.db.getAllTexts();
      if (!allMemories.length) return;
      const total = allMemories.length;
      const newCount = total - this.lastIndexedMemoryCount;
      if (newCount <= 0 || newCount > _HybridRetriever.BM25_REBUILD_THRESHOLD) {
        this.corpusIds = allMemories.map((m) => m.id);
        this.corpus = allMemories.map((m) => m.text.toLowerCase());
        this.lastIndexedMemoryCount = total;
        this.pendingTexts = [];
        this.pendingIds = [];
        this.bm25 = new BM25Okapi(this.corpus);
      } else {
        const newMemories = allMemories.slice(-newCount);
        for (const m of newMemories) {
          this.pendingIds.push(m.id);
          this.pendingTexts.push(m.text.toLowerCase());
        }
        this.lastIndexedMemoryCount = total;
        const fullCorpus = [...this.corpus, ...this.pendingTexts];
        const fullIds = [...this.corpusIds, ...this.pendingIds];
        this.corpus = fullCorpus;
        this.corpusIds = fullIds;
        this.pendingTexts = [];
        this.pendingIds = [];
        this.bm25 = new BM25Okapi(fullCorpus);
      }
    } catch {
      console.warn("[hawk-bridge] rank_bm25 not available, BM25 disabled");
    }
  }
  bm25Score(query) {
    if (!this.bm25) return this.corpus.map(() => 0);
    const tokens = query.toLowerCase().split(/\s+/);
    return this.bm25.getScores(tokens);
  }
  // ---------- Noise Prototype Setup ----------
  async buildNoisePrototypes() {
    if (!hasEmbeddingProvider()) {
      console.log("[hawk-bridge] No embedding provider, skipping noise prototypes");
      return;
    }
    const noiseTexts = [
      "\u597D\u7684\uFF0C\u660E\u767D\u4E86",
      "\u6536\u5230\uFF0C\u8C22\u8C22",
      "ok",
      "\u597D\u7684",
      "\u4E86\u89E3",
      "\u6CA1\u95EE\u9898",
      "\u5BF9",
      "\u662F\u7684",
      "\u54C8\u54C8",
      "\u55EF\u55EF",
      "\u597D\u7684\u597D\u7684",
      "\u6536\u5230\u6536\u5230",
      "OK",
      "\u{1F44D}",
      "\u2705",
      "\u597D\u7684\uFF0C\u8F9B\u82E6\u4E86"
    ];
    try {
      if (!this.noisePrototypes.length) {
        this.noisePrototypes = await this.embedder.embed(noiseTexts);
      }
    } catch (e) {
      console.warn("[hawk-bridge] Noise prototype embedding failed, noise filter disabled:", e.message);
    }
  }
  isNoise(embedding) {
    for (const prototype of this.noisePrototypes) {
      const sim = cosineSimilarity(embedding, prototype);
      if (sim >= NOISE_SIMILARITY_THRESHOLD) return true;
    }
    return false;
  }
  // ---------- RRF Fusion ----------
  rrfFusion(vectorResults, bm25Results) {
    const rrfMap = /* @__PURE__ */ new Map();
    for (let rank = 0; rank < vectorResults.length; rank++) {
      const item = vectorResults[rank];
      const score = 1 / (RRF_K + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, bm25Score: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * RRF_VECTOR_WEIGHT,
        // vector weight
        vectorScore: item.score,
        bm25Score: existing.bm25Score
      });
    }
    for (let rank = 0; rank < bm25Results.length; rank++) {
      const item = bm25Results[rank];
      const score = 1 / (RRF_K + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, bm25Score: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * (1 - RRF_VECTOR_WEIGHT),
        // BM25 weight
        vectorScore: existing.vectorScore,
        bm25Score: item.score
      });
    }
    return Array.from(rrfMap.entries()).map(([id, v]) => ({ id, ...v }));
  }
  // ---------- Cross-encoder Rerank ----------
  async rerank(query, candidates, topN) {
    if (candidates.length <= 2) return candidates.map((c) => ({ id: c.id, text: c.text, rerankScore: c.score }));
    try {
      const apiKey = process.env.JINA_RERANKER_API_KEY || process.env.OPENAI_API_KEY;
      const useJina = !!process.env.JINA_RERANKER_API_KEY;
      if (useJina) {
        const resp = await fetch("https://api.jina.ai/v1/rerank", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "jina-reranker-v1-base-en",
            query,
            documents: candidates.map((c) => c.text),
            top_n: Math.min(topN * 2, candidates.length)
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          return data.results.map((r) => ({
            id: candidates[r.index].id,
            text: candidates[r.index].text,
            rerankScore: r.relevance_score
          }));
        }
      }
      const queryVec = await this.embedder.embedQuery(query);
      const docVecs = await this.embedder.embed(candidates.map((c) => c.text));
      const scored = candidates.map((c, i) => ({
        id: c.id,
        text: c.text,
        rerankScore: cosineSimilarity(queryVec, docVecs[i])
      }));
      return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topN * 2);
    } catch (e) {
      console.warn("[hawk-bridge] rerank failed, using RRF scores:", e);
      return candidates.slice(0, topN).map((c) => ({ id: c.id, text: c.text, rerankScore: c.score }));
    }
  }
  // ---------- Main Search Pipeline ----------
  async search(query, topK = 5, scope, sourceTypes) {
    topK = Math.min(Math.max(1, topK), 100);
    await this._ensureBm25IndexIncremental();
    if (!this.noisePrototypes.length) await this.buildNoisePrototypes();
    const hasEmbedding = hasEmbeddingProvider();
    if (hasEmbedding) {
      try {
        const queryVector = await this.embedder.embedQuery(query);
        const vectorResults = await this.db.search(queryVector, topK * VECTOR_SEARCH_MULTIPLIER, 0, scope, sourceTypes);
        const vectorRanked = vectorResults.map((r, i) => ({ id: r.id, score: 1 - i * 0.01, text: r.text })).sort((a, b) => b.score - a.score);
        const bm25Scores2 = this.bm25Score(query);
        const bm25Ranked2 = this.corpusIds.map((id, i) => ({ id, score: bm25Scores2[i], text: this.corpus[i] })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, topK * BM25_SEARCH_MULTIPLIER);
        const fused = this.rrfFusion(vectorRanked, bm25Ranked2);
        const fusedIds = fused.map((f) => f.id);
        const fetched = await this.db.getByIds(fusedIds);
        const noiseFiltered = [];
        for (const item of fused) {
          const memory = fetched.get(item.id);
          if (!memory) continue;
          if (this.isNoise(memory.vector)) continue;
          noiseFiltered.push({ ...item, text: memory.text, vector: memory.vector });
        }
        const candidates = noiseFiltered.slice(0, topK * RERANK_CANDIDATE_MULTIPLIER).map((item) => ({
          id: item.id,
          text: item.text,
          score: item.rrfScore
        }));
        const reranked = await this.rerank(query, candidates, topK);
        const idToRerank = new Map(reranked.map((r) => [r.id, r.rerankScore]));
        const results2 = [];
        for (const item of noiseFiltered) {
          const rerankScore = idToRerank.get(item.id);
          if (rerankScore === void 0) continue;
          const memory = fetched.get(item.id);
          if (!memory) continue;
          results2.push({
            id: item.id,
            text: memory.text,
            score: rerankScore,
            category: memory.category,
            metadata: memory.metadata
          });
          if (results2.length >= topK) break;
        }
        return results2;
      } catch (err) {
        console.warn("[hawk-bridge] Vector search failed, falling back to BM25-only:", err);
      }
    }
    console.log("[hawk-bridge] Running in BM25-only mode (no embedding API)");
    const bm25Scores = this.bm25Score(query);
    const bm25Ranked = this.corpusIds.map((id, i) => ({ id, score: bm25Scores[i], text: this.corpus[i] })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, topK * 3);
    const bm25Ids = bm25Ranked.map((b) => b.id);
    const fetchedBm25 = await this.db.getByIds(bm25Ids);
    const idToScore = new Map(bm25Ranked.map((item) => [item.id, item.score]));
    const results = [];
    for (const item of bm25Ranked) {
      const score = idToScore.get(item.id);
      if (score === void 0) continue;
      const memory = fetchedBm25.get(item.id);
      if (!memory) continue;
      results.push({
        id: item.id,
        text: memory.text,
        score,
        category: memory.category,
        metadata: memory.metadata
      });
      if (results.length >= topK) break;
    }
    return results;
  }
};
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// src/hooks/hawk-recall/handler.ts
var INJECTION_LIMIT = 5;
var MAX_INJECTION_CHARS = 2e3;
var COMPOSITE_WEIGHT_RELIABILITY = 0.4;
var COMPOSITE_WEIGHT_SCORE = 0.6;
var sharedDb = null;
function getSharedDb() {
  if (!sharedDb) sharedDb = new HawkDB();
  return sharedDb;
}
var bm25DirtyGlobal = false;
function markBm25Dirty() {
  bm25DirtyGlobal = true;
}
var retrieverPromise = null;
async function getRetriever() {
  if (!retrieverPromise) {
    retrieverPromise = (async () => {
      const config = await getConfig();
      const db2 = getSharedDb();
      await db2.init();
      const { Embedder: Embedder2 } = await Promise.resolve().then(() => (init_embeddings(), embeddings_exports));
      const embedder2 = new Embedder2(config.embedding);
      const r = new HybridRetriever(db2, embedder2);
      await r.buildNoisePrototypes();
      return r;
    })();
  }
  const retriever = await retrieverPromise;
  if (bm25DirtyGlobal) {
    retriever.markDirty();
    bm25DirtyGlobal = false;
  }
  return retriever;
}
var FORGET_PATTERNS = [/^忘掉\s*(.+)/, /^忘记\s*(.+)/, /^别记得\s*(.+)/, /^不用记\s*(.+)/, /^forget\s+(.+)/i, /^delete\s+(.+)/i];
var CORRECT_PATTERN = /^(?:纠正|correct)\s*[:：]\s*(.+)/i;
var LOCK_PATTERNS = [/^锁定\s*(.+)/, /^lock\s+(.+)/i];
var UNLOCK_PATTERNS = [/^解锁\s*(.+)/, /^unlock\s+(.+)/i];
var EDIT_PATTERN = /^hawk\s*编辑(?:\s*(\d+))?/i;
var HISTORY_PATTERN = /^hawk\s*历史(?:\s*[:：]\s*(.+))?/i;
var CHECK_PATTERN = /^hawk\s*检查(?:\s+(\d+))?/i;
var MEMORY_LIST_PATTERN = /^hawk\s*记忆(?:\s+([a-z]+))?(?:\s+(\d+))?$/i;
var IMPORTANT_PATTERN = /^hawk\s*重要\s*(\d+)(?:\s*×?([\d.]+))?$/i;
var UNIMPORTANT_PATTERN = /^hawk\s*不重要\s*(\d+)$/i;
var REVIEW_PATTERN = /^hawk\s*回顾(?:\s+(\d+))?$/i;
var SCOPE_PATTERN = /^hawk\s*(?:scope|作用域)\s*(\d+)\s+(personal|team|project)$/i;
var CONFLICT_PATTERN = /^hawk\s*冲突\s*(\d+)$/i;
var EXPORT_PATTERN = /^hawk\s*导出(?:\s+(.+?))?$/i;
var CLEAR_PATTERN = /^hawk\s*清空$/i;
var BATCHLOCK_PATTERN = /^hawk\s*锁定\s*all(?:\s+(.+))?$/i;
var BATCHUNLOCK_PATTERN = /^hawk\s*解锁\s*all$/i;
var COMPARE_PATTERN = /^hawk\s*对比\s*(\d+)\s+(\d+)$/i;
var PURGE_PATTERN = /^hawk\s*清理$/i;
var STATS_PATTERN = /^hawk\s*统计$/i;
var DENY_PATTERN = /^hawk\s*否认\s*(\d+)$/i;
function matchFirst(text, patterns) {
  for (const p of patterns) {
    const m = text.trim().match(p);
    if (m) return (m[1] ?? "").trim();
  }
  return null;
}
function relLabel(r) {
  return r >= 0.7 ? "\u2705" : r >= 0.4 ? "\u26A0\uFE0F" : "\u274C";
}
function fmtRel(m) {
  const r = m.reliability, b = m.baseReliability ?? r;
  return Math.abs(r - b) < 0.01 ? `${Math.round(r * 100)}%` : `${Math.round(r * 100)}%(\u57FA\u7840${Math.round(b * 100)}%)`;
}
function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function formatMemoryRow(m, idx) {
  const rel = relLabel(m.reliability);
  const tag = m.locked ? " \u{1F512}" : "";
  const imp = m.importanceOverride > 1.5 ? " \u2B50" : m.importanceOverride < 0.7 ? " \u2193" : "";
  const cold = m.coldStartUntil && Date.now() < m.coldStartUntil ? " \u{1F6E1}" : "";
  const corr = m.correctionCount > 0 ? ` [\u7EA0\u6B63\xD7${m.correctionCount}]` : "";
  const scope = m.scope !== "personal" ? ` [${m.scope}]` : "";
  return `${rel} ${fmtRel(m)}${tag}${imp}${cold}${corr}${scope} [${idx}] [${m.category}] ${m.text.slice(0, 75)}${m.text.length > 75 ? "..." : ""}`;
}
function formatRecallResults(memories, emoji) {
  if (!memories.length) return "";
  const lines = [`${emoji} ** hawk \u8BB0\u5FC6\u68C0\u7D22 **`];
  for (const m of memories) {
    const lock = m.locked ? " \u{1F512}" : "";
    const imp = m.importanceOverride > 1.5 ? " \u2B50" : "";
    const corr = m.correctionCount > 0 ? ` (\u7EA0\u6B63\xD7${m.correctionCount})` : "";
    const score = `(${(m.score * 100).toFixed(0)}%\u76F8\u5173)`;
    const reason = m.matchReason ? `
   \u2192 ${m.matchReason}` : "";
    lines.push(`${m.reliabilityLabel} ${score}${lock}${imp}${corr} [${m.category}] ${m.text}${reason}`);
  }
  return lines.join("\n");
}
function compressText(text, limit = 400) {
  if (text.length <= limit) return text;
  const first = text.slice(0, limit * 0.6);
  const breakIdx = Math.max(
    first.lastIndexOf("\u3002"),
    first.lastIndexOf("\n"),
    first.lastIndexOf("\uFF1A"),
    first.lastIndexOf(".")
  );
  const head = breakIdx > limit * 0.3 ? text.slice(0, breakIdx + 1) : first;
  const kw = extractKeywords(text).slice(0, 5);
  return `${head.slice(0, limit - kw.join("\u3001").length - 5)}... [\u5173\u952E\u8BCD: ${kw.join("\u3001")}]`;
}
function compositeScore(m) {
  return m.score * COMPOSITE_WEIGHT_SCORE + m.reliability * COMPOSITE_WEIGHT_RELIABILITY;
}
function extractKeywords(text) {
  const stop = /* @__PURE__ */ new Set(["\u7684", "\u4E86", "\u662F", "\u5728", "\u548C", "\u4E5F", "\u6709", "\u5C31", "\u4E0D", "\u6211", "\u4F60", "\u4ED6", "\u5979", "\u5B83", "\u4EEC", "\u8FD9", "\u90A3", "\u4E2A", "\u4E0E", "\u6216", "\u88AB", "\u4E3A", "\u4E0A", "\u4E0B", "\u6765", "\u53BB"]);
  const words = [];
  for (let i = 0; i < text.length - 1; i++) {
    const w = text.slice(i, i + 2);
    if (!stop.has(w)) words.push(w);
  }
  for (let i = 0; i < text.length - 2; i++) {
    const w = text.slice(i, i + 3);
    if (!stop.has(w)) words.push(w);
  }
  return [...new Set(words)];
}
function textSimilarity(a, b) {
  const kwA = extractKeywords(a);
  const kwB = extractKeywords(b);
  if (!kwA.length || !kwB.length) return 0;
  const overlap = kwA.filter((k) => kwB.includes(k)).length;
  const union = (/* @__PURE__ */ new Set([...kwA, ...kwB])).size;
  return union > 0 ? overlap / union : 0;
}
function computeMatchReason(query, memory) {
  const qKw = extractKeywords(query);
  const mKw = extractKeywords(memory.text);
  const overlap = qKw.filter((k) => mKw.includes(k));
  if (overlap.length === 0) return "";
  return `\u547D\u4E2D: "${overlap.slice(0, 3).join('", "')}"`;
}
async function findMemoryBySemanticMatch(db2, newContent) {
  const all = await db2.getAllMemories();
  if (!all.length) return null;
  const keywords = extractKeywords(newContent);
  let best = null;
  for (const m of all) {
    const memKw = extractKeywords(m.text);
    const overlap = keywords.filter((k) => memKw.includes(k)).length;
    const union = (/* @__PURE__ */ new Set([...keywords, ...memKw])).size;
    const jaccard = union > 0 ? overlap / union : 0;
    const lenPenalty = Math.min(m.text.length / Math.max(newContent.length, 1), newContent.length / Math.max(m.text.length, 1));
    const score = jaccard * 0.7 + lenPenalty * 0.3;
    if (!best || score > best.score) best = { id: m.id, score };
  }
  return best && best.score > 0.1 ? best : null;
}
var SANITIZE = [
  [/(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[\w-]{8,}["']?/gi, "$1: [REDACTED]"],
  [/\b1[3-9]\d{9}\b/g, "[PHONE_REDACTED]"],
  [/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, "[EMAIL_REDACTED]"],
  [/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, "[ID_REDACTED]"]
];
function sanitize(text) {
  let r = text;
  for (const [p, repl] of SANITIZE) r = r.replace(p, repl);
  return r;
}
var recallHandler = async (event) => {
  if (event.type !== "agent" || event.action !== "bootstrap") return;
  try {
    const config = await getConfig();
    const { topK, injectEmoji, minScore } = config.recall;
    const sessionEntry = event.context?.sessionEntry;
    if (!sessionEntry) return;
    const messages = sessionEntry.messages || [];
    let latestUserMessage = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "user" && msg.content) {
        latestUserMessage = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        break;
      }
    }
    if (!latestUserMessage?.trim()) return;
    const db2 = getSharedDb();
    await db2.init();
    const trimmed = latestUserMessage.trim();
    const sessionId = sessionEntry.sessionId ?? void 0;
    const ctx = event.context;
    if (m = trimmed.match(MEMORY_LIST_PATTERN)) {
      const category = m[1] || "";
      const page = Math.max(1, parseInt(m[2] || "1", 10));
      const PAGE_SIZE = 20;
      let all = await db2.getAllMemories();
      if (!all.length) {
        event.messages.push(`
${injectEmoji} \u8FD8\u6CA1\u6709\u4EFB\u4F55\u8BB0\u5FC6\u3002
`);
        return;
      }
      if (category && ["fact", "preference", "decision", "entity", "other"].includes(category)) {
        all = all.filter((x) => x.category === category);
      }
      const sorted2 = [...all].sort((a, b) => {
        if (a.locked !== b.locked) return a.locked ? -1 : 1;
        return b.reliability - a.reliability;
      });
      const totalPages = Math.ceil(sorted2.length / PAGE_SIZE);
      const pageItems = sorted2.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const lines = [`${injectEmoji} ** hawk \u8BB0\u5FC6 ${page}/${totalPages}\u9875 \u5171${sorted2.length}\u6761 **${category ? ` [${category}]` : ""}**`];
      for (let i = 0; i < pageItems.length; i++) {
        lines.push(formatMemoryRow(pageItems[i], (page - 1) * PAGE_SIZE + i + 1));
      }
      if (totalPages > 1) lines.push(`
\u2192 hawk\u8BB0\u5FC6 ${category} ${page + 1}`);
      lines.push(`
\u2192 hawk\u91CD\u8981 N \xD72  \u6807\u8BB0\u4E3A\u91CD\u8981`);
      lines.push(`\u2192 hawk\u4E0D\u91CD\u8981 N     \u964D\u4F4E\u91CD\u8981\u6027`);
      event.messages.push(`
${lines.join("\n")}
`);
      return;
    }
    var m = trimmed.match(IMPORTANT_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const mult = parseFloat(m[2] || "2");
      const all = await getSortedMemories(db2, getAgentId(ctx));
      if (idx < 1 || idx > all.length) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7 (1-${all.length})
`);
        return;
      }
      const mem = all[idx - 1];
      await db2.markImportant(mem.id, mult);
      const lines = [`${injectEmoji} ** \u5DF2\u6807\u8BB0\u4E3A\u91CD\u8981 **`];
      lines.push(formatMemoryRow(mem, idx));
      lines.push(`
\u2192 importanceOverride: ${mem.importanceOverride} \u2192 ${mult}`);
      event.messages.push(`
${lines.join("\n")}
`);
      return;
    }
    var m = trimmed.match(UNIMPORTANT_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const all = await getSortedMemories(db2, getAgentId(ctx));
      if (idx < 1 || idx > all.length) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7 (1-${all.length})
`);
        return;
      }
      const mem = all[idx - 1];
      await db2.update(mem.id, { importanceOverride: 0.5 });
      event.messages.push(`
${injectEmoji} \u5DF2\u964D\u4F4E\u4F18\u5148\u7EA7\u3002
`);
      return;
    }
    var m = trimmed.match(SCOPE_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const scopeVal = m[2];
      const all = await getSortedMemories(db2, getAgentId(ctx));
      if (idx < 1 || idx > all.length) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7 (1-${all.length})
`);
        return;
      }
      await db2.update(all[idx - 1].id, { scope: scopeVal });
      event.messages.push(`
${injectEmoji} \u5DF2\u8BBE\u7F6E\u4F5C\u7528\u57DF\u4E3A [${scopeVal}]
`);
      return;
    }
    var m = trimmed.match(EDIT_PATTERN);
    if (m) {
      const all = await getSortedMemories(db2, getAgentId(ctx));
      if (!all.length) {
        event.messages.push(`
${injectEmoji} \u8FD8\u6CA1\u6709\u4EFB\u4F55\u8BB0\u5FC6\u3002
`);
        return;
      }
      if (!m[1]) {
        const lines = [`${injectEmoji} ** \u9009\u62E9\u8981\u7F16\u8F91\u7684\u8BB0\u5FC6 **`];
        for (let i = 0; i < Math.min(5, all.length); i++) lines.push(`[${i + 1}] ${formatMemoryRow(all[i], i + 1)}`);
        lines.push(`
\u2192 hawk\u7F16\u8F91 <\u7F16\u53F7>`);
        event.messages.push(`
${lines.join("\n")}
`);
        return;
      }
      const idx = parseInt(m[1], 10) - 1;
      if (idx < 0 || idx >= all.length) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7 (1-${all.length})
`);
        return;
      }
      const mem = all[idx];
      ctx._hawkEditTarget = mem.id;
      const scopeMap = { personal: "\u4E2A\u4EBA", team: "\u56E2\u961F", project: "\u9879\u76EE" };
      event.messages.push(
        `
${injectEmoji} ** \u7F16\u8F91\u8BB0\u5FC6 [#${idx + 1}] **
\u5206\u7C7B: ${mem.category} | \u53EF\u9760\u6027: ${fmtRel(mem)} | \u4F5C\u7528\u57DF: ${scopeMap[mem.scope] ?? mem.scope}
\u521B\u5EFA: ${formatTime(mem.createdAt)} | \u4FEE\u6539: ${formatTime(mem.updatedAt)}` + (mem.sessionId ? `
session: ${mem.sessionId}` : "") + `
\u5185\u5BB9: ${mem.text}` + (mem.correctionCount > 0 ? `
\u7EA0\u6B63\u5386\u53F2: ${mem.correctionCount}\u6B21` : "") + `

\u2192 hawk\u65B0\u5185\u5BB9 <\u6587\u672C>
\u2192 hawk\u6539\u5206\u7C7B <fact|preference|decision|entity|other>
\u2192 hawk\u91CD\u8981 \xD72    \u2192 hawk\u4E0D\u91CD\u8981    \u2192 hawk\u4F5C\u7528\u57DF personal|team|project
\u2192 hawk\u51B2\u7A81 ${idx + 1}  \u68C0\u67E5\u662F\u5426\u4E0E\u65B0\u5185\u5BB9\u51B2\u7A81
`
      );
      return;
    }
    if (trimmed.startsWith("hawk\u65B0\u5185\u5BB9 ")) {
      const newText = trimmed.slice("hawk\u65B0\u5185\u5BB9 ".length).trim();
      const targetId = ctx._hawkEditTarget;
      if (!targetId || !newText) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u8F91\u8BF7\u6C42\u3002
`);
        return;
      }
      const ok = await db2.update(targetId, { text: newText });
      delete ctx._hawkEditTarget;
      event.messages.push(`
${injectEmoji} ${ok ? "\u2705 \u5DF2\u66F4\u65B0" : "\u274C \u5931\u8D25"} \u2192 ${newText.slice(0, 60)}
`);
      return;
    }
    if (trimmed.startsWith("hawk\u6539\u5206\u7C7B ")) {
      const cat = trimmed.slice("hawk\u6539\u5206\u7C7B ".length).trim();
      const valid = ["fact", "preference", "decision", "entity", "other"];
      if (!valid.includes(cat)) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u5206\u7C7B: ${valid.join(", ")}
`);
        return;
      }
      const targetId = ctx._hawkEditTarget;
      if (!targetId) {
        event.messages.push(`
${injectEmoji} \u8BF7\u5148\u6267\u884C hawk\u7F16\u8F91 \u9009\u62E9\u8BB0\u5FC6\u3002
`);
        return;
      }
      const ok = await db2.update(targetId, { category: cat });
      delete ctx._hawkEditTarget;
      event.messages.push(`
${injectEmoji} ${ok ? `\u2705 \u5DF2\u66F4\u65B0\u4E3A [${cat}]` : "\u274C \u5931\u8D25"}
`);
      return;
    }
    var m = trimmed.match(HISTORY_PATTERN);
    if (m) {
      const kw = m[1]?.trim() || "";
      const all = await db2.getAllMemories();
      const withHistory = all.filter((x) => x.correctionHistory.length > 0);
      const relevant = kw ? withHistory.filter((x) => x.text.toLowerCase().includes(kw.toLowerCase())) : withHistory;
      if (!relevant.length) {
        event.messages.push(`
${injectEmoji} \u6CA1\u6709\u627E\u5230${kw ? `"${kw}"\u76F8\u5173` : ""}\u7684\u7EA0\u6B63\u5386\u53F2\u3002
`);
        return;
      }
      const lines = [`${injectEmoji} ** \u7EA0\u6B63\u5386\u53F2 ${kw ? `(\u5173\u952E\u8BCD: ${kw}) ` : ""}\u5171${relevant.length}\u6761 **`];
      for (const mem of relevant) {
        lines.push(`
\u{1F4CC} [${mem.category}] ${mem.text.slice(0, 60)}`);
        for (let i = 0; i < mem.correctionHistory.length; i++) {
          const c = mem.correctionHistory[i];
          lines.push(`   ${i + 1}. ${formatTime(c.ts)}: "${c.oldText.slice(0, 40)}" \u2192 "${c.newText.slice(0, 40)}"`);
        }
      }
      event.messages.push(`
${lines.join("\n")}
`);
      return;
    }
    var m = trimmed.match(CONFLICT_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const all = await getSortedMemories(db2, getAgentId(ctx));
      if (idx < 1 || idx > all.length) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7
`);
        return;
      }
      const mem = all[idx - 1];
      const conflicts = await db2.detectConflicts(mem.text, mem.category);
      if (!conflicts.length) {
        event.messages.push(`
${injectEmoji} \u672A\u68C0\u6D4B\u5230\u4E0E[#${idx}]\u51B2\u7A81\u7684\u8BB0\u5FC6\u3002
`);
        return;
      }
      const lines = [`${injectEmoji} \u26A0\uFE0F ** \u68C0\u6D4B\u5230 ${conflicts.length} \u6761\u53EF\u80FD\u51B2\u7A81 **`];
      for (const c of conflicts) {
        lines.push(`
\u{1F534} [${c.category}] "${c.text.slice(0, 60)}"`);
        lines.push(`   \u53EF\u9760\u6027: ${fmtRel(c)} | \u521B\u5EFA: ${formatTime(c.createdAt)}`);
      }
      event.messages.push(`
${lines.join("\n")}
`);
      return;
    }
    var m = trimmed.match(COMPARE_PATTERN);
    if (m) {
      const idxA = parseInt(m[1], 10) - 1;
      const idxB = parseInt(m[2], 10) - 1;
      const all = await getSortedMemories(db2, getAgentId(ctx));
      if (idxA < 0 || idxA >= all.length || idxB < 0 || idxB >= all.length) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7 (1-${all.length})
`);
        return;
      }
      const memA = all[idxA];
      const memB = all[idxB];
      const sim = textSimilarity(memA.text, memB.text);
      const kwA = extractKeywords(memA.text);
      const kwB = extractKeywords(memB.text);
      const overlap = kwA.filter((k) => kwB.includes(k));
      const lines = [
        `${injectEmoji} ** \u8BB0\u5FC6\u5BF9\u6BD4 [#${idxA + 1} vs #${idxB + 1}] **`,
        ``,
        `[#${idxA + 1}] ${relLabel(memA.reliability)} ${fmtRel(memA)} [${memA.category}]`,
        `\u5185\u5BB9: ${memA.text.slice(0, 80)}`,
        `\u521B\u5EFA: ${formatTime(memA.createdAt)} | \u9A8C\u8BC1: ${memA.verificationCount}\u6B21`,
        ``,
        `[#${idxB + 1}] ${relLabel(memB.reliability)} ${fmtRel(memB)} [${memB.category}]`,
        `\u5185\u5BB9: ${memB.text.slice(0, 80)}`,
        `\u521B\u5EFA: ${formatTime(memB.createdAt)} | \u9A8C\u8BC1: ${memB.verificationCount}\u6B21`,
        ``,
        `\u76F8\u4F3C\u5EA6: ${(sim * 100).toFixed(0)}%`,
        `\u5171\u540C\u5173\u952E\u8BCD: ${overlap.length > 0 ? overlap.slice(0, 5).join(", ") : "\u65E0"}`,
        sim >= 0.6 ? `\u26A0\uFE0F \u53EF\u80FD\u77DB\u76FE\uFF08\u76F8\u4F3C\u4F46\u4E0D\u540C\uFF09` : sim < 0.3 ? `\u2705 \u5B8C\u5168\u4E0D\u540C` : `\u26A1 \u90E8\u5206\u91CD\u53E0`
      ];
      event.messages.push(`
${lines.join("\n")}
`);
      return;
    }
    var m = trimmed.match(EXPORT_PATTERN);
    if (m) {
      const filepath = m[1]?.trim() || path3.join(homedir3(), ".hawk", `export-${Date.now()}.json`);
      const all = await db2.getAllMemories();
      const exported = all.map((m2) => ({
        id: m2.id,
        text: m2.text,
        category: m2.category,
        reliability: m2.reliability,
        scope: m2.scope,
        locked: m2.locked,
        verificationCount: m2.verificationCount,
        createdAt: formatTime(m2.createdAt),
        updatedAt: formatTime(m2.updatedAt),
        correctionHistory: m2.correctionHistory
      }));
      try {
        const { writeFileSync, mkdirSync, existsSync } = __require("fs");
        const dir = path3.dirname(filepath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filepath, JSON.stringify({ exported_at: (/* @__PURE__ */ new Date()).toISOString(), count: exported.length, memories: exported }, null, 2));
        event.messages.push(`
${injectEmoji} \u2705 \u5DF2\u5BFC\u51FA ${exported.length} \u6761\u8BB0\u5FC6\u5230
${filepath}
`);
      } catch (err) {
        event.messages.push(`
${injectEmoji} \u274C \u5BFC\u51FA\u5931\u8D25: ${err.message}
`);
      }
      return;
    }
    if (CLEAR_PATTERN.test(trimmed)) {
      const all = await db2.getAllMemories();
      const unlocked = all.filter((m2) => !m2.locked);
      if (!unlocked.length) {
        event.messages.push(`
${injectEmoji} \u6CA1\u6709\u53EF\u6E05\u7A7A\u7684\u8BB0\u5FC6\uFF08\u5168\u90E8\u5DF2\u9501\u5B9A\uFF09
`);
        return;
      }
      let cleared = 0;
      for (const m2 of unlocked) {
        if (await db2.forget(m2.id)) cleared++;
      }
      event.messages.push(`
${injectEmoji} \u2705 \u5DF2\u6E05\u7A7A ${cleared} \u6761\u672A\u9501\u5B9A\u8BB0\u5FC6\u3002
`);
      return;
    }
    var m = trimmed.match(BATCHLOCK_PATTERN);
    if (m) {
      const cat = m[1]?.trim();
      const all = await db2.getAllMemories();
      const targets = cat ? all.filter((x) => x.category === cat && !x.locked) : all.filter((x) => !x.locked);
      if (!targets.length) {
        event.messages.push(`
${injectEmoji} \u6CA1\u6709\u627E\u5230${cat ? `[${cat}]` : ""}\u672A\u9501\u5B9A\u7684\u8BB0\u5FC6\u3002
`);
        return;
      }
      let locked = 0;
      for (const t of targets) {
        if (await db2.lock(t.id)) locked++;
      }
      event.messages.push(`
${injectEmoji} \u{1F512} \u5DF2\u9501\u5B9A ${locked} \u6761${cat ? `[${cat}]` : ""}\u8BB0\u5FC6\u3002
`);
      return;
    }
    if (BATCHUNLOCK_PATTERN.test(trimmed)) {
      const all = await db2.getAllMemories();
      const locked = all.filter((x) => x.locked);
      if (!locked.length) {
        event.messages.push(`
${injectEmoji} \u6CA1\u6709\u5DF2\u9501\u5B9A\u7684\u8BB0\u5FC6\u3002
`);
        return;
      }
      let unlocked = 0;
      for (const t of locked) {
        if (await db2.unlock(t.id)) unlocked++;
      }
      event.messages.push(`
${injectEmoji} \u{1F513} \u5DF2\u89E3\u9501 ${unlocked} \u6761\u8BB0\u5FC6\u3002
`);
      return;
    }
    if (PURGE_PATTERN.test(trimmed)) {
      const { exec: exec2 } = __require("child_process");
      const { promisify: promisify2 } = __require("util");
      const execAsync = promisify2(exec2);
      const distDecay = path3.join(process.cwd(), "dist/cli/decay.js");
      try {
        const { stdout } = await execAsync(`node "${distDecay}"`, { timeout: 3e4 });
        event.messages.push(`
${injectEmoji} ${stdout.trim()}
`);
      } catch (err) {
        event.messages.push(`
${injectEmoji} \u274C \u6E05\u7406\u5931\u8D25: ${err.message}
`);
      }
      return;
    }
    if (STATS_PATTERN.test(trimmed)) {
      const all = await db2.getAllMemories(getAgentId(ctx));
      if (!all.length) {
        event.messages.push(`
${injectEmoji} \u6682\u65E0\u8BB0\u5FC6\u3002
`);
        return;
      }
      const total = all.length;
      const locked = all.filter((m2) => m2.locked).length;
      const byCat = {};
      const byScope = {};
      const byRel = {};
      const now = Date.now();
      for (const m2 of all) {
        byCat[m2.category] = (byCat[m2.category] || 0) + 1;
        byScope[m2.scope] = (byScope[m2.scope] || 0) + 1;
        const relBand = m2.reliability >= 0.8 ? "high" : m2.reliability >= 0.5 ? "mid" : "low";
        byRel[relBand] = (byRel[relBand] || 0) + 1;
      }
      const avgImp = (all.reduce((s, m2) => s + m2.importance, 0) / total).toFixed(2);
      const expired = all.filter((m2) => m2.expiresAt > 0 && m2.expiresAt < now).length;
      const lines = [
        `
${injectEmoji} ** hawk \u8BB0\u5FC6\u7EDF\u8BA1 **
`,
        `\u603B\u8BB0\u5FC6: ${total} | \u9501\u5B9A: ${locked} | \u5DF2\u8FC7\u671F: ${expired}`,
        `\u5E73\u5747\u91CD\u8981\u6027: ${avgImp}`,
        ``,
        `**\u6309\u7C7B\u522B**:`,
        ...Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
        ``,
        `**\u6309\u4F5C\u7528\u57DF**:`,
        ...Object.entries(byScope).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
        ``,
        `**\u6309\u53EF\u9760\u6027**: high\u226580%:${byRel.high || 0} | mid50-80%:${byRel.mid || 0} | low<50%:${byRel.low || 0}`
      ];
      event.messages.push(lines.join("\n") + "\n");
      return;
    }
    var m = trimmed.match(REVIEW_PATTERN);
    if (m) {
      const count = Math.min(10, Math.max(1, parseInt(m[1] || "3", 10)));
      const reviewConfig = config.review;
      const minRel = reviewConfig?.minReliability ?? 0.5;
      const batch = reviewConfig?.batchSize ?? 5;
      const candidates = await db2.getReviewCandidates(minRel, batch);
      if (!candidates.length) {
        event.messages.push(`
${injectEmoji} \u6CA1\u6709\u9700\u8981\u56DE\u987E\u7684\u8BB0\u5FC6\uFF08\u53EF\u9760\u6027\u5747\u2265${Math.round(minRel * 100)}%\uFF09\u3002
`);
        return;
      }
      const lines = [`${injectEmoji} ** \u4E3B\u52A8\u56DE\u987E (${candidates.length}\u6761\u6700\u4F4E\u53EF\u9760\u6027) **`];
      for (let i = 0; i < candidates.length; i++) {
        const mem = candidates[i];
        lines.push(`
${i + 1}. ${relLabel(mem.reliability)} ${fmtRel(mem)} [${mem.category}] ${mem.text.slice(0, 70)}`);
        lines.push(`   \u2192 \u56DE\u590D"${i + 1} \u5BF9"\u786E\u8BA4 \u6216 "${i + 1} \u7EA0\u6B63: \u6B63\u786E\u5185\u5BB9"`);
      }
      event.messages.push(`
${lines.join("\n")}
`);
      ctx._hawkCheckIndex = candidates.map((m2) => m2.id);
      return;
    }
    var m = trimmed.match(CHECK_PATTERN);
    if (m) {
      const count = Math.min(10, Math.max(1, parseInt(m[1] || "3", 10)));
      const candidates = await db2.getReviewCandidates(0.5, count);
      if (!candidates.length) {
        event.messages.push(`
${injectEmoji} \u6CA1\u6709\u9700\u8981\u68C0\u67E5\u7684\u8BB0\u5FC6\u3002
`);
        return;
      }
      const lines = [`${injectEmoji} ** \u4E3B\u52A8\u68C0\u67E5 (${candidates.length}\u6761) **`];
      for (let i = 0; i < candidates.length; i++) {
        const mem = candidates[i];
        lines.push(`
${i + 1}. ${relLabel(mem.reliability)} ${fmtRel(mem)} [${mem.category}] ${mem.text.slice(0, 70)}`);
        lines.push(`   \u2192 "${i + 1} \u5BF9" \u6216 "${i + 1} \u7EA0\u6B63: \u6B63\u786E\u5185\u5BB9"`);
      }
      event.messages.push(`
${lines.join("\n")}
`);
      ctx._hawkCheckIndex = candidates.map((m2) => m2.id);
      return;
    }
    const confirmMatch = trimmed.match(/^hawk确认\s+(\d+)\s+(.+)/i);
    if (confirmMatch) {
      const idx = parseInt(confirmMatch[1], 10) - 1;
      const action = confirmMatch[2].trim();
      const targetIds = ctx._hawkCheckIndex || [];
      if (idx < 0 || idx >= targetIds.length) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7
`);
        return;
      }
      const id = targetIds[idx];
      if (action === "\u5BF9" || action === "\u6B63\u786E") {
        await db2.verify(id, true);
        event.messages.push(`
${injectEmoji} \u2705 \u5DF2\u786E\u8BA4\uFF0C\u53EF\u9760\u6027\u63D0\u5347\u3002
`);
      } else if (/^纠正/.test(action)) {
        const correct = action.replace(/^纠正[:：]?\s*/, "").trim();
        await db2.verify(id, false, correct);
        event.messages.push(`
${injectEmoji} \u2705 \u5DF2\u7EA0\u6B63 \u2192 ${correct}
`);
      } else {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u64CD\u4F5C\u3002\u7528"${idx + 1} \u5BF9"\u6216"${idx + 1} \u7EA0\u6B63: \u6B63\u786E\u5185\u5BB9"
`);
      }
      return;
    }
    var m = trimmed.match(DENY_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      const targetIds = ctx._hawkCheckIndex || [];
      if (idx < 0 || idx >= targetIds.length) {
        event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7
`);
        return;
      }
      const id = targetIds[idx];
      await db2.flagUnhelpful(id, 0.05);
      event.messages.push(`
${injectEmoji} \u5DF2\u6807\u8BB0\u8BE5\u8BB0\u5FC6\u4E3A\u4E0D\u53EF\u9760\uFF08reliability -5%\uFF09
`);
      return;
    }
    {
      const keyword = matchFirst(trimmed, LOCK_PATTERNS);
      if (keyword !== null) {
        const all = await db2.getAllMemories();
        const match = all.find((x) => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) {
          await db2.lock(match.id);
          event.messages.push(`
${injectEmoji} \u{1F512} \u5DF2\u9501\u5B9A\u3002
`);
        } else event.messages.push(`
${injectEmoji} \u6CA1\u6709\u627E\u5230\u4E0E"${keyword}"\u76F8\u5173\u7684\u8BB0\u5FC6\u3002
`);
        return;
      }
    }
    {
      const keyword = matchFirst(trimmed, UNLOCK_PATTERNS);
      if (keyword !== null) {
        const all = await db2.getAllMemories();
        const match = all.find((x) => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) {
          await db2.unlock(match.id);
          event.messages.push(`
${injectEmoji} \u{1F513} \u5DF2\u89E3\u9501\u3002
`);
        } else event.messages.push(`
${injectEmoji} \u6CA1\u6709\u627E\u5230\u4E0E"${keyword}"\u76F8\u5173\u7684\u8BB0\u5FC6\u3002
`);
        return;
      }
    }
    {
      const keyword = matchFirst(trimmed, FORGET_PATTERNS);
      if (keyword !== null) {
        const all = await db2.getAllMemories();
        const match = all.find((x) => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) {
          const ok = await db2.forget(match.id);
          event.messages.push(`
${injectEmoji} ${ok ? "\u2705 \u5DF2\u9057\u5FD8\u3002" : "\u274C \u5DF2\u9501\u5B9A\uFF0C\u65E0\u6CD5\u9057\u5FD8\u3002"}
`);
        } else {
          event.messages.push(`
${injectEmoji} \u6CA1\u6709\u627E\u5230\u4E0E"${keyword}"\u76F8\u5173\u7684\u8BB0\u5FC6\u3002
`);
        }
        return;
      }
    }
    {
      const correct = matchFirst(trimmed, [CORRECT_PATTERN]);
      if (correct !== null) {
        const result2 = await findMemoryBySemanticMatch(db2, correct);
        if (result2) {
          await db2.verify(result2.id, false, correct);
          event.messages.push(`
${injectEmoji} \u2705 \u5DF2\u7EA0\u6B63 \u2192 ${correct}
`);
        } else {
          event.messages.push(`
${injectEmoji} \u6CA1\u6709\u627E\u5230\u9700\u8981\u7EA0\u6B63\u7684\u8BB0\u5FC6\u3002
`);
        }
        return;
      }
    }
    const retriever = await getRetriever();
    const memories = await retriever.search(trimmed, topK);
    const useable = memories.filter((m2) => m2.score >= minScore || m2.reliability >= RELIABILITY_THRESHOLD_HIGH);
    if (!useable.length) {
      const all = await db2.getAllMemories(getAgentId(ctx));
      if (all.length > 0) {
        const queryWords = trimmed.toLowerCase().split(/\s+/);
        const suggestions = all.map((m2) => {
          const textWords = m2.text.toLowerCase().split(/\s+/);
          const overlap = queryWords.filter((w) => textWords.some((tw) => tw.includes(w) || w.includes(tw))).length;
          return { id: m2.id, text: m2.text, overlap };
        }).filter((s) => s.overlap > 0).sort((a, b) => b.overlap - a.overlap).slice(0, 3);
        if (suggestions.length > 0) {
          const tips = suggestions.map((s) => `  \xB7 "${s.text.slice(0, 50)}"`).join("\n");
          event.messages.push(`
${injectEmoji} \u6CA1\u627E\u5230\u76F4\u63A5\u5339\u914D\u7684\u3002\u662F\u4E0D\u662F\u6307\uFF1A
${tips}
`);
        }
      }
      return;
    }
    const sorted = [...useable].sort((a, b) => compositeScore(b) - compositeScore(a));
    const result = [];
    let totalChars = 0;
    for (const m2 of sorted) {
      if (result.length >= INJECTION_LIMIT) break;
      const compressed = compressText(m2.text);
      if (totalChars + compressed.length > MAX_INJECTION_CHARS) continue;
      result.push(m2);
      totalChars += compressed.length;
    }
    if (!result.length) return;
    const withReasons = result.map((m2) => ({
      ...m2,
      matchReason: computeMatchReason(trimmed, m2),
      text: sanitize(compressText(m2.text))
    }));
    event.messages.push(`
${formatRecallResults(withReasons, injectEmoji)}
`);
    for (const m2 of useable) {
      if (m2.score >= minScore) await db2.verify(m2.id, true);
    }
    if (config.audit?.enabled) {
      try {
        const { appendFileSync: appendFileSync2, join: join5 } = __require("fs");
        const { homedir: homedir5 } = __require("os");
        appendFileSync2(
          join5(homedir5(), ".hawk", "audit.log"),
          JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), action: "recall", count: sanitized.length, query: trimmed.slice(0, 100) }) + "\n"
        );
      } catch {
      }
    }
  } catch (err) {
    console.error("[hawk-recall] Error:", err);
  }
};
function getAgentId(ctx) {
  return ctx?.agentId ?? null;
}
async function getSortedMemories(db2, agentId) {
  const all = await db2.getAllMemories(agentId);
  return [...all].sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    return b.reliability - a.reliability;
  });
}
var handler_default = recallHandler;

// src/hooks/hawk-capture/handler.ts
import { spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path4 from "path";
import * as os3 from "os";
init_embeddings();
var exec = promisify(__require("child_process").exec);
var db = null;
var embedder = null;
async function getDB() {
  if (!db) {
    db = new HawkDB();
    await db.init();
  }
  return db;
}
async function getEmbedder() {
  if (!embedder) {
    const config = await getConfig();
    embedder = new Embedder(config.embedding);
  }
  return embedder;
}
var AUDIT_LOG_PATH = path4.join(os3.homedir(), ".hawk", "audit.log");
function audit(action, reason, text) {
  const config = getConfig();
  if (!config.audit?.enabled) return;
  const entry = JSON.stringify({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    action,
    reason,
    text: text.slice(0, 200)
    // truncate for log safety
  }) + "\n";
  try {
    fs.appendFileSync(AUDIT_LOG_PATH, entry);
  } catch {
  }
}
function normalizeText(text) {
  let t = text;
  t = t.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\uFEFF]/g, "");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, "[\u56FE\u7247]");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/```[\w*]*\n([\s\S]*?)```/g, (_, code) => code.trim());
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^>\s+/gm, "");
  t = t.replace(/^[\s]*[-*+]\s+/gm, "");
  t = t.replace(/^[\s]*\d+\.\s+/gm, "");
  t = t.replace(/\bconsole\s*\.\s*(log|debug|info|warn|error)\s*\([^)]*\)/gi, "[\u65E5\u5FD7]");
  t = t.replace(/\bprint\s*\([^)]*\)/g, "[\u65E5\u5FD7]");
  t = t.replace(/\bprint\b(?!\s*=)/g, "[\u65E5\u5FD7]");
  t = t.replace(/\blogger\s*\.\s*(debug|info|warn|error)\s*\([^)]*\)/gi, "[\u65E5\u5FD7]");
  t = t.replace(
    /(^\tat\s+[^\n]+\n)((\tat\s+[^\n]+\n)*)(\bat\s+[^\n]+$)/gm,
    (_, head, middle, tail) => head + (middle ? "\n  ...\n" : "") + tail
  );
  t = t.replace(/(https?:\/\/[^\s\n,，]+)[\n-]([^\s,，]+)/g, "$1$2");
  t = t.replace(
    /(https?:\/\/[^\s　'"<>】】]+)\/([^\s　'"<>】】]{0,60}[^\s　'"<>】】]*)/g,
    (_, domain, path5) => {
      const fullPath = path5.length > 60 ? path5.slice(0, 60) + "..." : path5;
      return domain + "/" + fullPath;
    }
  );
  t = t.replace(
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{1FA00}-\u{1FAFF}]|[\u{1F900}-\u{1F9FF}]/gu,
    ""
  );
  t = t.replace(/。/g, ".").replace(/，/g, ",").replace(/；/g, ";").replace(/：/g, ":").replace(/？/g, "?").replace(/！/g, "!").replace(/"/g, '"').replace(/"/g, '"').replace(/'/g, "'").replace(/'/g, "'").replace(/（/g, "(").replace(/）/g, ")").replace(/【/g, "[").replace(/】/g, "]").replace(/《/g, "<").replace(/》/g, ">").replace(/、/g, ",").replace(/…/g, "...").replace(/～/g, "~");
  t = t.replace(
    /\b(?:\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?\s*(?:[时分]?\s*\d{1,2}[：:]\d{1,2}(?:[：:]\d{1,2})?\s*(?:AM|PM|am|pm)?)?|\d{1,2}[-/月]\d{1,2}[日]?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)\b/g,
    "[\u65F6\u95F4]"
  );
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map((line) => line.trim()).join("\n");
  t = t.trim();
  t = t.replace(/\b(\d{1,3}(?:,\d{3}){2,})(?:\b|[^\d])/g, (match) => {
    const num = parseInt(match.replace(/,/g, ""), 10);
    if (num >= 1e9) return (num / 1e9).toFixed(1) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return match;
  });
  t = t.replace(/\b[A-Za-z0-9+/]{100,}={0,2}\b/g, "[BASE64\u6570\u636E]");
  t = t.replace(/(\{"[^"]+":\s*"[^"]+"\})/g, (json) => {
    try {
      return JSON.stringify(JSON.parse(json));
    } catch {
      return json;
    }
  });
  {
    const sentences = t.split(/(?<=[.!?])\s+/);
    const seen = /* @__PURE__ */ new Set();
    t = sentences.filter((s) => {
      const normalized = s.toLowerCase().trim();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }).join(" ");
  }
  {
    const paras = t.split(/\n\n+/);
    const seenPara = /* @__PURE__ */ new Set();
    t = paras.filter((p) => {
      const normalized = p.trim().toLowerCase();
      if (seenPara.has(normalized)) return false;
      seenPara.add(normalized);
      return true;
    }).join("\n\n");
  }
  t = t.replace(/([\u4e00-\u9fff])([A-Za-z])/g, "$1$2");
  t = t.replace(/([A-Za-z])([\u4e00-\u9fff])/g, "$1$2");
  return t;
}
function isValidChunk(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHUNK_SIZE) return false;
  if (trimmed.length > MAX_TEXT_LEN) return false;
  if (/^[\d\s.+-]+$/.test(trimmed)) return false;
  if (/^[^\w\u4e00-\u9fff]+$/.test(trimmed)) return false;
  return true;
}
function truncate(text, maxLen = MAX_CHUNK_SIZE) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "");
}
var HARMFUL_PATTERNS = [
  /kill|murder|suicide|attack/i,
  /bomb|explosive|terror/i,
  /child(?:porn|sexual)|CSAM/i,
  /fraud|scam|phishing/i,
  /hack|crack(?:ing)?\s+(?:password|account)/i
];
function isHarmful(text) {
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}
var SANITIZE_PATTERNS = [
  [/(?:api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key)\s*[:=]\s*["']?([\w-]{8,})["']?/gi, "$1: [REDACTED]"],
  [/(Bearer\s+)[\w.-]{10,}/gi, "$1[REDACTED]"],
  [/(AKIA[0-9A-Z]{16})/g, "[AWS_KEY_REDACTED]"],
  [/(ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,})/g, "[GITHUB_TOKEN_REDACTED]"],
  [/\b[a-zA-Z0-9]{32,}\b/g, "[KEY_REDACTED]"],
  [/\b1[3-9]\d{9}\b/g, "[PHONE_REDACTED]"],
  [/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, "[EMAIL_REDACTED]"],
  [/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, "[ID_REDACTED]"],
  [/\b(?:\d{4}[- ]?){3}\d{4}\b/g, "[CARD_REDACTED]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP_REDACTED]"],
  [/\/\/[^:@\/]+:[^@\/]+@/g, "//[CREDS_REDACTED]@"]
];
function sanitize2(text) {
  let result = text;
  for (const [pattern, replacement] of SANITIZE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
function textSimilarity2(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  if (Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 0.3) return 0;
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  const intersection = [...setA].filter((c) => setB.has(c)).length;
  const union = (/* @__PURE__ */ new Set([...setA, ...setB])).size;
  return union > 0 ? intersection / union : 0;
}
async function isDuplicate(text, threshold = DEDUP_SIMILARITY) {
  try {
    const dbInstance = await getDB();
    const recent = await dbInstance.listRecent(20);
    for (const m of recent) {
      if (textSimilarity2(text, m.text) >= threshold) return true;
    }
  } catch {
  }
  return false;
}
var captureHandler = async (event) => {
  if (event.type !== "message" || event.action !== "sent") return;
  if (!event.context?.success) return;
  try {
    const config = await getConfig();
    if (!config.capture.enabled) return;
    const { maxChunks, importanceThreshold, ttlMs } = config.capture;
    const content = event.context?.content;
    if (typeof content !== "string" || content.length < 50) return;
    const trimmedContent = content.trim();
    if (/^[\d\s.,]+$/.test(trimmedContent)) return;
    if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]{1,3}$/u.test(trimmedContent)) return;
    if (trimmedContent.length < 30) return;
    const CODE_BLOCK_RE = /```(?:\w+)?\n([\s\S]{20,500}?)```/g;
    const codeBlockMemories = [];
    let codeMatch;
    while ((codeMatch = CODE_BLOCK_RE.exec(content)) !== null) {
      const code = codeMatch[1].trim();
      if (code.length < 20) continue;
      const fenceWithLang = content.slice(Math.max(0, codeMatch.index - 10), codeMatch.index);
      const langMatch = fenceWithLang.match(/```(\w+)/);
      const lang = langMatch ? langMatch[1] : "code";
      codeBlockMemories.push({
        text: `[${lang.toUpperCase()}] ${code.slice(0, 200)}${code.length > 200 ? "..." : ""}`,
        category: "fact",
        importance: 0.8,
        abstract: `\u4EE3\u7801\u7247\u6BB5 (${lang})\uFF0C${code.split("\n").length} \u884C`,
        overview: `\u7528\u6237\u5206\u4EAB\u7684 ${lang} \u4EE3\u7801\uFF1A${code.slice(0, 100)}`
      });
    }
    const URL_RE = /(?:https?:\/\/[^\s\n，,。!?）\]]+)/g;
    const urlMemories = [];
    let urlMatch;
    const seenUrls = /* @__PURE__ */ new Set();
    while ((urlMatch = URL_RE.exec(content)) !== null) {
      const url = urlMatch[0];
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      const ctxStart = Math.max(0, urlMatch.index - 80);
      const ctx = content.slice(ctxStart, urlMatch.index).replace(/\n/g, " ").trim();
      urlMemories.push({
        text: `\u5206\u4EAB\u94FE\u63A5: ${url}`,
        category: "fact",
        importance: 0.7,
        abstract: `\u94FE\u63A5\u5206\u4EAB: ${url}`,
        overview: ctx || `\u5206\u4EAB\u7684\u94FE\u63A5: ${url}`
      });
    }
    let enrichedContent = content;
    const USER_MSG_RE = /^user:\s*(.+)/gim;
    const userMessages = [];
    let um;
    while ((um = USER_MSG_RE.exec(content)) !== null) {
      userMessages.push({ text: um[1], idx: um.index });
    }
    if (userMessages.length >= 2) {
      const merged = [];
      for (const msg of userMessages) {
        const prev = merged[merged.length - 1];
        if (prev && msg.idx - prev.end < 200) {
          prev.text += "\n" + msg.text;
          prev.end = msg.idx + msg.text.length + 5;
        } else {
          merged.push({ text: msg.text, start: msg.idx, end: msg.idx + msg.text.length + 5 });
        }
      }
      enrichedContent = merged.map((m) => `user: ${m.text}`).join("\n\n");
    }
    const memories = await callExtractor(enrichedContent, config);
    if (!memories || !memories.length) return;
    const allMemories = [
      ...codeBlockMemories,
      ...urlMemories,
      ...memories
    ];
    const significant = allMemories.filter(
      (m) => m.importance >= importanceThreshold
    ).slice(0, maxChunks);
    if (!significant.length) return;
    const [dbInstance, embedderInstance] = await Promise.all([
      getDB(),
      getEmbedder()
    ]);
    const { batchStore } = dbInstance;
    let storedCount = 0;
    for (const m of significant) {
      let text = m.text.trim();
      text = normalizeText(text);
      if (!isValidChunk(text)) {
        audit("skip", "invalid_chunk", text);
        continue;
      }
      if (isHarmful(text)) {
        audit("reject", "harmful_content", text);
        continue;
      }
      text = sanitize2(text);
      text = truncate(text);
      if (await isDuplicate(text)) {
        audit("skip", "duplicate", text);
        continue;
      }
      const effectiveTtl = ttlMs || MEMORY_TTL_MS;
      const expiresAt = effectiveTtl > 0 ? Date.now() + effectiveTtl : 0;
      const sessionId = event.context?.sessionEntry?.sessionId ?? void 0;
      if (m.category === "entity") {
        const existing = await dbInstance.findSimilarEntity(text);
        if (existing) {
          await dbInstance.update(existing.id, {
            text,
            importance: Math.max(existing.importance, m.importance)
          });
          storedCount++;
          audit("capture", `entity_merge:${existing.id}`, text);
          continue;
        }
      }
      const id = generateId();
      const capture_trigger = m.category === "entity" ? "new_entity" : m.category === "decision" ? "decision_made" : m.category === "preference" ? "preference_signal" : "general_content";
      try {
        const [vector] = await embedderInstance.embed([text]);
        await dbInstance.store({
          id,
          text,
          vector,
          category: m.category,
          scope: "global",
          importance: m.importance,
          timestamp: Date.now(),
          expiresAt,
          metadata: {
            capture_trigger,
            capture_confidence: m.importance,
            l0_abstract: m.abstract,
            l1_overview: m.overview,
            source: "hawk-capture"
          }
        }, sessionId);
        storedCount++;
        audit("capture", "success", text);
      } catch (storeErr) {
        audit("reject", "store_error:" + String(storeErr), text);
      }
    }
    if (storedCount > 0) {
      console.log(`[hawk-capture] Stored ${storedCount} memories`);
      markBm25Dirty();
    }
  } catch (err) {
    console.error("[hawk-capture] Error:", err);
  }
};
function callExtractor(conversationText, config) {
  return new Promise((resolve) => {
    const apiKey = config.embedding.apiKey || process.env.OPENAI_API_KEY || process.env.MINIMAX_API_KEY || "";
    const model = config.llm?.model || process.env.MINIMAX_MODEL || "MiniMax-M2.7";
    const provider = config.llm?.provider || "openclaw";
    const baseURL = config.llm?.baseURL || process.env.MINIMAX_BASE_URL || "";
    const proc = spawn(
      config.python.pythonPath,
      ["-c", buildExtractorScript(conversationText, apiKey, model, provider, baseURL)]
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      console.warn("[hawk-capture] subprocess timeout, killing...");
      proc.kill("SIGTERM");
    }, 3e4);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error("[hawk-capture] extractor error:", code, stderr ? `stderr: ${stderr}` : "");
        resolve([]);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (Array.isArray(result)) {
          resolve(result);
        } else {
          console.warn("[hawk-capture] unexpected extractor output, discarding");
          resolve([]);
        }
      } catch {
        console.warn("[hawk-capture] JSON parse failed, discarding output");
        resolve([]);
      }
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      console.error("[hawk-capture] subprocess error:", err.message);
      resolve([]);
    });
  });
}
function buildExtractorScript(conversation, apiKey, model, provider, baseURL) {
  const safeConv = JSON.stringify(conversation);
  const safeKey = JSON.stringify(apiKey);
  const safeModel = JSON.stringify(model);
  const safeProvider = JSON.stringify(provider);
  const safeBaseURL = JSON.stringify(baseURL);
  return `
import sys, json, os
sys.path.insert(0, os.path.expanduser('~/.openclaw/workspace/hawk-bridge/python'))
try:
    from hawk_memory import extract_memories
    conv = json.loads(${safeConv})
    key = json.loads(${safeKey})
    mdl = json.loads(${safeModel})
    prov = json.loads(${safeProvider})
    burl = json.loads(${safeBaseURL})
    result = extract_memories(conv, key, mdl, prov, burl)
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
}
function generateId() {
  return "hawk_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
var handler_default2 = captureHandler;

// src/index.ts
function register(api) {
  api.registerHook(["agent:bootstrap"], handler_default, {
    name: "hawk-recall",
    description: "Inject relevant hawk memories before agent starts"
  });
  api.registerHook(["message:sent"], handler_default2, {
    name: "hawk-capture",
    description: "Auto-extract and store memories after agent responds"
  });
}
var index_default = { register };
export {
  index_default as default,
  handler_default2 as "hawk-capture",
  handler_default as "hawk-recall"
};

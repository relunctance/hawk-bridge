var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/hooks/hawk-capture/handler.ts
import { spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path3 from "path";
import * as os3 from "os";

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
          metadata: "{}"
        });
        const table = makeArrowTable([sampleRow]);
        this.table = await this.db.createTable(TABLE_NAME, table);
        await this.table.delete(`id = '__init__'`);
      } else {
        this.table = await this.db.openTable(TABLE_NAME);
        try {
          await this.table.alterAddColumns([
            { name: "expires_at", type: { type: "int64" } },
            { name: "created_at", type: { type: "int64" } }
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
      expires_at: entry.expiresAt || 0,
      created_at: now,
      access_count: 0,
      last_accessed_at: now,
      metadata: JSON.stringify(entry.metadata || {})
    });
    await this.table.add([row]);
  }
  async search(queryVector, topK, minScore, scope) {
    if (!this.table) await this.init();
    let results = await this.table.search(queryVector).limit(topK * 4).toList();
    if (scope) {
      results = results.filter((r) => r.scope === scope);
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
      expiresAt: Number(r.expires_at || 0),
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
        expiresAt: Number(r.expires_at || 0),
        metadata: JSON.parse(r.metadata || "{}")
      };
    } catch {
      return null;
    }
  }
  /** Batch fetch multiple memories by ID in a single query — avoids N+1 round-trips */
  async getByIds(ids) {
    if (!this.table) await this.init();
    const results = /* @__PURE__ */ new Map();
    if (!ids.length) return results;
    try {
      const conditions = ids.map(() => "id = ?").join(" OR ");
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
          metadata: JSON.parse(r.metadata || "{}")
        });
      }
    } catch {
    }
    return results;
  }
};

// src/embeddings.ts
var FETCH_TIMEOUT_MS = 15e3;
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
var Embedder = class {
  config;
  constructor(config) {
    this.config = config;
  }
  async embed(texts) {
    const { provider } = this.config;
    if (provider === "qianwen") {
      return this.embedQianwen(texts);
    } else if (provider === "openai-compat") {
      return this.embedOpenAICompat(texts);
    } else if (provider === "ollama") {
      return this.embedOllama(texts);
    } else if (provider === "jina") {
      return this.embedJina(texts);
    } else if (provider === "cohere") {
      return this.embedCohere(texts);
    } else {
      return this.embedOpenAI(texts);
    }
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

// src/hooks/hawk-recall/handler.ts
var bm25DirtyGlobal = false;
function markBm25Dirty() {
  bm25DirtyGlobal = true;
}

// src/hooks/hawk-capture/handler.ts
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
var AUDIT_LOG_PATH = path3.join(os3.homedir(), ".hawk", "audit.log");
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
    (_, domain, path4) => {
      const fullPath = path4.length > 60 ? path4.slice(0, 60) + "..." : path4;
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
function sanitize(text) {
  let result = text;
  for (const [pattern, replacement] of SANITIZE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
function textSimilarity(a, b) {
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
      if (textSimilarity(text, m.text) >= threshold) return true;
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
    const memories = await callExtractor(content, config);
    if (!memories || !memories.length) return;
    const significant = memories.filter(
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
      text = sanitize(text);
      text = truncate(text);
      if (await isDuplicate(text)) {
        audit("skip", "duplicate", text);
        continue;
      }
      const effectiveTtl = ttlMs || MEMORY_TTL_MS;
      const expiresAt = effectiveTtl > 0 ? Date.now() + effectiveTtl : 0;
      const id = generateId();
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
            l0_abstract: m.abstract,
            l1_overview: m.overview,
            source: "hawk-capture"
          }
        });
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
var handler_default = captureHandler;
export {
  handler_default as default
};

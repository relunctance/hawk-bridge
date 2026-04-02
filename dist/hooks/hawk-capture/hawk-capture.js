var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/hooks/hawk-capture/handler.ts
import { spawn } from "child_process";
import { promisify } from "util";

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

// src/embeddings.ts
var FETCH_TIMEOUT_MS = 15e3;
async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetchWithTimeout(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}
var Embedder = class {
  config;
  openai;
  constructor(config) {
    this.config = config;
  }
  async embed(texts) {
    const { provider } = this.config;
    if (provider === "minimax") {
      return this.embedOpenClaw(texts);
    } else if (provider === "openclaw") {
      return this.embedOpenClaw(texts);
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
  // ---- OpenClaw/Minimax: uses already-configured provider ----
  async embedOpenClaw(texts) {
    const baseURL = this.config.baseURL || "https://api.minimaxi.com/v1";
    const apiKey = this.config.apiKey || process.env.MINIMAX_API_KEY || "";
    const resp = await fetchWithTimeout(`${baseURL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model || "embedding-2-normal",
        type: "db",
        texts
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenClaw/Minimax embedding error: ${resp.status} ${errText}`);
    }
    const data = await resp.json();
    if (!data.vectors || !data.vectors[0]) {
      throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
    }
    return data.vectors;
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
    const results = [];
    const resp = await fetchWithTimeout(`${baseURL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Ollama embedding error: ${resp.status} ${errText}`);
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
import * as fs from "fs";
import * as path2 from "path";
import * as os2 from "os";
var OPENCLAW_CONFIG_PATH = path2.join(os2.homedir(), ".openclaw", "openclaw.json");
var cachedOpenClawConfig = null;
function loadOpenClawConfig() {
  if (cachedOpenClawConfig) return cachedOpenClawConfig;
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf-8");
    cachedOpenClawConfig = JSON.parse(raw);
    return cachedOpenClawConfig;
  } catch {
    return null;
  }
}
function getConfiguredProvider(providerName = "minimax") {
  const config = loadOpenClawConfig();
  if (!config?.models?.providers) return null;
  return config.models.providers[providerName] || null;
}
function getDefaultModelId() {
  const config = loadOpenClawConfig();
  if (!config?.models?.providers) return "MiniMax-M2.7";
  const prov = config.models.providers["minimax"];
  if (!prov?.models?.length) return "MiniMax-M2.7";
  return prov.models[0].id;
}
var DEFAULT_CONFIG = {
  embedding: {
    provider: "sentence-transformers",
    // Local CPU, no API key needed
    apiKey: "",
    model: "all-MiniLM-L6-v2",
    baseURL: "",
    dimensions: DEFAULT_EMBEDDING_DIM
    // from constants.ts (384 for all-MiniLM-L6-v2)
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
  capture: {
    enabled: true,
    maxChunks: 3,
    importanceThreshold: 0.5
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
      const minimaxApiKey = process.env.MINIMAX_API_KEY || "";
      const provider = getConfiguredProvider("minimax");
      if (provider) {
        config.llm.baseURL = provider.baseUrl || "https://api.minimaxi.com/anthropic";
        config.llm.model = getDefaultModelId() || "MiniMax-M2.7";
        config.llm.provider = "openclaw";
      }
      if (minimaxApiKey) {
        config.embedding.provider = "minimax";
        config.embedding.apiKey = minimaxApiKey;
        config.embedding.baseURL = "https://api.minimaxi.com/v1";
        config.embedding.model = "embedding-2-normal";
        config.embedding.dimensions = 1024;
        config.llm.apiKey = minimaxApiKey;
        config.llm.provider = "minimax";
      }
      if (process.env.JINA_API_KEY) {
        config.embedding.provider = "jina";
        config.embedding.apiKey = process.env.JINA_API_KEY;
      }
      if (process.env.OLLAMA_BASE_URL) {
        if (minimaxApiKey && config.embedding.provider === "minimax") {
          console.warn("[hawk-bridge] OLLAMA_BASE_URL set, overriding MINIMAX_API_KEY embedding config");
        }
        config.embedding.provider = "ollama";
        config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
        config.embedding.model = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
      }
      return config;
    })();
  }
  return configPromise;
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
var captureHandler = async (event) => {
  if (event.type !== "message" || event.action !== "sent") return;
  if (!event.context?.success) return;
  try {
    const config = await getConfig();
    if (!config.capture.enabled) return;
    const { maxChunks, importanceThreshold } = config.capture;
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
    const texts = significant.map((m) => m.text);
    const vectors = await embedderInstance.embed(texts);
    for (let i = 0; i < significant.length; i++) {
      const m = significant[i];
      const vector = vectors[i];
      const id = generateId();
      await dbInstance.store({
        id,
        text: m.text,
        vector,
        category: m.category,
        scope: "global",
        importance: m.importance,
        timestamp: Date.now(),
        metadata: {
          l0_abstract: m.abstract,
          l1_overview: m.overview,
          source: "hawk-capture"
        }
      });
    }
    console.log(`[hawk-capture] Stored ${significant.length} memories`);
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
    const timer = setTimeout(() => {
      console.warn("[hawk-capture] subprocess timeout, killing...");
      proc.kill("SIGTERM");
    }, 3e4);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error("[hawk-capture] extractor error:", code);
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

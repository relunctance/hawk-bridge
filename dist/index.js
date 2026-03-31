var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/lancedb.ts
import * as path from "path";
import * as os from "os";
var TABLE_NAME = "hawk_memories";
var SCHEMA_FIELDS = [
  { name: "id", type: "string" },
  { name: "text", type: "string" },
  { name: "vector", type: "vector", vectorType: "float32" },
  { name: "category", type: "string" },
  { name: "scope", type: "string" },
  { name: "importance", type: "float32" },
  { name: "timestamp", type: "int64" },
  { name: "access_count", type: "int32" },
  { name: "last_accessed_at", type: "int64" },
  { name: "metadata", type: "string" }
  // JSON string
];
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
        const schema = {
          vectorType: "float32",
          fields: SCHEMA_FIELDS
        };
        this.table = await this.db.createTable(TABLE_NAME, { schema });
      } else {
        this.table = await this.db.openTable(TABLE_NAME);
      }
    } catch (err) {
      console.error("[hawk-bridge] LanceDB init failed:", err);
      throw err;
    }
  }
  async store(entry) {
    if (!this.table) await this.init();
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
      metadata: JSON.stringify(entry.metadata || {})
    };
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
      await this.table.update({ where: `id = '${id}'`, updates: {
        access_count: this.db.util().scalar("access_count + 1"),
        last_accessed_at: Date.now()
      } });
    } catch {
    }
  }
  async listRecent(limit = 10) {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(limit).toList();
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
        vector: r.vector,
        category: r.category,
        scope: r.scope,
        importance: r.importance,
        timestamp: r.timestamp,
        metadata: JSON.parse(r.metadata || "{}")
      };
    } catch {
      return null;
    }
  }
};

// src/embeddings.ts
var Embedder = class {
  config;
  openai;
  constructor(config) {
    this.config = config;
  }
  async embed(texts) {
    const { provider } = this.config;
    if (provider === "minimax") {
      return this.embedMinimax(texts);
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
    const resp = await fetch(`${baseURL}/embeddings`, {
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
  // ---- Minimax embeddings ----
  async embedMinimax(texts) {
    const baseURL = this.config.baseURL || "https://api.minimaxi.com/v1";
    const apiKey = this.config.apiKey || process.env.MINIMAX_API_KEY || "";
    const resp = await fetch(`${baseURL}/embeddings`, {
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
      throw new Error(`Minimax embedding error: ${resp.status} ${errText}`);
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
    const client = new OpenAI({ apiKey: this.config.apiKey || process.env.OPENAI_API_KEY });
    const model = this.config.model || "text-embedding-3-small";
    const resp = await client.embeddings.create({ model, input: texts });
    return resp.data.map((item) => item.embedding);
  }
  // ---- Jina AI (free tier) ----
  async embedJina(texts) {
    const apiKey = this.config.apiKey || process.env.JINA_API_KEY || "";
    const model = this.config.model || "jina-embeddings-v5-small";
    const resp = await fetch("https://api.jina.ai/v1/embeddings", {
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
    const resp = await fetch("https://api.cohere.ai/v1/embed", {
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
    const baseURL = this.config.baseURL || "http://localhost:11434";
    const model = this.config.model || "nomic-embed-text";
    const results = [];
    for (const text of texts) {
      const resp = await fetch(`${baseURL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: text })
      });
      if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
      const data = await resp.json();
      results.push(data.embeddings);
    }
    return results;
  }
};
function formatRecallForContext(memories, emoji = "\u{1F985}") {
  if (!memories.length) return "";
  const lines = [`${emoji} ** hawk \u8BB0\u5FC6\u68C0\u7D22\u7ED3\u679C **`];
  for (const m of memories) {
    lines.push(`[${m.category}] (${(m.score * 100).toFixed(0)}%\u76F8\u5173): ${m.text}`);
  }
  return lines.join("\n");
}

// src/retriever.ts
var HybridRetriever = class {
  db;
  embedder;
  bm25 = null;
  // rank_bm25.BM25Okapi
  corpus = [];
  corpusIds = [];
  noisePrototypes = [];
  constructor(db2, embedder2) {
    this.db = db2;
    this.embedder = embedder2;
  }
  // ---------- BM25 Setup ----------
  async buildBm25Index() {
    try {
      const { BM25Okapi } = await import("rank_bm25");
      const allMemories = await this.db.getAllTexts();
      if (!allMemories.length) return;
      this.corpusIds = allMemories.map((m) => m.id);
      this.corpus = allMemories.map((m) => m.text.toLowerCase());
      this.bm25 = new BM25Okapi(this.corpus);
    } catch (e) {
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
    if (!this.noisePrototypes.length) {
      this.noisePrototypes = await this.embedder.embed(noiseTexts);
    }
  }
  isNoise(embedding, threshold = 0.82) {
    if (!this.noisePrototypes.length) return false;
    for (const prototype of this.noisePrototypes) {
      const sim = cosineSimilarity(embedding, prototype);
      if (sim >= threshold) return true;
    }
    return false;
  }
  // ---------- RRF Fusion ----------
  rrfFusion(vectorResults, bm25Results, k = 60) {
    const rrfMap = /* @__PURE__ */ new Map();
    for (let rank = 0; rank < vectorResults.length; rank++) {
      const item = vectorResults[rank];
      const score = 1 / (k + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, bm25Score: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * 0.7,
        // vector weight
        vectorScore: item.score,
        bm25Score: existing.bm25Score
      });
    }
    for (let rank = 0; rank < bm25Results.length; rank++) {
      const item = bm25Results[rank];
      const score = 1 / (k + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, bm25Score: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * 0.3,
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
  async search(query, topK = 5, scope) {
    if (!this.bm25) await this.buildBm25Index();
    if (!this.noisePrototypes.length) await this.buildNoisePrototypes();
    const queryVector = await this.embedder.embedQuery(query);
    const vectorResults = await this.db.search(queryVector, topK * 4, 0, scope);
    const vectorRanked = vectorResults.map((r, i) => ({ id: r.id, score: 1 - i * 0.01, text: r.text })).sort((a, b) => b.score - a.score);
    const bm25Scores = this.bm25Score(query);
    const bm25Ranked = this.corpusIds.map((id, i) => ({ id, score: bm25Scores[i], text: this.corpus[i] })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, topK * 4);
    const fused = this.rrfFusion(vectorRanked, bm25Ranked);
    const noiseFiltered = [];
    for (const item of fused) {
      const memory = await this.db.getById(item.id);
      if (!memory) continue;
      if (this.isNoise(memory.vector)) continue;
      noiseFiltered.push({ ...item, text: memory.text, vector: memory.vector });
    }
    const candidates = noiseFiltered.slice(0, topK * 3).map((item) => ({
      id: item.id,
      text: item.text,
      score: item.rrfScore
    }));
    const reranked = await this.rerank(query, candidates, topK);
    const idToRerank = new Map(reranked.map((r) => [r.id, r.rerankScore]));
    const results = [];
    for (const item of noiseFiltered) {
      const rerankScore = idToRerank.get(item.id);
      if (rerankScore === void 0) continue;
      const memory = await this.db.getById(item.id);
      if (!memory) continue;
      results.push({
        id: item.id,
        text: memory.text,
        score: rerankScore,
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
    provider: "openclaw",
    // New: uses openclaw's configured provider
    apiKey: "",
    model: "text-embedding-3-small",
    baseURL: "",
    dimensions: 1536
  },
  llm: {
    provider: "openclaw",
    apiKey: "",
    model: "",
    baseURL: ""
  },
  recall: {
    topK: 5,
    minScore: 0.6,
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
var cachedConfig = null;
async function getConfig() {
  if (cachedConfig) return cachedConfig;
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
  if (process.env.OLLAMA_BASE_URL) {
    config.embedding.provider = "ollama";
    config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
  }
  if (process.env.JINA_API_KEY) {
    config.embedding.provider = "jina";
    config.embedding.apiKey = process.env.JINA_API_KEY;
  }
  cachedConfig = config;
  return config;
}

// src/hooks/hawk-recall/handler.ts
var retriever = null;
async function getRetriever() {
  if (!retriever) {
    const config = await getConfig();
    const db2 = new HawkDB();
    await db2.init();
    const embedder2 = new Embedder(config.embedding);
    retriever = new HybridRetriever(db2, embedder2);
    await retriever.buildBm25Index();
    await retriever.buildNoisePrototypes();
  }
  return retriever;
}
var recallHandler = async (event) => {
  if (event.type !== "agent" || event.action !== "bootstrap") return;
  try {
    const config = await getConfig();
    const { topK, injectEmoji } = config.recall;
    const sessionEntry = event.context?.sessionEntry;
    if (!sessionEntry) return;
    const queryText = extractQueryFromSession(sessionEntry);
    if (!queryText || queryText.length < 10) return;
    const retrieverInstance = await getRetriever();
    const memories = await retrieverInstance.search(queryText, topK);
    if (!memories.length) return;
    const injectionText = formatRecallForContext(
      memories.map((m) => ({
        text: m.text,
        score: m.score,
        category: m.category
      })),
      injectEmoji
    );
    event.messages.push(`
${injectionText}
`);
  } catch (err) {
    console.error("[hawk-recall] Error:", err);
  }
};
function extractQueryFromSession(sessionEntry) {
  if (!sessionEntry) return "";
  const messages = sessionEntry.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && msg.content) {
      return typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    }
  }
  return "";
}
var handler_default = recallHandler;

// src/hooks/hawk-capture/handler.ts
import { spawn } from "child_process";
import { promisify } from "util";
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
    if (!content || content.length < 50) return;
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
  return new Promise((resolve, reject) => {
    const apiKey = config.embedding.apiKey || process.env.OPENAI_API_KEY || process.env.MINIMAX_API_KEY || "";
    const model = config.llm?.model || process.env.MINIMAX_MODEL || "MiniMax-M2.7";
    const provider = config.llm?.provider || "openclaw";
    const baseURL = config.llm?.baseURL || process.env.MINIMAX_BASE_URL || "";
    const proc = spawn(
      config.python.pythonPath,
      ["-c", buildExtractorScript(conversationText, apiKey, model, provider, baseURL)],
      { timeout: 3e4 }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.error("[hawk-capture] extractor error:", stderr);
        resolve([]);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (Array.isArray(result)) {
          resolve(result);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
    proc.on("error", () => resolve([]));
  });
}
function buildExtractorScript(conversation, apiKey, model, provider, baseURL) {
  const escaped = conversation.replace(/'/g, "'\\''").replace(/\n/g, "\\n");
  return `
import sys, json, os
sys.path.insert(0, os.path.expanduser('~/.openclaw/workspace/hawk-bridge/python'))
try:
    from hawk_memory import extract_memories
    result = extract_memories('${escaped}', '${apiKey}', '${model}', '${provider}', '${baseURL}')
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
var index_default = {
  id: "hawk-bridge",
  name: "hawk-bridge",
  version: "1.0.0",
  description: "AutoCapture + AutoRecall bridge to hawk Python memory system",
  hooks: {
    "hawk-recall": handler_default,
    "hawk-capture": handler_default2
  }
};
export {
  index_default as default,
  handler_default2 as "hawk-capture",
  handler_default as "hawk-recall"
};

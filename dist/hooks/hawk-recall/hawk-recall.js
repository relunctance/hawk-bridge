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
function formatRecallForContext(memories, emoji = "\u{1F985}") {
  if (!memories.length) return "";
  const lines = [`${emoji} ** hawk \u8BB0\u5FC6\u68C0\u7D22\u7ED3\u679C **`];
  for (const m of memories) {
    lines.push(`[${m.category}] (${(m.score * 100).toFixed(0)}%\u76F8\u5173): ${m.text}`);
  }
  return lines.join("\n");
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
function hasEmbeddingProvider() {
  return !!(process.env.MINIMAX_API_KEY || process.env.JINA_API_KEY || process.env.OLLAMA_BASE_URL || process.env.OPENAI_API_KEY || getConfiguredProvider("minimax"));
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
  constructor(db, embedder) {
    this.db = db;
    this.embedder = embedder;
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
      console.warn("[hawk-bridge] Noise prototype embedding failed, skipping:", e);
    }
  }
  isNoise(embedding) {
    if (!this.noisePrototypes.length) return false;
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
  async search(query, topK = 5, scope) {
    if (!this.bm25) await this.buildBm25Index();
    if (!this.noisePrototypes.length) await this.buildNoisePrototypes();
    const hasEmbedding = hasEmbeddingProvider();
    if (hasEmbedding) {
      try {
        const queryVector = await this.embedder.embedQuery(query);
        const vectorResults = await this.db.search(queryVector, topK * VECTOR_SEARCH_MULTIPLIER, 0, scope);
        const vectorRanked = vectorResults.map((r, i) => ({ id: r.id, score: 1 - i * 0.01, text: r.text })).sort((a, b) => b.score - a.score);
        const bm25Scores2 = this.bm25Score(query);
        const bm25Ranked2 = this.corpusIds.map((id, i) => ({ id, score: bm25Scores2[i], text: this.corpus[i] })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, topK * BM25_SEARCH_MULTIPLIER);
        const fused = this.rrfFusion(vectorRanked, bm25Ranked2);
        const noiseFiltered = [];
        for (const item of fused) {
          const memory = await this.db.getById(item.id);
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
          const memory = await this.db.getById(item.id);
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
    const idToScore = new Map(bm25Ranked.map((item) => [item.id, item.score]));
    const results = [];
    for (const item of bm25Ranked) {
      const score = idToScore.get(item.id);
      if (score === void 0) continue;
      const memory = await this.db.getById(item.id);
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
var retrieverPromise = null;
async function getRetriever() {
  if (!retrieverPromise) {
    retrieverPromise = (async () => {
      const config = await getConfig();
      const db = new HawkDB();
      await db.init();
      const embedder = new Embedder(config.embedding);
      const r = new HybridRetriever(db, embedder);
      await r.buildBm25Index();
      await r.buildNoisePrototypes();
      return r;
    })();
  }
  return retrieverPromise;
}
var recallHandler = async (event) => {
  if (event.type !== "agent" || event.action !== "bootstrap") return;
  try {
    const config = await getConfig();
    const { topK, injectEmoji } = config.recall;
    const sessionEntry = event.context?.sessionEntry;
    if (!sessionEntry) return;
    const queryText = extractQueryFromSession(sessionEntry);
    if (!queryText || queryText.trim().length < 2) return;
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
export {
  handler_default as default
};

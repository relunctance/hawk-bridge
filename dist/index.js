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

// src/logger.ts
import pino from "pino";
var logLevel, logger;
var init_logger = __esm({
  "src/logger.ts"() {
    "use strict";
    logLevel = process.env.HAWK__LOGGING__LEVEL || process.env.HAWK_LOG_LEVEL || "info";
    logger = pino({
      level: logLevel,
      formatters: {
        level: (label) => ({ level: label })
      },
      timestamp: pino.stdTimeFunctions.isoTime
    });
  }
});

// src/metrics.ts
import { Registry, Counter, Histogram, Gauge } from "prom-client";
var register, httpRequestsTotal, httpRequestDuration, embeddingLatency, memoryCount, memoryErrors;
var init_metrics = __esm({
  "src/metrics.ts"() {
    "use strict";
    register = new Registry();
    httpRequestsTotal = new Counter({
      name: "hawk_http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "path", "status"],
      registers: [register]
    });
    httpRequestDuration = new Histogram({
      name: "hawk_http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "path"],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [register]
    });
    embeddingLatency = new Histogram({
      name: "hawk_embedding_duration_seconds",
      help: "Embedding latency in seconds",
      labelNames: ["provider"],
      buckets: [0.1, 0.25, 0.5, 1, 2, 5],
      registers: [register]
    });
    memoryCount = new Gauge({
      name: "hawk_memory_count",
      help: "Number of memories in the store",
      registers: [register]
    });
    memoryErrors = new Counter({
      name: "hawk_errors_total",
      help: "Total number of memory errors",
      labelNames: ["type"],
      registers: [register]
    });
  }
});

// src/embeddings.ts
var embeddings_exports = {};
__export(embeddings_exports, {
  Embedder: () => Embedder,
  fetchWithRetry: () => fetchWithRetry,
  formatRecallForContext: () => formatRecallForContext,
  getProxyUrl: () => getProxyUrl,
  setProxyUrl: () => setProxyUrl
});
import http from "http";
import https from "https";
import { URL } from "url";
import { HttpsProxyAgent } from "https-proxy-agent";
async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, options.timeout ?? FETCH_TIMEOUT_MS);
      return response;
    } catch (err) {
      lastError = err;
      const isNetworkError = err?.message?.includes("timeout") || err?.message?.includes("ECONNREFUSED") || err?.message?.includes("ENOTFOUND") || err?.message?.includes("socket hang up") || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT";
      if (isNetworkError && attempt < retries) {
        const delay = 500 * Math.pow(2, attempt - 1);
        logger.warn({ attempt, retries, delayMs: delay, url, error: err.message }, "fetchWithRetry: retrying after network error");
        await new Promise((res) => setTimeout(res, delay));
      } else if (attempt < retries && err?.message?.includes("status code 5")) {
        const delay = 500 * Math.pow(2, attempt - 1);
        logger.warn({ attempt, retries, delayMs: delay, url, error: err.message }, "fetchWithRetry: retrying after 5xx error");
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
function setProxyUrl(url) {
  _activeProxyUrl = url;
  _proxyAgent = null;
}
function getProxyUrl() {
  return process.env.HAWK_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || _activeProxyUrl;
}
function getProxyAgent() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return void 0;
  if (!_proxyAgent) {
    _proxyAgent = new HttpsProxyAgent(proxyUrl);
  }
  return _proxyAgent;
}
async function fetchWithTimeout(url, init, timeoutMs) {
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";
  const agent = getProxyAgent();
  const body = init?.body || null;
  const timeout = timeoutMs ?? FETCH_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const headers = {
      ...init?.headers || {}
    };
    if (body) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: init?.method || "GET",
      headers,
      ...agent ? { agent } : {}
    };
    const timer = setTimeout(() => {
      req.destroy(new Error("Fetch timeout"));
    }, timeout);
    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        clearTimeout(timer);
        const responseBody = Buffer.concat(chunks);
        const response = new Response(responseBody, {
          status: res.statusCode || 0,
          statusText: res.statusMessage || "",
          headers: new Headers(res.headers)
        });
        resolve(response);
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}
function formatRecallForContext(memories, emoji = "\u{1F985}") {
  if (!memories.length) return "";
  const lines = [`${emoji} ** hawk \u8BB0\u5FC6\u68C0\u7D22\u7ED3\u679C **`];
  for (const m of memories) {
    lines.push(`[${m.category}] (${(m.score * 100).toFixed(0)}%\u76F8\u5173): ${m.text}`);
  }
  return lines.join("\n");
}
var FETCH_TIMEOUT_MS, _activeProxyUrl, _proxyAgent, Embedder;
var init_embeddings = __esm({
  "src/embeddings.ts"() {
    "use strict";
    init_logger();
    init_metrics();
    FETCH_TIMEOUT_MS = 15e3;
    _activeProxyUrl = process.env.HAWK_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || "";
    _proxyAgent = null;
    Embedder = class _Embedder {
      config;
      // TTL cache: normalized_text → { vector, timestamp }
      cache = /* @__PURE__ */ new Map();
      static CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
      // 24h
      constructor(config) {
        this.config = config;
        if (config.proxy) {
          setProxyUrl(config.proxy);
        }
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
        const start = Date.now();
        try {
          const apiKey = this.config.apiKey || process.env.QWEN_API_KEY || "";
          const baseURL = this.config.baseURL || "https://dashscope.aliyuncs.com/api/v1";
          const resp = await fetchWithRetry(
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
          const result = data.output.embeddings.map((e) => e.embedding);
          embeddingLatency.observe({ provider: "qianwen" }, (Date.now() - start) / 1e3);
          return result;
        } catch (err) {
          embeddingLatency.observe({ provider: "qianwen" }, (Date.now() - start) / 1e3);
          throw err;
        }
      }
      // ---- OpenAI-Compatible (generic endpoint — user provides baseURL + apiKey) ----
      async embedOpenAICompat(texts) {
        const start = Date.now();
        try {
          const baseURL = this.config.baseURL;
          const apiKey = this.config.apiKey;
          if (!baseURL || !apiKey) {
            throw new Error("openai-compat provider requires both baseURL and apiKey in config");
          }
          const resp = await fetchWithRetry(`${baseURL}/embeddings`, {
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
          const result = data.data.map((item) => item.embedding);
          embeddingLatency.observe({ provider: "openai-compat" }, (Date.now() - start) / 1e3);
          return result;
        } catch (err) {
          embeddingLatency.observe({ provider: "openai-compat" }, (Date.now() - start) / 1e3);
          throw err;
        }
      }
      // ---- OpenAI ----
      async embedOpenAI(texts) {
        const start = Date.now();
        try {
          const { OpenAI } = await import("openai");
          const client = new OpenAI({
            apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
            baseURL: this.config.baseURL || void 0,
            timeout: FETCH_TIMEOUT_MS,
            // @ts-ignore — Node-specific http agent for proxy
            httpAgent: getProxyAgent(),
            httpsAgent: getProxyAgent()
          });
          const model = this.config.model || "text-embedding-3-small";
          const resp = await client.embeddings.create({ model, input: texts });
          const result = resp.data.map((item) => item.embedding);
          embeddingLatency.observe({ provider: "openai" }, (Date.now() - start) / 1e3);
          return result;
        } catch (err) {
          embeddingLatency.observe({ provider: "openai" }, (Date.now() - start) / 1e3);
          throw err;
        }
      }
      // ---- Jina AI (free tier) ----
      async embedJina(texts) {
        const start = Date.now();
        try {
          const apiKey = this.config.apiKey || process.env.JINA_API_KEY || "";
          const model = this.config.model || "jina-embeddings-v5-small";
          const resp = await fetchWithRetry("https://api.jina.ai/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}
            },
            body: JSON.stringify({ model, input: texts })
          });
          if (!resp.ok) throw new Error(`Jina error: ${resp.status}`);
          const data = await resp.json();
          const result = data.data.map((item) => item.embedding);
          embeddingLatency.observe({ provider: "jina" }, (Date.now() - start) / 1e3);
          return result;
        } catch (err) {
          embeddingLatency.observe({ provider: "jina" }, (Date.now() - start) / 1e3);
          throw err;
        }
      }
      // ---- Cohere (free tier) ----
      async embedCohere(texts) {
        const start = Date.now();
        try {
          const apiKey = this.config.apiKey || process.env.COHERE_API_KEY || "";
          const resp = await fetchWithRetry("https://api.cohere.ai/v1/embed", {
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
          const result = data.embeddings;
          embeddingLatency.observe({ provider: "cohere" }, (Date.now() - start) / 1e3);
          return result;
        } catch (err) {
          embeddingLatency.observe({ provider: "cohere" }, (Date.now() - start) / 1e3);
          throw err;
        }
      }
      // ---- Ollama (local free) ----
      async embedOllama(texts) {
        const start = Date.now();
        try {
          const baseURL = (this.config.baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
          const model = this.config.model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
          const embedPath = process.env.OLLAMA_EMBED_PATH || "/embeddings";
          const normalizedBase = baseURL.replace(/\/$/, "");
          const url = `${normalizedBase}${embedPath}`;
          const resp = await fetchWithRetry(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, input: texts })
          });
          if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Ollama embedding error: ${resp.status} ${err}`);
          }
          const data = await resp.json();
          if (Array.isArray(data.data)) {
            const sorted = data.data.sort((a, b) => a.index - b.index);
            const result = sorted.map((item) => item.embedding);
            embeddingLatency.observe({ provider: "ollama" }, (Date.now() - start) / 1e3);
            return result;
          }
          if (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0])) {
            embeddingLatency.observe({ provider: "ollama" }, (Date.now() - start) / 1e3);
            return data.embeddings;
          } else if (Array.isArray(data.embeddings)) {
            embeddingLatency.observe({ provider: "ollama" }, (Date.now() - start) / 1e3);
            return [data.embeddings];
          }
          throw new Error(`Unexpected embedding response: ${JSON.stringify(data)}`);
        } catch (err) {
          embeddingLatency.observe({ provider: "ollama" }, (Date.now() - start) / 1e3);
          throw err;
        }
      }
    };
  }
});

// src/index.ts
import http2 from "http";
import { URL as URL2 } from "url";

// src/hooks/hawk-recall/handler.ts
import * as path3 from "path";
import * as fs2 from "fs";
import { homedir as homedir3 } from "os";

// src/store/adapters/lancedb.ts
init_embeddings();
import * as path2 from "path";
import * as os3 from "os";

// src/config.ts
import * as fs from "fs";
import * as path from "path";
import * as os2 from "os";

// node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// src/config.ts
import * as crypto from "crypto";

// src/constants.ts
var BM25_K1 = parseFloat(process.env.HAWK_BM25_K1 || "1.5");
var BM25_B = parseFloat(process.env.HAWK_BM25_B || "0.75");
var RRF_K = parseFloat(process.env.HAWK_RRF_K || "60");
var RRF_VECTOR_WEIGHT = parseFloat(process.env.HAWK_RRF_VECTOR_WEIGHT || "0.7");
var NOISE_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_NOISE_THRESHOLD || "0.82");
var VECTOR_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_VECTOR_SEARCH_MULTIPLIER || "4", 10);
var BM25_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_BM25_SEARCH_MULTIPLIER || "4", 10);
var RERANK_CANDIDATE_MULTIPLIER = parseInt(process.env.HAWK_RERANK_CANDIDATE_MULTIPLIER || "3", 10);
var BM25_QUERY_LIMIT = parseInt(process.env.HAWK_BM25_QUERY_LIMIT || "1000", 10);
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
var DRIFT_THRESHOLD_DAYS = parseInt(process.env.HAWK_DRIFT_THRESHOLD_DAYS || "7", 10);
var DRIFT_REVERIFY_DAYS = parseInt(process.env.HAWK_DRIFT_REVERIFY_DAYS || "14", 10);
var EVOLUTION_SUCCESS = parseFloat(process.env.HAWK_EVOLUTION_SUCCESS || "0.95");
var EVOLUTION_FAILURE = parseFloat(process.env.HAWK_EVOLUTION_FAILURE || "0.25");
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
var TIER_PERMANENT_MIN_SCORE = parseFloat(process.env.HAWK_TIER_PERMANENT_MIN_SCORE || "0.85");
var TIER_STABLE_MIN_SCORE = parseFloat(process.env.HAWK_TIER_STABLE_MIN_SCORE || "0.6");
var TIER_DECAY_MIN_SCORE = parseFloat(process.env.HAWK_TIER_DECAY_MIN_SCORE || "0.3");
var RECENCY_HALF_LIFE_MS = parseFloat(process.env.HAWK_RECENCY_HALF_LIFE_MS || String(30 * 24 * 60 * 60 * 1e3));
var WEIGHT_BASE = parseFloat(process.env.HAWK_WEIGHT_BASE || "0.4");
var WEIGHT_USEFULNESS = parseFloat(process.env.HAWK_WEIGHT_USEFULNESS || "0.3");
var WEIGHT_RECENCY = parseFloat(process.env.HAWK_WEIGHT_RECENCY || "0.2");
var ACCESS_BONUS_MAX = parseFloat(process.env.HAWK_ACCESS_BONUS_MAX || "0.1");

// src/config/env.ts
var DEPRECATED_VARS = [
  { var: "OLLAMA_BASE_URL", message: "Use HAWK__EMBEDDING__BASE_URL instead" },
  { var: "OLLAMA_EMBED_MODEL", message: "Use HAWK__EMBEDDING__MODEL instead" },
  { var: "OLLAMA_EMBED_PATH", message: "Use HAWK__EMBEDDING__BASE_URL instead" },
  { var: "HAWK_EMBED_PROVIDER", message: "Use HAWK__EMBEDDING__PROVIDER instead" },
  { var: "HAWK_EMBED_API_KEY", message: "Use HAWK__EMBEDDING__API_KEY instead" },
  { var: "HAWK_EMBED_MODEL", message: "Use HAWK__EMBEDDING__MODEL instead" },
  { var: "HAWK_EMBEDDING_DIM", message: "Use HAWK__EMBEDDING__DIMENSIONS instead" },
  { var: "HAWK_PROXY", message: "Use HAWK__EMBEDDING__PROXY instead" },
  { var: "HAWK_BM25_QUERY_LIMIT", message: "Use HAWK__STORAGE__BM25_QUERY_LIMIT instead" },
  { var: "HAWK_MIN_SCORE", message: "Use HAWK__RECALL__MIN_SCORE instead" },
  { var: "HAWK_RERANK", message: "Use HAWK__RECALL__RERANK_ENABLED instead" },
  { var: "HAWK_RERANK_MODEL", message: "Use HAWK__RECALL__RERANK_MODEL instead" },
  { var: "HAWK_LOG_LEVEL", message: "Use HAWK__LOGGING__LEVEL instead (or use HAWK__LOGGING__LEVEL directly \u2014 handled by logger, not config)" }
];
var deprecationWarningsPrinted = false;
function printDeprecationWarnings() {
  if (deprecationWarningsPrinted) return;
  deprecationWarningsPrinted = true;
  for (const { var: v, message } of DEPRECATED_VARS) {
    if (process.env[v] !== void 0) {
      console.warn(`[hawk-bridge] DEPRECATED: ${v} is deprecated. ${message}`);
    }
  }
}
function toCamel(s) {
  const parts = s.split("_").map((p) => p.toLowerCase());
  if (parts.length === 1) return parts[0];
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}
function applyValue(obj, key, value) {
  if (value === "true" || value === "false") {
    obj[key] = value === "true";
  } else if (/^\d+$/.test(value)) {
    obj[key] = parseInt(value, 10);
  } else if (/^\d+\.\d+$/.test(value)) {
    obj[key] = parseFloat(value);
  } else {
    obj[key] = value;
  }
}
function parseUnifiedEnvVars() {
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(process.env)) {
    if (!rawKey.startsWith("HAWK__")) continue;
    const parts = rawKey.slice(6).split("__");
    if (parts.length < 2 || parts[0] === "") continue;
    const topLevel = parts[0].toLowerCase();
    const current = result[topLevel] ?? {};
    result[topLevel] = current;
    const nestedKey = toCamel(parts.slice(1).join("_"));
    applyValue(current, nestedKey, rawValue);
  }
  const keys = Object.keys(result);
  if (keys.length > 0) {
  }
  return stripUndefined(result);
}
function stripUndefined(obj) {
  if (obj === void 0) return void 0;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== void 0) result[k] = stripUndefined(v);
    }
    return result;
  }
  return obj;
}
function parseDeprecatedEnvVars() {
  printDeprecationWarnings();
  const config = {};
  if (process.env.OLLAMA_BASE_URL) {
    config.embedding = {
      ...config.embedding || {},
      provider: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
      dimensions: parseInt(process.env.HAWK_EMBEDDING_DIM || "768", 10)
    };
  }
  if (process.env.HAWK_EMBED_PROVIDER && !process.env.OLLAMA_BASE_URL) {
    config.embedding = { ...config.embedding || {}, provider: process.env.HAWK_EMBED_PROVIDER };
  }
  if (process.env.HAWK_EMBED_API_KEY) {
    config.embedding = { ...config.embedding || {}, apiKey: process.env.HAWK_EMBED_API_KEY };
  }
  if (process.env.HAWK_EMBED_MODEL) {
    config.embedding = { ...config.embedding || {}, model: process.env.HAWK_EMBED_MODEL };
  }
  if (process.env.HAWK_EMBEDDING_DIM) {
    config.embedding = { ...config.embedding || {}, dimensions: parseInt(process.env.HAWK_EMBEDDING_DIM, 10) };
  }
  if (process.env.HAWK_PROXY) {
    config.embedding = { ...config.embedding || {}, proxy: process.env.HAWK_PROXY };
  }
  if (process.env.HAWK_LLM_PROVIDER) {
    config.llm = { ...config.llm || {}, provider: process.env.HAWK_LLM_PROVIDER };
  }
  if (process.env.HAWK_LLM_MODEL) {
    config.llm = { ...config.llm || {}, model: process.env.HAWK_LLM_MODEL };
  }
  if (process.env.HAWK_LLM_API_KEY) {
    config.llm = { ...config.llm || {}, apiKey: process.env.HAWK_LLM_API_KEY };
  }
  if (process.env.HAWK_MIN_SCORE) {
    config.recall = { ...config.recall || {}, minScore: parseFloat(process.env.HAWK_MIN_SCORE) };
  }
  if (process.env.HAWK_RERANK) {
    config.recall = { ...config.recall || {}, rerankEnabled: process.env.HAWK_RERANK === "true" };
  }
  if (process.env.HAWK_RERANK_MODEL) {
    config.recall = { ...config.recall || {}, rerankModel: process.env.HAWK_RERANK_MODEL };
  }
  if (process.env.HAWK_CAPTURE_ENABLED !== void 0) {
    config.capture = { ...config.capture || {}, enabled: process.env.HAWK_CAPTURE_ENABLED !== "false" };
  }
  return config;
}
function getEnvOverrides() {
  const unified = parseUnifiedEnvVars();
  const deprecated = parseDeprecatedEnvVars();
  const unifiedEmbed = unified?.embedding;
  if (unifiedEmbed) {
    if (unifiedEmbed.baseUrl && !unifiedEmbed.baseURL) {
      unifiedEmbed.baseURL = unifiedEmbed.baseUrl;
      delete unifiedEmbed.baseUrl;
    }
    if (unifiedEmbed.baseURL && !unifiedEmbed.provider) {
      const url = unifiedEmbed.baseURL;
      if (url.includes("localhost") || url.includes("127.0.0.1")) {
        unifiedEmbed.provider = "ollama";
      }
    }
  }
  return deepMerge(deprecated, unified);
}
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (baseVal !== void 0 && overrideVal !== void 0 && typeof baseVal === "object" && typeof overrideVal === "object" && !Array.isArray(baseVal) && !Array.isArray(overrideVal)) {
      result[key] = deepMerge(baseVal, overrideVal);
    } else if (overrideVal !== void 0) {
      result[key] = overrideVal;
    }
  }
  return result;
}

// src/config.ts
var OPENCLAW_CONFIG_PATH = path.join(os2.homedir(), ".openclaw", "openclaw.json");
var OPENCLAW_AGENT_MODELS = path.join(os2.homedir(), ".openclaw", "agents", "main", "agent", "models.json");
var HAWK_CONFIG_DIR = path.join(os2.homedir(), ".hawk");
var cachedOpenClawConfig = null;
var cachedAgentModels = null;
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
function loadAgentModels() {
  if (cachedAgentModels !== null) return cachedAgentModels;
  try {
    cachedAgentModels = JSON.parse(fs.readFileSync(OPENCLAW_AGENT_MODELS, "utf-8"));
    return cachedAgentModels;
  } catch {
    cachedAgentModels = null;
    return null;
  }
}
function getAgentModelKey(provider) {
  const agents = loadAgentModels();
  if (!agents) return null;
  const providers = agents.providers;
  if (!providers) return null;
  const p = providers[provider];
  if (!p) return null;
  return {
    apiKey: p.apiKey ?? "",
    baseUrl: p.baseUrl ?? ""
  };
}
function getDefaultModelId() {
  const cfg = loadOpenClawConfig();
  const openclawPrimary = cfg?.agents?.defaults?.model?.primary;
  if (openclawPrimary && typeof openclawPrimary === "string") {
    return openclawPrimary;
  }
  if (!cfg?.models?.providers) return "MiniMax-M2.7";
  const prov = cfg.models.providers["minimax"];
  if (!prov?.models?.length) return "MiniMax-M2.7";
  return prov.models[0].id;
}
var DEFAULT_CONFIG = {
  embedding: {
    provider: "qianwen",
    apiKey: "",
    model: "text-embedding-v1",
    baseURL: "https://dashscope.aliyuncs.com/api/v1",
    dimensions: 1024,
    proxy: ""
  },
  llm: {
    provider: "groq",
    apiKey: "",
    model: "llama-3.3-70b-versatile",
    baseURL: ""
  },
  recall: {
    topK: 5,
    minScore: DEFAULT_MIN_SCORE,
    injectEmoji: "\u{1F985}"
  },
  logging: {
    level: "info"
  },
  audit: {
    enabled: true
  },
  capture: {
    enabled: true,
    maxChunks: 3,
    importanceThreshold: 0.5,
    ttlMs: 30 * 24 * 60 * 60 * 1e3,
    maxChunkSize: 2e3,
    minChunkSize: 20,
    dedupSimilarity: 0.95
  },
  python: {
    pythonPath: "python3",
    hawkDir: "~/.openclaw/hawk"
  }
};
function resolveEnvVars(raw) {
  return raw.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? "";
  });
}
function loadYamlConfig() {
  const yamlPath = path.join(HAWK_CONFIG_DIR, "config.yaml");
  if (fs.existsSync(yamlPath)) {
    try {
      const raw = fs.readFileSync(yamlPath, "utf-8");
      const resolved = resolveEnvVars(raw);
      return load(resolved);
    } catch (e) {
      console.warn("[hawk-bridge] Failed to load config.yaml:", e);
    }
  }
  return {};
}
var configPromise = null;
async function getConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      let config = { ...DEFAULT_CONFIG };
      const yamlConfig = loadYamlConfig();
      if (Object.keys(yamlConfig).length > 0) {
        config = deepMerge(DEFAULT_CONFIG, yamlConfig);
      }
      const envOverrides = getEnvOverrides();
      if (Object.keys(envOverrides).length > 0) {
        config = deepMerge(config, envOverrides);
      }
      const hasEmbedding = config.embedding?.provider || config.embedding?.apiKey || config.embedding?.baseURL;
      if (!hasEmbedding) {
        if (process.env.OLLAMA_BASE_URL) {
          config.embedding.provider = "ollama";
          config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
          config.embedding.model = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
          config.embedding.dimensions = parseInt(process.env.HAWK_EMBEDDING_DIM || "768", 10);
        } else {
          const openclawkKey = getAgentModelKey("minimax");
          if (openclawkKey?.apiKey) {
            config.embedding.provider = "minimax";
            config.embedding.apiKey = openclawkKey.apiKey;
            config.embedding.baseURL = openclawkKey.baseUrl || "https://api.minimaxi.com/v1";
            config.embedding.model = "text-embedding-v2";
            config.embedding.dimensions = 1024;
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
        }
      }
      if (!config.llm.model || !config.llm.apiKey) {
        const openclawkKey = getAgentModelKey("minimax");
        if (openclawkKey?.apiKey) {
          config.llm = config.llm || {};
          config.llm.model = config.llm.model || getDefaultModelId();
          config.llm.apiKey = openclawkKey.apiKey;
          config.llm.baseURL = config.llm.baseURL || openclawkKey.baseUrl || "";
          config.llm.provider = config.llm.provider || "minimax";
        }
      }
      await recordConfigHistory(config);
      return config;
    })();
  }
  return configPromise;
}
function hasEmbeddingProvider() {
  return !!(process.env.OLLAMA_BASE_URL || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.JINA_API_KEY || process.env.OPENAI_API_KEY || process.env.COHERE_API_KEY || (process.env.HAWK_EMBED_API_KEY || process.env.HAWK_EMBED_PROVIDER));
}
var HAWK_CONFIG_VERSION = process.env.HAWK_CONFIG_VERSION || "1";
async function recordConfigHistory(config) {
  try {
    const historyPath = path.join(HAWK_CONFIG_DIR, "config-history.jsonl");
    const relevantKeys = [
      "OLLAMA_BASE_URL",
      "OLLAMA_EMBED_MODEL",
      "HAWK__EMBEDDING__PROVIDER",
      "HAWK__EMBEDDING__MODEL",
      "HAWK__EMBEDDING__DIMENSIONS",
      "HAWK__EMBEDDING__BASE_URL",
      "HAWK__EMBEDDING__API_KEY",
      "HAWK__LLM__PROVIDER",
      "HAWK__LLM__MODEL",
      "HAWK__LLM__API_KEY",
      "HAWK__LOGGING__LEVEL",
      "HAWK_CONFIG_VERSION"
    ];
    const envSnapshot = {};
    for (const key of relevantKeys) {
      const val = process.env[key];
      if (val !== void 0) envSnapshot[key] = val;
    }
    envSnapshot["__resolved_provider"] = config.embedding.provider;
    envSnapshot["__resolved_dim"] = String(config.embedding.dimensions);
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      version: HAWK_CONFIG_VERSION,
      env: envSnapshot,
      hash: crypto.createHash("md5").update(JSON.stringify(envSnapshot)).digest("hex")
    };
    let entries = [];
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, "utf-8");
      entries = raw.trim().split("\n").filter(Boolean).map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter((e) => e !== null);
    }
    entries.push(entry);
    if (entries.length > 100) entries = entries.slice(-100);
    const dir = path.dirname(historyPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(historyPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  } catch {
  }
}

// src/store/adapters/lancedb.ts
init_logger();
init_embeddings();
var TABLE_NAME = "hawk_memories";
var LanceDBAdapter = class {
  db = null;
  table = null;
  dbPath;
  embedder = null;
  config;
  constructor(dbPath) {
    const home = os3.homedir();
    this.dbPath = dbPath ?? path2.join(home, ".hawk", "lancedb");
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
          vector: new Float32Array(DEFAULT_EMBEDDING_DIM),
          category: "fact",
          scope: "system",
          importance: 0,
          timestamp: Date.now(),
          expires_at: 0,
          created_at: Date.now(),
          access_count: 0,
          last_accessed_at: Date.now(),
          deleted_at: null,
          reliability: 0.5,
          verification_count: 0,
          last_verified_at: null,
          locked: false,
          correction_history: "[]",
          session_id: null,
          updated_at: Date.now(),
          scope_mem: "personal",
          importance_override: 1,
          cold_start_until: null,
          metadata: "{}",
          source_type: "text",
          source: "",
          drift_note: null,
          drift_detected_at: null,
          last_used_at: null,
          usefulness_score: 0.5,
          recall_count: 0,
          name: "__init__",
          description: "__init__"
        });
        const table = makeArrowTable([sampleRow]);
        this.table = await this.db.createTable(TABLE_NAME, table);
        await this.table.delete(`id = '__init__'`);
        try {
          const { Index } = await import("@lancedb/lancedb");
          await this.table.createIndex("text", Index.fts());
        } catch (err) {
          logger.warn({ err: err?.message }, "FTS index creation failed (non-fatal)");
        }
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
            { name: "cold_start_until", type: { type: "int64" } },
            { name: "name", type: { type: "utf8" } },
            { name: "description", type: { type: "utf8" } },
            { name: "drift_note", type: { type: "utf8" } },
            { name: "drift_detected_at", type: { type: "int64" } },
            { name: "source", type: { type: "utf8" } },
            { name: "last_used_at", type: { type: "int64" } },
            { name: "usefulness_score", type: { type: "float" } },
            { name: "recall_count", type: { type: "int32" } }
          ]);
        } catch (_) {
        }
      }
    } catch (err) {
      logger.error({ err }, "LanceDB init failed");
      throw err;
    }
  }
  async close() {
    this.db = null;
    this.table = null;
  }
  /**
   * Drop the table and clear the instance so the next operation will re-init
   * with the current DEFAULT_EMBEDDING_DIM. Used for dimension migration:
   *   HAWK_EMBEDDING_DIM=1024 hawk write --reinit
   */
  async reset() {
    if (!this.db) {
      return;
    }
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      await this.db.dropTable(TABLE_NAME);
      logger.info({ table: TABLE_NAME }, "Dropped table");
    }
    this.table = null;
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
      // Note: BigInt(null) throws, so use BigInt(0) as placeholder for null timestamps
      deleted_at: BigInt(data.deleted_at ?? 0),
      reliability: data.reliability,
      verification_count: data.verification_count,
      last_verified_at: BigInt(data.last_verified_at ?? 0),
      locked: data.locked ? 1 : 0,
      correction_history: data.correction_history,
      // Use empty string for null session_id to avoid schema inference failure in makeArrowTable
      session_id: data.session_id ?? "",
      // Use ?? 0 to handle undefined (init sample row doesn't set this field)
      updated_at: BigInt(data.updated_at ?? 0),
      // Default to 'personal' if not provided (init sample row doesn't set scope_mem)
      scope_mem: data.scope_mem || "personal",
      importance_override: data.importance_override,
      // Use BigInt(0) for null cold_start_until (LanceDB makeArrowTable can't infer null BigInt)
      cold_start_until: BigInt(data.cold_start_until ?? 0),
      metadata: data.metadata,
      source_type: data.source_type,
      source: data.source,
      // Use empty string for null drift_note (LanceDB makeArrowTable can't infer null)
      drift_note: data.drift_note ?? "",
      drift_detected_at: BigInt(data.drift_detected_at ?? 0),
      last_used_at: BigInt(data.last_used_at ?? 0),
      // Use 0.0 for null usefulness_score
      usefulness_score: data.usefulness_score ?? 0,
      recall_count: data.recall_count ?? 0
    };
  }
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
  /**
   * Clamp helper.
   */
  clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }
  /**
   * Value-driven importance score — single source of truth for memory "health".
   * Combines base importance, recency, usefulness, and recall frequency.
   *
   * score = base*0.4 + usefulness*0.3 + recency*0.2 + accessBonus
   * where accessBonus = min(log1p(recall_count)*0.05, 0.1)
   */
  computeEffectiveImportance(memory) {
    const {
      importance,
      last_used_at,
      usefulness_score,
      recall_count
    } = memory;
    const base = importance ?? 0.5;
    const recency = last_used_at ? Math.exp(-(Date.now() - last_used_at) / (RECENCY_HALF_LIFE_MS / Math.LN2)) : 0;
    const usefulness = usefulness_score ?? 0.5;
    const accessBonus = Math.min(Math.log1p(recall_count ?? 0) * 0.05, ACCESS_BONUS_MAX);
    const score = base * WEIGHT_BASE + usefulness * WEIGHT_USEFULNESS + recency * WEIGHT_RECENCY + accessBonus;
    return this.clamp(score, 0, 1);
  }
  /**
   * Recompute the tier for a memory based on its effective importance score.
   */
  recomputeTier(memory) {
    const score = this.computeEffectiveImportance(memory);
    if (score >= TIER_PERMANENT_MIN_SCORE && (memory.recall_count ?? 0) >= 3) {
      return "permanent";
    }
    if (score >= TIER_STABLE_MIN_SCORE) {
      return "stable";
    }
    if (score >= TIER_DECAY_MIN_SCORE) {
      return "decay";
    }
    return "archived";
  }
  /**
   * Run tier maintenance at startup: recompute effective importance and tier
   * for all memories. Tier changes are persisted back to the DB.
   * Called once per startup (not on every access) for performance.
   */
  async runTierMaintenance() {
    if (!this.table) await this.init();
    const memories = await this.getAllMemories();
    let updated = 0;
    for (const memory of memories) {
      if (memory.locked) continue;
      const newScore = this.computeEffectiveImportance(memory);
      const oldTier = memory.scope;
      const newTier = this.recomputeTier(memory);
      if (oldTier !== newTier || Math.abs(memory.importance - newScore) > 1e-3) {
        try {
          await this.table.update(
            {
              scope: newTier,
              importance: String(newScore),
              updated_at: String(Date.now())
            },
            { where: `id = '${memory.id.replace(/'/g, "''")}'` }
          );
          updated++;
        } catch {
        }
      }
    }
    return { updated };
  }
  _rowToMemory(r) {
    const correctionHistory = typeof r.correction_history === "string" ? JSON.parse(r.correction_history || "[]") : r.correction_history || [];
    return {
      id: r.id,
      text: r.text,
      vector: r.vector || [],
      category: r.category,
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
      scope: r.scope ?? r.scope_mem ?? "personal",
      importanceOverride: r.importance_override ?? 1,
      coldStartUntil: r.cold_start_until !== null ? Number(r.cold_start_until) : null,
      metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata || "{}") : r.metadata || {},
      source_type: r.source_type || "text",
      name: r.name ?? "",
      description: r.description ?? "",
      driftNote: r.drift_note ?? null,
      driftDetectedAt: r.drift_detected_at !== null ? Number(r.drift_detected_at) : null,
      source: r.source ?? "",
      last_used_at: Number(r.last_used_at ?? 0),
      usefulness_score: r.usefulness_score ?? 0.5,
      recall_count: r.recall_count ?? 0
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
      scope: r.scope ?? r.scope_mem ?? "personal",
      importanceOverride: r.importance_override ?? 1,
      coldStartUntil: r.cold_start_until !== null ? Number(r.cold_start_until) : null,
      matchReason,
      name: r.name ?? "",
      description: r.description ?? "",
      driftNote: r.drift_note ?? null,
      driftDetectedAt: r.drift_detected_at !== null ? Number(r.drift_detected_at) : null,
      source: r.source ?? "",
      last_used_at: r.last_used_at !== null ? Number(r.last_used_at) : null,
      usefulness_score: r.usefulness_score ?? null,
      recall_count: r.recall_count ?? 0
    };
  }
  // ─── MemoryStore Interface Implementation ───────────────────────────────────
  async store(entry, sessionId) {
    if (!this.table) await this.init();
    const now = Date.now();
    const correctionHistory = entry.correctionHistory ?? [];
    const scope2 = entry.scope_mem ?? entry.scope ?? "personal";
    const coldStartUntil = entry.coldStartUntil ?? now + COLD_START_GRACE_DAYS * 864e5;
    const row = this._makeRow({
      id: entry.id,
      text: entry.text,
      name: entry.name || "",
      description: entry.description || "",
      vector: entry.vector,
      category: entry.category,
      scope: entry.scope ?? "global",
      importance: entry.importance,
      timestamp: entry.timestamp,
      expires_at: entry.expiresAt || 0,
      created_at: now,
      access_count: entry.accessCount ?? 0,
      last_accessed_at: entry.lastAccessedAt ?? now,
      deleted_at: entry.deletedAt ?? null,
      reliability: entry.reliability ?? INITIAL_RELIABILITY,
      verification_count: entry.verificationCount ?? 0,
      last_verified_at: entry.lastVerifiedAt ?? null,
      locked: entry.locked ?? false,
      correction_history: JSON.stringify(correctionHistory),
      session_id: sessionId ?? entry.sessionId ?? null,
      updated_at: now,
      scope_mem: scope2,
      importance_override: entry.importanceOverride ?? 1,
      cold_start_until: coldStartUntil,
      metadata: JSON.stringify(entry.metadata || {}),
      source_type: entry.source_type || "text",
      source: entry.source || "",
      drift_note: entry.driftNote || null,
      drift_detected_at: entry.driftDetectedAt || null,
      last_used_at: entry.last_used_at ?? null,
      usefulness_score: entry.usefulness_score ?? null,
      recall_count: entry.recall_count ?? 0
    });
    await this.table.add([row]);
  }
  async update(id, fields) {
    if (!this.table) await this.init();
    try {
      const existing = await this.getById(id);
      if (!existing) return false;
      await this.table.delete(`id = '${id.replace(/'/g, "''")}'`);
      const updated = {
        ...existing,
        text: fields.text ?? existing.text,
        name: fields.name ?? existing.name,
        description: fields.description ?? existing.description,
        category: fields.category ?? existing.category,
        scope: fields.scope ?? existing.scope,
        importance: fields.importance ?? existing.importance,
        importanceOverride: fields.importanceOverride ?? existing.importanceOverride,
        updatedAt: Date.now(),
        vector: existing.vector,
        driftNote: fields.driftNote ?? existing.driftNote,
        driftDetectedAt: fields.driftDetectedAt ?? existing.driftDetectedAt
      };
      await this.store(updated, existing.sessionId ?? void 0);
      return true;
    } catch {
      return false;
    }
  }
  async delete(id) {
    await this.forget(id);
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
  /** Returns DB stats: memory count, total size in MB, directory path */
  async getDBStats() {
    if (!this.table) await this.init();
    const all = await this.table.query().limit(1e5).toArray();
    const count = all.filter((r) => r.deleted_at === null).length;
    let sizeMB = 0;
    try {
      const sizeBytes = await this._dirSize(this.dbPath);
      sizeMB = sizeBytes / (1024 * 1024);
    } catch {
    }
    return { count, sizeMB, path: this.dbPath };
  }
  async _dirSize(dirPath) {
    const fs22 = await import("fs/promises");
    let total = 0;
    try {
      const entries = await fs22.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = path2.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += await this._dirSize(full);
        } else {
          const stat = await fs22.stat(full);
          total += stat.size;
        }
      }
    } catch {
    }
    return total;
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
  /**
   * Export all memories as plain MemoryEntry objects (not LanceDB rows).
   * Uses cursor-based pagination to handle large datasets.
   * Used for backup before re-initialization.
   */
  async exportAll() {
    if (!this.table) await this.init();
    const all = [];
    let cursor = null;
    do {
      const { memories, nextCursor } = await this.getAllMemoriesPaginated(void 0, cursor ?? void 0);
      all.push(...memories);
      cursor = nextCursor;
    } while (cursor !== null);
    return all;
  }
  /**
   * Paginated getAllMemories — returns { memories, nextCursor }.
   * Fetches in batches of 1000.
   */
  async getAllMemoriesPaginated(agentId, cursor) {
    if (!this.table) await this.init();
    const BATCH = 1e3;
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const rows = await this.table.query().limit(BATCH).offset(offset).toArray();
    const filtered = rows.filter((r) => r.deleted_at === null).filter((r) => {
      if (!agentId) return true;
      const owner = r.metadata?.owner_agent ?? r.metadata?.ownerAgent ?? null;
      return owner === null || owner === agentId;
    }).map((r) => this._rowToMemory(r));
    const nextCursor = rows.length === BATCH ? String(offset + BATCH) : null;
    return { memories: filtered, nextCursor };
  }
  async listRecent(limit = 10) {
    if (!this.table) await this.init();
    const rows = await this.table.query().limit(limit * 2).toArray();
    return rows.filter((r) => r.deleted_at === null).slice(0, limit).map((r) => this._rowToMemory(r));
  }
  async getReviewCandidates(minReliability = 0.5, batchSize = 5) {
    const all = await this.getAllMemories();
    return all.filter((m) => !m.locked && m.reliability < minReliability).sort((a, b) => a.reliability - b.reliability).slice(0, batchSize);
  }
  async embed(texts) {
    if (!this.embedder) {
      const config = await getConfig();
      this.embedder = new Embedder(config.embedding);
    }
    return this.embedder.embed(texts);
  }
  async vectorSearch(query, topK) {
    if (!this.embedder) {
      const config = await getConfig();
      this.embedder = new Embedder(config.embedding);
    }
    const [queryVector] = await this.embedder.embed([query]);
    return this.search(queryVector, topK, 0);
  }
  async findSimilarEntity(text, threshold = ENTITY_DEDUP_THRESHOLD) {
    const all = await this.getAllMemories();
    const keywords = this._extractKeywords(text);
    let best = null;
    for (const m of all) {
      if (m.category !== "entity") continue;
      const memKeywords = this._extractKeywords(m.text);
      const overlap = keywords.filter((k) => memKeywords.includes(k)).length;
      const union = (/* @__PURE__ */ new Set([...keywords, ...memKeywords])).size;
      const score = union > 0 ? overlap / union : 0;
      if (!best || score > best.score) best = { m, score };
    }
    return best && best.score >= threshold ? best.m : null;
  }
  async verify(id, confirmed, correctedText) {
    await this.verifyMemory(id, confirmed, correctedText);
  }
  async lock(id) {
    if (!this.table) await this.init();
    try {
      await this.table.update(
        { locked: "1" },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch {
    }
  }
  async unlock(id) {
    if (!this.table) await this.init();
    try {
      await this.table.update(
        { locked: "0" },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch {
    }
  }
  async flagUnhelpful(id, penalty = 0.05) {
    if (!this.table) await this.init();
    try {
      const mem = await this.getById(id);
      if (!mem) return;
      const newRel = Math.max(0, mem.reliability - penalty);
      const newVerifications = mem.verificationCount + 1;
      await this.table.update(
        { reliability: String(newRel), verification_count: String(newVerifications), last_verified_at: String(Date.now()) },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch {
    }
  }
  async incrementAccess(id) {
    try {
      const current = await this._getAccessCount(id);
      const now = Date.now();
      await this.table.update(
        {
          access_count: String(current + 1),
          last_accessed_at: String(now),
          // Value-driven: track recall for tier computation
          last_used_at: String(now),
          recall_count: String(current + 1)
        },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch {
    }
  }
  async decay() {
    if (!this.table) await this.init();
    const ARCHIVE_TTL_DAYS = 180;
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
      if (m.scope === "archived" || m.scope === "archive") {
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
        const prospectiveMem = { ...m, importance: newImportance };
        const newTier = this.recomputeTier(prospectiveMem);
        if (newTier !== m.scope) {
          try {
            await this.table.update(
              { importance: String(newImportance), scope: newTier, updated_at: String(Date.now()) },
              { where: `id = '${m.id.replace(/'/g, "''")}'` }
            );
            updated++;
          } catch {
          }
        } else if (Math.abs(newImportance - m.importance) > 1e-3) {
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
    const purged = await this.purgeForgotten(FORGET_GRACE_DAYS);
    deleted += purged;
    try {
      await this.table?.trygc();
    } catch {
    }
    return { updated, deleted };
  }
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
  // ─── Additional HawkDB-compatible methods ────────────────────────────────────
  async ftsSearch(query, topK, scope, sourceTypes) {
    if (!this.table) await this.init();
    let results = await this.table.search(query, "fts").limit(topK * 4).toArray();
    results = results.filter((r) => r.deleted_at === null);
    if (scope) results = results.filter((r) => r.scope === scope);
    if (sourceTypes && sourceTypes.length > 0) {
      results = results.filter((r) => {
        const type2 = r.source_type || "text";
        return sourceTypes.includes(type2);
      });
    }
    const now = Date.now();
    results = results.filter((r) => {
      const expiresAt = Number(r.expires_at || 0);
      return expiresAt === 0 || expiresAt > now;
    });
    const retrieved = [];
    for (const row of results) {
      const score = row._relevance ?? 0;
      retrieved.push(this._rowToRetrieved(row, score));
      if (retrieved.length >= topK) break;
    }
    return retrieved;
  }
  async search(queryVector, topK, minScore, scope, sourceTypes, queryText) {
    if (!this.table) await this.init();
    let results = await this.table.search(queryVector).limit(topK * 4).toArray();
    results = results.filter((r) => r.deleted_at === null);
    if (scope) results = results.filter((r) => r.scope === scope);
    if (sourceTypes && sourceTypes.length > 0) {
      results = results.filter((r) => {
        const type2 = r.source_type || "text";
        return sourceTypes.includes(type2);
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
    const reranked = await this.rerankResults(queryText || "", retrieved);
    return reranked;
  }
  // ─── Reranking (cross-encoder) ────────────────────────────────────────────────
  /**
   * Rerank results using a cross-encoder if HAWK_RERANK=true and HAWK_RERANK_MODEL is set.
   * Calls Ollama base URL + /v1/rerank endpoint with {query, texts}.
   */
  async rerankResults(query, results) {
    const rerankEnabled = this.config?.recall?.rerankEnabled ?? process.env.HAWK_RERANK === "true";
    const rerankModel = this.config?.recall?.rerankModel ?? process.env.HAWK_RERANK_MODEL;
    if (!rerankEnabled || !rerankModel || !query) return results;
    try {
      const baseURL = (this.config?.embedding?.baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
      const texts = results.map((r) => r.text);
      const resp = await fetchWithRetry(`${baseURL}/v1/rerank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, texts, model: rerankModel })
      });
      if (!resp.ok) {
        logger.warn({ status: resp.status }, "Rerank endpoint returned error, skipping rerank");
        return results;
      }
      const data = await resp.json();
      if (!Array.isArray(data.results)) {
        logger.warn({ data }, "Unexpected rerank response format, skipping");
        return results;
      }
      const scoreMap = /* @__PURE__ */ new Map();
      for (const item of data.results) {
        scoreMap.set(item.index, item.relevance_score ?? 0);
      }
      const reranked = results.map((r, idx) => ({ r, score: scoreMap.get(idx) ?? 0 })).sort((a, b) => b.score - a.score).map(({ r }) => r);
      logger.debug({ reranked: reranked.length }, "Reranking applied");
      return reranked;
    } catch (err) {
      logger.warn({ err }, "Reranking failed, returning original results");
      return results;
    }
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
          source_type: r.source_type || "text",
          source: r.source ?? "",
          name: r.name ?? "",
          description: r.description ?? "",
          driftNote: r.drift_note ?? null,
          driftDetectedAt: r.drift_detected_at !== null ? Number(r.drift_detected_at) : null,
          last_used_at: Number(r.last_used_at ?? 0),
          usefulness_score: r.usefulness_score ?? 0.5,
          recall_count: r.recall_count ?? 0
        });
      }
    } catch {
    }
    return results;
  }
  async forget(id) {
    if (!this.table) await this.init();
    try {
      const memory = await this.getById(id);
      if (!memory) return false;
      if (memory.locked) {
        logger.warn({ memoryId: id }, "Cannot forget locked memory");
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
  async verifyMemory(id, confirmed, correctedText) {
    if (!this.table) await this.init();
    try {
      const memory = await this.getById(id);
      if (!memory) return false;
      const now = Date.now();
      const newReliability = memory.locked ? memory.reliability : confirmed ? Math.min(1, memory.reliability + RELIABILITY_BOOST_CONFIRM) : Math.max(0, memory.reliability - RELIABILITY_PENALTY_CORRECT);
      const correctionHistory = [...memory.correctionHistory || []];
      if (!confirmed && correctedText) {
        correctionHistory.push({ ts: now, oldText: memory.text, newText: correctedText });
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
  async markImportant(id, multiplier = 2) {
    return this.update(id, { importanceOverride: multiplier });
  }
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
        if (diff > 2) conflicts.push(m);
      }
    }
    return conflicts;
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
  async _getAccessCount(id) {
    const rows = await this.table.query().where(`id = '${id.replace(/'/g, "''")}'`).limit(1).toArray();
    return rows.length ? Number(rows[0].access_count || 0) : 0;
  }
  // ─── Feedback Loop ─────────────────────────────────────────────────────────────
  /** Clamp a usefulness score change based on rating */
  _clampUsefulness(current, rating) {
    const base = current ?? 0.5;
    if (rating === "neutral") return base;
    if (rating === "helpful") return Math.min(1, base + 0.1);
    return Math.max(0, base - 0.2);
  }
  async rateMemory(id, rating, _sessionId) {
    if (!this.table) await this.init();
    const mem = await this.getById(id);
    if (!mem) return;
    const now = Date.now();
    const newUsefulness = this._clampUsefulness(mem.usefulness_score, rating);
    const newRecallCount = (mem.recall_count ?? 0) + 1;
    try {
      await this.table.update(
        {
          last_used_at: String(now),
          usefulness_score: String(newUsefulness),
          recall_count: String(newRecallCount),
          updated_at: String(now)
        },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch (e) {
      logger.warn({ err: e }, "rateMemory update failed");
      return;
    }
    if (rating === "harmful") {
      await this.demoteMemory(id);
    } else if (rating === "helpful") {
      await this.incrementImportance(id, 0.05);
    }
  }
  async demoteMemory(id) {
    if (!this.table) await this.init();
    try {
      await this.table.update(
        { scope: "decay", scope_mem: "decay" },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch (e) {
      logger.warn({ err: e, memoryId: id }, "demoteMemory failed");
    }
  }
  async incrementImportance(id, delta) {
    if (!this.table) await this.init();
    const mem = await this.getById(id);
    if (!mem) return;
    const newImportance = Math.min(1, mem.importance + delta);
    try {
      await this.table.update(
        { importance: String(newImportance), updated_at: String(Date.now()) },
        { where: `id = '${id.replace(/'/g, "''")}'` }
      );
    } catch (e) {
      logger.warn({ err: e, memoryId: id }, "incrementImportance failed");
    }
  }
};

// src/store/factory.ts
var storeInstance = null;
async function createMemoryStore(provider = "lancedb") {
  switch (provider) {
    case "lancedb":
      return new LanceDBAdapter();
    case "qdrant":
      throw new Error("Qdrant adapter not implemented yet");
    default:
      throw new Error(`Unknown memory store provider: ${provider}`);
  }
}
async function getMemoryStore() {
  if (!storeInstance) {
    storeInstance = await createMemoryStore(process.env.HAWK_DB_PROVIDER || "lancedb");
    await storeInstance.init();
  }
  return storeInstance;
}

// src/retriever.ts
var HybridRetriever = class {
  db;
  embedder;
  noisePrototypes = [];
  constructor(db2, embedder2) {
    this.db = db2;
    this.embedder = embedder2;
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
  rrfFusion(vectorResults, ftsResults) {
    const rrfMap = /* @__PURE__ */ new Map();
    for (let rank = 0; rank < vectorResults.length; rank++) {
      const item = vectorResults[rank];
      const score = 1 / (RRF_K + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, ftsScore: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * RRF_VECTOR_WEIGHT,
        vectorScore: item.score,
        ftsScore: existing.ftsScore
      });
    }
    for (let rank = 0; rank < ftsResults.length; rank++) {
      const item = ftsResults[rank];
      const score = 1 / (RRF_K + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, ftsScore: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * (1 - RRF_VECTOR_WEIGHT),
        vectorScore: existing.vectorScore,
        ftsScore: item.score
      });
    }
    return Array.from(rrfMap.entries()).map(([id, v]) => ({ id, ...v }));
  }
  // ---------- Cross-encoder Rerank ----------
  async rerank(query, candidates, topN) {
    if (candidates.length <= 2) return candidates.map((c) => ({ id: c.id, text: c.text, rerankScore: c.score }));
    const providers = [
      async () => {
        const apiKey = process.env.JINA_RERANKER_API_KEY;
        if (!apiKey) return null;
        const resp = await fetch("https://api.jina.ai/v1/rerank", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "jina-reranker-v1-base-en",
            query,
            documents: candidates.map((c) => c.text),
            top_n: Math.min(topN * 2, candidates.length)
          })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.results.map((r) => ({
          id: candidates[r.index].id,
          text: candidates[r.index].text,
          rerankScore: r.relevance_score
        }));
      },
      async () => {
        const apiKey = process.env.COHERE_API_KEY || process.env.COHERE_RERANK_API_KEY;
        if (!apiKey) return null;
        const resp = await fetch("https://api.cohere.ai/v1/rerank", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "rerank-english-v3.0",
            query,
            documents: candidates.map((c) => c.text),
            top_n: Math.min(topN * 2, candidates.length),
            return_documents: false
          })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const idMap = new Map(candidates.map((c, i) => [i, c]));
        return data.results.map((r) => {
          const mem = idMap.get(r.index);
          return { id: mem.id, text: mem.text, rerankScore: r.relevance_score };
        });
      },
      async () => {
        const apiKey = process.env.MIXTBREAD_API_KEY || process.env.MIXEDBREAD_API_KEY;
        if (!apiKey) return null;
        const resp = await fetch("https://api.mixedbread.ai/v1/rerank", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "mxbai-rerank-large-v1",
            query,
            input: candidates.map((c) => c.text),
            top_k: Math.min(topN * 2, candidates.length)
          })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const idMap = new Map(candidates.map((c, i) => [i, c]));
        return data.data.map((r) => {
          const mem = idMap.get(r.index);
          return { id: mem.id, text: mem.text, rerankScore: r.relevance_score };
        });
      }
    ];
    for (const tryProvider of providers) {
      try {
        const result = await tryProvider();
        if (result) return result;
      } catch {
      }
    }
    return candidates.map((c) => ({ id: c.id, text: c.text, rerankScore: c.score }));
  }
  // ---------- Main Search Pipeline ----------
  async search(query, topK, scope, sourceTypes) {
    const hasEmbedding = hasEmbeddingProvider();
    if (hasEmbedding) {
      try {
        const queryVector = await this.embedder.embedQuery(query);
        const [vectorResults, ftsResults] = await Promise.all([
          this.db.search(queryVector, topK * VECTOR_SEARCH_MULTIPLIER, 0, scope, sourceTypes),
          this.db.ftsSearch(query, topK * VECTOR_SEARCH_MULTIPLIER, scope, sourceTypes)
        ]);
        const vectorRanked = vectorResults.map((r, i) => ({ id: r.id, score: 1 - i * 0.01, text: r.text })).sort((a, b) => b.score - a.score);
        const ftsRanked = ftsResults.map((r, i) => ({ id: r.id, score: r.score, text: r.text })).sort((a, b) => b.score - a.score).slice(0, topK * VECTOR_SEARCH_MULTIPLIER);
        const fused = this.rrfFusion(vectorRanked, ftsRanked);
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
        const results = [];
        for (const item of noiseFiltered) {
          const rerankScore = idToRerank.get(item.id);
          if (rerankScore === void 0) continue;
          const memory = fetched.get(item.id);
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
      } catch (err) {
        console.warn("[hawk-bridge] Vector search failed, falling back to FTS-only:", err);
      }
    }
    console.log("[hawk-bridge] Running in FTS-only mode (LanceDB native full-text search)");
    try {
      const ftsResults = await this.db.ftsSearch(query, topK * 3, scope, sourceTypes);
      const idToScore = new Map(ftsResults.map((r) => [r.id, r.score]));
      const ftsIds = ftsResults.map((r) => r.id);
      const fetched = await this.db.getByIds(ftsIds);
      const results = [];
      for (const id of ftsIds) {
        const score = idToScore.get(id);
        if (score === void 0) continue;
        const memory = fetched.get(id);
        if (!memory) continue;
        results.push({
          id,
          text: memory.text,
          score,
          category: memory.category,
          metadata: memory.metadata
        });
        if (results.length >= topK) break;
      }
      return results;
    } catch (err) {
      console.error("[hawk-bridge] FTS search failed:", err);
      return [];
    }
  }
};
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

// src/hooks/hawk-recall/handler.ts
init_embeddings();
init_logger();
init_metrics();
var LANG = process.env.HAWK_LANG || "zh";
var INJECTION_LIMIT = 5;
var MAX_INJECTION_CHARS = 2e3;
var COMPOSITE_WEIGHT_RELIABILITY = 0.4;
var COMPOSITE_WEIGHT_SCORE = 0.6;
var sharedDb = null;
async function getSharedDb() {
  if (!sharedDb) {
    sharedDb = await getMemoryStore();
  }
  return sharedDb;
}
var sharedEmbedder = null;
async function getSharedEmbedder() {
  if (!sharedEmbedder) {
    const config = await getConfig();
    sharedEmbedder = new Embedder(config.embedding);
  }
  return sharedEmbedder;
}
async function getEmbedder() {
  return getSharedEmbedder();
}
var bm25DirtyGlobal = false;
function markBm25Dirty() {
  bm25DirtyGlobal = true;
}
var SEARCH_HISTORY_MAX = 20;
var searchHistory = [];
function recordSearch(query, resultCount) {
  searchHistory.unshift({ q: query, ts: Date.now(), resultCount });
  if (searchHistory.length > SEARCH_HISTORY_MAX) searchHistory.pop();
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
var SELECT_MEMORIES_SYSTEM_PROMPT = `You are selecting memories that will be useful for answering the user's query.
You will be given a list of memory files with their names, descriptions, and categories.
Return a JSON array of the memory IDs that will clearly be helpful (up to 8).
Only include memories you are certain will be relevant. If none, return [].`;
async function dualSelect(query, db2, topN = 8) {
  try {
    const all = await db2.getAllMemories();
    if (!all.length) return [];
    const manifest = all.filter((m) => m.deletedAt === null && m.name).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description || m.text.slice(0, 200),
      category: m.category
    }));
    if (!manifest.length) return [];
    const config = await getConfig();
    const body = manifest.map((m, i) => `[${i}] id=${m.id} name="${m.name}" category=${m.category} desc="${m.description.slice(0, 150)}"`).join("\n");
    const response = await fetch(`${config.llm.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.llm.apiKey}`
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: [
          { role: "system", content: SELECT_MEMORIES_SYSTEM_PROMPT },
          { role: "user", content: `Query: ${query}

Memories:
${body}` }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });
    if (!response.ok) return [];
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const ids = JSON.parse(match[0]);
    return ids.slice(0, topN);
  } catch (e) {
    logger.warn({ err: e }, "dualSelect failed");
    return [];
  }
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
var RESTORE_PATTERN = /^hawk\s*恢复\s*(.+)$/i;
var DRIFT_PATTERN = /^hawk\s*(?:drift|过期|陈旧)$/i;
var SEARCH_HISTORY_PATTERN = /^hawk\s*搜索历史$/i;
var CLEAR_PATTERN = /^hawk\s*清空$/i;
var BATCHLOCK_PATTERN = /^hawk\s*锁定\s*all(?:\s+(.+))?$/i;
var BATCHUNLOCK_PATTERN = /^hawk\s*解锁\s*all$/i;
var COMPARE_PATTERN = /^hawk\s*对比\s*(\d+)\s+(\d+)$/i;
var PURGE_PATTERN = /^hawk\s*清理$/i;
var ADD_PATTERN = /^hawk\s*添加\s*(.+)$/i;
var DELETE_IDX_PATTERN = /^hawk\s*删除\s*(\d+)$/i;
var STATS_PATTERN = /^hawk\s*统计$/i;
var QUALITY_PATTERN = /^hawk\s*质量$/i;
var STATUS_PATTERN = /^hawk\s*状态$/i;
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
  const now = Date.now();
  const DRIFT_MS = DRIFT_THRESHOLD_DAYS * 24 * 60 * 60 * 1e3;
  for (const m of memories) {
    const lock = m.locked ? " \u{1F512}" : "";
    const imp = m.importanceOverride > 1.5 ? " \u2B50" : "";
    const corr = m.correctionCount > 0 ? ` (\u7EA0\u6B63\xD7${m.correctionCount})` : "";
    const score = `(${(m.score * 100).toFixed(0)}%\u76F8\u5173)`;
    const reason = m.matchReason ? `
   \u2192 ${m.matchReason}` : "";
    const daysSince = m.lastVerifiedAt ? (now - m.lastVerifiedAt) / 864e5 : Infinity;
    const drift = m.reliability >= 0.5 && daysSince > DRIFT_THRESHOLD_DAYS ? " \u{1F550}" : "";
    lines.push(`${m.reliabilityLabel} ${score}${lock}${imp}${corr}${drift} [${m.category}] ${m.text}${reason}`);
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
var DRIFT_VERIFY_QUEUE = path3.join(os.homedir(), ".hawk", "drift-verify-queue.jsonl");
function checkDriftVerifyQueue() {
  try {
    if (!fs2.existsSync(DRIFT_VERIFY_QUEUE)) return [];
    const lines = fs2.readFileSync(DRIFT_VERIFY_QUEUE, "utf-8").trim().split("\n").filter(Boolean);
    return lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
var recallHandler = async (event) => {
  if (event.type !== "agent" || event.action !== "bootstrap") return;
  try {
    const pending = checkDriftVerifyQueue();
    if (pending.length > 0) {
      const lines = [`\u26A0\uFE0F ** hawk \u5F85\u9A8C\u8BC1\u8FC7\u671F\u8BB0\u5FC6 (${pending.length}\u6761) **`];
      for (const item of pending.slice(0, 10)) {
        lines.push(`\u{1F550} [${item.memory_id}] ${(item.text || "").slice(0, 60)}`);
      }
      if (pending.length > 10) lines.push(`...\u8FD8\u6709 ${pending.length - 10} \u6761`);
      lines.push(`
\u63D0\u793A: \u4F7F\u7528 hawk\u8FC7\u671F \u67E5\u770B\u8BE6\u60C5\uFF0Chawk\u786E\u8BA4 N \u5BF9 \u9A8C\u8BC1\u8BB0\u5FC6`);
      event.messages?.push("\n" + lines.join("\n") + "\n");
    }
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
      lines.push(`\u2192 hawk\u5220\u9664 N       \u5220\u9664\u8BB0\u5FC6`);
      event.messages.push(`
${lines.join("\n")}
`);
      ctx._hawkListIndex = sorted2.map((mem) => mem.id);
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
        const { writeFileSync: writeFileSync2, mkdirSync: mkdirSync3, existsSync: existsSync4 } = __require("fs");
        const dir = path3.dirname(filepath);
        if (!existsSync4(dir)) mkdirSync3(dir, { recursive: true });
        writeFileSync2(filepath, JSON.stringify({ exported_at: (/* @__PURE__ */ new Date()).toISOString(), count: exported.length, memories: exported }, null, 2));
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
    if (DRIFT_PATTERN.test(trimmed)) {
      const all = await db2.getAllMemories(getAgentId(ctx));
      if (!all.length) {
        event.messages.push(`
${injectEmoji} \u8FD8\u6CA1\u6709\u4EFB\u4F55\u8BB0\u5FC6\u3002
`);
        return;
      }
      const now = Date.now();
      const DRIFT_MS = DRIFT_THRESHOLD_DAYS * 24 * 60 * 60 * 1e3;
      const stale = all.filter((m2) => m2.deletedAt === null && m2.reliability >= 0.5 && (!m2.lastVerifiedAt || now - m2.lastVerifiedAt > DRIFT_MS));
      const lines = [`${injectEmoji} ** hawk \u8FC7\u671F\u68C0\u6D4B ** (${DRIFT_THRESHOLD_DAYS}\u5929\u672A\u9A8C\u8BC1)`];
      if (!stale.length) {
        lines.push("\u2705 \u6240\u6709\u8BB0\u5FC6\u90FD\u662F\u65B0\u9C9C\u7684");
      } else {
        stale.sort((a, b) => {
          const aDays = a.lastVerifiedAt ? (now - a.lastVerifiedAt) / 864e5 : Infinity;
          const bDays = b.lastVerifiedAt ? (now - b.lastVerifiedAt) / 864e5 : Infinity;
          return bDays - aDays;
        });
        for (const m2 of stale.slice(0, 20)) {
          const days = m2.lastVerifiedAt ? ((now - m2.lastVerifiedAt) / 864e5).toFixed(0) : "\u4ECE\u672A";
          lines.push(`\u{1F550} [${days}\u5929\u672A\u9A8C\u8BC1] [${m2.category}] ${m2.text.slice(0, 80)}${m2.text.length > 80 ? "..." : ""}`);
        }
        if (stale.length > 20) lines.push(`...\u8FD8\u6709 ${stale.length - 20} \u6761`);
        lines.push(`
\u63D0\u793A: \u4F7F\u7528 hawk\u786E\u8BA4 N \u5BF9 \u6765\u9A8C\u8BC1\u8BB0\u5FC6\uFF0C\u6216 hawk\u5426\u8BA4 N \u6765\u6807\u8BB0\u4E0D\u53EF\u9760`);
      }
      event.messages.push("\n" + lines.join("\n") + "\n");
      return;
    }
    var m = trimmed.match(RESTORE_PATTERN);
    if (m) {
      const filepath = m[1].trim();
      try {
        const { readFileSync: readFileSync3, existsSync: existsSync4 } = __require("fs");
        if (!existsSync4(filepath)) {
          event.messages.push(`
${injectEmoji} \u274C \u6587\u4EF6\u4E0D\u5B58\u5728: ${filepath}
`);
          return;
        }
        const raw = JSON.parse(readFileSync3(filepath, "utf-8"));
        const memories2 = raw.memories || [];
        if (!memories2.length) {
          event.messages.push(`
${injectEmoji} \u6587\u4EF6\u4E3A\u7A7A\u6216\u683C\u5F0F\u9519\u8BEF: ${filepath}
`);
          return;
        }
        const embedderInstance = await getEmbedder();
        let imported = 0, skipped = 0, failed = 0;
        const existingIds = new Set((await db2.getAllMemories()).map((m2) => m2.id));
        for (const mem of memories2) {
          if (existingIds.has(mem.id)) {
            skipped++;
            continue;
          }
          try {
            const [vector] = await embedderInstance.embed([mem.text]);
            await db2.store({
              id: mem.id || "hawk_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
              text: mem.text,
              vector,
              category: mem.category || "fact",
              scope: mem.scope || "global",
              importance: mem.importance ?? 0.5,
              timestamp: mem.createdAt ? new Date(mem.createdAt).getTime() : Date.now(),
              expiresAt: 0,
              locked: mem.locked ?? false,
              metadata: { source: "hawk-restore", original_id: mem.id }
            });
            imported++;
          } catch {
            failed++;
          }
        }
        event.messages.push(`
${injectEmoji} \u2705 \u6062\u590D\u5B8C\u6210\uFF1A\u5BFC\u5165 ${imported}\uFF0C\u8DF3\u8FC7\uFF08\u5DF2\u5B58\u5728\uFF09${skipped}\uFF0C\u5931\u8D25 ${failed}
`);
      } catch (err) {
        event.messages.push(`
${injectEmoji} \u274C \u6062\u590D\u5931\u8D25: ${err.message}
`);
      }
      return;
    }
    if (SEARCH_HISTORY_PATTERN.test(trimmed)) {
      if (!searchHistory.length) {
        event.messages.push(`
${injectEmoji} \u6682\u65E0\u641C\u7D22\u5386\u53F2\u3002
`);
        return;
      }
      const lines = [`
${injectEmoji} ** \u6700\u8FD1\u641C\u7D22\u5386\u53F2 **
`];
      for (let i = 0; i < searchHistory.length; i++) {
        const h = searchHistory[i];
        const time = new Date(h.ts).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        lines.push(`  ${i + 1}. [${time}] "${h.q}" \u2192 ${h.resultCount} \u6761`);
      }
      event.messages.push(lines.join("\n") + "\n");
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
    if (QUALITY_PATTERN.test(trimmed)) {
      const all = await db2.getAllMemories(getAgentId(ctx));
      if (!all.length) {
        event.messages.push(`
${injectEmoji} \u6682\u65E0\u8BB0\u5FC6\u3002
`);
        return;
      }
      const total = all.length;
      const now = Date.now();
      const avgRel = all.reduce((s, m2) => s + m2.reliability, 0) / total;
      const avgImp = all.reduce((s, m2) => s + m2.importance, 0) / total;
      const lockedRatio = all.filter((m2) => m2.locked).length / total;
      const expiredCount = all.filter((m2) => m2.expiresAt > 0 && m2.expiresAt < now).length;
      const recentCount = all.filter((m2) => now - m2.timestamp < 7 * 864e5).length;
      const relScore = avgRel * 40;
      const impScore = avgImp * 25;
      const lockScore = lockedRatio * 15;
      const recencyScore = Math.min(recentCount / Math.max(total * 0.3, 1), 1) * 20;
      const healthScore = Math.round(relScore + impScore + lockScore + recencyScore);
      const grade = healthScore >= 80 ? "\u{1F7E2} \u4F18\u79C0" : healthScore >= 60 ? "\u{1F7E1} \u826F\u597D" : healthScore >= 40 ? "\u{1F7E0} \u4E00\u822C" : "\u{1F534} \u9700\u4F18\u5316";
      event.messages.push(
        `
${injectEmoji} ** hawk \u8BB0\u5FC6\u5065\u5EB7\u8BC4\u5206 **
\u5065\u5EB7\u5EA6: ${grade} (${healthScore}/100)
\u5E73\u5747\u53EF\u9760\u6027: ${(avgRel * 100).toFixed(1)}% | \u5E73\u5747\u91CD\u8981\u6027: ${(avgImp * 100).toFixed(1)}%
\u603B\u8BB0\u5FC6: ${total} | \u9501\u5B9A: ${lockedRatio > 0 ? (lockedRatio * 100).toFixed(1) + "%" : "0"} | \u5DF2\u8FC7\u671F: ${expiredCount}
\u8FD17\u5929\u65B0\u589E: ${recentCount} \u6761

\u8BC4\u5206\u8BF4\u660E: \u53EF\u9760\u602740% + \u91CD\u8981\u602725% + \u9501\u5B9A\u738715% + \u6D3B\u8DC3\u5EA620%
`
      );
      return;
    }
    if (STATUS_PATTERN.test(trimmed)) {
      const all = await db2.getAllMemories(getAgentId(ctx));
      const now = Date.now();
      const total = all.length;
      const expired = all.filter((m2) => m2.expiresAt > 0 && m2.expiresAt < now).length;
      const locked = all.filter((m2) => m2.locked).length;
      const embedderInstance = await getSharedEmbedder();
      const cacheSize = embedderInstance.cache?.size ?? 0;
      let bm25Size = 0;
      try {
        const retriever = await getRetriever();
        bm25Size = retriever.corpus?.length ?? 0;
      } catch {
      }
      let dbSizeMB = 0;
      try {
        const stats = await db2.getDBStats?.();
        if (stats) dbSizeMB = stats.sizeMB;
      } catch {
      }
      const lastDecay = global.__hawk_last_decay__;
      const decayAgo = lastDecay ? Math.round((now - lastDecay) / 6e4) + " \u5206\u949F\u524D" : "\u4ECE\u672A";
      event.messages.push(
        `
${injectEmoji} ** hawk \u7CFB\u7EDF\u72B6\u6001 **
\u8BB0\u5FC6\u603B\u6570: ${total} | \u5DF2\u8FC7\u671F: ${expired} | \u9501\u5B9A: ${locked}
\u6570\u636E\u5E93: ${dbSizeMB > 0 ? dbSizeMB.toFixed(2) + " MB" : "(\u8BA1\u7B97\u4E2D...)"}
BM25\u7D22\u5F15: ${bm25Size} \u6761
Embed\u7F13\u5B58: ${cacheSize} \u6761
\u6700\u540EDecay: ${decayAgo}
\u641C\u7D22\u5386\u53F2: ${searchHistory.length} \u6761
`
      );
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
      const m2 = trimmed.match(ADD_PATTERN);
      if (m2) {
        const text = m2[1].trim();
        if (text.length < 5) {
          event.messages.push(`
${injectEmoji} \u5185\u5BB9\u592A\u77ED\uFF0C\u81F3\u5C115\u4E2A\u5B57\u3002
`);
          return;
        }
        const embedderInstance = await getSharedEmbedder();
        try {
          const [vector] = await embedderInstance.embed([text]);
          await db2.store({
            id: "hawk_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
            text,
            vector,
            category: "fact",
            scope: "personal",
            importance: 0.8,
            timestamp: Date.now(),
            expiresAt: 0,
            locked: false,
            metadata: { source: "hawk-\u6DFB\u52A0" }
          });
          event.messages.push(`
${injectEmoji} \u2705 \u5DF2\u6DFB\u52A0\u8BB0\u5FC6\uFF1A${text.slice(0, 60)}${text.length > 60 ? "..." : ""}
`);
        } catch (err) {
          event.messages.push(`
${injectEmoji} \u274C \u6DFB\u52A0\u5931\u8D25: ${err.message}
`);
        }
        return;
      }
    }
    {
      const m2 = trimmed.match(DELETE_IDX_PATTERN);
      if (m2) {
        const idx = parseInt(m2[1], 10) - 1;
        const targetIds = ctx._hawkListIndex || [];
        const id = targetIds[idx];
        if (!id) {
          const all = await db2.getAllMemories(getAgentId(ctx));
          const sorted2 = [...all].sort((a, b) => {
            if (a.locked !== b.locked) return a.locked ? -1 : 1;
            return b.reliability - a.reliability;
          });
          if (idx < 0 || idx >= sorted2.length) {
            event.messages.push(`
${injectEmoji} \u65E0\u6548\u7F16\u53F7\u3002
`);
            return;
          }
          const mem = sorted2[idx];
          const ok2 = await db2.forget(mem.id);
          event.messages.push(`
${injectEmoji} ${ok2 ? "\u2705 \u5DF2\u5220\u9664\uFF1A" + mem.text.slice(0, 50) + "..." : "\u274C \u5DF2\u9501\u5B9A\uFF0C\u65E0\u6CD5\u5220\u9664\u3002"}
`);
          return;
        }
        const ok = await db2.forget(id);
        event.messages.push(`
${injectEmoji} ${ok ? "\u2705 \u5DF2\u5220\u9664\u3002" : "\u274C \u5DF2\u9501\u5B9A\uFF0C\u65E0\u6CD5\u5220\u9664\u3002"}
`);
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
    let memories = [];
    const selectedIds = await dualSelect(trimmed, db2, topK * 2);
    if (selectedIds.length > 0) {
      const retriever = await getRetriever();
      const allResults = await retriever.search(trimmed, topK * 3);
      memories = allResults.filter((m2) => selectedIds.includes(m2.id));
      if (memories.length < topK) {
        const selectedSet = new Set(selectedIds);
        const unselected = allResults.filter((m2) => !selectedSet.has(m2.id)).slice(0, topK - memories.length);
        memories = [...memories, ...unselected];
      }
    } else {
      const retriever = await getRetriever();
      memories = await retriever.search(trimmed, topK);
    }
    const useable = memories.filter((m2) => m2.score >= minScore || m2.reliability >= RELIABILITY_THRESHOLD_HIGH);
    recordSearch(trimmed, useable.length);
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
    const withEvolution = useable.map((m2) => {
      const src = m2.metadata?.source || "";
      let score = compositeScore(m2);
      if (src === "evolution-success") {
        score = Math.min(1, score + EVOLUTION_SUCCESS * 0.3);
      } else if (src === "evolution-failure") {
        score = score * 0.5;
      }
      return { ...m2, _evolutionScore: score };
    });
    const sorted = [...withEvolution].sort((a, b) => {
      const aEvol = a.metadata?.source === "evolution-success";
      const bEvol = b.metadata?.source === "evolution-success";
      if (aEvol && !bEvol) return -1;
      if (!aEvol && bEvol) return 1;
      return b._evolutionScore - a._evolutionScore;
    });
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
    logger.error({ err }, "hawk-recall handler error");
    memoryErrors.inc({ type: "recall_handler" });
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
import { spawn, exec as execSync } from "child_process";
import { promisify } from "util";
import * as fs3 from "fs";
import * as path4 from "path";
import * as os4 from "os";
init_embeddings();
init_logger();
init_metrics();
var exec = promisify(execSync);
var db = null;
var embedder = null;
async function getDB() {
  if (!db) {
    db = await getMemoryStore();
  }
  return db;
}
async function getEmbedder2() {
  if (!embedder) {
    const config = await getConfig();
    embedder = new Embedder(config.embedding);
  }
  return embedder;
}
var AUDIT_LOG_PATH = path4.join(os4.homedir(), ".hawk", "audit.log");
async function withRetry(fn, maxAttempts = 3, delayMs = 1e3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        logger.warn({ attempt, maxAttempts, delayMs: delayMs * attempt, err: err.message }, "Capture attempt failed, retrying");
        await new Promise((res) => setTimeout(res, delayMs * attempt));
      } else {
        logger.error({ err: err.message }, "All capture attempts failed");
      }
    }
  }
  throw lastErr;
}
function audit(action, reason, text) {
  const entry = JSON.stringify({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    action,
    reason,
    text: text.slice(0, 200)
    // truncate for log safety
  }) + "\n";
  try {
    const dir = path4.dirname(AUDIT_LOG_PATH);
    if (!fs3.existsSync(dir)) {
      fs3.mkdirSync(dir, { recursive: true });
    }
    fs3.appendFileSync(AUDIT_LOG_PATH, entry);
  } catch (err) {
    logger.error({ err: err?.message }, "Failed to write audit log");
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
  t = t.replace(/(\{"[^"]+":\s*"[^"]+"\})/g, (json2) => {
    try {
      return JSON.stringify(JSON.parse(json2));
    } catch {
      return json2;
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
var SKIP_PATTERNS = [
  // Code patterns / file paths (derivable from reading code)
  [/\b(function|class|const|let|var|import|export|interface|type)\s+\w+/g, "code_pattern"],
  [/\b(file|path|directory|folder)\s+[:=]\s*['"`][\w./-]+['"`]/g, "file_path"],
  [/`[^`]*\.(ts|js|py|go|rs|java|cpp|c|h|md|json|yaml|yml)`/g, "code_reference"],
  // Git history / who-changed-what (use git log/blame instead)
  [/\b(git|commit|branch|merge|PR|pull.request|checkout|rebase)\b/gi, "git_history"],
  // Debug solutions / fix recipes (the fix is in the code, commit has context)
  [/\b(fix|bug|issue|error|exception|crash|patch)\s+(was|is|to|:)/gi, "debug_solution"],
  // Ephemeral task details
  [/^(TODO|FIXME|HACK|XXX|NOTE|BUG|NB):/gm, "dev_note"],
  // Already in CLAUDE.md files
  [/\bCLAUDE\.(md|local\.md|rules)/gi, "already_documented"]
];
function shouldSkipChunk(text) {
  for (const [pattern, label] of SKIP_PATTERNS) {
    if (pattern.test(text)) {
      return { skip: true, reason: label };
    }
  }
  return { skip: false, reason: "" };
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
async function handleSaturation(text, threshold = 0.7) {
  try {
    const dbInstance = await getDB();
    const recent = await dbInstance.listRecent(50);
    const similar = recent.filter((m) => textSimilarity2(text, m.text) >= threshold);
    if (similar.length >= 3) {
      for (const m of similar) {
        await dbInstance.incrementAccess(m.id);
      }
      return true;
    }
  } catch {
  }
  return false;
}
var SESSIONS_JSON_PATH = path4.join(os4.homedir(), ".openclaw", "agents", "main", "sessions", "sessions.json");
async function handleSessionCompaction(event) {
  try {
    const config = await getConfig();
    if (!config.capture.enabled) return;
    const sessionKey = event.sessionKey;
    if (!sessionKey) return;
    let transcriptPath = null;
    try {
      const content = await fs3.promises.readFile(SESSIONS_JSON_PATH, "utf-8");
      const sessionsMap = JSON.parse(content);
      const entry = sessionsMap[sessionKey];
      transcriptPath = entry?.sessionFile ?? null;
    } catch (lookupErr) {
      logger.warn({ err: lookupErr, sessionKey }, "Could not look up session transcript path");
      return;
    }
    if (!transcriptPath) {
      logger.debug({ sessionKey }, "No transcript path found");
      return;
    }
    const scriptPath = path4.join(
      os4.homedir(),
      ".openclaw",
      "workspace",
      "hawk-bridge",
      "python",
      "hawk_session_history.py"
    );
    const { stdout } = await exec(
      `python3 "${scriptPath}" "${transcriptPath}" 30`
    );
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      logger.warn({ parseError: stdout.slice(0, 200) }, "Failed to parse session history output");
      return;
    }
    if (result.error || !result.messages?.length) {
      if (result.error) {
        logger.warn({ error: result.error }, "Session history script error");
      }
      return;
    }
    const store = await getDB();
    const embed = await getEmbedder2();
    const { importanceThreshold } = config.capture;
    let storedCount = 0;
    for (const msg of result.messages) {
      const text = msg.text;
      if (!text || text.length < 30) continue;
      const trimmed = text.trim();
      if (/^[\d\s.,]+$/.test(trimmed)) continue;
      if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]{1,3}$/u.test(trimmed)) continue;
      if (trimmed.length < 30) continue;
      const sourceType = msg.role === "user" ? "user-message" : "hawk-capture";
      try {
        const [vector] = await embed.embed([text]);
        await store.store({
          id: generateId(),
          text,
          vector,
          category: "conversation",
          scope: "global",
          importance: 0.5,
          metadata: {
            capture_trigger: "session_compaction",
            source_type: sourceType,
            sender_id: "session:" + sessionKey,
            session_msg_id: msg.id,
            session_timestamp: msg.timestamp
          }
        }, sessionKey);
        storedCount++;
        audit("compact", "success", text.slice(0, 80));
      } catch (storeErr) {
        audit("compact", "store_error:" + String(storeErr), text.slice(0, 80));
      }
    }
    if (storedCount > 0) {
      logger.info({ storedCount, sessionKey }, "Stored memories from session compaction");
      audit("compact", "stored", `Stored ${storedCount} memories`);
      markBm25Dirty();
    }
  } catch (err) {
    logger.error({ err }, "session:compact:after handler error");
    memoryErrors.inc({ type: "compaction_handler" });
  }
}
var captureHandler = async (event) => {
  logger.debug({ type: event.type, action: event.action, sessionKey: event.sessionKey }, "hawk-capture: event received");
  if (event.type === "session:compact:after") {
    await handleSessionCompaction(event);
    return;
  }
  const isOutbound = event.action === "sent";
  const isInbound = event.action === "received" || event.type === "message:preprocessed";
  if (event.type !== "message" && !isInbound) return;
  if (isOutbound && !event.context?.success) return;
  try {
    const config = await getConfig();
    if (!config.capture.enabled) return;
    const { maxChunks, importanceThreshold, ttlMs } = config.capture;
    const sourceType = isInbound ? "user-message" : "hawk-capture";
    const senderId = event.context?.metadata?.senderId || event.context?.from || "";
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
    const memories = await withRetry(() => callExtractor(enrichedContent, config), 3, 2e3);
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
      getEmbedder2()
    ]);
    const { batchStore } = dbInstance;
    let storedCount = 0;
    for (const m of significant) {
      let text = m.text.trim();
      text = normalizeText(text);
      const { skip, reason } = shouldSkipChunk(text);
      if (skip) {
        audit("skip", reason, text);
        continue;
      }
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
      if (await handleSaturation(text)) {
        audit("skip", "saturated", text);
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
        const [vector] = await withRetry(() => embedderInstance.embed([text]), 3, 1e3);
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
            name: m.name || "",
            description: m.description || "",
            source_type: sourceType,
            sender_id: senderId
          }
        }, sessionId);
        storedCount++;
        audit("capture", "success", text);
      } catch (storeErr) {
        audit("reject", "store_error:" + String(storeErr), text);
      }
    }
    if (storedCount > 0) {
      logger.info({ storedCount }, "Stored memories");
      audit("capture", "stored", `Stored ${storedCount} memories`);
      markBm25Dirty();
    }
  } catch (err) {
    logger.error({ err }, "hawk-capture handler error");
    memoryErrors.inc({ type: "capture_handler" });
  }
};
function callExtractor(conversationText, config) {
  return new Promise((resolve) => {
    const apiKey = config.llm?.apiKey || config.embedding.apiKey || "";
    const model = config.llm?.model || "MiniMax-M2.7";
    const provider = config.llm?.provider || "openclaw";
    const baseURL = config.llm?.baseURL || "";
    const proc = spawn(
      config.python.pythonPath,
      ["-c", buildExtractorScript(conversationText, apiKey, model, provider, baseURL)]
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      logger.warn("Subprocess timeout, killing");
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
        logger.error({ code, stderr }, "Extractor subprocess error");
        resolve([]);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (Array.isArray(result)) {
          resolve(result);
        } else {
          logger.warn({ output: stdout.slice(0, 200) }, "Unexpected extractor output, discarding");
          resolve([]);
        }
      } catch {
        logger.warn("Extractor JSON parse failed, discarding output");
        resolve([]);
      }
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      logger.error({ err: err.message }, "Subprocess error");
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
init_embeddings();
init_metrics();
async function rateMemory(memoryId, rating, sessionId) {
  const store = await getMemoryStore();
  await store.rateMemory(memoryId, rating, sessionId);
}
var METRICS_PORT = parseInt(process.env.HAWK_METRICS_PORT || "9090", 10);
async function healthCheck() {
  try {
    const config = await getConfig();
    const embedder2 = new Embedder(config.embedding);
    await embedder2.embed(["health check probe"]);
    return { status: "ok" };
  } catch (err) {
    return { status: "degraded", error: "embedding unavailable" };
  }
}
function startMetricsServer() {
  const server = http2.createServer(async (req, res) => {
    const url = new URL2(req.url || "/", `http://localhost:${METRICS_PORT}`);
    const pathname = url.pathname;
    const start = Date.now();
    try {
      const recordMetrics = (status) => {
        httpRequestsTotal.inc({ method: req.method || "GET", path: pathname, status: String(status) });
        httpRequestDuration.observe({ method: req.method || "GET", path: pathname }, (Date.now() - start) / 1e3);
      };
      if (pathname === "/health" || pathname === "/healthz") {
        const result = await healthCheck();
        const status = result.status === "ok" ? 200 : 503;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: result.status,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          error: result.error
        }));
        recordMetrics(status);
        return;
      }
      if (pathname === "/metrics") {
        res.writeHead(200, { "Content-Type": register3.getMetrics() });
        res.end(await register3.metrics());
        recordMetrics(200);
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      recordMetrics(404);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    }
  });
  server.listen(METRICS_PORT, "127.0.0.1", () => {
    console.log(`[hawk-bridge] Metrics server listening on http://127.0.0.1:${METRICS_PORT}`);
    console.log(`[hawk-bridge]   /health  \u2014 health check`);
    console.log(`[hawk-bridge]   /metrics \u2014 Prometheus scrape endpoint`);
  });
  server.on("error", (err) => {
    if (err.code !== "EADDRINUSE") {
      console.warn(`[hawk-bridge] Metrics server error: ${err.message}`);
    }
  });
}
function register3(api) {
  api.registerHook(["agent:bootstrap"], handler_default, {
    name: "hawk-recall",
    description: "Inject relevant hawk memories before agent starts"
  });
  api.registerHook(["message:sent"], handler_default2, {
    name: "hawk-capture",
    description: "Auto-extract and store memories after agent responds"
  });
  api.registerHook(["gateway:startup"], async (event) => {
    if (global.__hawk_metrics_server_started) return;
    global.__hawk_metrics_server_started = true;
    startMetricsServer();
  }, {
    name: "hawk-metrics",
    description: "Health check and Prometheus metrics server"
  });
}
var index_default = { register: register3 };
export {
  index_default as default,
  handler_default2 as "hawk-capture",
  handler_default as "hawk-recall",
  rateMemory
};
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/

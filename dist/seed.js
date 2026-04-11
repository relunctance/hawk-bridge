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

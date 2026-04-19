# Hawk-Bridge v2.0 架构设计

> 基于 17 个系统级差距和 59 项功能 TODO 的全面架构升级
>
> 生成时间：2026-04-19
> 状态：概念设计，待评审

---

## 📋 目录

1. [当前架构评估](#1-当前架构评估)
2. [目标架构](#2-目标架构)
3. [核心模块设计](#3-核心模块设计)
4. [存储层设计](#4-存储层设计)
5. [Pipeline 设计](#5-pipeline-设计)
6. [跨领域功能架构](#6-跨领域功能架构)
7. [实施路线图](#7-实施路线图)
8. [关键技术决策](#8-关键技术决策)

---

## 1. 当前架构评估

### 1.1 现状概览

```
┌─────────────────────────────────────────────────────────────┐
│                      OpenClaw Gateway                       │
│   hawk-recall hook ──────────────────────────────────────→ │
│   hawk-capture hook ────────────────────────────────────→  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     hawk-bridge (Node.js)                   │
│                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐  │
│  │   hooks/    │   │  retriever  │   │  store/adapters │  │
│  │  hawk-*     │──▶│  (Hybrid)   │──▶│   (LanceDB)     │  │
│  └─────────────┘   └─────────────┘   └─────────────────┘  │
│                                                              │
│  ┌─────────────┐   ┌─────────────┐                        │
│  │  embeddings  │   │   metrics   │                        │
│  └─────────────┘   └─────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 当前架构的优势

| 优势 | 说明 |
|------|------|
| 简单直接 | 单进程架构，所有逻辑在一个服务内 |
| 存储抽象 | `MemoryStore` 接口支持多 adapter |
| 向量+全文混合 | LanceDB 支持向量索引 + FTS |
| 成熟的 Hook 机制 | OpenClaw Gateway 集成完善 |

### 1.3 当前架构的根本性局限

| 问题 | 影响 |
|------|------|
| **单表 schema** | MemoryEntry 已 40+ 字段，增长不可持续 |
| **存储引擎锁定** | LanceDB 是唯一的存储选择，无法切 MySQL/Pg |
| **无 Pipeline 抽象** | capture/recall/decay 是独立 hook，没有统一调度 |
| **无 Event Bus** | 子系统间通过直接调用耦合，无法异步 |
| **无跨语言支持** | Python LLM 提取是 subprocess，无法暴露内部 API |
| **无 Tracing 基础设施** | 每条记忆的生命周期不可追溯（差距#15） |

---

## 2. 目标架构

### 2.1 架构原则

```
1. 分层解耦：存储层 / 计算层 / 接口层分离
2. Pipeline 化：所有记忆操作通过统一 Pipeline
3. 插件化存储：支持多种存储引擎按场景切换
4. 可观测优先：tracing + metrics + logging 全面内置
5. 向后兼容：v1.x 的 API 和 Hook 机制完全兼容
```

### 2.2 目标架构总览

```
┌────────────────────────────────────────────────────────────────────────┐
│                           OpenClaw Gateway / External Clients           │
└────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
         ┌──────────────────┐             ┌──────────────────┐
         │   Gateway API    │             │   HTTP API       │
         │   (Internal)     │             │   (External)    │
         └────────┬─────────┘             └────────┬─────────┘
                  │                                   │
                  └───────────────┬───────────────────┘
                                  ▼
                   ┌──────────────────────────────┐
                   │        Event Bus            │
                   │   (In-Memory + Redis)       │
                   └──────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Capture        │  │   Recall        │  │   Decay         │
│   Pipeline       │  │   Pipeline      │  │   Pipeline      │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               ▼
                   ┌──────────────────────────┐
                   │      Memory Core         │
                   │  (Schema / Indexing /    │
                   │   Deduplication / Rerank)│
                   └──────────────┬───────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   LanceDB       │  │   PostgreSQL     │  │   S3 / Object   │
│   (Hot Storage) │  │   (Metadata)    │  │   (Archives)   │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Observability Layer                            │
│  Tracing / Metrics / Logging / Self-Awareness Dashboard         │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 核心模块职责

| 模块 | 职责 | 关键类 |
|------|------|--------|
| **Gateway API** | OpenClaw Hook 协议，接收 capture/recall 事件 | `HawkGateway` |
| **HTTP API** | 外部 REST API，SDK 接入 | `HawkHTTPAPI` |
| **Event Bus** | 异步事件分发，支持 Redis 持久化 | `MemoryEventBus` |
| **Capture Pipeline** | 提取 → 分类 → 去重 → 存储 | `CapturePipeline` |
| **Recall Pipeline** | 查询 → 检索 → 重排 → 过滤 → 返回 | `RecallPipeline` |
| **Decay Pipeline** | 定时扫描 → 衰减 → 淘汰 | `DecayPipeline` |
| **Memory Core** | Schema 管理、版本控制、一致性 | `MemoryCore` |
| **Storage Engine** | 多引擎适配器（ LanceDB / Pg / S3） | `StorageEngine` |
| **Observability** | Tracing / Metrics / Self-Awareness | `MemoryObservability` |

---

## 3. 核心模块设计

### 3.1 MemoryEntry Schema v2

```typescript
// 新的 MemoryEntry 拆分为多个关联表

/**
 * 记忆核心表 - 只存最核心的不可变字段
 */
interface MemoryCore {
  id: string;                    // UUID
  text_hash: string;             // 内容 SHA-256，用于去重
  original_text: string;          // 原始内容
  canonical_text: string;          // 规范化后的内容（用于检索）
  created_at: number;
  source: string;                // hawk-capture / learnings / user-import
  source_platform: string;        // openclaw / hermes / 其他
  session_id: string | null;
}

/**
 * 记忆元数据表 - 可变字段，随时更新
 */
interface MemoryMetadata {
  memory_id: string;             // FK → MemoryCore.id
  name: string;                  // 短名称
  description: string;           // 一行描述（LLM 生成）

  // 分类
  category: 'fact' | 'preference' | 'decision' | 'entity' | 'other';
  shelf_life: 'permanent' | 'session' | 'project' | 'ephemeral';
  scope: 'personal' | 'team' | 'project';

  // 保鲜期
  created_at: number;            // 写入时间
  expires_at: number;           // 过期时间（0=永不过期）
  occurred_at: number | null;   // 事件发生时间（时序推理用）

  // 关系
  supersedes: string | null;    // 替代哪个记忆 ID
  superseded_by: string | null; // 被哪个记忆替代
  event_before: string[];        // 时序：这件事之前发生的事
  event_after: string[];         // 时序：这件事之后发生的事

  // 来源追踪
  source_type: 'text' | 'audio' | 'video';
  confidence: number;           // LLM 推理可信度
  cold_start_until: number | null;

  // 版本
  generation_version: number;   // 版本号
  drift_note: string | null;
  drift_detected_at: number | null;
}

/**
 * 记忆评分表 - 动态变化的分数
 */
interface MemoryScore {
  memory_id: string;            // FK → MemoryCore.id

  // 重要性
  importance_base: number;      // capture 时 LLM 推断
  importance_override: number;  // 用户手动覆盖
  importance_effective: number; // 计算后的最终值

  // 可信度
  reliability_base: number;     // 初始可信度
  reliability_effective: number; // 衰减后的可信度
  verification_count: number;
  last_verified_at: number | null;

  // 访问统计
  access_count: number;
  last_accessed_at: number | null;
  recall_count: number;
  last_recalled_at: number | null;

  // 有用性反馈
  usefulness_score: number | null;
  last_usefulness_at: number | null;

  // contested 标记（回音室问题）
  contest_count: number;
  contested_at: number | null;
  is_contested: boolean;
  contest_resolution: 'pending' | 'superseded' | 'confirmed' | 'deleted' | null;

  // 价值评估
  verified: boolean;             // soul-force 验收
  pattern_id: string | null;    // 关联的 pattern
}

/**
 * 记忆生命周期表（Tracing）
 */
interface MemoryTrace {
  id: string;                   // UUID
  memory_id: string;            // FK → MemoryCore.id

  event_type:
    | 'captured'
    | 'recalled'
    | 'contested'
    | 'verified'
    | 'corrected'
    | 'decayed'
    | 'archived'
    | 'deleted'
    | 'forgotten';

  occurred_at: number;
  details: Record<string, unknown>; // 事件详情
  trace_id: string;             // 分布式追踪 ID
}

/**
 * 向量索引（独立存储）
 */
interface MemoryVector {
  memory_id: string;            // FK → MemoryCore.id
  provider: 'openai' | 'jina' | 'cohere' | 'ollama' | 'minimax';
  model: string;
  dimensions: number;
  vector: number[];             // 向量数据
  indexed_at: number;
}
```

### 3.2 Storage Engine 抽象

```typescript
/**
 * 存储引擎接口 - 支持多引擎按场景切换
 */
interface StorageEngine {
  // ========== Core Operations ==========
  init(): Promise<void>;
  close(): Promise<void>;

  // ========== Memory Core ==========
  createMemory(core: MemoryCore): Promise<string>;    // 返回 memory_id
  getMemoryById(id: string): Promise<MemoryCore | null>;
  updateMemoryText(id: string, text: string): Promise<void>; // 写入新版本

  // ========== Metadata ==========
  getMetadata(id: string): Promise<MemoryMetadata | null>;
  updateMetadata(id: string, meta: Partial<MemoryMetadata>): Promise<void>;

  // ========== Scoring ==========
  getScore(id: string): Promise<MemoryScore | null>;
  updateScore(id: string, score: Partial<MemoryScore>): Promise<void>;

  // ========== Tracing ==========
  appendTrace(trace: MemoryTrace): Promise<void>;
  getTrace(memoryId: string): Promise<MemoryTrace[]>;

  // ========== Bulk Operations ==========
  findCandidatesForDecay(olderThan: number): Promise<string[]>;
  findOrphanMemories(noAccessBefore: number): Promise<string[]>; // 差距#6
  softDelete(memoryId: string): Promise<void>;
  hardDelete(memoryId: string): Promise<void>;

  // ========== Query ==========
  vectorSearch(query: number[], topK: number, filter?: Filter): Promise<string[]>; // 返回 memory_id
  ftsSearch(query: string, topK: number, filter?: Filter): Promise<string[]>;
  getMemoriesBySession(sessionId: string): Promise<string[]>;
  getMemoriesByScope(scope: string): Promise<string[]>;
}

/**
 * 具体实现
 */
class LanceDBEngine implements StorageEngine {
  // 热数据：最近 30 天的活跃记忆
  // 向量索引 + FTS 索引
}

class PostgreSQLEngine implements StorageEngine {
  // 元数据存储：Metadata + Score + Trace
  // PostgreSQL 的 JSONB 支持灵活字段
  // 支持复杂查询（时序推理、版本链追踪）
}

class S3ArchiveEngine implements StorageEngine {
  // 冷数据：Archive 层的记忆
  // 成本低，适合长期存储
  // 但查询慢，不适合频繁 recall
}
```

---

## 4. 存储层设计

### 4.1 分层存储策略

```
┌─────────────────────────────────────────────────────────────────┐
│                        Active Tier                               │
│   (LanceDB + PostgreSQL)                                        │
│   - 最近 30 天                                                  │
│   - 全量向量索引                                                │
│   - 实时读写                                                    │
│   - 自动 decay 判断                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (30天后或 access_count = 0)
┌─────────────────────────────────────────────────────────────────┐
│                       Archive Tier                               │
│   (S3 + PostgreSQL metadata)                                    │
│   - 30 天前 或 零访问                                           │
│   - 无向量索引（按需重建）                                      │
│   - 写放大优化（批量压缩）                                     │
│   - 查询时恢复                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (90天后仍无访问)
┌─────────────────────────────────────────────────────────────────┐
│                       Cold Tier                                  │
│   (S3 Glacier / Deep Archive)                                   │
│   - 永久性遗忘候选                                              │
│   - 元数据仍保留（可搜索）                                      │
│   - 真正删除需手动确认                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 时序推理存储

```typescript
/**
 * 时序图存储 - 独立的图数据库或 PostgreSQL CTE
 */
interface TemporalGraph {
  // 节点：记忆 ID
  // 边：before / after 关系
  // 属性：事件发生时间

  addEvent(memoryId: string, occurredAt: number, before: string[], after: string[]): void;

  // 查询：在 X 之前发生的记忆
  queryBefore(memoryId: string): string[];

  // 查询：在 X 之后发生的记忆
  queryAfter(memoryId: string): string[];

  // 查询：时间范围内的记忆
  queryByTimeRange(start: number, end: number): string[];

  // 检测循环引用
  detectCycle(memoryId: string): boolean;
}

// PostgreSQL 实现示例
const temporalQuery = `
  WITH RECURSIVE timeline AS (
    -- 基础事件
    SELECT memory_id, occurred_at, ARRAY[memory_id] as path
    FROM memory_events
    WHERE memory_id = $1

    UNION ALL

    -- 递归：找之后的事件
    SELECT e.memory_id, e.occurred_at, t.path || e.memory_id
    FROM memory_events e
    JOIN timeline t ON e.event_before = t.memory_id
    WHERE NOT e.memory_id = ANY(t.path)  -- 防循环
  )
  SELECT memory_id FROM timeline;
`;
```

### 4.3 版本链存储

```typescript
/**
 * 版本链 - 解决一致性漂移（差距#12）
 */
interface VersionChain {
  // 创建新版本
  createVersion(
    supersedes: string,
    newText: string,
    reason: string
  ): string;  // 返回新 memory_id

  // 获取当前共识版本
  getCurrent(id: string): string;  // 沿着 superseded_by 链走到头

  // 获取版本历史
  getHistory(id: string): VersionEntry[];

  // 合并冲突版本
  merge(id1: string, id2: string, winner: 'id1' | 'id2'): void;
}

interface VersionEntry {
  memory_id: string;
  text: string;
  created_at: number;
  reason: string;
  is_current: boolean;
}
```

---

## 5. Pipeline 设计

### 5.1 Capture Pipeline

```
User Conversation
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Capture Pipeline                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │  Input       │  原始对话文本                             │
│  │  Normalizer  │  清理格式、规范化                         │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Segmenter   │  按语义分段（差距#2 What NOT to Save）    │
│  │              │  过滤噪音（差距#5 Capture质量）           │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  LLM         │  并行调用 LLM 提取                        │
│  │  Extractor   │  category / importance / description      │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Shelf Life  │  推断保鲜期类型（差距#10）                │
│  │  Detector    │  permanent / session / project / ephem  │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Dedupe      │  SimHash 去重（差距#5）                   │
│  │  (SimHash)   │  版本链检查（差距#12）                   │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Embedder    │  向量化（差距#4 Embedding抽象）          │
│  │  (Provider)  │  多 provider 支持                         │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Storage     │  写入 Storage Engine                      │
│  │  Writer      │  同时写 trace（差距#15）                 │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Recall Pipeline

```
User Query
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Recall Pipeline                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │  Query       │  解析 query                              │
│  │  Parser      │  提取时间意图（"之前"/"之后"）          │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Temporal    │  时序推理（差距#14）                      │
│  │  Reasoner    │  如果 query 包含时序，构建 event graph   │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Embedder    │  向量化 query                             │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐   ┌──────────────┐                       │
│  │  Vector      │   │  FTS         │                       │
│  │  Search       │   │  Search      │  并行执行             │
│  └──────┬───────┘   └──────┬───────┘                       │
│         └──────────┬─────────┘                               │
│                    ▼                                         │
│  ┌──────────────┐                                           │
│  │  RRF         │  Reciprocal Rank Fusion                   │
│  │  Fusion      │  合并向量 + FTS 结果                       │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Contested   │  过滤 contested 记忆（差距#13）           │
│  │  Filter      │  被多次否定的记忆降权                     │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Version     │  确保返回最新版本（差距#12）             │
│  │  Resolver    │  跟随 superseded_by 链                   │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Cross       │  重排（差距#11 召回链路解释）             │
│  │  Encoder     │  增加 relevance_breakdown                 │
│  │  Rerank      │                                           │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Result      │  返回结果 + recall_reason                 │
│  │  Builder     │  记录 trace（差距#15）                    │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Decay Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    Decay Pipeline (Cron)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │  Tier        │  重新计算 tier                            │
│  │  Maintenance │  permanent / stable / decay / archived    │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Decay      │  按 TTL + shelf_life 衰减                 │
│  │  Calculator │  permanent 不过期（差距#10）               │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Orphan      │  识别零访问记忆（差距#6）                 │
│  │  Detector   │  30天零访问 → candidate                    │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Contested   │  contested 记忆降权（差距#13）           │
│  │  Handler    │  3次否定 → quarantine                      │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Archive     │  移动到 Archive Tier                      │
│  │  Migrator   │  批量写入 S3                               │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Garbage    │  真正删除（差距#9 遗忘机制）              │
│  │  Collector  │  Archive 后 90 天无访问 → 删除             │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 跨领域功能架构

### 6.1 记忆验证引擎（差距#1 + #44）

```typescript
/**
 * Verification Engine - 解决记忆验证是行业死穴的问题
 */
interface VerificationEngine {
  // 验证类型
  type: 'file_exists' | 'code_grep' | 'api_check' | 'user_confirm';

  // 调度
  schedule(memoryId: string, type: string): void;
  cancel(memoryId: string): void;

  // 执行验证
  verify(memoryId: string): Promise<VerificationResult>;
}

interface VerificationResult {
  memory_id: string;
  verified: boolean;      // true = 验证通过
  method: string;        // 用什么方式验证的
  checked_at: number;
  details: {
    // file_exists: { path: string, exists: boolean }
    // code_grep: { pattern: string, matches: number }
    // api_check: { endpoint: string, status: number }
    // user_confirm: { response: 'confirm' | 'deny' | 'timeout' }
  };
}

// 验证触发器
const verificationTriggers = {
  // 文件路径类记忆 → 检查文件是否存在
  file_exists: (text: string) => {
    const paths = extractFilePaths(text);
    return paths.length > 0;
  },

  // 代码类记忆 → 检查代码中是否还有该模式
  code_grep: (text: string) => {
    const hasCodePattern = /function|const|class|import/.test(text);
    return hasCodePattern;
  },

  // API 类记忆 → 尝试调用 API
  api_check: (text: string) => {
    const hasApiPattern = /https?:\/\/|endpoint|api/.test(text);
    return hasApiPattern;
  },
};
```

### 6.2 多 Agent 隔离（差距#18 子 Agent 上下文注入）

```typescript
/**
 * Multi-Agent Memory Isolation
 */
interface AgentContext {
  agent_id: string;
  parent_id: string | null;  // 父 Agent ID
  isolation_level: 'shared' | 'semi-isolated' | 'fully-isolated';
  memory_scope: 'all' | 'team' | 'personal';
}

class AgentMemoryRouter {
  // 路由记忆访问
  // 根据 agent_id 确定可见范围
  // 子 Agent 默认只能访问父 Agent 的 summary，不能访问细节

  async recall(
    query: string,
    agentId: string,
    options?: RecallOptions
  ): Promise<RetrievedMemory[]> {
    const ctx = await this.getAgentContext(agentId);

    if (ctx.isolation_level === 'fully-isolated') {
      // 只返回该 Agent 自己创建的记忆
      options = { ...options, scope: ctx.agent_id };
    } else if (ctx.isolation_level === 'semi-isolated') {
      // 返回自己 + 父 Agent 的 summary
      const parentSummary = await this.getParentMemorySummary(ctx.parent_id);
      // 注入 parent summary 到 query context
    }

    return this.core.recall(query, options);
  }
}
```

### 6.3 自我认知系统（差距#17 + #57/#58）

```typescript
/**
 * Self-Awareness - hawk-bridge 对自己的记忆质量进行评估
 */
interface SelfAwareness {
  // Capture 质量
  captureSuccessRate: number;    // 成功 capture / 总调用
  captureNoiseRate: number;       // 被判定为噪音的比率
  captureAvgImportance: number;   // 平均 importance 分数
  captureContestRate: number;     // capture 后被否定的比率

  // Recall 质量
  recallHitRate: number;         // recall 后用户继续追问同类问题
  recallMissRate: number;         // recall 后用户说"不是这个"
  recallSilenceRate: number;      // recall 返回空但用户期望有结果

  // 系统健康
  memoryGrowthRate: number;       // 记忆增长速度
  noiseRatio: number;             // 噪音记忆占比
  orphanMemoryRate: number;       // 从未被访问的记忆占比
  contestedMemoryRate: number;    // contested 记忆占比

  // 衰减有效性
  decayEffectiveness: number;     // 衰减后 recall 质量是否提升
  archiveHitRate: number;         // 从 Archive 恢复的比例
}

class SelfAwarenessCollector {
  // 收集指标
  async collect(): Promise<SelfAwareness> {
    const [
      captureMetrics,
      recallMetrics,
      systemMetrics,
    ] = await Promise.all([
      this.getCaptureMetrics(),
      this.getRecallMetrics(),
      this.getSystemMetrics(),
    ]);

    return {
      ...captureMetrics,
      ...recallMetrics,
      ...systemMetrics,
    };
  }

  // 诊断报告
  async generateReport(): Promise<string> {
    const metrics = await this.collect();

    const issues: string[] = [];

    if (metrics.noiseRatio > 0.3) {
      issues.push(`⚠️ 噪音记忆占比过高: ${(metrics.noiseRatio * 100).toFixed(1)}%`);
    }

    if (metrics.recallMissRate > 0.2) {
      issues.push(`⚠️ Recall 错误率较高: ${(metrics.recallMissRate * 100).toFixed(1)}%`);
    }

    if (metrics.orphanMemoryRate > 0.5) {
      issues.push(`⚠️ 超过一半的记忆从未被访问，建议清理`);
    }

    return issues.length === 0
      ? '✅ 记忆系统健康'
      : issues.join('\n');
  }
}
```

### 6.4 商业化基础设施（记忆产品化 v3.x）

```typescript
/**
 * Multi-Tenant + Metering
 */
interface Tenant {
  id: string;
  plan: 'free' | 'pro' | 'enterprise';
  quota: {
    max_memories: number;
    max_recall_per_day: number;
    max_capture_per_day: number;
    embedding_api_calls: number;
  };
  usage: {
    memories_count: number;
    recall_today: number;
    capture_today: number;
    embedding_calls_today: number;
  };
}

class QuotaManager {
  // 检查配额
  async checkQuota(tenantId: string, operation: 'capture' | 'recall'): Promise<boolean>;

  // 扣减配额
  async consumeQuota(tenantId: string, operation: string, count: number): Promise<void>;

  // 配额预警
  async warnIfNearLimit(tenantId: string): Promise<void>;
}

// API Key 管理
interface APIKeyManager {
  createKey(tenantId: string, name: string, scopes: string[]): Promise<string>;
  revokeKey(keyId: string): Promise<void>;
  validateKey(key: string): Promise<Tenant>;
}
```

---

## 7. 实施路线图

### 7.1 阶段划分

```
v1.x (当前) ────────────────────────────────────────────▶
     │
     │  #13 Context Fence, #14 安全扫描, #10 相对日期
     ▼
v1.5 ───────────────────────────────────────────────────▶
     │  架构重构准备：Schema v2, Event Bus, Pipeline 抽象
     │
v2.0 ───────────────────────────────────────────────────▶
     │  核心升级：多层存储, 时序推理, 召回链路解释
     │           版本链, Contested 标记, Self-Awareness
     │
v2.5 ───────────────────────────────────────────────────▶
     │  生态完善：TypeScript SDK, Playground, Multi-Agent
     │
v3.0 ───────────────────────────────────────────────────▶
     │  商业化：Multi-Tenant, Quota, Metering
     │         Verification Engine (部分)
     │
v3.x ───────────────────────────────────────────────────▶
     │  长期：记忆产品化, Sync, 理论根基
```

### 7.2 v2.0 架构改造优先级

| 优先级 | 改造项 | 原因 | 风险 |
|--------|--------|------|------|
| P0 | Storage Engine 抽象 | 其他所有功能依赖 | 中 |
| P0 | Event Bus | Pipeline 间解耦 | 低 |
| P1 | Schema v2（拆分表） | 解决单表字段爆炸 | 中 |
| P1 | Capture Pipeline 重构 | 提升提取质量 | 低 |
| P2 | Recall Pipeline + Rerank | 召回质量提升 | 低 |
| P2 | Tracing基础设施 | 可观测性基础 | 低 |
| P3 | Decay Pipeline v2 | 遗忘机制 | 中 |
| P3 | Self-Awareness | 系统健康诊断 | 低 |

### 7.3 向后兼容策略

```typescript
// v1.x API 完全兼容
// v2.0 新增 API 加 /v2 前缀
// 内部实现逐步迁移，外部无感知

// 例如：
// /api/recall        → v1 API，兼容
// /api/v2/recall     → v2 API，新功能
// /api/v2/memories/* → v2 新接口
```

---

## 8. 关键技术决策

### 8.1 存储引擎选型

| 方案 | 优势 | 劣势 | 适用场景 |
|------|------|------|---------|
| **LanceDB** | 向量+表格统一，部署简单 | 冷热分层弱，metadata 查询弱 | v1.x-v2.x 热存储 |
| **PostgreSQL + pgvector** | metadata 查询强，支持 JSONB | 向量性能弱于专用向量库 | 元数据 + 混合查询 |
| **Qdrant** | 向量性能极强， filtering 强 | 部署复杂度高 | 大规模向量场景 |
| **S3 + DynamoDB** | 冷存储成本低 | 查询慢 | Archive 层 |

**推荐**：v2.0 采用 LanceDB（热）+ PostgreSQL（metadata + 时序图）+ S3（冷）的三层架构

### 8.2 Event Bus 选型

| 方案 | 优势 | 劣势 |
|------|------|------|
| **In-Memory (Node.js EventEmitter)** | 无额外依赖，低延迟 | 单实例，断电丢失，重启后状态丢失 |
| **Redis Streams** | 持久化，支持多实例，成熟 | 需要额外部署 |
| **Kafka** | 企业级，可靠性高 | 过度工程 |

**推荐**：v2.0 初期用 In-Memory + 持久化（定期 checkpoint），v3.0 升级到 Redis Streams

### 8.3 向量 Embedding 抽象

```typescript
// v2.0 必须支持多 provider 切换（差距#4）
interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
  dimensions(): number;
  provider(): string;
}

class EmbedderFactory {
  static create(config: HawkConfig['embedding']): Embedder {
    switch (config.provider) {
      case 'openai':
        return new OpenAIEmbedder(config);
      case 'jina':
        return new JinaEmbedder(config);
      case 'ollama':
        return new OllamaEmbedder(config);
      // ... 其他 provider
    }
  }
}
```

### 8.4 Schema 迁移策略

```typescript
// 零停机迁移：在线 schema 变更
class SchemaMigrator {
  // v1.5: 添加新字段（允许 null）
  async phase1(): Promise<void> {
    // ALTER TABLE memory ADD COLUMN shelf_life
    // 不影响现有代码
  }

  // v2.0: 迁移数据（后台执行）
  async phase2(): Promise<void> {
    // 后台 job：读取 v1 数据 → 填充 shelf_life
    // 使用 occurred_at 推断
  }

  // v2.5: 清理旧字段（可选）
  async phase3(): Promise<void> {
    // 删除不再使用的字段
  }
}
```

---

## 附录：17 个差距对应的架构改造

| 差距 | 需要改造的模块 |
|------|--------------|
| #1 记忆验证 | Verification Engine（新增） |
| #2 跨设备 Sync | Sync Protocol + Event Bus（新增） |
| #3 形式化理论 | （研究性质，非工程问题） |
| #4 Embedding 锁定 | Embedder 抽象（已有，需完善） |
| #5 Capture 质量 | Capture Pipeline 重构 |
| #6 垃圾记忆 | Decay Pipeline + Orphan Detector |
| #7 冷启动 | Onboarding Guide（配置层） |
| #8 记忆所有权 | 加密层 + 法律合规（配置层） |
| #9 遗忘机制 | Decay Pipeline v2 |
| #10 保鲜期差异 | Shelf Life Detector + Decay 规则 |
| #11 召回链路黑盒 | Recall Pipeline + Rerank + Result Builder |
| #12 一致性漂移 | Version Chain + Version Resolver |
| #13 回音室 | Contested Filter + Contest Handler |
| #14 时序推理 | Temporal Graph + Temporal Reasoner |
| #15 运维黑盒 | Tracing + MemoryTrace |
| #16 接入门槛 | TypeScript SDK + Playground |
| #17 自我认知 | Self-Awareness + Metrics |

---

## 总结

**架构升级的核心思路**：

1. **存储分层**：热（ LanceDB）→ 温（ PostgreSQL）→ 冷（ S3）
2. **Pipeline 化**：Capture / Recall / Decay 各自独立 Pipeline，通过 Event Bus 解耦
3. **Schema 拆分**：Core / Metadata / Score / Trace 分离，避免单表字段爆炸
4. **可观测优先**：所有操作带 trace_id，支撑 #15 运维黑盒问题
5. **向后兼容**：v1.x API 完全兼容，v2.0 新功能加 `/v2` 前缀

**最大风险**：Schema 迁移期间的数据一致性。需要分阶段、灰度发布、充分测试。

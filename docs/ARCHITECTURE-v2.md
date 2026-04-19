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

> **2026-04-19 更新**：采用「本地优先 + Redis Streams 可升级」策略。
> 默认部署不需要 Redis，降低门槛；有规模需求时再升级。

| 方案 | 优势 | 劣势 | 适用场景 |
|------|------|------|---------|
| **In-Memory + WAL**（默认） | 零依赖，clone 就能跑，延迟最低 | 单实例，断电丢少量事件（<1s），无法水平扩展 | v1.x 单实例、个人/小团队 |
| **Redis Streams**（可选升级） | 持久化，消费者组，多实例消费，exactly-once | 需要额外部署 Redis，增加运维复杂度 | v2.x 多实例、企业级 |
| **Kafka** | 企业级，可靠性极高 | 过度工程，运维极复杂 | 超大规模（>1000 QPS） |

**决策**：

- **v1.x 默认**：In-Memory Event Bus + 磁盘 WAL（fsync 到磁盘，崩溃恢复）
- **v2.x 可选**：Redis Streams（只需修改配置，代码层面自动兼容）
- **v3.x 预留**：Kafka（仅在超大规模时考虑）

> 架构原则：**简单场景零门槛，复杂场景可升级**，不强迫用户为不需要的能力买单。

```typescript
/**
 * Event Bus 两层架构
 *
 *  LocalEventBus（默认）          RedisStreamsBus（可选升级）
 *  ┌──────────────────┐           ┌──────────────────────────┐
 *  │  Memory Queue    │           │  Redis Streams          │
 *  │  + WAL File      │  ←切换→  │  + Consumer Groups      │
 *  │  (同步写磁盘)    │           │  (多实例消费)           │
 *  └──────────────────┘           └──────────────────────────┘
 *        ↓                              ↓
 *  ┌──────────────────┐           ┌──────────────────────────┐
 *  │  EventHandler    │           │  EventHandler            │
 *  └──────────────────┘           └──────────────────────────┘
 */

/**
 * EventBus 接口 — Local 和 Redis 共用同一接口
 */
interface EventBus {
  publish(channel: string, event: MemoryEvent): Promise<void>;
  subscribe(
    group: string,
    consumer: string,
    handler: (event: MemoryEvent) => Promise<void>
  ): Promise<void>;
  ack(channel: string, group: string, id: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * LocalEventBus — 默认实现（v1.x）
 *
 * 特点：
 * - 内存队列 + WAL 文件（append only）
 * - 进程内同步写 WAL，崩溃后可恢复
 * - 单实例使用，不支持多实例消费
 * - 零外部依赖
 */
class LocalEventBus implements EventBus {
  private queue: Map<string, MemoryEvent[]> = new Map();
  private handlers: Map<string, Set<(event: MemoryEvent) => Promise<void>>> = new Map();
  private walPath: string;
  private walStream: fs.WriteStream;

  constructor(walPath: string = './data/events.wal') {
    this.walPath = walPath;
    // 确保目录存在
    fs.mkdirSync(path.dirname(walPath), { recursive: true });
    // 打开 WAL（append mode）
    this.walStream = fs.createWriteStream(walPath, { flags: 'a' });
    // 启动时恢复未消费的事件
    this.recoverFromWAL();
  }

  async publish(channel: string, event: MemoryEvent): Promise<void> {
    // 内存队列
    if (!this.queue.has(channel)) {
      this.queue.set(channel, []);
    }
    this.queue.get(channel)!.push(event);

    // 同步写 WAL（batch fsync 优化）
    this.walStream.write(JSON.stringify({ channel, event }) + '\n');

    // 触发本地 handlers（同步）
    const handlers = this.handlers.get(channel);
    if (handlers) {
      await Promise.all([...handlers].map(h => h(event)));
    }
  }

  async subscribe(
    group: string,
    consumer: string,
    handler: (event: MemoryEvent) => Promise<void>
  ): Promise<void> {
    if (!this.handlers.has(group)) {
      this.handlers.set(group, new Set());
    }
    this.handlers.get(group)!.add(handler);
  }

  async ack(channel: string, group: string, id: string): Promise<void> {
    // Local 模式不需要 ack（单实例，同步处理）
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.walStream.end(() => resolve());
    });
  }

  // WAL 恢复：启动时重放未处理的事件
  private async recoverFromWAL(): Promise<void> {
    if (!fs.existsSync(this.walPath)) return;

    const lines = fs.readFileSync(this.walPath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const { channel, event } = JSON.parse(line);
        // 重放事件到 handlers
        const handlers = this.handlers.get(channel);
        if (handlers) {
          await Promise.all([...handlers].map(h => h(event)));
        }
      } catch (e) {
        console.warn('WAL recovery: skip malformed line', e);
      }
    }
  }
}

/**
 * RedisStreamsBus — 可选升级（v2.x）
 *
 * 切换方式：
 * 1. 安装 Redis
 * 2. 修改配置：eventbus.provider: "redis"
 * 3. 重启服务，自动从 Local 切换到 Redis Streams
 */
class RedisStreamsBus implements EventBus {
  private redis: Redis;
  private group: string;

  constructor(config: { url: string; group: string }) {
    this.redis = new Redis(config.url);
    this.group = config.group;
  }

  async publish(channel: string, event: MemoryEvent): Promise<void> {
    await this.redis.xadd(channel, '*', 'data', JSON.stringify(event));
  }

  async subscribe(
    group: string,
    consumer: string,
    handler: (event: MemoryEvent) => Promise<void>
  ): Promise<void> {
    // 确保消费者组存在
    try {
      await this.redis.xgroup('CREATE', group, consumer, '0');
    } catch (e) {
      // 消费者组已存在，忽略
    }

    // 持续消费
    while (true) {
      const events = await this.redis.xreadgroup(
        'GROUP', group, consumer,
        'COUNT', 100,
        'BLOCK', 1000,
        'STREAMS', group, '>'
      );

      for (const [stream, messages] of events) {
        for (const [id, fields] of messages) {
          const event = JSON.parse(fields[1]);
          await handler(event);
          await this.redis.xack(group, consumer, id);
        }
      }
    }
  }

  async ack(channel: string, group: string, id: string): Promise<void> {
    await this.redis.xack(channel, group, id);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * EventBus Factory — 根据配置自动选择实现
 */
class EventBusFactory {
  static create(config: HawkConfig['eventbus']): EventBus {
    switch (config.provider) {
      case 'redis':
        return new RedisStreamsBus(config.redis);
      case 'local':
      default:
        return new LocalEventBus(config.local?.walPath);
    }
  }
}

/**
 * 配置示例
 */
const hawkConfig: HawkConfig = {
  eventbus: {
    // 默认：本地模式（零依赖）
    provider: 'local',
    local: {
      walPath: './data/events.wal',
    },
    // 未来升级 Redis：
    // provider: 'redis',
    // redis: {
    //   url: 'redis://localhost:6379',
    //   group: 'hawk-bridge',
    // },
  },
};

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

## 8.5 七大架构缺口（59 项 TODO 之外的顶层缺陷）

> 即使 59 项 TODO 全部实现，仍有 7 个根本性架构缺口需要单独设计。
> 这 7 个缺口不属于"功能实现"范畴，而是**架构层面的结构性缺失**。

### 8.5.1 缺口一：Semantic Index（语义索引层）

**问题**：当前只有时间线索引（Temporal Graph），记忆之间是孤立的文本块。

```
现状（v2.0 架构）：
记忆库 = 2000 条 flat 文本块 + 向量 + 时间戳

真正智能的记忆系统：
记忆库 = 知识图谱（主题/实体/人）× 时间线 × 重要性
```

**具体表现**：
- 问"这个项目有哪些悬而未决的问题" → 需要遍历所有记忆
- 问"上次讨论 API 设计的结论是什么" → 需要按项目+topic 过滤，但无法做到
- 没有 Topic/Entity/Person 的概念，记忆之间没有语义关联

**架构设计**：

```typescript
/**
 * 语义索引 — 三维语义组织（Topic × Entity × Person）
 * 与 Temporal Graph（时间线）正交，互补
 */
interface SemanticIndex {
  // Topic Tree：主题树，记忆按主题归类
  // 例：hawk-bridge → API设计 / 存储架构 / Decay策略
  topics: Map<string, TopicNode>;

  // Entity Profile：实体画像（项目/文件/系统/人）
  // 例：hawk-memory-api → 相关记忆列表 + 关系网络
  entities: Map<string, EntityProfile>;

  // Person Model：人的记忆模型（跨 agent 的用户画像）
  persons: Map<string, PersonMemoryModel>;

  // 索引操作
  indexMemory(memoryId: string, topic: string, entities: string[], persons: string[]): void;
  reindex(memoryId: string, oldTopic: string, newTopic: string): void;

  // 按语义查询（不经过向量）
  queryByTopic(topic: string, recursive?: boolean): string[];     // 包含子主题
  queryByEntity(entityId: string): string[];
  queryByPerson(personId: string): string[];
}

/** Topic 节点（树形结构）*/
interface TopicNode {
  id: string;
  name: string;                // "API 设计"
  parent: string | null;       // "hawk-bridge"
  children: string[];          // 子主题
  memoryIds: string[];         // 该主题下的记忆 ID
  metadata: {
    totalMemories: number;
    lastUpdated: number;
    stability: 'stable' | 'evolving' | 'volatile';
  };
}

/** Entity 实体画像 */
interface EntityProfile {
  id: string;
  type: 'project' | 'file' | 'system' | 'person' | 'api' | 'concept';
  name: string;
  description: string;
  relatedMemories: string[];
  relatedEntities: string[];     // 关联的其他实体
  currentState: string;           // "stable" | "deprecated" | "under_review"
  lastMentioned: number;
  firstMentioned: number;
}

/** Person 记忆模型 */
interface PersonMemoryModel {
  id: string;
  name: string;
  role: string;
  memories: string[];          // 该人相关的所有记忆

  // 跨记忆推断出的属性
  inferredAttributes: {
    preferences: string[];
    expertise: string[];       // 专长领域
    communicationStyle: string;
    workingPatterns: string[];
  };

  // 与其他人的关系
  relations: Record<string, 'collaborates' | 'reports_to' | 'equals'>;
}
```

**与 Temporal Graph 的关系**：

```typescript
// Temporal Graph 解决"何时"的问题
// Semantic Index 解决"关于什么/谁"的问题
// 两者独立索引，recall 时交叉过滤

interface HybridRecallQuery {
  // 语义维度（Semantic Index）
  topic?: string;           // "API 设计"
  entity?: string;          // "hawk-memory-api"
  person?: string;          // "qilin"

  // 时间维度（Temporal Graph）
  before?: number;          // timestamp
  after?: number;           // timestamp
  eventChain?: string;      // 事件链

  // 向量维度（Hybrid Retriever）
  vectorQuery?: string;     // 自然语言 query

  // 组合逻辑
  // topic: "API 设计" AND after: 7days_ago AND vector: "REST vs GraphQL"
}
```

**为什么是根本性缺口**：向量相似度只解决"找相关的"，不解决"找同一个主题的所有记忆"。没有 Semantic Index，`#45 知识图谱关系层` 只能做手动关系发现，无法自动关联。

**版本规划**：v2.3（基础语义索引）→ v2.5（Entity Profile 自动抽取）→ v2.8（Topic Tree 自动构建）

---

### 8.5.2 缺口二：Working Memory（工作记忆组件）

**问题**：当前只有 LTM（Long-Term Memory），没有 Working Memory。Agent 每次对话都要重新 recall，没有"当前讨论主题"缓存。

```
人类认知系统：
Working Memory（7±2 个槽位） ↔ LTM（海量持久）

当前 hawk-bridge：
Recall 结果直接给 Agent → Agent 自己决定哪些保留在上下文
```

**具体表现**：
- 第 1 轮 recall 10 条，第 3 轮又 recall 10 条 → 没有"当前会话工作集"概念
- 早期 recall 的结论在第 5 轮可能淡出上下文
- recall 10 条结果都丢给 Agent，Agent 自己去判断哪些相关

**架构设计**：

```typescript
/**
 * Working Memory — 当前会话的工作记忆池
 * 容量限制（7±2 槽位），高频淘汰
 */
interface WorkingMemory {
  sessionId: string;

  // 活跃槽位（最多 7 个）
  activeSlots: Array<WorkingSlot | null>;  // [slot0, slot1, ..., slot6]

  // 当前讨论主题栈（用于多轮对话的上下文连贯性）
  contextStack: string[];   // ["API 设计", "REST 方案", "认证方式"]

  // 本轮 recall 计数（防止无限 recall）
  recallCountThisTurn: number;
  recallCountTotal: number;  // 本 session 累计

  // 工作记忆的操作
  promote(memory: MemoryEntry): void;      // 进入工作记忆
  demote(memoryId: string): void;          // 退出工作记忆
  consolidate(): ConsolidatedMemory[];      // 合并相关记忆
  getActive(): MemoryEntry[];              // 获取当前工作集
}

/** 工作记忆槽位 */
interface WorkingSlot {
  memoryId: string;
  enteredAt: number;           // 进入时间
  lastAccessedAt: number;     // 最后访问时间
  accessCount: number;         // 工作期间访问次数
  relevanceScore: number;      // 与当前讨论的相关性
  consolidatedFrom: string[]; // 由哪些记忆合并而来
}

/** 合并后的记忆 */
interface ConsolidatedMemory {
  id: string;                  // 虚拟 ID，不持久化
  sourceIds: string[];         // 来源记忆 ID
  compiledContent: string;      // 合并后的内容
  consensus: string;           // 如果有分歧，共识是什么
  contested: boolean;          // 是否有未解决的分歧
}

/**
 * Working Memory Manager — 跨 session 管理
 * 每个 session 有独立的 Working Memory
 */
class WorkingMemoryManager {
  private sessions: Map<string, WorkingMemory> = new Map();

  getOrCreate(sessionId: string): WorkingMemory;
  destroy(sessionId: string): void;  // session 结束时调用

  // 工作记忆 → LTM 沉淀
  // 多次会话中反复被 promote 的记忆 → 自动写入 LTM
 沉淀ToLTM(memoryId: string): Promise<void>;

  // LTM → 工作记忆预加载
  // session 启动时根据上下文预加载相关记忆到工作集
  preload(sessionId: string, context: string): Promise<void>;
}
```

**与 Recall Pipeline 的集成**：

```typescript
// Recall Pipeline v2 增加 Working Memory 集成
class RecallPipelineV2 {
  async recall(
    query: string,
    options: RecallOptions,
    sessionId: string
  ): Promise<RecallResult> {
    const wm = workingMemoryManager.getOrCreate(sessionId);

    // Step 0: 检查工作记忆是否已包含答案（零向量搜索）
    const inWorkingMemory = wm.getActive().find(m =>
      semanticSimilarity(m.text, query) > 0.85
    );
    if (inWorkingMemory && options.skipWorkingMemory !== true) {
      return {
        source: 'working_memory',
        memories: [inWorkingMemory],
        recallCount: 0,  // 没有消耗向量搜索配额
      };
    }

    // Step 1: 向量 + FTS 搜索（原有逻辑）
    const ltmResults = await this.ltmRecall(query, options);

    // Step 2: 合并工作记忆结果
    const wmResults = wm.getActive()
      .filter(m => semanticSimilarity(m.text, query) > 0.6);

    // Step 3: 返回前 promote 最高相关性的记忆
    const allResults = [...ltmResults, ...wmResults];
    const topResults = this.rerank(query, allResults);

    // Step 4: 更新工作记忆
    for (const result of topResults.slice(0, 3)) {
      wm.promote(result);
    }

    return {
      source: 'hybrid',
      memories: topResults,
      recallCount: ltmResults.length,
    };
  }
}
```

**为什么是根本性缺口**：没有 Working Memory，Agent 就无法区分"我现在正在处理的"和"我过去知道的"。这直接影响多轮对话质量和上下文利用效率。

**版本规划**：v2.2（基础 Working Memory）→ v2.4（自动沉淀机制）→ v2.6（LTM ↔ WM 双向同步）

---

### 8.5.3 缺口三：Memory Compiler（记忆编译器）

**问题**：recall 返回的是"历史记忆列表"，不是"当前需要的最优答案"。LLM 被迫做额外的信息综合工作。

```
现状 recall 返回：
[
  { text: "用户上周说要把 API 改成 REST", score: 0.82 },
  { text: "API 之前用的是 GraphQL", score: 0.75 },
  { text: "用户偏好简洁的代码风格", score: 0.70 },
]

理想的 recall 返回：
"用户上周决定将 API 从 GraphQL 改为 REST，偏好简洁代码风格。当前讨论的是认证方式，建议在 PR 描述中引用这些历史决策。"
```

**具体表现**：
- 第 3 轮对话时，Agent 要自己综合 10 条 recall 结果才能得出结论
- 多条记忆描述同一实体时，没有合并为一条"综合视图"
- 没有预先推断记忆之间的关系，让 Agent 自己做推理

**架构设计**：

```typescript
/**
 * Memory Compiler — 将多条相关记忆编译为单一答案
 * 位于 Recall Pipeline 末端，在 rerank 之后执行
 */
interface MemoryCompiler {
  // 主编译接口
  compile(memories: RetrievedMemory[], query: string): CompiledOutput;

  // 编译策略
  strategies: CompileStrategies;
}

interface CompileStrategies {
  // 实体合并：同一实体的多条记录 → 最新版本 + 历史摘要
  entityMerge(memories: RetrievedMemory[]): MergedMemory;

  // 冲突解决：同一事实两个相反结论 → 都保留并标记冲突
  conflictResolution(memories: RetrievedMemory[]): ConflictMemory;

  // 时间折叠：同一主题的多条记录 → 折叠为时间线摘要
  timelineFold(memories: RetrievedMemory[]): TimelineMemory;

  // 摘要生成：无法合并 → LLM 生成自然语言摘要
  summarize(memories: RetrievedMemory[], query: string): string;
}

/** 合并后的记忆 */
interface MergedMemory {
  type: 'merged';
  currentContent: string;        // 当前最新版本
  historicalSummary: string;     // 历史变更摘要
  sourceIds: string[];           // 来源记忆 ID
  sourceCount: number;           // 合并了多少条
}

/** 冲突记忆 */
interface ConflictMemory {
  type: 'conflict';
  versions: Array<{ text: string; timestamp: number; source: string }>;
  conflictNote: string;          // 分歧点的自然语言描述
  unresolved: boolean;           // 是否已解决
}

/** 时间线记忆 */
interface TimelineMemory {
  type: 'timeline';
  entries: Array<{
    timestamp: number;
    content: string;
    milestone: string;           // "决策" | "变更" | "讨论"
  }>;
  currentState: string;           // 最新状态
}

/** 编译输出 */
interface CompiledOutput {
  // 主要答案（经过编译的单一文本）
  primary: string;

  // 编译类型
  compileType: 'merged' | 'conflict' | 'timeline' | 'summary' | 'single';

  // 来源记忆追溯
  sources: Array<{
    memoryId: string;
    text: string;
    relevance: number;
  }>;

  // 额外信息
  supplementary?: {
    relatedDecisions: string[];   // 相关决策
    actionHints: string[];       // 行动建议
    warnings: string[];          // 警告（如冲突未解决）
  };

  // 召回原因说明
  recallReason: string;          // "该记忆被召回是因为：与当前讨论的认证方式直接相关"
}

/**
 * Compile Strategies 的 LLM 提示词
 */
const COMPILE_PROMPT = `
你是一个记忆编译器。请将以下相关记忆编译为单一连贯的答案。

当前问题：{query}

相关记忆：
{memoriesJson}

请按以下规则编译：
1. 如果多条记忆描述同一实体 → 保留最新，去重并注明变更历史
2. 如果多条记忆有冲突 → 标注分歧点，不强制合并
3. 如果多条记忆是同一事件的时间序列 → 折叠为时间线
4. 生成一段连贯的自然语言答案，不是记忆列表
5. 如果有相关决策或行动建议，一并指出

输出格式：
{
  "primary": "编译后的答案",
  "compileType": "merged|conflict|timeline|summary|single",
  "conflictNote": "如有冲突，分歧点描述",
  "actionHints": ["行动建议1", "行动建议2"],
  "recallReason": "召回原因说明"
}
`;
```

**为什么是根本性缺口**：recall 的本质不是"返回记忆列表"，而是"回答用户问题"。没有 Compiler，LLM 就被迫做额外的信息综合工作，降低了响应质量和速度。

**版本规划**：v2.3（基础 Compiler）→ v2.5（冲突检测+时间折叠）→ v2.7（行动建议生成）

---

### 8.5.4 缺口四：Adaptive Decay（自适应衰减）

**问题**：当前 decay 是纯时间触发的，没有考虑访问模式。

```
当前 Decay：
if (now - createdAt > 30 days && accessCount < 3) → archive

真正智能的 Decay：
if (never_accessed && createdRecently > 7 days) → candidate for deletion
if (accessed_but_declining && importance < threshold) → slow decay
if (frequently_accessed && old) → stay stable
```

**具体表现**：
- 一条记忆 60 天没被访问 → 进入 Archive（基于时间）
- 但另一条记忆 60 天没被访问但 access_count=0 → 同样是 Archive
- 两者 decay 速度一样，但实际上后者更可能是垃圾记忆

**架构设计**：

```typescript
/**
 * Adaptive Decay — 基于访问模式的智能衰减
 * 替代现有的纯时间衰减规则
 */
interface AdaptiveDecay {
  // 计算单条记忆的衰减配置
  computeDecayConfig(memory: MemoryEntry): DecayConfig;

  // 应用衰减
  applyDecay(memoryId: string, delta: number): Promise<void>;
}

/** 衰减配置 */
interface DecayConfig {
  // 衰减速率（每天衰减百分比）
  decayRate: number;       // 0.0-1.0, 0=不衰减

  // 当前 TTL
  ttlDays: number;          // 0=永不过期

  // 衰减模式
  mode: DecayMode;

  // 下次检查时间
  nextReviewAt: number;
}

/** 衰减模式 */
type DecayMode =
  | 'stable'      // 高频访问，稳定记忆，几乎不衰减
  | 'gradual'     // 正常衰减，标准速度
  | 'accelerated' // 低频访问，加快衰减
  | 'candidate'   // 零访问，候选删除
  | 'protected';  // 被锁定或高重要性，永不衰减

/** 访问模式识别 */
interface AccessPattern {
  type: 'stable' | 'declining' | 'zero' | 'single' | 'burst';

  // 统计数据
  totalAccesses: number;
  firstAccess: number | null;
  lastAccess: number | null;
  accessFrequency: number;      // 次/天

  // 趋势
  recentTrend: number;         // -1 到 1，最近访问频率趋势

  // 衰减参数
  suggestedDecayRate: number;
  suggestedTTL: number;
}

/**
 * 访问模式分析器
 */
class AccessPatternAnalyzer {
  analyze(memory: MemoryEntry): AccessPattern {
    const { accessCount, lastAccessedAt, createdAt, importance } = memory;
    const age = Date.now() - createdAt;

    if (accessCount === 0) {
      return {
        type: age > 7 * 86400000 ? 'zero' : 'single',
        totalAccesses: 0,
        firstAccess: null,
        lastAccess: null,
        accessFrequency: 0,
        recentTrend: 0,
        suggestedDecayRate: age > 7 * 86400000 ? 0.5 : 0.1,
        suggestedTTL: age > 7 * 86400000 ? 30 : 90,
      };
    }

    // 计算访问频率趋势
    const daysSinceFirstAccess = (Date.now() - this.firstAccess) / 86400000;
    const frequency = accessCount / daysSinceFirstAccess;

    // 最近 7 天 vs 之前 7 天
    const recentTrend = this.computeTrend(memory);

    if (frequency > 0.3 && recentTrend >= 0) {
      return { type: 'stable', ... };
    } else if (recentTrend < 0) {
      return { type: 'declining', ... };
    } else if (accessCount === 1) {
      return { type: 'single', ... };
    } else {
      return { type: 'burst', ... };
    }
  }
}

/**
 * Decay Pipeline v2 — 集成 Adaptive Decay
 */
class DecayPipelineV2 {
  async runDecayCycle(): Promise<DecayReport> {
    const candidates = await this.findDecayCandidates();

    for (const memory of candidates) {
      const pattern = this.analyzer.analyze(memory);
      const config = this.computeDecayConfig(memory, pattern);

      if (config.mode === 'candidate') {
        // 零访问 + 超过 7 天 → 进入候选删除队列
        await this.markAsCandidate(memory.id);
      } else if (config.mode === 'protected') {
        // 保持不变
      } else {
        // 正常衰减
        await this.applyDecay(memory.id, config.decayRate);
      }
    }

    return { processed: candidates.length, ... };
  }
}
```

**与 Decay Pipeline v1 的区别**：

| 维度 | Decay v1（当前） | Decay v2（目标） |
|------|-----------------|-----------------|
| 触发条件 | 纯时间（30 天） | 时间 + 访问模式 |
| 衰减速度 | 固定 | 动态调整 |
| 零访问处理 | 和低频访问一样 | 加速淘汰 |
| 高频访问 | 不衰减 | 保持稳定 |
| 删除判断 | TTL 到期 | 零访问 + TTL 到期双重判断 |

**版本规划**：v2.3（Adaptive Decay 核心）→ v2.5（趋势预测）→ v2.8（RL-based 衰减参数调优）

---

### 8.5.5 缺口五：Recall Suppression（召回抑制机制）

**问题**：`#9 Ignore Memory 指令` 只是让 recall 返回空，但应该有更精细的抑制机制。

```
现状：ignore=true → 返回空（等于没有记忆）
理想：ignore=true → 仍然可以 recall，但不注入上下文
```

**具体表现**：
- 子 Agent 不应该看到某些记忆，但没有细粒度控制
- 记忆被用户明确纠正后，旧记忆无法被选择性屏蔽
- 不同 agent 有不同的可见性需求，但只有"全开/全关"

**架构设计**：

```typescript
/**
 * Recall Suppression — 细粒度召回抑制
 * 多 Agent 系统中精确控制哪些记忆对谁可见
 */
interface RecallSuppression {
  // 临时抑制：当前 session 不注入，但不屏蔽
  suppressTemporarily(
    memoryId: string,
    sessionId: string,
    reason: string,
    expiresAt?: number
  ): Promise<void>;

  // 永久标记：特定 agent 永远看不到这条记忆
  suppressForAgent(
    memoryId: string,
    agentId: string,
    reason: string
  ): Promise<void>;

  // 抑制层级
  suppressByLevel(
    memoryId: string,
    level: 'agent' | 'session' | 'global',
    targetId: string,
    reason: string
  ): Promise<void>;

  // 检查是否被抑制
  isSuppressed(
    memoryId: string,
    sessionId: string,
    agentId: string
  ): Promise<SuppressionRecord | null>;

  // 解除抑制
  unsuppress(memoryId: string, level: string, targetId: string): Promise<void>;
}

/** 抑制记录 */
interface SuppressionRecord {
  memoryId: string;
  level: 'agent' | 'session' | 'global';
  targetId: string;          // agent_id 或 session_id
  reason: string;
  suppressedAt: number;
  expiresAt: number | null; // null = 永久
  suppressedBy: string;       // 操作者
}

/**
 * Suppression 存储表
 */
interface SuppressionStore {
  memory_id: string;
  level: 'agent' | 'session' | 'global';
  target_id: string;
  reason: string;
  suppressed_at: number;
  expires_at: number | null;
}

/**
 * 抑制触发场景
 */
const SUPPRESSION_TRIGGERS = {
  // 场景 1：用户说"ignore memory" → 临时抑制
  userIgnoreMemory: {
    level: 'session',
    duration: null,  // 直到 session 结束或用户取消
    reason: 'User explicitly requested ignoring this memory',
  },

  // 场景 2：记忆被用户明确纠正 → 旧记忆对主 agent 抑制
  memoryCorrected: {
    level: 'agent',
    duration: null,  // 永久（直到手动解除）
    reason: 'This memory was corrected by user. Old version suppressed.',
  },

  // 场景 3：子 agent 隔离 → 不应该看到主 agent 的内部讨论
  subagentIsolation: {
    level: 'agent',
    duration: null,
    reason: 'Sub-agent should not see parent agent internal discussions',
  },

  // 场景 4：敏感信息 → 全局抑制
  sensitiveInformation: {
    level: 'global',
    duration: null,
    reason: 'Contains sensitive information, excluded from recall',
  },

  // 场景 5：contested 记忆 → 暂时抑制直到复核
  contestedMemory: {
    level: 'session',
    duration: 7 * 86400000,  // 7 天后自动解除
    reason: 'Memory is contested, pending review',
  },
};

/**
 * Recall Pipeline 集成 Suppression
 */
class RecallPipelineV2 {
  async recall(
    query: string,
    options: RecallOptions,
    sessionId: string,
    agentId: string
  ): Promise<RecallResult> {
    // Step 1: 执行原始 recall
    const rawResults = await this.ltmRecall(query, options);

    // Step 2: 应用抑制过滤
    const filteredResults: RetrievedMemory[] = [];
    const suppressedList: string[] = [];

    for (const memory of rawResults) {
      const suppression = await this.suppression.isSuppressed(
        memory.id,
        sessionId,
        agentId
      );

      if (suppression) {
        suppressedList.push(memory.id);
        // 注意：仍然保留在结果中，但标记为 suppressed
        memory._suppressed = {
          reason: suppression.reason,
          suppressedBy: suppression.suppressedBy,
        };
        // 不加入 filteredResults（但可配置是否返回 suppressed 记录）
        if (!options.includeSuppressed) {
          continue;
        }
      }

      filteredResults.push(memory);
    }

    // Step 3: 如果有被抑制的记忆，通知调用方
    if (suppressedList.length > 0) {
      return {
        ...filteredResults,
        _metadata: {
          suppressedCount: suppressedList.length,
          suppressedIds: suppressedList,
          // 告知调用方：记忆被抑制了，但可以选择性查看
          suppressionNotice: `${suppressedList.length} memories were suppressed for this query. Set includeSuppressed=true to see them.`,
        },
      };
    }

    return filteredResults;
  }
}
```

**为什么是根本性缺口**：多 Agent 系统中，主 Agent 需要精确控制子 Agent 能看到什么记忆。当前只有"全开"和"全关"两种模式，没有"针对特定 agent 屏蔽特定记忆"的细粒度控制。

**版本规划**：v2.2（基础 Suppression）→ v2.4（自动触发器）→ v2.6（分层抑制策略）

---

### 8.5.6 缺口六：Memory Lifecycle State Machine

**问题**：当前记忆的状态只有 soft delete / deleted / archived，没有完整的生命周期状态机。

```
当前状态：created → active → (archived | deleted)

应有的状态：
draft → candidate → active → (stable | contested | suppressed) → archived → forgotten
```

**具体表现**：
- Decay / Verification / Suppression / Deletion 的逻辑混在一起
- 无法清晰表达"这条记忆现在处于什么阶段"
- 状态转换没有规则约束，可以任意跳转

**架构设计**：

```typescript
/**
 * Memory Lifecycle State Machine
 * 定义记忆的完整生命周期状态和转换规则
 */

// 记忆状态
type MemoryState =
  | 'draft'          // 待审核（新用户前 N 条 / 高风险内容）
  | 'candidate'      // 等待 LLM 二次验证
  | 'active'        // 正常可用
  | 'stable'        // 被多次验证，重要性高
  | 'contested'     // 被质疑/否定过，需要复核
  | 'suppressed'    // 被手动抑制
  | 'drifting'      // 检测到内容漂移
  | 'archived'      // 归档（冷存储）
  | 'forgotten';    // 真正删除（GDPR / 用户请求）

// 状态转换事件
type LifecycleEvent =
  | 'submit'           // 提交审核
  | 'approve'          // 审核通过
  | 'reject'           // 审核拒绝
  | 'verify'           // 验证通过
  | 'contest'          // 被质疑
  | 'correct'          // 被纠正
  | 'suppress'         // 被抑制
  | 'unsuppress'       // 解除抑制
  | 'drift_detected'   // 漂移检测
  | 'correct_drift'    // 修正漂移
  | 'archive'          // 归档
  | 'restore'          // 从归档恢复
  | 'forget';          // 永久删除

// 状态转换规则表
const STATE_TRANSITIONS: Record<MemoryState, Record<LifecycleEvent, MemoryState | null>> = {
  'draft': {
    'approve': 'active',
    'reject': 'forgotten',
  },
  'candidate': {
    'verify': 'active',
    'contest': 'contested',
    'reject': 'forgotten',
  },
  'active': {
    'verify': 'stable',
    'contest': 'contested',
    'suppress': 'suppressed',
    'drift_detected': 'drifting',
    'archive': 'archived',
  },
  'stable': {
    'contest': 'contested',
    'suppress': 'suppressed',
    'archive': 'archived',
    'drift_detected': 'drifting',
  },
  'contested': {
    'verify': 'active',
    'archive': 'archived',
  },
  'suppressed': {
    'unsuppress': 'active',
    'archive': 'archived',
  },
  'drifting': {
    'correct_drift': 'active',
    'archive': 'archived',
  },
  'archived': {
    'restore': 'active',
    'forget': 'forgotten',
  },
  'forgotten': {},  // 终态，不可转换
};

/**
 * State Machine 实现
 */
class MemoryLifecycleStateMachine {
  // 获取当前状态
  getState(memoryId: string): Promise<MemoryState>;

  // 执行状态转换
  async transition(
    memoryId: string,
    event: LifecycleEvent,
    metadata?: Record<string, unknown>
  ): Promise<TransitionResult> {
    const currentState = await this.getState(memoryId);
    const nextState = STATE_TRANSITIONS[currentState]?.[event];

    if (!nextState) {
      return {
        success: false,
        error: `Invalid transition: ${currentState} + ${event}`,
        allowedEvents: Object.keys(STATE_TRANSITIONS[currentState]),
      };
    }

    // 执行转换
    await this.persistStateTransition(memoryId, currentState, nextState, event, metadata);

    // 触发副作用
    await this.runSideEffects(memoryId, currentState, nextState, event);

    return { success: true, from: currentState, to: nextState };
  }

  // 副作用处理
  private async runSideEffects(
    memoryId: string,
    from: MemoryState,
    to: MemoryState,
    event: LifecycleEvent
  ): Promise<void> {
    switch (to) {
      case 'contested':
        await this.eventBus.publish('memory.contested', { memoryId, event });
        break;
      case 'forgotten':
        await this.storage.hardDelete(memoryId);  // 真正删除
        break;
      case 'archived':
        await this.archiveToColdStorage(memoryId);
        break;
      case 'suppressed':
        await this.suppression.suppressForAgent(memoryId, 'global', 'State transition');
        break;
    }
  }

  // 获取允许的下一个事件
  getAllowedEvents(memoryId: string): LifecycleEvent[] {
    const state = this.getStateCache(memoryId);
    return Object.keys(STATE_TRANSITIONS[state]) as LifecycleEvent[];
  }
}

/**
 * 状态特定的 recall 行为
 */
class StateAwareRecall {
  async recall(query: string, options: RecallOptions): Promise<RecallResult> {
    const rawResults = await this.ltmRecall(query, options);

    // 状态感知过滤
    return rawResults.filter(memory => {
      const state = memory.lifecycleState;

      switch (state) {
        case 'draft':
          return false;  // draft 不返回（只返回给管理员）
        case 'suppressed':
          return options.includeSuppressed;
        case 'contested':
          // 返回 contested 记忆，但附带警告
          memory._contestedWarning = true;
          return true;
        case 'forgotten':
          return false;  // 永久删除，不可能存在
        default:
          return true;
      }
    });
  }
}
```

**版本规划**：v2.2（State Machine 核心）→ v2.4（副作用自动化）→ v2.6（状态历史追溯）

---

### 8.5.7 缺口七：Memory Exchange（记忆双向通道）

**问题**：当前只有 capture（写入）和 recall（读取），没有"记忆迁移"能力。无法从其他系统导入，无法导出到其他系统。

**具体表现**：
- 用户想从 Mem0/Obsidian 迁移到 hawk-bridge → 没有标准导入格式
- 企业审计需要"记忆库的完整快照" → 没有定时备份机制
- 跨 hawk-bridge 实例同步 → 没有标准增量同步协议

**架构设计**：

```typescript
/**
 * Memory Exchange — 记忆的导入/导出/同步
 * 支持多种格式和双向同步
 */
interface MemoryExchange {
  // 导出
  export(options: ExportOptions): Promise<ExportResult>;

  // 导入
  import(items: ImportItem[], options: ImportOptions): Promise<ImportReport>;

  // 增量同步（跨实例或跨设备）
  deltaExport(since: number): Promise<SyncDelta>;
  deltaImport(delta: SyncDelta): Promise<ImportReport>;

  // 格式检测
  detectFormat(content: string): ExportFormat;
}

// 导出格式
type ExportFormat = 'jsonl' | 'markdown' | 'obsidian' | 'csv' | 'notion' | 'mem0';

/** 导出选项 */
interface ExportOptions {
  format: ExportFormat;
  scope: 'all' | 'byTopic' | 'byDateRange' | 'byScope';
  includeMetadata: boolean;    // 包含 category / importance / timestamps
  includeVectors: boolean;      // 包含向量（占空间，仅同版本迁移需要）
  includeRelations: boolean;   // 包含关系图数据
  filter?: {
    topic?: string;
    since?: number;
    until?: number;
    scope?: 'personal' | 'team' | 'project';
    state?: MemoryState;
  };
}

/** 导出结果 */
interface ExportResult {
  format: ExportFormat;
  totalItems: number;
  totalSize: number;
  downloadUrl?: string;         // 如果太大，提供下载链接
  checksum: string;             // SHA-256，用于校验
  exportedAt: number;
}

/** JSONL 导出格式（标准格式） */
interface MemoryExportItem {
  // 核心内容
  text: string;
  category: 'fact' | 'preference' | 'decision' | 'entity' | 'other';
  name: string;
  description: string;

  // 语义组织
  topic?: string;               // 主题分类
  entities?: string[];          // 关联实体
  persons?: string[];           // 关联人

  // 重要性
  importance: number;

  // 时间
  created_at: string;           // ISO 8601
  occurred_at?: string;        // 事件发生时间
  expires_at?: string;          // 过期时间

  // 来源
  source: string;
  source_type: 'text' | 'audio' | 'video';
  session_id?: string;
  platform?: string;

  // 关系
  relations?: Array<{
    type: 'depends_on' | 'contradicts' | 'contains' | 'related_to' | 'supersedes';
    target_text: string;       // 用文本而非 ID，便于跨系统迁移
  }>;

  // 生命周期
  lifecycle_state: MemoryState;

  // 向量（仅同版本迁移）
  vector?: number[];
}

/** 导入选项 */
interface ImportOptions {
  format: ExportFormat;
  deduplicate: boolean;         // 基于 text_hash 去重
  mergeRelations: boolean;      // 重建关系（需要 LLM 分析）
  assignToTopic: boolean;       // 自动归类（需要 LLM 分析）
  conflictResolution: 'skip' | 'overwrite' | 'keep_both';
  dryRun: boolean;              // 试运行，不实际写入
}

/** 导入报告 */
interface ImportReport {
  total: number;
  imported: number;
  skipped: number;
  duplicates: number;
  errors: Array<{ item: string; error: string }>;
  relationsRestored: number;
  topicsAssigned: number;
  duration: number;             // 耗时 ms
}

/**
 * Obsidian 格式兼容
 */
class ObsidianExporter implements MemoryExchange {
  async export(options: ExportOptions): Promise<ExportResult> {
    const memories = await this.fetchMemories(options.filter);

    // 转换为 Obsidian 的 Markdown 格式
    const files = memories.map(m => ({
      path: `${m.topic || 'Uncategorized'}/${m.name}.md`,
      content: this.toObsidianMarkdown(m),
    }));

    return {
      format: 'obsidian',
      totalItems: files.length,
      totalSize: files.reduce((sum, f) => sum + f.content.length, 0),
      downloadUrl: await this.createZip(files),
      checksum: await this.sha256(files),
      exportedAt: Date.now(),
    };
  }

  private toObsidianMarkdown(m: MemoryExportItem): string {
    return `---
uid: ${generateUid()}
tags: [${m.topic || 'uncategorized'}]
created: ${m.created_at}
category: ${m.category}
importance: ${m.importance}
source: ${m.source}
---

# ${m.name}

${m.description}

## 记忆内容

${m.text}

${m.relations?.length ? `## 关联\n${m.relations.map(r => `- [[${r.target_text}]]`).join('\n')}` : ''}
`;
  }
}

/**
 * Mem0 格式兼容（JSONL）
 */
class Mem0Exporter implements MemoryExchange {
  // Mem0 使用 JSONL 格式，每行一个 memory 对象
  async export(options: ExportOptions): Promise<ExportResult> {
    const memories = await this.fetchMemories(options.filter);

    const lines = memories.map(m => JSON.stringify({
      role: "user",
      content: m.text,
      metadata: {
        category: m.category,
        importance: m.importance,
        created_at: m.created_at,
      },
    }));

    return {
      format: 'mem0',
      totalItems: lines.length,
      totalSize: lines.join('\n').length,
      downloadUrl: await this.saveAsFile(lines.join('\n'), 'memories.jsonl'),
      checksum: await this.sha256(lines.join('\n')),
      exportedAt: Date.now(),
    };
  }
}

/**
 * 定时备份任务
 */
class ScheduledBackup {
  // 每日凌晨 3 点执行备份
  @Cron('0 3 * * *')
  async dailyBackup(): Promise<void> {
    const yesterday = Date.now() - 86400000;

    const delta = await this.exchange.deltaExport(yesterday);

    await this.uploadToS3(delta, {
      destination: `backups/hawk-bridge/${formatDate(Date.now())}/`,
      retentionDays: 90,
    });

    await this.notify('Backup completed', {
      items: delta.items.length,
      size: delta.totalSize,
    });
  }
}
```

**为什么是根本性缺口**：一个"行业顶级"的记忆组件必须有开放的数据通道。导入/导出能力直接影响用户黏性和数据可移植性，也为企业级部署提供必需的审计和迁移能力。

**版本规划**：v2.2（JSONL 导入/导出）→ v2.4（Obsidian/Mem0 兼容）→ v2.6（增量同步协议）

---

### 7 个架构缺口汇总

| 缺口 | 定位 | 核心价值 | 版本规划 |
|------|------|---------|---------|
| **Semantic Index** | 语义组织层 | 按主题/实体/人查询，不经过向量 | v2.3 → v2.8 |
| **Working Memory** | 工作记忆组件 | 多轮对话上下文缓存，零向量搜索 | v2.2 → v2.6 |
| **Memory Compiler** | 记忆编译器 | recall 返回答案而非列表 | v2.3 → v2.7 |
| **Adaptive Decay** | 自适应衰减 | 基于访问模式智能 decay | v2.3 → v2.8 |
| **Recall Suppression** | 召回抑制机制 | 多 Agent 细粒度可见性控制 | v2.2 → v2.6 |
| **Lifecycle State Machine** | 生命周期状态机 | 完整状态定义和转换规则 | v2.2 → v2.6 |
| **Memory Exchange** | 双向数据通道 | 导入/导出/增量同步 | v2.2 → v2.6 |

---

## 8.6 五个根本性盲区（范式层面的假设缺陷）

> 即使 59 项 TODO 全实现 + 7 大架构缺口全补上，hawk-bridge 仍然只是做了一个「更高级的文本向量检索系统」，而不是「真正理解记忆是什么的记忆系统」。
> 这 5 个盲区不属于「功能」或「架构」范畴，而是**根本性假设的限制**。

### 8.6.1 盲区一：记忆的定义仍是「文本块」

**问题**：整个系统建立在 `Memory { id, text, vector, category, metadata }` 的隐喻上，但没有回答：这条记忆**对 agent 意味着什么**？

```
当前范式：
用户说「API 设计有问题」 → Memory(text="API 设计有问题")

但没有区分：
- 这是「事实」（观察）还是「判断」（观点）？
- 这是「过去发生的事」还是「对未来行动的期望」？
- agent 应该「记住」还是「参考」还是「警惕」这条记忆？
```

**根本缺陷**：即使 59 项全实现，系统仍然只存储「文本片段」，无法让 agent 理解「这条记忆在当前任务中的角色」。

**架构设计**：

```typescript
/**
 * Memory 的完整语义抽象
 * 四平面模型 — 超越当前的 text + vector 范式
 */
interface SemanticMemory {
  id: string;

  // 内容平面（当前实现只到这个层面）
  contentPlane: {
    text: string;           // 原始文本
    summary?: string;        // 摘要（LLM 生成）
    entities: string[];     // 提及的实体
  };

  // 语义类型平面 — 这条记忆的认知角色
  semanticType: {
    // 不是 category: fact/preference/decision（太粗糙）
    // 而是：这条记忆在 agent 认知中的角色
    role: 'observation' | 'belief' | 'preference' | 'goal' | 'constraint' | 'rule' | 'exception';
    // 例：「API 设计有问题」→ role: 'belief' (用户的判断)
    // 例：「用户偏好 REST」→ role: 'preference'
    // 例：「不能破坏现有功能」→ role: 'constraint'
  };

  // 置信平面 — 这条记忆的可信度
  confidencePlane: {
    basis: 'direct_experience' | 'hearsay' | 'inference' | 'assumption' | 'explicit_instruction';
    // 区分：亲眼所见 vs 听说 vs 推断 vs 猜测 vs 明确指令
    confidenceLevel: 'high' | 'medium' | 'low' | 'unknown';
    contested: boolean;      // 是否有矛盾证据
    lastValidated?: number;  // 最后一次被验证的时间
  };

  // 意图平面 — 为什么存这条记忆
  intentPlane: {
    purpose: 'grounding' | 'constraint' | 'goal' | 'context' | 'preference' | 'warning';
    // grounding：给后续对话提供上下文
    // constraint：限制后续行动
    // goal：描述期望的目标状态
    // warning：提醒警惕某种情况
    goalId?: string;          // 如果是 goal 相关
    constraintId?: string;    // 如果是 constraint 相关
  };

  // 关联平面 — 这条记忆和 agent 认知体系的关系
  relevancePlane: {
    relatedGoals: string[];      // 和哪些目标相关
    requiredForTasks: string[];  // 哪些任务必须这条记忆
    contradictsWith: string[];   // 和哪些记忆/信念矛盾
    supersedes: string[];        // 这条记忆取代了哪些旧记忆
    derivedFrom: string[];       // 这条记忆是从哪些记忆推断出来的
  };
}

/**
 * Semantic Type 推断器
 * 在 Capture 时自动推断 semanticType
 */
class SemanticTypeDetector {
  async detect(text: string, context: CaptureContext): Promise<SemanticType> {
    const prompt = `
判断这条记忆的语义类型：

文本：${text}
上下文：${context.recentConversation}

类型定义：
- observation：客观观察或事实（"API 用了 REST"）
- belief：主观判断或观点（"API 设计有问题"）
- preference：用户偏好（"用户喜欢简洁代码"）
- goal：期望目标（"要实现 SSO"）
- constraint：限制条件（"不能破坏现有功能"）
- rule：规则规范（"所有 API 必须有文档"）
- exception：例外情况（"除了认证端点"）

输出：{ "role": "...", "confidence": "...", "reasoning": "..." }
`;
    return this.llm.complete(prompt);
  }
}
```

**为什么是根本盲区**：没有「语义类型平面」和「意图平面」，recall 只能返回「相关文本」，无法返回「对当前任务有意义的认知单元」。

**版本规划**：v3.0（语义类型推断）→ v3.1（置信平面）→ v3.2（意图平面）

---

### 8.6.2 盲区二：记忆是「存储单位」而非「学习单位」

**问题**：系统存储「过去说过的话」，而不是「从过去中学到的东西」。

```
当前范式：
用户说「API 要改成 REST」 → Memory(text="API 要改成 REST")

真正有价值的学习：
用户说「API 要改成 REST」
  → 提取为可执行知识：
    「未来 API 设计应优先考虑维护成本」
    「GraphQL 复杂度 > 长期收益时应考虑简化」
  → 记忆不是「改 REST」，而是「做架构决策时要评估长期维护成本」
```

**根本缺陷**：系统存储「X」，但不存储「从 X 学到的 Y」。下次遇到类似场景，agent 还是要从原始记忆重新推理。

**架构设计**：

```typescript
/**
 * Learning Unit — 从记忆中学到的抽象知识
 * 和原始记忆不同，Learning Unit 是跨场景可复用的知识
 */
interface LearningUnit {
  id: string;

  // 原始记忆来源
  sourceMemoryIds: string[];

  // 抽象后的知识（可跨场景复用）
  abstraction: {
    whatHappened: string;        // 原始事件：「API 从 GraphQL 改为 REST」
    whatWasLearned: string;      // 学到的：「架构决策应评估长期维护成本」
    whyItMatters: string;       // 为什么重要：「避免过度设计」
    applicableContext: string;   // 适用场景：「评估技术选型时」
  };

  // 知识的可复用性追踪
  reusability: {
    timesApplied: number;        // 被应用次数
    successRate: number;         // 应用成功率
    generalizationLevel: 'specific' | 'pattern' | 'principle';
    // specific：只在原始场景有用
    // pattern：可以应用到同类场景
    // principle：可以形成通用原则
  };

  // 和 Skills 的关系
  relatedSkills: string[];        // 这个知识被哪个 Skill 使用
  skillCreationCandidate: boolean; // 是否应该创建为 Skill

  // 知识的生命周期
  lifecycle: {
    createdAt: number;
    lastApplied: number;
    applicabilityScore: number;  // 随着成功应用次数增加而提升
  };
}

/**
 * Learning Extractor — 从记忆中自动提取 Learning Unit
 * 在 Capture 时并行执行，存储为独立的知识单元
 */
class LearningExtractor {
  async extract(memories: Memory[]): Promise<LearningUnit[]> {
    const prompt = `
从以下记忆序列中，提取可复用的知识：

记忆序列：
${memories.map((m, i) => `${i + 1}. [${m.semanticType?.role}] ${m.contentPlane.text}`).join('\n')}

请分析：
1. 这些记忆之间有什么因果/演变关系？
2. 可以抽象出什么跨场景可复用的知识？
3. 这个知识属于哪个层次（specific / pattern / principle）？

输出格式：
{
  "learnings": [
    {
      "whatWasLearned": "...",
      "whyItMatters": "...",
      "applicableContext": "...",
      "generalizationLevel": "..."
    }
  ]
}
`;
    return this.llm.complete(prompt);
  }

  // 判断是否应该创建为 Skill
  async shouldCreateSkill(learning: LearningUnit): Promise<boolean> {
    return (
      learning.reusability.timesApplied >= 3 &&
      learning.reusability.generalizationLevel === 'principle' &&
      learning.lifecycle.applicabilityScore > 0.8
    );
  }
}

/**
 * Learning Memory 存储
 * Learning Unit 存储在独立表中，和原始 Memory 分开索引
 */
interface LearningStore {
  learnings: LearningUnit[];

  // recall learnings（不经过向量）
  recallByPrinciple(principle: string): LearningUnit[];
  recallByContext(context: string): LearningUnit[];

  // 应用 learnings 到当前任务
  applyToTask(taskId: string, context: string): AppliedLearning[];
}
```

**为什么是根本盲区**：没有 Learning Unit，记忆库只是「历史对话存档」而不是「agent 的知识体系」。skill auto-creation (#38) 和记忆进化真正需要的是 Learning Unit。

**版本规划**：v3.1（Learning Unit 核心）→ v3.2（自动提取）→ v3.3（Skill 联动）

---

### 8.6.3 盲区三：recall 是「query 驱动」而非「任务目标驱动」

**问题**：recall 不知道 agent 要干什么，只能返回「和 query 相关的文本」。

```
当前 recall 流程：
1. Agent: "用户问了 X"
2. hawk-bridge: "返回和 X 最相关的 N 条记忆"
3. Agent: "从 N 条记忆中选择使用哪些"

理想 recall 流程：
1. Agent: "我要完成目标 Y，当前任务状态是 Z"
2. hawk-bridge: "基于 Y 和 Z，返回：
   - 必须知道的信息（缺失会导致任务失败）
   - 可能相关的信息（可能有帮助）
   - 需要警惕的信息（可能和 Y 矛盾）"
```

**根本缺陷**：recall 缺少「任务上下文」，agent 拿到的是「相关记忆列表」而不是「完成任务的记忆指南」。

**架构设计**：

```typescript
/**
 * Task Context — 当前任务上下文
 * Agent 在 recall 时传递，hawk-bridge 据此决定返回什么
 */
interface TaskContext {
  taskId: string;
  taskGoal: string;              // "完成 API 重构"
  currentState: 'planning' | 'implementing' | 'reviewing' | 'testing';
  relevantEntities: string[];     // "hawk-memory-api", "user:qilin"
  constraints: string[];          // "不能破坏现有功能"
  recentActions: string[];        // "刚完成了数据库 schema 设计"
  anticipatedChallenges: string[]; // "担心认证兼容性问题"
}

/**
 * Task-Aware Recall — 不是「找相关的」，而是「找完成当前任务需要的」
 */
interface TaskAwareRecall {
  recallWithContext(
    query: string,
    taskContext: TaskContext,
    options: RecallOptions
  ): Promise<TaskAwareRecallResult>;
}

interface TaskAwareRecallResult {
  // 必须知道的（缺失会导致任务失败）
  mustKnow: MemoryWithRationale[];

  // 可能有用（开阔思路）
  mightBeHelpful: MemoryWithRationale[];

  // 需要警惕（和当前目标可能矛盾）
  cautionNeeded: MemoryWithRationale[];

  // 知识缺口（任务需要但记忆库没有的）
  knowledgeGaps: string[];

  // 行动建议（基于历史记忆）
  suggestedActions: string[];
}

/**
 * MemoryWithRationale — 记忆 + 召回理由
 * 让 agent 知道为什么这条记忆被召回
 */
interface MemoryWithRationale {
  memory: MemoryEntry;
  recallRationale: string;
  // "这条被召回是因为：你刚提到担心认证兼容性问题，
  // 而这条记忆记录了上次认证重试的实现方案"
  relevanceScore: number;
  urgencyLevel: 'critical' | 'important' | 'background';

  // 额外维度（Task-Aware 新增）
  taskAlignment: 'required' | 'helpful' | 'conflicting';
  conflictNote?: string;  // 如果是 conflicting，说明冲突点
}

/**
 * Task-Aware Recall Pipeline
 */
class TaskAwareRecallPipeline {
  async recallWithContext(
    query: string,
    taskContext: TaskContext,
    options: RecallOptions
  ): Promise<TaskAwareRecallResult> {
    // Step 1: 传统向量召回
    const rawResults = await this.vectorRecall(query, options);

    // Step 2: 任务上下文增强
    const taskEnhanced = await this.enhanceWithTaskContext(rawResults, taskContext);

    // Step 3: 分类
    const mustKnow = taskEnhanced.filter(m => m.taskAlignment === 'required');
    const mightBeHelpful = taskEnhanced.filter(m => m.taskAlignment === 'helpful');
    const cautionNeeded = taskEnhanced.filter(m => m.taskAlignment === 'conflicting');

    // Step 4: 知识缺口检测
    const knowledgeGaps = await this.detectKnowledgeGaps(taskContext, rawResults);

    // Step 5: 行动建议生成
    const suggestedActions = await this.generateActionHints(taskContext, rawResults);

    return { mustKnow, mightBeHelpful, cautionNeeded, knowledgeGaps, suggestedActions };
  }

  private async enhanceWithTaskContext(
    memories: MemoryEntry[],
    taskContext: TaskContext
  ): Promise<MemoryWithRationale[]> {
    const prompt = `
任务目标：${taskContext.taskGoal}
当前状态：${taskContext.currentState}
约束条件：${taskContext.constraints.join(', ')}

记忆列表：
${memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n')}

请判断每条记忆对这个任务的作用：
- required：如果缺失这条记忆，任务很可能失败
- helpful：对任务有正面帮助
- conflicting：和任务目标或约束矛盾

对于每条记忆，说明：
1. 为什么这条记忆对当前任务重要或矛盾
2. 如何利用或应对这条记忆

输出格式：
{
  "assessments": [
    { "index": 1, "alignment": "required|helpful|conflicting", "rationale": "...", "actionHint": "..." }
  ]
}
`;
    return this.llm.complete(prompt);
  }
}
```

**为什么是根本盲区**：没有 Task Context，recall 永远是「大海捞针」而不是「精准供给」。agent 无法区分「这条记忆对当前任务至关重要」和「这条记忆只是有点相关」。

**版本规划**：v3.2（Task Context 核心）→ v3.3（知识缺口检测）→ v3.4（行动建议生成）

---

### 8.6.4 盲区四：「遗忘」的逻辑仍是「删除」而非「替代」

**问题**：真实的遗忘不是「删除」，而是「被新的理解覆盖整合」。

```
真实的人类遗忘：
「我以前觉得 X 是对的」→「我现在认为 X 需要修正」
→ 两者都存在，只是新的更突出

当前 hawk-bridge 遗忘：
access_count 低了 → archive → 删除
旧记忆彻底消失，没有「更新后的理解」这个概念
```

**根本缺陷**：没有「记忆更新」的语义。用户纠正一条记忆时，系统只是标记 ignored/suppressed，但没有「生成新的正确理解」。

**架构设计**：

```typescript
/**
 * Memory Reconciliation — 记忆调和
 * 当新记忆和旧记忆冲突时，如何处理
 */
interface MemoryReconciliation {
  detectConflict(newMemory: Memory, existingMemories: Memory[]): ConflictGroup | null;
  resolveConflict(conflict: ConflictGroup): ReconciliationResult;
}

/**
 * 冲突组 — 描述新旧记忆之间的冲突关系
 */
interface ConflictGroup {
  rootMemoryId: string;
  newMemoryId: string;
  conflictType: 'correction' | 'update' | 'contradiction' | 'refinement';

  oldClaim: string;
  newClaim: string;

  temporalOrder: 'new_supersedes_old' | 'old_still_valid' | 'both_valid_in_context';
}

/**
 * 解决结果
 */
interface ReconciliationResult {
  resolution: 'merged' | 'superseded' | 'coexist' | 'needs_human_review';

  // merged：生成新的综合记忆
  mergedMemory?: Memory;

  // superseded：标记旧记忆为历史版本
  historicalMemory?: {
    memoryId: string;
    supersededBy: string;
    supersessionReason: string;
  };

  // coexist：两者都保留，标记为 contested
  coexistingMemories?: Memory[];

  suggestedAction?: string;
}

/**
 * Memory Reconciler — 替代当前的 ignore/suppress 机制
 */
class MemoryReconciler {
  // 用户说「不对，应该是 Y」
  async reconcile(
    memoryId: string,
    correction: string,
    reason: string
  ): Promise<ReconciliationResult> {
    const existing = await this.memoryStore.get(memoryId);
    const conflict = this.detectConflict(
      Memory.createFromText(correction),
      [existing]
    );

    if (!conflict) {
      // 没有冲突，直接更新
      await this.memoryStore.update(memoryId, correction);
      return { resolution: 'merged' };
    }

    return this.resolveConflict(conflict);
  }

  private resolveConflict(conflict: ConflictGroup): ReconciliationResult {
    switch (conflict.conflictType) {
      case 'correction':
        // 用户明确纠正 → 新记忆取代旧记忆
        return {
          resolution: 'superseded',
          historicalMemory: {
            memoryId: conflict.rootMemoryId,
            supersededBy: conflict.newMemoryId,
            supersessionReason: `用户纠正：${conflict.newClaim}`,
          },
        };

      case 'refinement':
        // 用户细化理解 → 合并两者
        return {
          resolution: 'merged',
          mergedMemory: Memory.merge(conflict.rootMemoryId, conflict.newMemoryId),
        };

      case 'contradiction':
        // 用户说和原来矛盾 → 都需要保留，标记为 contested
        return {
          resolution: 'coexist',
          coexistingMemories: [conflict.rootMemoryId, conflict.newMemoryId].map(
            id => this.memoryStore.get(id)
          ),
        };

      default:
        return { resolution: 'needs_human_review' };
    }
  }
}

/**
 * Deprecation — 替代「删除」的语义
 * 用户「改主意了」→ 记录为「已放弃的意图」，不删除
 */
interface MemoryDeprecation {
  // 标记为已放弃的意图
  deprecate(
    memoryId: string,
    reason: string,      // "用户改主意了"
    supersededBy?: string  // 新意图是什么
  ): Promise<void>;

  // 获取「已放弃的意图」历史
  getDeprecated(memoryId: string): DeprecatedMemory[];
}

/**
 * Deprecated Memory — 被放弃的意图/决策
 * 不是删除，而是记录为「曾经考虑过但已放弃」
 */
interface DeprecatedMemory {
  memoryId: string;
  deprecatedAt: number;
  deprecatedReason: string;
  supersededBy?: string;   // 被什么替代
  deprecatedBy: 'user' | 'agent' | 'system';
}
```

**为什么是根本盲区**：没有 Reconciliation，「纠正」只是「标记旧的是错的」而不是「生成新的对的理解」。contested 记忆会不断累积，却没有真正被解决。

**版本规划**：v3.2（Reconciliation 核心）→ v3.3（Deprecation 语义）→ v3.4（自动合并）

---

### 8.6.5 盲区五：系统没有「自我监控」的记忆

**问题**：hawk-bridge 监控的是「记忆的使用情况」（access_count, recall latency），但没有监控「系统自身的认知状态」。

```
当前监控：
- 这条记忆被访问了多少次？
- 召回延迟是多少毫秒？

真正需要的监控：
- agent 最近决策失误了多少次？是否和某个记忆误导有关？
- 哪些类型的记忆最容易在 recall 时被忽略？
- 记忆库是否在某个主题上存在系统性盲区？
```

**根本缺陷**：hawk-bridge 对「自己的记忆质量」一无所知。即使实现了 #56（Recall Quality Feedback）和 #57（Memory ROI），那也只是「单条记忆的价值评估」，不是「系统整体认知状态的监控」。

**架构设计**：

```typescript
/**
 * Self-Awareness Memory — 系统的自我监控记忆
 * 不是关于用户的记忆，而是关于系统自身运作状况的知识
 */
interface SystemSelfAwareness {
  // 系统对自身状态的感知
  systemSelfMemory: SystemSelfKnowledge[];

  // 记忆库的「健康状态」
  memoryHealth: {
    blindSpots: string[];           // 系统性盲区
    noiseAccumulation: number;       // 噪音积累程度
    fragmentationScore: number;     // 记忆碎片化程度
    stalenessRate: number;         // 记忆老化速率
  };

  // agent 行为的「系统记忆」
  agentBehaviorPattern: {
    frequentlyOverlookedMemoryTypes: string[];  // 哪些类型的记忆容易被忽略
    repeatedMistakes: string[];                // 反复出现的决策错误
    successfulStrategies: string[];           // 反复成功的策略
    confidenceCalibration: 'overconfident' | 'underconfident' | 'calibrated';
  };

  // 任务完成率的系统级分析
  taskCompletionAnalysis: {
    overallSuccessRate: number;
    failureModes: Array<{
      pattern: string;
      frequency: number;
      likelyCause: string;
    }>;
  };
}

/**
 * 系统自我知识 — 区别于用户记忆的系统自身认知
 */
interface SystemSelfKnowledge {
  id: string;
  category: 'system_bias' | 'agent_pattern' | 'memory_gap' | 'success_pattern';

  discoveredAt: number;
  discoveryMethod: 'analysis' | 'feedback' | 'explicit_report';

  content: string;

  confidence: number;  // 这个系统自我知识的置信度

  actionTaken: boolean;
  actionDescription?: string;
}

/**
 * Self-Awareness Analyzer — 定期分析系统自身状态
 * 类似于 soul-force 的巡检，但针对的是系统自身
 */
class SelfAwarenessAnalyzer {
  // 每日巡检：系统对自身的认知状态
  @Cron('0 2 * * *')  // 每天凌晨 2 点
  async runSelfDiagnosis(): Promise<SystemSelfAwareness> {
    // 分析失败模式
    const failurePatterns = await this.analyzeRecentFailures();

    // 分析记忆盲区
    const blindSpots = await this.detectBlindSpots();

    // 分析 agent 行为模式
    const agentPatterns = await this.analyzeAgentBehavior();

    // 综合评估
    const diagnosis = {
      systemSelfMemory: await this.consolidateSystemKnowledge(
        failurePatterns,
        blindSpots,
        agentPatterns
      ),
      memoryHealth: this.computeMemoryHealth(blindSpots, failurePatterns),
      agentBehaviorPattern: agentPatterns,
      taskCompletionAnalysis: this.analyzeTaskCompletion(failurePatterns),
    };

    // 存储系统自我知识
    await this.storeSelfKnowledge(diagnosis);

    // 如果发现问题 → 触发行动
    await this.handleSelfDiagnosis(diagnosis);

    return diagnosis;
  }

  private async detectBlindSpots(): Promise<BlindSpot[]> {
    // 分析：哪些类型的任务持续失败？
    // 分析：哪些记忆从未被成功应用？
    // 分析：哪些知识缺口反复出现？

    const prompt = `
分析最近的失败案例，识别系统性盲区：

失败案例：
${this.failureCases.map((c, i) => `${i + 1}. 任务：${c.task}，失败原因：${c.reason}`).join('\n')}

请识别：
1. 是否有某种类型的任务反复失败？（模式）
2. 是否有某种信息反复缺失导致失败？（盲区）
3. 是否有某种类型的记忆最容易被忽略？（选择性盲区）

输出：
{
  "blindSpots": [
    { "type": "...", "description": "...", "evidence": [...] }
  ]
}
`;
    return this.llm.complete(prompt);
  }

  private async handleSelfDiagnosis(
    diagnosis: SystemSelfAwareness
  ): Promise<void> {
    // 盲区检测 → 建议补充相关记忆
    if (diagnosis.memoryHealth.blindSpots.length > 0) {
      await this.notify(
        `记忆库存在 ${diagnosis.memoryHealth.blindSpots.length} 个系统性盲区，` +
        `建议通过 auto-evolve 巡检补充相关上下文`
      );
    }

    // 反复失误检测 → 触发学习优化
    if (diagnosis.agentBehaviorPattern.repeatedMistakes.length > 0) {
      await this.createOptimizationTask(
        diagnosis.agentBehaviorPattern.repeatedMistakes
      );
    }

    // 置信度校准
    if (diagnosis.agentBehaviorPattern.confidenceCalibration !== 'calibrated') {
      await this.adjustConfidenceThreshold(
        diagnosis.agentBehaviorPattern.confidenceCalibration
      );
    }
  }
}

/**
 * Self-Knowledge Store — 系统自我知识的持久化
 * 和用户记忆分开存储
 */
interface SelfKnowledgeStore {
  // 存储系统自我知识
  store(knowledge: SystemSelfKnowledge): Promise<void>;

  // 查询相关自我知识
  recall(category: string): SystemSelfKnowledge[];

  // 更新置信度
  updateConfidence(knowledgeId: string, newConfidence: number): Promise<void>;
}
```

**为什么是根本盲区**：没有 Self-Awareness Memory，系统永远是「被动响应」而不是「主动反思」。hawk-bridge 不知道自己在哪个方面「不行」。

**版本规划**：v3.3（Self-Awareness 核心）→ v3.4（自动诊断）→ v3.5（自我优化联动）

---

### 5 个根本性盲区汇总

| 盲区 | 根因 | 影响 | 突破方向 |
|------|------|------|---------|
| **记忆定义仍是文本块** | 假设「记忆 = 文本 + 向量」 | recall 只能返回文本，无法理解记忆的认知角色 | 四平面模型（内容/语义/置信/意图） |
| **记忆是存储单位非学习单位** | 存储「说过的话」而非「学到的东西」 | 记忆库只是历史存档，无法形成知识体系 | Learning Unit + Skill 联动 |
| **recall 是 query 驱动非任务驱动** | 假设 recall = 「找相关的」 | agent 拿到相关列表而非任务指南 | Task Context + Task-Aware Recall |
| **遗忘是删除非替代** | 假设「旧的是错的，新的对」 | contested 记忆累积，没有真正解决 | Reconciliation + Deprecation 语义 |
| **系统没有自我监控** | 监控使用数据而非认知状态 | 系统不知道自己哪个方面「不行」 | Self-Awareness Memory + 系统巡检 |

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

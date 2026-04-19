# Hawk-Bridge v2.0 架构设计

> 基于 108 项功能 TODO 和 17 个系统级差距的全面架构升级
>
> 生成时间：2026-04-19 | 状态：概念设计，已评审

---

## 📋 目录

1. [务实摘要](#务实摘要)
2. [当前架构评估](#1-当前架构评估)
3. [目标架构](#2-目标架构)
4. [核心模块设计](#3-核心模块设计)
5. [存储层设计](#4-存储层设计)
6. [Pipeline 设计](#5-pipeline-设计)
7. [跨领域功能架构](#6-跨领域功能架构)
8. [实施路线图](#7-实施路线图)
9. [关键技术决策](#8-关键技术决策)
10. [架构缺口与未来方向](#9-架构缺口与未来方向)

---

## 务实摘要

### hawk-bridge 是什么

**L0 记忆层**：负责 Capture（从对话提取记忆）、Recall（召回相关记忆）、Distillation（Raw→Pattern→Principle→Skill 蒸馏）。

在 autoself 10 层架构中处于最底层，为上层（L3 巡检、L5 进化、L6 宪法编辑）提供原材料。

### 解决什么问题

| 层次 | 问题 | v2.0 解决方案 |
|------|------|--------------|
| **数据模型** | 单表 40+ 字段，增长不可持续 | Schema v2（4 表拆分） |
| **存储** | LanceDB 单一绑定，无法分层 | Storage Engine 抽象（热/冷/冰三层） |
| **调度** | capture/recall/decay 独立 hook，耦合严重 | Pipeline 统一调度 + Event Bus |
| **质量** | 无反馈闭环，记忆质量无法量化 | Recall Feedback + Self-Awareness |
| **遗忘** | 纯时间衰减，不考虑访问模式 | Adaptive Decay（访问模式驱动） |
| **一致性** | 同实体多版本，recall 返回旧版本 | Version Chain + supersedes 链 |
| **可观测** | 生命周期不可追溯 | MemoryTrace + Tracing 基础设施 |

### 诚实评价

> ⚠️ **务实提醒**：108 项 TODO 代表的是「我们想到了」，不是「我们做到了」。

| 维度 | 评分 | 说明 |
|------|------|------|
| **工程完整度** | ⭐⭐⭐⭐⭐ | 108 项涵盖所有已知需求 |
| **技术护城河** | ⭐⭐⭐ | #107/#108 是真壁垒，其他可复制 |
| **可落地性** | ⭐⭐ | 工程量巨大，优先级见仁见智 |
| **核心范式** | ⭐⭐⭐ | 仍是向量检索 + RAG++，无范式突破 |
| **最终潜力** | ⭐⭐⭐⭐ | LLM 团队配合 = 真正的 top tier |

### 七大架构缺口一览

即使 108 项全完成，以下缺口仍需持续迭代：

| 缺口 | 核心问题 | 版本规划 |
|------|---------|---------|
| **Semantic Index** | 只有向量检索，无法按「主题/实体/人」查询 | v2.3→v2.8 |
| **Working Memory** | 多轮对话没有上下文缓存，每次 recall 冷启动 | v2.2→v2.6 |
| **Memory Compiler** | recall 返回列表而非答案，LLM 需额外综合 | v2.3→v2.7 |
| **Adaptive Decay** | 纯时间衰减，不考虑访问模式 | v2.3→v2.8 |
| **Recall Suppression** | 只能全开/全关，无细粒度可见性控制 | v2.2→v2.6 |
| **Lifecycle State Machine** | 状态转换无约束，decay/verify/delete 逻辑耦合 | v2.2→v2.6 |
| **Memory Exchange** | 无导入/导出/增量同步能力 | v2.2→v2.6 |

### 五个根本性盲区（范式层面）

即使七大缺口全补上，仍是「更高级的向量检索系统」而非真正的记忆系统：

| 盲区 | 根因 | 突破方向 |
|------|------|---------|
| 记忆定义仍是文本块 | 假设「记忆 = 文本 + 向量」 | 四平面模型（v3.x，长期研究） |
| 记忆是存储单位非学习单位 | 存储「说过的话」而非「学到的东西」 | Learning Unit + Skill 联动 |
| recall 是 query 驱动非任务驱动 | 假设 recall = 「找相关的」 | Task Context + Task-Aware Recall |
| 遗忘是删除非替代 | 假设「旧的是错的，新的对」 | Reconciliation + Deprecation 语义 |
| 系统没有自我监控 | 监控使用数据而非认知状态 | Self-Awareness Memory + 系统巡检 |

### LLM 团队专属护城河（#107/#108）

竞品无法通过 API 复制，但需要 LLM 团队持续投入：

- **#107 记忆原生 Attention**：模型 weight 层面支持 importance/contested/freshness 加权
- **#108 专用小模型矩阵**：Consolidation-Mini / Quality-Score / ImportPredict / TimeReasoner / Distillation-Mini（比大模型便宜 100 倍）

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
│  ┌─────────────┐   ┌─────────────┐                        │
│  │  embeddings  │   │   metrics   │                        │
│  └─────────────┘   └─────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 当前优势

| 优势 | 说明 |
|------|------|
| 简单直接 | 单进程架构，所有逻辑在一个服务内 |
| 存储抽象 | `MemoryStore` 接口支持多 adapter |
| 向量+全文混合 | LanceDB 支持向量索引 + FTS |
| 成熟的 Hook 机制 | OpenClaw Gateway 集成完善 |

### 1.3 根本性局限

| 问题 | 影响 |
|------|------|
| **单表 schema** | MemoryEntry 已 40+ 字段，增长不可持续 |
| **存储引擎锁定** | LanceDB 是唯一的存储选择，无法切 MySQL/Pg |
| **无 Pipeline 抽象** | capture/recall/decay 是独立 hook，没有统一调度 |
| **无 Event Bus** | 子系统间通过直接调用耦合，无法异步 |
| **无跨语言支持** | Python LLM 提取是 subprocess，无法暴露内部 API |
| **无 Tracing 基础设施** | 每条记忆的生命周期不可追溯 |

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
  created_at: number;
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
  createMemory(core: MemoryCore): Promise<string>;
  getMemoryById(id: string): Promise<MemoryCore | null>;
  updateMemoryText(id: string, text: string): Promise<void>;

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
  findOrphanMemories(noAccessBefore: number): Promise<string[]>;
  softDelete(memoryId: string): Promise<void>;
  hardDelete(memoryId: string): Promise<void>;

  // ========== Query ==========
  vectorSearch(query: number[], topK: number, filter?: Filter): Promise<string[]>;
  ftsSearch(query: string, topK: number, filter?: Filter): Promise<string[]>;
  getMemoriesBySession(sessionId: string): Promise<string[]>;
  getMemoriesByScope(scope: string): Promise<string[]>;
}

/** 具体实现 */
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
  addEvent(memoryId: string, occurredAt: number, before: string[], after: string[]): void;
  queryBefore(memoryId: string): string[];
  queryAfter(memoryId: string): string[];
  queryByTimeRange(start: number, end: number): string[];
  detectCycle(memoryId: string): boolean;
}

// PostgreSQL 实现示例
const temporalQuery = `
  WITH RECURSIVE timeline AS (
    SELECT memory_id, occurred_at, ARRAY[memory_id] as path
    FROM memory_events
    WHERE memory_id = $1
    UNION ALL
    SELECT e.memory_id, e.occurred_at, t.path || e.memory_id
    FROM memory_events e
    JOIN timeline t ON e.event_before = t.memory_id
    WHERE NOT e.memory_id = ANY(t.path)
  )
  SELECT memory_id FROM timeline;
`;
```

### 4.3 版本链存储

```typescript
/**
 * 版本链 - 解决一致性漂移
 */
interface VersionChain {
  createVersion(supersedes: string, newText: string, reason: string): string;
  getCurrent(id: string): string;  // 沿着 superseded_by 链走到头
  getHistory(id: string): VersionEntry[];
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
│  ┌──────────────┐                                           │
│  │  Input       │  原始对话文本                             │
│  │  Normalizer  │  清理格式、规范化                         │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Segmenter   │  按语义分段（过滤噪音）                    │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  LLM         │  并行调用 LLM 提取                        │
│  │  Extractor   │  category / importance / description      │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Shelf Life  │  推断保鲜期类型                           │
│  │  Detector    │  permanent / session / project / ephem   │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Dedupe      │  SimHash 去重 + 版本链检查                │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Embedder    │  向量化（多 provider 支持）               │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Storage     │  写入 Storage Engine + trace              │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Recall Pipeline

```
User Query
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐                                           │
│  │  Query       │  解析 query，提取时间意图（"之前"/"之后"）│
│  │  Parser      │                                           │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Temporal    │  时序推理（如果 query 包含时序）           │
│  │  Reasoner    │                                           │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Embedder    │  向量化 query                             │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐   ┌──────────────┐                       │
│  │  Vector      │   │  FTS         │  并行执行              │
│  │  Search       │   │  Search      │                       │
│  └──────┬───────┘   └──────┬───────┘                       │
│         └──────────┬─────────┘                               │
│                    ▼                                         │
│  ┌──────────────┐                                           │
│  │  RRF         │  Reciprocal Rank Fusion                   │
│  │  Fusion      │  合并向量 + FTS 结果                       │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Contested   │  过滤 contested 记忆                      │
│  │  Filter      │                                           │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Version     │  确保返回最新版本                          │
│  │  Resolver    │  跟随 superseded_by 链                    │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Cross       │  Cross Encoder 重排                       │
│  │  Encoder     │  增加 relevance_breakdown                 │
│  │  Rerank      │                                           │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Result      │  返回结果 + recall_reason + trace         │
│  │  Builder     │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Decay Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐                                           │
│  │  Tier        │  重新计算 tier                            │
│  │  Maintenance │  permanent / stable / decay / archived    │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Decay      │  按 TTL + shelf_life 衰减                 │
│  │  Calculator │  permanent 不过期                         │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Orphan      │  识别零访问记忆                           │
│  │  Detector   │  30天零访问 → candidate                    │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Contested   │  contested 记忆降权                      │
│  │  Handler    │  3次否定 → quarantine                      │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Archive     │  移动到 Archive Tier                      │
│  │  Migrator   │  批量写入 S3                              │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │  Garbage    │  真正删除                                 │
│  │  Collector  │  Archive 后 90 天无访问 → 删除             │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 跨领域功能架构

### 6.1 记忆验证引擎

```typescript
/**
 * Verification Engine - 解决记忆验证问题
 */
interface VerificationEngine {
  type: 'file_exists' | 'code_grep' | 'api_check' | 'user_confirm';
  schedule(memoryId: string, type: string): void;
  cancel(memoryId: string): void;
  verify(memoryId: string): Promise<VerificationResult>;
}

interface VerificationResult {
  memory_id: string;
  verified: boolean;
  method: string;
  checked_at: number;
  details: Record<string, unknown>;
}

// 验证触发器
const verificationTriggers = {
  file_exists: (text: string) => extractFilePaths(text).length > 0,
  code_grep: (text: string) => /function|const|class|import/.test(text),
  api_check: (text: string) => /https?:\/\/|endpoint|api/.test(text),
};
```

### 6.2 多 Agent 隔离

```typescript
/**
 * Multi-Agent Memory Isolation
 */
interface AgentContext {
  agent_id: string;
  parent_id: string | null;
  isolation_level: 'shared' | 'semi-isolated' | 'fully-isolated';
  memory_scope: 'all' | 'team' | 'personal';
}

class AgentMemoryRouter {
  async recall(
    query: string,
    agentId: string,
    options?: RecallOptions
  ): Promise<RetrievedMemory[]> {
    const ctx = await this.getAgentContext(agentId);

    if (ctx.isolation_level === 'fully-isolated') {
      options = { ...options, scope: ctx.agent_id };
    } else if (ctx.isolation_level === 'semi-isolated') {
      const parentSummary = await this.getParentMemorySummary(ctx.parent_id);
    }

    return this.core.recall(query, options);
  }
}
```

### 6.3 自我认知系统

```typescript
/**
 * Self-Awareness - hawk-bridge 对自己的记忆质量进行评估
 */
interface SelfAwareness {
  // Capture 质量
  captureSuccessRate: number;
  captureNoiseRate: number;
  captureAvgImportance: number;
  captureContestRate: number;

  // Recall 质量
  recallHitRate: number;
  recallMissRate: number;
  recallSilenceRate: number;

  // 系统健康
  memoryGrowthRate: number;
  noiseRatio: number;
  orphanMemoryRate: number;
  contestedMemoryRate: number;

  // 衰减有效性
  decayEffectiveness: number;
  archiveHitRate: number;
}

class SelfAwarenessCollector {
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

### 6.4 商业化基础设施

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
  async checkQuota(tenantId: string, operation: 'capture' | 'recall'): Promise<boolean>;
  async consumeQuota(tenantId: string, operation: string, count: number): Promise<void>;
  async warnIfNearLimit(tenantId: string): Promise<void>;
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

> **架构原则**：简单场景零门槛，复杂场景可升级。

| 方案 | 优势 | 劣势 | 适用场景 |
|------|------|------|---------|
| **In-Memory + WAL**（默认） | 零依赖，clone 就能跑，延迟最低 | 单实例，断电丢少量事件（<1s），无法水平扩展 | v1.x 单实例 |
| **Redis Streams**（可选升级） | 持久化，消费者组，多实例消费，exactly-once | 需要额外部署 Redis | v2.x 多实例 |
| **Kafka** | 企业级，可靠性极高 | 过度工程，运维极复杂 | 超大规模（>1000 QPS） |

```typescript
/** EventBus 接口 — Local 和 Redis 共用同一接口 */
interface EventBus {
  publish(channel: string, event: MemoryEvent): Promise<void>;
  subscribe(group: string, consumer: string, handler: (event: MemoryEvent) => Promise<void>): Promise<void>;
  ack(channel: string, group: string, id: string): Promise<void>;
  close(): Promise<void>;
}

/** LocalEventBus — 默认实现（v1.x） */
class LocalEventBus implements EventBus {
  private queue: Map<string, MemoryEvent[]> = new Map();
  private handlers: Map<string, Set<(event: MemoryEvent) => Promise<void>>> = new Map();
  private walPath: string;

  constructor(walPath: string = './data/events.wal') {
    this.walPath = walPath;
    this.recoverFromWAL();
  }

  async publish(channel: string, event: MemoryEvent): Promise<void> {
    if (!this.queue.has(channel)) this.queue.set(channel, []);
    this.queue.get(channel)!.push(event);
    // 同步写 WAL
    fs.appendFileSync(this.walPath, JSON.stringify({ channel, event }) + '\n');
    // 触发 handlers
    const handlers = this.handlers.get(channel);
    if (handlers) await Promise.all([...handlers].map(h => h(event)));
  }
}

/** RedisStreamsBus — 可选升级（v2.x） */
class RedisStreamsBus implements EventBus {
  async subscribe(group: string, consumer: string, handler: (event: MemoryEvent) => Promise<void>): Promise<void> {
    // 持续消费 Redis Streams
    while (true) {
      const events = await this.redis.xreadgroup('GROUP', group, consumer, 'COUNT', 100, 'BLOCK', 1000, 'STREAMS', group, '>');
      for (const [stream, messages] of events) {
        for (const [id, fields] of messages) {
          const event = JSON.parse(fields[1]);
          await handler(event);
          await this.redis.xack(group, consumer, id);
        }
      }
    }
  }
}
```

### 8.3 向量 Embedding 抽象

```typescript
interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
  dimensions(): number;
  provider(): string;
}

class EmbedderFactory {
  static create(config: HawkConfig['embedding']): Embedder {
    switch (config.provider) {
      case 'openai': return new OpenAIEmbedder(config);
      case 'jina':   return new JinaEmbedder(config);
      case 'ollama': return new OllamaEmbedder(config);
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
  }

  // v2.0: 迁移数据（后台执行）
  async phase2(): Promise<void> {
    // 后台 job：读取 v1 数据 → 填充 shelf_life
  }

  // v2.5: 清理旧字段（可选）
  async phase3(): Promise<void> {
    // 删除不再使用的字段
  }
}
```

---

## 9. 架构缺口与未来方向

> 以下 7 大架构缺口、5 个根本性盲区、2 个 LLM 专属护城河，是 v2.x 之后需要持续迭代的方向。
> 其中 **#107/#108 需要 LLM 团队配合**，属于竞品无法复制的护城河。

### 9.1 七大架构缺口详解

#### 缺口一：Semantic Index（语义索引层）

**问题**：当前只有时间线索引，记忆之间是孤立的文本块。

```typescript
/**
 * 语义索引 — 三维语义组织（Topic × Entity × Person）
 */
interface SemanticIndex {
  topics: Map<string, TopicNode>;      // Topic Tree
  entities: Map<string, EntityProfile>; // Entity Profile
  persons: Map<string, PersonMemoryModel>; // Person Model

  indexMemory(memoryId: string, topic: string, entities: string[], persons: string[]): void;
  queryByTopic(topic: string, recursive?: boolean): string[];
  queryByEntity(entityId: string): string[];
  queryByPerson(personId: string): string[];
}

interface TopicNode {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
  memoryIds: string[];
  metadata: { totalMemories: number; stability: 'stable' | 'evolving' | 'volatile'; };
}

interface EntityProfile {
  id: string;
  type: 'project' | 'file' | 'system' | 'person' | 'api' | 'concept';
  name: string;
  description: string;
  relatedMemories: string[];
  currentState: string;
}
```

**版本规划**：v2.3（基础语义索引）→ v2.5（Entity Profile 自动抽取）→ v2.8（Topic Tree 自动构建）

#### 缺口二：Working Memory（工作记忆组件）

**问题**：当前只有 LTM（Long-Term Memory），没有 Working Memory。Agent 每次对话都要重新 recall。

```typescript
/**
 * Working Memory — 当前会话的工作记忆池（7±2 槽位）
 */
interface WorkingMemory {
  sessionId: string;
  activeSlots: Array<WorkingSlot | null>;  // 最多 7 个槽位
  contextStack: string[];  // ["API 设计", "REST 方案", "认证方式"]

  promote(memory: MemoryEntry): void;
  demote(memoryId: string): void;
  consolidate(): ConsolidatedMemory[];
  getActive(): MemoryEntry[];
}

interface WorkingSlot {
  memoryId: string;
  enteredAt: number;
  relevanceScore: number;
  consolidatedFrom: string[];
}

class WorkingMemoryManager {
  getOrCreate(sessionId: string): WorkingMemory;
  沉淀ToLTM(memoryId: string): Promise<void>;  // 多次访问 → 自动写入 LTM
  preload(sessionId: string, context: string): Promise<void>;  // session 启动时预加载
}
```

**版本规划**：v2.2（基础 Working Memory）→ v2.4（自动沉淀机制）→ v2.6（LTM ↔ WM 双向同步）

#### 缺口三：Memory Compiler（记忆编译器）

**问题**：recall 返回的是「历史记忆列表」，不是「当前需要的最优答案」。

```typescript
/**
 * Memory Compiler — 将多条相关记忆编译为单一答案
 */
interface MemoryCompiler {
  compile(memories: RetrievedMemory[], query: string): CompiledOutput;
}

interface CompiledOutput {
  primary: string;  // 编译后的答案
  compileType: 'merged' | 'conflict' | 'timeline' | 'summary' | 'single';
  sources: Array<{ memoryId: string; text: string; relevance: number; }>;
  supplementary?: {
    relatedDecisions: string[];
    actionHints: string[];
    warnings: string[];
  };
  recallReason: string;
}
```

**版本规划**：v2.3（基础 Compiler）→ v2.5（冲突检测+时间折叠）→ v2.7（行动建议生成）

#### 缺口四：Adaptive Decay（自适应衰减）

**问题**：当前 decay 是纯时间触发的，没有考虑访问模式。

```typescript
interface DecayConfig {
  decayRate: number;   // 每天衰减百分比
  ttlDays: number;     // 0=永不过期
  mode: 'stable' | 'gradual' | 'accelerated' | 'candidate' | 'protected';
  nextReviewAt: number;
}

interface AccessPattern {
  type: 'stable' | 'declining' | 'zero' | 'single' | 'burst';
  totalAccesses: number;
  recentTrend: number;  // -1 到 1
  suggestedDecayRate: number;
  suggestedTTL: number;
}
```

**版本规划**：v2.3（Adaptive Decay 核心）→ v2.5（趋势预测）→ v2.8（RL-based 衰减参数调优）

#### 缺口五：Recall Suppression（召回抑制机制）

**问题**：只能全开/全关，无细粒度可见性控制。

```typescript
interface RecallSuppression {
  suppressTemporarily(memoryId: string, sessionId: string, reason: string, expiresAt?: number): Promise<void>;
  suppressForAgent(memoryId: string, agentId: string, reason: string): Promise<void>;
  isSuppressed(memoryId: string, sessionId: string, agentId: string): Promise<SuppressionRecord | null>;
  unsuppress(memoryId: string, level: string, targetId: string): Promise<void>;
}

interface SuppressionRecord {
  memoryId: string;
  level: 'agent' | 'session' | 'global';
  targetId: string;
  reason: string;
  suppressedAt: number;
  expiresAt: number | null;
}
```

**版本规划**：v2.2（基础 Suppression）→ v2.4（自动触发器）→ v2.6（分层抑制策略）

#### 缺口六：Memory Lifecycle State Machine

**问题**：状态转换无约束，decay/verify/delete 逻辑耦合。

```typescript
type MemoryState = 'draft' | 'candidate' | 'active' | 'stable' | 'contested' | 'suppressed' | 'drifting' | 'archived' | 'forgotten';

type LifecycleEvent = 'submit' | 'approve' | 'reject' | 'verify' | 'contest' | 'correct' | 'suppress' | 'unsuppress' | 'drift_detected' | 'archive' | 'restore' | 'forget';

const STATE_TRANSITIONS: Record<MemoryState, Record<LifecycleEvent, MemoryState | null>> = {
  'draft':        { 'approve': 'active', 'reject': 'forgotten' },
  'candidate':    { 'verify': 'active', 'contest': 'contested', 'reject': 'forgotten' },
  'active':       { 'verify': 'stable', 'contest': 'contested', 'suppress': 'suppressed', 'drift_detected': 'drifting', 'archive': 'archived' },
  'stable':       { 'contest': 'contested', 'suppress': 'suppressed', 'archive': 'archived', 'drift_detected': 'drifting' },
  'contested':    { 'verify': 'active', 'archive': 'archived' },
  'suppressed':   { 'unsuppress': 'active', 'archive': 'archived' },
  'drifting':     { 'correct_drift': 'active', 'archive': 'archived' },
  'archived':     { 'restore': 'active', 'forget': 'forgotten' },
  'forgotten':    {},
};
```

**版本规划**：v2.2（State Machine 核心）→ v2.4（副作用自动化）→ v2.6（状态历史追溯）

#### 缺口七：Memory Exchange（记忆双向通道）

**问题**：无导入/导出/增量同步能力。

```typescript
interface MemoryExchange {
  export(options: ExportOptions): Promise<ExportResult>;
  import(items: ImportItem[], options: ImportOptions): Promise<ImportReport>;
  deltaExport(since: number): Promise<SyncDelta>;
  deltaImport(delta: SyncDelta): Promise<ImportReport>;
  detectFormat(content: string): ExportFormat;
}

type ExportFormat = 'jsonl' | 'markdown' | 'obsidian' | 'csv' | 'notion' | 'mem0';

interface MemoryExportItem {
  text: string;
  category: 'fact' | 'preference' | 'decision' | 'entity' | 'other';
  name: string;
  importance: number;
  created_at: string;
  occurred_at?: string;
  topic?: string;
  entities?: string[];
  relations?: Array<{ type: string; target_text: string; }>;
  lifecycle_state: MemoryState;
  vector?: number[];
}
```

**版本规划**：v2.2（JSONL 导入/导出）→ v2.4（Obsidian/Mem0 兼容）→ v2.6（增量同步协议）

---

### 9.2 五个根本性盲区

#### 盲区一：记忆的定义仍是「文本块」

**问题**：整个系统建立在 `Memory { id, text, vector, category, metadata }` 的隐喻上，没有区分观察/判断/期望/约束。

**⚠️ v2.x 务实路径**：四平面模型是长期研究方向。v2.x 只做简化版：

```typescript
// v2.x 实际可做到的
interface MemoryV2 {
  semanticType: 'direct' | 'inferred';  // 不是 7 种，是 2 种
  confidenceBasis: 'explicit' | 'implicit';  // 不是 5 种，是 2 种
}
```

**版本规划**：v3.0（语义类型推断）→ v3.1（置信平面）→ v3.2（意图平面）

#### 盲区二：记忆是「存储单位」而非「学习单位」

**问题**：系统存储「X」，但不存储「从 X 学到的 Y」。

```typescript
interface LearningUnit {
  sourceMemoryIds: string[];
  abstraction: {
    whatHappened: string;      // 原始事件
    whatWasLearned: string;     // 学到的
    whyItMatters: string;       // 为什么重要
    applicableContext: string;  // 适用场景
  };
  reusability: {
    timesApplied: number;
    successRate: number;
    generalizationLevel: 'specific' | 'pattern' | 'principle';
  };
}
```

#### 盲区三：recall 是 query 驱动非任务驱动

**问题**：假设 recall = 「找相关的」，而不是「当前任务需要什么」。

```typescript
// 理想：Task-Aware Recall
interface TaskAwareRecall {
  // 输入不仅有 query，还有当前任务上下文
  // 系统主动推断「这个任务需要什么类型的记忆」
  recallWithContext(query: string, task: TaskContext): Promise<RetrievedMemory[]>;
}
```

#### 盲区四：遗忘是删除非替代

**问题**：假设「旧的是错的，新的对」，没有「降级」语义。

```typescript
// 理想：Deprecation 语义
interface DeprecatedMemory {
  memory_id: string;
  superseded_by: string;
  deprecation_reason: 'outdated' | 'incorrect' | 'superseded';
  deprecated_at: number;
  // 旧记忆不删除，降级为「历史参考」
}
```

#### 盲区五：系统没有自我监控

**问题**：监控的是使用数据（访问次数），不是认知状态。

```typescript
// 理想：Self-Awareness Memory
interface CognitiveState {
  known_topics: string[];      // 系统认为自己熟悉什么
  uncertain_topics: string[];  // 系统认为自己不确定什么
  confidence_level: number;    // 系统对当前记忆整体质量的自信度
}
```

---

### 9.3 LLM 团队专属护城河（#107/#108）

> 这是**竞品无法复制**的架构层差异，但需要 LLM 团队在模型架构层面的持续投入。

#### #107 记忆原生 Attention 机制

**问题**：LLM 的 attention 是无差别的，所有 token 一视同仁。记忆的 metadata 无法影响推理权重。

```typescript
/**
 * Memory Attention Router（LLM 团队在模型架构层面实现）
 * 不是 prompt，是 weight
 */
interface MemoryAttentionRouter {
  // 输入：每条记忆的 metadata
  // 输出：每条记忆的 attention weight

  /**
   * 示例行为：
   * - contested记忆 → 自动降权 50%
   * - importance=0.9 → 权重 × 1.5
   * - fresh=true → 权重 × 1.2
   * - lineage_depth>2 → 权重 × 0.7
   */
}

const MEMORY_ATTENTION_CONFIG = {
  metadata_fields: ['importance', 'contested', 'fresh', 'lineage_depth'],
  weighting_rules: {
    contested: { multiplier: 0.5 },
    importance: { 0.9: 1.5, 0.7: 1.2, 0.3: 0.8 },
    fresh: { multiplier: 1.2 },
    lineage_depth: { '>2': 0.7, '>4': 0.5 },
  },
};
```

**给 LLM 团队的需求**：

```json
{
  "memory_metadata": {
    "mem_001": {"importance": 0.9, "contested": false, "fresh": true, "lineage_depth": 1},
    "mem_002": {"importance": 0.3, "contested": true, "fresh": false, "lineage_depth": 3}
  }
}
```

```
期望行为：mem_001 的 attention weight 是 mem_002 的 ~4.5 倍

训练数据：hawk-bridge 的 recall feedback（标记哪些记忆「应该权重高」）
```

#### #108 记忆专用小模型矩阵

**问题**：用大模型做记忆蒸馏/矛盾检测/质量评估，成本高、延迟高。

**解决方案**：训 5 个专用小模型，比大模型便宜 100 倍，专门做记忆操作。

| 模型 | 大小 | 用途 | 运行时 | 延迟目标 |
|------|------|------|--------|---------|
| **Consolidation-Mini** | 7B | 矛盾检测、记忆整合 | 闲时 | <5s |
| **Distillation-Mini** | 7B | Raw→Pattern 蒸馏 | 闲时 | <5s |
| **Quality-Score** | 3B | 评估 recall 质量 | 实时 | <100ms |
| **ImportPredict** | 1B | 预测新记忆重要性 | 写入时 | <50ms |
| **TimeReasoner** | 3B | 时序因果推理 | 实时查询 | <200ms |

```
总成本：约 21B 参数 ≈ 大模型的 1/5
推理速度：是大模型的 10 倍
```

**Consolidation-Mini（7B）— 矛盾检测**

```typescript
interface ConsolidationInput {
  newMemories: Memory[];      // 今天的新记忆
  relatedMemories: Memory[];    // 相关的历史记忆
}

interface ConsolidationOutput {
  contradiction_detected: boolean;
  contradiction_type: 'preference_change' | 'fact_conflict' | 'outdated';
  analysis: string;
  resolution: string;
  confidence: number;
}

// 示例
const input = {
  newMemory: "用户说微服务架构更好",
  relatedMemory: "用户之前偏好单体架构，因为团队小",
};
// 输出：{ contradiction_type: 'preference_change', analysis: '团队规模扩大后，用户自然调整了偏好' }
```

**Quality-Score（3B）— 评估 recall 质量**

```typescript
interface QualityScoreInput {
  query: string;
  recall_results: Memory[];
  context: ConversationContext;
}

interface QualityScoreOutput {
  quality_score: number;  // 0-100
  analysis: string;
  suggestion: string;
}
```

**ImportPredict（1B）— 预测记忆重要性**

```typescript
interface ImportPredictInput {
  memory_text: string;
}

interface ImportPredictOutput {
  predicted_importance: number;  // 0.0-1.0
  reasoning: string;
  suggested_tier: 'raw' | 'pattern' | 'principle' | 'skill';
  watch_for_followup: boolean;
}
```

**Flywheel 效应**

```
Consolidation-Mini 发现矛盾 → 产生新的 distilled 记忆
       ↓
这些新记忆进入 recall pool
       ↓
Quality-Score 评估 recall 质量提升
       ↓
ImportPredict 预测新记忆重要性更准
       ↓
TimeReasoner 建立更完整的时序图
       ↓
回到 Consolidation-Mini，形成正向循环
```

---

## 附录：架构缺口汇总表

| 缺口 | 类型 | 核心问题 | 版本规划 |
|------|------|---------|---------|
| **Semantic Index** | 功能 | 无法按「主题/实体/人」查询 | v2.3→v2.8 |
| **Working Memory** | 功能 | 每次 recall 冷启动 | v2.2→v2.6 |
| **Memory Compiler** | 功能 | recall 返回列表而非答案 | v2.3→v2.7 |
| **Adaptive Decay** | 功能 | 纯时间衰减，不考虑访问模式 | v2.3→v2.8 |
| **Recall Suppression** | 功能 | 无细粒度可见性控制 | v2.2→v2.6 |
| **Lifecycle State Machine** | 功能 | 状态转换无约束 | v2.2→v2.6 |
| **Memory Exchange** | 功能 | 无导入/导出/增量同步 | v2.2→v2.6 |
| **记忆原生 Attention** | LLM专属 | 模型 weight 层面支持 metadata 加权 | #107 |
| **专用小模型矩阵** | LLM专属 | Consolidation-Mini 等 5 个专用模型 | #108 |
| **四平面模型** | 范式 | 记忆仍是文本块，非认知单元 | v3.x 长期 |
| **Learning Unit** | 范式 | 存储「说过的话」而非「学到的东西」 | v3.x 长期 |
| **Task-Aware Recall** | 范式 | recall 是 query 驱动非任务驱动 | v3.x 长期 |
| **Deprecation 语义** | 范式 | 遗忘是删除非替代 | v3.x 长期 |
| **Self-Awareness Memory** | 范式 | 监控使用数据而非认知状态 | v3.x 长期 |

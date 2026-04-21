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
6. [Pipeline 架构](#5-pipeline-架构)
7. [组件拆分与边界](#6-组件拆分与边界)
8. [LLM 服务集成层](#7-llm-服务集成层)
9. [跨领域功能架构](#8-跨领域功能架构)
10. [实施路线图](#9-实施路线图)
11. [关键技术决策](#10-关键技术决策)
12. [架构缺口与未来方向](#11-架构缺口与未来方向)
13. [落地施工指南](#12-落地施工指南)

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

### 108 项 TODO 的版本 Scope

> ⚠️ **务实提醒**：108 项不是全部在 v2.0 完成。按工程可落地性分为三类：

| Scope | 项数 | 性质 | 示例 |
|-------|------|------|------|
| **v2.0 交付** | ~35 项 | 可施工的功能和架构 | Schema v2、Pipeline、Storage Engine、Rule Engine、Hook 系统、Event Bus |
| **v2.x 迭代** | ~40 项 | 架构可支撑但需持续迭代 | Semantic Index、Working Memory、Adaptive Decay、Recall Rerank、Multi-Agent 隔离 |
| **v3.x+ 规划** | ~33 项 | 长期研究方向或依赖外部 | 知识蒸馏、Memory Compiler、Sync 协议、知识图谱、#107/#108 LLM 专属 |

#### v2.0 交付清单（35 项）

```
基础设施（必做）：
  #47 Embedding Provider 抽象
  #48 VectorStore Provider 抽象
  #60 规则引擎核心
  #64 Lifecycle State Machine

Capture 相关（7项）：
  #1  Taxonomy 扩展（fact/preference/decision/entity → 4类）
  #2  What NOT to Save 排除列表
  #10 相对日期转绝对日期
  #13 Context Fence 防注入
  #14 记忆内容安全扫描
  #15 记忆字符限额
  #71 Capture 拒绝机制

Recall 相关（6项）：
  #3  Memory Fence 标签机制
  #4  记忆年龄标签（Freshness Text）
  #5  Source Tracing（来源+验证计数）
  #24 Confidence-Gated Recall
  #25 LLM Self-Verification Hook
  #26 Factuality Classification

Security（5项）：
  #27 Audit Log
  #28 Injection Detector
  #29 Write Confidence Threshold
  #31 Quarantine Mechanism
  #34 Cross-Reference Verification

Autoself 支撑（5项）：
  #16 Hook 系统完善
  #17 子 Agent 上下文注入
  #21 Cron Job 结果自动写入记忆
  #22 Multi-Agent Session Isolation
  #23 Constitution 锚定记忆

存储/可观测（4项）：
  #55 记忆版本历史链
  #44 记忆验证引擎（核心）
  #74 自我监控
  #43 Health Alerting
```

#### v2.x 迭代清单（40 项）

```
Intelligence 层：
  #8  双重选择器（Manifest Scan → LLM TopN）
  #11 Memory Shape Telemetry
  #12 MEMORY.md 入口索引
  #35 Background Prefetch
  #36 Session Insights
  #37 MemoryManager 编排层
  #38 Skill Auto-Creation
  #41 User Modeling
  #45 知识图谱关系层
  #46 主动记忆推送

Rule Engine 完善：
  #61 Capture 写入规则
  #62 Recall 召回规则
  #63 Decay 衰减规则
  #65 Verify 验证触发规则
  #66 Tier 升降规则
  #67 规则引擎 API + 管理界面
  #68 Auto-Generated 规则

Multi-Agent：
  #6  Team Memory + Symlink 安全
  #39 Multi-tenant Namespace
  #50 Storage Quota + Rate Limit
  #59 Multi-Agent 视角感知记忆
  #73 多 Agent 可见性控制

Storage 演进：
  #40 Auto-Compression
  #51 跨设备 Sync 协议（⚠️ 见阻断性缺口）
  #52 记忆加密层 + Right-to-Erasure
  #54 Event vs Concept 区分

Recall 质量：
  #56 记忆质量反馈闭环
  #57 Memory ROI 量化评估
  #58 元认知自我调优
  #72 任务完成度 Ranking（⚠️ 见阻断性缺口）
  #44 记忆验证引擎（完整）
```

#### v3.x+ 长期研究（33 项）

```
知识进化层（18项 #75-#92）：
  #75 知识蒸馏架构（Raw→Pattern→Principle→Skill）
  #76 动态分层存储
  #77 记忆血缘链
  #78 Notion-Like 个人知识库视图
  #79 ToB 企业私域知识库
  #80 记忆时间胶囊
  #81 置信度衰减曲线
  #82 跨会话上下文迁移
  #83 记忆的可证明性
  #84 主动遗忘的社会化影响
  #85 记忆经济学
  #86 跨 Agent 记忆迁移
  #87 记忆的"诺贝尔奖"机制
  #88 记忆的"平行宇宙"视图
  #89 记忆压缩质量评估
  #90 多语言语义等价
  #91 记忆的温度感
  #92 记忆的"考古学"模式

战略与挑战（13项）：
  #93 竞争护城河
  #94 核心挑战：记忆验证引擎（完整）
  #95 核心挑战：跨设备 Sync + CRDT（⚠️ 见阻断性缺口）
  #96 生命周期适配蒸馏引擎
  #97 阶段转换触发器
  #98 知识遗产化引擎
  #99 知识断舍离引擎
  #100 记忆有效性闭环
  #101 知识蒸馏的 LLM 边界
  #102 Memory Compiler（⚠️ 见阻断性缺口）
  #103 供应商锁定
  #104 跨 Agent 记忆产权
  #105 记忆自污染机制

LLM 专属（2项）：
  #107 记忆原生 Attention
  #108 专用小模型矩阵
```

### 3 个阻断性架构缺口

> 以下 3 个缺口在 v2.0 设计时必须正视，否则无法支撑对应 TODO：

#### 阻断 1：Memory Compiler（#72, #102）

**问题**：Recall Pipeline 输出是 `[记忆1, 记忆2, 记忆3]` 列表，不是答案。

```typescript
// 当前：Recall Pipeline 终点
interface RecallResult {
  memories: Memory[];  // ← Agent 还要自己综合
}

// 理想：Recall Pipeline 终点
interface RecallResult {
  answer: string;              // ← 直接是答案
  sources: Memory[];           // ← 来源记录
  compileType: 'merged' | 'conflict' | 'timeline' | 'summary';
  recallReason: string;        // ← 为什么返回这个答案
}
```

**影响**：
- #72 任务完成度 Ranking 需要理解「这条记忆对任务有没有用」→ 需要 Compiler
- #102 Memory Compiler 直接依赖这个基础设施
- #56 质量反馈闭环也需要先有 Compiler 才能追踪「哪个记忆对答案贡献最大」

**架构调整**：在 Recall Pipeline 增加 `RecallFinalizerStage`（在 CrossEncoderRerankStage 之后）

#### 阻断 2：Sync 协议（#51）

**问题**：多个设备同时写入同一记忆，CRDT 冲突解决比想象中复杂。

```
场景：
  手机写入：「项目用 Python 3.11」
  电脑写入：「项目升级到 Python 3.12」
  → 冲突了，谁对？

人类大脑的处理方式：
  - "最近的记忆"覆盖"旧记忆"
  - 但如果记忆内容矛盾，需要外部验证（查代码）
  - 这不是单纯的技术问题，是语义问题
```

**当前状态**：架构中完全没有设计 Sync 模块。

**架构调整**：
- 方案 A（务实）：v2.0 只做「设备注册 + 记忆同步」，冲突时保留最新写入，冲突记录可查
- 方案 B（完整）：引入 CRDT（Conflict-free Replicated Data Types），设计 `MemorySyncEngine`
- 建议：**v2.x 先做方案 A**，方案 B 是 v3.x 的事情

#### 阻断 3：Multi-tenant 完整隔离（#39, #50, #52）

**问题**：Storage Engine 抽象了，但 tenant isolation 没有。

```
embedding space 污染问题：
  用户 A 的 embedding model → hawk-bridge 实例
  用户 B 的 embedding model → 同一个 hawk-bridge 实例
  → 向量空间是共享的 → recall 可能跨租户污染
```

**架构调整**：
- API Gateway 层增加 TenantContext 中间件（注入 tenant_id）
- Storage Engine 的 `vectorSearch()` 增加 `tenantId` filter
- Embedder 按 tenant 隔离或使用 tenant-aware embedding

### 架构与 TODO 映射矩阵

| 架构组件 | 覆盖的 TODO | 缺失的 TODO |
|---------|------------|------------|
| **Capture Pipeline** | #1, #2, #10, #13, #14, #15, #71 | #8（双重选择器）|
| **Recall Pipeline** | #3, #4, #5, #24, #25, #26 | #72（需要 Compiler）|
| **Storage Engine** | #47, #48, #55 | #51（Sync）|
| **Event Bus** | #16（Hook 触发）, #21 | - |
| **LLM Service** | #25, #26, #44 | #35, #46（预取/推送）|
| **Rule Engine** | #60, #61, #62, #63, #64, #65, #66, #67, #68 | - |
| **Decay Worker** | #63, #66, #69, #70 | - |
| **Pipeline Observer** | #74, #11 | - |
| **Memory Core** | #55, #56, #57, #64 | - |
| **AgentMemoryRouter** | #6, #17, #22, #59, #73 | #39, #50（Multi-tenant）|

### 诚实评价

> ⚠️ **务实提醒**：108 项 TODO 代表的是「我们想到了」，不是「我们做到了」。

| 维度 | 评分 | 说明 |
|------|------|------|
| **工程完整度** | ⭐⭐⭐⭐⭐ | 108 项涵盖所有已知需求 |
| **v2.0 可交付** | ⭐⭐⭐ | ~35 项核心功能可落地 |
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
| 记忆定义仍是文本块 | 假设「记忆 = 文本 + 向量」 | 四平面模型（v3.x） |
| 记忆是存储单位非学习单位 | 存储「说过的话」非「学到的东西」 | Learning Unit + Skill |
| recall 是 query 驱动非任务驱动 | recall = 「找相关的」非「任务需要」 | Task-Aware Recall |
| 遗忘是删除非替代 | 假设「旧=错，新=对」 | Deprecation 语义 |
| 系统没有自我监控 | 监控使用数据非认知状态 | Self-Awareness Memory |

### 版本 Scope 边界

> 明确 v2.0 做什么，不做什么。避免架构文档过于庞大。

**v2.0 做**（可施工）：
- Schema v2（4 表拆分）
- Pipeline Stage 接口 + Observer
- Storage Engine 抽象（热/冷/冰三层）
- Event Bus（In-Memory + Redis 可选）
- LLM Service HTTP 客户端（替代 subprocess）
- Decay Worker 独立进程
- Capture Pipeline 重构
- Recall Pipeline + Rerank（不包含 Compiler）
- Hook 系统完善（session/task 生命周期）
- Rule Engine 核心（State Machine）
- Self-Awareness + Health Alerting

**v2.0 不做**（v2.x 迭代或 v3.x 研究）：
- Memory Compiler（→ v2.3）
- Semantic Index / 双重选择器（→ v2.3）
- Knowledge Graph Relations（→ v2.4）
- Cross-device Sync（→ v2.x，简化版先做）
- Multi-tenant 完整隔离（→ v2.x）
- 知识蒸馏架构（→ v3.x）
- #107/#108 LLM 专属（依赖 LLM 团队）

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
| **Python LLM 原始交互** | subprocess execSync，无 resilience、无 retry、无 queue |
| **Decay 耦合在 hook** | OpenClaw 启动才检查，无法定时执行 |
| **无 Pipeline Observer** | 每个 stage 的输入输出无法追踪 |

---

## 2. 目标架构

### 2.1 架构原则

```
1. 分层解耦：存储层 / 计算层 / 接口层分离
2. Pipeline 化：所有记忆操作通过统一 Pipeline，每个 Stage 可插拔
3. 组件拆分：Decay Worker 和 LLM 服务独立进程，其余保持单进程
4. 插件化存储：支持多种存储引擎按场景切换
5. 可观测优先：tracing + metrics + logging 全面内置
6. 向后兼容：v1.x 的 API 和 Hook 机制完全兼容
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
                   │        Event Bus             │
                   │   (In-Memory + Redis)        │
                   └──────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Capture        │  │   Recall        │  │   Decay         │
│   Pipeline       │  │   Pipeline      │  │   Pipeline      │
│   (Node.js)      │  │   (Node.js)     │  │   (Node.js)     │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         │    ┌────────────────┴────────────────┐    │
         │    │         Memory Core              │    │
         │    │  (Schema / Indexing / Rerank)   │    │
         │    └────────────────┬────────────────┘    │
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               ▼
                   ┌──────────────────────────┐
                   │     Storage Engine       │
                   │  (LanceDB / Pg / S3)    │
                   └──────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                    独立进程 / 独立仓库                             │
│  ┌──────────────────┐    ┌───────────────────────────────────┐  │
│  │  Decay Worker    │    │    hawk-memory-api (Python)      │  │
│  │  (hawk-bridge    │    │    独立仓库（已是独立项目）       │  │
│  │   同仓库，systemd │    │    LLM 提取 / 矛盾检测 / 蒸馏   │  │
│  │   timer 触发)    │    │                                   │  │
│  └──────────────────┘    └───────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 核心模块职责

| 模块 | 进程 | 职责 | 关键类 |
|------|------|------|--------|
| **Gateway API** | 主进程 | OpenClaw Hook 协议 | `HawkGateway` |
| **HTTP API** | 主进程 | 外部 REST API，SDK 接入 | `HawkHTTPAPI` |
| **Event Bus** | 主进程 | 异步事件分发，支持 Redis | `MemoryEventBus` |
| **Capture Pipeline** | 主进程 | 提取 → 分类 → 去重 → 存储 | `CapturePipeline` |
| **Recall Pipeline** | 主进程 | 查询 → 检索 → 重排 → 过滤 → 返回 | `RecallPipeline` |
| **Memory Core** | 主进程 | Schema 管理、版本控制、一致性 | `MemoryCore` |
| **Storage Engine** | 主进程 | 多引擎适配器（ LanceDB / Pg / S3） | `StorageEngine` |
| **Pipeline Observer** | 主进程 | Stage 级 tracing + metrics | `PipelineObserver` |
| **Decay Worker** | 独立进程（非独立仓库） | 定时 decay/归档/GC | `DecayWorker` |
| **LLM Service** | 独立仓库（hawk-memory-api） | LLM 提取、矛盾检测、质量评估 | `HawkMemoryAPI` |

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

## 5. Pipeline 架构

> 这是 v2.0 最重要的架构改进之一。核心改变：
> 1. **Stage 接口化**：每个 Pipeline 阶段是可独立运行和替换的单元
> 2. **Observer 可注入**：每个 Stage 的输入/输出/耗时可被观察和追踪
> 3. **可配置**：Pipeline 在运行时组装，不硬编码调用链

### 5.0 为什么需要 Pipeline Stage — 痛点分析

> **核心价值**：可观测是副产品，可进化才是目的。

#### 不用 Pipeline Stage 的 5 个痛点

**痛点 1：不能跳过某个 Step**

```
场景：你想在测试时跳过 LLM 提取（省时间省钱）
传统方案：改代码，注释掉那一行

场景：某些输入不需要分段（已经是结构化数据）
传统方案：加 if 判断，代码越来越乱
```

**痛点 2：不能替换某个 Step 的实现**

```
场景：你想把 OpenAI Embedding 换成本地 BGE-M3
传统方案：找到 embed() 函数，重写它，可能影响其他调用方

场景：你想试试不同的去重算法
传统方案：改 dedupe() 函数，没有回退机制
```

**痛点 3：不能单独测试每个 Step**

```
场景：你想单元测试 LLM 提取逻辑
传统方案：必须 mock 整个 capture 流程

场景：你想压测向量化和存储
传统方案：必须同时跑 LLM 提取，无法单独测试
```

**痛点 4：不能在不改代码的情况下加日志/监控**

```
场景：你想知道 LLM 提取耗时多少
传统方案：必须改 capture() 代码，加 console.time / logger

场景：你想在每个 step 加 traceId 串联
传统方案：每个 step 都要手动传 context，改动巨大
```

**痛点 5：不同 Pipeline 复用同一个 Step**

```
场景：capture 需要 A→B→C
       recall 需要 X→Y→Z
       但 B 和 Y 是同一个去重逻辑
传统方案：复制粘贴，或者抽成工具函数但调用方式不统一
```

#### Pipeline Stage 解决的 5 个痛点

| 痛点 | Pipeline Stage 怎么解决 |
|------|----------------------|
| **不能跳过** | `canProcess?()` 返回 false 就跳过，不改代码 |
| **不能替换** | 注入不同的 Stage 实现，运行时切换 |
| **不能单独测试** | 每个 Stage 独立单元测试，mock 接口 |
| **不能加监控** | 注入 Observer，不改 Stage 代码 |
| **不能复用** | 同一个 Stage 可以被多个 Pipeline 共用 |

#### 可观测 × 可进化 的组合效果

```
场景：每次 Raw→Pattern 进化迭代

【没有 Pipeline Stage 的系统】
  迭代 1: 加了日志，代码改了一坨
  迭代 2: 想加 metrics，又要改一坨
  迭代 3: 想换 LLM provider，要动核心逻辑
  迭代 4: 没人敢动了，系统僵化

【有 Pipeline Stage + Observer 的系统】
  迭代 1: Capture Pipeline 第3步是 LLMExtraction
          → 加一个 Observer 就能看耗时，不改 Stage 代码

  迭代 2: 想验证不同 LLM 提取效果
          → 换一个新的 LLMExtractionStage 实现
          → PipelineRunner 注入新的，旧的保留备选

  迭代 3: 想跳过 LLM 提取（节省成本）
          → 配置 skipStages: ['llm_extraction']
          → 不用改任何代码

  迭代 4: 想加一个新阶段「质量评分」
          → 新写一个 QualityScoringStage
          → 插到 LLMExtraction 和 Deduplication 之间
          → 其他 Stage 不用改
```

#### Pipeline Stage 的本质

```
Pipeline Stage 的本质是：
把「一个巨石函数」拆成「一组独立可组装的步骤」

每个 Stage 三个特性：
  1. 输入/输出类型固定（接口约定）
  2. 内部逻辑完全独立（不依赖其他 Stage）
  3. 可以被替换/跳过/增强（不改动调用方）
```

### 5.1 Pipeline Stage 接口

```typescript
/**
 * Pipeline Stage — 所有 Pipeline 阶段的统一接口
 * 每个 Stage 都是一个独立可测试的单元
 */
interface PipelineStage<I = unknown, O = unknown> {
  /** 阶段名称（用于日志和 tracing） */
  name: string;

  /** 描述该阶段的输入输出类型 */
  describe(): { input: string; output: string; };

  /** 执行阶段逻辑 */
  process(input: I, context: PipelineContext): Promise<O>;

  /**
   * 可选：验证输入是否有效
   * 如果返回 false，该阶段会被跳过（而不是报错）
   */
  canProcess?(input: I, context: PipelineContext): boolean | Promise<boolean>;

  /**
   * 可选：获取该阶段的自定义配置
   * 通过 context.config 传递
   */
  getConfig?(): Record<string, unknown>;
}

/** Pipeline 执行上下文 — 所有 Stage 共享 */
interface PipelineContext {
  traceId: string;           // 分布式追踪 ID
  pipelineName: string;      // "capture" | "recall" | "decay"
  sessionId?: string;
  agentId?: string;
  config: PipelineConfig;    // 可注入的自定义配置
  storage: StorageEngine;    // 存储引擎（注入）
  eventBus: EventBus;        // 事件总线（注入）
  observer: PipelineObserver; // 可观测性（注入）
}

/** Pipeline 配置 */
interface PipelineConfig {
  maxConcurrency?: number;   // 最大并发 Stage 数
  timeoutMs?: number;       // 全局超时
  stages?: string[];        // 明确指定运行的 Stage 顺序
  skipStages?: string[];   // 跳过的 Stage
}
```

### 5.2 Pipeline Observer — 可观测性基础设施

```typescript
/**
 * Pipeline Observer — 观察所有 Stage 的执行过程
 * 可注入多个实现（logging / tracing / metrics / custom）
 */
interface PipelineObserver {
  /** Stage 开始 */
  onStageStart(
    pipeline: string,
    stage: string,
    input: unknown,
    context: PipelineContext
  ): void;

  /** Stage 完成 */
  onStageComplete(
    pipeline: string,
    stage: string,
    input: unknown,
    output: unknown,
    context: PipelineContext,
    durationMs: number
  ): void;

  /** Stage 失败 */
  onStageError(
    pipeline: string,
    stage: string,
    input: unknown,
    error: Error,
    context: PipelineContext,
    durationMs: number
  ): void;

  /** Pipeline 完成 */
  onPipelineComplete(
    pipeline: string,
    context: PipelineContext,
    durationMs: number
  ): void;

  /** Pipeline 失败 */
  onPipelineError(
    pipeline: string,
    error: Error,
    context: PipelineContext,
    durationMs: number
  ): void;
}

/** 内置 Observer 实现 */
class LoggingObserver implements PipelineObserver {
  onStageComplete(pipeline, stage, input, output, context, durationMs) {
    logger.info({ pipeline, stage, durationMs }, `Stage complete`);
  }

  onStageError(pipeline, stage, input, error, context, durationMs) {
    logger.error({ pipeline, stage, error: error.message, durationMs }, `Stage error`);
  }
}

class TracingObserver implements PipelineObserver {
  onStageComplete(pipeline, stage, input, output, context, durationMs) {
    tracer.recordSpan({
      name: `${pipeline}.${stage}`,
      duration: durationMs,
      inputSize: JSON.stringify(input).length,
      outputSize: JSON.stringify(output).length,
      traceId: context.traceId,
    });
  }
}

class MetricsObserver implements PipelineObserver {
  onStageComplete(pipeline, stage, input, output, context, durationMs) {
    stageDurationHistogram.observe(
      { pipeline, stage },
      durationMs / 1000
    );
    stageCount.inc({ pipeline, stage, status: 'success' });
  }

  onStageError(pipeline, stage, input, error, context, durationMs) {
    stageCount.inc({ pipeline, stage, status: 'error' });
  }
}
```

### 5.3 Pipeline Runner — 执行引擎

```typescript
/**
 * Pipeline Runner — 负责执行整个 Pipeline
 * 1. 按顺序执行每个 Stage
 * 2. 每个 Stage 的输入/输出由 Runner 传递给 Observer
 * 3. 支持条件跳过、并发控制、超时
 */
class PipelineRunner<I = unknown, O = unknown> {
  constructor(
    private name: string,
    private stages: PipelineStage[],
    private observers: PipelineObserver[] = []
  ) {}

  async run(
    initialInput: I,
    contextOverrides?: Partial<PipelineContext>
  ): Promise<O> {
    const context = this.buildContext(contextOverrides);
    const startTime = Date.now();

    try {
      let currentInput: unknown = initialInput;

      for (const stage of this.stages) {
        const stageStart = Date.now();

        // 1. 检查是否可以处理
        if (stage.canProcess && !(await stage.canProcess(currentInput as any, context))) {
          this.notify('skip', stage, currentInput, context);
          continue;
        }

        // 2. 通知开始
        this.notify('start', stage, currentInput, context);

        try {
          // 3. 执行
          const output = await this.withTimeout(
            stage.process(currentInput as any, context),
            context.config.timeoutMs ?? 30_000,
            `Stage ${stage.name} timed out`
          );

          // 4. 通知完成
          const duration = Date.now() - stageStart;
          for (const obs of this.observers) {
            obs.onStageComplete(this.name, stage.name, currentInput, output, context, duration);
          }

          currentInput = output;
        } catch (err) {
          // 5. 通知错误
          const duration = Date.now() - stageStart;
          for (const obs of this.observers) {
            obs.onStageError(this.name, stage.name, currentInput, err as Error, context, duration);
          }
          throw err;
        }
      }

      const totalDuration = Date.now() - startTime;
      for (const obs of this.observers) {
        obs.onPipelineComplete(this.name, context, totalDuration);
      }

      return currentInput as O;
    } catch (err) {
      const totalDuration = Date.now() - startTime;
      for (const obs of this.observers) {
        obs.onPipelineError(this.name, err as Error, context, totalDuration);
      }
      throw err;
    }
  }

  private notify(
    event: 'start' | 'complete' | 'error' | 'skip',
    stage: PipelineStage,
    input: unknown,
    context: PipelineContext
  ) {
    for (const obs of this.observers) {
      if (event === 'start') obs.onStageStart(this.name, stage.name, input, context);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(msg)), ms)
      ),
    ]);
  }
}
```

### 5.4 Capture Pipeline — 完整 Stage 列表

```typescript
// Capture Pipeline Stage 定义（完整列表）
class CapturePipeline {
  readonly stages: PipelineStage[] = [
    new InputNormalizerStage(),     // 清理格式、规范化
    new TextSegmenterStage(),        // 按语义分段（过滤噪音）
    new LLMExtractionStage(),        // LLM 提取 category/importance/description
    new ShelfLifeDetectionStage(),   // 推断保鲜期类型
    new DeduplicationStage(),        // SimHash 去重 + 版本链检查
    new EmbeddingStage(),            // 向量化（多 provider 支持）
    new StorageWriteStage(),         // 写入 Storage Engine + trace
  ];
}

// ========== Stage 实现示例 ==========

class InputNormalizerStage implements PipelineStage<string, string> {
  name = 'input_normalizer';

  describe() {
    return { input: 'raw_conversation_text', output: 'normalized_text' };
  }

  async process(input: string, ctx: PipelineContext): Promise<string> {
    // 移除格式标记、统一换行符、trim
    return input
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

class TextSegmenterStage implements PipelineStage<string, ConversationSegment[]> {
  name = 'text_segmenter';

  async process(input: string, ctx: PipelineContext): Promise<ConversationSegment[]> {
    // 按语义分段：检测话题边界，过滤噪音（如 "好的"、"收到"）
    return segmentConversation(input);
  }
}

class LLMExtractionStage implements PipelineStage<ConversationSegment[], MemoryCandidate[]> {
  name = 'llm_extraction';

  constructor(private llmService: LLMService) {}

  async process(
    input: ConversationSegment[],
    ctx: PipelineContext
  ): Promise<MemoryCandidate[]> {
    // 调用 hawk-memory-api（HTTP）进行 LLM 提取
    const result = await this.llmService.extract({
      segments: input,
      sessionId: ctx.sessionId,
      traceId: ctx.traceId,
    });
    return result.candidates;
  }
}

class DeduplicationStage implements PipelineStage<MemoryCandidate[], MemoryCandidate[]> {
  name = 'deduplication';

  async process(input: MemoryCandidate[], ctx: PipelineContext): Promise<MemoryCandidate[]> {
    const deduped: MemoryCandidate[] = [];
    const seen = new Map<string, MemoryCandidate>();

    for (const candidate of input) {
      const hash = sha256(candidate.canonical_text);
      const existing = seen.get(hash);

      if (!existing) {
        seen.set(hash, candidate);
        deduped.push(candidate);
      } else {
        // 已存在 → 合并 metadata，保留最高 importance
        if (candidate.importance > existing.importance) {
          seen.set(hash, candidate);
          deduped[deduped.indexOf(existing)] = candidate;
        }
      }
    }

    return deduped;
  }
}

class EmbeddingStage implements PipelineStage<MemoryCandidate[], MemoryCandidate[]> {
  name = 'embedding';

  constructor(private embedder: Embedder) {}

  async process(input: MemoryCandidate[], ctx: PipelineContext): Promise<MemoryCandidate[]> {
    const texts = input.map(c => c.canonical_text);
    const vectors = await this.embedder.embed(texts);

    return input.map((c, i) => ({
      ...c,
      vector: vectors[i],
      vectorProvider: this.embedder.provider(),
      vectorDimensions: this.embedder.dimensions(),
    }));
  }
}
```

### 5.5 Recall Pipeline — 完整 Stage 列表

```typescript
class RecallPipeline {
  readonly stages: PipelineStage[] = [
    new QueryParserStage(),           // 解析 query，提取时间意图
    new TemporalReasoningStage(),     // 时序推理（如果 query 包含时序）
    new EmbeddingQueryStage(),         // 向量化 query
    new HybridSearchStage(),           // 向量 + FTS 并行搜索
    new RRFusionStage(),              // Reciprocal Rank Fusion 合并
    new ContestedFilterStage(),        // 过滤 contested 记忆
    new VersionResolverStage(),        // 确保返回最新版本
    new CrossEncoderRerankStage(),    // Cross Encoder 重排
    // ★ RecallFinalizerStage 在 v2.3 加入（当前 v2.0 版本不含）
    // new RecallFinalizerStage(this.llmService),  // 将记忆列表编译为答案
    new ResultBuilderStage(),          // 返回结果 + recall_reason
  ];
}
```

> ⚠️ **RecallFinalizerStage 说明**（v2.3 加入）：
> 当前 v2.0 的 Recall Pipeline 输出是 `Memory[]` 列表，Agent 需要自己做综合。
> v2.3 将增加 `RecallFinalizerStage`，把多条相关记忆编译为单一答案：
> ```typescript
> // RecallFinalizerStage 输出
> interface CompiledRecallResult {
>   answer: string;              // 编译后的答案
>   sources: Array<{ memoryId: string; text: string; relevance: number }>;
>   compileType: 'merged' | 'conflict' | 'timeline' | 'summary' | 'single';
>   recallReason: string;       // 为什么返回这个答案
>   warnings?: string[];         // 冲突警告、置信度警告等
> }
> ```
> 这是 #72（任务完成度 Ranking）和 #102（Memory Compiler）的架构基础。

### 5.6 Sync 协议模块（v2.x）

> ⚠️ **当前架构不含 Sync 模块**，#51（跨设备 Sync）完全未设计。
> 以下是 v2.x 的设计方向，用于指导后续施工：

```typescript
/**
 * Sync 协议 — v2.x 简化版
 *
 * 目标：多设备写入同一记忆时，保留最新写入，冲突记录可查。
 * 不做：CRDT 语义冲突解决（那是 v3.x 的事情）。
 */
interface MemorySyncEngine {
  // 设备注册
  registerDevice(deviceId: string, tenantId: string): Promise<void>;

  // 增量同步
  deltaExport(since: number): Promise<SyncDelta>;
  deltaImport(delta: SyncDelta): Promise<ImportReport>;

  // 冲突解决策略（简化版）
  resolveConflict(local: Memory, remote: Memory): 'local' | 'remote' | 'merge' | 'conflict';
}

/** 冲突记录 */
interface SyncConflict {
  memoryId: string;
  localVersion: Memory;
  remoteVersion: Memory;
  occurredAt: number;
  resolvedBy: 'local' | 'remote' | 'manual';
  resolutionNote?: string;
}
```

> **架构决策**：Sync 模块不在 v2.0 Scope，v2.x 先做简化版（设备注册 + 增量同步 + 最新写入覆盖），v3.x 再考虑 CRDT 语义冲突解决。

### 5.7 Pipeline 组装 — 依赖注入

```typescript
/**
 * Pipeline 工厂 — 负责组装 Pipeline 实例
 * 这是唯一的组装点，所有依赖通过 constructor 注入
 */
class PipelineFactory {
  constructor(
    private storage: StorageEngine,
    private embedder: Embedder,
    private llmService: LLMService,
    private eventBus: EventBus,
    private config: HawkConfig
  ) {}

  createCapturePipeline(): PipelineRunner<string, string> {
    const stages: PipelineStage[] = [
      new InputNormalizerStage(),
      new TextSegmenterStage(),
      new LLMExtractionStage(this.llmService),
      new ShelfLifeDetectionStage(),
      new DeduplicationStage(),
      new EmbeddingStage(this.embedder),
      new StorageWriteStage(),
    ];

    const observers: PipelineObserver[] = [
      new LoggingObserver(this.config.logging),
      new TracingObserver(this.config.tracing),
      new MetricsObserver(this.config.metrics),
    ];

    return new PipelineRunner('capture', stages, observers);
  }

  createRecallPipeline(): PipelineRunner<string, RecallResult> {
    const stages: PipelineStage[] = [
      new QueryParserStage(),
      new TemporalReasoningStage(),
      new EmbeddingQueryStage(this.embedder),
      new HybridSearchStage(this.storage),
      new RRFusionStage(),
      new ContestedFilterStage(),
      new VersionResolverStage(),
      new CrossEncoderRerankStage(),
      new ResultBuilderStage(),
    ];

    return new PipelineRunner('recall', stages, [
      new LoggingObserver(this.config.logging),
      new TracingObserver(this.config.tracing),
      new MetricsObserver(this.config.metrics),
    ]);
  }
}
```

---

## 6. 组件拆分与边界

> **核心原则**：
> - ❌ Pipeline Stage 不要拆分进程（接口调用即可，IPC 开销大）
> - ❌ Decay Worker 不要拆分仓库（技术栈相同，共享代码多）
> - ✅ Decay Worker 应该独立进程部署（定时任务不需要常驻内存）
> - ✅ hawk-memory-api 应该拆分仓库（Python 技术栈不同，已是独立项目）
> - ❌ Storage Engine 不要拆分进程（存储引擎本身是独立服务）

### 6.1 拆分决策矩阵

| 组件 | 进程分离？ | 理由 | 当前状态 |
|------|----------|------|---------|
| **Capture/Recall Pipeline** | ❌ 否 | Stage 之间高频调用，IPC 开销大 | 主进程 |
| **Pipeline Observer** | ❌ 否 | 必须内联在 Pipeline 执行流中 | 主进程 |
| **Embedder** | ❌ 否 | 纯计算，调用频率高，IPC 开销大 | 主进程 |
| **Storage Engine** | ❌ 否 | LanceDB/Pg/S3 本身是独立服务，通过接口调用 | 主进程 |
| **Decay Worker** | ✅ 独立进程（不是独立仓库） | 定时任务，不需要常驻内存，可以独立部署/扩展 | **缺失，需新建，但不放独立仓库** |
| **LLM Service** | ✅ 是 | Python 运行时独立，GPU 资源独立，已拆分 | **hawk-memory-api** |
| **Event Bus** | ❌ 否 | 抽象层，默认 in-memory，可选 Redis | 主进程 |

### 6.2 Decay Worker — 独立进程设计

**为什么必须拆分**：

```
当前问题：
OpenClaw 启动 → hawk-decay hook → 检查 decay → 关闭

问题：
1. OpenClaw 不常启动 → Decay 不及时（可能几周才触发一次）
2. Decay 检查和主服务抢资源
3. 无法控制 decay 的并发/资源使用
4. OpenClaw 重启时 decay 会干扰启动速度
```

**Decay Worker 架构**：

```typescript
/**
 * Decay Worker — 独立进程，定时运行 decay pipeline
 *
 * 部署方式（任选其一）：
 * 1. systemd timer:每小时运行一次 decay-worker
 * 2. cron: 0 * * * * /path/to/decay-worker
 * 3. 独立常驻进程 + 内部定时器（适合需要快速响应的场景）
 */

// src/workers/decay-worker.ts
class DecayWorker {
  private storage: StorageEngine;
  private eventBus: EventBus;
  private observer: PipelineObserver;

  constructor(config: HawkConfig) {
    this.storage = StorageFactory.create(config.storage);
    this.eventBus = EventBusFactory.create(config.eventbus);
    this.observer = new CompositeObserver([
      new LoggingObserver(),
      new MetricsObserver(),
    ]);
  }

  async run(): Promise<DecayReport> {
    const traceId = generateTraceId();
    const startTime = Date.now();
    const report: DecayReport = {
      traceId,
      startedAt: startTime,
      tiers: [],
      archived: 0,
      deleted: 0,
      errors: [],
    };

    const context: PipelineContext = {
      traceId,
      pipelineName: 'decay',
      config: {},
      storage: this.storage,
      eventBus: this.eventBus,
      observer: this.observer,
    };

    try {
      // Stage 1: Tier Maintenance
      report.tiers.push(await this.tierMaintenance(context));

      // Stage 2: Decay Calculation
      report.tiers.push(await this.calculateDecay(context));

      // Stage 3: Orphan Detection
      report.tiers.push(await this.detectOrphans(context));

      // Stage 4: Archive Migration
      report.archived = await this.archiveMigrate(context);

      // Stage 5: Garbage Collection
      report.deleted = await this.garbageCollect(context);

      report.completedAt = Date.now();
      report.durationMs = report.completedAt - startTime;

      // 发送完成事件
      await this.eventBus.publish('decay:completed', {
        type: 'decay:completed',
        ...report,
      });
    } catch (err) {
      report.errors.push({ stage: 'unknown', error: (err as Error).message });
      report.completedAt = Date.now();
    }

    return report;
  }

  // 每个 Stage 可以单独测试
  private async tierMaintenance(ctx: PipelineContext): Promise<TierReport> {
    const stage = new TierMaintenanceStage(this.storage);
    const start = Date.now();
    try {
      const result = await stage.process(null, ctx);
      this.observer.onStageComplete('decay', 'tier_maintenance', null, result, ctx, Date.now() - start);
      return result;
    } catch (err) {
      this.observer.onStageError('decay', 'tier_maintenance', null, err as Error, ctx, Date.now() - start);
      throw err;
    }
  }
}

interface DecayReport {
  traceId: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  tiers: TierReport[];
  archived: number;
  deleted: number;
  errors: Array<{ stage: string; error: string }>;
}

// 入口点
async function main() {
  const config = loadConfig();
  const worker = new DecayWorker(config);

  const report = await worker.run();

  // 输出报告
  console.log(JSON.stringify(report, null, 2));

  // 根据配置决定是否发送告警
  if (report.errors.length > 0 || report.deleted > 1000) {
    await sendAlert(report);
  }

  process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch(console.error);
```

**systemd timer 配置**（推荐生产环境）：

```ini
# ~/.config/systemd/user/decay-worker.service
[Unit]
Description=Hawk Bridge Decay Worker
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/hawk-bridge/dist/decay-worker.js
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=60

# ~/.config/systemd/user/decay-worker.timer
[Unit]
Description=Hawk Bridge Decay Worker Timer
After=network.target

[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
# 启用定时器
systemctl --user daemon-reload
systemctl --user enable --now decay-worker.timer

# 查看下次运行时间
systemctl --user list-timers decay-worker.timer
```

### 6.3 各进程间的通信协议

```
┌─────────────────────────────────────────────────────────────────┐
│                     主进程（hawk-bridge）                        │
│   Gateway Hooks / HTTP API / Pipeline Runner                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / Event Bus
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│   Decay Worker    │  │ hawk-memory-api   │  │   External        │
│   (定时触发)       │  │   (Python)        │  │   Clients         │
│                   │  │                   │  │                   │
│ - Cron/Timer      │  │ - /extract        │  │ - REST API       │
│ - Event Bus 订阅   │  │ - /consolidate    │  │ - Webhook        │
│ - 独立资源控制     │  │ - /quality-score  │  │                   │
└───────────────────┘  └───────────────────┘  └───────────────────┘
```

---

## 7. LLM 服务集成层

> **核心改进**：Python LLM 提取从 subprocess execSync 升级为 HTTP Service。
> hawk-memory-api 从「被 Python 脚本调用的工具」变成「正式的微服务」。

### 7.1 当前问题 vs 目标状态

| 维度 | 当前（subprocess） | 目标（HTTP Service） |
|------|------------------|---------------------|
| **错误处理** | 无重试，失败直接抛异常 | 重试 + backoff + circuit breaker |
| **并发控制** | 无限制，可能打爆 LLM API | 请求队列 + rate limit |
| **Timeout** | 无 | 可配置超时 |
| **连接复用** | 每次 exec 重新建连 | HTTP keep-alive |
| **结果缓存** | 无 | LRU 缓存相同文本的提取结果 |
| **健康检查** | 无 | /health 端点 |
| **指标** | 无 | 请求量/延迟/错误率 metrics |

### 7.2 LLM Service 客户端接口

```typescript
/**
 * LLM Service 客户端 — 封装与 hawk-memory-api 的 HTTP 通信
 * 替代当前的 subprocess execSync 调用
 */
interface LLMService {
  /**
   * 从对话文本提取记忆
   * POST /extract
   */
  extract(params: ExtractParams): Promise<ExtractResult>;

  /**
   * 矛盾检测
   * POST /consolidate
   */
  consolidate(params: ConsolidateParams): Promise<ConsolidateResult>;

  /**
   * 质量评估
   * POST /quality-score
   */
  qualityScore(params: QualityScoreParams): Promise<QualityScoreResult>;

  /**
   * 重要性预测
   * POST /import-predict
   */
  importPredict(text: string): Promise<ImportPredictResult>;

  /**
   * 健康检查
   * GET /health
   */
  health(): Promise<boolean>;
}

interface ExtractParams {
  segments: ConversationSegment[];
  sessionId?: string;
  traceId?: string;
  /** 期望的 category 列表（过滤用） */
  categories?: string[];
}

interface ExtractResult {
  candidates: MemoryCandidate[];
  traceId: string;
  processingTimeMs: number;
  cached: boolean;  // 是否命中缓存
}

/**
 * LLM Service 客户端实现 — 带 resilience
 */
class HawkMemoryAPIClient implements LLMService {
  private baseUrl: string;
  private httpClient: fetch;  // 原生 fetch 或 ky/axios
  private retryConfig: RetryConfig;
  private circuitBreaker: CircuitBreaker;
  private cache: LRUCache<string, ExtractResult>;

  constructor(config: LLMServiceConfig) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:8080';
    this.retryConfig = config.retry ?? { attempts: 3, backoff: 'exponential', retryOn: [429, 503] };
    this.circuitBreaker = new CircuitBreaker(5, 30_000);  // 5次失败后断路30s
    this.cache = new LRUCache({ max: 1000, ttl: 60_000 }); // 1分钟缓存
  }

  async extract(params: ExtractParams): Promise<ExtractResult> {
    const cacheKey = this.getCacheKey(params);

    // 1. 尝试缓存命中
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    // 2. 断路器检查
    if (this.circuitBreaker.isOpen()) {
      throw new ServiceUnavailableError('hawk-memory-api circuit breaker open');
    }

    // 3. 带重试的 HTTP 请求
    const result = await this.withRetry(async () => {
      const response = await this.httpClient.post(`${this.baseUrl}/extract`, {
        json: params,
        timeout: 30_000,
        headers: {
          'X-Trace-ID': params.traceId ?? '',
          'X-Session-ID': params.sessionId ?? '',
        },
      });

      if (!response.ok) {
        throw new HTTPError(response.status, await response.text());
      }

      return response.json() as ExtractResult;
    });

    // 4. 写入缓存
    this.cache.set(cacheKey, result);

    return { ...result, cached: false };
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < this.retryConfig.attempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;

        if (!this.shouldRetry(err as Error)) {
          throw err;
        }

        // 指数退避
        const delay = Math.min(
          this.retryConfig.backoff === 'exponential'
            ? 2 ** attempt * 1000
            : this.retryConfig.backoff === 'linear'
            ? attempt * 1000
            : 0,
          30_000  // 最多等 30s
        );

        await sleep(delay);
      }
    }

    // 所有重试都失败 → 打开断路器
    this.circuitBreaker.recordFailure();
    throw lastError!;
  }

  private shouldRetry(err: Error): boolean {
    if (err instanceof HTTPError) {
      return this.retryConfig.retryOn?.includes(err.status) ?? false;
    }
    return true; // 网络错误重试
  }

  private getCacheKey(params: ExtractParams): string {
    return sha256(JSON.stringify(params.segments.map(s => s.text)));
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.httpClient.get(`${this.baseUrl}/health`, { timeout: 5000 });
      return res.ok;
    } catch {
      return false;
    }
  }
}
```

### 7.3 hawk-memory-api HTTP 接口定义

```typescript
/**
 * hawk-memory-api HTTP 接口（FastAPI）
 * 路径前缀：/api/v1
 */

// POST /api/v1/extract
interface ExtractEndpoint {
  body: {
    segments: Array<{ text: string; speaker?: string; timestamp?: number }>;
    session_id?: string;
    categories?: string[];
  };
  response: {
    candidates: Array<{
      id: string;
      canonical_text: string;
      category: string;
      importance: number;
      confidence: number;
      shelf_life: string;
      name: string;
      description: string;
    }>;
    trace_id: string;
    processing_time_ms: number;
  };
}

// POST /api/v1/consolidate
interface ConsolidateEndpoint {
  body: {
    new_memories: Array<{ id: string; text: string; category: string }>;
    related_memories: Array<{ id: string; text: string; category: string; created_at: number }>;
  };
  response: {
    contradiction_detected: boolean;
    contradiction_type: 'preference_change' | 'fact_conflict' | 'outdated' | null;
    analysis: string;
    resolution: string;
    confidence: number;
  };
}

// POST /api/v1/quality-score
interface QualityScoreEndpoint {
  body: {
    query: string;
    recall_results: Array<{ id: string; text: string; relevance: number }>;
    context?: { conversation_history?: string[] };
  };
  response: {
    quality_score: number;
    analysis: string;
    suggestion: string;
  };
}

// GET /health
interface HealthEndpoint {
  response: {
    status: 'ok' | 'degraded';
    model_loaded: boolean;
    gpu_available: boolean;
    uptime_seconds: number;
  };
}
```

### 7.4 LLM Service 配置

```yaml
# hawk-bridge/config.yaml
llm_service:
  # hawk-memory-api 服务地址
  base_url: "http://localhost:8080"

  # HTTP 超时（毫秒）
  timeout_ms: 30_000

  # 重试配置
  retry:
    attempts: 3
    backoff: "exponential"  # "exponential" | "linear" | "none"
    retry_on: [429, 503]   # 状态码触发重试

  # 断路器配置
  circuit_breaker:
    failure_threshold: 5    # 5 次失败后打开
    reset_timeout_ms: 30_000

  # 缓存配置
  cache:
    enabled: true
    max_size: 1000          # 缓存条目数
    ttl_ms: 60_000          # 1 分钟 TTL

  # 健康检查
  health_check:
    enabled: true
    interval_ms: 30_000
    failure_threshold: 3    # 3 次失败后标记为不健康
```

---

## 8. 跨领域功能架构

### 8.1 记忆验证引擎

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

### 8.2 多 Agent 隔离

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

### 8.3 自我认知系统

```typescript
/**
 * Self-Awareness - hawk-bridge 对自己的记忆质量进行评估
 */
interface SelfAwareness {
  captureSuccessRate: number;
  captureNoiseRate: number;
  captureAvgImportance: number;
  captureContestRate: number;
  recallHitRate: number;
  recallMissRate: number;
  recallSilenceRate: number;
  memoryGrowthRate: number;
  noiseRatio: number;
  orphanMemoryRate: number;
  contestedMemoryRate: number;
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

### 8.4 商业化基础设施

```typescript
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

## 9. 实施路线图

### 9.1 阶段划分

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

### 9.2 v2.0 架构改造优先级

| 优先级 | 改造项 | 原因 | 风险 |
|--------|--------|------|------|
| **P0** | Embedder 接口统一化 | 所有 Pipeline 依赖 | 低 |
| **P0** | LLM Service HTTP 客户端 | 替代 subprocess | 低 |
| **P0** | Decay Worker 独立进程 | 解除 OpenClaw 耦合 | 中 |
| **P1** | Pipeline Stage 接口 | 其他所有功能依赖 | 低 |
| **P1** | Pipeline Observer | 可观测性基础 | 低 |
| **P1** | Storage Engine 抽象 | 其他所有功能依赖 | 中 |
| **P2** | Event Bus | Pipeline 间解耦 | 低 |
| **P2** | Schema v2（拆分表） | 解决单表字段爆炸 | 中 |
| **P2** | Capture Pipeline 重构 | 提升提取质量 | 低 |
| **P3** | Recall Pipeline + Rerank | 召回质量提升 | 低 |
| **P3** | Tracing 基础设施 | 可观测性 | 低 |
| **P3** | Self-Awareness | 系统健康诊断 | 低 |

### 9.3 向后兼容策略

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

## 10. 关键技术决策

### 10.1 存储引擎选型

| 方案 | 优势 | 劣势 | 适用场景 |
|------|------|------|---------|
| **LanceDB** | 向量+表格统一，部署简单 | 冷热分层弱，metadata 查询弱 | v1.x-v2.x 热存储 |
| **PostgreSQL + pgvector** | metadata 查询强，支持 JSONB | 向量性能弱于专用向量库 | 元数据 + 混合查询 |
| **Qdrant** | 向量性能极强， filtering 强 | 部署复杂度高 | 大规模向量场景 |
| **S3 + DynamoDB** | 冷存储成本低 | 查询慢 | Archive 层 |

**推荐**：v2.0 采用 LanceDB（热）+ PostgreSQL（metadata + 时序图）+ S3（冷）的三层架构

### 10.2 Event Bus 选型

> **架构原则**：简单场景零门槛，复杂场景可升级。

| 方案 | 优势 | 劣势 | 适用场景 |
|------|------|------|---------|
| **In-Memory + WAL**（默认） | 零依赖，clone 就能跑，延迟最低 | 单实例，断电丢少量事件（<1s），无法水平扩展 | v1.x 单实例 |
| **Redis Streams**（可选升级） | 持久化，消费者组，多实例消费，exactly-once | 需要额外部署 Redis | v2.x 多实例 |
| **Kafka** | 企业级，可靠性极高 | 过度工程，运维极复杂 | 超大规模（>1000 QPS） |

```typescript
interface EventBus {
  publish(channel: string, event: MemoryEvent): Promise<void>;
  subscribe(group: string, consumer: string, handler: (event: MemoryEvent) => Promise<void>): Promise<void>;
  ack(channel: string, group: string, id: string): Promise<void>;
  close(): Promise<void>;
}

class LocalEventBus implements EventBus {
  async publish(channel: string, event: MemoryEvent): Promise<void> {
    if (!this.queue.has(channel)) this.queue.set(channel, []);
    this.queue.get(channel)!.push(event);
    fs.appendFileSync(this.walPath, JSON.stringify({ channel, event }) + '\n');
    const handlers = this.handlers.get(channel);
    if (handlers) await Promise.all([...handlers].map(h => h(event)));
  }
}
```

### 10.3 向量 Embedding 抽象

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
      case 'minimax': return new MiniMaxEmbedder(config);
    }
  }
}
```

### 10.4 Schema 迁移策略

```typescript
// 零停机迁移：在线 schema 变更
class SchemaMigrator {
  // v1.5: 添加新字段（允许 null）
  async phase1(): Promise<void> {}

  // v2.0: 迁移数据（后台执行）
  async phase2(): Promise<void> {}

  // v2.5: 清理旧字段（可选）
  async phase3(): Promise<void> {}
}
```

---

## 11. 架构缺口与未来方向

> 以下 7 大架构缺口、5 个根本性盲区、2 个 LLM 专属护城河，是 v2.x 之后需要持续迭代的方向。

### 11.1 七大架构缺口详解

| 缺口 | 核心问题 | 版本规划 |
|------|---------|---------|
| **Semantic Index** | 无法按「主题/实体/人」查询 | v2.3→v2.8 |
| **Working Memory** | 每次 recall 冷启动 | v2.2→v2.6 |
| **Memory Compiler** | recall 返回列表而非答案 | v2.3→v2.7 |
| **Adaptive Decay** | 纯时间衰减，不考虑访问模式 | v2.3→v2.8 |

#### Adaptive Decay（自适应衰减）— 行业唯一

**为什么是行业唯一**：没有任何其他记忆系统实现了「访问模式驱动的自适应衰减」。MemGPT、Claude Code、Notion AI 都是静态存储。

**与其他系统的本质区别**：

```
其他所有记忆系统：
  记忆永久存储，靠向量相似性检索
  → 问题：噪音记忆越来越多，相关性越来越差

hawk-bridge Adaptive Decay：
  ┌─────────────────────────────────────────┐
  │  访问模式驱动衰减                         │
  │                                         │
  │  频繁访问 ──────────→ 置信度不降反升     │
  │  冷门记忆 ──────────→ 置信度按策略衰减   │
  │  完全遗忘 ──────────→ 自动归档/删除       │
  └─────────────────────────────────────────┘
```

**衰减公式（实际代码实现）**：

```typescript
// decay() 中：newImportance 只和这三个因素相关
newImportance = m.importance                                          // LLM 提取的原始 importance
              * 0.95^(ceil(idleDays * decayMultiplier))              // 时间×可靠性衰减
              * m.importanceOverride                                   // 用户手动调整系数

// decayMultiplier 取决于 reliability（来源可信度）
// reliability >= 0.7 → decayMultiplier = 0.5（高可信衰减慢）
// reliability >= 0.4 → decayMultiplier = 0.7（中可信正常衰减）
// reliability <  0.4 → decayMultiplier = 1.0（低可信快速衰减）
```

**⚠️ 注意：`accessBoost` 不是乘法系数**

文档里之前错误地写了 `importance * 0.95 * accessBoost`。实际 `accessBonus` 是 **0~0.1 的加分项**，参与 composite score 的加权求和，影响 tier 判断，不参与 importance 衰减计算。

**Composite Score 公式（recomputeTier 实际使用）**：

```typescript
// compositeScore = base*0.4 + usefulness*0.3 + recency*0.2 + accessBonus
// 其中 accessBonus = min(log1p(recallCount) * 0.05, 0.1)

accessBonus = min(log1p(recallCount) * 0.05, ACCESS_BONUS_MAX)
//             └─ 对数增长，7次 recall 后封顶（0.1）

// 权重常量
WEIGHT_BASE         = 0.4  // importance 权重
WEIGHT_USEFULNESS   = 0.3  // 有用性权重
WEIGHT_RECENCY      = 0.2  // 时间衰减权重
ACCESS_BONUS_MAX    = 0.1  // 访问奖励上限

// recency：指数衰减，30天半衰期
recency = exp(-daysIdle * ln(2) / 30)
```

**Adaptive 的真正机制（Tier 保护逻辑）**：

```
┌─────────────────────────────────────────────────────────────┐
│  Adaptive 的真正机制靠的是 permanent tier 保护：             │
│                                                             │
│  if (compositeScore >= 0.85 AND recallCount >= 3)          │
│    → tier = 'permanent'                                    │
│    → 这条记忆不参与 decay 流程，不衰减                     │
│                                                             │
│  否则按正常公式衰减：                                       │
│    newImportance = importance * 0.95^(idleDays * dm)      │
│                                                             │
│  效果：                                                    │
│    访问越多（recall ≥ 3）→ compositeScore ↑ → permanent  │
│    → 不衰减                                                │
│    冷门记忆 → 永远是 decay/stable → 持续衰减直到删除       │
└─────────────────────────────────────────────────────────────┘
```

**Tier 分层（实际实现）**：

| Tier | 条件 | 衰减策略 |
|------|------|---------|
| **permanent** | compositeScore ≥ 0.85 **AND** recallCount ≥ 3 | ❌ 不衰减，不参与 decay 流程 |
| **stable** | compositeScore ≥ 0.6 | ❌ 不衰减（但会参与 decay 检查） |
| **decay** | compositeScore ≥ 0.3 | ✅ 按 `importance × 0.95^(idleDays×dm)` 衰减 |
| **archived** | compositeScore < 0.3 | ⏳ 等待 ARCHIVE_TTL_DAYS（180天）后删除 |

**冷启动保护**：新 memory 有 7 天 grace period，期间衰减减半（`COLD_START_DECAY_MULTIPLIER = 0.5`）。

**与其他系统的对比**：

| 系统 | 衰减方式 | 自适应 |
|------|---------|--------|
| 其他系统 | ❌ 无衰减 | - |
| MemGPT | ⚠️ 层次化（热/冷），固定阈值 | ❌ |
| Claude Code | ⚠️ MEMORY.md 索引，无衰减 | ❌ |
| **hawk-bridge Adaptive Decay** | ✅ permanent tier 保护 + 访问频率影响 tier 判断 | ✅ |

| **Recall Suppression** | 无细粒度可见性控制 | v2.2→v2.6 |
| **Lifecycle State Machine** | 状态转换无约束 | v2.2→v2.6 |
| **Memory Exchange** | 无导入/导出/增量同步 | v2.2→v2.6 |

详细设计见第 5 章（Pipeline）和第 6 章（组件拆分）。

#### Semantic Index

```typescript
interface SemanticIndex {
  topics: Map<string, TopicNode>;
  entities: Map<string, EntityProfile>;
  persons: Map<string, PersonMemoryModel>;

  indexMemory(memoryId: string, topic: string, entities: string[], persons: string[]): void;
  queryByTopic(topic: string, recursive?: boolean): string[];
  queryByEntity(entityId: string): string[];
  queryByPerson(personId: string): string[];
}
```

#### Working Memory

```typescript
interface WorkingMemory {
  sessionId: string;
  activeSlots: Array<WorkingSlot | null>;  // 最多 7 个槽位
  contextStack: string[];

  promote(memory: MemoryEntry): void;
  demote(memoryId: string): void;
  consolidate(): ConsolidatedMemory[];
  getActive(): MemoryEntry[];
}

class WorkingMemoryManager {
  getOrCreate(sessionId: string): WorkingMemory;
  沉淀ToLTM(memoryId: string): Promise<void>;
  preload(sessionId: string, context: string): Promise<void>;
}
```

#### Memory Compiler

```typescript
interface MemoryCompiler {
  compile(memories: RetrievedMemory[], query: string): CompiledOutput;
}

interface CompiledOutput {
  primary: string;
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

#### 记忆进化（Raw→Pattern→Principle→Skill）— soul-engine 负责

> **注意**：记忆进化不由 hawk-bridge 实现，而是由 soul-engine 调用 hawk-bridge 的 recall/capture API 完成原料加工，再写回 hawk-bridge 存储。

**四层进化详解**：

```
Layer 0: Raw Memory（原始记忆）
  定义：未经加工的对话片段，直接从对话中 capture 来的原始文本
  特征：散乱、碎片化、重复、无结构
  示例：
    mem_001: "张总在3月15日说要用飞书沟通"
    mem_002: "今天张总再次确认飞书是首选"
    mem_003: "行政部也已经全员开通飞书"
    mem_004: "张总认为飞书比钉钉体验好"
    mem_005: "飞书消息已读功能很重要"

Layer 1: Pattern（模式）
  定义：从多条相似的 Raw Memory 中提炼出的重复结构
  触发条件：minSimilarMemories: 3, minConfidence: 0.7
  提炼过程：LLM 归纳多条相似记忆的共同结构
  结果：
    Pattern #p_001 {
      content: "张总倾向于使用飞书作为团队主要沟通工具"
      sourceMemoryIds: [mem_001, mem_002, mem_003, mem_004, mem_005]
      confidence: 0.85
      usageCount: 0
    }

Layer 2: Principle（原则）
  定义：被反复使用、验证过的 Pattern 晋升成的行动准则
  晋升条件：minPatternUsage: 10, minValidation: 3
  什么是"使用"：Agent 决策时引用 Pattern → usageCount++
  结果：
    Principle #pr_001 {
      content: "决策者倾向使用自己偏好的工具，应尊重这一偏好优先选用"
      sourcePatternIds: [pat_001]
      evidence: [场景1验证, 场景2验证, 场景3验证]
      confidence: 0.92
    }

Layer 3: Skill（技能）
  定义：经过多次成功验证的 Principle 实例化成的可执行操作
  实例化条件：minValidation: 5, minSuccessRate: 0.8
  什么是"成功"：Agent 引用 Principle 做了决策 → 执行成功
  结果：
    Skill #sk_001 {
      content: "决策者倾向使用自己偏好的工具..."
      implementation: "当需要为决策者选择工具时：
        1. 识别团队中的决策者
        2. 询问或回溯其历史工具偏好
        3. 优先选择其偏好的工具"
      triggerConditions: "涉及工具选择的决策场景"
      successRate: 0.85
    }
```

**进化流程图**：

```
                    ┌─────────────────────────────────────┐
                    │            Raw Memory              │
                    │  (mem_001 ~ mem_xxx)             │
                    │                                   │
                    │  "张总说用飞书"                   │
                    │  "张总确认飞书"                   │
                    │  "行政部开通飞书"                 │
                    │  "张总觉得飞书比钉钉好"           │
                    │  "飞书已读功能重要"               │
                    └────────────────┬──────────────────┘
                                     │ LLM 归纳
                                     ▼
                    ┌─────────────────────────────────────┐
                    │              Pattern                │
                    │  "张总倾向使用飞书作为主要沟通工具"  │
                    │                                   │
                    │  source: [mem_001...mem_005]        │
                    │  confidence: 0.85                  │
                    │  usageCount: 0                    │
                    └────────────────┬──────────────────┘
                                     │ 被引用 ≥ 10 次
                                     │ 被 ≥ 3 场景验证
                                     ▼
                    ┌─────────────────────────────────────┐
                    │             Principle               │
                    │  "决策者偏好应作为工具选择的首要因素" │
                    │                                   │
                    │  evidence: [场景1, 场景2, 场景3]      │
                    │  confidence: 0.92                  │
                    └────────────────┬──────────────────┘
                                     │ 验证 ≥ 5 次
                                     │ 成功率 > 80%
                                     ▼
                    ┌─────────────────────────────────────┐
                    │               Skill                 │
                    │  "ToolSelectionByDecisionMaker"     │
                    │                                   │
                    │  implementation: [步骤1, 2, 3]       │
                    │  triggerConditions: "工具选择决策" │
                    │  successRate: 0.85                 │
                    └─────────────────────────────────────┘
```

**三层阈值配置**（soul-engine）：

```yaml
# soul-engine 进化阈值配置
pattern_threshold:
  min_similar_memories: 3      # 至少 3 条相似记忆
  min_confidence: 0.7         # 平均置信度 > 70%

principle_threshold:
  min_pattern_usage: 10       # Pattern 被引用 ≥ 10 次
  min_validation: 3           # 被 ≥ 3 个不同场景验证

skill_threshold:
  min_validation: 5           # 被 ≥ 5 个 Agent 验证
  min_success_rate: 0.8       # 成功率 > 80%
```

**信息密度提升**：

| 层级 | 条目数 | 信息量 | 单位信息价值 |
|------|--------|--------|------------|
| Raw Memory | 100 条 | 100 个碎片 | 1x |
| Pattern | 10 个 | 10 个结构 | 10x |
| Principle | 3 个 | 3 个准则 | 33x |
| Skill | 1 个 | 1 个可执行操作 | 100x |

**与其他系统的本质区别**：

```
其他所有记忆系统：
  存「说过的话」→ 永远只是对话日志

hawk-bridge + soul-engine：
  Raw Memory ──→ Pattern ──→ Principle ──→ Skill
  散乱数据       结构化模式    行动准则      可执行技能

效果：
  - Agent 对话时召回 2 个 Principle + 1 个 Skill
  - 不是 50 条碎片，而是一段连贯的上下文
  - 记忆越多越聪明，不是越多越噪音
```

### 11.2 五个根本性盲区

| 盲区 | 根因 | 突破方向 |
|------|------|---------|
| 记忆定义仍是文本块 | 假设「记忆 = 文本 + 向量」 | 四平面模型（v3.x） |
| 记忆是存储单位非学习单位 | 存储「说过的话」非「学到的东西」 | Learning Unit + Skill |
| recall 是 query 驱动非任务驱动 | recall = 「找相关的」非「任务需要」 | Task-Aware Recall |
| 遗忘是删除非替代 | 假设「旧=错，新=对」 | Deprecation 语义 |
| 系统没有自我监控 | 监控使用数据非认知状态 | Self-Awareness Memory |

### 11.3 LLM 团队专属护城河（#107/#108）

#### #107 记忆原生 Attention

```typescript
interface MemoryAttentionRouter {
  // 输入：每条记忆的 metadata
  // 输出：每条记忆的 attention weight
  // contested记忆 → 自动降权 50%
  // importance=0.9 → 权重 × 1.5
  // fresh=true → 权重 × 1.2
  // lineage_depth>2 → 权重 × 0.7
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

#### #108 专用小模型矩阵

| 模型 | 大小 | 用途 | 延迟目标 |
|------|------|------|---------|
| **Consolidation-Mini** | 7B | 矛盾检测、记忆整合 | <5s |
| **Distillation-Mini** | 7B | Raw→Pattern 蒸馏 | <5s |
| **Quality-Score** | 3B | 评估 recall 质量 | <100ms |
| **ImportPredict** | 1B | 预测新记忆重要性 | <50ms |
| **TimeReasoner** | 3B | 时序因果推理 | <200ms |

---

## 12. 落地施工指南

> **目标**：将架构设计转化为可操作的施工任务。
> 每个任务都有明确的输入、输出、验收标准。

### 12.1 v1.5 阶段 — 架构基础设施（最高 ROI）

#### Task A: Embedder 接口统一化（P0）

**当前问题**：`embeddings.ts` 里 switch-case 硬编码 provider。

**施工内容**：
```
输入：src/embeddings.ts
输出：src/embeddings/（新目录）
├── index.ts          — 导出 Embedder 接口 + Factory
├── types.ts          — Embedder 接口定义
├── providers/
│   ├── openai.ts
│   ├── jina.ts
│   ├── ollama.ts
│   └── minimax.ts
```

**验收标准**：
```typescript
// 任意 provider 可以无缝切换
const embedder = EmbedderFactory.create(config.embedding);
const vectors = await embedder.embed(['text']);  // provider 透明
const dims = embedder.dimensions();              // 接口方法可用
```

---

#### Task B: LLM Service HTTP 客户端（P0）

**当前问题**：`subprocess execSync` 调用 Python 脚本，无 resilience。

**施工内容**：
```
输入：src/hooks/hawk-capture/handler.ts（当前 execSync 调用点）
输出：src/services/llm-service.ts（新建）
├── HawkMemoryAPIClient   — HTTP 客户端，带 retry/circuit breaker/cache
├── types.ts              — ExtractParams / ExtractResult 等接口
├── errors.ts             — ServiceUnavailableError / HTTPError
```

**验收标准**：
```typescript
const client = new HawkMemoryAPIClient({ baseUrl: 'http://localhost:8080' });
const result = await client.extract({ segments: [...] });

// 1. HTTP 500 → 自动重试 3 次
// 2. 连续 5 次失败 → 断路器打开，30s 内不调用
// 3. 相同文本 1 分钟内不重复调用（缓存）
// 4. traceId 透传到 hawk-memory-api
```

---

#### Task C: Decay Worker 独立进程（P0）

**当前问题**：Decay 耦合在 OpenClaw hook 里，不定时执行。

**施工内容**：
```
输入：src/hooks/hawk-decay/handler.ts
输出：src/workers/decay-worker/
├── index.ts              — 入口，CLI
├── DecayWorker.ts        — 主类
├── stages/
│   ├── TierMaintenanceStage.ts
│   ├── DecayCalculatorStage.ts
│   ├── OrphanDetectorStage.ts
│   ├── ArchiveMigratorStage.ts
│   └── GarbageCollectorStage.ts
├── systemd/
│   ├── decay-worker.service
│   └── decay-worker.timer
```

**验收标准**：
```bash
# 手动运行
node dist/decay-worker.js
# 输出 JSON 格式报告
{
  "traceId": "xxx",
  "tiers": [...],
  "archived": 42,
  "deleted": 3,
  "errors": [],
  "durationMs": 1234
}

# systemd timer 每小时自动运行
systemctl --user list-timers | grep decay-worker
# NEXT                            | LEFT          | UNIT
# Wed 2026-04-22 15:00:00 CST    | 42min left    | decay-worker.timer
```

---

#### Task D: Pipeline Stage 接口（P1）

**当前问题**：Capture/Recall 逻辑是硬编码调用链，无法单独测试/替换。

**施工内容**：
```
输入：src/hooks/hawk-capture/handler.ts（硬编码逻辑）
输出：
src/pipeline/
├── core/
│   ├── PipelineRunner.ts       — 执行引擎
│   ├── PipelineContext.ts      — 上下文
│   └── types.ts                — Stage 接口
├── observers/
│   ├── PipelineObserver.ts     — 接口定义
│   ├── LoggingObserver.ts
│   ├── TracingObserver.ts
│   └── MetricsObserver.ts
├── capture/
│   ├── stages/
│   │   ├── InputNormalizerStage.ts
│   │   ├── TextSegmenterStage.ts
│   │   ├── LLMExtractionStage.ts
│   │   ├── ShelfLifeDetectionStage.ts
│   │   ├── DeduplicationStage.ts
│   │   ├── EmbeddingStage.ts
│   │   └── StorageWriteStage.ts
│   └── CapturePipelineFactory.ts
├── recall/
│   └── ...（类似结构）
```

**验收标准**：
```typescript
// Stage 可单独测试
const stage = new DeduplicationStage();
const output = await stage.process(inputCandidates, mockContext);
assert(output.length < inputCandidates.length);  // 有去重效果

// Observer 可注入
const pipeline = new PipelineRunner('capture', stages, [
  new LoggingObserver(),
  new MetricsObserver(),  // 可以加/减 observer
]);

// Stage 可替换
const pipeline = new PipelineRunner('capture', [
  new InputNormalizerStage(),
  new MyCustomSegmenterStage(),  // 替换默认实现
  new LLMExtractionStage(llmService),
  ...
]);
```

---

#### Task E: Pipeline Observer（P1）

**当前问题**：每个 Stage 的输入/输出/耗时没有记录，出问题无法定位。

**施工内容**：
- 实现 `LoggingObserver`（所有 Stage 日志）
- 实现 `TracingObserver`（分布式 trace）
- 实现 `MetricsObserver`（Prometheus metrics）
- 集成到 `PipelineFactory`

**验收标准**：
```typescript
// 日志输出示例
{
  "level": "info",
  "msg": "Stage complete",
  "pipeline": "capture",
  "stage": "llm_extraction",
  "durationMs": 234,
  "inputSize": 1523,
  "outputSize": 892
}

// Prometheus metrics 示例
# HELP hawk_pipeline_stage_duration_seconds Duration of pipeline stage execution
# TYPE hawk_pipeline_stage_duration_seconds histogram
hawk_pipeline_stage_duration_seconds_bucket{pipeline="capture",stage="llm_extraction",le="0.1"} 12
hawk_pipeline_stage_duration_seconds_bucket{pipeline="capture",stage="llm_extraction",le="0.5"} 45
hawk_pipeline_stage_duration_seconds_sum{pipeline="capture",stage="llm_extraction"} 123.45
hawk_pipeline_stage_duration_seconds_count{pipeline="capture",stage="llm_extraction"} 67

# HELP hawk_pipeline_stage_count_total Number of stage executions
# TYPE hawk_pipeline_stage_count_total counter
hawk_pipeline_stage_count_total{pipeline="capture",stage="llm_extraction",status="success"} 65
hawk_pipeline_stage_count_total{pipeline="capture",stage="llm_extraction",status="error"} 2
```

---

### 12.2 v2.0 阶段 — 核心功能

| 任务 | 输入 | 输出 | 验收标准 |
|------|------|------|---------|
| Storage Engine 抽象 | src/store/interface.ts | src/storage/（新目录）+ LanceDB/Pg/S3 adapter | 切换存储引擎只需改配置 |
| Event Bus 实现 | - | src/event-bus/（Local + Redis Streams） | 切换 Event Bus 只需改配置 |
| Schema v2 迁移 | src/types.ts | 4 张新表（Core/Metadata/Score/Trace） | 零停机迁移脚本 |
| Capture Pipeline 重构 | handler.ts | Pipeline Stage 实现 | 全量通过现有测试 |
| Recall Pipeline + Rerank | retriever.ts | RecallPipeline Stage 实现 | 全量通过现有测试 |
| Tracing 基础设施 | - | OpenTelemetry 集成 | traceId 透传整个调用链 |
| Self-Awareness | - | 健康度报告 + 告警 | 噪音率/召回错误率可查 |

---

### 12.3 验收测试清单

每个任务完成后，必须通过以下测试：

```bash
# 1. 现有测试全量通过
pnpm test

# 2. 类型检查通过
pnpm typecheck

# 3. Lint 通过
pnpm lint

# 4. Benchmark（如果涉及性能）
pnpm benchmark

# 5. 集成测试（如果涉及新组件）
pnpm test:integration

# 6. Decay Worker 手动运行
node dist/decay-worker.js  # 输出 JSON 报告，无报错
```

---

### 12.4 TODO 与落地任务的映射

| 落地任务 | 对应 TODO | 优先级 | 说明 |
|---------|----------|--------|------|
| Task A: Embedder 接口 | #47 | P0 | Storage Engine 的前置依赖 |
| Task B: LLM Service HTTP | #60 规则引擎核心 | P0 | 所有 LLM 调用走 HTTP |
| Task C: Decay Worker | #63, #66, #69, #70 | P0 | 解耦 OpenClaw |
| Task D: Pipeline Stage 接口 | #16 Hook 系统完善 | P1 | 基础设施 |
| Task E: Pipeline Observer | #74 自我监控 | P1 | 可观测性 |
| Sync 协议（v2.x） | #51 | v2.x | 简化版先做 |
| RecallFinalizerStage（v2.3） | #72, #102 | v2.3 | Recall 输出列表→答案 |
| Multi-tenant 隔离 | #39, #50, #52 | v2.x | API Gateway 层 |

### 12.5 阻断性缺口专项说明

#### 缺口 1：RecallFinalizerStage（v2.3）

```typescript
// RecallFinalizerStage — 将记忆列表编译为答案
// 位置：Recall Pipeline 最末端（CrossEncoderRerankStage 之后）
class RecallFinalizerStage implements PipelineStage<MemoryCandidate[], CompiledRecallResult> {
  name = 'memory_compiler';

  async process(memories: MemoryCandidate[], ctx: PipelineContext): Promise<CompiledRecallResult> {
    // 1. 检测是否有冲突记忆
    const conflicts = this.detectConflicts(memories);

    // 2. LLM 综合（调用 hawk-memory-api）
    const summary = await this.llmService.summarize({
      memories: memories.map(m => ({ id: m.id, text: m.text })),
      query: ctx.config.query ?? '',
    });

    // 3. 构建输出
    return {
      answer: summary.text,
      sources: memories.map(m => ({ memoryId: m.id, text: m.text, relevance: m.score })),
      compileType: conflicts.length > 0 ? 'conflict' : summary.type,
      recallReason: summary.reason,
      warnings: conflicts.map(c => `冲突: ${c.local} vs ${c.remote}`),
    };
  }
}
```

**施工检查点**：
- [ ] `CompiledRecallResult` 接口定义
- [ ] `RecallFinalizerStage` 实现（LLM 综合）
- [ ] Recall Pipeline 组装时加入该 Stage
- [ ] 质量反馈闭环：用户标记「答案有用/无用」→ 记录到 MemoryScore.usefulness_score

#### 缺口 2：Sync 协议（v2.x 简化版）

```typescript
// 简化版 Sync — 设备注册 + 增量同步 + 最新写入覆盖
// 不做：CRDT 语义冲突解决

class SyncModule {
  async deltaExport(since: number): Promise<SyncDelta> {
    const changed = await this.storage.getMemoriesChangedSince(since);
    return { memories: changed, exportedAt: Date.now() };
  }

  async deltaImport(delta: SyncDelta): Promise<ImportReport> {
    const conflicts: SyncConflict[] = [];

    for (const remote of delta.memories) {
      const local = await this.storage.getMemoryById(remote.id);

      if (!local) {
        // 不存在 → 直接写入
        await this.storage.createMemory(remote);
      } else if (local.updated_at < remote.updated_at) {
        // 远程更新 → 覆盖本地
        await this.storage.updateMemory(remote);
      } else if (local.updated_at > remote.updated_at) {
        // 本地更新 → 保留本地（冲突记录）
        conflicts.push({
          memoryId: remote.id,
          localVersion: local,
          remoteVersion: remote,
          occurredAt: Date.now(),
          resolvedBy: 'local',  // 简化策略：本地优先
        });
      }
      // updated_at 相等 → 跳过
    }

    return { imported: delta.memories.length - conflicts.length, conflicts };
  }
}
```

**施工检查点**：
- [ ] `DeviceRegistry` — 设备注册表（tenant_id + device_id）
- [ ] `SyncDelta` — 增量包格式（序列号 or timestamp based）
- [ ] `SyncConflict` — 冲突记录（用于用户手动查看）
- [ ] Sync API 端点（`POST /api/v1/sync/delta-export`, `POST /api/v1/sync/delta-import`）

#### 缺口 3：Multi-tenant 隔离

```typescript
// API Gateway 中间件 — 注入 TenantContext
class TenantMiddleware {
  async handle(req: Request, next: Handler): Promise<Response> {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return new Response('Missing tenant', { status: 401 });

    // 注入到 context
    const ctx = { ...req.context, tenantId };

    // 所有 Storage Engine 调用自动带 tenant filter
    return next({ ...req, context: ctx });
  }
}

// Storage Engine — 所有接口增加 tenantId filter
interface StorageEngine {
  vectorSearch(query: number[], topK: number, filter?: Filter & { tenantId?: string }): Promise<string[]>;
  createMemory(core: MemoryCore, tenantId: string): Promise<string>;
}

// Embedder — 按 tenant 隔离（或使用 tenant-aware embedding）
class TenantAwareEmbedder implements Embedder {
  async embed(texts: string[], tenantId: string): Promise<number[][]> {
    // 如果是共享 embedding provider，按 tenant_id 在向量层面做归一化
    // 如果是 per-tenant model，用 tenantId 选择对应的 model
    const vectors = await this.baseEmbedder.embed(texts);
    return vectors.map(v => this.normalize(v, tenantId));
  }
}
```

**施工检查点**：
- [ ] `TenantContext` 类型定义
- [ ] API Gateway TenantMiddleware
- [ ] Storage Engine 所有接口加 tenantId filter
- [ ] Embedder tenant-aware 封装
- [ ] QuotaManager 实现（#50 Storage Quota）

---

### 12.6 文件结构（v2.0 目标）

```
hawk-bridge/
├── src/
│   ├── index.ts                    # 主入口（Gateway Hook 注册）
│   ├── config.ts                   # 配置加载
│   │
│   ├── pipeline/                   # ★ 新增：Pipeline 架构
│   │   ├── core/
│   │   │   ├── PipelineRunner.ts
│   │   │   ├── PipelineContext.ts
│   │   │   └── types.ts
│   │   ├── observers/
│   │   │   ├── PipelineObserver.ts
│   │   │   ├── LoggingObserver.ts
│   │   │   ├── TracingObserver.ts
│   │   │   └── MetricsObserver.ts
│   │   ├── capture/
│   │   │   └── CapturePipelineFactory.ts
│   │   └── recall/
│   │       └── RecallPipelineFactory.ts
│   │
│   ├── services/                   # ★ 新增：服务层
│   │   ├── llm-service.ts          # HTTP 客户端（替代 subprocess）
│   │   └── types.ts
│   │
│   ├── storage/                    # ★ 重构：存储引擎
│   │   ├── StorageEngine.ts        # 接口
│   │   ├── LanceDBEngine.ts
│   │   ├── PostgreSQLEngine.ts
│   │   └── S3ArchiveEngine.ts
│   │
│   ├── event-bus/                  # ★ 新增：Event Bus
│   │   ├── EventBus.ts             # 接口
│   │   ├── LocalEventBus.ts         # 默认实现
│   │   └── RedisStreamsBus.ts       # 可选升级
│   │
│   ├── workers/                    # ★ 新增：独立进程
│   │   └── decay-worker/
│   │       ├── index.ts
│   │       ├── DecayWorker.ts
│   │       └── stages/
│   │
│   ├── embeddings/                 # ★ 重构：Embedder
│   │   ├── types.ts
│   │   ├── index.ts
│   │   └── providers/
│   │       ├── openai.ts
│   │       ├── jina.ts
│   │       └── ollama.ts
│   │
│   ├── hooks/                      # OpenClaw Hook（保持不变）
│   │   ├── hawk-recall/
│   │   ├── hawk-capture/
│   │   └── hawk-decay/             # Decay hook 降级为触发器
│   │
│   ├── store/                      # 兼容层（旧接口，逐步迁移）
│   │   └── adapters/
│   │
│   ├── retriever.ts                # 迁移到 Pipeline/recall/
│   ├── embeddings.ts                # 迁移到 embeddings/
│   └── ...
│
├── scripts/
│   └── migrate-schema-v2.ts        # Schema 迁移脚本
│
├── systemd/
│   ├── decay-worker.service
│   └── decay-worker.timer
│
└── config.yaml
```

---

## 附录

### 附录 A：架构缺口汇总表

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

# TODO — hawk-bridge v1.2+ Backlog

> Priority: **high** = 🔴阻断 / 🟡重要 / 🟢增强
> Last updated: 2026-04-15（参考 Hermes Agent 对比分析）

---

## 🔴 高优先级 — 核心能力差距

### [ ] MemoryManager 编排层
**来源：Hermes MemoryManager — 多 provider 协调机制**

当前 hawk-bridge 是单一 adapter，没有"编排层"概念。Hermes 的 MemoryManager 同时支持：
- 一个内置 provider（始终活跃）
- 一个外部 plugin provider（按配置切换）

这对 autoself L6 编排很重要——hawk-bridge 作为 L0 记忆层，需要能同时被 agent-brain 和 soul-force 等多个组件接入。

**实现方向**：
```typescript
// hawk-bridge 的 MemoryManager 接口
interface MemoryManager {
  addProvider(provider: MemoryProvider): void;  // 最多1个外部
  prefetch(query: string): Promise<string>;   // 背景召回
  sync(turn: Turn): Promise<void>;             // 写后同步
  buildSystemPrompt(): string;                 // 拼接 system prompt block
}
```
**状态**：🟡 待设计

---

### [ ] Background Prefetch 模式
**来源：Hermes `queue_prefetch()` + `prefetch()` 异步预取**

当前 hawk-bridge 的 `recall()` 是同步调用。Hermes 的做法：
- 每轮对话结束后调用 `queue_prefetch(query)` 预排下一轮需要的记忆
- 下一轮 API 调用前才执行 `prefetch()`，利用等待时间并行召回
- 返回结果用 `<memory-context>` 包裹，防止模型把记忆当作用户输入

**实现方向**：
```typescript
// recall hook 改造
async function queuePrefetch(query: string): Promise<void>;
async function prefetchRecall(query: string): Promise<MemoryContext>;
```
**收益**：recall 延迟从阻塞变成并行，响应速度提升
**状态**：🟡 待实现

---

### [ ] Context Fencing（记忆上下文隔离）
**来源：Hermes `<memory-context>` fence 标签机制**

Hermes 用 XML fence 标签把召回的记忆包裹起来：
```
<memory-context>
[System note: The following is recalled memory context, NOT new user input...]
...记忆内容...
</memory-context>
```
这样模型能识别这是背景信息而非用户新输入。

**实现方向**：
- hawk-capture 在存储时给记忆打标签（source: "memory"）
- hawk-recall 在返回 recall 结果时包裹 fence
- 系统 prompt 里说明 fence 的含义
**状态**：🟡 待实现

---

### [ ] Session Insights（会话洞察）
**来源：Hermes `InsightsEngine` — 会话历史分析**

Hermes 会分析历史会话数据，产出：
- token 消耗趋势
- 工具使用模式
- 活跃时间规律
- 模型/平台分布

对 autoself 的价值：tangseng-brain 做成本收益分析需要知道"这个问题多久出现一次"。

**实现方向**：
```json
{
  "insights": {
    "top_patterns": [...],
    "token_trend": [...],
    "active_hours": {...}
  }
}
```
**状态**：🟡 新需求，待实现

---

## 🟡 中优先级 — L5/L6 支撑能力

### [ ] Skill Auto-Creation（技能自动创建）
**来源：Hermes 自主创建 Skills 的能力**

Hermes 能在复杂任务完成后自动创建 Skill（SKILL.md），供后续复用。

对 autoself 的价值：
- 如果 L3 agent 反复处理同一类问题，agent-brain 应该能自动沉淀成一个 reusable skill
- tangseng-brain 发现的 pattern → 自动写成 SOUL.md 条目 → 如果重复多次 → 沉淀成正式 Skill

**实现方向**：
```typescript
// 当同一类任务出现 ≥3 次时，自动创建 skill
async function createSkillFromPattern(pattern: LearnedPattern): Promise<Skill>;
// 输出：~/.hawk/skills/{pattern-name}/SKILL.md
```
**前置依赖**：MemoryManager
**状态**：🟡 待设计

---

### [ ] Skills Hub 兼容层
**来源：Hermes Skills Hub — agentskills.io 兼容技能市场**

Hermes 的 Skills 支持：
- YAML frontmatter（name/description/platforms/tags）
- agentskills.io 开放标准
- `prerequisites.env_vars` / `prerequisites.commands` 依赖声明
- 平台过滤（`platforms: [linux, macos]`）
- 安装计数 / 评分

对 autoself 的价值：hawk-bridge 将来作为 Skill 执行环境，需要兼容 Hermes 的技能格式。

**实现方向**：
- hawk-bridge 的 skills 目录支持 `SKILL.md` + frontmatter 标准
- 提供 `hawk skills list` / `hawk skills install` 命令
**前置依赖**：Skill Auto-Creation
**状态**：🟡 规划中

---

### [ ] 自动记忆压缩（Auto-Compression）
**来源：Hermes ContextCompressor — 上下文满时自动压缩**

当对话 token 接近模型上限，Hermes 自动：
- 保护前 N 轮和最后 N 轮（重要上下文不丢失）
- 对中间部分做 LLM summarization
- 构建 conversation DAG 保留逻辑依赖

**实现方向**：
- hawk-bridge 提供 `summarize(conversation)` 接口
- 与 hawk-recall 的 rerank 能力结合：优先召回被压缩的记忆的摘要
**前置依赖**：Insights Engine（需要知道何时触发）
**状态**：🟡 规划中

---

### [ ] Honcho 风格 User Modeling（用户建模）
**来源：Hermes Honcho dialectic user modeling**

Hermes 通过对话历史持续构建用户模型：
- 交流偏好（简洁 / 详细）
- 技术深度（专家 / 入门）
- 工作节奏（快速迭代 / 深思熟虑）

对 autoself 的价值：soul-force 更新 USER.md 需要更结构化的用户模型，而不是零散的记忆碎片。

**实现方向**：
```json
{
  "user_model": {
    "verbosity": "concise",
    "tech_depth": "expert",
    "communication_style": "direct",
    "preferred_language": "zh"
  }
}
```
**前置依赖**：Insights Engine
**状态**：🟡 规划中

---

## 🟢 低优先级 — 已有但可增强

### [x] ~~Log file output~~ — pino 已经在 v1.1 解决
### [x] ~~Prometheus metrics~~ — v1.1 已加
### [x] ~~Health endpoint~~ — v1.1 已加

### [ ] 增强的 Health Alerting（已有基础，增强版）
**当前**：health check 返回 `degraded` 但不通知
**Hermes 启示**：system-health-monitor 应该能根据健康状态触发不同动作（P0 告警 / P1 巡检 / P2 记录）

**实现方向**：
```typescript
interface HealthAlert {
  severity: "P0" | "P1" | "P2";
  target: string;
  action: "notify" | "inspect" | "log";
}
```
**状态**：🟢 增强，已有基础

---

### [ ] Multi-tenant Namespace（多租户）
**来源：Hermes profile 隔离机制**

Hermes 用 `HERMES_HOME` + profile 概念实现多租户隔离。

对 hawk-bridge 的价值：
- autoself 的多个 agent（悟空/八戒/白龙）可以有独立的记忆空间
- 不同项目（hawk-bridge vs 其他）数据隔离

**实现方向**：
```typescript
interface MemoryStore {
  withTenant(tenantId: string): MemoryStore;  // 租户隔离
}
```
**状态**：🟢 规划中

---

### [ ] Batch Write API（`storeMany`）
**已在 TODO 中**：降低多次 insert 的网络开销
**状态**：🟢 待实现

---

## 📊 Hermes vs hawk-bridge 功能对比

| 功能 | Hermes Agent | hawk-bridge | 差距 |
|------|-------------|-------------|------|
| 记忆存储 | ✅ LanceDB + SQLite | ✅ LanceDB | 相当 |
| 向量召回 | ✅ | ✅ | 相当 |
| FTS 搜索 | ✅ FTS5 | ✅ FTS | 相当 |
| 记忆去重 | ✅ | ✅ | 相当 |
| Decay 衰减 | ✅ | ✅ | 相当 |
| **MemoryManager 编排** | ✅ 多provider | ❌ 单一adapter | 🔴 差距 |
| **Background Prefetch** | ✅ async | ❌ 同步 | 🔴 差距 |
| **Context Fencing** | ✅ `<memory-context>` | ❌ 无 | 🔴 差距 |
| **Session Insights** | ✅ 完整分析 | ❌ 无 | 🔴 差距 |
| **Skill Auto-Creation** | ✅ 自动创建 | ❌ 无 | 🟡 差距 |
| **Skills Hub 兼容** | ✅ agentskills.io | ❌ 无 | 🟡 差距 |
| **User Modeling** | ✅ Honcho | ❌ 无 | 🟡 差距 |
| **Cron Scheduling** | ✅ 内置 | ❌ 依赖外部 | 🟡 差距 |
| **多租户** | ✅ profiles | ❌ 无 | 🟡 差距 |
| **Auto-Compression** | ✅ ContextCompressor | ❌ 无 | 🟡 差距 |
| **Memory Provider 插件** | ✅ plugin 系统 | ❌ 无 | 🟡 差距 |

---

## 🚀 推荐实现顺序

```
Phase 1（立即）:
  1. MemoryManager 接口定义 — 所有其他能力的基础
  2. Background Prefetch — 性能提升，立即可见

Phase 2（L6 支撑）:
  3. Context Fencing — L6 编排必须
  4. Session Insights — tangseng-brain 成本分析的输入

Phase 3（进化支撑）:
  5. Skill Auto-Creation — autoself L5 进化的输出落地
  6. User Modeling — soul-force USER.md 的结构化

Phase 4（长期）:
  7. Skills Hub 兼容层
  8. Auto-Compression
  9. Multi-tenant
```

---

## Done ✅

- v1.1: 9 core improvements (retry, backup, pagination, structured logging, health endpoint, doctor connectivity test, reranking, prometheus metrics, config versioning)
- v1.0: Initial release with LanceDB + Ollama/Xinference support
- v1.2: 4项关键修复 — isDuplicate search覆盖全量记忆, retriever rerank顺序, lancedb update直接SQL, http adapter update不再静默delete

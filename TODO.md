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

## 🛡️ 记忆污染防御体系（Memory Contamination Defense）

> **新增：2026-04-15 · 基于 autoself 记忆污染分析**

记忆污染是指：错误信息、幻觉内容、跨 session 泄漏进入记忆存储，导致后续召回时被当作正确记忆使用。

### 污染分类

| 类型 | 描述 | 根因 |
|------|------|------|
| **输入污染** | 脏数据直接写入记忆 | 无写入校验 |
| **幻觉锚定** | LLM 编造内容写入记忆 | confidence 太低却写入 |
| **上下文泄漏** | A session 内容进入 B session | session_id 隔离不完整 |
| **级联覆盖** | 旧/错数据覆盖新/正确数据 | 无版本控制 |
| **注入攻击** | prompt injection 写入脏数据 | 无输入净化 |

---

### 🔴 P0 — 必须实现（防御核心）

#### [ ] 1. Audit Log（写入审计）

**问题**：无写入追溯，污染后无法定位源头

**实现**：每次 write/update/delete 都记审计日志（写入 `~/.hawk/audit.db` SQLite）

```typescript
interface AuditEntry {
  id: number;              // 自增主键
  timestamp: number;       // 毫秒时间戳
  operation: 'write' | 'update' | 'delete';
  table: string;           // 'hawk_memories'
  record_id: string;       // 被操作的记忆 ID
  content_hash: string;    // SHA256(text)，检测篡改
  source: string;          // 'user_input' | 'agent_inference' | 'system' | 'import'
  session_id?: string;
  agent_id?: string;
  injection_suspected: boolean;  // 是否检测到注入模式
  injection_pattern?: string;    // 检测到的注入模式
  confidence: number;      // 写入置信度（0-1）
  user_id?: string;
  platform: string;        // 'openclaw' | 'hermes' | 'manual'
  metadata_json: string;    // 额外上下文
}
```

**触发时机**：`add()` / `update()` / `delete()` 时同步写入
**状态**：❌ 未实现

---

#### [ ] 2. Injection Detector（注入检测）

**问题**：prompt injection 可以伪装成正常记忆写入

**实现**：hawk-capture 写入前扫描 text 内容

```typescript
const INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /forget (all | everything)/i,
  /disregard (your | this) (instruction|context)/i,
  /pretend you don't know/i,
  /^\s*<\?xml/i,                    // XXE 注入
  /\{\{.*\}\}/,                     // Template injection
  /<script[^>]*>/i,                // XSS
  /-->/,                            // SQL comment injection
  /;\s*(drop|delete|truncate)/i,  // SQL injection
];

function detectInjection(text: string): {
  suspected: boolean;
  pattern?: string;
} {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return { suspected: true, pattern: pattern.source };
  }
  return { suspected: false };
}
```

**处理方式**：
- `suspected=true` → 仍然写入，但 `injection_suspected=true` 标记，触发告警
- 不直接拒绝，保证用户体验

**状态**：❌ 未实现

---

#### [ ] 3. Write Confidence Threshold（写入置信度）

**问题**：hallucination / 低置信内容写入记忆

**实现**：记忆条目增加 `confidence` 字段，写入时必须 > 阈值

```typescript
interface MemoryEntry {
  // ... 现有字段
  confidence: number;          // 置信度 0-1，写入时必须 > 0.7
  source_type: 'user_input' | 'agent_inference' | 'system_detected' | 'import';
  injection_suspected: boolean;
}

// capture hook 改造
async function captureWithConfidence(
  text: string,
  options: {
    minConfidence?: number;  // 默认 0.7，可配置
    source?: SourceType;
    sourceLabel?: 'user_input' | 'agent_inference' | 'system_detected';
  }
): Promise<void> {
  const { suspected, pattern } = detectInjection(text);
  const confidence = await estimateConfidence(text); // LLM 评估
  
  if (confidence < (options.minConfidence ?? 0.7)) {
    logger.warn({ text: text.substring(0, 50), confidence }, 'Confidence below threshold, skipping write');
    return; // 不写入
  }
  
  await db.add({ ...entry, confidence, injection_suspected: suspected, source_type: options.sourceLabel });
}
```

**阈值配置**（config.yaml）：
```yaml
capture:
  minWriteConfidence: 0.7   # < 0.7 的内容不写入
  allowSystemBelowConfidence: true  # system_detected 可绕过（系统信息默认高置信）
```

**状态**：❌ 未实现

---

#### [ ] 4. Session/Agent Fencing（查询隔离）

**问题**：A session 的记忆泄露到 B session

**实现**：所有 recall 查询强制带 scope 过滤，隔离必须完整

```typescript
// hawk-recall 改造：recall 时必须指定 scope
async function recall(
  query: string,
  options: {
    sessionId: string;     // 必填，不再允许 null
    agentId?: string;
    scope?: 'personal' | 'shared' | 'all';
    minScore?: number;
  }
): Promise<RetrievedMemory[]> {
  if (!options.sessionId) {
    throw new Error('sessionId is required for recall — no null-scope queries allowed');
  }
  
  // 查询时强制加 scope = personal（只查自己 session 的记忆）
  // shared 记忆需要明确 opt-in
  const results = await hybridSearch(query, {
    ...options,
    preFilter: `session_id = '${options.sessionId}' AND deleted_at IS NULL`,
  });
  
  return results;
}

// 跨 session 共享记忆需要明确标记（opt-in）
interface SharedMemory {
  scope: 'shared';        // 显式标记为 shared
  shared_by: string[];   // 允许访问的 agent_id 列表
}
```

**状态**：❌ 未实现（当前 session_id 字段存在但查询时未强制过滤）

---

### 🟡 P1 — 重要（检测 + 版本）

#### [ ] 5. Drift Detector（漂移检测）

**问题**：同一主题的记忆被多次改写，可能是一致性漂移

**实现**：检测同一 event_id 或相似 text 的更新频率

```typescript
interface DriftAlert {
  event_id: string;
  update_count: number;      // 30天内更新次数
  last_content_hash: string;
  drift_score: number;      // 0-1，越高越可疑
  alert_level: 'normal' | 'watch' | 'danger';
}

// 触发条件：同一 event_id 30天内更新 > 5 次
// 触发条件：相似内容（cosine > 0.9）更新了完全不同的事实

async function checkDrift(eventId: string): Promise<DriftAlert> {
  const history = await db.query(`
    SELECT id, content_hash, updated_at
    FROM hawk_memories
    WHERE event_id = ? AND updated_at > ?
    ORDER BY updated_at DESC
  `, [eventId, Date.now() - 30 * 24 * 60 * 60 * 1000]);
  
  const updateCount = history.length;
  const driftScore = calculateDrift(history); // 语义漂移程度
  
  return {
    event_id: eventId,
    update_count: updateCount,
    drift_score: driftScore,
    alert_level: updateCount > 10 ? 'danger' : updateCount > 5 ? 'watch' : 'normal',
  };
}
```

**状态**：❌ 未实现

---

#### [ ] 6. Upsert with Version（防覆盖）

**问题**：新内容覆盖旧内容，但旧内容丢了（无版本链）

**实现**：改用 append-only + 最新标记，而非 in-place update

```typescript
// 当前：update 时直接覆盖
// 改为：
//  1. 不删除旧记录，标记 updated_at
//  2. 新增一条新版本记录（same event_id）
//  3. 查询时只取 latest version（updated_at 最大且 deleted_at == null）

interface MemoryEntry {
  event_id: string;      // 跨版本关联
  version: number;       // 版本号，每次更新 +1
  is_latest: boolean;   // 是否最新版本
  superseded_by?: string; // 被谁替代（新版 ID）
}

// 查询时自动加：WHERE is_latest = true
// 旧版本保留在 DB 中，可追溯
```

**状态**：❌ 未实现（当前 update 是覆盖）

---

### 🟢 P2 — 增强（可见性 + 验证）

#### [ ] 7. Memory Quarantine（污染隔离区）

**问题**：发现污染后无法快速隔离

**实现**：污染记忆标记为 `quarantined`，recall 时默认排除

```typescript
interface QuarantineEntry {
  memory_id: string;
  quarantined_at: number;
  reason: string;           // 'injection_detected' | 'drift_alert' | 'user_reported'
  quarantined_by: string;   // 'system' | 'agent' | 'user'
  review_status: 'pending' | 'cleared' | 'deleted';
}
// recall 时：WHERE quarantined = false
```

**状态**：❌ 未实现

---

#### [ ] 8. Consistency Check Cron（一致性巡检）

**问题**：记忆内容在 MEMORY.md 和 hawk-bridge 中不一致

**实现**：每日 cron 比对两处记忆，发现不一致告警

```typescript
// hawk bridge 记忆 vs 本地 MEMORY.md 比对
async function consistencyCheck(): Promise<ConsistencyReport> {
  const hawkMemories = await db.query('SELECT id, text FROM hawk_memories WHERE is_latest=true');
  const localMemory = readFile('MEMORY.md');
  
  // 检测：hawk 有但 MEMORY.md 没有（漏记）
  // 检测：MEMORY.md 有但 hawk 没有（孤立记忆）
  // 检测：两边都有但内容矛盾
  
  return {
    orphaned_in_hawk: [...],
    orphaned_in_local: [...],
    contradictions: [...],
    overall_score: 0-1,
  };
}
```

**状态**：❌ 未实现

---

## 🧠 反幻觉体系（Anti-Hallucination）

> **新增：2026-04-15 · 基于 autoself 幻觉解决方案**

LLM 幻觉 = 听起来合理但实际错误的内容。记忆系统如果存储了幻觉内容，会像病毒一样传播到所有后续对话。

**核心原则：记忆系统不产生幻觉，但可以成为幻觉的放大器——必须从源头阻止。**

---

### 幻觉的 4 类根因

| 类型 | 说明 | 在 hawk-bridge 中的表现 |
|------|------|------------------------|
| **边界模糊** | 不知道知识边界在哪 | LLM 推理出的"事实"写入记忆 |
| **推理链错误** | 中间步骤推错了 | 向量相似度高但实际错了 |
| **上下文冲突** | 上下文没有却当成有 | 跨 session 残留的虚假记忆 |
| **过时信息** | 信息过期了还在用 | 旧记忆召回当实时信息 |

---

### 🔴 P0 — 必须实现

#### [ ] 1. Hallucination Risk Score（幻觉风险评分）

**问题**：无法区分"高可信记忆"和"低可信推理"

**实现**：记忆条目增加 `risk_score` 字段（0-1），召回时附带

```typescript
interface MemoryEntry {
  // ... 现有字段
  /**
   * 幻觉风险评分（0-1）
   * 0.0-0.3: 低风险（直接观察/用户确认的事实）
   * 0.3-0.6: 中风险（LLM 推理但有依据）
   * 0.6-1.0: 高风险（纯 LLM 推断，无外部验证）
   */
  risk_score: number;
  risk_factors: string[];  // ['llm_inference', 'single_source', 'outdated', ...]
}

// 写入时自动评估 risk_score
async function assessRisk(entry: MemoryEntry): Promise<{
  risk_score: number;
  risk_factors: string[];
}> {
  let score = 0.0;
  const factors: string[] = [];

  // LLM 推理 → +0.3
  if (entry.source === 'agent_inference') { score += 0.3; factors.push('llm_inference'); }

  // 单一来源 → +0.2
  if (entry.source_count < 2) { score += 0.2; factors.push('single_source'); }

  // 过时（> 30天）→ +0.2
  if (Date.now() - entry.updated_at > 30 * 24 * 60 * 60 * 1000) {
    score += 0.2; factors.push('stale');
  }

  // 无外部引用 → +0.1
  if (!entry.external_ref) { score += 0.1; factors.push('no_external_ref'); }

  // 注入可疑 → +0.2
  if (entry.injection_suspected) { score += 0.2; factors.push('injection_suspected'); }

  return { risk_score: Math.min(score, 1.0), risk_factors: factors };
}
```

**状态**：❌ 未实现

---

#### [ ] 2. Confidence-Gated Recall（置信度过滤召回）

**问题**：低置信度记忆被召回当成真实信息

**实现**：recall 时默认排除 risk_score > 0.6 的记忆

```typescript
// hawk-recall 改造
async function recall(
  query: string,
  options: {
    sessionId: string;
    minRiskScore?: number;  // 默认 0.6，recall 时过滤高风险
    includeStale?: boolean; // 默认 false，不返回过时记忆
  }
): Promise<RetrievedMemory[]> {

  const results = await hybridSearch(query, {
    ...options,
    // 高风险记忆默认不返回
    preFilter: `
      session_id = '${options.sessionId}'
      AND deleted_at IS NULL
      AND (risk_score IS NULL OR risk_score < ${options.minRiskScore ?? 0.6})
    `,
  });

  // 对召回的记忆做风险说明
  return results.map(r => ({
    ...r,
    risk_warnings: r.risk_score > 0.3
      ? `⚠️ 此记忆风险评分 ${r.risk_score}（${r.risk_factors.join(', ')}），建议验证`
      : undefined,
    age_days: Math.floor((Date.now() - r.updated_at) / 86400000),
  }));
}
```

**状态**：❌ 未实现

---

#### [ ] 3. Source Tracing（来源追溯）

**问题**：召回时不知道记忆从哪来、什么时候写入的

**实现**：recall 结果必须附带来源信息

```typescript
// recall 返回时附带 citation
interface RetrievedMemory {
  // ... 现有字段
  citation: {
    source: 'user_input' | 'agent_inference' | 'system_detected' | 'import';
    confidence: number;       // 写入时的置信度
    risk_score: number;      // 幻觉风险评分
    created_at: number;      // 写入时间
    age_days: number;        // _age
    verified: boolean;        // 是否经过人工验证
    verification_count: number;
  };
}

// 在 hawk-recall 返回时附加强制 citation
function formatRecallResult(memory: RetrievedMemory): string {
  const age = Math.floor((Date.now() - memory.updated_at) / 86400000);
  const riskLabel = memory.risk_score > 0.6 ? '⚠️高风险' :
                    memory.risk_score > 0.3 ? '🟡中风险' : '✅低风险';

  return `${memory.text}

---
[${riskLabel}] ${age}天前 · ${memory.citation.source} · 置信度${Math.round(memory.confidence * 100)}%`;
}
```

**状态**：❌ 未实现

---

#### [ ] 4. Stale Memory Warning（过时记忆警告）

**问题**：召回的记忆可能是过时的，但 LLM 不知道

**实现**：给记忆加"年龄"标签，LLM 可据此判断是否过时

```typescript
// 在 config 中配置 stale 阈值
interface RecallConfig {
  staleThresholdDays: number;   // 默认 30 天
  veryStaleThresholdDays: number; // 默认 90 天
}

// 记忆年龄标签
function getAgeLabel(updatedAt: number): string {
  const days = (Date.now() - updatedAt) / 86400000;
  if (days > 90) return '[❌已过期90天+]';
  if (days > 30) return '[⚠️可能过期30天+]';
  if (days > 7) return '[🕐近期7天+]';
  return '[✅实时]';
}
```

**状态**：❌ 未实现

---

### 🟡 P1 — 重要

#### [ ] 5. LLM Self-Verification Hook（LLM 自我验证）

**问题**：没有机制让 LLM 在写入前验证内容

**实现**：高风险记忆写入前，触发 LLM 二次验证

```typescript
// hawk-capture 中增加验证钩子
async function verifyBeforeWrite(text: string, options: CaptureOptions): Promise<{
  verified: boolean;
  confidence: number;
  issues?: string[];
}> {
  const { risk_score } = await assessRisk({ text, ...options });

  // risk_score > 0.5 → 触发验证
  if (risk_score > 0.5) {
    const verification = await llm.verify(`
      请验证以下记忆是否准确：
      "${text}"

      请检查：
      1. 是否有事实性错误？
      2. 数字、日期、名字是否可验证？
      3. 是否有"可能是错的"部分？

      返回：
      - verified: true/false
      - confidence: 0-1
      - issues: [具体问题列表]
    `);

    if (!verification.verified) {
      logger.warn({ text: text.substring(0, 50), issues: verification.issues },
        'Memory verification failed, downgrading confidence');
      return { verified: false, confidence: verification.confidence * 0.5, issues: verification.issues };
    }

    return verification;
  }

  return { verified: true, confidence: 1.0 - risk_score };
}
```

**状态**：❌ 未实现

---

#### [ ] 6. Factuality Classification（事实性分类）

**问题**：事实性内容（必须准确）和观点性内容（可以主观）混在一起

**实现**：记忆写入时分类，不同类型不同处理

```typescript
type FactualityLevel = 'factual' | 'inferential' | 'opinion' | 'preference';

interface MemoryEntry {
  // ...
  factuality: FactualityLevel;
}

// 分类逻辑
async function classifyFactuality(text: string): Promise<FactualityLevel> {
  // factual: 含具体数字/日期/名字/可验证事实
  // inferential: LLM 从上下文推理出的结论
  // opinion: 主观看法、偏好
  // preference: 用户偏好、设置

  const result = await llm.classify(`
    判断以下内容的类型：
    "${text}"

    factual: 包含可验证的具体信息（数字/日期/人名/地点）
    inferential: 基于上下文推理得出的结论（无法直接验证）
    opinion: 主观看法或评价
    preference: 用户偏好或设置
  `);

  return result.factuality;
}

// factual 记忆：更高验证标准
// opinion 记忆：低风险，不做严格校验
```

**状态**：❌ 未实现

---

### 防御层次总览

### 防御层次总览

```
输入层
  └── Injection Detector ✅ 写入前扫描
         │
         ▼
存储层
  ├── Write Confidence Threshold（< 0.7 不写入）
  ├── Audit Log（每次写入可追溯）
  ├── Upsert Version（版本链保留）
  └── Drift Detector（漂移告警）
         │
         ▼
查询层
  ├── Session Fencing（强制 scope 过滤）
  ├── Quarantine（污染隔离）
  └── Consistency Check（每日巡检）
```

---

## 🚀 推荐实现顺序

```
Phase 0（安全底线 · 必须优先）:
  1. Session/Agent Fencing — P0 查询隔离（防止泄漏）
  2. Injection Detector — P0 注入检测（防止攻击写入）
  3. Audit Log — P0 写入审计（污染后可追溯）
  4. Hallucination Risk Score — P0 幻觉风险评分（写入时）

Phase 1（立即）:
  5. Write Confidence Threshold — 低于 0.7 不写入
  6. Confidence-Gated Recall — 高风险记忆不召回
  7. MemoryManager 接口定义 — 所有其他能力的基础
  8. Background Prefetch — 性能提升，立即可见

Phase 2（L6 支撑）:
  9. Context Fencing — L6 编排必须
  10. Session Insights — tangseng-brain 成本分析的输入
  11. Drift Detector — 漂移检测
  12. Source Tracing — recall 附来源追溯

Phase 3（进化支撑）:
  13. Stale Memory Warning — 过时记忆警告
  14. LLM Self-Verification Hook — 写入前二次验证
  15. Upsert with Version — 版本链保留
  16. Skill Auto-Creation — autoself L5 进化的输出落地

Phase 4（长期）:
  17. Factuality Classification — 事实性分类
  18. Memory Quarantine — 污染隔离区
  19. Consistency Check Cron — 每日一致性巡检
  20. Skills Hub 兼容层
  21. Auto-Compression
  22. Multi-tenant
```

## Done ✅

- v1.1: 9 core improvements (retry, backup, pagination, structured logging, health endpoint, doctor connectivity test, reranking, prometheus metrics, config versioning)
- v1.0: Initial release with LanceDB + Ollama/Xinference support
- v1.2: 4项关键修复 — isDuplicate search覆盖全量记忆, retriever rerank顺序, lancedb update直接SQL, http adapter update不再静默delete## 🚀 推荐实现顺序

```
Phase 0（安全底线 · 必须优先）:
  1. Session/Agent Fencing — P0 查询隔离（防止泄漏）
  2. Injection Detector — P0 注入检测（防止攻击写入）
  3. Audit Log — P0 写入审计（污染后可追溯）
  4. Hallucination Risk Score — P0 幻觉风险评分（写入时）

Phase 1（立即）:
  5. Write Confidence Threshold — 低于 0.7 不写入
  6. Confidence-Gated Recall — 高风险记忆不召回
  7. MemoryManager 接口定义 — 所有其他能力的基础
  8. Background Prefetch — 性能提升，立即可见

Phase 2（L6 支撑）:
  9. Context Fencing — L6 编排必须
  10. Session Insights — tangseng-brain 成本分析的输入
  11. Drift Detector — 漂移检测
  12. Source Tracing — recall 附来源追溯

Phase 3（进化支撑）:
  13. Stale Memory Warning — 过时记忆警告
  14. LLM Self-Verification Hook — 写入前二次验证
  15. Upsert with Version — 版本链保留
  16. Skill Auto-Creation — autoself L5 进化的输出落地

Phase 4（长期）:
  17. Factuality Classification — 事实性分类
  18. Memory Quarantine — 污染隔离区
  19. Consistency Check Cron — 每日一致性巡检
  20. Skills Hub 兼容层
  21. Auto-Compression
  22. Multi-tenant
```

## Done ✅bridge v1.2+ Backlog

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

## 🛡️ 记忆污染防御体系（Memory Contamination Defense）

> **新增：2026-04-15 · 基于 autoself 记忆污染分析**

记忆污染是指：错误信息、幻觉内容、跨 session 泄漏进入记忆存储，导致后续召回时被当作正确记忆使用。

### 污染分类

| 类型 | 描述 | 根因 |
|------|------|------|
| **输入污染** | 脏数据直接写入记忆 | 无写入校验 |
| **幻觉锚定** | LLM 编造内容写入记忆 | confidence 太低却写入 |
| **上下文泄漏** | A session 内容进入 B session | session_id 隔离不完整 |
| **级联覆盖** | 旧/错数据覆盖新/正确数据 | 无版本控制 |
| **注入攻击** | prompt injection 写入脏数据 | 无输入净化 |

---

### 🔴 P0 — 必须实现（防御核心）

#### [ ] 1. Audit Log（写入审计）

**问题**：无写入追溯，污染后无法定位源头

**实现**：每次 write/update/delete 都记审计日志（写入 `~/.hawk/audit.db` SQLite）

```typescript
interface AuditEntry {
  id: number;              // 自增主键
  timestamp: number;       // 毫秒时间戳
  operation: 'write' | 'update' | 'delete';
  table: string;           // 'hawk_memories'
  record_id: string;       // 被操作的记忆 ID
  content_hash: string;    // SHA256(text)，检测篡改
  source: string;          // 'user_input' | 'agent_inference' | 'system' | 'import'
  session_id?: string;
  agent_id?: string;
  injection_suspected: boolean;  // 是否检测到注入模式
  injection_pattern?: string;    // 检测到的注入模式
  confidence: number;      // 写入置信度（0-1）
  user_id?: string;
  platform: string;        // 'openclaw' | 'hermes' | 'manual'
  metadata_json: string;    // 额外上下文
}
```

**触发时机**：`add()` / `update()` / `delete()` 时同步写入
**状态**：❌ 未实现

---

#### [ ] 2. Injection Detector（注入检测）

**问题**：prompt injection 可以伪装成正常记忆写入

**实现**：hawk-capture 写入前扫描 text 内容

```typescript
const INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /forget (all | everything)/i,
  /disregard (your | this) (instruction|context)/i,
  /pretend you don't know/i,
  /^\s*<\?xml/i,                    // XXE 注入
  /\{\{.*\}\}/,                     // Template injection
  /<script[^>]*>/i,                // XSS
  /-->/,                            // SQL comment injection
  /;\s*(drop|delete|truncate)/i,  // SQL injection
];

function detectInjection(text: string): {
  suspected: boolean;
  pattern?: string;
} {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return { suspected: true, pattern: pattern.source };
  }
  return { suspected: false };
}
```

**处理方式**：
- `suspected=true` → 仍然写入，但 `injection_suspected=true` 标记，触发告警
- 不直接拒绝，保证用户体验

**状态**：❌ 未实现

---

#### [ ] 3. Write Confidence Threshold（写入置信度）

**问题**：hallucination / 低置信内容写入记忆

**实现**：记忆条目增加 `confidence` 字段，写入时必须 > 阈值

```typescript
interface MemoryEntry {
  // ... 现有字段
  confidence: number;          // 置信度 0-1，写入时必须 > 0.7
  source_type: 'user_input' | 'agent_inference' | 'system_detected' | 'import';
  injection_suspected: boolean;
}

// capture hook 改造
async function captureWithConfidence(
  text: string,
  options: {
    minConfidence?: number;  // 默认 0.7，可配置
    source?: SourceType;
    sourceLabel?: 'user_input' | 'agent_inference' | 'system_detected';
  }
): Promise<void> {
  const { suspected, pattern } = detectInjection(text);
  const confidence = await estimateConfidence(text); // LLM 评估
  
  if (confidence < (options.minConfidence ?? 0.7)) {
    logger.warn({ text: text.substring(0, 50), confidence }, 'Confidence below threshold, skipping write');
    return; // 不写入
  }
  
  await db.add({ ...entry, confidence, injection_suspected: suspected, source_type: options.sourceLabel });
}
```

**阈值配置**（config.yaml）：
```yaml
capture:
  minWriteConfidence: 0.7   # < 0.7 的内容不写入
  allowSystemBelowConfidence: true  # system_detected 可绕过（系统信息默认高置信）
```

**状态**：❌ 未实现

---

#### [ ] 4. Session/Agent Fencing（查询隔离）

**问题**：A session 的记忆泄露到 B session

**实现**：所有 recall 查询强制带 scope 过滤，隔离必须完整

```typescript
// hawk-recall 改造：recall 时必须指定 scope
async function recall(
  query: string,
  options: {
    sessionId: string;     // 必填，不再允许 null
    agentId?: string;
    scope?: 'personal' | 'shared' | 'all';
    minScore?: number;
  }
): Promise<RetrievedMemory[]> {
  if (!options.sessionId) {
    throw new Error('sessionId is required for recall — no null-scope queries allowed');
  }
  
  // 查询时强制加 scope = personal（只查自己 session 的记忆）
  // shared 记忆需要明确 opt-in
  const results = await hybridSearch(query, {
    ...options,
    preFilter: `session_id = '${options.sessionId}' AND deleted_at IS NULL`,
  });
  
  return results;
}

// 跨 session 共享记忆需要明确标记（opt-in）
interface SharedMemory {
  scope: 'shared';        // 显式标记为 shared
  shared_by: string[];   // 允许访问的 agent_id 列表
}
```

**状态**：❌ 未实现（当前 session_id 字段存在但查询时未强制过滤）

---

### 🟡 P1 — 重要（检测 + 版本）

#### [ ] 5. Drift Detector（漂移检测）

**问题**：同一主题的记忆被多次改写，可能是一致性漂移

**实现**：检测同一 event_id 或相似 text 的更新频率

```typescript
interface DriftAlert {
  event_id: string;
  update_count: number;      // 30天内更新次数
  last_content_hash: string;
  drift_score: number;      // 0-1，越高越可疑
  alert_level: 'normal' | 'watch' | 'danger';
}

// 触发条件：同一 event_id 30天内更新 > 5 次
// 触发条件：相似内容（cosine > 0.9）更新了完全不同的事实

async function checkDrift(eventId: string): Promise<DriftAlert> {
  const history = await db.query(`
    SELECT id, content_hash, updated_at
    FROM hawk_memories
    WHERE event_id = ? AND updated_at > ?
    ORDER BY updated_at DESC
  `, [eventId, Date.now() - 30 * 24 * 60 * 60 * 1000]);
  
  const updateCount = history.length;
  const driftScore = calculateDrift(history); // 语义漂移程度
  
  return {
    event_id: eventId,
    update_count: updateCount,
    drift_score: driftScore,
    alert_level: updateCount > 10 ? 'danger' : updateCount > 5 ? 'watch' : 'normal',
  };
}
```

**状态**：❌ 未实现

---

#### [ ] 6. Upsert with Version（防覆盖）

**问题**：新内容覆盖旧内容，但旧内容丢了（无版本链）

**实现**：改用 append-only + 最新标记，而非 in-place update

```typescript
// 当前：update 时直接覆盖
// 改为：
//  1. 不删除旧记录，标记 updated_at
//  2. 新增一条新版本记录（same event_id）
//  3. 查询时只取 latest version（updated_at 最大且 deleted_at == null）

interface MemoryEntry {
  event_id: string;      // 跨版本关联
  version: number;       // 版本号，每次更新 +1
  is_latest: boolean;   // 是否最新版本
  superseded_by?: string; // 被谁替代（新版 ID）
}

// 查询时自动加：WHERE is_latest = true
// 旧版本保留在 DB 中，可追溯
```

**状态**：❌ 未实现（当前 update 是覆盖）

---

### 🟢 P2 — 增强（可见性 + 验证）

#### [ ] 7. Memory Quarantine（污染隔离区）

**问题**：发现污染后无法快速隔离

**实现**：污染记忆标记为 `quarantined`，recall 时默认排除

```typescript
interface QuarantineEntry {
  memory_id: string;
  quarantined_at: number;
  reason: string;           // 'injection_detected' | 'drift_alert' | 'user_reported'
  quarantined_by: string;   // 'system' | 'agent' | 'user'
  review_status: 'pending' | 'cleared' | 'deleted';
}
// recall 时：WHERE quarantined = false
```

**状态**：❌ 未实现

---

#### [ ] 8. Consistency Check Cron（一致性巡检）

**问题**：记忆内容在 MEMORY.md 和 hawk-bridge 中不一致

**实现**：每日 cron 比对两处记忆，发现不一致告警

```typescript
// hawk bridge 记忆 vs 本地 MEMORY.md 比对
async function consistencyCheck(): Promise<ConsistencyReport> {
  const hawkMemories = await db.query('SELECT id, text FROM hawk_memories WHERE is_latest=true');
  const localMemory = readFile('MEMORY.md');
  
  // 检测：hawk 有但 MEMORY.md 没有（漏记）
  // 检测：MEMORY.md 有但 hawk 没有（孤立记忆）
  // 检测：两边都有但内容矛盾
  
  return {
    orphaned_in_hawk: [...],
    orphaned_in_local: [...],
    contradictions: [...],
    overall_score: 0-1,
  };
}
```

**状态**：❌ 未实现

---

## 🧠 反幻觉体系（Anti-Hallucination）

> **新增：2026-04-15 · 基于 autoself 幻觉解决方案**

LLM 幻觉 = 听起来合理但实际错误的内容。记忆系统如果存储了幻觉内容，会像病毒一样传播到所有后续对话。

**核心原则：记忆系统不产生幻觉，但可以成为幻觉的放大器——必须从源头阻止。**

---

### 幻觉的 4 类根因

| 类型 | 说明 | 在 hawk-bridge 中的表现 |
|------|------|------------------------|
| **边界模糊** | 不知道知识边界在哪 | LLM 推理出的"事实"写入记忆 |
| **推理链错误** | 中间步骤推错了 | 向量相似度高但实际错了 |
| **上下文冲突** | 上下文没有却当成有 | 跨 session 残留的虚假记忆 |
| **过时信息** | 信息过期了还在用 | 旧记忆召回当实时信息 |

---

### 🔴 P0 — 必须实现

#### [ ] 1. Hallucination Risk Score（幻觉风险评分）

**问题**：无法区分"高可信记忆"和"低可信推理"

**实现**：记忆条目增加 `risk_score` 字段（0-1），召回时附带

```typescript
interface MemoryEntry {
  // ... 现有字段
  /**
   * 幻觉风险评分（0-1）
   * 0.0-0.3: 低风险（直接观察/用户确认的事实）
   * 0.3-0.6: 中风险（LLM 推理但有依据）
   * 0.6-1.0: 高风险（纯 LLM 推断，无外部验证）
   */
  risk_score: number;
  risk_factors: string[];  // ['llm_inference', 'single_source', 'outdated', ...]
}

// 写入时自动评估 risk_score
async function assessRisk(entry: MemoryEntry): Promise<{
  risk_score: number;
  risk_factors: string[];
}> {
  let score = 0.0;
  const factors: string[] = [];

  // LLM 推理 → +0.3
  if (entry.source === 'agent_inference') { score += 0.3; factors.push('llm_inference'); }

  // 单一来源 → +0.2
  if (entry.source_count < 2) { score += 0.2; factors.push('single_source'); }

  // 过时（> 30天）→ +0.2
  if (Date.now() - entry.updated_at > 30 * 24 * 60 * 60 * 1000) {
    score += 0.2; factors.push('stale');
  }

  // 无外部引用 → +0.1
  if (!entry.external_ref) { score += 0.1; factors.push('no_external_ref'); }

  // 注入可疑 → +0.2
  if (entry.injection_suspected) { score += 0.2; factors.push('injection_suspected'); }

  return { risk_score: Math.min(score, 1.0), risk_factors: factors };
}
```

**状态**：❌ 未实现

---

#### [ ] 2. Confidence-Gated Recall（置信度过滤召回）

**问题**：低置信度记忆被召回当成真实信息

**实现**：recall 时默认排除 risk_score > 0.6 的记忆

```typescript
// hawk-recall 改造
async function recall(
  query: string,
  options: {
    sessionId: string;
    minRiskScore?: number;  // 默认 0.6，recall 时过滤高风险
    includeStale?: boolean; // 默认 false，不返回过时记忆
  }
): Promise<RetrievedMemory[]> {

  const results = await hybridSearch(query, {
    ...options,
    // 高风险记忆默认不返回
    preFilter: `
      session_id = '${options.sessionId}'
      AND deleted_at IS NULL
      AND (risk_score IS NULL OR risk_score < ${options.minRiskScore ?? 0.6})
    `,
  });

  // 对召回的记忆做风险说明
  return results.map(r => ({
    ...r,
    risk_warnings: r.risk_score > 0.3
      ? `⚠️ 此记忆风险评分 ${r.risk_score}（${r.risk_factors.join(', ')}），建议验证`
      : undefined,
    age_days: Math.floor((Date.now() - r.updated_at) / 86400000),
  }));
}
```

**状态**：❌ 未实现

---

#### [ ] 3. Source Tracing（来源追溯）

**问题**：召回时不知道记忆从哪来、什么时候写入的

**实现**：recall 结果必须附带来源信息

```typescript
// recall 返回时附带 citation
interface RetrievedMemory {
  // ... 现有字段
  citation: {
    source: 'user_input' | 'agent_inference' | 'system_detected' | 'import';
    confidence: number;       // 写入时的置信度
    risk_score: number;      // 幻觉风险评分
    created_at: number;      // 写入时间
    age_days: number;        // _age
    verified: boolean;        // 是否经过人工验证
    verification_count: number;
  };
}

// 在 hawk-recall 返回时附加强制 citation
function formatRecallResult(memory: RetrievedMemory): string {
  const age = Math.floor((Date.now() - memory.updated_at) / 86400000);
  const riskLabel = memory.risk_score > 0.6 ? '⚠️高风险' :
                    memory.risk_score > 0.3 ? '🟡中风险' : '✅低风险';

  return `${memory.text}

---
[${riskLabel}] ${age}天前 · ${memory.citation.source} · 置信度${Math.round(memory.confidence * 100)}%`;
}
```

**状态**：❌ 未实现

---

#### [ ] 4. Stale Memory Warning（过时记忆警告）

**问题**：召回的记忆可能是过时的，但 LLM 不知道

**实现**：给记忆加"年龄"标签，LLM 可据此判断是否过时

```typescript
// 在 config 中配置 stale 阈值
interface RecallConfig {
  staleThresholdDays: number;   // 默认 30 天
  veryStaleThresholdDays: number; // 默认 90 天
}

// 记忆年龄标签
function getAgeLabel(updatedAt: number): string {
  const days = (Date.now() - updatedAt) / 86400000;
  if (days > 90) return '[❌已过期90天+]';
  if (days > 30) return '[⚠️可能过期30天+]';
  if (days > 7) return '[🕐近期7天+]';
  return '[✅实时]';
}
```

**状态**：❌ 未实现

---

### 🟡 P1 — 重要

#### [ ] 5. LLM Self-Verification Hook（LLM 自我验证）

**问题**：没有机制让 LLM 在写入前验证内容

**实现**：高风险记忆写入前，触发 LLM 二次验证

```typescript
// hawk-capture 中增加验证钩子
async function verifyBeforeWrite(text: string, options: CaptureOptions): Promise<{
  verified: boolean;
  confidence: number;
  issues?: string[];
}> {
  const { risk_score } = await assessRisk({ text, ...options });

  // risk_score > 0.5 → 触发验证
  if (risk_score > 0.5) {
    const verification = await llm.verify(`
      请验证以下记忆是否准确：
      "${text}"

      请检查：
      1. 是否有事实性错误？
      2. 数字、日期、名字是否可验证？
      3. 是否有"可能是错的"部分？

      返回：
      - verified: true/false
      - confidence: 0-1
      - issues: [具体问题列表]
    `);

    if (!verification.verified) {
      logger.warn({ text: text.substring(0, 50), issues: verification.issues },
        'Memory verification failed, downgrading confidence');
      return { verified: false, confidence: verification.confidence * 0.5, issues: verification.issues };
    }

    return verification;
  }

  return { verified: true, confidence: 1.0 - risk_score };
}
```

**状态**：❌ 未实现

---

#### [ ] 6. Factuality Classification（事实性分类）

**问题**：事实性内容（必须准确）和观点性内容（可以主观）混在一起

**实现**：记忆写入时分类，不同类型不同处理

```typescript
type FactualityLevel = 'factual' | 'inferential' | 'opinion' | 'preference';

interface MemoryEntry {
  // ...
  factuality: FactualityLevel;
}

// 分类逻辑
async function classifyFactuality(text: string): Promise<FactualityLevel> {
  // factual: 含具体数字/日期/名字/可验证事实
  // inferential: LLM 从上下文推理出的结论
  // opinion: 主观看法、偏好
  // preference: 用户偏好、设置

  const result = await llm.classify(`
    判断以下内容的类型：
    "${text}"

    factual: 包含可验证的具体信息（数字/日期/人名/地点）
    inferential: 基于上下文推理得出的结论（无法直接验证）
    opinion: 主观看法或评价
    preference: 用户偏好或设置
  `);

  return result.factuality;
}

// factual 记忆：更高验证标准
// opinion 记忆：低风险，不做严格校验
```

**状态**：❌ 未实现

---

### 防御层次总览

### 防御层次总览

```
输入层
  └── Injection Detector ✅ 写入前扫描
         │
         ▼
存储层
  ├── Write Confidence Threshold（< 0.7 不写入）
  ├── Audit Log（每次写入可追溯）
  ├── Upsert Version（版本链保留）
  └── Drift Detector（漂移告警）
         │
         ▼
查询层
  ├── Session Fencing（强制 scope 过滤）
  ├── Quarantine（污染隔离）
  └── Consistency Check（每日巡检）
```

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

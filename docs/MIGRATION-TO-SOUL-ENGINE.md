# hawk-bridge → soul-engine 迁移记录

> 创建时间：2026-04-19
> 创建者：maomao
> 目的：记录从 hawk-bridge TODO 迁移到 soul-engine 的内容

---

## 迁移原因

hawk-bridge 定位为 **L0 记忆层**（存储 + 召回），而以下 10 项功能属于 **进化层**（提炼 + 抽象 + 进化），更适合放在 soul-engine。

拆分后：
- **hawk-bridge**：聚焦存储层，~58 项（Capture/Recall/Decay/Security/Multi-Tenant）
- **soul-engine**：进化层，52 项（Distiller/Graph/Evolver/WorkingMemory/SelfAwareness）

---

## 迁移清单

| # | hawk-bridge 原项 | 迁移到 | 理由 |
|---|-----------------|--------|------|
| 18 | Learnings 记忆分类 | soul-engine #141 | 巡检验收结果是进化数据 |
| 19 | Task History 记忆 | soul-engine #134 | 任务历史是进化素材 |
| 20 | Effect Evaluation 记忆 | soul-engine #142 | 进化效果追踪 |
| 21 | Cron Job 结果 | soul-engine #131 | 自动捕获的进化素材 |
| 38 | Skill Auto-Creation | soul-engine #103 | 技能创建是进化行为 |
| 41 | User Modeling | soul-engine #145 | 用户画像驱动个性化进化 |
| 45 | 知识图谱关系层 | soul-engine #111, #113 | 图谱语义判断在 soul-engine |
| 46 | 主动记忆推送 | soul-engine #106 | 需要 Pattern/Principle 支持（协作） |
| 58 | 元认知自我调优 | soul-engine #143, #142 | 进化层自我优化 |
| 72 | 任务完成度 Ranking | soul-engine #106 | recall 结果编译（MemoryCompiler） |

---

## 迁移内容原文

> 以下保留迁移时的原始内容，便于追溯

---

### #18 Learnings 记忆分类（巡检验收结果存储）

**来源：autoself L1 + L4**

当 tangseng-brain 识别到一个新 pattern 时，这个 pattern 的「验收结果」需要有地方存。需要记录：
- 哪些 agent 验证过这个 pattern
- 验证结论是什么
- 有没有争议

autoself 的 L4 验收层决定一个 pattern 是否可以晋升为 principle。验收通过后，learnings 记忆应该打上 `approved: true` 标记。

**对 autoself 价值**：learnings 是进化层的核心数据，没有结构化的 learnings 存储，soul-force 无法做知识蒸馏。

**前置依赖**：#17 Multi-Agent Hook（多 agent 验证需要隔离）

**状态**：❌ 未实现

**版本目标**：v2.1

---

### #19 Task History 记忆（任务追踪历史）

**来源：autoself L6 task-tracker**

task-tracker 需要：
- 追踪每个 task 的执行路径（决策序列）
- 分析 task 失败原因（哪个决策出了问题）
- 关联 decision 记忆（每个 decision 是哪个 task 的一部分）

**对 autoself 价值**：soul-force 做进化分析需要知道「这个 principle 来自哪个 task 的实践」。

**实现方向**：
```typescript
interface TaskMemory {
  task_id: string;
  agent_id: string;
  status: 'in_progress' | 'success' | 'failure';
  decisions: string[];  // 这个 task 中的决策 ID 列表
  started_at: number;
  completed_at?: number;
  outcome?: string;
}
```

**前置依赖**：#17 Multi-Agent Hook

**状态**：❌ 未实现

**版本目标**：v2.2

---

### #20 Effect Evaluation 记忆（进化效果追踪）

**来源：autoself L6 effect-evaluator + L5**

soul-force 更新 SOUL.md 后，effect-evaluator 需要：
- 追踪更新前后效果对比（哪些指标变了）
- 记录更新触发的决策变化
- 判断更新是否产生了预期效果

effect-evaluator 的输出是进化效果数据，是判断「soul-force 是否在工作」的核心指标。

**对 autoself 价值**：soul-force 更新 SOUL.md 后，需要 effect-evaluator 验证效果。没有效果追踪，进化闭环不完整。

**前置依赖**：#17 Multi-Agent Hook、#19 Task History

**状态**：❌ 未实现

**版本目标**：v2.2

---

### #21 Cron Job 结果自动写入记忆

**来源：autoself L1 定时巡检 + 当前架构问题**

当前 cron 巡检（auto-evolve）的输出：
- 写入 `tasks/done/main/` 目录
- 需要人工查看才能知道巡检结果
- 记忆系统完全不知道巡检发现了什么

**问题**：巡检结果没有进入记忆系统，无法被 recall。

**解决方案**：cron job 结果自动写入 hawk-bridge：
```typescript
// 飞书通知后，同步写入 hawk-bridge
async function syncCronResult(result: CronResult): Promise<void> {
  await hawkBridge.createMemory({
    type: 'observation',
    category: 'inspection',
    content: `巡检发现：${result.findings.join('；')}`,
    metadata: { source: 'auto-evolve', severity: result.severity }
  });
}
```

**状态**：❌ 未实现

**版本目标**：v2.1

---

### #38 Skill Auto-Creation（技能自动创建）

**来源：Hermes 自主创建 Skills 的能力**

当同一类任务出现 ≥3 次时，自动创建 Skill：
- tangseng-brain 发现的 pattern → 自动写成 SOUL.md 条目
- 如果重复多次 → 沉淀成正式 Skill（`~/.hawk/skills/{pattern-name}/SKILL.md`）

**前置依赖**：MemoryManager

**实现方向**：capture 时追踪 pattern 频率，达到阈值时触发 skill 创建流程

**状态**：❌ 未实现

---

### #41 User Modeling（结构化用户画像）

**来源：Hermes Honcho dialectic user modeling**

通过对话历史持续构建用户模型：
- 交流偏好（简洁 / 详细）
- 技术深度（专家 / 入门）
- 工作节奏（快速迭代 / 深思熟虑）

**对 autoself 价值**：soul-force 更新 USER.md 需要更结构化的用户模型

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

**前置依赖**：Session Insights

**状态**：❌ 未实现

---

### #45 知识图谱关系层（Knowledge Graph Relations）

**解决的问题**：记忆之间孤立存储，无法表达"依赖/矛盾/包含"等关系

**行业痛点**：现有记忆系统只有"文本块"，记忆之间的关系靠人脑维护。当多个记忆描述同一实体时，系统完全不知道。

**实现方向**：
```typescript
// 关系表 memory_relations
interface MemoryRelation {
  id: string;
  memory_a_id: string;
  relation_type: "depends_on" | "contradicts" | "contains" | "related_to" | "supersedes";
  memory_b_id: string;
  created_at: number;
  confidence: number;       // 关系置信度
  bidirectional: boolean;
}

// 查询示例
// "查找所有与X相矛盾的记忆"
GET /api/v1/relations/{memory_id}/contradicts

// "查找所有依赖X的记忆"
GET /api/v1/relations/{memory_id}/depends_on
```

**自动关系发现**：
- capture 时 LLM 推断关系（"这条记忆和已有的Y有什么关系？"）
- recall 时交叉分析多条记忆的关系
- 一致性巡检验证矛盾关系

**版本规划**：
- v2.0: 关系表 schema + 手动添加关系 API
- v2.3: 自动关系发现（LLM 推断）
- v2.4: 矛盾检测 + 关系推理查询

**前置依赖**：无（独立表结构）

**状态**：❌ 未实现

**版本目标**：v2.0（schema+API）→ v2.3（自动发现）→ v2.4（矛盾检测）

---

### #46 主动记忆推送（Proactive Memory）

**解决的问题**：系统只能"被动召回"，用户问才回答，从不主动

**行业痛点**：RAG 的根本局限 — 用户必须知道自己不知道什么，才能问出正确的问题。

**实现方向**：
```typescript
// POST /api/v1/proactive
interface ProactiveRequest {
  current_context: {
    active_file?: string;      // 当前打开的文件
    recent_changes?: string[]; // 最近修改的文件
    active_tools?: string[];   // 正在使用的工具
    session_id: string;
  };
  max_suggestions: number;    // 最多推送几条
}

// 返回主动推送的记忆
interface ProactiveSuggestion {
  memory: RetrievedMemory;
  trigger_reason: string;     // "这条API上次改了导致XXX问题"
  relevance_score: number;
  action_hint?: string;       // "建议在PR描述中引用"
}
```

**触发场景**：
- 用户刚打开一个文件 → 推送与该文件相关的历史决策/注释
- 代码变更检测到 → 推送"这条API上次改了导致的问题"
- 用户执行危险操作（delete/force push）→ 推送相关风险记忆
- 每日 standup → 推送"昨天你在这个项目做了XXX"

**推送方式**：
- WebSocket 实时推送（连接中时）
- 写入 `~/.hawk/proactive_queue.json`（离线缓冲）
- 可选飞书通知

**前置依赖**：Knowledge Graph (#45)、Session Insights (#36)

**状态**：❌ 未实现

**版本目标**：v2.4（基础推送）→ v2.5（智能场景触发）

---

### #58 元认知自我调优（Meta-Cognition Tuning）

**问题**：所有参数都是人工调的，系统不会从历史数据中学习

**现状**：
```
capture → 固定阈值
recall → 固定 ranking 公式（vector_similarity * 0.7 + importance * 0.3）
decay → 固定 30 天 TTL
```

**真正的智能记忆系统应该能自我优化**：
```
系统发现：最近 100 次 recall 中，有 30 次用户说"不是这个"
系统分析：这 30 次的共同特征
  → embedding model 需要调参？
  → 关键词权重太低？
  → 这类记忆应该用什么类别标签？
系统行动：
  → 自动调整 recall ranking 权重
  → 自动给这类记忆打新标签
  → 自动调整某个 category 的写入阈值
```

**实现方向**：
```typescript
// RL-based Ranking Tuning
interface TuningFeedback {
  recall_id: string;
  query: string;
  retrieved_memory_ids: string[];
  user_satisfaction: "helpful" | "neutral" | "misleading";
  session_id: string;
}

// 收集反馈数据，训练 lightweight RL model
// 调整 ranking 权重参数
// A/B testing 不同配置效果

// Self-Tuning Pipeline
class MemorySelfTuner {
  collectFeedback(feedback: TuningFeedback[]): void;
  analyzePatterns(): TuningRecommendation[];
  applyTuning(recommendation: TuningRecommendation): void;
  rollback(): void;  // 效果不好就回滚
}
```

**对 autoself 价值**：系统从历史中学习，自动优化自己的记忆策略

**状态**：❌ 未实现

**前置依赖**：Memory ROI (#57)、Memory Quality Feedback (#56)

**版本目标**：v3.3

---

### #72 任务完成度 Ranking

**来源：独立判断（maomao）— recall 返回的是「语义相似」而不是「任务完成」**

> ⚠️ **关联功能：定期整理 → MemoryCompiler（v2.3）**
> 「定期整理」需要 MemoryCompiler 把同主题的多条记忆合并成一条 Pattern。
> #72（Task-Aware Ranking）和 #102（MemoryCompiler）是同一基础设施的两个面：
> - #72：recall 时理解任务目标，优先返回「能完成任务」的记忆
> - #102：整理时把多条相关记忆编译成一条 Pattern，减少 recall 噪音
>
> 详见 `docs/ARCHITECTURE-v2.md` 5.5 节 Recall Pipeline MemoryCompilerStage

**问题**：当前 hawk-bridge 的 recall 返回"和 query 最相关的记忆"，基于向量相似度排序。

**真正的问题**：用户需要的是"能帮我完成当前任务的记忆"，不是"语义最像的记忆"。

**两者差异**：

| 目标 | 排序依据 | 问题 |
|------|---------|------|
| 语义相似 | 向量距离近 | 和当前任务无关也可能排在前面 |
| 任务完成 | 记忆能帮我做决策 | 需要理解当前任务上下文 |

**当前 ranking 公式的问题**：
```
score = similarity × 0.6 + reliability × 0.4
```
这只是优化「语义相似 + 可靠性」，不是「任务完成度」。

**实现方向**：
```
Task-Aware Recall：
1. 传入当前任务上下文（task_goal）
2. 评估每条记忆对当前任务的价值（不是向量相似度）
3. 优先返回"能帮我完成当前任务"的信息

记忆价值评估：
- 这条记忆能帮用户避免重复错误吗？
- 这条记忆能帮用户理解上下文吗？
- 这条记忆能帮用户做出更好的决策吗？
```

**前置依赖**：#43（Context-Aware Filtering）

**状态**：❌ 未实现

**版本目标**：v2.3

---

## 补充说明

### hawk-bridge 与 soul-engine 的边界

```
┌─────────────────────────────────────────────────────────────┐
│                     hawk-bridge                             │
│  L0 记忆层：Capture / Recall / Decay / Storage             │
│  - 记忆的物理存储和检索                                     │
│  - 衰减策略（时间衰减）                                     │
│  - 多租户隔离                                             │
│  - 规则引擎（记忆生命周期规则）                              │
└─────────────────────────────────────────────────────────────┘
                            ↕ 调用
┌─────────────────────────────────────────────────────────────┐
│                     soul-engine                             │
│  进化层：提炼 / 抽象 / 进化 / 自我认知                       │
│  - Raw Memory → Pattern → Principle → Skill                │
│  - 知识图谱（血缘/矛盾/支持）                               │
│  - 进化规则（晋升/降级/合并）                               │
│  - 工作记忆（Session 上下文）                               │
│  - 自我认知（决策追踪/巡检报告）                            │
└─────────────────────────────────────────────────────────────┘
```

### soul-engine 的 52 项 TODO

详见：`https://github.com/relunctance/soul-engine/blob/master/TODO.md`

---

**最后更新**：2026-04-19
**维护者**：maomao <maomao@gql.ai>

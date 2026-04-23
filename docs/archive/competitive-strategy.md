# Competitive Strategy

> 从 TODO.md 归档
> 归档时间：2026-04-23

---

## 🎯 竞争战略与核心挑战（2026-04-23）

> 来源：用户战略分析 — hawk-bridge 在「Agent Memory」赛道建立行业标准的路线图
>
> **战场定义**：hawk-bridge 竞争的是「Agent 的记忆基础设施」，不是「更好的 RAG」
> - RAG = 查文档
> - Agent Memory = 让 Agent 真正变聪明、能进化、遵守规则、多 Agent 协作

### 战略里程碑

#### 🔴 Phase 0：止血（阻断性问题）—— 不做这些，谈论行业第一毫无意义

| 阻断性问题 | 对应 TODO | 优先级 |
|-----------|----------|--------|
| Schema v2 落地（4表拆分） | #52, #39, #33 | 🔴 阻断 |
| Pipeline 架构落地（统一调度） | ARCHITECTURE-v2.md 定义 | 🔴 阻断 |
| Recall 质量对标 M-flow（图拓扑） | #48, #109 | 🔴 阻断 |

#### 🟡 Phase 1：建立差异化壁垒

| 护城河 | 对应 TODO | 说明 |
|--------|---------|------|
| **进化机制**（Raw→Pattern→Principle→Skill） | #75-#78（soul-engine） | 没人做，M-flow/Cognee/Mem0 完全没有 |
| **规则引擎**（Capture/Recall/Decay 规则） | #60-#70 | 企业级可信执行，M-flow 没有 |
| **Multi-Agent 架构** | #6, #17, #22, #39, #73, #50 | M-flow 单Agent，hawk-bridge 天然多Agent |

#### 🟢 Phase 2：建立行业标准

| 目标 | 对应 TODO |
|------|---------|
| 发布公开 Benchmark（LoCoMo 对标） | #57（Memory ROI） |
| 《Agent Memory 白皮书》→ 定义行业标准 | 营销类，无专属 TODO |
| hawk-bridge 用户案例库 | 运营类，无专属 TODO |

### 对标 M-flow 必须填补的技术差距

| 技术差距 | 对应 TODO | 说明 |
|---------|---------|------|
| **① 图拓扑检索**（Bundle Search） | #109 | 最关键，M-flow 核心技术 |
| **② Coreference 消解** | #110 | 摄入时完成指代消解 |
| **③ Procedural Memory 提取** | #111 | 可复用模式（习惯/工作流/决策规则） |
| **④ 多数据库适配器** | #48 | Neo4j/Kuzu/LanceDB/PG/Chroma/Pinecone |

### 执行路线图

| 阶段 | 时间 | 关键 TODO | 产出 |
|------|------|----------|------|
| **Phase 0a** | 1周 | #60（规则引擎核心）+ Pipeline 基础 | 可执行的规则驱动记忆生命周期 |
| **Phase 0b** | 1周 | #48（VectorStore抽象）+ #109（GraphStage adapter） | 多后端支持 + 图检索入门 |
| **Phase 1a** | 2周 | #61（Capture规则）+ #71（Capture拒绝机制） | 记忆入口质量控制 |
| **Phase 1b** | 2周 | #110（Coreference）+ #111（Procedural Memory） | M-flow 对齐 |
| **Phase 1c** | 2周 | #6/#17/#22/#73（Multi-Agent Hook 系统） | autoself L3 支撑 |
| **Phase 2** | 3周 | Benchmark + 白皮书 + 官网 | 行业影响力 |

---

### [ ] 109. GraphStage——图拓扑检索（Bundle Search） {#item-109}
**来源：用户战略——对标 M-flow 核心技术差距**

M-flow 的 Bundle Search 是图路径成本传播——这是最难的部分，也是护城河最高的。

**M-flow 实现**：
```
向量找入口 → 图追踪证据链 → 路径成本评分
```

**hawk-bridge 当前**：
```
recall = 向量相似度排序（无图拓扑）
```

**实现方向**：
```typescript
// Recall Pipeline 增加 GraphStage
interface GraphStage {
  // 输入：向量检索候选 memories
  // 输出：Episode Bundle（带证据链评分）

  candidates: Memory[];           // 向量检索候选

  // 图构建
  graph: MemoryGraph;             // 记忆关系图
  nodes: { memory_id, embeddings };
  edges: { source, target, relation_type, weight };

  // 路径成本传播
  path_cost: Map<memory_id, number>;  // 路径成本
  evidence_chain: string[];           // 证据链

  // Bundle 输出
  bundles: EpisodeBundle[];       // 打包的召回结果
}

interface EpisodeBundle {
  root_memory_id: string;         // 入口记忆
  evidence_chain: string[];      // 证据链路径
  total_cost: number;             // 路径总成本
  confidence: number;            // 置信度
  related_memories: string[];     // 相关记忆
}
```

**两条路径**：
1. **短期**：adapter 模式支持 Neo4j，作为 Recall 的子模块
2. **长期**：自研图拓扑 + 路径成本传播算法

**Phase 0 建议**：先用 adapter 模式对接 M-flow 的 Bundle Search 作为 Recall 子模块

**前置依赖**：#48（VectorStore 抽象）
**优先级**：🔴 阻断（Phase 0 核心技术差距）

---

### [ ] 110. Capture Coreference Hook——指代消解 {#item-110}
**来源：用户战略——M-flow intake 时完成指代消解**

M-flow 在摄入时完成指代消解，不污染检索：
```
M-flow: "She said..." → 消解为 "Maria said..."
hawk-bridge 当前: 无指代消解
```

**问题**：
- "She/He/It/They" 在向量检索时无法匹配正确实体
- Coreference 不解决，recall 质量永远有瓶颈

**实现方向**：
```typescript
// Capture Pipeline 增加 CoreferenceStage
interface CoreferenceStage {
  // 输入：原始文本
  // 输出：消解后的文本 + 指代映射表

  input: string;                  // "She said she would come"

  // 消解结果
  resolved_text: string;          // "Maria said she would come"
  coreference_map: {
    resolved_pronoun: string;    // "She"
    resolved_entity: string;     // "Maria"
    memory_id?: string;          // 如果能关联到已有记忆
    confidence: number;
  }[];

  // 消解时机
  // 方案A：摄入时消解（不存储原始形式）
  // 方案B：双存储（原始+消解），recall 时用消解版本
}
```

**推荐方案A（摄入时消解）**：
- 减少存储冗余
- recall 时不存在原始形式，无法被污染

**前置依赖**：无
**优先级**：🟡 重要（Phase 1b）

---

### [ ] 111. Procedural Memory 类型——可复用模式提取 {#item-111}
**来源：用户战略——M-flow 提取"可复用模式"**

**问题**：
- M-flow 提取"可复用模式"（习惯、工作流、决策规则）
- hawk-bridge 当前只有 fact/preference/decision
- 没有 procedural 类型 → 无法区分"事实"和"可执行的操作流程"

**M-flow 的 Procedural Memory**：
```
"用户每次初始化项目都执行：npm init → install dependencies → create structure"
→ 提取为可复用的工作流记忆
```

**hawk-bridge 扩展方向**：
```typescript
// 扩展 memory_category 枚举
type MemoryCategory =
  | 'fact'        // 事实（静态）
  | 'preference'  // 偏好（主观）
  | 'decision'    // 决策（结论）
  | 'entity'      // 实体（对象）
  | 'procedural'; // NEW: 可复用流程/习惯/工作流

interface ProceduralMemory {
  category: 'procedural';

  // 流程描述
  trigger: string;                // 触发条件："用户初始化项目时"
  steps: string[];               // 执行步骤：["npm init", "install deps", ...]
  expected_outcome: string;       // 预期结果："一个配置好的项目"

  // 复用元数据
  execution_count: number;       // 执行次数
  success_rate: number;          // 成功率
  last_executed?: number;         // 上次执行时间

  // 来源
  sources: string[];             // 来自哪些 Raw 记忆提炼
}
```

**Capture 时 LLM 推断**：
- 包含"每次/总是/习惯性/流程/步骤" → Procedural
- 包含"我喜欢/偏好/倾向于" → Preference
- 包含"决定/结论/最终方案" → Decision

**前置依赖**：#1（Memory Taxonomy 扩展）
**优先级**：🟡 重要（Phase 1b）

---

### [ ] 112. StorageEngine 多后端抽象 {#item-112}
**来源：用户战略——多数据库适配器 + 架构v2.0 Storage Engine**

**现状**：
- hawk-bridge 当前只有 LanceDB 实现
- 其他竞品（M-flow）支持 Neo4j/Kuzu/LanceDB/PG/Chroma/Pinecone 全部插拔

**架构设计**：
```typescript
// StorageEngine 接口（适配器模式）
interface StorageEngine {
  // 记忆 CRUD
  insert(memory: MemoryRecord): Promise<string>;
  update(id: string, memory: MemoryRecord): Promise<void>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<MemoryRecord | null>;

  // 向量检索
  search(query: number[], topK: number, filters?: SearchFilters): Promise<SearchResult[]>;

  // 图存储（GraphStage #109）
  graph(): GraphStore;            // 返回图存储接口

  // 元数据
  stats(): Promise<StorageStats>;
}

// 内置实现
class LanceDBEngine implements StorageEngine { ... }   // 当前
class Neo4jEngine implements StorageEngine { ... }    // 新增（GraphStage 依赖）
class QdrantEngine implements StorageEngine { ... }   // 新增
class PineconeEngine implements StorageEngine { ... }  // 新增
class ChromaEngine implements StorageEngine { ... }    // 新增

// 配置驱动
interface StorageConfig {
  engine: 'lancedb' | 'neo4j' | 'qdrant' | 'pinecone' | 'chroma';
  engine_config: Record<string, any>;  // 引擎特定配置
}
```

**配置示例**：
```yaml
# ~/.hawk/config.yaml
storage:
  engine: "neo4j"  # 切换引擎只需改这一行
  neo4j:
    uri: "bolt://localhost:7687"
    username: "neo4j"
    password: "${NEO4J_PASSWORD}"
```

**前置依赖**：无
**优先级**：🔴 阻断（Phase 0b——GraphStage 依赖 Neo4j）

---

### [ ] 113. Rule Engine 核心——条件匹配 + 动作执行 {#item-113}
**来源：用户战略——规则引擎是 Phase 0 核心**

**规则引擎是记忆生命周期的驱动核心**：
```
Capture规则 → 写入控制
Recall规则 → 召回控制
Decay规则  → 衰减控制
Lifecycle  → 状态转换
```

**核心接口**：
```typescript
interface Rule {
  id: string;
  name: string;

  // 触发条件
  trigger: {
    event: 'capture' | 'recall' | 'decay' | 'state_transition' | 'verify';
    conditions: Condition[];
  };

  // 执行动作
  action: {
    type: 'block' | 'allow' | 'warn' | 'approval' | 'transform' | 'tag';
    params?: Record<string, any>;
  };

  priority: number;               // 优先级（数字越小越高）
  source: 'system' | 'user' | 'auto_generated';
  enabled: boolean;
}

interface Condition {
  field: string;                 // memory.text, memory.category, context.session_id
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex' | 'exists' | 'in';
  value: any;
}

// 执行结果
interface RuleResult {
  matched: boolean;
  action: 'block' | 'allow' | 'warn' | 'approval' | 'transform' | 'tag' | 'none';
  rule_id?: string;
  message?: string;
}
```

**Pipeline 集成**：
```typescript
// Pipeline Runner 执行规则引擎
class PipelineRunner {
  async runCapturePipeline(input: CaptureInput): Promise<CaptureResult> {
    // 1. CaptureStage 处理原始输入
    // 2. CoreferenceStage 指代消解（#110）
    // 3. RuleEngineStage 执行 Capture 规则（#61）
    //    → block: 拒绝写入
    //    → warn: 记录警告但不阻止
    //    → transform: 修改内容
    // 4. StorageEngine 写入

    const rules = await this.ruleEngine.getRules('capture');
    for (const rule of rules) {
      const result = rule.evaluate(input);
      if (result.matched) {
        if (result.action === 'block') {
          return { accepted: false, reason: result.message };
        }
      }
    }
    // ...
  }
}
```

**前置依赖**：无（独立模块，可提前实现）
**优先级**：🔴 阻断（Phase 0a——规则引擎是其他所有规则的基础）

---


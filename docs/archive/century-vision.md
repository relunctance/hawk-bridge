# Century Vision.Md

> 从 TODO.md 归档的战略前内容
> 归档时间：2026-04-23
> 原因：以 hawk-okr 为唯一战略基准，此内容为战略制定前编写的长期愿景，不适合保留在活跃 TODO 中

---

## 🧠 知识进化与分层蒸馏（100年计划支撑） {#知识进化与分层蒸馏}

> 这是 autoself "100年计划"的核心——记忆不只是存储，记忆需要**进化**。
> 从原始事件到Pattern到Principle到Skill，形成知识的蒸馏金字塔。
> 同时支撑ToB企业私域知识库的分层治理。

### [ ] 75. 知识蒸馏架构（Raw → Pattern → Principle → Skill） {#item-75}

**来源：autoself 100年计划 — 知识进化视角**

**问题**：当前 hawk-bridge 存储的是"原始记忆"（Raw），没有分层蒸馏机制。
100年积累后，记忆会变成噪音沼泽，无法检索和使用。

**知识四层蒸馏**：
```
┌─────────────────────────────────────────────────────────────────┐
│  L4 Skill（技能）                                               │
│  "npx create-next-app 的标准流程" → 可直接执行的步骤清单        │
│  来源：10次 项目初始化经验的Pattern汇总                         │
├─────────────────────────────────────────────────────────────────┤
│  L3 Principle（原则）                                           │
│  "Next.js项目应该用App Router而非Pages Router"                  │
│  来源：5个项目的架构决策Pattern                                  │
├─────────────────────────────────────────────────────────────────┤
│  L2 Pattern（模式）                                              │
│  "App Router的layout.tsx是全局布局入口点"                       │
│  来源：3次 Next.js项目经验                                       │
├─────────────────────────────────────────────────────────────────┤
│  L1 Raw（原始记忆）                                              │
│  "2024-03-15 用户提到想用Next.js做项目"                         │
│  来源：单次对话记录                                               │
└─────────────────────────────────────────────────────────────────┘
```

**自动蒸馏触发条件**：
| 层级 | 触发条件 | 自动/手动 |
|------|---------|---------|
| L1 Raw | capture 写入 | 自动 |
| L2 Pattern | 3+ 条相关 Raw 记忆 + LLM 推断 | 自动 |
| L3 Principle | 3+ 个相关 Pattern + 因果关系 | 自动 |
| L4 Skill | 3+ 个相关 Principle + 可执行性验证 | 手动（需人工确认） |

**hawk-bridge 需要增加的能力**：
- 每条记忆的 `distillation_level` 字段（L1/L2/L3/L4）
- 祖先链追溯：`ancestors: [memory_id_1, memory_id_2, ...]`
- 蒸馏置信度：`distillation_confidence: 0.0-1.0`
- 蒸馏版本号：`distillation_version: int`

**前置依赖**：#57（Memory ROI）+ #44（记忆验证引擎）
**优先级**：🟡

---

### [ ] 76. 动态分层存储（价值驱动 Tier 自动升降） {#item-76}

**来源：autoself 100年计划 — 动态存储视角**

**问题**：当前 hawk-bridge 的 tier（HOT/WARM/ARCHIVE）是静态的（按时间），但应该按**价值**动态调整。

**动态分层机制**：
```
价值评分 = f(recall_frequency, recall_quality, task_contribution, staleness)

┌───────────────────────────────────────────────────────────────┐
│  L0 Working Memory（工作记忆）                                 │
│  价值评分 Top 20条 │ 驻留时间：每次会话 │ 存储：内存        │
├───────────────────────────────────────────────────────────────┤
│  L1 HOT（高频记忆）                                           │
│  价值评分 Top 5%    │ 驻留时间：7天    │ 存储：SQLite      │
├───────────────────────────────────────────────────────────────┤
│  L2 WARM（中频记忆）                                          │
│  价值评分 5%-30%   │ 驻留时间：30天   │ 存储：向量DB       │
├───────────────────────────────────────────────────────────────┤
│  L3 COLD（低频记忆）                                           │
│  价值评分 30%-80%  │ 驻留时间：90天   │ 存储：归档向量DB   │
├───────────────────────────────────────────────────────────────┤
│  L4 ARCHIVE（冷存储）                                          │
│  价值评分 <30%     │ 永久保留         │ 存储：GitHub JSON  │
└───────────────────────────────────────────────────────────────┘
```

**升降规则**：
- 每次 recall 时更新 `last_accessed` + `access_count`
- 每次 task 完成后，tangseng-brain 反馈 `task_contribution_score`
- 每周 cron 扫描，重新计算价值评分，触发 tier 迁移
- **降级时保留完整版本历史**（#55 Version History）

**前置依赖**：#57（Memory ROI）+ #60（规则引擎）
**优先级**：🟡

---

### [ ] 77. 记忆血缘链（Ancestor/Descendant 追溯） {#item-77}

**来源：autoself 100年计划 — 知识溯源视角**

**问题**：当一条 Pattern 记忆被 recall，用户想知道"这条 Pattern 是从哪几条 Raw 记忆提炼出来的"。

**血缘链设计**：
```typescript
interface MemoryLineage {
  memory_id: string;
  distillation_level: 'L1_Raw' | 'L2_Pattern' | 'L3_Principle' | 'L4_Skill';

  // 祖先链（从哪来）
  ancestors: {
    memory_id: string;
    distillation_level: string;
    contribution_weight: number;  // 0.0-1.0，这条记忆对这个后代的贡献度
    distillation_method: 'llm_inference' | 'user_annotation' | 'auto_merge';
  }[];

  // 后代链（影响到哪去）
  descendants: {
    memory_id: string;
    distillation_level: string;
  }[];

  // 蒸馏过程记录
  distillation_log: {
    timestamp: string;
    action: 'created' | 'merged' | 'upgraded' | 'downgraded';
    triggered_by: 'auto' | 'user' | 'rule';
    notes: string;
  }[];
}
```

**应用场景**：
- "这条 Pattern 记忆来自哪10条 Raw 记忆？" → 展示祖先链
- "这条 Raw 记忆最终影响了哪些决策？" → 展示后代链
- "这个 Skill 是从哪些记忆提炼的？" → 展示完整蒸馏路径

**前置依赖**：#75（知识蒸馏架构）
**优先级**：🟡

---

### [ ] 78. Notion-Like 个人知识库视图 {#item-78}

**来源：autoself 100年计划 — ToB/ToC 产品化视角**

**问题**：用户需要一个"知识浏览器"，像 Notion 一样浏览、组织、和搜索自己的记忆。

**功能需求**：
```
┌─────────────────────────────────────────────────────────────────┐
│  📚 个人知识库视图                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  侧边栏                         主内容区                        │
│  ├─ 🏠 首页（最近访问）          ┌─────────────────────────┐   │
│  ├─ 📂 Raw 记忆                 │ 最近访问                 │   │
│  │   ├─ 项目A (12条)            │ • Next.js项目架构决策   │   │
│  │   └─ 项目B (8条)             │ • 用户偏好：喜欢用App   │   │
│  ├─ 🧩 Patterns                 │   Router               │   │
│  │   └─ Next.js架构模式 (3条)   │ • 技术栈选型：React    │   │
│  ├─ 📜 Principles               └─────────────────────────┘   │
│  │   └─ "用App Router"          │                          │   │
│  ├─ ⚙️ Skills                   │ 知识蒸馏层级             │   │
│  │   └─ 初始化Next.js项目        │ [Raw] [Pattern]         │   │
│  └─ 📊 Analytics                │   [Principle] [Skill]   │   │
│      └─ 记忆健康度报告            │                          │   │
│                                 │  展开任何层级可查看详情   │   │
└─────────────────────────────────────────────────────────────────┘
```

**视图类型**：
| 视图 | 用途 | 交互 |
|------|------|------|
| 时间线 | 按时间浏览记忆 | 滚轴缩放 |
| 层级树 | 按蒸馏层级组织 | 折叠/展开 |
| 关系图 | 记忆之间的关联可视化 | 点击跳转 |
| 搜索框 | 全文 + 向量混合搜索 | 即时结果 |

**前置依赖**：#75（知识蒸馏）+ #45（知识图谱关系层）
**优先级**：🟢

---

### [ ] 79. ToB 企业私域知识库隔离 + 治理 {#item-79}

**来源：autoself 100年计划 — ToB 企业知识视角**

**问题**：hawk-bridge 的多租户（#39）只是技术隔离，企业私域知识库需要**语义隔离 + 治理**。

**企业知识治理需求**：
```
┌─────────────────────────────────────────────────────────────────┐
│  ToB 企业私域知识库架构                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  企业A的私域知识       企业B的私域知识       企业C的私域知识     │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐    │
│  │ 飞书文档     │      │ Confluence  │      │ Notion      │    │
│  │ Jira工单    │      │ Slack记录   │      │ Linear      │    │
│  │ SAP系统     │      │ GitHub     │      │ Figma      │    │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘    │
│         │                     │                     │           │
│         ▼                     ▼                     ▼           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           KnowledgHub 企业知识中枢                      │    │
│  │  ①采集 ②整理 ③关联 ④提炼 ⑤存储                       │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              hawk-bridge 企业记忆层                      │    │
│  │  tenant_id隔离 │ scope: org/team/project │ 治理规则   │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              autoself L0-L6 进化闭环                     │    │
│  │  企业知识 → 记忆 → 巡检 → 决策 → 执行 → 进化            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**治理规则**：
| 规则 | 内容 |
|------|------|
| 知识归属 | 哪些记忆属于个人，哪些属于团队，哪些属于公司 |
| 访问控制 | 不同角色（员工/经理/高管）能看到哪些知识 |
| 保密等级 | 公开/内部/机密/绝密四级分类 |
| 留存策略 | 不同类型知识保留多久后归档/删除 |
| 审计追踪 | 谁在什么时间访问/修改了哪些知识 |

**前置依赖**：#39（Multi-tenant Namespace）+ #52（记忆加密层）
**优先级**：🟡

---

### [ ] 80. 记忆时间胶囊（Time Capsule） {#item-80}

**来源：autoself 100年计划 — 长期记忆视角**

**问题**：用户想保存"这一刻的状态"，像时间胶囊一样，10年后再打开。

**场景**：
- "保存2026年4月我对这个项目的所有认知"
- "保存当前团队的技术栈选择决策"
- "保存我和这个用户的所有交互历史"

**功能设计**：
```typescript
interface TimeCapsule {
  capsule_id: string;
  name: string;
  description: string;

  // 封装时的时间戳
  sealed_at: string;

  // 包含的记忆快照
  memories: {
    memory_id: string;
    content_snapshot: string;  // 封装时的内容（后续修改不影响胶囊内）
    distillation_level: string;
  }[];

  // 解封条件
  unlock_conditions: {
    type: 'date' | 'event' | 'manual';
    trigger?: string;  // 日期或事件描述
  };

  // 解封后的状态
  unlocked_at?: string;
  status: 'sealed' | 'unlocked';
}
```

**使用场景**：
- 里程碑记忆：项目立项时的决策记录，5年后回顾
- 个人成长：每年末封装一年的学习和工作，10年后对比
- 团队知识：项目结束时的团队经验沉淀，新成员入职时打开

**前置依赖**：#55（Version History）
**优先级**：🟢

---

### [ ] 81. 记忆置信度衰减的可配置曲线 {#item-81}

**来源：autoself 100年计划 — 认知科学视角**

**问题**：当前 hawk-bridge 的衰减是线性的（30天TTL），但人类记忆的衰减是**艾宾浩斯曲线**——先快后慢。

**衰减曲线类型**：
```typescript
type DecayCurve = 'linear' | 'exponential' | 'ebbinghaus' | 'step' | 'custom';

// Ebbinghaus 遗忘曲线（先快后慢）
// f(t) = e^(-t/S) where S 是记忆强度参数

// 艾宾浩斯曲线适合：情景记忆（"上周五发生了什么"）
// 线性曲线适合：语义记忆（"项目用的是React"）
// Step 函数适合：重要事件（"架构评审结论"应该突触巩固）

interface DecayConfig {
  memory_type: 'episodic' | 'semantic' | 'procedural' | 'event';
  curve: DecayCurve;
  params: {
    initial_decay_rate?: number;  // 初始衰减速率
    plateau_threshold?: number;   // 衰减到多少后趋稳
    step_points?: number[];      // step 函数的台阶时间点
  };

  // 不同类型记忆用不同曲线
  default_configs: {
    episodic: { curve: 'ebbinghaus', params: { S: 7 } };    // 7天记忆强度
    semantic: { curve: 'exponential', params: { rate: 0.01 } };  // 慢衰减
    event: { curve: 'step', params: { steps: [1, 7, 30, 90] } };  // 关键节点
    procedural: { curve: 'linear', params: { rate: 0.001 } };     // 最慢衰减
  };
}
```

**配置界面**：
- 用户可以按 memory_type 配置衰减曲线
- 高级用户可以自定义曲线参数
- 系统提供预设模板："学术研究模式"、"项目管理模式"、"个人生活模式"

**前置依赖**：#63（Decay 衰减规则）
**优先级**：🟢

---

### [ ] 82. 跨会话上下文迁移 {#item-82}

**来源：autoself 100年计划 — 连续性视角**

**问题**：用户从 Desktop 换到 Laptop，或者从工作切换到个人任务，hawk-bridge 需要理解"这是同一个人在不同设备/场景下的延续"。

**迁移场景**：
```
场景A：设备切换
  Desktop → Laptop（同一用户，同一任务上下文）
  → 迁移 Working Memory + HOT 层
  → COLD/ARCHIVE 保持不变

场景B：场景切换
  工作项目A → 个人项目B（同一设备，不同上下文）
  → 保留项目A的 HOT，不迁移到项目B
  → 创建独立的场景上下文（scene_id）

场景C：时间跳跃
  用户休假2周回来 → 需要"恢复工作上下文"
  → 推送休假期间的相关更新摘要
  → 重建工作上下文
```

**实现设计**：
```typescript
interface ContextMigration {
  migration_id: string;
  from_scene: string;    // 源场景
  to_scene: string;      // 目标场景

  // 迁移策略
  strategy: 'full' | 'selective' | 'reconstruct';

  // 选择性迁移时，哪些 scope/importance 迁移
  selective_rules: {
    min_importance: number;  // >= 0.7 才迁移
    scopes: string[];       // 只迁移这些 scope
    memory_types: string[];
  };

  // 重建策略（reconstruct 时使用）
  reconstruct_prompt: string;  // LLM 用来重建上下文的 prompt
}
```

**前置依赖**：#51（跨设备 Sync）+ #22（Multi-Agent Session Isolation）
**优先级**：🟡

---

### [ ] 83. 记忆的可证明性（Provable Memory） {#item-83}

**来源：autoself 100年计划 — 企业合规视角**

**问题**：ToB 企业场景下，用户需要能证明"某条记忆在某个时间点存在且未被篡改"——像区块链的不可篡改性。

**场景**：
- "证明我们在2026年1月做了这个架构决策"
- "证明这个安全漏洞在发现前3天就存在于代码中"
- 审计/合规/法律场景

**技术实现**：
```typescript
interface ProvableMemory {
  memory_id: string;

  // Merkle Tree 锚定
  merkle_root: string;        // 当日所有记忆的 Merkle 根
  merkle_proof: object;      // 该记忆在 Merkle 树中的证明

  // 时间戳权威
  timestamp_authority: 'local' | 'TrustRouter' | 'Blockchain';

  // 不可篡改性保证
  immutability: {
    sealed_at: string;        // 锚定时间
    sealed_by: string;        // 哪个节点锚定的
    hash_chain: string;       // 链接到前一天的锚定
    audit_trail: object[];    # 所有访问/读取的审计记录
  };

  // 验证接口
  verify(): Promise<{
    exists: boolean;
    unmodified: boolean;
    timestamp_valid: boolean;
  }>;
}
```

**存储层**：
- 每日生成 Merkle 根，发布到 TrustRouter（轻量级时间戳权威）
- 可选锚定到比特币区块链（最高权威，但成本高）
- 审计日志永久保留，任何读取都有记录

**前置依赖**：#52（记忆加密层）+ #27（Audit Log）
**优先级**：🟢

---

### [ ] 84. 主动遗忘的社会化影响（The Social Impact of Forgetting） {#item-84}

**来源：autoself 100年计划 — 哲学/伦理视角**

**问题**：遗忘不只是个人行为，也有社会化影响——系统性地遗忘某些记忆（如历史错误）vs 选择性保留（如悲剧事件），这是需要用户自己决策的。

**功能设计**：
```typescript
interface SocialForgetPolicy {
  // 什么类型的记忆有社会化影响
  social_memory_types: ('historical_error' | 'conflict_record' | 'personal_failure' | 'team_failure')[];

  // 遗忘策略选项
  policies: {
    type: 'preserve_forever' | 'anonymize_then_delete' | 'delete_immediately';
    requires_explicit_consent: boolean;
    review_period_days: number;  // 遗忘前多少天提醒用户
  };

  // 团队场景下的遗忘政策
  team_policies: {
    who_can_initiate: 'individual' | 'team_lead' | 'org_admin';
    who_must_approve: string[];
    retention_years: number;
  };
}
```

**用户界面**：
- 遗忘前7天提醒用户
- 提供"预览遗忘影响"功能——展示这条记忆影响了哪些后代记忆
- 遗忘后保留血缘链元数据（但不保留内容）

**前置依赖**：#70（主动遗忘机制）+ #77（记忆血缘链）
**优先级**：🟢

---

### [ ] 85. 记忆经济学（Memory Economy） {#item-85}

**来源：autoself 100年计划 — 价值量化视角**

**问题**：用户愿意为什么样的记忆付费？记忆的价值如何量化？

**记忆经济学模型**：
```typescript
interface MemoryEconomics {
  // 记忆价值评估
  value_model: {
    // 存储成本
    storage_cost_per_month: number;  // 分层存储成本不同

    // 召回价值
    recall_value: {
      hits: number;           // 命中次数
      quality_score: number; // 命中质量（1-5分）
      time_saved_minutes: number;  // 节省的时间
    };

    // 决策贡献
    decision_contribution: {
      influenced_decisions: number;  // 影响了多少决策
      decision_quality_score: number;  // 决策质量评分
    };

    // 知识变现
    knowledge_monetization: {
      shared_with: string[];  // 分享给了谁
      external_value_generated: number;  // 产生的外部价值
    };
  };

  // ROI 计算
  memory_roi: {
    monthly_storage_cost: number;
    monthly_recall_value: number;
    monthly_decision_value: number;
    roi_ratio: number;
  };
}
```

**应用场景**：
- 告诉用户："这1000条记忆每月花费$2，但节省了约$50的价值"
- 推荐用户删除"低价值记忆"（存储成本 > 召回价值）
- 企业场景：统计每个部门的知识资产价值

**前置依赖**：#57（Memory ROI 量化评估）
**优先级**：🟢

---

### [ ] 86. 跨 Agent 记忆迁移协议 {#item-86}

**来源：autoself 100年计划 — Agent 互操作视角**

**问题**：当用户从 OpenClaw 切换到其他 Agent（如 Claude Code），或者同时使用多个 Agent，如何让记忆"跟着用户走"而非"跟着 Agent 走"？

**迁移协议设计**：
```
┌─────────────────────────────────────────────────────────────────┐
│  用户记忆云（Personal Memory Cloud）                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  用户A的记忆存储（供应商中立）                              │  │
│  │  • 标准 Schema（JSON-LD 格式）                            │  │
│  │  • OpenMemory API 接口                                    │  │
│  │  • 跨 Agent 可互操作                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│              ▲                    ▲                    ▲          │
│              │                    │                    │          │
│              │                    │                    │          │
│        ┌────────────┐       ┌────────────┐       ┌────────────┐  │
│        │ OpenClaw  │       │Claude Code │       │   其他     │  │
│        │  hawk-    │       │   Memory   │       │   Agent   │  │
│        │  bridge   │       │   System   │       │           │  │
│        └────────────┘       └────────────┘       └────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**标准 Schema（OpenMemory Protocol）**：
```typescript
interface OpenMemoryProtocol {
  version: '1.0';
  export_format: 'json-ld';

  // 标准化字段（所有 Agent 都支持）
  memory: {
    id: string;
    content: string;
    created_at: string;
    updated_at: string;
    distillation_level: 'L1_Raw' | 'L2_Pattern' | 'L3_Principle' | 'L4_Skill';

    // 跨 Agent 互操作必需字段
    provenance: {
      original_agent: string;
      original_user_id: string;
      export_timestamp: string;
      export_version: string;
    };

    // 私有字段（Agent 特定，不强制迁移）
    private_data: object;
  }[];
}
```

**前置依赖**：#53（商业化基础设施）
**优先级**：🟡

---

### [ ] 87. 记忆的"诺贝尔奖"机制 {#item-87}

**来源：autoself 100年计划 — 知识进化激励视角**

**问题**：如何激励高质量的 Pattern/Principle 提炼？需要类似"诺贝尔奖"的机制，让好的知识生产者得到认可。

**机制设计**：
```typescript
interface KnowledgeRecognition {
  // 记忆贡献积分
  contribution_score: {
    memory_id: string;
    author_id: string;

    // 贡献指标
    downstream_patterns_created: number;   // 这条记忆产生了多少 Pattern
    decisions_influenced: number;          // 影响了多少决策
    recall_count: number;                  // 被 recall 了多少次
    user_endorsements: number;             // 其他用户认可次数

    // 综合评分
    score: number;
    percentile: number;  // 在所有记忆中的排名百分位
  };

  // 荣誉系统
  recognition: {
    level: 'bronze' | 'silver' | 'gold' | 'platinum';
    criteria: string;
    awarded_at: string;
  };

  // 知识进化树可视化
  evolution_tree: {
    root_memory_id: string;
    descendants: string[];  // 完整的知识进化树
    depth: number;           // 蒸馏深度
  };
}
```

**应用场景**：
- 企业内部："本月最 impactful 的记忆贡献者"
- 个人用户："这条记忆产生了3个Pattern，是你的高价值记忆"
- 社区共享：高质量 Pattern 可以被"引用"，类似学术论文

**前置依赖**：#77（记忆血缘链）
**优先级**：🟢

---

### [ ] 88. 记忆的"平行宇宙"视图 {#item-88}

**来源：autoself 100年计划 — 决策探索视角**

**问题**：用户做了决策A，想知道"如果我当初选B，会怎样？"——类似时间旅行，但用于记忆探索。

**功能设计**：
```typescript
interface ParallelUniverse {
  // 分支点
  branch_point: {
    memory_id: string;          // 触发分支的记忆
    decision_made: string;      // 实际做的决策
    alternatives: string[];      // 其他选项
    branch_reason: string;      // 为什么分支
  };

  // 平行宇宙记忆
  universes: {
    universe_id: string;
    path: string[];              // 决策路径
    hypothetical_memories: {
      memory_id: string;
      content: string;
      divergence_point: string;  // 从哪个记忆开始分叉
      plausibility_score: number; // 这个平行宇宙的可能性评估
    }[];
  };

  // 使用场景
  // "如果当初用Next.js Pages Router而不是App Router，这个项目会怎样？"
  // → 基于历史Pattern构建一个假设的记忆链
}
```

**前置依赖**：#75（知识蒸馏）+ #45（知识图谱关系）
**优先级**：🟢

---

### [ ] 89. 记忆压缩质量评估 {#item-89}

**来源：autoself 100年计划 — 知识质量视角**

**问题**：当 Raw 记忆被压缩成 Pattern/Principle，信息有没有丢失？压缩质量如何评估？

**评估指标**：
```typescript
interface CompressionQuality {
  original_memory_ids: string[];  // 被压缩的原始记忆

  // 信息保留度
  information_retention: {
    key_entities_preserved: number;   // 关键实体保留了多少
    key_relationships_preserved: number;  // 关键关系保留了多少
    sentiment_preserved: boolean;    // 情感极性是否保留
    temporal_accuracy: number;       // 时间准确性
    causal_chain_preserved: boolean; // 因果链是否保留
  };

  // 压缩效率
  compression_ratio: number;   // 原始长度 / 压缩后长度
  abstraction_level: number;    // 抽象层级（1-5）

  // 实用性
  utility_score: {
    recall_precision: number;    // recall 时能否被正确检索
    decision_relevance: number; // 对决策的贡献度
    learnability: number;       // 新人能否快速理解
  };

  // 综合质量评分
  quality_score: number;  // 0.0 - 1.0
}
```

**自动触发**：
- 每次蒸馏操作后自动计算
- quality_score < 0.6 时告警，提示可能需要人工介入
- 用户可配置最低质量阈值

**前置依赖**：#40（Auto-Compression）+ #57（Memory ROI）
**优先级**：🟢

---

### [ ] 90. 多语言记忆语义等价 {#item-90}

**来源：autoself 100年计划 — 全球化视角**

**问题**：用户用中文记忆"Next.js"，英文问"tell me about Next.js"，recall 时语言不同如何匹配？

**功能设计**：
```typescript
interface MultilingualMemory {
  // 记忆的语义等价表示
  semantic_equivalents: {
    memory_id: string;
    representations: {
      zh: string;   // 中文
      en: string;   // 英文
      code?: string;  // 代码表示
      ja?: string;    // 日文
      // ... 其他语言
    };

    // 语言无关的核心语义
    core_semantics: {
      entities: string[];    // 核心实体
      relations: object[];    // 核心关系
      language_neutral_id: string;  // 语言无关ID
    };

    // 默认显示语言
    default_language: string;
    user_preferred_language: string;
  };

  // 跨语言 recall
  cross_lingual_recall: {
    query_language: string;
    matched_memory_language: string;
    cross_lingual_similarity: number;  // 跨语言相似度
    translation_required: boolean;     // 是否需要翻译
  };
}
```

**实现方案**：
- 存储时用多语言 embedding 模型（如 LaBSE）
- 或者存储语言无关的"核心语义图谱"
- recall 时支持跨语言查询

**前置依赖**：#47（Embedding Provider 抽象）
**优先级**：🟢

---

### [ ] 91. 记忆的温度感（Memory Warmth） {#item-91}

**来源：autoself 100年计划 — 情感计算视角**

**问题**：记忆不只是信息，还有情感温度——"和这个同事的合作经历是温暖的还是冷淡的？"记忆应该有"情感维度"。

**功能设计**：
```typescript
interface MemoryWarmth {
  memory_id: string;

  // 情感分析
  emotional_tone: {
    primary: 'warm' | 'neutral' | 'cold' | 'mixed';
    secondary?: string;  // 补充描述
    intensity: number;   // 0.0 - 1.0
  };

  // 关联实体的情感
  entity_sentiments: {
    entity_name: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    confidence: number;
    last_updated: string;
  }[];

  // 温度对 recall 的影响
  warmth_influence: {
    // 高温度记忆更容易被积极情绪触发 recall
    recall_temperature_threshold: number;

    // 情感一致性：高温度查询匹配高温度记忆
    emotional_alignment_weight: number;  // recall 时的权重
  };

  // 使用场景
  // "找到所有温暖的团队合作记忆" → emotional_tone = warm
  // "找到和这个客户的所有交互，温度下降的记录" → 情感趋势分析
}
```

**前置依赖**：#41（User Modeling）
**优先级**：🟢

---

### [ ] 92. 记忆的"考古学"模式 {#item-92}

**来源：autoself 100年计划 — 历史探索视角**

**问题**：当记忆积累10年后，用户想"考古"——探索早期记忆，理解认知成长轨迹。

**考古学模式功能**：
```typescript
interface MemoryArchaeology {
  // 时间切片
  time_slices: {
    start_date: string;
    end_date: string;
    theme?: string;           // 这个时期的主题
    top_memories: string[];   // 这个时期的 top 记忆
    dominant_patterns: string[];  // 这个时期形成的 Pattern
  }[];

  // 认知成长轨迹
  cognitive_evolution: {
    timeline: {
      period: string;         // "2024 Q1"
      key_insight: string;    // 这个时期的重大认知
      topics_focused: string[];
      topics_abandoned: string[];  // 不再关注的主题
      warmth_trend: 'increasing' | 'stable' | 'decreasing';
    }[];
  };

  // 考古发现
  discoveries: {
    oldest_memory: string;     // 最古老的记忆
    most_influential_memory: string;  // 被引用最多的记忆
    unexpected_connections: {  // 跨越时间的意外关联
      memory_a: string;
      memory_b: string;
      connection_type: string;
      surprise_score: number;
    }[];
  };

  // 考古报告生成
  generate_report: {
    period: string;
    format: 'narrative' | 'timeline' | 'infographic';
    include_warmth: boolean;
    include_patterns: boolean;
  };
}
```

**用户界面**：
- "探索你的2024年" → 生成年度记忆考古报告
- "认知成长时间线" → 可视化认知演变
- "最意外的发现" → 跨越时间的意外关联

**前置依赖**：#77（记忆血缘链）+ #91（Memory Warmth）
**优先级**：🟢

---

### [ ] 96. 生命周期适配蒸馏引擎（人/企业/组织） {#item-96}

**来源：autoself 100年计划 — 知识进化策略适配视角**

**背景**：人的需求在变——少年、成年、中年、老年，企业也有不同阶段——初创、成长、成熟、转型。知识的生命周期和进化蒸馏策略不应该用同一套逻辑贯穿始终。同一套"3次重复触发Pattern"对少年太激进，对老年又太慢。

**核心洞察**：
```
人：少年 → 成年 → 中年 → 老年
        ↓       ↓       ↓       ↓
记忆策略：吸收型  提炼型  整合型  传承型

企业：初创 → 成长 → 成熟 → 转型/遗产
        ↓       ↓       ↓       ↓
知识策略：快速Capture  Pattern→Principle  传承 vs 断舍离
```

### 人的四阶段策略

| 维度 | 少年（0-25） | 成年（25-45） | 中年（45-65） | 老年（65+） |
|------|-------------|--------------|--------------|------------|
| **记忆模式** | 吸收型（多多益善） | 提炼型（形成模式） | 整合型（原则体系） | 传承型（智慧遗产） |
| **蒸馏触发** | 5次重复 | 3次重复 | 2次重复 | 1次重要经验 |
| **抽象偏好** | 低（保留原始） | 中 | 高 | 极高 |
| **衰减曲线** | 快速（艾宾浩斯） | 正常 | 慢衰减 | 极慢 + 突触巩固 |
| **遗忘策略** | 自然遗忘即可 | 清理噪音 | 强化核心 | 刻意保留意义 |

### 企业四阶段策略

| 维度 | 初创（0-3年） | 成长（3-10年） | 成熟（10-30年） | 遗产（30+年） |
|------|-------------|----------------|----------------|--------------|
| **知识模式** | 战斗经验，存活者偏差 | 快速迭代 | 系统化，流程固化 | 知识老化，需断舍离 |
| **遗忘策略** | 快速遗忘失败，保留成功 | 正常衰减 | 慢衰减，保护核心 | 激进删除过时知识 |
| **治理强度** | 宽松，大家随意 | 中等 | 严格，变更需审批 | 传承 vs 断舍离 |
| **核心风险** | 人走知识失 | 知识分散，版本乱 | 知识僵化，创新抑制 | 知识断层 |

### 生命周期适配蒸馏引擎

```typescript
type HumanLifeStage = 'youth' | 'early_adulthood' | 'midlife' | 'late_life';
type OrgLifecycleStage = 'startup' | 'growth' | 'maturity' | 'legacy';

interface LifecycleDistillationEngine {
  // 阶段检测
  detect_stage(): HumanLifeStage | OrgLifecycleStage;

  // 获取当前阶段的蒸馏策略
  get_distillation_config(stage: Stage): DistillationConfig {
    // 根据阶段返回不同的蒸馏阈值、遗忘曲线、抽象偏好
  }

  // 阶段转换时的渐变过渡
  transition_blend(from: Stage, to: Stage, progress: number): DistillationConfig {
    // 0.0 = 完全旧策略，1.0 = 完全新策略，中间线性插值
  }
}

// 遗忘曲线阶段适配
const decayCurvesByStage = {
  youth: 'ebbinghaus',           // 先快后慢，快速迭代
  early_adulthood: 'ebbinghaus', // 正常艾宾浩斯
  midlife: 'step',               // 阶梯衰减，关键节点突触巩固
  late_life: 'linear',           // 线性衰减，接近永久保留
};

// 蒸馏阈值阶段适配
const distillationThresholds = {
  youth: { pattern_trigger: 5, min_raw: 10 },   // 多积累，不急提炼
  early_adulthood: { pattern_trigger: 3, min_raw: 5 },
  midlife: { pattern_trigger: 2, min_raw: 3 },   // 加速整合
  late_life: { pattern_trigger: 1, min_raw: 2 }, // 加速传承
};
```

### 人与企业交叉（最复杂情况）

当一个人在中年的成长期公司时，记忆策略需要同时考虑两个生命周期：

```typescript
// 个体在组织中的记忆策略融合
interface PersonInOrgAdaptation {
  person_stage: HumanLifeStage;
  org_stage: OrgLifecycleStage;

  // 策略融合
  final_strategy = f(person_stage, org_stage, context);

  // 知识归属判断
  knowledge_ownership: {
    // 公司知识：随公司生命周期
    // 个人知识：随个人生命周期
    // 混合知识：需判断归属
  };

  // 离职时知识处理
  offboarding_strategy: {
    // 公司知识 → 留在公司（强制）
    // 个人知识 → 可选择带走或捐赠
    // 混合知识 → 需要归属判断
  };
}
```

### 落到 hawk-bridge 的实现

```typescript
// 新增配置项
interface MemoryLifecycleConfig {
  entity_type: 'person' | 'org' | 'person_in_org';
  entity_age_years: number;
  current_stage: Stage;
  stage_config: DistillationConfig;  // 当前阶段的蒸馏配置
}

// API
POST /api/memory/config/lifecycle
{
  "entity_type": "person",
  "entity_age_years": 30,
  "auto_detect_stage": true
}

// Recall时自动应用生命周期权重
GET /api/memory/recall?query=...&lifecycle_boost=true
```

**前置依赖**：#75（知识蒸馏架构）+ #81（可配置衰减曲线）
**优先级**：🟡

---

### [ ] 97. 阶段转换触发器（动态推断 vs 手动设置） {#item-97}

**来源：autoself 100年计划 — 知识进化动态适配视角**

**背景**：阶段转换不是按年龄一刀切，而是按"认知成熟度"动态判断。一个25岁的人可能已经是"整合型"，一个45岁的人可能还是"提炼型"。

**动态检测指标**：

```typescript
interface StageTransitionSignals {
  // 阶段转换的信号
  signals: {
    wisdom_score: number;         // 智慧评分（通过记忆数据分析）
    distillation_frequency: number;  // 高层记忆提炼频率
    teaching_behavior: boolean;   // 开始主动教导他人
    reflection_behavior: boolean; // 开始频繁回顾和整合过去
    abstraction_ratio: number;   // 高层记忆占比变化趋势
    pattern_count: number;       // 积累了多少Pattern
    principle_count: number;     // 积累了多少Principle
  };

  // 转换触发条件
  trigger: {
    age_based: boolean;           // 年龄到了自动触发
    wisdom_based: boolean;        // 智慧评分达到阈值
    behavior_based: boolean;      // 行为模式变化
    manual_override: boolean;      // 用户手动切换
  };

  // 阶段渐变而非跳跃
  transition_period_months: number;  // 过渡期（如2年）
}
```

**手动设置 vs 自动推断**：

| 模式 | 适用场景 | 精度 |
|------|---------|------|
| 自动推断 | 大多数用户，开箱即用 | 中等 |
| 手动设置 | 有明确自我认知的用户 | 高 |
| 半自动（建议 + 确认） | 每次阶段转换提示用户确认 | 高且用户可控 |

**前置依赖**：#96（生命周期适配蒸馏引擎）
**优先级**：🟡

---

### [ ] 98. 知识遗产化引擎（遗产 vs 断舍离） {#item-98}

**来源：autoself 100年计划 — 传承视角**

**背景**：无论是个人老年期还是企业遗产期，都会面临"什么该留、什么该舍"的问题。不是所有记忆都值得传承，有些应该优雅地消逝。

**知识遗产分类**：

```typescript
type LegacyType = 'perpetuate' | 'archive' | 'delete';

// 知识遗产评估
interface LegacyAssessment {
  memory_id: string;

  // 遗产价值评估
  legacy_value: {
    historical_significance: number;   // 历史意义
    teaching_value: number;          // 教学价值
    emotional_value: number;         // 情感价值（对家族/团队）
    practical_value: number;          // 实用价值
    uniqueness: number;              // 独特性（是否独一无二）
  };

  // 建议
  recommendation: LegacyType;
  reasoning: string;

  // 传承对象
  inherit_target: {
    type: 'family' | 'team' | 'org' | 'public';
    specific_targets?: string[];
  };
}

// 遗产化执行
interface LegacyAction {
  // 永久保留（perpetuate）
  perpetual_memories: {
    // 永久存储，不可删除
    // 例：家族重大事件、核心价值观、企业使命
  };

  // 归档（archive）
  archived_memories: {
    // 保留元数据，内容可删除
    // 例：普通项目记录、日常决策
  };

  // 删除（delete）
  deleted_memories: {
    // 彻底删除，释放空间
    // 例：过时技术栈、已遗忘的失败经历
  };

  // 遗产时间胶囊
  legacy_capsule: {
    // 封装给后代的记忆包
    memories: string[];
    message_to_descendants: string;
    unlock_conditions: 'immediate' | 'on_demand' | 'scheduled';
  };
}
```

**企业遗产场景**：

```typescript
// 企业被收购/关闭时的知识遗产处理
interface OrgLegacyPlanning {
  trigger: 'acquisition' | 'shutdown' | 'restructuring';

  // 知识资产评估
  asset_categories: {
    ip_assets: string[];        // 专利、商标、专有技术
    process_knowledge: string[]; // 核心流程文档
    customer_knowledge: string[]; // 客户关系、案例
    cultural_knowledge: string[]; // 价值观、故事、经验
  };

  // 遗产分配
  distribution: {
    to_acquirer: string[];      // 移交给收购方
    to_employees: string[];      // 分发给员工
    to_industry_archive: string[];  // 存入行业档案馆
    to_public: string[];        // 公开分享
  };
}
```

**前置依赖**：#80（记忆时间胶囊）+ #96（生命周期适配）
**优先级**：🟢

---

### [ ] 99. 知识断舍离引擎（主动删除 vs 被动衰减） {#item-99}

**来源：autoself 100年计划 — 遗忘机制视角**

**背景**：#70（主动遗忘机制）只讲了"什么时候删"，没有讲"怎么判断该不该删"。知识断舍离是主动遗忘的高级形式——不是被动等待衰减，是主动决策。

**断舍离评估框架**：

```typescript
interface KnowledgeMinimalismAssessment {
  memory_id: string;

  // 保留价值
  retention_value: {
    recall_frequency: number;         // 历史召回频率
    recall_quality_score: number;     // 召回质量评分
    downstream_influence: number;     // 对其他记忆的影响度
    emotional_anchor: boolean;        // 是否有强烈情感连接
    uniqueness: number;               // 是否独一无二
  };

  // 保留成本
  retention_cost: {
    storage_bytes: number;
    maintenance_effort: number;       // 需要维护更新的程度
    staleness_risk: number;          // 过时风险
  };

  // 断舍离决策
  decision: {
    verdict: 'keep' | 'archive' | 'delete';
    confidence: number;
    reasoning: string;

    // 如果删除，影响有多大
    deletion_impact: {
      orphaned_descendants: number;   // 多少后代记忆会失去祖先
      knowledge_gap_risk: number;     // 会不会留下知识空白
    };
  };
}

// 断舍离策略（按阶段）
const minimalismStrategy = {
  youth: {
    // 年少时期：少删除，多积累
    auto_delete_threshold: 0.1,      // 只有极低价值才删除
    archive_threshold: 0.3;
  },
  midlife: {
    // 中年时期：开始断舍离
    auto_delete_threshold: 0.3;
    archive_threshold: 0.5;
  },
  late_life: {
    // 老年时期：激进精简，只留精华
    auto_delete_threshold: 0.5;
    archive_threshold: 0.8;
  },
};
```

**和#70主动遗忘的区别**：

| 维度 | #70 主动遗忘 | #99 断舍离 |
|------|-------------|-----------|
| 触发方式 | 规则引擎（基于频率/评分） | 用户主动决策（基于价值判断） |
| 粒度 | 系统自动批量处理 | 单条记忆的精细判断 |
| 用户参与 | 无 | 建议 + 用户确认 |
| 关注点 | 释放存储空间 | 知识资产优化 |

**前置依赖**：#70（主动遗忘机制）+ #96（生命周期适配）
**优先级**：🟢

---


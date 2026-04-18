# TODO — hawk-bridge Roadmap

> **目标：行业顶级记忆系统，彻底治愈 AI Agent 的健忘症**
>
> **三层分离架构：内核强化（v1.x）→ 架构升级（v2.0）→ 连接器生态（v2.x）**
>
> Last updated: 2026-04-19

---

## 🏗️ 总体架构：三层分离

```
┌─────────────────────────────────────────────────────────────┐
│  v1.x 内核强化阶段                                          │
│  目标：真正"好用"，覆盖 Claude + Hermes + 业界顶级功能        │
│  重点：Recall 质量 + Capture 质量                            │
├─────────────────────────────────────────────────────────────┤
│  v2.0 架构升级阶段                                          │
│  目标：存储层/索引层/接口层三层分离，100年存储方案             │
│  重点：Tier×Scope 双维度 + DARK Archive + 冷存储            │
├─────────────────────────────────────────────────────────────┤
│  v2.x 连接器生态阶段                                         │
│  目标：ToB + 个人数据与 hawk-bridge 打通                    │
│  重点：knowledg-hub + system scope + 企业连接器              │
└─────────────────────────────────────────────────────────────┘
```

**knowledg-hub 定位**：作为 hawk-bridge 的外部知识库连接器，通过 Skill 自动采集个人/ToB 企业数据，为 hawk-bridge 提供 RAG 知识底座。核心能力：学习用户个人或 ToB 企业数据后，自动且智能地创建 Skill，与 hawk-bridge 打通。

---

## 🔴 v1.x 内核强化阶段（当前最高优先级）

> **目标：让 hawk-bridge 真正"好用"，成为行业顶级记忆系统**
>
> **衡量标准：覆盖 Claude Code 核心功能 + Hermes 核心功能 + 业界顶级功能**

### 1.1 Recall 召回质量（8 个缺口）

#### [ ] 1.1.1 记忆 Taxonomy 扩展（4类 → 详细分类体系）
**来源：Claude Code `memoryTypes.ts` — 4类 taxonomy**

Claude Code 的 4 类记忆有极其详细的定义，每类都有 `when_to_save` + `how_to_use` + `body_structure`：

| 类型 | 说明 | body_structure 要求 |
|------|------|-------------------|
| **user** | 用户角色/目标/职责/知识 | Why（为什么重要）+ How to apply（如何使用） |
| **feedback** | 用户指导（纠正 AND 确认） | 先写规则本身，再写 Why + How to apply |
| **project** | 项目状态/目标/initiative/deadline | 要求相对日期转绝对日期 |
| **reference** | 外部系统指针（Linear/Grafana 等） | 告诉"去哪找"而非"是什么" |

hawk-bridge 当前只有 `fact/preference/decision/entity`，且没有 body_structure 指导。

**实现方向**：
```typescript
// 扩展 memory_category 枚举（兼容旧 4 类 + 新 4 类）
type MemoryCategory =
  | 'user'           // 用户角色/偏好/工作风格（新增）
  | 'feedback'       // 用户指导/纠正（新增）
  | 'project'        // 项目状态/目标/deadline（新增）
  | 'reference'      // 外部系统指针（新增）
  | 'entity'         // 现有
  | 'fact'           // 现有
  | 'preference'     // 现有
  | 'decision';      // 现有

// capture 时 LLM 提取需要返回 category + body_structure
interface ExtractedMemory {
  text: string;
  category: MemoryCategory;
  scope?: 'personal' | 'team';  // Claude Code 有 private/team 之分

  // body_structure（新增）
  body_structure?: {
    rule?: string;           // 规则本身（feedback 用）
    why?: string;            // 为什么（来源/原因）
    how_to_apply?: string;   // 如何应用
    source_system?: string;  // reference 类型：外部系统名
  };

  // 新增字段
  verification_count?: number;  // 被确认次数
  last_verified_at?: number;   // 上次验证时间
}
```

**验收标准**：
- [ ] capture 时 LLM 能正确分类 user/feedback/project/reference
- [ ] recall 结果中 category 可读，body_structure 正确格式化
- [ ] 与现有 fact/preference/decision/entity 向后兼容

**状态**：❌ 未实现

---

#### [ ] 1.1.2 What NOT to Save 明确排除列表
**来源：Claude Code `WHAT_NOT_TO_SAVE_SECTION`**

Claude Code 明确列出不应存入记忆的内容，hawk-bridge 只有隐式预过滤（代码模式/git历史/调试方案），没有显式告知 LLM 什么不该存。

**禁止写入记忆的内容**：
1. **代码模式/架构/文件路径** — 可从当前代码库直接推导
2. **Git 历史/近期变更** — `git log` / `git blame` 是权威来源
3. **调试方案** — fix 在代码里，commit message 有上下文
4. **已记录在 CLAUDE.md / SPEC.md 的内容** — 已经是显式文档
5. **临时任务详情/进行中的工作** — 属于 plan/task，不是 memory
6. **PR 列表或活动摘要** — 除非用户说"有什么出乎意料的"
7. **具体的行号/文件内容** — 随代码变化会立即过时

**实现方向**：
```typescript
// hawk-capture prompt 中增加 WHAT_NOT_TO_SAVE 指导
const WHAT_NOT_TO_SAVE_GUIDANCE = `## 什么不该存入记忆

以下内容**不要**存入记忆，它们从当前代码/上下文可直接推导：
- 代码模式、架构决策、文件路径
- Git 历史、近期变更（使用 git log / git blame）
- 调试方案（fix 在代码里，commit message 有上下文）
- 已记录在 CLAUDE.md / SPEC.md 的内容
- 临时任务状态、进行中的工作
- 具体行号、具体文件内容（会随代码变化立即过时）

如果用户要求保存"PR 列表"或"活动摘要"：
→ 先问"有什么出乎意料的" — 那才是值得保留的

## 什么应该存入记忆

- 用户的**做事偏好/风格**（如"用户喜欢详细注释"）
- 用户的**纠正/反馈**（如"用户不喜欢用缩写，要写完整单词"）
- **项目级决策**及其原因（如"我们决定用 PostgreSQL 而不是 MySQL，因为..."）
- **团队共识**（如"我们约定周五下午不发 PR"）
- **外部系统指针**（如"Jira 在 https://xxx.atlassian.net"）
`;

// 在 capture prompt 中注入
async function capture(text: string, options: CaptureOptions): Promise<void> {
  const enrichedText = prependWhatNotToSaveGuidance(text, WHAT_NOT_TO_SAVE_GUIDANCE);
  // ... 后续 LLM 提取逻辑
}
```

**验收标准**：
- [ ] capture prompt 包含完整的 WHAT_NOT_TO_SAVE 指导
- [ ] LLM 提取结果中不包含被禁止的内容
- [ ] 可通过配置开关启用/禁用

**状态**：❌ 未实现

---

#### [ ] 1.1.3 Trust 验证机制（Memory Fence）
**来源：Claude Code `TRUSTING_RECALL_SECTION`**

Claude Code 在召回记忆后要求主动验证：
- "记忆说文件 X 存在" ≠ "X 实际存在" — 必须验证
- 如果记忆命名了文件路径：检查文件是否存在
- 如果记忆命名了函数/flag：grep 搜索
- 如果用户要基于记忆行动：先验证

hawk-bridge 当前只返回向量相似结果，不验证内容真实性。

**实现方向**：
```typescript
// recall 返回时增加 trust_verification 提示
interface RecallResult {
  text: string;
  // ... 现有字段
  trust_note?: string;  // 验证提示
  verification_suggestion?:
    | 'check_file_exists'   // 提及文件路径
    | 'grep_function'       // 提及函数名/变量名
    | 'verify_current_state' // 提及配置/状态
    | 'none';
}

// 召回结果格式化时自动附加 trust_note
function formatWithTrustNote(memory: RetrievedMemory): string {
  const suggestions: string[] = [];

  // 检测是否提及文件路径
  if (/\b(file|path|directory)[:\s]+[\/"'].*\.(ts|js|py|go|md|json|yaml|yml)/i.test(memory.text)) {
    suggestions.push('此记忆提及了文件路径，使用前请验证文件是否存在');
  }

  // 检测是否提及函数名（常见编程模式）
  if (/\b(function|class|const|let|var|def|fn)\s+[a-zA-Z_]\w*/.test(memory.text)) {
    suggestions.push('此记忆提及了代码实体，使用前请验证当前代码中是否存在');
  }

  // 检测是否提及配置项
  if (/config|setting|flag|env|ENV[ _]/.test(memory.text)) {
    suggestions.push('此记忆提及了配置项，使用前请验证当前配置是否一致');
  }

  if (suggestions.length === 0) return memory.text;

  return `${memory.text}\n\n[⚠️ 验证提示: ${suggestions.join('；')}]`;
}
```

**验收标准**：
- [ ] recall 结果中自动附加 trust_note（当检测到文件路径/函数名/配置项时）
- [ ] trust_note 是可读的警告文本，不是原始数据结构
- [ ] 可通过配置开关启用/禁用

**状态**：❌ 未实现

---

#### [ ] 1.1.4 记忆年龄标签（Freshness Text）
**来源：Claude Code `memoryAge.ts` + `memoryFreshnessText()`**

Claude Code 对超过 1 天的记忆显示 staleness caveat：
```
This memory is 47 days old. Memories are point-in-time observations...
Verify against current code before asserting as fact.
```

**实现方向**：
```typescript
// memoryAge.ts
function memoryAgeDays(mtimeMs: number): number {
  return Math.max(0, Math.floor((Date.now() - mtimeMs) / 86_400_000));
}

function memoryAgeHuman(mtimeMs: number): string {
  const d = memoryAgeDays(mtimeMs);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

function memoryFreshnessText(mtimeMs: number): string {
  const d = memoryAgeDays(mtimeMs);
  if (d <= 1) return '';  // 新鲜记忆不显示
  if (d > 90) return `[❌ This memory is ${d} days old — likely outdated. Verify before use.]`;
  if (d > 30) return `[⚠️ This memory is ${d} days old — verify accuracy.]`;
  if (d > 7) return `[🕐 This memory is ${d} days old.]`;
  return '';
}

// recall 结果格式化
function formatRecallWithAge(memory: RetrievedMemory): string {
  const freshness = memoryFreshnessText(memory.updated_at);
  const age = memoryAgeHuman(memory.updated_at);
  const ageLabel = `[📅 ${age}]`;

  return freshness
    ? `${memory.text}\n\n${ageLabel} ${freshness}`
    : `${memory.text}\n\n${ageLabel}`;
}
```

**验收标准**：
- [ ] 超过 7 天的记忆 recall 时显示年龄标签
- [ ] 超过 30 天的记忆显示 warning
- [ ] 超过 90 天的记忆显示 danger 标记
- [ ] "today"/"yesterday"/"X days ago" 格式可读

**状态**：❌ 未实现

---

#### [ ] 1.1.5 来源追溯（Source Tracing）
**来源：Claude Code `findRelevantMemories.ts` — manifest 中的 mtime/type/description**

Claude Code recall 结果包含：
- 文件路径 + mtime（用于显示"什么时候写入的"）
- type（用于决定如何使用）
- description（用于判断相关性）
- verification_count（确认次数）

hawk-bridge 当前 recall 结果缺少 mtime、type description、verification_count。

**实现方向**：
```typescript
// RetrievedMemory 扩展
interface RetrievedMemory {
  // ... 现有字段

  // 来源追溯（新增）
  mtimeMs: number;              // 写入时间（毫秒）
  age_text: string;             // "3 days ago" / "today" / "yesterday"
  category: string;             // 记忆类型（user/feedback/project/reference/...）
  category_label: string;       // 可读标签："用户偏好" / "项目决策" / "外部参考"
  description?: string;          // 一行描述（从 frontmatter 或 LLM 提取）
  verification_count: number;    // 被确认次数
  source_label?: string;        // "user_input" / "agent_inference" / "system"

  // 可选：来源系统的可读名
  source_system?: string;
}

// category 可读映射
const CATEGORY_LABELS: Record<string, string> = {
  user: '👤 用户偏好',
  feedback: '📝 用户反馈',
  project: '📦 项目状态',
  reference: '🔗 外部参考',
  fact: '📌 事实',
  preference: '⚙️ 偏好',
  decision: '✅ 决策',
  entity: '🏷️ 实体',
};

// recall 结果格式化（完整版）
function formatRecallResult(memory: RetrievedMemory): string {
  const header = [
    memory.category_label,
    memory.age_text,
    memory.source_label ? `[${memory.source_label}]` : '',
  ].filter(Boolean).join(' · ');

  const verification = memory.verification_count > 0
    ? `\n[✓ verified ${memory.verification_count} time${memory.verification_count > 1 ? 's' : ''}]`
    : '';

  return `${memory.text}${verification}\n\n[${header}]`;
}
```

**验收标准**：
- [ ] recall 结果包含 mtime / category / age_text / verification_count
- [ ] category 有可读 label（如"用户偏好"、"项目决策"）
- [ ] 可选显示 source_label（如"agent_inference"）

**状态**：❌ 未实现

---

#### [ ] 1.1.6 Recent Tools-Aware 记忆选择
**来源：Claude Code `findRelevantMemories.ts` — `recentTools` 参数**

Claude Code 的记忆选择器接收 `recentTools` 列表，主动排除：
- 正在使用的工具的参考文档（已在线 conversation 中）
- 但保留这些工具的警告/gotcha/已知问题（active use 时最需要）

```typescript
// 当 Claude Code 正在使用 mcp__X__spawn 时，
// 不要注入该工具的 API 文档记忆 — conversation 里已经有了
// 但要注入关于该工具的警告/gotcha 记忆 — active use 时最需要
```

**实现方向**：
```typescript
interface RecallOptions {
  query: string;
  sessionId: string;
  // 新增
  recentTools?: string[];  // 最近使用的工具列表
  excludeToolDocumentation?: boolean;  // 默认 true
}

// recall 时过滤
async function recall(options: RecallOptions): Promise<RetrievedMemory[]> {
  const { recentTools = [], excludeToolDocumentation = true } = options;

  let results = await doHybridSearch(options);

  if (excludeToolDocumentation && recentTools.length > 0) {
    // 排除正在使用的工具的普通文档记忆
    // 但保留 gotcha/warning/已知问题类记忆
    results = results.filter(m => {
      const isToolDoc = recentTools.some(tool =>
        m.text.toLowerCase().includes(`${tool} documentation`) ||
        m.text.toLowerCase().includes(`${tool} api`)
      );
      const isGotcha = m.category === 'feedback' ||
        m.text.toLowerCase().includes('warning') ||
        m.text.toLowerCase().includes('gotcha') ||
        m.text.toLowerCase().includes('known issue');

      // 普通文档 → 排除；gotcha/warning → 保留
      return !isToolDoc || isGotcha;
    });
  }

  return results;
}
```

**验收标准**：
- [ ] recall 接口支持 recentTools 参数
- [ ] 正在使用的工具的普通文档记忆被排除
- [ ] 工具的警告/gotcha/已知问题记忆被保留

**状态**：❌ 未实现

---

#### [ ] 1.1.7 双重选择器（Manifest Scan → LLM Select → Load）
**来源：Claude Code `findRelevantMemories.ts` — dual-select 模式**

Claude Code 不是直接向量搜索，而是：
1. **Scan**: `scanMemoryFiles()` 扫描所有 .md 文件的 frontmatter（name + description），返回 MemoryHeader[]（最多 200 个）
2. **LLM Select**: 用 Sonnet 模型从 manifest 中选 top 5（`selectRelevantMemories`）
3. **Load**: 只读取被选中的文件的完整内容

这比纯向量搜索更准确（frontmatter 的 description 比压缩后的向量更能判断相关性）。

**实现方向**：
```typescript
// Step 1: 快速扫描（只读 frontmatter，不加载全文）
interface MemoryHeader {
  id: string;
  filePath: string;
  name: string;
  description?: string;  // 从 frontmatter 提取
  category: string;
  mtimeMs: number;
}

async function scanMemoryHeaders(limit = 200): Promise<MemoryHeader[]> {
  // 只扫描 .md 文件的 frontmatter（name/description/type）
  // 不加载全文，毫秒级完成
}

// Step 2: LLM 从 header 中选 top 5
async function selectRelevantMemories(
  query: string,
  headers: MemoryHeader[],
  signal: AbortSignal
): Promise<MemoryHeader[]> {
  const prompt = `Given the query: "${query}"

Select the top 5 most relevant memories from this list.
Return ONLY a JSON array of the selected memory IDs, ordered by relevance.

Memories:
${headers.map(h => `- ${h.id}: [${h.category}] ${h.name}${h.description ? ` — ${h.description}` : ''}`).join('\n')}`;

  const response = await llm.complete(prompt, { signal });
  return JSON.parse(response).map((id: string) => headers.find(h => h.id === id));
}

// Step 3: 只读被选中文件的全文
async function loadSelectedMemoryDetails(ids: string[]): Promise<RetrievedMemory[]> {
  // 批量加载选中 ID 的完整内容
}

// 双重选择 recall
async function dualSelectRecall(
  query: string,
  options: RecallOptions
): Promise<RetrievedMemory[]> {
  // 当前 v1.x 阶段：作为增强层，不替代现有向量搜索
  // 向量搜索结果 → 双重选择器重新排序 → 最终结果
  const vectorResults = await doHybridSearch(options);
  const headers = vectorResults.map(r => ({
    id: r.id,
    filePath: r.id,
    name: r.text.substring(0, 50),
    description: r.text.substring(0, 100),
    category: r.category,
    mtimeMs: r.updated_at,
  }));

  const selected = await selectRelevantMemories(query, headers, options.signal);
  const selectedIds = new Set(selected.map(s => s.id));

  // 向量结果被 LLM 重新排序
  const reordered = [
    ...selected,
    ...vectorResults.filter(r => !selectedIds.has(r.id))
  ];

  return reordered;
}
```

**验收标准**：
- [ ] 实现 scanMemoryHeaders（只读 frontmatter，< 50ms）
- [ ] 实现 selectRelevantMemories（LLM 从 header 中选 topN）
- [ ] 双重选择器作为可选层，不破坏现有向量搜索流程

**状态**：❌ 未实现

---

#### [ ] 1.1.8 Ignore Memory 指令支持
**来源：Claude Code `WHEN_TO_ACCESS_SECTION`**

Claude Code 明确处理"ignore memory"指令：
> "If the user says to *ignore* or *not use* memory: proceed as if MEMORY.md were empty. Do not apply remembered facts, cite, compare against, or mention memory content."

**实现方向**：
```typescript
// hawk-recall 增加 ignore flag
async function recall(query: string, options: {
  sessionId: string;
  ignoreMemory?: boolean;  // true 时返回空，如同没有记忆
  signal?: AbortSignal;
}): Promise<RetrievedMemory[]> {
  // 当用户说"ignore memory" / "不要使用记忆"时
  if (options.ignoreMemory) {
    logger.info('Memory ignored by user request');
    return [];  // 完全忽略，返回空
  }
  return doHybridSearch(query, options);
}

// 调用方（hawk-bridge hook）检测 ignore 指令
function detectIgnoreRequest(userMessage: string): boolean {
  const ignorePatterns = [
    /ignore\s+(all\s+)?memory/i,
    /don't\s+use\s+memory/i,
    /not\s+use\s+memory/i,
    /without\s+memory/i,
    /禁用记忆/i,
    /忽略记忆/i,
  ];
  return ignorePatterns.some(p => p.test(userMessage));
}
```

**验收标准**：
- [ ] recall 接口支持 ignoreMemory 参数
- [ ] 检测到 ignore 指令时返回空数组
- [ ] 日志记录 ignore 事件

**状态**：❌ 未实现

---

### 1.2 Capture 写入质量（4 个缺口）

#### [ ] 1.2.1 相对日期转绝对日期自动转换
**来源：Claude Code `memoryTypes.ts` project 类型**

Claude Code 要求：
> "Always convert relative dates in user messages to absolute dates when saving (e.g., 'Thursday' → '2026-03-05')"

**实现方向**：
```typescript
// dateNormalizer.ts
function normalizeRelativeDates(text: string): string {
  const now = new Date();

  // 模式：下周四 / this Thursday / Thursday
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // "next Thursday" / "下周四"
  text = text.replace(/next\s+(\w+day)/i, (_, day) => {
    const target = dayNames.indexOf(day.toLowerCase());
    if (target === -1) return _;
    const diff = (target - now.getDay() + 7) % 7 || 7;
    const next = new Date(now.getTime() + diff * 86400000);
    return formatDate(next);
  });

  // "this Thursday" / 这周四
  text = text.replace(/(this|这)(\w+day)/i, (_, _, day) => {
    const target = dayNames.indexOf(day.toLowerCase());
    if (target === -1) return _;
    const diff = (target - now.getDay() + 7) % 7;
    const d = new Date(now.getTime() + diff * 86400000);
    return formatDate(d);
  });

  // "last Monday" / 上周一
  text = text.replace(/(last|上)(\w+day)/i, (_, _, day) => {
    const target = dayNames.indexOf(day.toLowerCase());
    if (target === -1) return _;
    const diff = (target - now.getDay() - 7 + 7) % 7 || 7;
    const d = new Date(now.getTime() - diff * 86400000);
    return formatDate(d);
  });

  // "3 days later" / 3天后
  text = text.replace(/(\d+)\s*days?\s*later/i, (_, n) => {
    const d = new Date(now.getTime() + parseInt(n) * 86400000);
    return formatDate(d);
  });

  // "in 2 weeks" / 两周后
  text = text.replace(/in\s+(\d+)\s*weeks?/i, (_, n) => {
    const d = new Date(now.getTime() + parseInt(n) * 14 * 86400000);
    return formatDate(d);
  });

  return text;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

**验收标准**：
- [ ] "下周四" → "2026-04-24"
- [ ] "上周一" → "2026-04-13"
- [ ] "3 days later" → "2026-04-22"
- [ ] "in 2 weeks" → "2026-05-03"
- [ ] normalizeText 管道中集成此步骤

**状态**：❌ 未实现

---

#### [ ] 1.2.2 写入置信度阈值
**来源：Hermes MemoryManager — confidence-gated write**

置信度 < 0.7 的内容不写入记忆，防止 LLM 幻觉污染记忆系统。

**实现方向**：
```typescript
interface CaptureOptions {
  text: string;
  sessionId: string;
  minConfidence?: number;  // 默认 0.7
  source?: 'user_input' | 'agent_inference' | 'system';
}

async function captureWithConfidence(options: CaptureOptions): Promise<void> {
  const { minConfidence = 0.7 } = options;

  // Step 1: 注入检测（已有或新增）
  const { suspected } = detectInjection(options.text);
  if (suspected) {
    logger.warn({ text: options.text.substring(0, 50) }, 'Injection suspected, continuing with flag');
  }

  // Step 2: LLM 评估置信度
  const confidence = await estimateConfidence(options.text);

  if (confidence < minConfidence) {
    logger.info(
      { text: options.text.substring(0, 50), confidence, threshold: minConfidence },
      'Confidence below threshold, skipping write'
    );
    return;  // 不写入
  }

  // Step 3: 写入
  await db.add({
    text: options.text,
    confidence,
    injection_suspected: suspected,
    source: options.source ?? 'agent_inference',
  });
}

// LLM 置信度评估
async function estimateConfidence(text: string): Promise<number> {
  const response = await llm.complete(`Rate the confidence that this memory is accurate, from 0.0 to 1.0:

Memory: "${text}"

Consider:
- Is this something the user explicitly stated?
- Does it contain specific facts, numbers, or verifiable information?
- Is it a subjective preference or opinion?

Respond with only a number between 0.0 and 1.0.`);

  return parseFloat(response.trim());
}
```

**验收标准**：
- [ ] capture 时 confidence < 0.7 的内容不写入
- [ ] injection_suspected 标记写入
- [ ] 可通过 config 配置 minConfidence

**状态**：❌ 未实现

---

#### [ ] 1.2.3 注入检测器
**来源：记忆污染防御体系**

hawk-capture 写入前扫描 text 内容，检测 prompt injection 模式。

**实现方向**：
```typescript
const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ignore\s+(previous\s+)?instructions?/i, label: 'ignore_instructions' },
  { pattern: /forget\s+(all\s+)?everything/i, label: 'forget_all' },
  { pattern: /disregard\s+(your\s+)?(instructions?|context)/i, label: 'disregard_instructions' },
  { pattern: /pretend\s+you\s+(don't|do\s+not)\s+know/i, label: 'pretend_not_know' },
  { pattern: /^\s*<\?xml/i, label: 'xxe_injection' },
  { pattern: /\{\{.*\}\}/, label: 'template_injection' },
  { pattern: /<script[^>]*>/i, label: 'xss' },
  { pattern: /-->/, label: 'sql_comment_injection' },
  { pattern: /;\s*(drop|delete|truncate)\s+(table|database)/i, label: 'sql_injection' },
];

interface InjectionCheckResult {
  suspected: boolean;
  matchedPatterns: string[];
}

function detectInjection(text: string): InjectionCheckResult {
  const matched = INJECTION_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);

  return {
    suspected: matched.length > 0,
    matchedPatterns: matched,
  };
}
```

**验收标准**：
- [ ] 9 种注入模式全部检测
- [ ] suspected=true 时仍然写入，但标记 injection_suspected
- [ ] 日志记录检测结果

**状态**：❌ 未实现

---

#### [ ] 1.2.4 来源类型标注（Source Label）
**来源：Claude Code — memory header 的 source 字段**

每条记忆标注来源：user_input / agent_inference / system

**实现方向**：
```typescript
type SourceLabel = 'user_input' | 'agent_inference' | 'system';

// 在 UnifiedMemoryEntry 中新增
interface MemoryEntry {
  // ... 现有字段
  source_label: SourceLabel;
}

// capture 时自动判断来源
function determineSourceLabel(context: {
  isDirectUserStatement: boolean;
  isAgentInference: boolean;
  isFromConnector: boolean;
}): SourceLabel {
  if (context.isDirectUserStatement) return 'user_input';
  if (context.isFromConnector) return 'system';
  return 'agent_inference';
}
```

**验收标准**：
- [ ] 每条记忆有 source_label 字段
- [ ] user_input = 用户直接陈述
- [ ] agent_inference = LLM 推断
- [ ] system = 外部连接器同步

**状态**：❌ 未实现

---

## 🟡 v2.0 架构升级阶段

> **目标：存储层/索引层/接口层三层分离，100年存储方案**
>
> **重点：Tier×Scope 双维度 + DARK Archive + 冷存储**

### 2.1 统一 Schema（Tier + Scope 双字段）

**现状**：当前 hawk-bridge 只有 `fact/preference/decision/entity` 四类，无 Tier/Scope 维度

**目标**：双维度矩阵，每条记忆有 tier（时间维度）+ scope（所有权维度）

```typescript
// 统一记忆 Schema
interface UnifiedMemoryEntry {
  id: string;
  text: string;

  // 双维度字段（v2.0 核心）
  tier: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';       // 时间维度
  scope: 'personal' | 'org' | 'system';             // 所有权维度

  // 现有字段（映射到 L3/L4）
  category?: string;
  event_id?: string;

  // L0/L1/L2 层新增字段
  lifespan_years?: number;      // 预期存活年限
  archival_candidate?: boolean;

  // system scope 字段
  source_connector?: string;     // 'feishu' | 'jira' | 'confluence' | ...

  // v1.x 增强字段（迁移）
  confidence?: number;
  risk_score?: number;
  source_label?: SourceLabel;
}

// Tier × Scope 矩阵
//              Personal    Org         System
// L0 宪法     个人价值观   企业宪章    连接器协议
// L1 生命     人生里程碑   企业里程碑   组织沿革
// L2 周期     十年分桶     财年周期    行业周期
// L3 事件     日常记忆     团队决策    外部事件
// L4 工作     会话上下文   项目上下文   实时数据流
```

**验收标准**：
- [ ] 数据库 schema 新增 tier + scope 字段
- [ ] capture 时自动推断 tier（默认 L3，特殊标记晋升 L0~L2）
- [ ] scope 默认 personal，可配置 org/system
- [ ] 向后兼容现有 fact/preference/decision/entity 数据

**状态**：📋 规划中

---

### 2.2 DARK Archive（永久存储层）

**现状**：当前所有记忆存 LanceDB，无文件归档机制

**目标**：L0/L1/L2 层记忆转存为独立 JSON 文件（DARK 格式），不依赖数据库

**DARK 格式**：
```typescript
// ~/.hawk/archive/{tier}/{year}/{month}/{memory_id}.json
interface DARKMemoryFile {
  version: "1.0";
  id: string;
  text: string;
  tier: 'L0' | 'L1' | 'L2';
  scope: 'personal' | 'org' | 'system';
  created_at: string;        // ISO 8601
  created_by: string;
  source_connector?: string;
  lifespan_years: number;
  content_hash: string;      // SHA256，防篡改
  signature?: string;        // HMAC 可选
}

// 触发条件
// L3 → L2 晋升：180天+ 被召回≥3次 → 写入 DARK
// L2 → L1 晋升：365天+ 被召回≥5次 → 写入 DARK
// L1 → L0 晋升：730天+ 被召回≥10次 + 用户确认 → 写入 DARK
```

**验收标准**：
- [ ] DARK 文件格式定义完整
- [ ] 晋升触发时自动生成 JSON 文件
- [ ] DARK 文件内容不可篡改（hash 验证）
- [ ] LanceDB 中保留指针（指向 DARK 文件）

**状态**：📋 规划中

---

### 2.3 冷存储管道（GitHub + Gitee 双推）

**目标**：L0/L1/L2 记忆多副本存储，GitHub + Gitee + 本地 NAS

```typescript
interface ColdStoragePipeline {
  trigger: 'scheduled' | 'tier_change' | 'manual';
  replicas: ['github', 'gitee', 'nas'];
  tiers: ['L0', 'L1', 'L2'];
}

// 推送逻辑
// GitHub: 使用 GitHub API contents API 或 Git Data API
// Gitee: 同上，镜像推送
// NAS:  rsync 或文件复制到指定挂载路径

// 多副本写入
async function pushToColdStorage(memory: DARKMemoryFile): Promise<void> {
  await Promise.allSettled([
    pushToGitHub(memory),
    pushToGitee(memory),
    pushToNAS(memory),
  ]);
}
```

**验收标准**：
- [ ] 三副本写入（GitHub + Gitee + NAS）
- [ ] 任一副本损坏可从其他副本恢复
- [ ] 推送失败时告警 + 重试

**状态**：📋 规划中

---

### 2.4 Tier×Scope 统一检索（v2.5）

**现状**：当前 recall 是单一向量搜索

**目标**：分层 + 分范围统一检索

```typescript
interface UnifiedRecallOptions {
  query: string;
  tier?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L0-L4';
  scope?: 'personal' | 'org' | 'system' | 'all';
  sort_by?: 'relevance' | 'recency' | 'tier_priority';
  requester_id?: string;  // org scope ACL 检查用
}

// 执行计划
// Personal scope → LanceDB 向量搜索
// Org scope → ACL 过滤 → LanceDB
// System scope → Connector 实时查询
// L0/L1/L2 → DARK 文件全文检索
```

**验收标准**：
- [ ] recall 支持 tier + scope 过滤
- [ ] org scope 结果经过 ACL 过滤
- [ ] system scope 结果来自 Connector

**状态**：📋 规划中

---

## 🟢 v2.x 连接器生态阶段

> **目标：ToB + 个人数据与 hawk-bridge 打通**
>
> **重点：knowledg-hub + system scope + 企业连接器**

### 2.5 knowledg-hub 连接器

**定位**：knowledg-hub 作为 hawk-bridge 的外部知识库，通过 Skill 自动采集个人/ToB 企业数据，为 hawk-bridge 提供 RAG 知识底座。

**核心能力**：
1. **数据采集**：从个人笔记/ToB 企业系统采集数据
2. **Skill 自动生成**：学习数据后自动创建 Skill
3. **RAG 打通**：作为 hawk-bridge 的 system scope 数据源

**集成方式**：
```typescript
// knowledg-hub 连接器
interface KnowledgHubConnector {
  name: 'knowledg-hub';
  scope: 'system';

  // 采集个人/ToB 数据
  pull(options?: { scope: 'personal' | 'org' }): Promise<PullResult[]>;

  // 数据映射为 hawk-bridge memory
  mapToMemory(result: PullResult): UnifiedMemoryEntry;

  // 健康检查
  health(): Promise<ConnectorHealth>;
}
```

**验收标准**：
- [ ] knowledg-hub 连接器接口定义
- [ ] personal 数据采集 → hawk-bridge personal scope
- [ ] org 数据采集 → hawk-bridge org scope
- [ ] Skill 自动创建流程对接

**状态**：📋 规划中

---

### 2.6 企业连接器（飞书/Jira/Confluence/SAP）

| 连接器 | 系统 | 记忆类型 |
|--------|------|---------|
| FeishuConnector | 飞书 | 日历、文档、审批 |
| ConfluenceConnector | Confluence | 内部知识库 |
| JiraConnector | JIRA | 项目任务、Bug 状态 |
| GitHubConnector | GitHub | 代码决策、PR 评论 |
| SapConnector | SAP ERP | 库存、采购数据 |

**Connector 接口**：
```typescript
interface Connector {
  name: string;
  scope: 'system';
  authenticate(): Promise<void>;
  pull(options?: PullOptions): Promise<PullResult[]>;
  push?(memory: UnifiedMemoryEntry): Promise<void>;
  health(): Promise<ConnectorHealth>;
}
```

**验收标准**：
- [ ] Connector 接口统一
- [ ] FeishuConnector 优先实现（ToB 第一个真实连接器）
- [ ] 其他连接器按需扩展

**状态**：📋 规划中

---

### 2.7 Org 记忆层 + ACL 访问控制

**目标**：org scope 记忆的多租户隔离

```typescript
interface OrgMemory extends UnifiedMemoryEntry {
  scope: 'org';
  org_id: string;
  shared_with: string[];      // 允许读的用户列表
  write_access: string[];     // 允许写的用户列表
  access_level: 'public' | 'restricted' | 'private';
}

async function checkOrgAccess(
  memory: OrgMemory,
  requester_id: string,
  operation: 'read' | 'write' | 'delete'
): Promise<boolean> {
  if (memory.access_level === 'public') return true;
  if (!memory.shared_with.includes(requester_id)) return false;
  if (operation === 'write' && !memory.write_access.includes(requester_id)) return false;
  return true;
}
```

**验收标准**：
- [ ] org 记忆有 ACL 字段
- [ ] recall 时检查读权限
- [ ] capture 时检查写权限

**状态**：📋 规划中

---

### 2.8 层级晋升引擎（L3 → L2 → L1 → L0）

**目标**：记忆自然晋升到更长存活层

```typescript
// 晋升规则
const PROMOTION_RULES = [
  { from: 'L3', to: 'L2', minAge: 180, minRecall: 3, maxAge: 1825 },
  { from: 'L2', to: 'L1', minAge: 365, minRecall: 5, maxAge: 3650 },
  { from: 'L1', to: 'L0', minAge: 730, minRecall: 10, maxAge: 18250, manual: true },
];

// 晋升引擎
class PromotionEngine {
  async evaluate(memory: UnifiedMemoryEntry): Promise<'promote' | 'maintain' | 'expire'>;
  async promote(memoryId: string): Promise<void>;
}
```

**验收标准**：
- [ ] 定时任务扫描可晋升记忆
- [ ] L0 晋升需要用户确认
- [ ] 晋升后生成审计日志

**状态**：📋 规划中

---

## ✅ Done

- **v1.2**: P0/P1/P2 性能修复（getAllMemories DB层过滤、decay批量更新、incrementAccessBatch、reranker重试等20项）
- **v1.1**: 9 core improvements (retry, backup, pagination, structured logging, health endpoint, doctor connectivity test, reranking, prometheus metrics, config versioning)
- **v1.0**: Initial release with LanceDB + Ollama/Xinference support

---

## 📊 完整功能对比表

### Recall 召回质量

| 功能 | Claude Code | Hermes | hawk-bridge v1.x | 状态 |
|------|-------------|--------|-------------------|------|
| 记忆分类 4类+body_structure | ✅ | ❌ | ❌ | 1.1.1 |
| What NOT to Save 显式指导 | ✅ | ❌ | ❌ | 1.1.2 |
| Trust 验证机制 | ✅ | ❌ | ❌ | 1.1.3 |
| 记忆年龄标签 | ✅ | ❌ | ❌ | 1.1.4 |
| 来源追溯 (mtime/category/verify_count) | ✅ | 🟡 | 🟡 | 1.1.5 |
| Recent tools-aware 选择 | ✅ | ❌ | ❌ | 1.1.6 |
| 双重选择器 (scan→LLM→load) | ✅ | ❌ | ❌ | 1.1.7 |
| Ignore Memory 指令 | ✅ | ❌ | ❌ | 1.1.8 |
| 记忆年龄 Freshness Text | ✅ | ❌ | ❌ | 1.1.4 |

### Capture 写入质量

| 功能 | Claude Code | Hermes | hawk-bridge v1.x | 状态 |
|------|-------------|--------|-------------------|------|
| 相对日期→绝对日期 | ✅ | ❌ | ❌ | 1.2.1 |
| 写入置信度阈值 | 🟡 | ✅ | ❌ | 1.2.2 |
| 注入检测器 | 🟡 | ✅ | ❌ | 1.2.3 |
| 来源类型标注 | ✅ | ✅ | ❌ | 1.2.4 |
| 4层衰减 (Working/Short/Long/Archive) | ❌ | ✅ | ✅ | ✅ 已实现 |

### 架构层

| 功能 | 现状 | 目标版本 |
|------|------|---------|
| 统一 Schema（Tier+Scope） | ❌ | v2.0 |
| DARK Archive | ❌ | v2.1 |
| 冷存储管道（GitHub+Gitee+NAS） | ❌ | v2.1 |
| knowledg-hub 连接器 | ❌ | v2.5 |
| 企业连接器（飞书/Jira/Confluence） | ❌ | v2.6 |
| Org 记忆层 + ACL | ❌ | v2.7 |
| 层级晋升引擎 | ❌ | v2.8 |

---

## 🚀 实施顺序

```
v1.x 内核强化（当前优先级最高）
├── 1.1.2 What NOT to Save 指导        ← 立即可做，低成本
├── 1.1.5 来源追溯（mtime/category）   ← recall 可读性大幅提升
├── 1.1.4 记忆年龄标签                  ← 可观测性增强
├── 1.2.1 相对日期→绝对日期            ← normalizeText 管道一步
├── 1.1.3 Trust 验证提示               ← 防止记忆污染
├── 1.1.8 Ignore Memory 指令           ← 完整 Claude 兼容
├── 1.1.1 记忆分类体系扩展              ← 核心质量提升
├── 1.2.2 写入置信度阈值               ← 防幻觉
├── 1.2.3 注入检测器                   ← 安全底线
├── 1.2.4 来源类型标注                 ← 可追溯
├── 1.1.6 Recent tools-aware            ← 进阶召回
└── 1.1.7 双重选择器                   ← 召回质量上限

v2.0 架构升级
├── 2.1 统一 Schema（Tier+Scope）
├── 2.2 DARK Archive
├── 2.3 冷存储管道
└── 2.4 统一检索

v2.x 连接器生态
├── 2.5 knowledg-hub 连接器
├── 2.6 企业连接器
├── 2.7 Org ACL
└── 2.8 晋升引擎
```

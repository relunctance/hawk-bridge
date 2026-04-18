# TODO — hawk-bridge v1.2+ Backlog

> Priority: **🔴阻断 / 🟡重要 / 🟢增强**
> Last updated: 2026-04-19（参考 Claude Code 源码 + Hermes Agent 对比）

---

## 🔴 高优先级 — Claude Code 源码对比发现的新差距

### [ ] 1. 记忆 Taxonomy 扩展（4类 → 详细分类体系）
**来源：Claude Code `memoryTypes.ts` — 4类 taxonomy**

Claude Code 的 4 类记忆有极其详细的定义：
- **user**: 用户角色/目标/职责/知识，`when_to_save` + `how_to_use` + `body_structure`（**Why:** + **How to apply:**）
- **feedback**: 用户指导（纠正 AND 确认），body_structure 要求先写规则本身，再写 **Why:** 和 **How to apply:**
- **project**: 项目状态/目标/initiative/deadline，要求相对日期转绝对日期
- **reference**: 外部系统指针（Linear/Grafana 等），告诉"去哪找"而非"是什么"

hawk-bridge 当前只有 `fact/preference/decision/entity`，且没有 body_structure 指导。

**实现方向**：
```typescript
// 扩展 memory_category 枚举
type MemoryCategory = 'user' | 'feedback' | 'project' | 'reference' | 'entity' | 'fact' | 'preference' | 'decision';

// capture 时 LLM 提取需要返回 category + body_structure
interface ExtractedMemory {
  text: string;
  category: MemoryCategory;
  scope?: 'private' | 'team';  // Claude Code 有 private/team 之分
  body_structure?: {
    rule?: string;       // 规则本身（feedback 用）
    why?: string;         // 为什么（来源/原因）
    how_to_apply?: string; // 如何应用
  };
}
```
**状态**：❌ 未实现

---

### [ ] 2. What NOT to Save 明确排除列表
**来源：Claude Code `WHAT_NOT_TO_SAVE_SECTION`**

Claude Code 明确列出不应存入记忆的内容：
- 代码模式/架构/文件路径（可从当前代码库推导）
- Git 历史（`git log` / `git blame` 是权威来源）
- 调试方案（fix 在代码里，commit message 有上下文）
- 已记录在 CLAUDE.md 的内容
- 临时任务详情

hawk-bridge 当前只有预过滤（代码模式/git历史/调试方案），但没有显式的"显式告知 LLM 什么不该存"机制。

**实现方向**：
```typescript
// hawk-capture prompt 中增加 WHAT_NOT_TO_SAVE 指导
const WHAT_NOT_TO_SAVE = [
  '代码模式、架构、文件路径 — 可从当前代码库直接推导',
  'Git 历史、近期变更 — 使用 git log / git blame',
  '调试方案 — fix 在代码里，commit message 有上下文',
  '已记录在 CLAUDE.md / SPEC.md 的内容',
  '临时任务状态、进行中的工作',
  '如果用户要求保存 PR 列表或活动摘要 → 问"有什么出乎意料的" — 那才是值得保留的',
];
```
**状态**：❌ 未实现（只有隐式预过滤，没有显式 LLM 指导）

---

### [ ] 3. Memory Fence 标签机制（Trust 验证）
**来源：Claude Code `TRUSTING_RECALL_SECTION`**

Claude Code 在召回记忆后要求主动验证：
- "记忆说文件 X 存在" ≠ "X 实际存在" — 必须验证
- 如果记忆命名了文件路径：检查文件是否存在
- 如果记忆命名了函数/flag：grep 搜索
- 如果用户要基于记忆行动：先验证

这和 hawk-bridge 当前只返回向量相似结果、不验证内容真实性的做法完全不同。

**实现方向**：
```typescript
// hawk-recall 返回时增加 trust_verification 提示
interface RecallResult {
  text: string;
  // ... 现有字段
  trust_note?: string;  // 如"此记忆提及了文件路径，使用前请验证"
  verification_suggestion?: 'check_file_exists' | 'grep_function' | 'verify_current_state';
}

// 召回时自动附加 trust_note
function formatWithTrustNote(memory: RetrievedMemory): string {
  let trustNote = '';
  if (memory.content.includes('file:') || memory.content.includes('path:')) {
    trustNote = '\n\n[⚠️ 此记忆提及了文件路径，使用前请验证文件是否存在]';
  }
  if (memory.updated_at < Date.now() - 30 * 24 * 60 * 60 * 1000) {
    trustNote += '\n[⚠️ 此记忆超过 30 天，可能已过时]';
  }
  return memory.text + trustNote;
}
```
**状态**：❌ 未实现

---

### [ ] 4. 记忆年龄标签（Freshness Text）
**来源：Claude Code `memoryAge.ts` + `memoryFreshnessText()`**

Claude Code 对超过 1 天的记忆显示 staleness caveat：
```
This memory is 47 days old. Memories are point-in-time observations...
Verify against current code before asserting as fact.
```

hawk-bridge 当前没有记忆年龄标签机制。

**实现方向**：
```typescript
// memoryAge.ts 等效实现
function memoryAgeDays(mtimeMs: number): number {
  return Math.max(0, Math.floor((Date.now() - mtimeMs) / 86_400_000));
}

function memoryFreshnessText(mtimeMs: number): string {
  const d = memoryAgeDays(mtimeMs);
  if (d <= 1) return '';
  return `此记忆是 ${d} 天前写入的。记忆是时间点观察，不是实时状态——` +
    `关于代码行为的断言或文件:行号引用可能已过时。使用前请验证。`;
}

// 召回结果中附加
function formatRecallWithAge(memory: RetrievedMemory): string {
  const freshness = memoryFreshnessText(memory.updated_at);
  return freshness ? `${memory.text}\n\n[${freshness}]` : memory.text;
}
```
**状态**：❌ 未实现

---

### [ ] 5. Source Tracing（来源 + 验证计数）
**来源：Claude Code `findRelevantMemories.ts` — manifest 中的 mtime/type/description**

Claude Code recall 结果包含：
- 文件路径 + mtime（用于显示"什么时候写入的"）
- type（用于决定如何使用）
- description（用于判断相关性）
- verification_count（确认次数）
- 最近使用工具列表（避免重复注入正在使用的工具文档）

hawk-bridge 当前 recall 结果缺少 mtime、type description、verification_count。

**实现方向**：
```typescript
// RetrievedMemory 扩展
interface RetrievedMemory {
  // ... 现有字段
  mtimeMs: number;           // 写入时间（毫秒）
  category: string;          // 记忆类型
  description?: string;      // 一行描述（用于相关性判断）
  verification_count: number; // 被确认次数
  age_text?: string;         // "3 天前" / "today" / "yesterday"
  trust_note?: string;       // 验证提示
}

// manifest 扫描（替代纯向量搜索的 header-only 预选）
async function scanMemoryManifest(): Promise<MemoryHeader[]> {
  // 扫描所有记忆文件的 frontmatter（name/description/type）
  // 用于 recall 前的 relevance 预选
}
```
**状态**：❌ 未实现

---

### [ ] 6. Team Memory + Symlink 安全
**来源：Claude Code `teamMemPaths.ts` — PathTraversalError + realpathDeepestExisting**

Claude Code 有完整的 team memory 架构：
- `team/` 子目录存放团队共享记忆
- symlink escape 防护（`realpathDeepestExisting` 检测符号链接穿透）
- 路径验证（`validateTeamMemWritePath` / `validateTeamMemKey`）
- 路径规范化和 Unicode 规范化攻击防护

hawk-bridge 当前没有 team memory 概念和路径安全验证。

**实现方向**：
```typescript
// 新增 team memory 存储区域
interface TeamMemoryConfig {
  enabled: boolean;
  path: string;  // ~/.hawk/team/<project>/
}

// 路径验证
class PathTraversalError extends Error {}

function validateWritePath(filePath: string): string {
  // 1. 字符串级包含检查
  // 2. resolve() 消除 .. 段
  // 3. realpath() 解析 symlink，验证真实路径仍在 team memory 内
  // 4. 检测 null byte、URL 编码遍历、Unicode 规范化攻击
}
```
**状态**：❌ 未实现

---

### [ ] 7. Recent Tools-Aware 记忆选择
**来源：Claude Code `findRelevantMemories.ts` — `recentTools` 参数**

Claude Code 的记忆选择器接收 `recentTools` 列表，主动排除：
- 正在使用的工具的参考文档（已在线conversation 中）
- 但保留这些工具的警告/gotcha/已知问题（主动使用才重要）

```typescript
// 当 Claude Code 正在使用 mcp__X__spawn 时，
// 不要注入该工具的 API 文档记忆 — conversation 里已经有了
// 但要注入关于该工具的警告/gotcha 记忆 — active use 时最需要
```
**状态**：❌ 未实现（hawk-bridge 不知道调用方正在用什么工具）

---

### [ ] 8. 双重选择器（Manifest 扫描 → LLM 选 topN）
**来源：Claude Code `findRelevantMemories.ts` — dual-select 模式**

Claude Code 不是直接向量搜索，而是：
1. **Scan**: `scanMemoryFiles()` 扫描所有 .md 文件的 frontmatter（name + description），返回 MemoryHeader[]（最多 200 个）
2. **LLM Select**: 用 Sonnet 模型从 manifest 中选 top 5（`selectRelevantMemories`）
3. **Load**: 只读取被选中的文件的完整内容

这比纯向量搜索更准确（frontmatter 的 description 比压缩后的向量更能判断相关性）。

**实现方向**：
```typescript
// 替代纯向量 recall 为 dual-select
async function findRelevantMemories(
  query: string,
  signal: AbortSignal,
  recentTools: readonly string[] = [],
): Promise<RelevantMemory[]> {
  // Step 1: 扫描所有记忆的 frontmatter（只读头部，快）
  const memories = await scanMemoryFiles(memoryDir, signal);

  // Step 2: LLM 从 manifest 中选 top 5
  const selected = await selectRelevantMemories(query, memories, signal, recentTools);

  // Step 3: 只读被选中的文件的完整内容
  return selected.map(m => ({ path: m.filePath, mtimeMs: m.mtimeMs }));
}
```
**状态**：❌ 未实现（hawk-bridge 是纯向量搜索，无 frontmatter 扫描预选）

---

## 🟡 中优先级 — 功能增强

### [ ] 9. MEMORY.md 入口索引概念
**来源：Claude Code `memdir.ts` — `ENTRYPOINT_NAME = 'MEMORY.md'`**

Claude Code 的 MEMORY.md 是所有记忆的索引目录，每行一个：
```
- [Title](file.md) — one-line hook
```
有 200 行上限和 25KB 字节上限，超出时 truncation 警告。

hawk-bridge 没有入口索引概念，完全依赖向量搜索。

**实现方向**：
```typescript
// 可选：维护一个轻量索引文件
// 向量搜索前先用 index 快速预选
interface MemoryIndexEntry {
  id: string;
  name: string;
  description: string;  // 一行描述
  type: MemoryCategory;
  mtimeMs: number;
}
```
**状态**：🟡 规划中

---

### [ ] 10. Ignore Memory 指令支持
**来源：Claude Code `WHEN_TO_ACCESS_SECTION`**

Claude Code 明确处理"ignore memory"指令：
> "If the user says to *ignore* or *not use* memory: proceed as if MEMORY.md were empty. Do not apply remembered facts, cite, compare against, or mention memory content."

hawk-bridge 当前没有处理 `ignore` / `not use` memory 的机制。

**实现方向**：
```typescript
// hawk-recall 增加 ignore flag
async function recall(query: string, options: {
  ignoreMemory?: boolean;  // true 时返回空
  ...
}): Promise<RetrievedMemory[]> {
  if (options.ignoreMemory) {
    return [];  // 完全忽略记忆，如同 MEMORY.md 为空
  }
}
```
**状态**：❌ 未实现

---

### [ ] 11. 相对日期转绝对日期自动转换
**来源：Claude Code `memoryTypes.ts` project 类型**

Claude Code 要求：
> "Always convert relative dates in user messages to absolute dates when saving (e.g., 'Thursday' → '2026-03-05')"

hawk-bridge 没有这个机制，相对日期记忆过一段时间就不可解读了。

**实现方向**：
```typescript
// capture 时自动转换相对日期
function normalizeRelativeDates(text: string): string {
  // "下周四" → "2026-04-24"
  // "上周一" → "2026-04-13"
  // "三天后" → 基于当前日期计算
  // 使用 dateparser 或自定义实现
}

// normalizeText 管道中增加一步
function normalizeText(text: string): string {
  return normalizeRelativeDates(
    normalizePunctuation(
      normalizeTimestamps(text)  // 现有 timestamp 规范化
    )
  );
}
```
**状态**：❌ 未实现

---

### [ ] 12. Memory Shape Telemetry（记忆形状遥测）
**来源：Claude Code `memoryShapeTelemetry.ts`**

Claude Code 追踪记忆的"形状"：
- 每个记忆的大小分布
- recall 选择率（哪些被选中、哪些未被选中）
- 类型分布
- 过时率

**实现方向**：
```typescript
// recall 事件上报
interface MemoryRecallShape {
  totalAvailable: number;
  selectedCount: number;
  selectionRate: number;       // selectedCount / totalAvailable
  types: Record<string, number>;
  avgAge: number;
}
```
**状态**：❌ 未实现

---

## 🟢 低优先级 — 已规划

### [x] ~~Log file output~~ — pino 已经在 v1.1 解决
### [x] ~~Prometheus metrics~~ — v1.1 已加
### [x] ~~Health endpoint~~ — v1.1 已加
### [x] ~~FTS index~~ — v1.2 已加
### [x] ~~BM25 + 向量混合搜索~~ — v1.2 已加
### [x] ~~增量索引~~ — v1.2 已加
### [x] ~~Batch capture~~ — v1.2 已加
### [x] ~~normalizeText 管道~~ — v1.2 已拆分为 17 步

---

## 📊 Claude Code vs hawk-bridge 记忆功能对比

| 功能 | Claude Code | hawk-bridge | 差距 |
|------|-------------|-------------|------|
| **存储介质** | .md 文件（文件化） | LanceDB（纯向量） | 🔴 架构差异 |
| **入口索引** | MEMORY.md（200行限制） | 无 | 🔴 缺失 |
| **记忆分类** | 4类 + scope + body_structure + 详尽示例 | fact/preference/decision/entity | 🔴 分类体系弱 |
| **What NOT to Save** | 显式 LLM 指导 | 隐式预过滤 | 🔴 缺失显式指导 |
| **Trust 验证** | 记忆→验证文件/函数存在 | 无 | 🔴 缺失 |
| **记忆年龄标签** | freshness text（>1天显示caveat） | 无 | 🔴 缺失 |
| **来源追溯** | mtime + type + description + verification_count | 部分 | 🟡 不完整 |
| **Team Memory** | 完整 + symlink 安全 | 无 | 🔴 缺失 |
| **Recent tools-aware** | 选记忆时排除正在用的工具文档 | 无 | 🔴 缺失 |
| **双重选择器** | manifest扫描→LLM选topN→读文件 | 纯向量搜索 | 🔴 选优策略弱 |
| **Ignore 指令** | 完全忽略记忆 | 无 | 🟡 缺失 |
| **相对日期→绝对日期** | 自动转换 | 无 | 🟡 缺失 |
| **记忆遥测** | MemoryShapeTelemetry | 无 | 🟢 缺失 |
| **4层衰减** | 无（文件化+TTL） | Working/Short/Long/Archive | ✅ hawk更强 |
| **向量搜索** | 无 | BM25 + ANN + RRF | ✅ hawk更强 |
| **记忆去重** | 文件名去重 | SimHash + 向量相似度 | ✅ hawk更强 |

---

## 🚀 推荐实现顺序

```
Phase 0（安全底线）:
  1. What NOT to Save 显式指导 — 低成本，立即提升写入质量
  2. Source Tracing — 给 recall 结果加上 category/mtime/verification_count
  3. 相对日期→绝对日期 — normalizeText 管道增加一步

Phase 1（召回质量）:
  4. 记忆年龄标签 — freshness text，超过7天显示caveat
  5. Trust 验证提示 — 记忆提及文件路径时附加验证建议
  6. Ignore Memory 指令 — recall 支持 ignore flag

Phase 2（分类体系）:
  7. 4类 taxonomy 扩展 — user/feedback/project/reference + body_structure
  8. Scope 分离 — private vs team 记忆

Phase 3（架构升级）:
  9. 双重选择器 — manifest 扫描 + LLM 预选 topN
  10. MEMORY.md 入口索引 — 可选的文件化入口
  11. Recent tools-aware 记忆选择 — 排除正在用工具的文档

Phase 4（团队协作）:
  12. Team Memory 架构 — 共享记忆区域
  13. Symlink 安全验证 — PathTraversalError 防护

Phase 5（可观测性）:
  14. Memory Shape Telemetry — 记忆形状遥测
```

---

## Done ✅

- v1.2: P0/P1/P2 性能修复（getAllMemories DB层过滤、decay批量更新、incrementAccessBatch、reranker重试等20项）
- v1.1: 9 core improvements (retry, backup, pagination, structured logging, health endpoint, doctor connectivity test, reranking, prometheus metrics, config versioning)
- v1.0: Initial release with LanceDB + Ollama/Xinference support

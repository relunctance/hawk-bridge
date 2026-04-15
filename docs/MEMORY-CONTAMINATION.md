# 记忆污染防护方案

> 文档版本：v1.0
> 编写日期：2026-04-15
> 状态：方案设计，待实现

---

## 一、污染分类与根因

读完 `hawk-bridge` 全部源码后，确认污染分为 4 类：

| 污染类型 | 根因 | 当前状态 |
|---------|------|---------|
| **A. 假记忆（LLM 幻觉）** | LLM 生成的内容被当作事实存入 | ❌ 无 confidence 字段 |
| **B. 矛盾记忆（同事实多版本）** | 去重阈值 0.95 太高，相似但不同版本的记忆同时存在 | 🟡 有 correctionHistory，无版本链 |
| **C. 上下文混淆（召回命中不相关）** | 向量相似度分数不准确，minScore 阈值缺失 | ❌ minScore=0，无阈值保护 |
| **D. 脏数据残留（learnings 未验证）** | learnings 无验收层，错误 learnings 直接入库 | ❌ 无 learnings 验收机制 |

---

## 二、问题详解

### A. 假记忆 — 幻觉存储

**现状**：
- `source` 字段存在，值有：`hawk-capture:sent` / `hawk-capture:received` / `evolution-success` / `evolution-failure` / `user-import`
- 但 **没有区分 LLM 推理生成的内容 vs 用户明确表达的内容**
- `agent_inference` 类型不存在

**影响**：Agent 推理时产生的错误假设被当成事实存进去，下次召回时直接引用。

**解法**：

```typescript
// types.ts 新增 source 类型
type MemorySource = 
  | 'hawk-capture:sent'      // agent 发送的消息
  | 'hawk-capture:received'  // 用户输入
  | 'agent_inference'        // LLM 推理生成（低可信度）
  | 'evolution-success'       // soul-force 进化更新
  | 'evolution-failure'       // soul-force 进化失败
  | 'user-import'             // 用户手动导入
  | 'learnings:verified'      // learnings 验收后存入
  | 'learnings:unverified'    // learnings 未验收

// capture 时推理类内容标记
if (isLLMGenerated(content)) {
  memory.source = 'agent_inference';
  memory.reliability = 0.3;  // 初始低可信度
}
```

同时在 `MemoryEntry` 中加一个 `confidence` 字段专门给 LLM 生成内容用。

---

### B. 矛盾记忆 — 版本链缺失

**现状**：
- 有 `correctionHistory`（纠正历史），但只是记录，不建立版本链
- 新内容直接覆盖或新增，不指向旧版本
- 无法知道"哪个版本是最新的"

**影响**：同一事实有多个版本，召回可能拿到旧版本。

**解法 — supersedes 版本链**：

```typescript
// MemoryEntry 新增字段
{
  supersededBy: string | null;   // 指向新版本记忆的 id
  supersedes: string | null;      // 指向被替代的旧版本记忆的 id
}

// 纠正时的逻辑
async function correctMemory(id: string, newText: string) {
  const old = await db.getById(id);
  
  // 创建新版本
  const newId = 'hawk_' + Date.now().toString(36);
  await db.store({
    ...old,
    id: newId,
    text: newText,
    supersedes: id,         // 新版本指向旧版本
    correctionHistory: [...old.correctionHistory, {
      ts: Date.now(),
      oldText: old.text,
      newText: newText
    }]
  });
  
  // 旧版本标记被替代
  await db.update(id, { supersededBy: newId });
  
  // 新版本 reliability 继承旧版本的 80%
  // 如果旧版本 reliability >= 0.7，新版本 +0.1（纠错奖励）
  // 如果旧版本 reliability < 0.5，新版本不变（纠错本身不被奖励）
}
```

**召回时只返回 `supersededBy: null` 的记忆**，避免旧版本混入。

---

### C. 上下文混淆 — 召回阈值缺失

**现状**：
- `minScore` 配置存在，但在 `search()` 调用时传入的是 `0.0`（硬编码）
- FTS-only 模式根本没有 minScore 过滤
- 向量搜索的 score 范围不确定（可能是 0-1，也可能是 LanceDB 的距离值）

```typescript
// hawk-recall 里的调用
const [vectorResults, ftsResults] = await Promise.all([
  this.db.search(queryVector, topK * VECTOR_SEARCH_MULTIPLIER, 0.0, ...),  // ← 0.0！
  this.db.ftsSearch(query, topK * VECTOR_SEARCH_MULTIPLIER, ...),
]);
```

**影响**：不相关的记忆只要向量相似度不那么低，就会混进结果。

**解法**：

```typescript
// 1. 修复 minScore 默认值（不能用 0）
// constants.ts
export const MIN_RECALL_SCORE = parseFloat(process.env.HAWK_MIN_RECALL_SCORE || '0.55');

// hawk-recall 调用时
this.db.search(queryVector, topK * VECTOR_SEARCH_MULTIPLIER, MIN_RECALL_SCORE, ...)

// 2. FTS 结果也加阈值
const ftsFiltered = ftsResults.filter(r => r.score >= MIN_RECALL_SCORE);

// 3. 向量相似度 vs 距离值统一
// LanceDB 的 vector search 返回的是 distance（越小越好），不是 similarity（越大越好）
// 需要转换：similarity = 1 / (1 + distance)
```

---

### D. 脏数据 — learnings 未验收

**现状**：
- `learnings` 来源的记忆（`source: 'learnings:unverified'`）直接入库
- 没有"先验证再存入"机制
- learnings 是 L3 agent 执行失败时的产出，可能包含错误信息

**解法**：

```typescript
// hawk-capture 存储 learnings 时
if (source === 'learnings' && !isVerified) {
  // learnings 默认标记为 unverified，入库后不参与召回
  memory.reliability = 0.3;  // 低可信度
  memory.source = 'learnings:unverified';
}

// learnings 验收后（通过 L4 验收层）
async function verifyLearnings(learningsId: string, approved: boolean) {
  if (approved) {
    await db.update(learningsId, {
      source: 'learnings:verified',
      reliability: Math.min(1.0, oldReliability + 0.2)  // 验收通过 +0.2
    });
  } else {
    await db.forget(learningsId);  // 验收不通过，删除
  }
}
```

---

## 三、整体防护架构

```
存储时（hawk-capture）
        │
        ▼
  ┌─────────────────────────────────┐
  │ 1. 内容验证（HarmfulFilter）    │ → 有害内容直接拒绝
  │ 2. LLM 生成检测（isLLMGenerated）│ → 标记 agent_inference，低可信度
  │ 3. 去重（isDuplicate）           │ → score >= 0.95 则跳过
  │ 4. 饱和检测（handleSaturation）  │ → 同类记忆 >= 3 条则跳过
  │ 5. learnings 标记（unverified）  │ → learnings 未验收前降低可信度
  └─────────────────────────────────┘
        │
        ▼
  存储（store）
        │
        ▼
  supersedes 版本链更新（如果是纠正操作）

召回时（hawk-recall）
        │
        ▼
  ┌─────────────────────────────────┐
  │ 1. minScore 阈值过滤（0.55）    │ → 低于阈值不召回
  │ 2. RRF fusion                   │ → 向量 + FTS 综合排名
  │ 3. Noise filter                 │ → 噪音文本过滤
  │ 4. superseded 排除              │ → 只返回最新版本
  │ 5. agent_inference 降权         │ → 推理内容分数 × 0.7
  │ 6. LLM selector（dualSelect）   │ → 用轻量 LLM 二次筛选
  └─────────────────────────────────┘
        │
        ▼
  注入 <memory-context> 包裹输出
```

---

## 四、需修改的文件清单

| 文件 | 修改内容 |
|------|---------|
| `src/types.ts` | 新增 `agent_inference` / `learnings:verified` / `learnings:unverified` source 类型；新增 `confidence` 字段；新增 `supersedes` / `supersededBy` 字段 |
| `src/constants.ts` | 新增 `MIN_RECALL_SCORE = 0.55`；新增 `CONFIDENCE_INFERENCE = 0.3`；调整 `DEDUP_SIMILARITY` 默认值 |
| `src/store/adapters/lancedb.ts` | `update()` 方法支持 `supersedes` / `supersededBy` 字段；`search()` / `ftsSearch()` 调用方传入 minScore |
| `src/hooks/hawk-capture/handler.ts` | LLM 生成检测 → `source='agent_inference'` + `reliability=0.3`；learnings 标记 `learnings:unverified`；correction 时建立 supersedes 版本链 |
| `src/hooks/hawk-recall/handler.ts` | minScore 传入；过滤 superseded 记忆；agent_inference 降权；FTS 结果加 minScore 过滤 |
| `src/store/interface.ts` | `verify()` 方法扩展支持 learnings 验收 |

---

## 五、配置项新增

```yaml
# hawk-bridge config.yaml 新增
memory:
  contamination:
    # 召回最小相似度阈值
    minRecallScore: 0.55      # 默认 0.55，低于此值的记忆不召回
    # LLM 推理内容初始可信度
    inferenceReliability: 0.3  # 默认 0.3
    # learnings 验收前初始可信度
    unverifiedLearningsReliability: 0.3
    # 版本链启用
    versionChainEnabled: true   # 默认 true
```

---

## 六、实现优先级

| 优先级 | 任务 | 预计工时 |
|--------|------|---------|
| 🔴 P0 | 修复 minScore=0 问题（FTS + 向量搜索阈值过滤）| 1h |
| 🔴 P0 | supersedes 版本链（纠正历史 → 版本链）| 3h |
| 🟡 P1 | source=agent_inference + LLM 生成检测 | 2h |
| 🟡 P1 | learnings:verified/unverified 标记 + 验收后升权 | 2h |
| 🟡 P1 | agent_inference 召回时降权（×0.7）| 1h |
| 🟢 P2 | FTS score 与向量相似度统一（距离 vs 相似度）| 2h |
| 🟢 P2 | dualSelect 强制执行（已有代码，确认调用）| 0.5h |

---

*方案完成，待实施*

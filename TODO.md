# hawk-bridge v1.3 Roadmap — 自我进化架构 L0 层补全

## 背景

hawk-bridge 是自我进化闭环的 L0 记忆层。需要补充与 L5 soul-force 的闭环接口，以及作为 L0→L1 触发层的能力。

---

## 当前能力 vs 架构需求差距

| 功能 | 当前 | 架构需求 | 状态 |
|------|------|----------|------|
| 记忆存储检索 | ✅ | ✅ | 完成 |
| L5→L0 写接口 | ❌ | ✅ | **待实现** |
| 向 soul-force 暴露读 API | ❌ | ✅ | **待实现** |
| L0→L1 自动触发 | ❌ | ✅ dream后触发 inspect | **待实现** |
| 进化结果专属 importance | ❌ | ✅ success=0.95/failure=0.25 | **待实现** |
| name/description 自动生成 | ⚠️ 字段有，capture未填充 | ✅ LLM提取时同步生成 | **部分缺失** |
| drift 超时自动 re-verify | ❌ | ✅ | **待实现** |

---

## 待实现功能

### P0 — 核心闭环接口（L0 ⇄ L5）

#### 1. `hawk_bridge write` 写接口

**目标**：给 L5 soul-force 提供写记忆的入口

**接口形式**：
```bash
python3 -m hawkbridge write \
  --text "[ISSUE-001] 修复成功: DTO在Logic层使用" \
  --category decision \
  --importance 0.9 \
  --source evolution-success \
  --metadata '{"issue_id": "ISSUE-001"}'
```

**实现位置**：`src/cli/write.ts` + `src/hooks/hawk-write/`

---

#### 2. `hawk_bridge read --source` 过滤查询

**目标**：soul-force 按 source 过滤读取记忆

**接口形式**：
```bash
python3 -m hawkbridge read \
  --source evolution-success \
  --source evolution-failure \
  --limit 20
```

**用途**：
- soul-force 读取历史进化结果
- 按 issue_id 追溯
- 统计进化效果

---

### P0 — 闭环触发：L0 → L1

#### 3. dream hook 完成后自动触发 L1 inspect

**目标**：dream 整合完成后，如果积累了 ≥5 条新记忆，自动触发 auto-evolve inspect

**实现方式**：
- dream hook 结束时检查新记忆数量
- 调用 `openclaw cron` 或发送 webhook 触发 inspect
- 配置项：
```yaml
hawk:
  autoInspect:
    enabled: true
    minNewMemories: 5
    triggerOnDream: true
```

---

### P1 — 进化感知：记忆带结构化描述

#### 4. capture 时 LLM 自动生成 name + description

**目标**：每次 capture 时，LLM 同步生成：
- `name`：记忆的简短标题（10-30字）
- `description`：一句话描述（50字内）

**效果**：
- dual selector 可用 header scan 选记忆
- 记忆可追溯、可审计
- 与 soul-force 的进化知识库对齐

**修改位置**：
- `context-hawk/hawk/extractor.py` — 提取时加 name/description 字段
- `src/hooks/hawk-capture/handler.ts` — 写入时包含 name/description

---

### P1 — 进化效果：专属 importance 级别

#### 5. evolution 专属 importance 级别

**目标**：区分来自进化成功/失败的记忆

**新增级别**：
```typescript
const EVOLUTION_SUCCESS = 0.95;  // 来自成功修复，高优
const EVOLUTION_FAILURE = 0.25;   // 来自失败记录，降权
```

**recall 行为**：
- `evolution_success` 记忆 → 固定出现在 top 3
- `evolution_failure` 记忆 → 需要明确触发词才出现

---

### P2 — 感知增强：drift 触发 re-verify

#### 6. drift 超时自动触发 re-verify

**目标**：过期记忆自动触发相关代码段的重新巡检

**触发条件**：
- 某记忆超过 `DRIFT_THRESHOLD_DAYS * 2` 未验证
- 且 reliability ≥ 0.5（可信记忆才触发）

**处理流程**：
1. hawk过期 检测到超期记忆
2. 记录 `issue_id` 关联
3. 自动触发 auto-evolve verify 对相关代码段
4. 验证结果写回 hawk-bridge

---

## 实现顺序建议

```
Step 1: hawk_bridge write CLI     ← L5 写入口
Step 2: hawk_bridge read --source  ← soul-force 追溯用
Step 3: name/description 自动生成  ← capture 时 LLM 同步
Step 4: evolution 专属 importance   ← 读写时区分
Step 5: dream 后触发 inspect      ← L0 → L1 闭环
Step 6: drift 超时 re-verify     ← 感知增强
Step 7: 多维质量分（A）           ← 给 L5 提供进化参考数据
Step 8: 感知反馈 L5→L1（B）     ← 成功经验反向优化 capture
Step 9: 跨项目经验迁移（C）      ← 新项目继承经验
Step 10: 主动验证（D）          ← 定时确认重要记忆
Step 11: 记忆版本历史（E）       ← 可审计、可回滚
```

---

## 更深层能力补全（v1.4+）

### A. 多维质量分

**目标**：reliability 之外新增三个维度，供 L5 进化参考

| 维度 | 说明 | 范围 |
|------|------|------|
| `quality` | 记忆内容质量（完整度、描述清晰度） | 0.0-1.0 |
| `utility` | 有用程度（被 recall 次数、带来价值） | 0.0-1.0 |
| `freshness` | 新鲜度（内容是否过时，不只是时间） | 0.0-1.0 |

**接口**：`hawk_bridge quality --id xxx` 查询记忆多维质量

---

### B. 感知反馈（L5 → L1）

**目标**：L5 成功修复的模式 → 反向影响 L1 capture 的加权策略

**实现**：
- L5 写 `evolution-success` 记忆时，同时写 `~/.hawk/evolution-tags.json`
- hawk-capture 读取该文件，动态调整同类内容的 importance threshold
- 例：某类内容多次成功修复 → capture 时该类 importance 上调 0.1

**效果**：capture 策略随进化动态优化

---

### C. 跨项目经验迁移

**目标**：项目 A 解决过的问题 → 推荐给遇到类似问题的项目 B

**实现**：
- 记忆按 `project` scope 隔离
- 新项目启动时，向相似项目学习经验
- `hawk recall --project-similar=laravel-ecommerce` 拉取跨项目经验

**效果**：新项目快速继承历史经验，少走弯路

---

### D. 主动验证（定时确认重要记忆）

**目标**：不只在 recall 时被动验证，而是主动去确认重要记忆是否还正确

**实现**：
- 定时任务（cron）扫描 reliability ≥ 0.7 的记忆
- 对每条记忆，grep 相关代码段，验证内容是否还匹配
- 不匹配 → 自动降级 reliability + 写入 driftNote
- 匹配 → reliability 小幅提升

**效果**：重要记忆不随时间失效

---

### E. 记忆版本历史（update 快照）

**目标**：每次 update 记录旧版本快照，支持回滚和审计

**实现**：
```json
{
  "id": "mem_xxx",
  "current_version": 3,
  "versions": [
    {"version": 1, "text": "...", "updated_at": "2026-01-01"},
    {"version": 2, "text": "...", "updated_at": "2026-03-15"},
    {"version": 3, "text": "...", "updated_at": "2026-04-12"}
  ]
}
```
- `hawk_bridge history --id xxx` 查看版本历史
- `hawk_bridge rollback --id xxx --version 2` 回滚到指定版本

**效果**：记忆修改可审计、可回滚

---

## 参考架构

```
L5 soul-force
    ↓ write --source evolution-success
hawk-bridge
    ↓ read --source evolution-success
    ↓ recall 时：success 高优，failure 低优
    ↓ dream 完成后 → 触发 auto-evolve inspect
```

---

## 更深层能力补全（v1.5+）

### F. MCP Memory Protocol 接口

**目标**：其他 AI 系统（如 Claude Code）通过 MCP 调用 hawk-bridge 记忆

**实现**：
- 实现 MCP tool：`memory.query(query) → memories`
- 其他 AI 工具通过 MCP 协议查询 hawk-bridge

```json
// MCP tool schema
{
  "name": "memory_query",
  "description": "Query hawk-bridge memory store",
  "input": { "query": "string", "topK": 5 },
  "output": [{ "text": "...", "importance": 0.9, "category": "fact" }]
}
```

---

### G. 记忆隐私层（fine-grained）

**目标**：personal / team / project 之外，细粒度可见性控制

**实现**：
- 新增 `visibility` 字段：`private | team-visible | project-visible | public`
- recall 时按可见性过滤
- team 内哪些记忆对哪些人可见可配置

**效果**：私人偏好不应该进入团队共享

---

### H. 记忆冲突自动解决

**目标**：检测矛盾记忆对，自动触发 verify 确认

**检测逻辑**：
- 同一 category 下，两条记忆内容关键词重叠 > 70%
- 但具体结论矛盾（如"A 是对的" vs "B 是对的"）
- 例："用户喜欢 Arial" vs "用户喜欢 Helvetica"

**处理流程**：
1. 检测到矛盾对 → 写入 `conflict_pairs`
2. 触发 verify → 确认哪个正确
3. 错误的降 reliability 或删除

---

### I. 记忆溯源（why this memory）

**目标**：recall 结果附带"为什么选这条"，可回答"你为什么记得这个"

**实现**：recall 输出附带命中原因

```json
[
  {
    "text": "用户是产品经理",
    "reason": "命中: 关键词'产品经理'重叠",
    "source": "2026-03-15 对话"
  }
]
```

---

### J. 记忆分析仪表盘

**目标**：分析记忆覆盖盲区和过载

**命令**：`hawk analyze`

**输出**：
- 记忆覆盖话题分布
- 完全没有覆盖的话题
- 过载话题（某类记忆太多）
- 建议："你聊了很多关于 X，但没记住 Y"

---

### K. Per-memory 独立 TTL

**目标**：不同类型记忆不同过期时间，不再一刀切

**capture 时自动判断**：

| 类型 | TTL | 例 |
|------|-----|----|
| 临时信息 | 7 天 | 会议改到3点 |
| 事实类 | 90 天 | 用户是产品经理 |
| 偏好类 | 180 天 | 用户喜欢 Arial |
| 永久信息 | 永不过期 | 用户工作 10 年 |

---

## 多租户支持（v1.6+）

### MT-1. tenant_id 上下文注入

**目标**：所有 API 支持 tenant_id 隔离

**实现**：
```typescript
// 改动前
hawk_bridge.add_memory(text: "...", category: "fact")

// 改动后
hawk_bridge.add_memory(text: "...", category: "fact", tenant_id: "self")
```

**隔离方式**：查询时加 `WHERE tenant_id = {current_tenant}`

---

### MT-2. 多租户目录结构

**目标**：记忆按 tenant_id 隔离存储

```
~/.hawk/
  lancedb/
    memory_{tenant_id}.lance.db   # 按租户分库
  audit_{tenant_id}.log
  config_{tenant_id}.yaml
```

---

### MT-3. Learnings 三层隔离

**目标**：Tenant/Team/Global 三层

| 层级 | 归属 | 隔离 |
|------|------|------|
| Tenant Learnings | 租户私有 | tenant_id 隔离 |
| Team Learnings | 租户内共享 | team_id 隔离 |
| Global Learnings | 厂商维护 | 所有租户可见 |

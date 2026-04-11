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
```

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

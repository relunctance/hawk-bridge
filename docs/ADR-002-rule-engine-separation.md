# ADR-002: 规则引擎体系——Halter vs hawk-bridge 分离

**日期**：2026-04-19
**状态**：Accepted
**决策者**：maomao + 其林
**影响范围**：autoself 规则引擎架构

---

## Context（背景）

autoself 体系中有多个服务需要规则引擎能力：

- **Halter**：Agent 运行时安全（tool call 拦截）
- **hawk-bridge**：记忆生命周期（capture / recall / decay / lifecycle）
- **agent-brain**（未来）：L6 编排规则
- **soul-force**（未来）：进化触发规则

最初考虑统一管理，但经过分析发现各服务规则引擎的需求差异很大。

---

## Decision（决定）

**当前策略：各服务独立规则引擎，未来再评估统一抽象**

| 服务 | 规则引擎 | 职责 | 触发时机 |
|------|---------|------|----------|
| hawk-bridge | 内部轻量引擎 | 记忆生命周期 | capture / recall / decay / lifecycle |
| halter | Halter 独立服务 | Agent 运行时安全 | before_tool_call / after_tool_call |
| agent-brain | 待设计 | L6 编排规则 | task-tracker / system-health |
| soul-force | 待设计 | 进化触发规则 | learnings / evolution |

**不统一的原因**：
1. 解决的问题不同（安全 vs 记忆质量 vs 编排）
2. 性能要求不同（实时拦截 vs 异步评估）
3. 抽象层级不同（运行时层 vs 存储层）

---

## Consequences（后果）

### 正面影响

1. **职责清晰**：每个规则引擎只管一件事
2. **独立演进**：各服务可以按需迭代自己的规则引擎
3. **故障隔离**：一个规则引擎出问题不影响其他

### 负面影响

1. **代码重复**：各服务可能有相似的规则评估逻辑
2. **策略分散**：无法统一查看/管理所有规则
3. **学习成本**：开发者需要理解多个规则引擎

### 权衡

接受分散的代价，换取职责清晰和独立演进能力。
如果未来发现重复代码 > 30%，再评估统一抽象。

---

## 未来评估标准

> ⚠️ **待评估**（2026-Q3）

是否抽象统一规则引擎层，取决于：

1. 各服务规则引擎重复代码是否 > 30%
2. 规则 DSL 需求是否稳定
3. 是否有跨服务的规则需要协同

**统一后的愿景**：

```yaml
# 跨服务统一规则 DSL（未来）
rules:
  - name: block_dangerous_tools
    event: tool.called
    condition: tool in ["rm", "dd"] and "-rf" in args
    action: block
    services: [halter, agent-brain]

  - name: quarantine_low_confidence_memory
    event: memory.captured
    condition: confidence < 0.3
    action: quarantine
    services: [hawk-bridge]
```

---

## Alternatives Considered（考虑过的方案）

### 方案 A：统一 Halter 管理所有规则

**选择**：不选
**原因**：
- hawk-bridge 的记忆规则和 Agent 安全规则是两个完全不同的问题
- 强行统一会导致 Halter 过于复杂
- 性能要求不同（实时拦截 vs 异步评估）

### 方案 B：所有服务都用 hawk-bridge 规则引擎

**选择**：不选
**原因**：
- hawk-bridge 规则引擎定位是「记忆生命周期」
- 不是通用的规则评估引擎
- 会导致 hawk-bridge 承担不该承担的职责

### 方案 C：各服务独立（当前选择）

**选择**：当前策略
**原因**：
- 职责清晰，故障隔离
- 可以独立演进
- 未来有需要再评估统一

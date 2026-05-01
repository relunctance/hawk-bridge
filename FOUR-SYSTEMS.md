# 四件套系统演进路线图

> 建立时间：2026-04-23
> 维护者：maomao + tseng
> 目的：hawk-bridge / hawk-memory (Go) / soul-engine / hawk-eval 四个项目的协同演进指南

---

## 一、战略目标

**总目标**：行业级跨端多 Agent 记忆架构 — AI 团队共享记忆、分工协作。

- **跨端**：支持跨设备、跨平台
- **跨 Agent**：OpenClaw + Hermes（先实现）
- **核心指标**：整体测试评分超过所有竞品，用竞品自己的测试数据打他们

**竞品对标**：
| 竞品 | 关键指标 |
|------|---------|
| Mem0 | LoCoMo MRR 91.6 / BLEU 71.4 |
| m_flow | Procedural Recall + Trigger Accuracy |

---

## 二、四件套定位

```
┌─────────────────────────────────────────────────────┐
│                   soul-engine (进化层)                │
│         Raw → Pattern → Principle → Skill            │
│               记忆进化 + 策略生成                      │
└──────────────────────┬──────────────────────────────┘
                       │ 驱动
┌──────────────────────▼──────────────────────────────┐
│               hawk-bridge (L0 记忆层)                 │
│    Capture Hook / Recall Hook / Decay Hook           │
│         OpenClaw 集成 + 多 Agent 路由                │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP 调用
┌──────────────────────▼──────────────────────────────┐
│              hawk-memory (Go) (存储引擎)                │
│    LanceDB + Embedding + recall/distill/compile       │
└──────────────────────┬──────────────────────────────┘
                       │ benchmark 数据
┌──────────────────────▼──────────────────────────────┐
│                 hawk-eval (评测体系)                    │
│    MRR@5 / Recall@5 / BLEU / LLM-as-Judge             │
└──────────────────────────────────────────────────────┘
```

| 项目 | 仓库 | 定位 | 层级 |
|------|------|------|------|
| hawk-bridge | `~/repos/hawk-bridge` | OpenClaw Hook Bridge | L0 |
| hawk-memory (Go) | `~/repos/hawk-memory (Go)` | 记忆存储与检索 | L0 |
| soul-engine | `~/repos/soul-engine` | 记忆进化引擎 | L1+ |
| hawk-eval | `https://github.com/relunctance/hawk-eval` | 评测体系 | 基础设施 |

---

## 三、当前状态（2026-04-23）

### 3.1 hawk-memory (Go) ✅ 最活跃

**分支**：master
**最新 commit**：`37ed36b` feat: health monitor 脚本 + cron job

**已解决**：
| 功能 | commit | 状态 |
|------|--------|------|
| capture 返回 memory_ids | `e90231f` | ✅ |
| agent namespace | `f8a28df` | ✅ |
| agent_id Optional[str] fix | `41338ad` | ✅ |
| 集成测试套件 (13 tests) | `2ff772a` | ✅ |
| health cron 监控 | `37ed36b` | ✅ |

**核心指标**：
- MRR@5 = 0.213（目标 > 0.5）
- Recall@5 = 32%（目标 > 60%）
- Latency P50 = 396ms（目标 < 200ms）

---

### 3.2 hawk-bridge ⚠️ 文档强，代码弱

**分支**：v1.1（多 Agent 记忆架构）
**最新 commit**：`f84f9bd` chore: 归档战略前 TODO 内容

**现状**：
- v2.0 架构设计完成（Pipeline Stage + Observer + PipelineRunner）
- 108 项 TODO 文档化
- **但代码层面没有实现 v2.0**
- 单元测试：0 个（今天正在补）

**关键差距**：
- 3 个阻断性缺口：MemoryCompiler / Sync 协议 / Multi-tenant 隔离
- 5 个根本性盲区（范式层面）
- 规则引擎 #60-#68 还未实现

**单元测试（2026-04-23 完成）**：
| 文件 | 测试数 | 状态 |
|------|--------|------|
| circuit-breaker.test.ts | 11 | ✅ 11/11 |
| distributed-lock.test.ts | 12 | ✅ 12/11 |
| process-pool.test.ts | 11 | ✅ 11/11 |
| **合计** | **34** | **✅ 34/34** |

**分支策略**：
```
master   ← v1.1 ← 当前开发分支（v1.1 还没合并回 master）
  ↓
最终合并到 master（v1.1 功能稳定后）
```

---

### 3.3 soul-engine ⚠️ 有规划，进展慢

**分支**：v1（9 commits ahead of master）
**最新 commit**：`855df99` chore: 归档 Q3+ TODO，聚焦 Q2 v0.1-v0.3

**现状**：
- 架构设计完整（52 项功能规划）
- Batch 1-2 完成（LLM 抽象层 + BridgeClient + MemoryCompiler）
- **但核心进化逻辑没有真正跑通**
- 没有和 hawk-memory (Go) / hawk-bridge 形成闭环

**核心障碍**：
```
hawk-eval 评测体系 ← 有了数据来源
      ↓ 但没有连接 →
soul-engine 进化逻辑 ← 不知道评测结果，无法生成 Pattern/Principle
```

---

### 3.4 hawk-eval ✅ 跑通基线，待扩展

**仓库**：https://github.com/relunctance/hawk-eval
**最新 commit**：`683bccb` feat: 完整集成测试套件 (12 tests)

**当前能力**：
- hawk-memory (Go) recall benchmark ✅
- LoCoMo-10 / Evolving Events / hawk_memory 数据集 ✅（300 条中文）
- m_flow procedural 数据集 ✅（20 条）
- 完整评测引擎 + 报告生成 ✅

**未完成**：
| 任务 | 现状 | deadline |
|------|------|---------|
| B1: m_flow adapter 跑通 | 未完成 | 5/15 |
| B2: 数据集扩充到 200 条 | 25 条 | 6/30 |
| B3: CI Gate | 无 | 6/15 |

**baseline 指标**：
```
MRR@5 = 0.213（目标 > 0.5）
Recall@5 = 32%（目标 > 60%）
BLEU-1 = 0.15（目标 > 0.4）
```

---

## 四、互相依赖关系

```
hawk-memory (Go)
  ↑ 依赖
  │  • 用 hawk-eval 的 benchmark 验证 recall 质量
  │  • 为 soul-engine 提供使用数据（evolve 驱动）
  │
hawk-bridge
  ↑ 依赖
  │  • HTTP 调用 hawk-memory (Go)
  │  • 接入 soul-engine 做 Pattern 提炼
  │
soul-engine
  ↑ 驱动
  │  • 读取 hawk-memory (Go) 使用日志
  │  • 生成 Pattern → Principle → Skill
  │  • 下发 Skill 到 hawk-bridge 执行
  │
hawk-eval
  ↑ 反馈
      • 定期跑 benchmark，触发进化需求
      • recall 质量 < 阈值 → 生成改进 Pattern
```

**关键依赖链**：
1. hawk-eval → hawk-memory (Go)：每次 recall 改动都要重新跑 benchmark
2. hawk-memory (Go) → hawk-bridge：hawk-bridge 调用 hawk-memory (Go) 的 capture/recall
3. hawk-bridge + hawk-memory (Go) → soul-engine：使用数据流向进化层
4. hawk-eval → soul-engine：评测结果驱动进化方向

**四件套改动规则**：
> 任何改动都要同时分析对另外三个的影响，hawk-eval 要有对应的测试 case。

---

## 五、为什么 hawk-bridge 和 soul-engine 没动？

### 5.1 现实原因

| 项目 | 原因 |
|------|------|
| hawk-bridge | 架构设计文档完成但代码未实现；核心逻辑在 hawk-memory (Go)，bridge 只是调用方 |
| soul-engine | 进化逻辑依赖 hawk-memory (Go) 的使用数据；hawk-eval 建好后才知道数据在哪里 |

### 5.2 根本问题

**我们把四件套当成了四个独立项目，而不是一个系统。**

具体表现：
1. hawk-memory (Go) 改了 6 个 commit，hawk-bridge 没有相应更新
2. hawk-eval 建好了，但没有想好怎么用它驱动 soul-engine
3. hawk-bridge 的 v2.0 架构文档和实际代码是两套东西

### 5.3 战略时间线回顾

| 时间 | 发生了什么 | 缺失 |
|------|-----------|------|
| 2026-04-19 | hawk-bridge v2.0 架构设计 + soul-engine 新建 | 没有一起推进代码实现 |
| 2026-04-23 | hawk-memory (Go) + hawk-eval 大规模开发 | hawk-bridge / soul-engine 停滞 |

**问题**：我们花了大量时间建 hawk-eval 评测体系，但评测结果没有用来驱动任何进化动作。

---

## 六、下一步行动

### 6.1 立即行动（1-2 周）

| 优先级 | 任务 | 负责 | 关联项目 |
|--------|------|------|---------|
| 🔴 | hawk-bridge 单元测试补全（utils + store） | maomao | hawk-bridge |
| 🔴 | B1: m_flow adapter 跑通 | maomao | hawk-eval |
| 🟡 | hawk-bridge v1.1 → master 合并评审 | tseng | hawk-bridge |
| 🟡 | soul-engine + hawk-eval 打通方案 | tseng | soul-engine + hawk-eval |

### 6.2 近期行动（1 个月）

| 优先级 | 任务 | 负责 | 关联项目 |
|--------|------|------|---------|
| 🔴 | hawk-memory (Go) recall 质量提升（MRR > 0.5） | TBD | hawk-memory (Go) + hawk-bridge |
| 🟡 | B2: 数据集扩充到 200 条 | maomao | hawk-eval |
| 🟡 | B3: CI Gate for hawk-eval | maomao | hawk-eval |
| 🟡 | soul-engine Batch 3-5 实现 | TBD | soul-engine |

### 6.3 中期目标（Q2 末）

| 目标 | 指标 |
|------|------|
| hawk-memory (Go) recall 超过 Mem0 基线 | MRR@5 > 0.9 |
| m_flow 打榜 | Recall@5 > 0.7 |
| hawk-bridge v2.0 核心功能落地 | Pipeline + Observer |
| soul-engine 进化闭环跑通 | Pattern → Skill 产出 |

---

## 七、决策记录

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-04-19 | 新建 soul-engine 仓库 | 进化逻辑需要独立项目 |
| 2026-04-19 | hawk-bridge v2.0 架构文档先行 | 代码实现前需要设计确认 |
| 2026-04-23 | hawk-eval 先于 soul-engine 开发 | 需要数据来源才能做进化 |
| 2026-04-23 | 四件套改动必须同步分析影响 | 防止单点改动破坏系统 |

---

## 八、文件变更记录

| 日期 | 变更 |
|------|------|
| 2026-04-23 | 初始化本文档，整合四个项目的现状和依赖关系 |

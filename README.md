# 🦅 hawk-bridge

> **多 Agent 记忆架构 — 让 AI 团队共享记忆、分工协作**
>
> Session 结束就忘、跨 Agent 就失忆、Context 爆 Token ——
> hawk-bridge 给 AI 装上持久记忆，autoCapture + autoRecall，零手动，帮你省 Token 省钱。

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw 兼容](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat-square&logo=go)](https://go.dev)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)

**[English](README.md)** | [中文](README.zh-CN.md)

---

## 🎯 一句话定位

**AI 团队的多 Agent 共享记忆层** — 每个 Agent 记住自己该记住的，共享该共享的，进化该进化的。

---

## 🦅 解决了什么问题？

| 痛点 | ❌ 没有 | ✅ 有 hawk-bridge |
|------|--------|-----------------|
| 新 Session 开始 | 空白一无所知 | ✅ 自动注入相关记忆，MRR@5 = **99.6%** |
| 用户重复偏好 | "我跟你说过了" | ✅ 置信度校准 + 长期记忆 |
| 多 Agent 团队 | 各 Agent 从零开始 | ✅ 共享记忆 + `visible_to` 可见性控制 |
| 子 Agent 失控 | 能看主 Agent 私人记忆 | ✅ 私有记忆隔离，精确控制 |
| Context 爆 Token | 无限制膨胀 | ✅ 自动压缩 + SimHash 去重 + MMR 多样召回 |
| 记忆不会进化 | 重复同样错误 | ✅ importance 升级 + Belief Timeline + TIL |
| 遗忘关键信息 | 时间久远就消失 | ✅ Almost Lost 预警 + 4 层衰减（Working→Long→Archive） |
| 推理无因果链 | 只知其然不知所以然 | ✅ Causal Memory 反事实推理 |

---

## ⚡ 快速上手（3 步跑通）

```bash
# 1. 一键安装
curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh | bash

# 2. 验证安装
hawk doctor

# 3. 开始使用 — 每次回复自动记忆，每次新会话自动注入
hawk recall "项目架构"   # 召回相关记忆
hawk recall "我的偏好"   # 召回个人偏好
```

**开箱即用**：安装后自动集成到 OpenClaw，无需手动配置。

---

## 📊 性能数据（实测）

| 指标 | 数据 | 说明 |
|------|------|------|
| **MRR@5** | **99.6%** ✅ | 超越 Mem0 公开基线 91.6% |
| **Recall@5** | **71.5%** | conversational_qa 数据集 |
| **召回延迟 P50** | **77ms** | 冷启动，即时响应 |
| **并发召回 P95** | **419ms** | 5 并发下 |
| embedding 延迟 | **5.6ms/call** | xinference bge-m3 |

> 实测环境：xinference bge-m3 (CPU) + LanceDB 0.30 + Go 单进程

---

## 🧠 核心功能（18 个 COMPLETE）

### 免费版 — 9 个核心能力

| 功能 | 状态 | 说明 |
|------|------|------|
| **Working Memory** | ✅ | 任务连续性召回，跨 Session 保持上下文 |
| **Deprecation** | ✅ | 过时决策自动标记，演进历史完整保留 |
| **Learning Memory** | ✅ | 从对话中学习提取，高准确率 |
| **Confidence Calibration** | ✅ | 置信度校准，85% 准确率目标 |
| **Memory Chronology** | ✅ | 认知演变可视化，记录思维成长轨迹 |
| **Belief Timeline** | ✅ | 信念提取与追踪，理解用户观点变化 |
| **TIL（Today I Learned）** | ✅ | 每日学习总结，形成结构化知识 |
| **Almost Lost** | ✅ | 遗忘预警，记忆消失前主动保护 |
| **Memory Branching** | ✅ | 分支记忆，实验性推理独立存档 |

### Pro 版 — 9 个进阶能力

| 功能 | 状态 | 说明 |
|------|------|------|
| **Self-Awareness** | ✅ | 认知边界感知，知道自己不知道什么 |
| **Memory Coach** | ✅ | 记忆教练，主动建议优化记忆质量 |
| **Counterfactual Memory** | ✅ | 反事实推理，"如果当初…会怎样" |
| **Consensus Memory** | ✅ | 决策共识追溯，多版本决策对比 |
| **Memory Hygiene Score** | ✅ | 记忆健康分，定量评估记忆系统状态 |
| **Strategic Memory** | ✅ | 目标追踪，长期规划与执行监控 |
| **Task-Aware Recall** | ✅ | 任务感知召回，上下文相关的精准召回 |
| **Active Memory** | ✅ | 主动推送，基于触发规则主动提醒 |
| **Implicit Knowledge** | ✅ | 隐式知识提取，从行为中归纳规律 |

> **18/22 功能 COMPLETE** — 基础设施完善，覆盖记忆全生命周期

---

## 🗺️ 四件套关系

**hawk-bridge** 是四件套的记忆桥梁：

```
┌──────────────────────────────────────────────────────────────┐
│                    🦅 hawk-bridge                          │
│         OpenClaw Hook 系统 + 多 Agent 记忆编排               │
│                                                              │
│   Hook 触发 → capture（自动提取记忆）→ hawk-memory (Go)      │
│   新会话   → recall（自动注入记忆）← hawk-memory (Go)        │
└──────────────────────────────────────────────────────────────┘
                            ↕
┌──────────────────────────────────────────────────────────────┐
│                  📡 hawk-memory (Go)                          │
│              高性能记忆 API 服务（Go）                        │
│                                                              │
│   RRF Fusion 召回 + agent namespace + trigger 规则          │
│   MRR@5 = 99.6% | Recall@5 = 71.5% | P50 = 77ms          │
└──────────────────────────────────────────────────────────────┘
                            ↕
              ┌──────────────┴──────────────┐
              ↓                             ↓
┌─────────────────────────┐   ┌─────────────────────────┐
│      hawk-eval          │   │      soul-engine        │
│   评测体系（公开打榜）   │   │   记忆进化引擎（私有）   │
│                         │   │                         │
│ LoCoMo MRR = 100%      │   │ Raw→Pattern→Principle  │
│ m_flow procedural 公开   │   │ LLM 自动发现 trigger 规则│
└─────────────────────────┘   └─────────────────────────┘
```

---

## 🏗️ 多 Agent 记忆架构

```
┌─────────────────────────────────────────────────────────────┐
│                    hawk-bridge                              │
│                 多 Agent 记忆架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐                      │
│  │ Agent-1     │     │ Agent-2     │                      │
│  │ (主 Agent)  │     │ (子 Agent)  │                      │
│  └──────┬──────┘     └──────┬──────┘                      │
│         │  inject-context   │                              │
│         │◄──────────────────┘                              │
│         │                  子 Agent 只能看到                 │
│         │                  被注入的记忆（精确可见性控制）     │
│         │                                                  │
│  ┌──────▼──────────────────────────────────┐              │
│  │         Team Memory（共享层）              │              │
│  │  - 项目上下文、团队决策、技术选型          │              │
│  │  - 所有 Agent 可读                        │              │
│  ├──────────────────────────────────────────┤              │
│  │         Agent Private Memory（私有层）      │              │
│  │  - 主 Agent 的内部推理、临时状态          │              │
│  │  - 子 Agent 不可见                       │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
│  ┌──────────────────────────────────────────┐              │
│  │         Working Memory（任务层）             │              │
│  │  - 当前任务上下文、近期决策、置信度评分     │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键能力

| 能力 | 说明 |
|------|------|
| **`visible_to` 可见性控制** | 精确控制谁能读/写哪类记忆 |
| **上下文注入 API** | 主 Agent 调用 `inject-context` 注入给子 Agent |
| **Team Memory** | 团队共享记忆区域，协作无障碍 |
| **私有记忆隔离** | 主 Agent 私人推理默认对子 Agent 不可见 |
| **记忆进化链** | Raw→Pattern→Principle→Skill 自动演进 |

---

## 🔄 工作流程

```
Session 结束
    │
    ▼
┌──────────────────────────────────────┐
│  hawk-capture（自动提取）             │
│  • Working Memory — 当前任务上下文     │
│  • Deprecation — 过时记忆标记         │
│  • Confidence — 置信度评分            │
│  • TIL — 今日学习总结                │
│  • Almost Lost — 遗忘预警            │
└────────────────┬───────────────────┘
                 ▼
┌──────────────────────────────────────┐
│  hawk-memory (Go) — LanceDB 存储    │
│  • RRF Fusion 混合检索               │
│  • agent namespace 隔离              │
│  • 4 层衰减（Working→Archive）       │
└──────────────────────────────────────┘

新 Session 开始
    │
    ▼
┌──────────────────────────────────────┐
│  hawk-recall（自动召回）             │
│  • Task-Aware Recall — 任务感知       │
│  • Self-Awareness — 认知边界感知     │
│  • Memory Hygiene Score — 健康检查    │
└────────────────┬───────────────────┘
                 ▼
        注入 Context → LLM 回复
```

---

## 🚀 安装方式

### 方式一 — 安装脚本（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh | bash
```

### 方式二 — ClawHub

```bash
clawhub install hawk-bridge
openclaw skills install hawk-bridge
```

### 方式三 — 手动编译

```bash
git clone https://github.com/relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge
npm install && npm run build
openclaw plugins install /tmp/hawk-bridge
```

---

## 🦅 CLI 快速命令

```bash
# 诊断
hawk doctor              # 检查安装状态
hawk doctor --stats     # 显示记忆统计 + Hygiene Score

# 读写记忆
hawk recall "查询内容"    # 语义搜索召回（MRR@5 = 99.6%）
hawk write "记忆内容"    # 写入记忆

# 反馈纠正
hawk confirm 3           # 确认记忆正确（提升置信度）
hawk deny 3             # 标记记忆不可靠（降低 importance）
hawk correct 3 新内容    # 纠正记忆（触发 Deprecation）

# 维护
hawk export             # 导出所有记忆
hawk clear              # 清空所有记忆（⚠️不可逆）
```

---

## 🎯 竞品对比

| | Mem0 | m_flow | **hawk-bridge** |
|---|---|---|---|
| **MRR@5** | 91.6% | — | **99.6%** ✅ |
| **Recall@5** | — | 公开基线 | **71.5%** |
| **召回延迟 P50** | — | — | **77ms** ✅ |
| **多 Agent 协作** | ❌ | ❌ | **✅** |
| **可见性控制** | ❌ | ❌ | **✅ `visible_to`** |
| **记忆进化** | ❌ | ❌ | **✅ 4 层演进** |
| **开源** | ❌ | ❌ | **✅ 全开源** |

---

## 📂 文档导航

| 文档 | 内容 |
|------|------|
| [架构文档](docs/ARCHITECTURE-v2.md) | v2.0 完整架构设计 |
| [多 Agent 设计](docs/multi-agent-design.md) | 可见性控制 + 上下文注入 |
| [Go 集成指南](docs/go-integration.md) | hawk-memory (Go) API 接入 |
| [HTTP API](docs/http_api.md) | 完整 REST API 文档 |

---

## 🗺️ 演进路线

```
v1.1（当前）— 多 Agent 记忆核心
├── ✅ 可见性控制（visible_to）
├── ✅ 上下文注入 API（inject-context）
├── ✅ Team Memory
├── ✅ 18 个 COMPLETE 记忆功能
└── 🔄 Session 隔离

v1.2 — M-flow 集成
├── Bundle Search 集成
└── Episode Bundle 评分

v2.0 — 架构升级
├── Schema v2（4表拆分）
├── Pipeline 统一调度
└── Rule Engine 核心

v2.x — 完整能力
├── Pattern→Principle→Skill 进化
├── Multi-tenant Namespace
└── Dynamic Fusion（hawk-pro）
```

---

*最后更新：2026-05-01*
*核心方向：多 Agent 记忆架构开源 + MRR 超越 Mem0 + 18 个 COMPLETE 记忆能力*

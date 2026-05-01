# 🦅 hawk-bridge

> **多 Agent 记忆架构 — 让 AI 团队共享记忆、分工协作**
>
> Session 结束就忘、跨 Agent 就失忆、Context 爆了 Token 烧光——
> hawk-bridge 给 AI 装上持久记忆，autoCapture + autoRecall，零手动，帮你省 Token 省钱。

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw 兼容](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)

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

## 🎯 核心定位

**多 Agent 记忆架构** — 区别于竞品的核心差异：

| | M-flow | Mem0 | **hawk-bridge** |
|---|---|---|---|
| **定位** | 单 Agent 认知检索 | 单 Agent 记忆存储 | **多 Agent 共享记忆** |
| **多 Agent 协作** | ❌ | ❌ | **✅ 核心方向** |
| **可见性控制** | ❌ | ❌ | **✅ `visible_to` 字段** |
| **进化机制** | ❌ | ❌ | ✅ Pattern→Principle→Skill |
| **开源** | ❌ | ❌ | **✅ 全开源** |

### 知识进化金字塔

```
L4 Skill（技能）      ← 10次项目经验的Pattern汇总
L3 Principle（原则）  ← 5个项目的架构决策Pattern
L2 Pattern（模式）    ← 3次项目经验
L1 Raw（原始记忆）    ← 单次对话记录
```

---

## 🗺️ 四件套关系

**hawk-bridge** 是四件套的记忆桥梁：

```
┌──────────────────────────────────────────────────────────────┐
│                    🦅 hawk-bridge                          │
│            OpenClaw Hook 系统 + 多 Agent 记忆               │
│                                                              │
│   Hook 触发 → capture（自动提取记忆）→ hawk-memory (Go)      │
│   新会话   → recall（自动注入记忆）← hawk-memory (Go)        │
└──────────────────────────────────────────────────────────────┘
                            ↕
┌──────────────────────────────────────────────────────────────┐
│                  📡 hawk-memory (Go)                          │
│              统一记忆 API 服务（Python）                      │
│                                                              │
│   RRF Fusion 召回 + agent namespace + trigger 规则           │
│   MRR@5 = 0.996 | Recall@5 = 71.5% | Latency P50 = 15.7ms   │
└──────────────────────────────────────────────────────────────┘
                            ↕
              ┌──────────────┴──────────────┐
              ↓                             ↓
┌─────────────────────────┐   ┌─────────────────────────┐
│      hawk-eval          │   │      soul-engine        │
│   评测体系（公开打榜）   │   │   记忆进化引擎（私有）   │
│                         │   │                         │
│ LoCoMo MRR = 100%       │   │ Raw→Pattern→Principle   │
│ m_flow procedural 公开   │   │ LLM 自动发现 trigger 规则 │
└─────────────────────────┘   └─────────────────────────┘
```

**组件分工**：
- **hawk-bridge**（开源）：OpenClaw Hook + 多 Agent 可见性控制
- **hawk-memory (Go)**（开源）：RRF Fusion 召回 + agent namespace
- **hawk-eval**（开源）：MRR/Recall/BLEU 评测体系
- **soul-engine**（私有）：Pattern→Principle→Skill 进化链路

---

## 📊 Benchmark（实测数据）

> 实测：xinference bge-m3 (CPU) + LanceDB 0.30 + FastAPI 单 worker

### Recall 召回率

| 数据集 | 指标 | Mem0（公开） | **hawk（我们）** |
|--------|------|-------------|-----------------|
| LoCoMo 20-case | MRR@5 | 91.6% | **100%** ✅ |
| LoCoMo 200-case | MRR@5 | — | **99.6%** ✅ |
| conversational_qa | Recall@5 | — | **71.5%** |

### 延迟

| 操作 | 场景 | 延迟 |
|------|------|------|
| **Recall** | 冷启动 | **77ms** |
| **Recall** | 5 并发 | P50 **284ms** / P95 419ms |
| **Capture（含 LLM）** | 单次 | ~2900ms |
| xinference embedding | 并发 5 | 5.6ms/call |

### 与竞品对比

| | Mem0 | m_flow | **hawk-bridge** |
|---|---|---|---|
| MRR@5 | 91.6% | — | **99.6%** ✅ |
| Recall@5 | — | 公开 benchmark | **71.5%** |
| Latency P50 | — | — | **15.7ms** ✅ |
| 多 Agent 协作 | ❌ | ❌ | **✅** |
| 进化机制 | ❌ | ❌ | **✅** |
| 开源 | ❌ | ❌ | **✅** |

---

## 🔄 工作流程

```
Session（持久化磁盘）
    │
    └─► 历史消息
            │
            ▼
    Context 组装（内存）
            │
            ├──► hawk-recall 注入记忆 ← 从 LanceDB 召回
            │
            ├──► inject-context ← 主 Agent 注入给子 Agent
            │
            └──► System Prompt
                    │
                    ▼
                LLM 回复
                    │
                    ▼
            hawk-capture 提取 → 存 LanceDB
```

**核心流程**：
1. 每次回复 → `hawk-capture` 自动提取 → 存入 LanceDB
2. 每次新会话 → `hawk-recall` 自动召回 → 注入 Context
3. 多 Agent → 主 Agent 调用 `inject-context` 注入给子 Agent
4. 老旧记忆 → 4 层衰减自动管理（Working → Short → Long → Archive）

---

## 🏗️ 多 Agent 记忆架构

```
┌─────────────────────────────────────────────────────────────┐
│                    hawk-bridge                              │
│                 多 Agent 记忆架构                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐                      │
│  │ Agent-1     │     │ Agent-2     │                      │
│  │ (maomao)    │     │ (wukong)    │                      │
│  │ 主 Agent    │     │ 子 Agent    │                      │
│  └──────┬──────┘     └──────┬──────┘                      │
│         │  inject-context   │                              │
│         │◄──────────────────┘                              │
│         │                    子 Agent 只能看到               │
│         │                    被注入的记忆                    │
│         │                                              │
│  ┌──────▼──────────────────────────────────┐              │
│  │         Team Memory（共享层）              │              │
│  │  - 项目上下文、团队决策、技术选型          │              │
│  │  - 所有 Agent 可读                        │              │
│  ├──────────────────────────────────────────┤              │
│  │         Agent Private Memory（私有层）      │              │
│  │  - 主 Agent 的内部推理、临时状态          │              │
│  │  - 子 Agent 不可见                        │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键能力

| 能力 | 说明 | 状态 |
|------|------|------|
| **可见性控制** | `visible_to` 字段控制谁能读/写什么记忆 | 🔴 MVP |
| **上下文注入 API** | 主 Agent 调用 `inject-context` 注入给子 Agent | 🔴 MVP |
| **Team Memory** | 团队共享记忆区域 | 🔴 MVP |
| **Session 隔离** | 不同 Agent 的 session 隔离 | 🟡 v1.1 |
| **进化机制** | Pattern→Principle→Skill | 🟢 v2.x |

---

## ✨ 核心功能

### 基础记忆能力

| # | 功能 | 说明 |
|---|------|------|
| 1 | **自动捕获钩子** | `message:sent` + `message:received` → hawk 自动提取 6 类记忆 |
| 2 | **自动召回钩子** | `agent:bootstrap` → 新会话前注入相关记忆 |
| 3 | **混合检索** | BM25 + 向量搜索 + RRF 融合 |
| 4 | **亚 100ms 召回** | LanceDB ANN 索引，即时检索 |
| 5 | **自动去重** | SimHash 去重 — 防止重复记忆 |
| 6 | **MMR 多样召回** | 最大边际相关性 — 不重复 |
| 7 | **敏感信息脱敏** | 自动清除 API key、电话、邮箱等 |
| 8 | **TTL 过期机制** | 记忆可配置过期时间（默认 30 天） |
| 9 | **4类记忆分类** | fact / preference / decision / entity |

### 多 Agent 能力

| # | 功能 | 说明 |
|---|------|------|
| M1 | **可见性控制** | `visible_to` 字段控制谁能看什么 |
| M2 | **上下文注入 API** | 主 Agent 注入上下文给子 Agent |
| M3 | **Team Memory** | 团队共享记忆区域 |
| M4 | **Agent 私有记忆** | 主 Agent 私人推理默认不可见 |

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
hawk doctor --stats     # 显示记忆统计

# 读写记忆
hawk recall "查询内容"    # 语义搜索召回
hawk write "记忆内容"     # 写入记忆

# 反馈纠正
hawk confirm 3           # 确认记忆正确
hawk deny 3              # 标记记忆不可靠
hawk correct 3 新内容     # 纠正记忆

# 维护
hawk export              # 导出所有记忆
hawk clear               # 清空所有记忆（⚠️不可逆）
```

---

## 📂 文档导航

| 文档 | 内容 |
|------|------|
| [架构文档](docs/ARCHITECTURE-v2.md) | v2.0 完整架构设计 |
| [TODO](TODO.md) | ~108 项功能规划 |
| [多 Agent 设计](docs/multi-agent-design.md) | 可见性控制 + 上下文注入 |
| [Migration to soul-engine](docs/MIGRATION-TO-SOUL-ENGINE.md) | 进化层迁移说明 |

---

## 🗺️ 演进路线（Q4 重点）

```
v1.1（当前）— 多 Agent 记忆核心
├── ✅ 可见性控制（visible_to）
├── ✅ 上下文注入 API（inject-context）
├── ✅ Team Memory
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

## 🦅 解决了什么问题？

| 痛点 | ❌ 没有 | ✅ 有 hawk-bridge |
|------|--------|-----------------|
| 新 Session 开始 | 空白一无所知 | ✅ 自动注入相关记忆 |
| 用户重复偏好 | "我跟你说过了" | ✅ 从 session 1 就记住 |
| 多 Agent 团队 | 各Agent从零开始 | ✅ 共享记忆 + 可见性控制 |
| 子 Agent 失控访问 | 能看主Agent私人记忆 | ✅ visible_to 字段过滤 |
| Context 爆 Token | 无限制膨胀 | ✅ 压缩 + 去重 + MMR |
| 记忆不会自我改进 | 重复同样错误 | ✅ importance 智能升级 |

---

*最后更新：2026-04-25*
*核心方向：多 Agent 记忆架构开源 + MRR 超越 Mem0 + Trigger v2 进化护城河*

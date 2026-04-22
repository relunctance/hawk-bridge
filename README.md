# 🦅 hawk-bridge

> **多 Agent 记忆架构 — 让 AI 团队共享记忆、分工协作**
>
> Session 结束就忘、跨 Agent 就失忆、Context 爆了 Token 烧光——
> hawk-bridge 给 AI 装上持久记忆，autoCapture + autoRecall，零手动，帮你省 Token 省钱。
>
> **开源方向：个人多 Agent 记忆系统。集成 M-flow 图拓扑检索，打造行业顶级的多 Agent 共享记忆基础设施。**

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw 兼容](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## 🎯 核心定位：多 Agent 记忆架构

```
个人多 Agent 记忆系统的开源基础设施

你的 AI 团队（Wukong/Bajie/Bailong）：
  - 共享项目上下文记忆
  - 分工协作互不干扰
  - 主 Agent 注入上下文给子 Agent
  - 子 Agent 不能自主访问主 Agent 的私人记忆
```

### 与竞品的核心差异

| | M-flow | Mem0 | hawk-bridge（我们） |
|---|---|---|---|
| **定位** | 单 Agent 认知检索 | 单 Agent 记忆存储 | **多 Agent 共享记忆** |
| **核心能力** | 图拓扑 Bundle Search | 向量检索 | **多 Agent 分工 + 共享 + 可见性控制** |
| **图检索** | ✅ 顶级 | ❌ | ⚡ **集成 M-flow** |
| **多 Agent 协作** | ❌ | ❌ | **✅ 核心方向** |
| **进化机制** | ❌ | ❌ | ✅ Pattern→Principle→Skill |
| **开源** | ❌ | ❌ | **✅ 全开源** |

### 为什么选 hawk-bridge？

```
场景：你有一个 AI 团队

Agent-A（maomao）：主 Agent，编排者
  → 看到所有记忆，决定注入什么给子 Agent

Agent-B（wukong）：后端开发
  → 只看到 maomao 注入的上下文，不能自主 recall maomao 的私人记忆

Agent-C（bajie）：前端开发
  → 同样只看到被注入的记忆

他们共享：
  - 项目上下文
  - 团队决策
  - 技术选型

他们隔离：
  - maomao 的私人推理
  - wukong/bajie 的中间思考
```

**M-flow 的图检索是顶级的，hawk-bridge 集成 M-flow 作为 Recall 引擎，补上检索质量的差距。**

---

## 它做什么？

AI Agent 每次会话结束就会遗忘一切。**hawk-bridge** 将 OpenClaw 的 Hook 系统与 hawk 的 Python 记忆系统桥接，让 Agent 拥有持久化、自我改进的记忆：

- **每次回复** → hawk 自动提取并存入有意义的内容
- **每次新会话** → hawk 在思考前自动注入相关记忆
- **多 Agent 协作** → 主 Agent 注入上下文给子 Agent，子 Agent 只能看到被允许的记忆
- **零手动操作** — 开箱即用，自动运行

**没有 hawk-bridge：**
> 用户："我喜欢简洁的回复，不要长段落"
> Agent："好的！" ✅
> （下一个 session — 又忘了）

**有 hawk-bridge：**
> 用户："我喜欢简洁的回复"
> Agent：自动存入 `preference:communication` ✅
> （下一个 session — 自动注入，立即生效）

---

## ❌ 没有 vs ✅ 有 hawk-bridge

|| 场景 | ❌ 没有 hawk-bridge | ✅ 有 hawk-bridge |
|----------|------------------------|---------------------|
| **新 session 开始** | 空白 — 对你一无所知 | ✅ 自动注入相关记忆 |
| **用户重复偏好** | "我跟你说过了..." | 从 session 1 就记住 |
| **长任务持续数天** | 重启 = 从头开始 | 任务状态持久化，无缝衔接 |
| **上下文变大** | Token 费用飙升，💸 | 5 种压缩策略保持精简 |
| **重复信息** | 同一事实存了 10 份 | SimHash 去重 — 只存一份 |
| **记忆召回** | 全部相似、重复注入 | MMR 多样性召回 — 不重复 |
| **记忆管理** | 一切永远堆积 | 4 层衰减 — 噪音消散，信号保留 |
| **自我改进** | 重复同样的错误 | importance + access_count 追踪 → 智能升级 |
| **多 Agent 团队** | 每个 Agent 从零开始，无共享上下文 | **共享记忆 + 可见性控制 + 上下文注入** |
| **图拓扑检索** | 基础向量相似度 | **⚡ 集成 M-flow Bundle Search** |

---

## 🎯 核心定位：记忆的本质是学习，不是存储

> **竞品（Mem0 / M-flow / Notion AI / Copilot / Rewind AI）都在做同一件事**：存储"说过的话"——把对话记录成文本块，用向量检索找回来。它们本质是"更高级的文本向量检索系统"。

> **hawk-bridge 在做另一件事**：存储"学到的知识"——从 Raw → Pattern → Principle → Skill 的知识进化体系。记忆不是存储单位，是学习单位。

### 知识进化金字塔

```
┌─────────────────────────────────────────────────────────────┐
│  L4 Skill（技能）                                          │
│  "px create-next-app 的标准流程"                          │
│  来源：10次项目经验的Pattern汇总                            │
├─────────────────────────────────────────────────────────────┤
│  L3 Principle（原则）                                       │
│  "Next.js项目应该用App Router"                             │
│  来源：5个项目的架构决策Pattern                             │
├─────────────────────────────────────────────────────────────┤
│  L2 Pattern（模式）                                        │
│  "App Router的layout.tsx是全局布局入口点"                  │
│  来源：3次Next.js项目经验                                  │
├─────────────────────────────────────────────────────────────┤
│  L1 Raw（原始记忆）                                        │
│  "2024-03-15 用户提到想用Next.js做项目"                   │
│  来源：单次对话记录                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ 多 Agent 记忆架构

### 核心设计

```
┌─────────────────────────────────────────────────────────────┐
│                    hawk-bridge                              │
│                 多 Agent 记忆架构                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐                      │
│  │ Agent-1     │     │ Agent-2     │                      │
│  │ (maomao)    │     │ (wukong)   │                      │
│  │ 主 Agent    │     │ 子 Agent    │                      │
│  └──────┬──────┘     └──────┬──────┘                      │
│         │                    │                              │
│         │  inject-context   │                              │
│         │◄───────────────────┘                              │
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
| **可见性控制** | 记忆标记 `visible_to`，recall 时过滤 | 🔴 MVP 核心 |
| **上下文注入 API** | 主 Agent 调用 `inject-context` 注入给子 Agent | 🔴 MVP 核心 |
| **Team Memory** | 团队共享记忆区域 | 🔴 MVP 核心 |
| **Session 隔离** | 不同 Agent 的 session 隔离 | 🟡 v1.1 |
| **视角感知** | 保留不同 Agent 的观点多样性 | 🟢 v2.x |
| **权限矩阵** | 读/写/共享的细粒度控制 | 🟢 v2.x |

### MVP 场景

```typescript
// 1. maomao 创建记忆，标记可见性
POST /api/v1/capture
{
  "content": "项目决定用 Next.js App Router",
  "visible_to": ["wukong", "bajie", "maomao"],  // 只有这些 Agent 可以看到
  "agent_id": "maomao"
}

// 2. maomao 派发任务给 wukong，注入上下文
GET /api/v1/inject-context?agent_id=wukong&task=backend-dev
{
  "context": "项目上下文...\n团队决策：用 Next.js App Router\nwukong 的任务：...",
  "memories": [...]
}

// 3. wukong recall，只能看到被允许的记忆
GET /api/v1/recall?query=架构
{
  "memories": [
    // 只有 visible_to 包含 wukong 的记忆
  ]
}
```

---

## 🔄 M-flow 集成

**M-flow 的图拓扑 Bundle Search 是当前最先进的记忆检索算法。**

hawk-bridge v2.x 将集成 M-flow 作为 Recall 引擎：

```
┌─────────────────────────────────────────────────────────────┐
│                    hawk-bridge Recall                       │
│                                                             │
│  ┌───────────────┐     ┌───────────────┐                   │
│  │  向量检索     │     │  M-flow Bundle Search  │           │
│  │  (快速召回)   │ --> │  (图拓扑评分)      │           │
│  └───────────────┘     └───────────────┘                   │
│                                     │                       │
│                                     ▼                       │
│                           Episode Bundle                    │
│                           (证据链评分)                      │
└─────────────────────────────────────────────────────────────┘
```

### 集成的核心优势

| | hawk-bridge 当前 | 集成 M-flow 后 |
|---|---|---|
| **检索本质** | 向量相似度排序 | 路径成本最小化 |
| **多跳推理** | ❌ | ✅ |
| **证据链评分** | ❌ | ✅ |
| **边语义** | ❌ | ✅ |

---

## 🦅 解决了什么问题？

**没有它：** AI Agent 会遗忘一切——跨 Session 忘，跨 Agent 也忘，Token 费用还失控。

**有了它：** 持久化记忆 + 共享上下文 + 节省 Token。

### hawk-bridge 解决的痛点

|| 痛点 | ❌ 没有 | ✅ 有 hawk-bridge |
|------|--------|-----------------|
| **Session 结束就忘** | ❌ 新 Session 从零开始 | ✅ 跨 Session 记忆注入 |
| **团队信息孤岛** | ❌ 每个 Agent 各自为战 | ✅ 共享记忆 + 可见性控制 |
| **多 Agent 重复犯错** | ❌ Agent A 不知道 Agent B 的决策 | ✅ 记忆共享，不重蹈覆辙 |
| **子 Agent 失控访问** | ❌ 子 Agent 能 recall 主 Agent 的私人记忆 | ✅ 可见性字段过滤 |
| **LLM 费用失控** | ❌ 无限制 Context 膨胀，token太烧钱 | ✅ 压缩 + 去重 + MMR，Context 变小 |
| **Context 溢出 / 爆 Token** | ❌ Session 历史无限堆积直到崩溃 | ✅ 自动裁剪 + 4 层衰减 |
| **重要决策被遗忘** | ❌ 只存在旧 Session 里，永远丢失 | ✅ 带 importance 存 LanceDB |
| **重复记忆堆积** | ❌ 同样内容存了 N 份 | ✅ SimHash 去重，64位指纹 |
| **召回重复啰嗦** | ❌ "说说 X" → 注入 5 条相似记忆 | ✅ MMR 多样性，不重复 |
| **记忆不会自我改进** | ❌ 不会越用越好 | ✅ importance + access_count 智能升级 |

### 解决的 5 个核心问题

**问题1：Session 有上下文窗口限制**
Context 有 Token 上限（比如 32k）。Session 历史太长会挤掉其他重要内容。
→ hawk-bridge 帮你压缩/归档，只注入最相关的。

**问题2：AI 跨 Session 就忘**
Session 结束，Context 消失。下次对话：AI 完全不记得上次说了什么。
→ hawk-recall 每次启动前从 LanceDB 注入相关记忆。

**问题3：多 Agent 之间信息不共享**
Agent A 不知道 Agent B 做了什么决策，各自从头开始。
→ 共享记忆 + 可见性控制：所有 Agent 读写同一个记忆库，但按权限过滤。

**问题4：子 Agent 看到不该看的记忆**
主 Agent 的私人推理被子 Agent 看到，隐私泄露。
→ 可见性字段：`visible_to` 控制谁能看什么。

**问题5：发送给 LLM 前 Context 太大太冗余**
召回没优化的话，Context 里一堆重复相似内容，浪费 token。
→ 经过压缩 + SimHash 去重 + MMR 多样性召回后，发送给 LLM 的 Context **体积大幅缩小**，节省 token 消耗。

---

## 🔄 hawk-bridge 在 Session/Context 生命周期中的位置

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
            ├──► Skills 描述
            ├──► Tools 列表
            └──► System Prompt
                    │
                    ▼
                LLM 回复
                    │
                    ▼
            hawk-capture 提取 → 存 LanceDB
```

**工作流程：**
1. 每次回复 → `hawk-capture` 提取有意义的内容 → 存入 LanceDB
2. 每次新会话 → `hawk-recall` 从 LanceDB 召回相关记忆 → 注入 Context
3. 多 Agent 协作 → 主 Agent 调用 `inject-context` 注入给子 Agent
4. 老旧记忆 → 通过 4 层衰减自动管理（Working → Short → Long → Archive）
5. 重复记忆 → SimHash 去重，避免浪费存储
6. 冗余召回 → MMR 确保多样、不重复的注入

---

## ✨ 核心功能

### 多 Agent 记忆（核心方向）

| # | 功能 | 说明 |
|---|------|------|
| M1 | **可见性控制** | `visible_to` 字段控制谁能读/写什么记忆 |
| M2 | **上下文注入 API** | 主 Agent 调用 `inject-context` 注入给子 Agent |
| M3 | **Team Memory** | 团队共享记忆区域 |
| M4 | **Agent 私有记忆** | 主 Agent 的私人推理默认不可见 |
| M5 | **Multi-Agent Session 隔离** | 不同 Agent 的 session 隔离 |

### 基础记忆能力

| # | 功能 | 说明 |
|---|------|------|
| 1 | **自动捕获钩子** | `message:sent` + `message:received` → hawk 自动提取 6 类记忆 |
| 2 | **自动召回钩子** | `agent:bootstrap` → 新会话前注入相关记忆 |
| 3 | **混合检索** | BM25 + 向量搜索 + RRF 融合 — 无需 API key 也能用 |
| 4 | **零配置降级** | 开箱即用，Jina 免费额度默认启用 |
| 5 | **5 种 Embedding 提供者** | Ollama (本地 GPU) / Jina AI (免费云) / 千问 / OpenAI / Cohere |
| 6 | **亚 100ms 召回** | LanceDB ANN 索引，即时检索 |
| 7 | **自动去重** | 存储前文本相似度去重 — 防止重复记忆 |
| 8 | **MMR 多样召回** | 最大边际相关性 — 既相关又多样，减少 context 大小 |
| 9 | **敏感信息脱敏** | 自动清除 API key、电话、邮箱、身份证、银行卡号 |
| 10 | **TTL / 过期机制** | 记忆可配置过期时间（默认 30 天） |
| 11 | **召回分数门槛** | 低于相关度阈值的记忆不注入 context |
| 12 | **审计日志** | 所有捕获/跳过/拒绝/召回事件记录到 `~/.hawk/audit.log` |
| 13 | **4类记忆分类** | fact / preference / decision / entity — 每类独立可靠性追踪和过期感知召回 |

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                                │
│  agent:bootstrap │  message:sent, message:received             │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                 │
│  │       🦅 hawk-recall       │  ← 在首次回复前              │
│  │    (before first response)  │     向 Agent 上下文          │
│  └─────────────────────────────┘     注入相关记忆              │
│                   ↓                                                │
│  ┌─────────────────────────────────────────┐                 │
│  │         M-flow Bundle Search ⭐ NEW      │                 │
│  │    (v2.x 集成图拓扑检索)                 │                 │
│  └─────────────────────────────────────────┘                 │
│                   ↓                                                │
│  ┌─────────────────────────────────────────┐                 │
│  │              LanceDB                      │                 │
│  │   向量搜索 + BM25 + RRF 融合              │                 │
│  └─────────────────────────────────────────┘                 │
│                   ↓                                                │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← 提取 / 评分 / 衰减     │
│         │  MemoryManager         │                             │
│         │  SQLite WAL 存储        │ ← v2.0: 替代 JSON 文件   │
│         │  + VectorRetriever     │                             │
│         └───────────────────────┘                             │
│                                                                   │
│  ┌─────────────────────────────────────────┐                   │
│  │      Multi-Agent Memory Layer ⭐ CORE   │                   │
│  │  visible_to / inject-context / TeamMem  │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📈 性能数据

> 实测：xinference bge-m3 (CPU) + LanceDB 0.30 + FastAPI 单 worker

|| 操作 | 场景 | 延迟 | QPS |
|------|------|------|-----|
| **Recall** | 冷启动 | 77ms | — |
| **Recall** | 5 并发用户 | P50 284ms / P95 419ms | **13** |
| **Recall** | 20 并发（过载） | P50 1501ms | 12 |
| **Capture（含 LLM 提取）** | 单次 | ~2900ms | — |
| **Capture（旁路 LLM）** | 估算 | ~250ms | ~4 |
| xinference embedding | 单次 | 240ms | — |
| xinference embedding | 并发 5 | 28ms 总（5.6ms/call） | — |

**说明：**
- Recall 瓶颈在 xinference embedding（240ms/call），但并发时多核 CPU 收益巨大
- Capture 瓶颈在外部 LLM（Minimax，约 2.5s），非 LanceDB 本身
- 5 并发用户内性能稳定，P50 仅 284ms

---

## 🚀 一键安装

选择最适合你的方式：

### 方式一 — ClawHub（推荐）
```bash
# 最简单 — 一条命令搞定
clawhub install hawk-bridge
# 或通过 OpenClaw
openclaw skills install hawk-bridge
```
> ✅ 自动更新、易管理、无需手动配置

### 方式二 — 克隆 + 安装脚本
```bash
# 自动下载并运行安装脚本
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)
```
> ✅ 支持所有 Linux 发行版，全自动

### 方式三 — 手动安装
```bash
git clone https://github.com/relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge
npm install && npm run build
# 然后添加到 openclaw.json：
openclaw plugins install /tmp/hawk-bridge
```
> ✅ 完全可控，适合高级用户

---

## 🦅 快速命令

所有命令在 `hawk-bridge` 工作目录下执行：
```bash
cd ~/.openclaw/workspace/hawk-bridge
```

### 📊 统计与诊断
```bash
# 🦅 诊断 — 检查安装状态、配置、连接
node dist/cli/doctor.js
# 或简写
hawk doctor

# 📊 统计 — 显示记忆数量、分类/来源/可信度分布
node dist/cli/doctor.js --stats
```

### 📖 读写记忆
```bash
# 写入一条记忆
node dist/cli/write.js --text "团队决策：使用 Redis 做缓存" --category decision --importance 0.8 --source user-import

# 按来源读取记忆（如 evolution-success、user-feedback）
node dist/cli/read-source.js --source evolution-success --source evolution-failure --limit 20
```

### 🔍 查询记忆
```bash
# 语义搜索记忆（需要配置 embedding）
 hawk recall "我们关于架构做了什么决定"

# 对比两条记忆
 hawk对比 1 2
```

### ✏️ 反馈与纠正
```bash
# ❌ 标记记忆 N 不可靠（可信度 -5%）
 hawk否认 3

# ✅ 标记记忆 N 正确（可信度不变，验证计数 +1）
 hawk确认 3

# ✏️ 纠正记忆 N 的内容
 hawk纠正 3 修正后的新内容

# 🔍 扫描过期/陈旧记忆
 hawk过期
```

### 🗑️ 维护操作
```bash
# 导出所有记忆为 JSON
 hawk导出

# 清空所有记忆（⚠️ 不可逆）
 hawk清空

# 清理过期/锁定记忆
 hawk清理

# 锁定记忆 N（防止自动删除）
 hawk锁定 5

# 解锁记忆 N
 hawk解锁 5
```

### ⚡ 批量操作
```bash
# 锁定所有记忆
 hawk锁定all

# 解锁所有记忆
 hawk解锁all
```

---

## 📂 文档导航

|| 文档 | 内容 |
|------|------|------|
|| [架构文档](docs/ARCHITECTURE-v2.md) | v2.0 完整架构设计 |
|| [TODO](TODO.md) | ~102 项功能规划 |
|| [Migration to soul-engine](docs/MIGRATION-TO-SOUL-ENGINE.md) | 进化层迁移说明 |
|| [多 Agent 设计](docs/multi-agent-design.md) | 可见性控制 + 上下文注入 |

---

## 🗺️ 演进路线

```
v1.1（当前）— 多 Agent 记忆核心
├── #73 可见性控制
├── #17 上下文注入 API
├── #6 Team Memory
└── #22 Session 隔离验证

v1.2 — M-flow 集成
├── Bundle Search 集成
├── Episode Bundle 评分
└── 路径成本传播

v2.0 — 架构升级
├── Schema v2（4表拆分）
├── Pipeline 统一调度
├── Rule Engine 核心
└── Multi-DB 适配器

v2.x — 完整能力
├── #59 视角感知记忆
├── #50 Storage Quota
├── #39 Multi-tenant Namespace
└── 进化机制（Pattern→Principle→Skill）
```

---

*最后更新：2026-04-22*
*核心方向：个人多 Agent 记忆系统开源 + M-flow 图检索集成*

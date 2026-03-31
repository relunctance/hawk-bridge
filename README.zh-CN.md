# 🦅 hawk-bridge

> **OpenClaw Hook 桥接器 → hawk Python 记忆系统**
>
> *给任意 AI Agent 装上记忆 — autoCapture（自动提取）+ autoRecall（自动注入），零手动操作*

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw 兼容](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

---

## 它做什么？

AI Agent 每次会话结束就会遗忘一切。**hawk-bridge** 将 OpenClaw 的 Hook 系统与 hawk 的 Python 记忆系统桥接，让 Agent 拥有持久化、自我改进的记忆：

- **每次回复** → hawk 自动提取并存入有意义的内容
- **每次新会话** → hawk 在思考前自动注入相关记忆
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

## ✨ 核心功能

| # | 功能 | 说明 |
|---|---------|-------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk 自动提取 6 类记忆 |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk 在首次回复前注入相关记忆 |
| 3 | **混合检索** | BM25 + 向量搜索 + RRF 融合，零 API Key 也能跑 |
| 4 | **零配置降级** | BM25-only 模式开箱即用，无需任何 API Key |
| 5 | **4 种向量 Provider** | Ollama（本地）/ sentence-transformers（CPU）/ Jina AI（免费API）/ OpenAI |
| 6 | **优雅降级** | API Key 不可用时自动切换到备用方案 |
| 7 | **无 Embedder 时仍可检索** | 直接用 BM25 分数作为排序依据 |
| 8 | **种子记忆** | 预置团队结构、规范、项目背景等 11 条初始记忆 |
| 9 | **亚毫秒级召回** | LanceDB ANN 索引，瞬时检索 |
| 10 | **跨平台安装** | 一条命令，Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE 通用 |

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                                │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                 │
│  │       🦅 hawk-recall       │  ← 在首次回复前              │
│  │    (before first response)  │     向 Agent 上下文          │
│  └─────────────────────────────┘     注入相关记忆              │
│                   ↓                                                │
│  ┌─────────────────────────────────────────┐                 │
│  │              LanceDB                      │                 │
│  │   向量搜索 + BM25 + RRF 融合              │                 │
│  └─────────────────────────────────────────┘                 │
│                   ↓                                                │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← 提取 / 评分 / 衰减     │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 一键安装

```bash
# 远程安装（推荐 — 一行命令，全自动）
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# 然后激活插件：
openclaw plugins install /tmp/hawk-bridge
```

安装脚本自动完成：

| 步骤 | 内容 |
|------|------|
| 1 | 检测并安装 Node.js、Python3、git、curl |
| 2 | 安装 npm 依赖（lancedb、openai） |
| 3 | 安装 Python 包（lancedb、rank-bm25、sentence-transformers） |
| 4 | 克隆 `context-hawk` 到 `~/.openclaw/workspace/context-hawk` |
| 5 | 创建 `~/.openclaw/hawk` 符号链接 |
| 6 | 安装 **Ollama**（若不存在） |
| 7 | 下载 `nomic-embed-text` 向量模型 |
| 8 | 构建 TypeScript Hooks + 初始化种子记忆 |

**支持的发行版**：Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

---

## 🔧 配置

安装完成后，通过环境变量选择向量模式：

```bash
# ① Ollama 本地（推荐，完全免费，支持 GPU）
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU 本地（完全免费，无需 GPU，约 90MB 模型）
export USE_LOCAL_EMBEDDING=1

# ③ Jina AI 免费额度（需从 jina.ai 申请免费 Key）
export JINA_API_KEY=你的免费key

# ④ 无配置 → BM25-only 模式（默认，关键词检索，无需任何依赖）
```

### openclaw.json

```json
{
  "plugins": {
    "load": {
      "paths": ["/tmp/hawk-bridge"]
    },
    "allow": ["hawk-bridge"]
  }
}
```

> API Key 不写在配置文件里，全部通过环境变量管理。

---

## 📊 向量模式对比

| 模式 | Provider | API Key | 质量 | 速度 |
|------|----------|---------|------|------|
| **BM25-only** | 内置 | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | 本地 CPU | ❌ | ⭐⭐⭐ | ⚡⚡ |
| **Ollama** | 本地 GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | 云端 | ✅ 免费 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Minimax** | 云端 | ✅ | ⭐⭐⭐⭐⭐ | ⚡⚡⚡⚡⚡ |

**默认**：BM25-only — 零配置即可运行。

---

## 🔄 降级逻辑

```
有 OLLAMA_BASE_URL？      → 全量混合：向量 + BM25 + RRF
有 USE_LOCAL_EMBEDDING=1？→ sentence-transformers + BM25 + RRF
有 JINA_API_KEY？         → Jina 向量 + BM25 + RRF
有 MINIMAX_API_KEY？     → Minimax 向量 + BM25 + RRF
什么都没配置？             → BM25-only（纯关键词，无 API 调用）
```

没有 API Key 不会报错 — 自动降级到当前可用的最佳模式。

---

## 🌱 种子记忆

首次安装时自动写入 11 条基础记忆：

- 团队成员结构（main/wukong/bajie/bailong/tseng 角色）
- 协作规范（GitHub inbox → done 工作流）
- 项目背景（hawk-bridge、qujingskills、gql-openclaw）
- 沟通偏好
- 执行原则

这些记忆确保 hawk-recall 从第一天起就有内容可注入。

---

## 📁 目录结构

```
hawk-bridge/
├── README.md
├── README.zh-CN.md
├── LICENSE
├── install.sh                   # 一键安装脚本（curl | bash）
├── package.json
├── openclaw.plugin.json          # 插件清单 + configSchema
├── src/
│   ├── index.ts              # 插件入口
│   ├── config.ts             # 读取 openclaw 配置 + 环境变量检测
│   ├── lancedb.ts           # LanceDB 封装
│   ├── embeddings.ts           # 5 种向量 Provider
│   ├── retriever.ts           # 混合检索（BM25 + 向量 + RRF）
│   ├── seed.ts               # 种子记忆初始化器
│   └── hooks/
│       ├── hawk-recall/      # agent:bootstrap Hook
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # message:sent Hook
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk（由 install.sh 克隆）
```

---

## 🔌 技术规格

| | |
|---|---|
| **运行时** | Node.js 18+ (ESM)、Python 3.12+ |
| **向量数据库** | LanceDB（本地、无服务器） |
| **检索方式** | BM25 + ANN 向量搜索 + RRF 融合 |
| **向量生成** | Ollama / sentence-transformers / Jina AI / OpenAI / Minimax |
| **Hook 事件** | `agent:bootstrap`（召回）、`message:sent`（捕获） |
| **依赖** | 零硬依赖 — 全部可选，自动降级 |
| **持久化** | 本地文件系统，无需外部数据库 |
| **许可证** | MIT |

---

## 🤝 与 context-hawk 的关系

| | hawk-bridge | context-hawk |
|---|---|---|
| **角色** | OpenClaw Hook 桥接器 | Python 记忆库 |
| **职责** | 触发 Hook、管理生命周期 | 记忆提取、评分、衰减 |
| **接口** | TypeScript Hooks → LanceDB | Python `MemoryManager`、`VectorRetriever` |
| **安装方式** | npm 包、系统依赖 | 克隆到 `~/.openclaw/workspace/` |

**两者协同**：hawk-bridge 决定"*何时*行动"，context-hawk 负责"*如何*执行"。

---

## 📖 相关项目

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python 记忆库
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — 团队协作工作区
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Laravel 开发规范

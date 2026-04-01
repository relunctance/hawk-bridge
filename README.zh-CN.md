# 🦅 hawk-bridge

> **OpenClaw Hook 桥接器 → hawk Python 记忆系统**
>
> *给任意 AI Agent 装上记忆 — autoCapture（自动提取）+ autoRecall（自动注入），零手动操作*

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw 兼容](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

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

### 方式四 — OpenClaw 图形界面
1. 打开 OpenClaw 面板 → Skills → 浏览
2. 搜索 "hawk-bridge"
3. 点击安装
> ✅ 无需命令行

---

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

### 各系统快速开始

| 发行版 | 安装命令 |
|--------|---------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> 所有发行版使用同一命令，安装脚本自动检测系统并选择正确的包管理器。

---

## 🔧 各系统手动安装

如果你不想用一键脚本，可以手动逐步安装：

### Ubuntu / Debian

```bash
# 1. 系统依赖
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. 系统依赖
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. 系统依赖
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. 系统依赖
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. 系统依赖
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. 安装 Homebrew（如果没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 系统依赖
brew install node python git curl

# 3. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama（可选）
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + 构建
npm install && npm run build

# 8. 初始化种子记忆
node dist/seed.js

# 9. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

> **注意**：Linux 上需要 `--break-system-packages` 来绕过 PEP 668（禁止系统 Python 安装包）。macOS 不需要此参数。Ollama 安装脚本在 macOS 上会自动使用 Homebrew。

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
# ⚠️ 中国大陆需要代理：设置 HTTP/SOCKS 代理
export HTTPS_PROXY=http://你的代理地址:端口

# ④ 无配置 → BM25-only 模式（默认，关键词检索，无需任何依赖）
```

### 🔑 获取免费 Jina API Key（推荐）

Jina AI 提供**免费额度**，足够个人使用，无需信用卡：

1. **注册账号**：访问 https://jina.ai/（支持 GitHub 登录）
2. **获取 Key**：进入 https://jina.ai/settings/ → API Keys → Create API Key
3. **复制 Key**：以 `jina_` 开头的字符串
4. **配置**

> ⚠️ **重要：中国大陆需要代理才能访问 Jina API（api.jina.ai 被墙）。** 设置 `HTTPS_PROXY` 为你的代理地址（如 `http://192.168.1.109:10808`）。

### ~/.hawk/config.json（推荐配置方式）

推荐创建 `~/.hawk/config.json`：

```json
{
  "openai_api_key": "jina_你的KEY",
  "embedding_model": "jina-embeddings-v3",
  "embedding_dimensions": 1024,
  "base_url": "https://api.jina.ai/v1",
  "proxy": "http://你的代理地址:端口"
}
```

| 字段 | 说明 |
|------|------|
| `openai_api_key` | 你的 Jina API Key（以 `jina_` 开头） |
| `embedding_model` | 模型名：`jina-embeddings-v3`（推荐） |
| `embedding_dimensions` | 向量维度：1024（jina-embeddings-v3） |
| `base_url` | 固定填 `https://api.jina.ai/v1` |
| `proxy` | HTTP 代理地址（**中国大陆必填**） |

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

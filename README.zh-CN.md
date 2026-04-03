# 🦅 hawk-bridge

> **你的 OpenClaw 还在当"金鱼"？**
>
> Session 结束就忘、跨 Agent 就失忆、Context 爆了 Token 烧光——
> hawk-bridge 给 AI 装上持久记忆，autoCapture + autoRecall，零手动，帮你省 Token 省钱。

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

## ❌ 没有 vs ✅ 有 hawk-bridge

| 场景 | ❌ 没有 hawk-bridge | ✅ 有 hawk-bridge |
|----------|------------------------|---------------------|
| **新 session 开始** | 空白 — 对你一无所知 | ✅ 自动注入相关记忆 |
| **用户重复偏好** | "我跟你说过了..." | 从 session 1 就记住 |
| **长任务持续数天** | 重启 = 从头开始 | 任务状态持久化，无缝衔接 |
| **上下文变大** | Token 费用飙升，💸 | 5 种压缩策略保持精简 |
| **重复信息** | 同一事实存了 10 份 | SimHash 去重 — 只存一份 |
| **记忆召回** | 全部相似、重复注入 | MMR 多样性召回 — 不重复 |
| **记忆管理** | 一切永远堆积 | 4 层衰减 — 噪音消散，信号保留 |
| **自我改进** | 重复同样的错误 | importance + access_count 追踪 → 智能升级 |
| **多 Agent 团队** | 每个 Agent 从零开始，无共享上下文 | 共享 LanceDB — 所有 Agent 互相学习 |

---

## 🦅 解决了什么问题？

**没有它：** AI Agent 会遗忘一切——跨 Session 忘，跨 Agent 也忘，Token 费用还失控。

**有了它：** 持久化记忆 + 共享上下文 + 节省 Token。

### hawk-bridge 解决的痛点

| 痛点 | ❌ 没有 | ✅ 有 hawk-bridge |
|------|--------|-----------------|
| **Session 结束就忘** | ❌ 新 Session 从零开始 | ✅ 跨 Session 记忆注入 |
| **团队信息孤岛** | ❌ 每个 Agent 各自为战 | ✅ 共享 LanceDB，全员可读 |
| **多 Agent 重复犯错** | ❌ Agent A 不知道 Agent B 的决策 | ✅ 记忆共享，不重蹈覆辙 |
| **LLM 费用失控** | ❌ 无限制 Context 膨胀，<span style="color:red">**token太烧钱**</span> | ✅ 压缩 + 去重 + MMR，Context 变小 |
| **Context 溢出 / 爆 Token** | ❌ Session 历史无限堆积直到崩溃 | ✅ 自动裁剪 + 4 层衰减 |
| **重要决策被遗忘** | ❌ 只存在旧 Session 里，永远丢失 | ✅ 带 importance 存 LanceDB |
| **重复记忆堆积** | ❌ 同样内容存了 N 份 | ✅ SimHash 去重，64位指纹 |
| **召回重复啰嗦** | ❌ "说说 X" → 注入 5 条相似记忆 | ✅ MMR 多样性，不重复 |
| **记忆不会自我改进** | ❌ 不会越用越好 | ✅ importance + access_count 智能升级 |

### hawk-bridge 解决 5 个核心问题

**问题1：Session 有上下文窗口限制**
Context 有 Token 上限（比如 32k）。Session 历史太长会挤掉其他重要内容。
→ hawk-bridge 帮你压缩/归档，只注入最相关的。

**问题2：AI 跨 Session 就忘**
Session 结束，Context 消失。下次对话：AI 完全不记得上次说了什么。
→ hawk-recall 每次启动前从 LanceDB 注入相关记忆。

**问题3：多 Agent 之间信息不共享**
Agent A 不知道 Agent B 做了什么决策，各自从头开始。
→ 共享 LanceDB：所有 Agent 读写同一个记忆库，打破信息孤岛。

**问题4：发送给 LLM 前 Context 太大太冗余**
召回没优化的话，Context 里一堆重复相似内容，浪费 token。
→ 经过压缩 + SimHash 去重 + MMR 多样性召回后，发送给 LLM 的 Context **体积大幅缩小**，节省 token 消耗。

**问题5：记忆不会自动管理**
没有 hawk-bridge：所有消息都堆在 Session 里，越积越多，最后 Context 溢出。
→ hawk-capture 自动提取重要信息 → 存 LanceDB。不重要的自动 delete，重要的 promote 到 long 层。

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
3. 老旧记忆 → 通过 4 层衰减自动管理（Working → Short → Long → Archive）
4. 重复记忆 → SimHash 去重，避免浪费存储
5. 冗余召回 → MMR 确保多样、不重复的注入

---

## ✨ 核心功能

| # | 功能 | 说明 |
|---|---------|-------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk 自动提取 6 类记忆 |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk 在首次回复前注入相关记忆 |
| 3 | **混合检索** | BM25 + 向量搜索 + RRF 融合，零 API Key 也能跑 |
| 4 | **零配置降级** | BM25-only 模式开箱即用，无需任何 API Key |
| 5 | **4 种向量 Provider** | sentence-transformers（默认，CPU本地）/ Ollama（本地GPU）/ Jina AI（免费API）/ OpenAI |
| 6 | **优雅降级** | API Key 不可用时自动切换到备用方案 |
| 7 | **无 Embedder 时仍可检索** | 直接用 BM25 分数作为排序依据 |
| 8 | **种子记忆** | 预置团队结构、规范、项目背景等 11 条初始记忆 |
| 9 | **亚毫秒级召回** | LanceDB ANN 索引，瞬时检索 |
| 10 | **跨平台安装** | 一条命令，Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE 通用 |
| 11 | **SimHash 自动去重** | 64位指纹去重，防止重复记忆占用空间 |
| 12 | **MMR 多样性召回** | 最大边缘相关性，既相关又多样，缩小 Context 体积 |

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

<details>
<summary><b>Ubuntu / Debian</b></summary>

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

</details>

<details>
<summary><b>Fedora / RHEL / CentOS / Rocky / AlmaLinux</b></summary>

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

</details>

<details>
<summary><b>Arch / Manjaro / EndeavourOS</b></summary>

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

</details>

<details>
<summary><b>Alpine</b></summary>

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

</details>

<details>
<summary><b>openSUSE / SUSE Linux Enterprise</b></summary>

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

</details>

<details>
<summary><b>macOS</b></summary>

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

</details>

> **注意**：Linux 上需要 `--break-system-packages` 来绕过 PEP 668（禁止系统 Python 安装包）。macOS 不需要此参数。Ollama 安装脚本在 macOS 上会自动使用 Homebrew。

---

## 🔧 配置

安装完成后，通过环境变量选择向量模式：

```bash
# ① 默认：Qianwen 阿里云百炼（无需 API Key 开箱即用）
# 免费额度充足，国内访问稳定：
export QWEN_API_KEY=你的阿里云API_KEY

# ② Ollama 本地 GPU（推荐，完全免费）
export OLLAMA_BASE_URL=http://localhost:11434

# ③ Jina AI 免费额度（需从 jina.ai 申请免费 Key）
export JINA_API_KEY=你的免费key
# ⚠️ 中国大陆需要代理：设置 HTTP/SOCKS 代理
export HTTPS_PROXY=http://你的代理地址:端口

# ④ OpenAI（付费，高质量）
export OPENAI_API_KEY=sk-...

# ⑤ 无配置 → BM25-only 模式（纯关键词检索，无需任何依赖）
```

### 🔑 获取 Qianwen API Key（国内首选）

阿里云百炼提供免费额度，新用户有赠券：

1. **注册/登录**：https://dashscope.console.aliyun.com/（可用阿里云账号）
2. **开通服务**：搜索"百炼" → 文本嵌入 → 开通
3. **获取 Key**：https://dashscope.console.aliyun.com/apiKey → 创建 API-KEY
4. **配置**:
```bash
export QWEN_API_KEY=sk-xxxxxxxxxxxxxxxx
```

### 🔑 获取免费 Jina API Key

Jina AI 提供**免费额度**，足够个人使用，无需信用卡：

1. **注册账号**：访问 https://jina.ai/（支持 GitHub 登录）
2. **获取 Key**：进入 https://jina.ai/settings/ → API Keys → Create API Key
3. **复制 Key**：以 `jina_` 开头的字符串

> ⚠️ **重要：中国大陆需要代理才能访问 Jina API（api.jina.ai 被墙）。** 设置 `HTTPS_PROXY` 为你的代理地址。

### ~/.hawk/config.json

```json
{
  "openai_api_key": "YOUR_API_KEY",
  "embedding_model": "text-embedding-v1",
  "embedding_dimensions": 1024,
  "base_url": "https://dashscope.aliyuncs.com/api/v1"
}
```

| Provider | 环境变量 | 说明 |
|---------|---------|------|
| Qianwen | `QWEN_API_KEY` | 阿里云百炼 API Key，免费额度，国内首选 |
| Jina | `JINA_API_KEY` | Jina API Key，以 `jina_` 开头 |
| Ollama | `OLLAMA_BASE_URL` | 如 `http://localhost:11434` |
| OpenAI | `OPENAI_API_KEY` | OpenAI API Key |
| Generic | `base_url` + `apiKey` | 任意 OpenAI 兼容端点 |

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

| 模式 | Provider | API Key | 质量 | 速度 | 国内访问 |
|------|----------|---------|------|------|---------|
| **BM25-only** | 内置 | ❌ | ⭐⭐ | ⚡⚡⚡ | ✅ |
| **Ollama** | 本地 GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ | ✅ |
| **Qianwen** | 阿里云百炼 | ✅ 免费额度 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ | ✅ 首选 |
| **Jina AI** | 云端 | ✅ 免费 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ | ⚠️ 需代理 |
| **OpenAI** | 云端 | ✅ 付费 | ⭐⭐⭐⭐⭐ | ⚡⚡⚡⚡⚡ | ⚠️ 需代理 |

**默认**：Qianwen 阿里云 — 开箱即用，国内访问稳定。

---

## 🔄 降级逻辑

```
有 OLLAMA_BASE_URL？        → Ollama 向量 + BM25 + RRF
有 QWEN_API_KEY？          → Qianwen（阿里云百炼）+ BM25 + RRF
有 JINA_API_KEY？          → Jina 向量 + BM25 + RRF
有 OPENAI_API_KEY？        → OpenAI 向量 + BM25 + RRF
有 COHERE_API_KEY？        → Cohere 向量 + BM25 + RRF
什么都没配置？              → BM25-only（纯关键词，无 API 调用）
```

没有 API Key 不会报错 — 自动降级到当前可用的最佳模式。


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
│   ├── embeddings.ts           # 6 种向量 Provider（Qianwen/Ollama/Jina/Cohere/OpenAI/OpenAI-Compatible）
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

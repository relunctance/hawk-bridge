# 🦅 hawk-bridge

> **OpenClaw Hook 橋接器 → hawk Python 記憶系統**
>
> *給任意 AI Agent 裝上記憶 — autoCapture（自動提取）+ autoRecall（自動注入），零手動操作*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## 它做什麼？

AI Agent 每次會話結束就會遺忘一切。**hawk-bridge** 將 OpenClaw 的 Hook 系統與 hawk 的 Python 記憶系統橋接，讓 Agent 擁有持久化、自我改進的記憶：

- **每次回覆** → hawk 自動擷取並存入有意義的內容
- **每次新會話** → hawk 在思考前自動注入相關記憶
- **零手動操作** — 開箱即用，自動運行

**沒有 hawk-bridge：**
> 用戶：「我喜歡簡潔的回覆，不要長段落」
> Agent：「好的！」 ✅
> （下一個 session — 又忘了）

**有 hawk-bridge：**
> 用戶：「我喜歡簡潔的回覆」
> Agent：自動存入 `preference:communication` ✅
> （下一個 session — 自動注入，立即生效）

---

## ❌ Without vs ✅ With hawk-bridge (TODO: translate)

| Scenario | ❌ Without hawk-bridge | ✅ With hawk-bridge |
|----------|------------------------|---------------------|
| **New session starts** | Blank — knows nothing about you | ✅ Injects relevant memories automatically |
| **User repeats a preference** | "I told you before..." | Remembers from session 1 |
| **Long task runs for days** | Restart = start over | Task state persists, resumes seamlessly |
| **Context gets large** | Token bill skyrockets, 💸 | 5 compression strategies keep it lean |
| **Duplicate info** | Same fact stored 10 times | SimHash dedup — stored once |
| **Memory recall** | All similar, redundant injection | MMR diverse recall — no repetition |
| **Memory management** | Everything piles up forever | 4-tier decay — noise fades, signal stays |
| **Self-improvement** | Repeats the same mistakes | importance + access_count tracking → smart promotion |
| **Multi-agent team** | Each agent starts fresh, no shared context | Shared LanceDB — all agents learn from each other |


## ✨ 核心功能

| # | 功能 | 說明 |
|---|---------|-------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk 自動擷取 6 類記憶 |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk 在首次回覆前注入相關記憶 |
| 3 | **混合檢索** | BM25 + 向量搜尋 + RRF 融合，零 API Key 也能跑 |
| 4 | **零配置降級** | BM25-only 模式開箱即用，無需任何 API Key |
| 5 | **4 種向量 Provider** | Ollama（本地）/ sentence-transformers（CPU）/ Jina AI（免費API）/ OpenAI |
| 6 | **優雅降級** | API Key 不可用時自動切換到備用方案 |
| 7 | **無 Embedder 時仍可檢索** | 直接用 BM25 分數作為排序依據 |
| 8 | **種子記憶** | 預置團隊結構、規範、專案背景等 11 條初始記憶 |
| 9 | **亞毫秒級召回** | LanceDB ANN 索引，瞬時檢索 |
| 10 | **跨平台安裝** | 一條命令，Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE 通用 |

---

## 🏗️ 架構

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← 在首次回覆前              │
│  │    (before first response)  │     向 Agent 上下文            │
│  └─────────────────────────────┘     注入相關記憶              │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   向量搜尋 + BM25 + RRF 融合              │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← 擷取 / 評分 / 衰減       │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 一鍵安裝

```bash
# 遠端安裝（推薦 — 一行命令，全自動）
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# 然後啟動插件：
openclaw plugins install /tmp/hawk-bridge
```

安裝腳本自動完成：

| 步驟 | 內容 |
|------|------|
| 1 | 偵測並安裝 Node.js、Python3、git、curl |
| 2 | 安裝 npm 依賴（lancedb、openai） |
| 3 | 安裝 Python 套件（lancedb、rank-bm25、sentence-transformers） |
| 4 | 克隆 `context-hawk` 到 `~/.openclaw/workspace/context-hawk` |
| 5 | 建立 `~/.openclaw/hawk` 符號連結 |
| 6 | 安裝 **Ollama**（若不存在） |
| 7 | 下載 `nomic-embed-text` 向量模型 |
| 8 | 建構 TypeScript Hooks + 初始化種子記憶 |

**支援的發行版**：Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### 各系統快速開始

| 發行版 | 安裝命令 |
|--------|---------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> 所有發行版使用同一命令，安裝腳本自動偵測系統並選擇正確的套件管理員。

---

## 🔧 各系統手動安裝

如果你不想用一鍵腳本，可以手動逐步安裝：

### Ubuntu / Debian

```bash
# 1. 系統依賴
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. 克隆倉庫
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依賴
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可選）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 建構
npm install && npm run build

# 7. 初始化種子記憶
node dist/seed.js

# 8. 啟動插件
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. 系統依賴
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. 克隆倉庫
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依賴
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可選）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 建構
npm install && npm run build

# 7. 初始化種子記憶
node dist/seed.js

# 8. 啟動插件
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. 系統依賴
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. 克隆倉庫
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依賴
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可選）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 建構
npm install && npm run build

# 7. 初始化種子記憶
node dist/seed.js

# 8. 啟動插件
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. 系統依賴
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. 克隆倉庫
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依賴
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可選）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 建構
npm install && npm run build

# 7. 初始化種子記憶
node dist/seed.js

# 8. 啟動插件
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. 系統依賴
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. 克隆倉庫
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依賴
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可選）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 建構
npm install && npm run build

# 7. 初始化種子記憶
node dist/seed.js

# 8. 啟動插件
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. 安裝 Homebrew（如果沒有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 系統依賴
brew install node python git curl

# 3. 克隆倉庫
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Python 依賴
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama（可選）
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + 建構
npm install && npm run build

# 8. 初始化種子記憶
node dist/seed.js

# 9. 啟動插件
openclaw plugins install /tmp/hawk-bridge
```

> **注意**：Linux 上需要 `--break-system-packages` 來繞過 PEP 668（禁止系統 Python 安裝套件）。macOS 不需要此參數。Ollama 安裝腳本在 macOS 上會自動使用 Homebrew。

---

## 🔧 配置

安裝完成後，透過環境變數選擇向量模式：

```bash
# ① Ollama 本地（推薦，完全免費，支援 GPU）
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU 本地（完全免費，無需 GPU，約 90MB 模型）

# ③ Jina AI 免費額度（需從 jina.ai 申請免費 Key）
export JINA_API_KEY=你的免費key

# ④ 無配置 → BM25-only 模式（預設，關鍵詞檢索，無需任何依賴）
```

### 🔑 取得免費 Jina API Key（推薦）

Jina AI 提供**免費額度**，足夠個人使用，無需信用卡：

1. **註冊帳號**：造訪 https://jina.ai/（支援 GitHub 登入）
2. **取得 Key**：進入 https://jina.ai/settings/ → API Keys → Create API Key
3. **複製 Key**：以 `jina_` 開頭的字串
4. **設定**：
```bash
export JINA_API_KEY=jina_你的KEY
```

> **為什麼用 Jina？** 免費額度大（每月 100 萬 tokens），品質好，OpenAI 相容格式，設定最簡單。

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

> API Key 不寫在設定檔裡，全部透過環境變數管理。

---

## 📊 向量模式對比

| 模式 | Provider | API Key | 品質 | 速度 |
|------|----------|---------|------|------|
| **BM25-only** | 內建 | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | 本地 CPU | ❌ | ⭐⭐⭐ | ⚡⚡ |
| **Ollama** | 本地 GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | 雲端 | ✅ 免費 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**預設**：BM25-only — 零設定即可執行。

---

## 🔄 降級邏輯

```
有 OLLAMA_BASE_URL？      → 全量混合：向量 + BM25 + RRF
有 JINA_API_KEY？         → Jina 向量 + BM25 + RRF
什麼都沒配置？             → BM25-only（純關鍵詞，無 API 呼叫）
```

沒有 API Key 不會報錯 — 自動降級到當前可用的最佳模式。

---

## 🌱 種子記憶

首次安裝時自動寫入 11 條基礎記憶：

- 團隊成員結構（main/wukong/bajie/bailong/tseng 角色）
- 協作規範（GitHub inbox → done 工作流程）
- 專案背景（hawk-bridge、qujingskills、gql-openclaw）
- 溝通偏好
- 執行原則

這些記憶確保 hawk-recall 從第一天起就有內容可注入。

---

## 📁 目錄結構

```
hawk-bridge/
├── README.md
├── README.zh-CN.md
├── LICENSE
├── install.sh                   # 一鍵安裝腳本（curl | bash）
├── package.json
├── openclaw.plugin.json          # 插件清單 + configSchema
├── src/
│   ├── index.ts              # 插件入口
│   ├── config.ts             # 讀取 openclaw 設定 + 環境變數偵測
│   ├── lancedb.ts           # LanceDB 封裝
│   ├── embeddings.ts           # 5 種向量 Provider
│   ├── retriever.ts           # 混合檢索（BM25 + 向量 + RRF）
│   ├── seed.ts               # 種子記憶初始化器
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

## 🔌 技術規格

| | |
|---|---|
| **執行環境** | Node.js 18+ (ESM)、Python 3.12+ |
| **向量資料庫** | LanceDB（本地、無伺服器） |
| **檢索方式** | BM25 + ANN 向量搜尋 + RRF 融合 |
| **Hook 事件** | `agent:bootstrap`（召回）、`message:sent`（捕獲） |
| **依賴** | 零硬依賴 — 全部可選，自動降級 |
| **持久化** | 本地檔案系統，無需外部資料庫 |
| **授權** | MIT |

---

## 🤝 與 context-hawk 的關係

| | hawk-bridge | context-hawk |
|---|---|---|
| **角色** | OpenClaw Hook 橋接器 | Python 記憶庫 |
| **職責** | 觸發 Hook、管理生命週期 | 記憶擷取、評分、衰減 |
| **介面** | TypeScript Hooks → LanceDB | Python `MemoryManager`、`VectorRetriever` |
| **安裝方式** | npm 套件、系統依賴 | 克隆到 `~/.openclaw/workspace/` |

**兩者協同**：hawk-bridge 決定「何時」行動，context-hawk 負責「如何」執行。

---

## 📖 相關專案

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python 記憶庫
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — 團隊協作工作區
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Laravel 開發規範

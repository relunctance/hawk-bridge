# 🦅 hawk-bridge

> **OpenClaw Hook Bridge → hawk Python Memory System**
>
> *给任意 AI Agent 装上记忆 — autoCapture（自动提取）+ autoRecall（自动注入），零手动操作*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)** |

---

## What does it do?

AI agents forget everything after each session. **hawk-bridge** bridges OpenClaw's hook system with hawk's Python memory, giving agents a persistent, self-improving memory that works automatically:

- **Every response** → hawk extracts and stores meaningful memories
- **Every new session** → hawk injects relevant memories before thinking begins
- **No manual operation** — it just works

**Without hawk-bridge:**
> User: "I prefer concise replies, not paragraphs"
> Agent: "Sure thing!" ✅
> (next session — agent forgets again)

**With hawk-bridge:**
> User: "I prefer concise replies"
> Agent: stored as `preference:communication` ✅
> (next session — injected automatically, applies immediately)

---

## ✨ Core Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk extracts 6 categories of memories automatically |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk injects relevant memories before first response |
| 3 | **Hybrid Retrieval** | BM25 + vector search + RRF fusion — no API key required for baseline |
| 4 | **Zero-Config Fallback** | Works out-of-the-box in BM25-only mode, no API keys needed |
| 5 | **4 Embedding Providers** | Ollama (local) / sentence-transformers (CPU) / Jina AI (free API) / OpenAI |
| 6 | **Graceful Degradation** | Automatically falls back when API keys are unavailable |
| 7 | **Context-Aware Injection** | BM25 rank score used directly when no embedder available |
| 8 | **Seed Memory** | Pre-populated with generic AI agent team concepts — customize after install |
| 9 | **Sub-100ms Recall** | LanceDB ANN index for instant retrieval |
| 10 | **Cross-Platform Install** | One command, works on Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                             │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                               │
│         ↓         │         ↓                                   │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← Injects relevant memories  │
│  │    (before first response)  │     into agent context       │
│  └─────────────────────────────┘                                │
│                   ↓                                               │
│  ┌─────────────────────────────────────────────┐                │
│  │              LanceDB                         │                │
│  │   Vector search + BM25 + RRF fusion          │                │
│  └─────────────────────────────────────────────┘                │
│                   ↓                                               │
│         ┌───────────────────────┐                                │
│         │  context-hawk (Python) │  ← Extraction / scoring     │
│         │  MemoryManager + Extractor │   / decay               │
│         └───────────────────────┘                                │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 One-Command Install

Choose the method that works best for you:

### Option A — ClawHub (Recommended)
```bash
# Most convenient — one command
clawhub install hawk-bridge
# or via OpenClaw
openclaw skills install hawk-bridge
```
> ✅ Auto-updates, easy to manage, no manual setup

### Option B — Clone & Install Script
```bash
# Downloads and runs the install script automatically
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)
```
> ✅ Works on all Linux distros, fully automatic

### Option C — Manual Install
```bash
git clone https://github.com/relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge
npm install && npm run build
# Then add to openclaw.json:
openclaw plugins install /tmp/hawk-bridge
```
> ✅ Full control, for advanced users

### Option D — OpenClaw UI
1. Open OpenClaw dashboard → Skills → Browse
2. Search for "hawk-bridge"
3. Click Install
> ✅ No command line needed

---

That's it. The installer handles:

| Step | What it does |
|------|-------------|
| 1 | Detects and installs Node.js, Python3, git, curl |
| 2 | Installs npm dependencies (lancedb, openai) |
| 3 | Installs Python packages (lancedb, rank-bm25, sentence-transformers) |
| 4 | Clones `context-hawk` workspace into `~/.openclaw/workspace/context-hawk` |
| 5 | Creates `~/.openclaw/hawk` symlink |
| 6 | Installs **Ollama** (if not present) |
| 7 | Pulls `nomic-embed-text` embedding model |
| 8 | Builds TypeScript hooks and seeds initial memories |

**Supported distros**: Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

## 🔧 Manual Install (per Distro)

If you prefer to install manually instead of using the one-command script:

<details>
<summary><b>Ubuntu / Debian</b></summary>

```bash
# 1. System deps
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>Fedora / RHEL / CentOS / Rocky / AlmaLinux</b></summary>

```bash
# 1. System deps
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>Arch / Manjaro / EndeavourOS</b></summary>

```bash
# 1. System deps
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>Alpine</b></summary>

```bash
# 1. System deps
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>openSUSE / SUSE Linux Enterprise</b></summary>

```bash
# 1. System deps
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. System deps
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. System deps
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. System deps
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. System deps
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memory
node dist/seed.js

# 8. Activate
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>macOS</b></summary>

```bash
# 1. Install Homebrew (if not present)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. System deps
brew install node python git curl

# 3. Clone repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Python deps
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama (optional)
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + build
npm install && npm run build

# 8. Seed memory
node dist/seed.js

# 9. Activate
openclaw plugins install /tmp/hawk-bridge
```

</details>

> **Note**: `pip install --break-system-packages` is required on Linux to bypass PEP 668. Ollama install script auto-detects macOS and uses Homebrew if available.

---

## 🔧 Configuration

After install, choose your embedding mode — all via environment variables:

```bash
# ① Default: sentence-transformers (local CPU, no API key needed — works out of the box)
# No environment variables needed!

# ② Ollama local GPU (recommended for quality — free, no API key)
export OLLAMA_BASE_URL=http://localhost:11434

# ③ Jina AI free tier (requires free API key from jina.ai)
export JINA_API_KEY=your_free_key
# ⚠️ Proxy required in China: set HTTP/SOCKS proxy below
export HTTPS_PROXY=http://YOUR_PROXY_HOST:PORT

# ④ BM25-only fallback (no embedding needed — keyword search only)
# No environment variables needed
```

### 🔑 Get Your Free Jina API Key (Recommended)

Jina AI offers a **generous free tier** — no credit card required:

1. **Register** at https://jina.ai/ (GitHub login supported)
2. **Get Key**: Go to https://jina.ai/settings/ → API Keys → Create API Key
3. **Copy Key**: starts with `jina_`
4. **Configure**:

> ⚠️ **Important: Jina AI requires a proxy in China (api.jina.ai is blocked).** Set `HTTPS_PROXY` to your proxy URL (e.g. `http://192.168.1.109:10808`).

### ~/.hawk/config.json (Recommended for Jina)

For best results with Jina, create `~/.hawk/config.json`:

```json
{
  "openai_api_key": "jina_YOUR_KEY_HERE",
  "embedding_model": "jina-embeddings-v3",
  "embedding_dimensions": 1024,
  "base_url": "https://api.jina.ai/v1",
  "proxy": "http://YOUR_PROXY_HOST:PORT"
}
```

| Field | Description |
|-------|-------------|
| `openai_api_key` | Your Jina API key (starts with `jina_`) |
| `embedding_model` | Model name: `jina-embeddings-v3` (recommended) |
| `embedding_dimensions` | Vector size: 1024 for jina-embeddings-v3 |
| `base_url` | Must be `https://api.jina.ai/v1` |
| `proxy` | HTTP proxy URL (required in China) |

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

No API keys in config files — environment variables only.

---

## 📊 Retrieval Modes

| Mode | Provider | API Key | Quality | Speed |
|------|----------|---------|---------|-------|
| **BM25-only** | Built-in | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | Local CPU | ❌ | ⭐⭐⭐ | ⚡⚡ |
| **Ollama** | Local GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | Cloud | ✅ free | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Minimax** | Cloud | ✅ | ⭐⭐⭐⭐⭐ | ⚡⚡⚡⚡⚡ |

**Default**: BM25-only — works immediately with zero configuration.

---

## 🔄 Degradation Logic

```
Has OLLAMA_BASE_URL?       → Full hybrid: vector + BM25 + RRF
Has USE_LOCAL_EMBEDDING=1? → sentence-transformers + BM25 + RRF
Has JINA_API_KEY?          → Jina embeddings + BM25 + RRF
Has MINIMAX_API_KEY?      → Minimax embeddings + BM25 + RRF
Nothing configured?        → BM25-only (pure keyword, no API calls)
```

No API key = no crash = graceful degradation.

---

## 🌱 Seed Memory

On first install, 11 foundational memories are seeded automatically:

- Team structure (main/wukong/bajie/bailong/tseng roles)
- Collaboration norms (GitHub inbox → done workflow)
- Project context (hawk-bridge, qujingskills, gql-openclaw)
- Communication preferences
- Operating principles

These ensure hawk-recall has something to inject from day one.

---

## 📁 File Structure

```
hawk-bridge/
├── README.md
├── LICENSE
├── install.sh                   # One-command installer (curl | bash)
├── package.json
├── openclaw.plugin.json         # Plugin manifest + configSchema
├── src/
│   ├── index.ts               # Plugin entry point
│   ├── config.ts              # OpenClaw config reader + env detection
│   ├── lancedb.ts             # LanceDB wrapper
│   ├── embeddings.ts           # 5 embedding providers
│   ├── retriever.ts            # Hybrid search (BM25 + vector + RRF)
│   ├── seed.ts                # Seed memory initializer
│   └── hooks/
│       ├── hawk-recall/       # agent:bootstrap hook
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/      # message:sent hook
│           ├── handler.ts
│           └── HOOK.md
└── python/                    # context-hawk (installed by install.sh)
```

---

## 🔌 Tech Specs

| | |
|---|---|
| **Runtime** | Node.js 18+ (ESM), Python 3.12+ |
| **Vector DB** | LanceDB (local, serverless) |
| **Retrieval** | BM25 + ANN vector search + RRF fusion |
| **Embedding** | Ollama / sentence-transformers / Jina AI / OpenAI / Minimax |
| **Hook Events** | `agent:bootstrap` (recall), `message:sent` (capture) |
| **Dependencies** | Zero hard dependencies — all optional with auto-fallback |
| **Persistence** | Local filesystem, no external DB required |
| **License** | MIT |

---

## 🤝 Relationship with context-hawk

| | hawk-bridge | context-hawk |
|---|---|---|
| **Role** | OpenClaw hook bridge | Python memory library |
| **What it does** | Triggers hooks, manages lifecycle | Memory extraction, scoring, decay |
| **Interface** | TypeScript hooks → LanceDB | Python `MemoryManager`, `VectorRetriever` |
| **Installs** | npm packages, system deps | Cloned into `~/.openclaw/workspace/` |

**They work together**: hawk-bridge decides *when* to act, context-hawk handles *how*.

---

## 📖 Related

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python memory library
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — Team collaboration workspace
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Laravel development standards

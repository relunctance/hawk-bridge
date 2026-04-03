# 🦅 hawk-bridge

> **Your OpenClaw still has "goldfish memory"?**
>
> Session ends → forgets everything. Cross-agent → memory lost. Context explodes → 💸 token bill skyrockets.
> hawk-bridge gives your AI persistent memory: autoCapture + autoRecall, zero manual work.

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

## ❌ Without vs ✅ With hawk-bridge

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

---

## 🦅 What problem does it solve?

**Without hawk-bridge:** AI agents forget everything — across sessions, across agents, and spend too much on LLM tokens.

**With hawk-bridge:** Persistent memory, shared context, and lower costs.

### Pain Points hawk-bridge Solves

| Pain Point | ❌ Without | ✅ With hawk-bridge |
|-----------|-----------|-------------------|
| **AI forgets everything after session ends** | ❌ New session starts blank | ✅ Cross-session memory injection |
| **Team context lost** | ❌ Each agent starts fresh | ✅ Shared LanceDB, all agents access same memories |
| **Multiple agents repeat same mistakes** | ❌ Agent A doesn't know Agent B's decisions | ✅ Memory is shared, not siloed |
| **LLM costs spiral out of control** | ❌ Unlimited context growth, 💸 token bills explode | ✅ Compression + dedup + MMR shrinks context |
| **Context overflow / token limit hit** | ❌ Session history grows until crash | ✅ Auto-pruning + 4-tier decay keeps context lean |
| **Important decisions forgotten** | ❌ Only in old session, lost forever | ✅ Stored in LanceDB with importance scoring |
| **Duplicate memories pile up** | ❌ Same info stored many times | ✅ SimHash dedup, 64-bit fingerprint |
| **Repetitive recall** | ❌ "Tell me about X" → 5 similar memories injected | ✅ MMR ensures diverse, non-repeating injection |
| **No self-improving memory** | ❌ Nothing gets better over time | ✅ importance + access_count tracking → smart promotion |

### hawk-bridge solves 5 core problems:

**Problem 1: Session context window limits**
Context has a token limit (e.g. 32k). Long history crowds out important content.
→ hawk-bridge compresses/archives, injects only the most relevant.

**Problem 2: AI forgets across sessions**
When a session ends, context disappears. Next conversation starts fresh.
→ hawk-recall injects memories from LanceDB before every new session.

**Problem 3: Multiple agents share nothing**
Agent A knows nothing about Agent B's context. Decisions made by one agent are invisible to others.
→ Shared LanceDB memory: all agents read/write to the same store. No silos.

**Problem 4: Context grows too large before sending to LLM**
Recall without optimization = large, repetitive context.
→ After compression + SimHash dedup + MMR: context is **much smaller** before LLM is called, saving tokens and cost.

**Problem 5: Memory never self-manages**
Without hawk-bridge: all messages pile up in session history until context overflows.
→ hawk-capture auto-extracts → LanceDB. Unimportant → delete. Important → promote to long-term.

---

## 🔄 hawk-bridge in the Session/Context Lifecycle

```
Session (persistent, on disk)
    │
    └─► History messages
            │
            ▼
    Context Assembly (in memory)
            │
            ├──► hawk-recall injects memories ← from LanceDB
            │
            ├──► Skills descriptions
            ├──► Tools list
            └──► System Prompt
                    │
                    ▼
                LLM Reply
                    │
                    ▼
            hawk-capture extracts → stored in LanceDB
```

**How it works:**
1. Every response → `hawk-capture` extracts meaningful content → saves to LanceDB
2. Every new session → `hawk-recall` retrieves relevant memories → injects into context
3. Old memories → auto-managed via 4-tier decay (Working → Short → Long → Archive)
4. Duplicate memories → SimHash dedup prevents storage waste
5. Redundant recall → MMR ensures diverse, non-repetitive injection

---

## ✨ Core Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk extracts 6 categories of memories automatically |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk injects relevant memories before first response |
| 3 | **Hybrid Retrieval** | BM25 + vector search + RRF fusion — no API key required for baseline |
| 4 | **Zero-Config Fallback** | Works out-of-the-box, no API keys needed (Jina free tier default) |
| 5 | **5 Embedding Providers** | Ollama (local GPU) / Jina AI (free cloud) / Qianwen / OpenAI / Cohere |
| 6 | **Graceful Degradation** | Automatically falls back when API keys are unavailable |
| 7 | **Context-Aware Injection** | BM25 rank score used directly when no embedder available |
| 8 | — | (seed memory removed) |
| 9 | **Sub-100ms Recall** | LanceDB ANN index for instant retrieval |
| 10 | **Cross-Platform Install** | One command, works on all major Linux distros |
| 11 | **Auto-Dedup** | Text-similarity dedup before storage — prevents duplicate memories |
| 12 | **MMR Diverse Recall** | Maximal Marginal Relevance — relevant AND diverse, reduces context size |
| 13 | **28-Rule Text Normalizer** | Cleans markdown, URLs, punctuation, timestamps, emojis, HTML, debug logs |
| 14 | **Sensitive Info Sanitizer** | Auto-redacts API keys, phone numbers, emails, IDs, credit cards on capture |
| 15 | **TTL / Expiry** | Memories auto-expire after configurable TTL (default 30 days) |
| 16 | **Recall MinScore Gate** | Memories below relevance threshold are not injected into context |
| 17 | **Audit Logging** | All capture/skip/reject/recall events logged to `~/.hawk/audit.log` |
| 18 | **Harmful Content Filter** | Rejects violent/fraud/hack/CSAM content at capture time |

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
# ① Default: Qianwen 阿里云 DashScope (no API key needed by default!)
# Works out of the box. Set API key for higher rate limits:
export QWEN_API_KEY=your_qwen_key

# ② Ollama local GPU (recommended for quality — free, no API key)
export OLLAMA_BASE_URL=http://localhost:11434

# ③ Jina AI free tier (requires free API key from jina.ai)
export JINA_API_KEY=your_free_key
# ⚠️ Proxy required in China: set HTTP/SOCKS proxy below
export HTTPS_PROXY=http://YOUR_PROXY_HOST:PORT

# ④ OpenAI (paid, high quality)
export OPENAI_API_KEY=sk-...

# ⑤ BM25-only fallback (no embedding needed — keyword search only)
# No environment variables needed
```

### 🔑 Get Your Qianwen API Key (Recommended — 国内首选)

阿里云 DashScope 提供免费额度，新用户有赠券：

1. **注册** https://dashscope.console.aliyun.com/ (可用阿里云账号)
2. **开通服务**: 搜索 "百炼" → 文本嵌入 → 开通
3. **获取 Key**: https://dashscope.console.aliyun.com/apiKey → 创建 API-KEY
4. **配置**:
```bash
```

### 🔑 Get Your Free Jina API Key

Jina AI offers a **generous free tier** — no credit card required:

1. **Register** at https://jina.ai/ (GitHub login supported)
2. **Get Key**: Go to https://jina.ai/settings/ → API Keys → Create API Key
3. **Copy Key**: starts with `jina_`
4. **Configure**:

> ⚠️ **Important: Jina AI requires a proxy in China (api.jina.ai is blocked).** Set `HTTPS_PROXY` to your proxy URL (e.g. `http://192.168.1.109:10808`).

### ~/.hawk/config.json

```json
{
  "openai_api_key": "YOUR_API_KEY",
  "embedding_model": "text-embedding-v1",
  "embedding_dimensions": 1024,
  "base_url": "https://dashscope.aliyuncs.com/api/v1"
}
```

| Provider | Field | Description |
|---------|-------|-------------|
| Jina | `JINA_API_KEY` env | Jina API Key starts with `jina_` |
| Ollama | `OLLAMA_BASE_URL` env | e.g. `http://localhost:11434` |
| OpenAI | `OPENAI_API_KEY` env | OpenAI API Key |
| Generic | `base_url` + `apiKey` | Any OpenAI-compatible endpoint |

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

**Default**: BM25-only — works immediately with zero configuration.

---

## 🔄 Degradation Logic

```
Has OLLAMA_BASE_URL?        → Ollama embeddings + BM25 + RRF
Has JINA_API_KEY?          → Jina embeddings + BM25 + RRF
Has QWEN_API_KEY?          → Qianwen (阿里云 DashScope) + BM25 + RRF
Has OPENAI_API_KEY?        → OpenAI embeddings + BM25 + RRF
Has COHERE_API_KEY?        → Cohere embeddings + BM25 + RRF
Nothing configured?          → BM25-only (pure keyword, no API calls)
```

No API key = no crash = graceful degradation.

---

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
│   ├── embeddings.ts           # 6 embedding providers (Qianwen/Ollama/Jina/Cohere/OpenAI/OpenAI-Compatible)
│   ├── retriever.ts            # Hybrid search (BM25 + vector + RRF)
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

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
| 8 | **Sub-100ms Recall** | LanceDB ANN index for instant retrieval |
| 9 | **Cross-Platform Install** | One command, works on all major Linux distros |
| 10 | **Auto-Dedup** | Text-similarity dedup before storage — prevents duplicate memories |
| 11 | **MMR Diverse Recall** | Maximal Marginal Relevance — relevant AND diverse, reduces context size |
| 12 | **28-Rule Text Normalizer** | Cleans markdown, URLs, punctuation, timestamps, emojis, HTML, debug logs |
| 13 | **Sensitive Info Sanitizer** | Auto-redacts API keys, phone numbers, emails, IDs, credit cards on capture |
| 14 | **TTL / Expiry** | Memories auto-expire after configurable TTL (default 30 days) |
| 15 | **Recall MinScore Gate** | Memories below relevance threshold are not injected into context |
| 16 | **Audit Logging** | All capture/skip/reject/recall events logged to `~/.hawk/audit.log` |
| 17 | **Harmful Content Filter** | Rejects violent/fraud/hack/CSAM content at capture time |
| 18 | **Composite Score Ranking** | score×0.6 + reliability×0.4 — prioritizes reliable memories |
| 19 | **Multi-Turn Joint Extraction** | Merges consecutive user messages before LLM extraction — better context |
| 20 | **Code Block + URL Extraction** | Auto-captures code blocks (fact/0.8) and URLs (fact/0.7) as memories |
| 21 | **24h Embedder Cache** | Embedding results cached 24h — avoids repeat API calls, faster capture |
| 22 | **Incremental BM25** | ≤10 new memories → lazy merge; >10 → full rebuild — scales to 1000+ memories |
| 23 | **Pre-Filter** | Skips pure numbers / single emojis / <30-char content before calling LLM |
| 24 | **Did-You-Mean** | Empty recall results → suggests similar memories by keyword overlap |
| 25 | **Memory Stats** | `hawk统计` — category/scope/reliability distribution dashboard |
| 26 | **Effect Feedback** | `hawk否认 N` → reliability -5%; `hawk确认 N 对/纠正` → reliability -30% |
| 27 | **Multi-Agent Isolation** | Per-agent memory pool via `owner_agent` field — personal + team memories |
| 28 | **LanceDB trygc** | Automatic garbage collection after decay — keeps DB lean |
| 29 | **Structured JSON Output** | All LLM calls use `response_format=json_object` — reliable parsing |
| 30 | **Auto-Dream Consolidation** *(from Claude)* | Periodic background consolidation: merges duplicates, detects stale memories, confirms fresh ones (every 24h or 5+ new memories) |
| 31 | **Memory Drift Detection** *(from Claude)* | 🕐 indicator for reliable memories not verified in 7+ days; `hawk过期` command scans all memories |
| 32 | **Multi-Provider Rerank** | Jina AI / Cohere / Mixedbread AI / OpenAI-compatible rerankers with automatic fallback to cosine similarity |
| 33 | **4-Tier Memory Taxonomy** *(from Claude)* | Claude Code-style classification: fact / preference / decision / entity — each with reliability tracking and drift-aware recall |
| 34 | **Consolidation Lock** *(from Claude)* | Lock file prevents concurrent dream runs; stale-lock recovery after 60min or dead process |
| 35 | **What NOT to Save** *(from Claude)* | Pre-filter skips code patterns, git history, debug recipes, ephemeral tasks — reduces noise |
| 36 | **Dual Selector** *(from Claude)* | Header scan (name+description) → LLM select top N → vector search — more accurate than pure vector |
| 37 | **Session Transcript Scan** *(from Claude)* | Scans `transcripts/*.jsonl` for relevant historical context during dream consolidation |

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
│         │  MemoryManager         │                                │
│         │  SQLite WAL storage   │  ← v2.0: replaces JSON file  │
│         │  + VectorRetriever   │                                │
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

---

## 🦅 Quick Commands

All commands run from the `hawk-bridge` workspace directory:
```bash
cd ~/.openclaw/workspace/hawk-bridge
```

### 📊 Statistics & Diagnostics

```bash
# 🦅 Statistics — show memory count, category/scope/reliability distribution
node dist/cli/doctor.js
# or
hawk doctor

# 📊 Statistics — show memory count, category/scope/reliability distribution
node dist/cli/doctor.js --stats
```

### 📖 Read & Write Memories

```bash
# Write a memory directly
node dist/cli/write.js --text "team decision: use Redis for caching" --category decision --importance 0.8 --source user-import

# Read memories by source (e.g. evolution-success, user-feedback)
node dist/cli/read-source.js --source evolution-success --source evolution-failure --limit 20

# Migrate to a new embedding dimension (e.g. 384 → 1024 when switching embedder)
# This drops the old table, re-creates with current HAWK_EMBEDDING_DIM, and re-embeds all records
HAWK_EMBEDDING_DIM=1024 OLLAMA_BASE_URL=http://localhost:9997/v1 OLLAMA_EMBED_MODEL=bge-m3 node dist/cli/write.js --reinit
```

### 🔍 Query Memories (Natural Language)

```bash
# Search memories (requires embedding configured)
 hawk recall "what did we decide about the architecture"

# Compare two memories by ID
 hawk对比 1 2
```

### ✏️ Feedback & Correction

```bash
# ❌ Mark memory N as unreliable (reliability -5%)
 hawk否认 3

# ✅ Mark memory N as correct/reliable (reliability stays, verification_count +1)
 hawk确认 3

# ✏️ Correct memory N with new text
 hawk纠正 3 新修正的内容

# 🔍 Scan for expired/stale memories
 hawk过期
```

### 🗑️ Maintenance

```bash
# Export all memories to JSON
 hawk导出

# Clear ALL memories (⚠️ irreversible)
 hawk清空

# Clear expired/locked memories
 hawk清理

# Lock memory N (prevents auto-deletion)
 hawk锁定 5

# Unlock memory N
 hawk解锁 5
```

### ⚡ Batch Operations

```bash
# Lock all memories
 hawk锁定all

# Unlock all memories
 hawk解锁all
```

---

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

**Config file**: `~/.hawk/config.yaml` (YAML, no JSON — JSON is no longer supported)
**Env vars**: `HAWK__*` with double-underscore for nesting (e.g. `HAWK__EMBEDDING__DIMENSIONS`)
**Priority**: Defaults < config.yaml < env vars (higher = wins)

### Environment Variables

```bash
# Unified format (recommended): HAWK__SECTION__KEY
# Example: HAWK__EMBEDDING__DIMENSIONS=1024

# ── Embedding ──────────────────────────────────────────────
export HAWK__EMBEDDING__PROVIDER=ollama    # ollama | jina | qianwen | openai | cohere
export HAWK__EMBEDDING__BASE_URL=http://localhost:9997/v1
export HAWK__EMBEDDING__MODEL=bge-m3
export HAWK__EMBEDDING__DIMENSIONS=1024
export HAWK__EMBEDDING__API_KEY=sk-...
export HAWK__EMBEDDING__PROXY=http://proxy:10808

# ── LLM (for reranking) ────────────────────────────────────
export HAWK__LLM__PROVIDER=ollama
export HAWK__LLM__MODEL=llama3.3
export HAWK__LLM__BASE_URL=http://localhost:9997/v1

# ── Recall ─────────────────────────────────────────────────
export HAWK__RECALL__TOP_K=5
export HAWK__RECALL__MIN_SCORE=0.3
export HAWK__RECALL__RERANK_ENABLED=true
export HAWK__RECALL__RERANK_MODEL=bge-m3

# ── Logging ────────────────────────────────────────────────
export HAWK__LOGGING__LEVEL=info    # debug | info | warn | error

# ── Legacy env vars (deprecated, still work but print warnings) ─
export OLLAMA_BASE_URL=http://localhost:11434    # → HAWK__EMBEDDING__BASE_URL
export OLLAMA_EMBED_MODEL=nomic-embed-text       # → HAWK__EMBEDDING__MODEL
export HAWK_EMBEDDING_DIM=1024                    # → HAWK__EMBEDDING__DIMENSIONS
export JINA_API_KEY=...                           # → HAWK__EMBEDDING__API_KEY
export OPENAI_API_KEY=...                        # → HAWK__EMBEDDING__API_KEY
export QWEN_API_KEY=...                           # → HAWK__EMBEDDING__API_KEY
```

### Quick Start (Docker / Local)

```bash
# Minimal config for local Ollama
export HAWK__EMBEDDING__PROVIDER=ollama
export HAWK__EMBEDDING__BASE_URL=http://localhost:9997/v1
export HAWK__EMBEDDING__MODEL=bge-m3
export HAWK__EMBEDDING__DIMENSIONS=1024
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

### ~/.hawk/config.yaml

```yaml
# hawk-bridge configuration (YAML only — JSON no longer supported)
# Env vars in this file use ${ENV_VAR} syntax (will be expanded at load time)

db:
  provider: lancedb

embedding:
  provider: ollama
  baseURL: ${OLLAMA_BASE_URL}       # e.g. http://localhost:9997/v1
  model: bge-m3
  dimensions: 1024
  proxy: ""                         # e.g. http://192.168.1.109:10808

llm:
  provider: ollama
  baseURL: ${OLLAMA_BASE_URL}
  model: llama3.3

recall:
  topK: 5
  minScore: 0.3
  rerankEnabled: false
  rerankModel: ""

capture:
  enabled: true
  importanceThreshold: 0.5

logging:
  level: info    # debug | info | warn | error
```

| Provider | YAML field | Env var (deprecated) |
|---------|------------|---------------------|
| Ollama | `HAWK__EMBEDDING__BASE_URL` | `OLLAMA_BASE_URL` |
| Jina | `HAWK__EMBEDDING__API_KEY` | `JINA_API_KEY` |
| OpenAI | `HAWK__EMBEDDING__API_KEY` | `OPENAI_API_KEY` |
| Qianwen | `HAWK__EMBEDDING__API_KEY` | `QWEN_API_KEY` |
| Generic | `embedding.baseURL` + `apiKey` | Any OpenAI-compatible endpoint |

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

## 🔄 Provider Auto-Detection

If no embedding config is set (yaml or env), auto-detects in this order:

```
OLLAMA_BASE_URL set?            → Ollama (recommended for local GPU)
HAWK__EMBEDDING__* set?        → Configured provider
Minimax key in OpenClaw?       → Minimax
QWEN_API_KEY set?              → Qianwen (阿里云 DashScope)
JINA_API_KEY set?              → Jina AI
OPENAI_API_KEY set?            → OpenAI
COHERE_API_KEY set?            → Cohere
Nothing configured?            → BM25-only (pure keyword, no API calls)
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

hawk-bridge and context-hawk are **two independent GitHub repos** that work together:

```
 hawk-bridge (TypeScript plugin)         context-hawk (Python library)
┌──────────────────────────┐            ┌─────────────────────────────┐
│  TypeScript OpenClaw    │  spawn()    │  Python MemoryManager       │
│  Hook handlers          │ ────────→  │  SQLite WAL storage        │
│  (hawk-recall, etc.)   │  subprocess │  + VectorRetriever         │
└──────────────────────────┘            └─────────────────────────────┘
        ↑ decides *when*                         ↑ handles *how*
```

| | hawk-bridge | context-hawk |
|---|---|---|
| **GitHub** | `relunctance/hawk-bridge` | `relunctance/context-hawk` |
| **Language** | TypeScript | Python |
| **Role** | OpenClaw hook bridge (triggers hooks, manages lifecycle) | Python memory engine (storage, retrieval, extraction) |
| **Storage** | N/A (pure orchestration) | SQLite WAL + LanceDB vectors |
| **What it calls** | `python3 -c "from hawk.memory import MemoryManager"` | Returns results to hawk-bridge |
| **Installs** | npm packages | Cloned into `~/.openclaw/workspace/context-hawk` |

**Key principle**: hawk-bridge never touches storage directly. All reads/writes go through context-hawk's Python API. This means:
- **Storage upgrades are transparent to hawk-bridge** — e.g. switching from JSON to SQLite doesn't require any hawk-bridge changes
- **100-year architecture lives entirely in context-hawk** — tier/permanence_policy/storage_tier fields are computed in Python, TypeScript only sees the result
- **Migrations need zero hawk-bridge changes** — the Python interface stays compatible

**They work together**: hawk-bridge decides *when* to act, context-hawk handles *how*.

---

## 🎯 Unified Memory Architecture: 5-Tier × 3-Scope

hawk-bridge uses a **dual-dimension** architecture that solves both personal 100-year memory AND enterprise ToB scenarios.

### Core Concept: Tier × Scope Matrix

**Tier = Time dimension** (how long the memory lives)
**Scope = Ownership dimension** (whose memory it is)

```
            Scope →
Tier ↓      Personal      Org           System
────────────────────────────────────────────────────
L0 宪法     个人价值观     企业宪章        连接器协议
L1 生命     人生里程碑     企业里程碑      组织沿革
L2 周期     十年分桶       项目/财年周期   行业周期
L3 事件     日常记忆       团队决策        外部系统事件
L4 工作     会话上下文     项目上下文       实时数据流
```

### 5 Tiers (Time Dimension)

| Tier | Name | Description | Storage |
|------|------|-------------|---------|
| **L0** | Constitutional | Core identity, values, permanent agreements | 100+ years |
| **L1** | Lifetime | Life milestones — career, relationships | 50+ years |
| **L2** | Period | Decade buckets with era context | 30+ years |
| **L3** | Event | Regular memories with decay | 5-10 years |
| **L4** | Working | Session context only | Session lifetime |

### 3 Scopes (Ownership Dimension)

| Scope | Description | Examples |
|-------|-------------|---------|
| **personal** | Belongs to individual | User preferences, habits, work style |
| **org** | Shared within organization | Department strategy, team decisions, OKRs |
| **system** | External enterprise systems (pluggable connectors) | SAP ERP, Confluence, Jira, Feishu |

### Enterprise Connector Plugin System

External systems are **pluggable connectors** that map to `Scope=system`:

| Connector | Enterprise System | Memory Type |
|-----------|------------------|-------------|
| `FeishuConnector` | 飞书 | Calendar, docs, approvals |
| `ConfluenceConnector` | Confluence | Internal knowledge base |
| `JiraConnector` | JIRA | Project tasks, bug status |
| `GitHubConnector` | GitHub | Code decisions, PR reviews |
| `SapConnector` | SAP ERP | Inventory, procurement |

### Key Design Principles

1. **Tier = Time, Scope = Ownership** — two independent dimensions, not one hierarchy
2. **Constitutional Layer is the anchor** — memories become constitutional or fade away
3. **DARK File Format** — every memory = one independent JSON file (never depend on a database)
4. **Append-only** — no overwrite, no delete without explicit user action
5. **Multi-replica** — GitHub + Gitee + local NAS (no single point of failure)
6. **Connector Plugin System** — enterprises plug in their own systems as `Scope=system`
7. **Migration-ready** — format can change, content must survive 100 years

### Coming in v2.0+

- **v2.0**: Unified Schema (Tier + Scope dual-field) + L0/L1/L2 layers
- **v2.1**: DARK Archive + Cold Storage pipeline (GitHub + Gitee dual push)
- **v2.2**: Enterprise Connector System + Scope=system implementation
- **v2.3**: Org Memory Layer + Scope=org + access control
- **v2.4**: Tier Promotion Engine (L3 → L2 → L1 → L0)
- **v2.5**: Tier-Aware + Scope-Aware unified retrieval

See [TODO.md](TODO.md) for detailed implementation roadmap.

---

## 📖 Related

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python memory library
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — Team collaboration workspace
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Laravel development standards

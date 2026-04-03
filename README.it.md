# 🦅 hawk-bridge

> **Bridge Hook OpenClaw → Sistema di memoria Python hawk**
>
> *Dai memoria a qualsiasi AI Agent — autoCapture (estrazione automatica) + autoRecall (iniezione automatica), zero operazioni manuali*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## Cosa fa

Gli agenti IA dimenticano tutto dopo ogni sessione. **hawk-bridge** collega il sistema di hook di OpenClaw con la memoria Python di hawk, dando agli agenti una memoria persistente e auto-migliorante:

- **Ogni risposta** → hawk estrae e memorizza i ricordi significativi
- **Ogni nuova sessione** → hawk inietta i ricordi rilevanti prima che inizi il pensiero
- **Nessuna operazione manuale** — funziona e basta

**Senza hawk-bridge:**
> Utente: "Preferisco risposte concise, non paragrafi"
> Agente: "Certo!" ✅
> (sessione successiva — l'agente dimentica di nuovo)

**Con hawk-bridge:**
> Utente: "Preferisco risposte concise"
> Agente: memorizzato come `preference:communication` ✅
> (sessione successiva — iniettato automaticamente, applicato subito)

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


## ✨ Funzionalità principali

| # | Funzionalità | Descrizione |
|---|---------|-------|
| 1 | **Hook Auto-Capture** | `message:sent` → hawk estrae automaticamente 6 categorie di ricordi |
| 2 | **Hook Auto-Recall** | `agent:bootstrap` → hawk inietta i ricordi rilevanti prima della prima risposta |
| 3 | **Recupero ibrido** | BM25 + ricerca vettoriale + fusione RRF — nessuna chiave API richiesta |
| 4 | **Fallback Zero-Config** | Funziona subito in modalità BM25-only, nessuna chiave API necessaria |
| 5 | **4 Provider di embedding** | Ollama (locale) / sentence-transformers (CPU) / Jina AI (API gratuita) / OpenAI |
| 6 | **Degradazione elegante** | Passa automaticamente quando le chiavi API non sono disponibili |
| 7 | **Iniezione contestuale** | Punteggio BM25 usato direttamente quando non c'è embedder disponibile |
| 9 | **Recall sub-100ms** | Indice ANN LanceDB per recupero istantaneo |
| 10 | **Installazione multipiattaforma** | Un comando, funziona su Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE |

---

## 🏗️ Architettura

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← Inietta i ricordi           │
│  │    (before first response)  │     rilevanti nel contesto      │
│  └─────────────────────────────┘     dell'agente                │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   Ricerca vettoriale + BM25 + RRF       │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← Estrazione / scoring / decay │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Installazione con un comando

```bash
# Installazione remota (consigliata — una riga, completamente automatica)
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# Poi attiva:
openclaw plugins install /tmp/hawk-bridge
```

L'installer gestisce automaticamente:

| Passo | Cosa fa |
|------|----------|
| 1 | Rileva e installa Node.js, Python3, git, curl |
| 2 | Installa dipendenze npm (lancedb, openai) |
| 3 | Installa pacchetti Python (lancedb, rank-bm25, sentence-transformers) |
| 4 | Clona `context-hawk` in `~/.openclaw/workspace/context-hawk` |
| 5 | Crea symlink `~/.openclaw/hawk` |
| 6 | Installa **Ollama** (se assente) |
| 7 | Scarica il modello di embedding `nomic-embed-text` |
| 8 | Compila gli hook TypeScript e seed della memoria iniziale |

**Distribuzioni supportate**: Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### Avvio rapido per distribuzione

| Distribuzione | Comando di installazione |
|--------|-----------------------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> Lo stesso comando funziona su tutte le distribuzioni. L'installer rileva automaticamente il tuo sistema e usa il gestore pacchetti corretto.

---

## 🔧 Installazione manuale (per distribuzione)

Se preferisci installare manualmente invece di usare lo script:

### Ubuntu / Debian

```bash
# 1. Dipendenze di sistema
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. Clona il repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dipendenze Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opzionale)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memoria
node dist/seed.js

# 8. Attiva
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. Dipendenze di sistema
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. Clona il repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dipendenze Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opzionale)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memoria
node dist/seed.js

# 8. Attiva
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. Dipendenze di sistema
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. Clona il repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dipendenze Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opzionale)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memoria
node dist/seed.js

# 8. Attiva
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. Dipendenze di sistema
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. Clona il repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dipendenze Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opzionale)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memoria
node dist/seed.js

# 8. Attiva
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. Dipendenze di sistema
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. Clona il repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dipendenze Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opzionale)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed memoria
node dist/seed.js

# 8. Attiva
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. Installa Homebrew (se assente)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Dipendenze di sistema
brew install node python git curl

# 3. Clona il repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Dipendenze Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama (opzionale)
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + build
npm install && npm run build

# 8. Seed memoria
node dist/seed.js

# 9. Attiva
openclaw plugins install /tmp/hawk-bridge
```

> **Nota**: `--break-system-packages` è necessario su Linux per aggirare PEP 668. Non necessario su macOS. Lo script di installazione di Ollama rileva macOS e usa Homebrew automaticamente.

---

## 🔧 Configurazione

Dopo l'installazione, scegli la modalità di embedding — tutto tramite variabili d'ambiente:

```bash
# ① Ollama locale (consigliato — gratis, nessuna chiave API, accelerato GPU)
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU locale (gratis, nessuna GPU, modello ~90MB)

# ③ Jina AI free tier (richiede chiave API gratuita da jina.ai)
export JINA_API_KEY=la_tua_chiave_gratuita

# ④ BM25-only (predefinito — nessuna config, solo ricerca per parole chiave)
```

### 🔑 Ottieni la tua chiave API Jina gratuita (Consigliato)

Jina AI offre un **free tier generoso** — nessuna carta di credito richiesta:

1. **Registrati** su https://jina.ai/ (login GitHub supportato)
2. **Ottieni la chiave**: Vai su https://jina.ai/settings/ → API Keys → Create API Key
3. **Copia la chiave**: inizia con `jina_`
4. **Configura**:
```bash
export JINA_API_KEY=jina_LA_TUA_CHIAVE
```

> **Perché Jina?** 1M token/mese gratis, ottima qualità, compatibile OpenAI, il più semplice da configurare.

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

Nessuna chiave API nei file di configurazione — solo variabili d'ambiente.

---

## 📊 Modalità di recupero

| Modalità | Provider | Chiave API | Qualità | Velocità |
|------|----------|---------|---------|---------|
| **BM25-only** | Integrato | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | CPU locale | ❌ | ⭐⭐⭐ | ⭐⚡ |
| **Ollama** | GPU locale | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | Cloud | ✅ gratis | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**Predefinito**: BM25-only — funziona subito con zero configurazione.

---

## 🔄 Logica di degradazione

```
OLLAMA_BASE_URL presente?      → Ibrido completo: vettore + BM25 + RRF
JINA_API_KEY presente?         → Jina vettori + BM25 + RRF
Has QWEN_API_KEY?          → Qianwen (阿里云 DashScope) + BM25 + RRF
Niente configurato?             → BM25-only (solo parole chiave, nessuna chiamata API)
```

Nessuna chiave API = nessun crash = degradazione elegante.

---

## 📁 Struttura dei file

```
hawk-bridge/
├── README.md
├── README.it.md
├── LICENSE
├── install.sh                   # Installer un comando (curl | bash)
├── package.json
├── openclaw.plugin.json          # Manifesto del plugin + configSchema
├── src/
│   ├── index.ts              # Punto d'ingresso del plugin
│   ├── config.ts             # Lettore config OpenClaw + rilevamento env
│   ├── lancedb.ts           # Wrapper LanceDB
│   ├── embeddings.ts           # 5 provider di embedding
│   ├── retriever.ts           # Ricerca ibrida (BM25 + vettore + RRF)
│   ├── seed.ts               # Inizializzatore seed memory
│   └── hooks/
│       ├── hawk-recall/      # Hook agent:bootstrap
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # Hook message:sent
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk (installato da install.sh)
```

---

## 🔌 Specifiche tecniche

| | |
|---|---|
| **Runtime** | Node.js 18+ (ESM), Python 3.12+ |
| **Vector DB** | LanceDB (locale, serverless) |
| **Recupero** | BM25 + ricerca vettoriale ANN + fusione RRF |
| **Eventi Hook** | `agent:bootstrap` (recall), `message:sent` (capture) |
| **Dipendenze** | Zero dipendenze hard — tutto opzionale con auto-fallback |
| **Persistenza** | File system locale, nessun DB esterno richiesto |
| **Licenza** | MIT |

---

## 🤝 Relazione con context-hawk

| | hawk-bridge | context-hawk |
|---|---|---|
| **Ruolo** | Bridge Hook OpenClaw | Libreria memoria Python |
| **Cosa fa** | Attiva hook, gestisce il ciclo di vita | Estrazione memoria, scoring, decay |
| **Interfaccia** | TypeScript Hooks → LanceDB | Python `MemoryManager`, `VectorRetriever` |
| **Installa** | Pacchetti npm, dipendenze di sistema | Clonato in `~/.openclaw/workspace/` |

**Lavorano insieme**: hawk-bridge decide *quando* agire, context-hawk gestisce *come*.

---

## 📖 Progetti correlati

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Libreria memoria Python
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — Workspace di collaborazione team
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Standard di sviluppo Laravel

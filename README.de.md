# 🦅 hawk-bridge

> **OpenClaw Hook Bridge → hawk Python Gedächtnissystem**
>
> *Gib jedem AI Agent ein Gedächtnis — autoCapture (automatische Extraktion) + autoRecall (automatische Injektion), null manueler Aufwand*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## Was es macht

KI-Agenten vergessen nach jeder Sitzung alles. **hawk-bridge** verbindet OpenClaws Hook-System mit hawks Python-Gedächtnis und gibt Agenten ein persistentes, selbstverbesserndes Gedächtnis:

- **Jede Antwort** → hawk extrahiert und speichert bedeutungsvolle Erinnerungen
- **Jede neue Sitzung** → hawk injiziert relevante Erinnerungen bevor das Denken beginnt
- **Kein manueller Aufwand** — es funktioniert einfach

**Ohne hawk-bridge:**
> Benutzer: "Ich bevorzuge knappe Antworten, keine Absätze"
> Agent: "Klar!" ✅
> (nächste Sitzung — Agent vergisst wieder)

**Mit hawk-bridge:**
> Benutzer: "Ich bevorzuge knappe Antworten"
> Agent: gespeichert als `preference:communication` ✅
> (nächste Sitzung — automatisch injiziert, sofort wirksam)

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


## ✨ Kernfunktionen

| # | Funktion | Beschreibung |
|---|---------|-------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk extrahiert automatisch 6 Erinnerungskategorien |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk injiziert relevante Erinnerungen vor der ersten Antwort |
| 3 | **Hybride Suche** | BM25 + Vektorsuche + RRF-Fusion — kein API-Schlüssel erforderlich |
| 4 | **Zero-Config Fallback** | Funktioniert sofort im BM25-only-Modus, keine API-Schlüssel nötig |
| 5 | **4 Embedding-Provider** | Ollama (lokal) / sentence-transformers (CPU) / Jina AI (gratis API) / OpenAI |
| 6 | **Graceful Degradation** | Wechselt automatisch wenn API-Schlüssel nicht verfügbar sind |
| 7 | **Kontextbewusste Injektion** | BM25-Rangpunktzahl wird direkt verwendet wenn kein Embedder verfügbar |
| 9 | **Sub-100ms Recall** | LanceDB ANN-Index für sofortigen Abruf |
| 10 | **Plattformübergreifende Installation** | Ein Befehl, funktioniert auf Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE |

---

## 🏗️ Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← Injiziert relevante          │
│  │    (before first response)  │     Erinnerungen in den         │
│  └─────────────────────────────┘     Agent-Kontext              │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   Vektorsuche + BM25 + RRF-Fusion        │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← Extraktion / Scoring / Decay │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Ein-Befehl-Installation

```bash
# Remote-Installation (empfohlen — eine Zeile, vollständig automatisch)
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# Dann aktivieren:
openclaw plugins install /tmp/hawk-bridge
```

Das Installationsprogramm übernimmt automatisch:

| Schritt | Was es macht |
|------|-------------|
| 1 | Erkennt und installiert Node.js, Python3, git, curl |
| 2 | Installiert npm-Abhängigkeiten (lancedb, openai) |
| 3 | Installiert Python-Pakete (lancedb, rank-bm25, sentence-transformers) |
| 4 | Klont `context-hawk` nach `~/.openclaw/workspace/context-hawk` |
| 5 | Erstellt `~/.openclaw/hawk` Symlink |
| 6 | Installiert **Ollama** (falls nicht vorhanden) |
| 7 | Lädt `nomic-embed-text` Embedding-Modell herunter |
| 8 | Kompiliert TypeScript Hooks und seedt initiale Erinnerungen |

**Unterstützte Distributionen**: Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### Schnellstart nach Distribution

| Distribution | Installationsbefehl |
|--------|---------------------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> Derselbe Befehl funktioniert auf allen Distributionen. Das Installationsprogramm erkennt automatisch dein System und verwendet den richtigen Paketmanager.

---

## 🔧 Manuelle Installation (pro Distribution)

Wenn du lieber manuell installieren möchtest:

### Ubuntu / Debian

```bash
# 1. Systemabhängigkeiten
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. Repo klonen
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-Abhängigkeiten
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Memory seeden
node dist/seed.js

# 8. Aktivieren
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. Systemabhängigkeiten
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. Repo klonen
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-Abhängigkeiten
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Memory seeden
node dist/seed.js

# 8. Aktivieren
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. Systemabhängigkeiten
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. Repo klonen
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-Abhängigkeiten
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Memory seeden
node dist/seed.js

# 8. Aktivieren
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. Systemabhängigkeiten
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. Repo klonen
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-Abhängigkeiten
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Memory seeden
node dist/seed.js

# 8. Aktivieren
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. Systemabhängigkeiten
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. Repo klonen
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-Abhängigkeiten
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Memory seeden
node dist/seed.js

# 8. Aktivieren
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. Homebrew installieren (falls nicht vorhanden)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Systemabhängigkeiten
brew install node python git curl

# 3. Repo klonen
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Python-Abhängigkeiten
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama (optional)
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + build
npm install && npm run build

# 8. Memory seeden
node dist/seed.js

# 9. Aktivieren
openclaw plugins install /tmp/hawk-bridge
```

> **Hinweis**: `--break-system-packages` ist auf Linux erforderlich um PEP 668 zu umgehen. Auf macOS nicht nötig. Das Ollama-Installationsskript erkennt macOS automatisch und verwendet Homebrew.

---

## 🔧 Konfiguration

Nach der Installation den Embedding-Modus wählen — alles über Umgebungsvariablen:

```bash
# ① Ollama lokal (empfohlen — kostenlos, kein API-Schlüssel, GPU-beschleunigt)
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU lokal (kostenlos, kein GPU, ~90MB Modell)

# ③ Jina AI Free Tier (erfordert kostenlosen API-Schlüssel von jina.ai)
export JINA_API_KEY=dein_kostenloser_schluessel

# ④ BM25-only (Standard — keine Konfiguration nötig, nur Schlüsselwortsuche)
```

### 🔑 Kostenlosen Jina API-Schlüssel besorgen (Empfohlen)

Jina AI bietet ein **großzügiges Free Tier** — keine Kreditkarte erforderlich:

1. **Registrieren** unter https://jina.ai/ (GitHub-Login unterstützt)
2. **Schlüssel holen**: Gehe zu https://jina.ai/settings/ → API Keys → Create API Key
3. **Schlüssel kopieren**: beginnt mit `jina_`
4. **Konfigurieren**:
```bash
export JINA_API_KEY=jina_DEIN_SCHLUESSEL
```

> **Warum Jina?** 1M Tokens/Monat kostenlos, gute Qualität, OpenAI-kompatibel, am einfachsten einzurichten.

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

Keine API-Schlüssel in Konfigurationsdateien — nur Umgebungsvariablen.

---

## 📊 Abrufmodi

| Modus | Provider | API-Schlüssel | Qualität | Geschwindigkeit |
|------|----------|---------|---------|---------|
| **BM25-only** | Integriert | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | Lokaler CPU | ❌ | ⭐⭐⭐ | ⚡⚡ |
| **Ollama** | Lokaler GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | Cloud | ✅ kostenlos | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**Standard**: BM25-only — funktioniert sofort ohne Konfiguration.

---

## 🔄 Degradationslogik

```
OLLAMA_BASE_URL vorhanden?      → Voll hybrid: Vektor + BM25 + RRF
JINA_API_KEY vorhanden?         → Jina Vektoren + BM25 + RRF
Has QWEN_API_KEY?          → Qianwen (阿里云 DashScope) + BM25 + RRF
Nichts konfiguriert?             → BM25-only (nur Schlüsselwörter, keine API-Aufrufe)
```

Kein API-Schlüssel = kein Absturz = Graceful Degradation.

---

## 📁 Dateistruktur

```
hawk-bridge/
├── README.md
├── README.de.md
├── LICENSE
├── install.sh                   # Ein-Befehl-Installationsprogramm (curl | bash)
├── package.json
├── openclaw.plugin.json          # Plugin-Manifest + configSchema
├── src/
│   ├── index.ts              # Plugin-Einstiegspunkt
│   ├── config.ts             # OpenClaw-Konfigurationsleser + Env-Erkennung
│   ├── lancedb.ts           # LanceDB-Wrapper
│   ├── embeddings.ts           # 5 Embedding-Provider
│   ├── retriever.ts           # Hybride Suche (BM25 + Vektor + RRF)
│   ├── seed.ts               # Seed-Memory-Initialisierer
│   └── hooks/
│       ├── hawk-recall/      # agent:bootstrap Hook
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # message:sent Hook
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk (von install.sh installiert)
```

---

## 🔌 Technische Spezifikationen

| | |
|---|---|
| **Runtime** | Node.js 18+ (ESM), Python 3.12+ |
| **Vector DB** | LanceDB (lokal, serverlos) |
| **Abruf** | BM25 + ANN-Vektorsuche + RRF-Fusion |
| **Hook-Events** | `agent:bootstrap` (recall), `message:sent` (capture) |
| **Abhängigkeiten** | Keine harten Abhängigkeiten — alles optional mit Auto-Fallback |
| **Persistenz** | Lokales Dateisystem, keine externe DB erforderlich |
| **Lizenz** | MIT |

---

## 🤝 Beziehung zu context-hawk

| | hawk-bridge | context-hawk |
|---|---|---|
| **Rolle** | OpenClaw Hook Bridge | Python Gedächtnis-Bibliothek |
| **Was es tut** | Hooks auslösen, Lebenszyklus verwalten | Erinnerungsextraktion, Scoring, Decay |
| **Schnittstelle** | TypeScript Hooks → LanceDB | Python `MemoryManager`, `VectorRetriever` |
| **Installiert** | npm-Pakete, Systemabhängigkeiten | Geklont nach `~/.openclaw/workspace/` |

**Sie arbeiten zusammen**: hawk-bridge entscheidet *wann* gehandelt wird, context-hawk verarbeitet *wie*.

---

## 📖 Verwandte Projekte

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python Gedächtnis-Bibliothek
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — Team-Kollaborations-Arbeitsbereich
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Laravel-Entwicklungsstandards

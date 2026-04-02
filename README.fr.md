# 🦅 hawk-bridge

> **Pont Hook OpenClaw → Système de mémoire Python hawk**
>
> *Donnez de la mémoire à n'importe quel AI Agent — autoCapture (extraction auto) + autoRecall (injection auto), zéro manipulation manuelle*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## Ce que ça fait

Les agents IA oublient tout après chaque session. **hawk-bridge** fait le pont entre le système de hooks OpenClaw et la mémoire Python hawk, donnant aux agents une mémoire persistante et auto-améliorante :

- **Chaque réponse** → hawk extrait et stocke les souvenirs significatifs
- **Chaque nouvelle session** → hawk injecte les souvenirs pertinents avant que la pensée ne commence
- **Aucune opération manuelle** — ça fonctionne tout seul

**Sans hawk-bridge :**
> Utilisateur : "Je préfère des réponses concises, pas des paragraphes"
> Agent : "Bien sûr !" ✅
> (session suivante — l'agent oublie à nouveau)

**Avec hawk-bridge :**
> Utilisateur : "Je préfère des réponses concises"
> Agent : stocké comme `preference:communication` ✅
> (session suivante — injecté automatiquement, appliqué immédiatement)

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


## ✨ Fonctionnalités principales

| # | Fonctionnalité | Description |
|---|---------|-------|
| 1 | **Hook Auto-Capture** | `message:sent` → hawk extrait automatiquement 6 catégories de souvenirs |
| 2 | **Hook Auto-Recall** | `agent:bootstrap` → hawk injecte les souvenirs pertinents avant la première réponse |
| 3 | **Recherche hybride** | BM25 + recherche vectorielle + fusion RRF — pas de clé API requise |
| 4 | **Fallback zéro-config** | Fonctionne immédiatement en mode BM25-only, aucune clé API nécessaire |
| 5 | **4 Providers d'embedding** | Ollama (local) / sentence-transformers (CPU) / Jina AI (API gratuite) / OpenAI |
| 6 | **Dégradation élégante** | Bascule automatiquement quand les clés API sont indisponibles |
| 7 | **Injection contextuelle** | Score BM25 utilisé directement quand aucun embedder disponible |
| 8 | **Mémoire seed** | Pré-remplie avec la structure d'équipe, les normes et le contexte projet |
| 9 | **Recall sub-100ms** | Index ANN LanceDB pour une récupération instantanée |
| 10 | **Installation multiplateforme** | Une commande, fonctionne sur Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← Injecte les souvenirs        │
│  │    (before first response)  │     dans le contexte agent      │
│  └─────────────────────────────┘                                │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   Recherche vectorielle + BM25 + RRF     │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← Extraction / scoring / decay │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Installation en une commande

```bash
# Installation distante (recommandée — une ligne, entièrement automatique)
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# Puis activer :
openclaw plugins install /tmp/hawk-bridge
```

L'installateur gère automatiquement :

| Étape | Ce qu'il fait |
|------|-------------|
| 1 | Détecte et installe Node.js, Python3, git, curl |
| 2 | Installe les dépendances npm (lancedb, openai) |
| 3 | Installe les paquets Python (lancedb, rank-bm25, sentence-transformers) |
| 4 | Clone `context-hawk` dans `~/.openclaw/workspace/context-hawk` |
| 5 | Crée le lien symbolique `~/.openclaw/hawk` |
| 6 | Installe **Ollama** (si absent) |
| 7 | Télécharge le modèle d'embedding `nomic-embed-text` |
| 8 | Compile les hooks TypeScript et seed la mémoire initiale |

**Distros supportées** : Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### Démarrage rapide par distro

| Distro | Commande d'installation |
|--------|--------------------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> La même commande fonctionne sur toutes les distros. L'installateur détecte automatiquement votre système et utilise le bon gestionnaire de paquets.

---

## 🔧 Installation manuelle (par distro)

Si vous préférez installer manuellement au lieu d'utiliser le script :

### Ubuntu / Debian

```bash
# 1. Dépendances système
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. Cloner le repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dépendances Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optionnel)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed mémoire
node dist/seed.js

# 8. Activer
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. Dépendances système
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. Cloner le repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dépendances Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optionnel)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed mémoire
node dist/seed.js

# 8. Activer
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. Dépendances système
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. Cloner le repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dépendances Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optionnel)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed mémoire
node dist/seed.js

# 8. Activer
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. Dépendances système
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. Cloner le repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dépendances Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optionnel)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed mémoire
node dist/seed.js

# 8. Activer
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. Dépendances système
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. Cloner le repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dépendances Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (optionnel)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Seed mémoire
node dist/seed.js

# 8. Activer
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. Installer Homebrew (si absent)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Dépendances système
brew install node python git curl

# 3. Cloner le repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Dépendances Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama (optionnel)
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + build
npm install && npm run build

# 8. Seed mémoire
node dist/seed.js

# 9. Activer
openclaw plugins install /tmp/hawk-bridge
```

> **Note** : `--break-system-packages` est requis sur Linux pour contourner PEP 668. Pas nécessaire sur macOS. Le script d'installation Ollama détecte macOS et utilise Homebrew automatiquement.

---

## 🔧 Configuration

Après installation, choisissez votre mode d'embedding — tout via des variables d'environnement :

```bash
# ① Ollama local (recommandé — gratuit, pas de clé API, accéléré GPU)
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU (gratuit, pas de GPU, modèle ~90MB)

# ③ Jina AI free tier (nécessite une clé API gratuite de jina.ai)
export JINA_API_KEY=votre_cle_gratuite

# ④ BM25-only (défaut — pas de config, recherche par mots-clés uniquement)
```

### 🔑 Obtenez votre clé API Jina gratuite (Recommandé)

Jina AI offre un **free tier généreux** — pas de carte bancaire requise :

1. **Inscrivez-vous** sur https://jina.ai/ (connexion GitHub supportée)
2. **Obtenez la clé** : Allez sur https://jina.ai/settings/ → API Keys → Create API Key
3. **Copiez la clé** : commence par `jina_`
4. **Configurez** :
```bash
export JINA_API_KEY=jina_VOTRE_CLE_ICI
```

> **Pourquoi Jina ?** 1M tokens/mois gratuit, bonne qualité, compatible OpenAI, le plus simple à configurer.

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

Pas de clés API dans les fichiers de config — variables d'environnement uniquement.

---

## 📊 Modes de récupération

| Mode | Provider | Clé API | Qualité | Vitesse |
|------|----------|---------|---------|---------|
| **BM25-only** | Intégré | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | CPU local | ❌ | ⭐⭐⭐ | ⚡⚡ |
| **Ollama** | GPU local | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | Cloud | ✅ gratuit | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**Par défaut** : BM25-only — fonctionne immédiatement avec zéro configuration.

---

## 🔄 Logique de dégradation

```
OLLAMA_BASE_URL présent ?      → Hybride complet : vecteur + BM25 + RRF
JINA_API_KEY présent ?          → Jina vecteurs + BM25 + RRF
Has QWEN_API_KEY?          → Qianwen (阿里云 DashScope) + BM25 + RRF
Rien de configuré ?            → BM25-only (mots-clés purs, pas d'appels API)
```

Pas de clé API = pas de crash = dégradation élégante.

---

## 🌱 Mémoire seed

À la première installation, 11 souvenirs fondateurs sont seeded automatiquement :

- Structure d'équipe (rôles main/wukong/bajie/bailong/tseng)
- Normes de collaboration (flux de travail GitHub inbox → done)
- Contexte projet (hawk-bridge, qujingskills, gql-openclaw)
- Préférences de communication
- Principes d'exécution

Cela garantit que hawk-recall a quelque chose à injecter dès le premier jour.

---

## 📁 Structure des fichiers

```
hawk-bridge/
├── README.md
├── README.fr.md
├── LICENSE
├── install.sh                   # Installateur en une commande (curl | bash)
├── package.json
├── openclaw.plugin.json          # Manifeste du plugin + configSchema
├── src/
│   ├── index.ts              # Point d'entrée du plugin
│   ├── config.ts             # Lecteur config OpenClaw + détection env
│   ├── lancedb.ts           # Wrapper LanceDB
│   ├── embeddings.ts           # 5 providers d'embedding
│   ├── retriever.ts           # Recherche hybride (BM25 + vecteur + RRF)
│   ├── seed.ts               # Initialiseur de mémoire seed
│   └── hooks/
│       ├── hawk-recall/      # Hook agent:bootstrap
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # Hook message:sent
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk (installé par install.sh)
```

---

## 🔌 Spécifications techniques

| | |
|---|---|
| **Runtime** | Node.js 18+ (ESM), Python 3.12+ |
| **Vector DB** | LanceDB (local, serverless) |
| **Récupération** | BM25 + recherche vectorielle ANN + fusion RRF |
| **Événements Hook** | `agent:bootstrap` (recall), `message:sent` (capture) |
| **Dépendances** | Zéro dépendance dure — tout optionnel avec auto-fallback |
| **Persistance** | Système de fichiers local, pas de DB externe requise |
| **Licence** | MIT |

---

## 🤝 Relation avec context-hawk

| | hawk-bridge | context-hawk |
|---|---|---|
| **Rôle** | Pont Hook OpenClaw | Bibliothèque mémoire Python |
| **Ce qu'il fait** | Déclenche les hooks, gère le cycle de vie | Extraction mémoire, scoring, decay |
| **Interface** | TypeScript Hooks → LanceDB | Python `MemoryManager`, `VectorRetriever` |
| **Installe** | Paquets npm, dépendances système | Cloné dans `~/.openclaw/workspace/` |

**Ils fonctionnent ensemble** : hawk-bridge décide *quand* agir, context-hawk gère *comment*.

---

## 📖 Projets liés

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Bibliothèque mémoire Python
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — Espace de travail collaboration d'équipe
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Standards de développement Laravel

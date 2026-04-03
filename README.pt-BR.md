# 🦅 hawk-bridge

> **Ponte de Hooks OpenClaw → Sistema de Memória Python hawk**
>
> *Dê memória a qualquer AI Agent — autoCapture (extração automática) + autoRecall (injeção automática), zero operação manual*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## O que faz

Agentes IA esquecem tudo após cada sessão. **hawk-bridge** conecta o sistema de hooks do OpenClaw com a memória Python do hawk, dando aos agentes uma memória persistente e auto-melhorável:

- **Cada resposta** → hawk extrai e armazena memórias significativas
- **Cada nova sessão** → hawk injeta memórias relevantes antes do pensamento começar
- **Zero operação manual** — funciona automaticamente

**Sem hawk-bridge:**
> Usuário: "Prefiro respostas concisas, não parágrafos"
> Agente: "Claro!" ✅
> (próxima sessão — agente esquece de novo)

**Com hawk-bridge:**
> Usuário: "Prefiro respostas concisas"
> Agente: armazenado como `preference:communication` ✅
> (próxima sessão — injetado automaticamente, aplicado imediatamente)

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


## ✨ Funcionalidades principais

| # | Funcionalidade | Descrição |
|---|---------|-------|
| 1 | **Hook Auto-Capture** | `message:sent` → hawk extrai automaticamente 6 categorias de memórias |
| 2 | **Hook Auto-Recall** | `agent:bootstrap` → hawk injeta memórias relevantes antes da primeira resposta |
| 3 | **Busca híbrida** | BM25 + busca vetorial + fusão RRF — sem chave API necessária |
| 4 | **Fallback Zero-Config** | Funciona imediatamente no modo BM25-only, sem chaves API |
| 5 | **4 Providers de embedding** | Ollama (local) / sentence-transformers (CPU) / Jina AI (API gratuita) / OpenAI |
| 6 | **Degradação elegante** | Alterna automaticamente quando chaves API não estão disponíveis |
| 7 | **Injeção contextual** | Score BM25 usado diretamente quando não há embedder disponível |
| 9 | **Recall sub-100ms** | Índice ANN LanceDB para recuperação instantânea |
| 10 | **Instalação multiplataforma** | Um comando, funciona no Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE |

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← Injeta memórias relevantes    │
│  │    (before first response)  │     no contexto do agente       │
│  └─────────────────────────────┘                                │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   Busca vetorial + BM25 + Fusão RRF      │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← Extração / pontuação / decaimento │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Instalação com um comando

```bash
# Instalação remota (recomendada — uma linha, totalmente automática)
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# Depois ativar:
openclaw plugins install /tmp/hawk-bridge
```

O instalador gerencia automaticamente:

| Passo | O que faz |
|------|----------|
| 1 | Detecta e instala Node.js, Python3, git, curl |
| 2 | Instala dependências npm (lancedb, openai) |
| 3 | Instala pacotes Python (lancedb, rank-bm25, sentence-transformers) |
| 4 | Clona `context-hawk` para `~/.openclaw/workspace/context-hawk` |
| 5 | Cria symlink `~/.openclaw/hawk` |
| 6 | Instala **Ollama** (se ausente) |
| 7 | Baixa modelo de embedding `nomic-embed-text` |
| 8 | Compila hooks TypeScript e popula memória inicial |

**Distros suportadas**: Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### Início rápido por distro

| Distro | Comando de instalação |
|--------|---------------------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> O mesmo comando funciona em todas as distros. O instalador detecta automaticamente seu sistema e usa o gerenciador de pacotes correto.

---

## 🔧 Instalação manual (por distro)

Se preferir instalar manualmente em vez de usar o script:

### Ubuntu / Debian

```bash
# 1. Dependências do sistema
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependências Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Popular memória
node dist/seed.js

# 8. Ativar
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. Dependências do sistema
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependências Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Popular memória
node dist/seed.js

# 8. Ativar
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. Dependências do sistema
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependências Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Popular memória
node dist/seed.js

# 8. Ativar
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. Dependências do sistema
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependências Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Popular memória
node dist/seed.js

# 8. Ativar
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. Dependências do sistema
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependências Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + build
npm install && npm run build

# 7. Popular memória
node dist/seed.js

# 8. Ativar
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. Instalar Homebrew (se ausente)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Dependências do sistema
brew install node python git curl

# 3. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Dependências Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama (opcional)
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + build
npm install && npm run build

# 8. Popular memória
node dist/seed.js

# 9. Ativar
openclaw plugins install /tmp/hawk-bridge
```

> **Nota**: `--break-system-packages` é necessário no Linux para contornar PEP 668. Não necessário no macOS. O script de instalação do Ollama detecta macOS e usa Homebrew automaticamente.

---

## 🔧 Configuração

Após instalar, escolha seu modo de embedding — tudo via variáveis de ambiente:

```bash
# ① Ollama local (recomendado — grátis, sem chave API, acelerado por GPU)
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU local (grátis, sem GPU, modelo ~90MB)

# ③ Jina AI free tier (requer chave API gratuita de jina.ai)
export JINA_API_KEY=sua_chave_gratuita

# ④ BM25-only (padrão — sem config, busca por palavras-chave apenas)
```

### 🔑 Obtenha sua chave API Jina gratuita (Recomendado)

Jina AI oferece um **free tier generoso** — sem cartão de crédito:

1. **Cadastre-se** em https://jina.ai/ (login GitHub suportado)
2. **Obtenha a chave**: Vá para https://jina.ai/settings/ → API Keys → Create API Key
3. **Copie a chave**: começa com `jina_`
4. **Configure**:
```bash
export JINA_API_KEY=jina_SUA_CHAVE_AQUI
```

> **Por que Jina?** 1M tokens/mês grátis, ótima qualidade, compatível com OpenAI, mais fácil de configurar.

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

Sem chaves API em arquivos de configuração — apenas variáveis de ambiente.

---

## 📊 Modos de recuperação

| Modo | Provider | Chave API | Qualidade | Velocidade |
|------|----------|---------|---------|-----------|
| **BM25-only** | Integrado | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | CPU local | ❌ | ⭐⭐⭐ | ⚡⚡ |
| **Ollama** | GPU local | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | Cloud | ✅ grátis | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**Padrão**: BM25-only — funciona imediatamente com zero configuração.

---

## 🔄 Lógica de degradação

```
Tem OLLAMA_BASE_URL?      → Híbrido completo: vetor + BM25 + RRF
Tem JINA_API_KEY?         → Jina vetores + BM25 + RRF
Has QWEN_API_KEY?          → Qianwen (阿里云 DashScope) + BM25 + RRF
Nada configurado?          → BM25-only (apenas palavras-chave, sem chamadas API)
```

Sem chave API = sem crash = degradação elegante.

---

## 📁 Estrutura de arquivos

```
hawk-bridge/
├── README.md
├── README.pt-BR.md
├── LICENSE
├── install.sh                   # Instalador de um comando (curl | bash)
├── package.json
├── openclaw.plugin.json          # Manifesto do plugin + configSchema
├── src/
│   ├── index.ts              # Ponto de entrada do plugin
│   ├── config.ts             # Leitor de config OpenClaw + detecção de env
│   ├── lancedb.ts           # Wrapper LanceDB
│   ├── embeddings.ts           # 5 providers de embedding
│   ├── retriever.ts           # Busca híbrida (BM25 + vetor + RRF)
│   ├── seed.ts               # Inicializador de seed memory
│   └── hooks/
│       ├── hawk-recall/      # Hook agent:bootstrap
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # Hook message:sent
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk (instalado por install.sh)
```

---

## 🔌 Especificações técnicas

| | |
|---|---|
| **Runtime** | Node.js 18+ (ESM), Python 3.12+ |
| **Vector DB** | LanceDB (local, serverless) |
| **Recuperação** | BM25 + busca vetorial ANN + fusão RRF |
| **Eventos Hook** | `agent:bootstrap` (recall), `message:sent` (capture) |
| **Dependências** | Zero dependência rígida — tudo opcional com auto-fallback |
| **Persistência** | Sistema de arquivos local, sem DB externa necessária |
| **Licença** | MIT |

---

## 🤝 Relação com context-hawk

| | hawk-bridge | context-hawk |
|---|---|---|
| **Papel** | Ponte de Hooks OpenClaw | Biblioteca de memória Python |
| **O que faz** | Dispara hooks, gerencia ciclo de vida | Extração de memória, pontuação, decaimento |
| **Interface** | TypeScript Hooks → LanceDB | Python `MemoryManager`, `VectorRetriever` |
| **Instala** | Pacotes npm, dependências do sistema | Clonado em `~/.openclaw/workspace/` |

**Trabalham juntos**: hawk-bridge decide *quando* agir, context-hawk gerencia *como*.

---

## 📖 Projetos relacionados

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Biblioteca de memória Python
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — Workspace de colaboração em equipe
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Padrões de desenvolvimento Laravel

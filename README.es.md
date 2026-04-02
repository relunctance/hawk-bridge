# 🦅 hawk-bridge

> **Puente de Hooks OpenClaw → Sistema de memoria Python hawk**
>
> *Dale memoria a cualquier AI Agent — autoCapture (extracción automática) + autoRecall (inyección automática), cero operación manual*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## Qué hace

Los agentes IA olvidan todo después de cada sesión. **hawk-bridge** conecta el sistema de hooks de OpenClaw con la memoria Python de hawk, dando a los agentes una memoria persistente y auto-mejorable:

- **Cada respuesta** → hawk extrae y almacena memorias significativas
- **Cada nueva sesión** → hawk inyecta memorias relevantes antes de que comience el pensamiento
- **Sin operación manual** — funciona solo

**Sin hawk-bridge:**
> Usuario: "Prefiero respuestas concisas, no párrafos"
> Agente: "¡Entendido!" ✅
> (siguiente sesión — el agente olvida de nuevo)

**Con hawk-bridge:**
> Usuario: "Prefiero respuestas concisas"
> Agente: almacenado como `preference:communication` ✅
> (siguiente sesión — inyectado automáticamente, aplicado inmediatamente)

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


## ✨ Funcionalidades principales

| # | Funcionalidad | Descripción |
|---|---------|-------|
| 1 | **Hook Auto-Capture** | `message:sent` → hawk extrae automáticamente 6 categorías de memorias |
| 2 | **Hook Auto-Recall** | `agent:bootstrap` → hawk inyecta memorias relevantes antes de la primera respuesta |
| 3 | **Recuperación híbrida** | BM25 + búsqueda vectorial + fusión RRF — sin clave API requerida |
| 4 | **Fallback sin configuración** | Funciona inmediatamente en modo BM25-only, sin claves API |
| 5 | **4 Proveedores de embedding** | Ollama (local) / sentence-transformers (CPU) / Jina AI (API gratuita) / OpenAI |
| 6 | **Degradación elegante** | Cambia automáticamente cuando las claves API no están disponibles |
| 7 | **Inyección contextual** | Puntuación BM25 usada directamente cuando no hay embedder disponible |
| 8 | **Memoria seed** | Pre-poblada con estructura de equipo, normas y contexto del proyecto |
| 9 | **Recall sub-100ms** | Índice ANN de LanceDB para recuperación instantánea |
| 10 | **Instalación multiplataforma** | Un comando, funciona en Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE |

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← Inyecta memorias relevantes  │
│  │    (before first response)  │     en el contexto del agente   │
│  └─────────────────────────────┘                                │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   Búsqueda vectorial + BM25 + RRF        │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← Extracción / puntuación / decaimiento │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Instalación con un comando

```bash
# Instalación remota (recomendada — una línea, totalmente automática)
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# Luego activar:
openclaw plugins install /tmp/hawk-bridge
```

El instalador maneja automáticamente:

| Paso | Qué hace |
|------|----------|
| 1 | Detecta e instala Node.js, Python3, git, curl |
| 2 | Instala dependencias npm (lancedb, openai) |
| 3 | Instala paquetes Python (lancedb, rank-bm25, sentence-transformers) |
| 4 | Clona `context-hawk` en `~/.openclaw/workspace/context-hawk` |
| 5 | Crea enlace simbólico `~/.openclaw/hawk` |
| 6 | Instala **Ollama** (si no está presente) |
| 7 | Descarga modelo de embedding `nomic-embed-text` |
| 8 | Compila Hooks TypeScript y sembrar memorias iniciales |

**Distribuciones soportadas**: Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### Inicio rápido por distro

| Distro | Comando de instalación |
|--------|----------------------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> El mismo comando funciona en todas las distros. El instalador detecta automáticamente tu sistema y usa el gestor de paquetes correcto.

---

## 🔧 Instalación manual (por distro)

Si prefieres instalar manualmente en lugar de usar el script:

### Ubuntu / Debian

```bash
# 1. Dependencias del sistema
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependencias Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + compilar
npm install && npm run build

# 7. Sembrar memoria
node dist/seed.js

# 8. Activar
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. Dependencias del sistema
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependencias Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + compilar
npm install && npm run build

# 7. Sembrar memoria
node dist/seed.js

# 8. Activar
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. Dependencias del sistema
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependencias Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + compilar
npm install && npm run build

# 7. Sembrar memoria
node dist/seed.js

# 8. Activar
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. Dependencias del sistema
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependencias Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + compilar
npm install && npm run build

# 7. Sembrar memoria
node dist/seed.js

# 8. Activar
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. Dependencias del sistema
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Dependencias Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (opcional)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + compilar
npm install && npm run build

# 7. Sembrar memoria
node dist/seed.js

# 8. Activar
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. Instalar Homebrew (si no está presente)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Dependencias del sistema
brew install node python git curl

# 3. Clonar repo
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Dependencias Python
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama (opcional)
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + compilar
npm install && npm run build

# 8. Sembrar memoria
node dist/seed.js

# 9. Activar
openclaw plugins install /tmp/hawk-bridge
```

> **Nota**: `--break-system-packages` es necesario en Linux para evitar PEP 668. No es necesario en macOS. El script de instalación de Ollama detecta macOS y usa Homebrew automáticamente.

---

## 🔧 Configuración

Después de instalar, elige tu modo de embedding — todo mediante variables de entorno:

```bash
# ① Ollama local (recomendado — gratis, sin clave API, acelerado por GPU)
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU local (gratis, sin GPU, modelo ~90MB)

# ③ Jina AI free tier (requiere clave API gratuita de jina.ai)
export JINA_API_KEY=tu_clave_gratuita

# ④ BM25-only (por defecto — sin configuración, solo búsqueda por palabras clave)
```

### 🔑 Obtén tu clave API Jina gratuita (Recomendado)

Jina AI ofrece un **free tier generoso** — sin tarjeta de crédito requerida:

1. **Regístrate** en https://jina.ai/ (soporte para login con GitHub)
2. **Obtén la clave**: Ve a https://jina.ai/settings/ → API Keys → Create API Key
3. **Copia la clave**: comienza con `jina_`
4. **Configura**:
```bash
export JINA_API_KEY=jina_TU_CLAVE_AQUI
```

> **¿Por qué Jina?** 1M tokens/mes gratis, gran calidad, compatible con OpenAI, el más fácil de configurar.

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

Sin claves API en archivos de configuración — solo variables de entorno.

---

## 📊 Modos de recuperación

| Modo | Provider | Clave API | Calidad | Velocidad |
|------|----------|---------|---------|-----------|
| **BM25-only** | Integrado | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | CPU local | ❌ | ⭐⭐⭐ | ⚡⚡ |
| **Ollama** | GPU local | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | Cloud | ✅ gratis | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**Por defecto**: BM25-only — funciona inmediatamente con cero configuración.

---

## 🔄 Lógica de degradación

```
¿Tienes OLLAMA_BASE_URL?      → Híbrido completo: vector + BM25 + RRF
¿Tienes JINA_API_KEY?          → Jina vectores + BM25 + RRF
Has QWEN_API_KEY?          → Qianwen (阿里云 DashScope) + BM25 + RRF
¿Nada configurado?             → BM25-only (solo palabras clave, sin llamadas API)
```

Sin clave API = sin fallos = degradación elegante.

---

## 🌱 Memoria seed

En la primera instalación, 11 memorias fundacionales se siembran automáticamente:

- Estructura del equipo (roles main/wukong/bajie/bailong/tseng)
- Normas de colaboración (flujo de trabajo GitHub inbox → done)
- Contexto del proyecto (hawk-bridge, qujingskills, gql-openclaw)
- Preferencias de comunicación
- Principios de ejecución

Esto asegura que hawk-recall tenga algo que inyectar desde el primer día.

---

## 📁 Estructura de archivos

```
hawk-bridge/
├── README.md
├── README.es.md
├── LICENSE
├── install.sh                   # Instalador de un comando (curl | bash)
├── package.json
├── openclaw.plugin.json          # Manifiesto del plugin + configSchema
├── src/
│   ├── index.ts              # Punto de entrada del plugin
│   ├── config.ts             # Lector de config OpenClaw + detección de env
│   ├── lancedb.ts           # Wrapper de LanceDB
│   ├── embeddings.ts           # 5 proveedores de embedding
│   ├── retriever.ts           # Búsqueda híbrida (BM25 + vector + RRF)
│   ├── seed.ts               # Inicializador de memoria seed
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

## 🔌 Especificaciones técnicas

| | |
|---|---|
| **Runtime** | Node.js 18+ (ESM), Python 3.12+ |
| **Vector DB** | LanceDB (local, serverless) |
| **Recuperación** | BM25 + búsqueda vectorial ANN + fusión RRF |
| **Eventos Hook** | `agent:bootstrap` (recall), `message:sent` (capture) |
| **Dependencias** | Cero dependencia dura — todo opcional con auto-fallback |
| **Persistencia** | Sistema de archivos local, sin DB externa requerida |
| **Licencia** | MIT |

---

## 🤝 Relación con context-hawk

| | hawk-bridge | context-hawk |
|---|---|---|
| **Rol** | Puente de Hooks OpenClaw | Biblioteca de memoria Python |
| **Qué hace** | Dispara hooks, gestiona el ciclo de vida | Extracción de memoria, puntuación, decaimiento |
| **Interfaz** | TypeScript Hooks → LanceDB | Python `MemoryManager`, `VectorRetriever` |
| **Instala** | Paquetes npm, dependencias del sistema | Clonado en `~/.openclaw/workspace/` |

**Funcionan juntos**: hawk-bridge decide *cuándo* actuar, context-hawk maneja *cómo*.

---

## 📖 Proyectos relacionados

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Biblioteca de memoria Python
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — Espacio de trabajo de colaboración en equipo
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Estándares de desarrollo Laravel

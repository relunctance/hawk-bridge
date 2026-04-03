# 🦅 hawk-bridge

> **OpenClaw Hook Bridge → Python память hawk**
>
> *Дайте любому AI Agent память — autoCapture (автоизвлечение) + autoRecall (автовнедрение), ноль ручных операций*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## Что это делает

AI агенты забывают всё после каждой сессии. **hawk-bridge** связывает систему хуков OpenClaw с Python-памятью hawk, давая агентам постоянно улучшающуюся память:

- **Каждый ответ** → hawk автоматически извлекает и сохраняет значимые воспоминания
- **Каждая новая сессия** → hawk внедряет релевантные воспоминания до начала рассуждений
- **Никаких ручных операций** — просто работает

**Без hawk-bridge:**
> Пользователь: "Я предпочитаю краткие ответы, а не абзацы"
> Агент: "Конечно!" ✅
> (следующая сессия — агент снова забывает)

**С hawk-bridge:**
> Пользователь: "Я предпочитаю краткие ответы"
> Агент: сохранено как `preference:communication` ✅
> (следующая сессия — автоматически внедрено, сразу применяется)

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


## ✨ Ключевые функции

| # | Функция | Описание |
|---|---------|-------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk автоматически извлекает 6 категорий воспоминаний |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk внедряет релевантные воспоминания перед первым ответом |
| 3 | **Гибридный поиск** | BM25 + векторный поиск + RRF-фьюжн — без API-ключа |
| 4 | **Zero-Config Fallback** | Работает сразу в режиме BM25-only, без API-ключей |
| 5 | **4 провайдера эмбеддингов** | Ollama (локально) / sentence-transformers (CPU) / Jina AI (бесплатное API) / OpenAI |
| 6 | **Graceful Degradation** | Автоматически переключается при недоступности API-ключей |
| 7 | **Контекстное внедрение** | Оценка BM25 используется напрямую при отсутствии эмбеддера |
| 9 | **Sub-100ms Recall** | ANN-индекс LanceDB для мгновенного поиска |
| 10 | **Кроссплатформенная установка** | Одна команда для Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE |

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← Внедряет релевантные        │
│  │    (before first response)  │     воспоминания в контекст    │
│  └─────────────────────────────┘     агента                      │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   Векторный поиск + BM25 + RRF           │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← Извлечение / оценка / затухание │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Установка одной командой

```bash
# Удалённая установка (рекомендуется — одна строка, полностью автоматически)
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# Затем активировать:
openclaw plugins install /tmp/hawk-bridge
```

Установщик автоматически выполняет:

| Шаг | Что делает |
|------|----------|
| 1 | Определяет и устанавливает Node.js, Python3, git, curl |
| 2 | Устанавливает npm-зависимости (lancedb, openai) |
| 3 | Устанавливает Python-пакеты (lancedb, rank-bm25, sentence-transformers) |
| 4 | Клонирует `context-hawk` в `~/.openclaw/workspace/context-hawk` |
| 5 | Создаёт symlink `~/.openclaw/hawk` |
| 6 | Устанавливает **Ollama** (если отсутствует) |
| 7 | Скачивает модель эмбеддинга `nomic-embed-text` |
| 8 | Компилирует TypeScript hooks и инициализирует seed-память |

**Поддерживаемые дистрибутивы**: Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### Быстрый старт по дистрибутивам

| Дистрибутив | Команда установки |
|--------|-------------------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> Та же команда работает на всех дистрибутивах. Установщик автоматически определяет вашу систему и выбирает правильный пакетный менеджер.

---

## 🔧 Ручная установка (по дистрибутивам)

Если вы предпочитаете установить вручную:

### Ubuntu / Debian

```bash
# 1. Системные зависимости
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. Клонировать репозиторий
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-зависимости
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (опционально)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + сборка
npm install && npm run build

# 7. Seed память
node dist/seed.js

# 8. Активировать
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. Системные зависимости
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. Клонировать репозиторий
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-зависимости
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (опционально)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + сборка
npm install && npm run build

# 7. Seed память
node dist/seed.js

# 8. Активировать
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. Системные зависимости
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. Клонировать репозиторий
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-зависимости
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (опционально)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + сборка
npm install && npm run build

# 7. Seed память
node dist/seed.js

# 8. Активировать
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. Системные зависимости
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. Клонировать репозиторий
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-зависимости
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (опционально)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + сборка
npm install && npm run build

# 7. Seed память
node dist/seed.js

# 8. Активировать
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. Системные зависимости
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. Клонировать репозиторий
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python-зависимости
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (опционально)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + сборка
npm install && npm run build

# 7. Seed память
node dist/seed.js

# 8. Активировать
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. Установить Homebrew (если отсутствует)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Системные зависимости
brew install node python git curl

# 3. Клонировать репозиторий
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Python-зависимости
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama (опционально)
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + сборка
npm install && npm run build

# 8. Seed память
node dist/seed.js

# 9. Активировать
openclaw plugins install /tmp/hawk-bridge
```

> **Примечание**: На Linux требуется `--break-system-packages` для обхода PEP 668. На macOS не требуется. Скрипт установки Ollama автоматически определяет macOS и использует Homebrew.

---

## 🔧 Конфигурация

После установки выберите режим эмбеддинга — всё через переменные окружения:

```bash
# ① Ollama локально (рекомендуется — бесплатно, без API-ключа, GPU-ускорение)
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU локально (бесплатно, без GPU, модель ~90MB)

# ③ Jina AI бесплатный тариф (требуется бесплатный API-ключ с jina.ai)
export JINA_API_KEY=ваш_бесплатный_ключ

# ④ Без настройки → BM25-only режим (по умолчанию, только поиск по ключевым словам)
```

### 🔑 Получите бесплатный Jina API-ключ (Рекомендуется)

Jina AI предлагает **щедрый бесплатный тариф** — без кредитной карты:

1. **Зарегистрируйтесь** на https://jina.ai/ (поддерживается GitHub-вход)
2. **Получите ключ**: Перейдите на https://jina.ai/settings/ → API Keys → Create API Key
3. **Скопируйте ключ**: начинается с `jina_`
4. **Настройте**:
```bash
export JINA_API_KEY=jina_ВАШ_КЛЮЧ
```

> **Почему Jina?** 1M токенов/месяц бесплатно, отличное качество, совместимость с OpenAI, простейшая настройка.

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

API-ключи не в файлах конфигурации — только переменные окружения.

---

## 📊 Режимы поиска

| Режим | Провайдер | API-ключ | Качество | Скорость |
|------|----------|---------|---------|---------|
| **BM25-only** | Встроенный | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | Локальный CPU | ❌ | ⭐⭐⭐ | ⭐⚡ |
| **Ollama** | Локальный GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | Облако | ✅ бесплатно | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**По умолчанию**: BM25-only — работает сразу без настройки.

---

## 🔄 Логика деградации

```
Есть OLLAMA_BASE_URL?      → Полный гибрид: вектор + BM25 + RRF
Есть JINA_API_KEY?          → Jina векторы + BM25 + RRF
Has QWEN_API_KEY?          → Qianwen (阿里云 DashScope) + BM25 + RRF
Ничего не настроено?        → BM25-only (только ключевые слова, без API-вызовов)
```

Нет API-ключа = нет сбоя = Graceful Degradation.

---

## 📁 Структура файлов

```
hawk-bridge/
├── README.md
├── README.ru.md
├── LICENSE
├── install.sh                   # Установщик одной командой (curl | bash)
├── package.json
├── openclaw.plugin.json          # Манифест плагина + configSchema
├── src/
│   ├── index.ts              # Точка входа плагина
│   ├── config.ts             # Чтение конфига OpenClaw + определение env
│   ├── lancedb.ts           # Обертка LanceDB
│   ├── embeddings.ts           # 5 провайдеров эмбеддингов
│   ├── retriever.ts           # Гибридный поиск (BM25 + вектор + RRF)
│   ├── seed.ts               # Инициализатор seed-памяти
│   └── hooks/
│       ├── hawk-recall/      # Hook agent:bootstrap
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # Hook message:sent
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk (установлен install.sh)
```

---

## 🔌 Технические характеристики

| | |
|---|---|
| **Runtime** | Node.js 18+ (ESM), Python 3.12+ |
| **Vector DB** | LanceDB (локальная, serverless) |
| **Поиск** | BM25 + ANN векторный поиск + RRF-фьюжн |
| **Hook-события** | `agent:bootstrap` (recall), `message:sent` (capture) |
| **Зависимости** | Ноль жестких зависимостей — всё опционально с авто-fallback |
| **Персистентность** | Локальная файловая система, без внешней БД |
| **Лицензия** | MIT |

---

## 🤝 Отношение к context-hawk

| | hawk-bridge | context-hawk |
|---|---|---|
| **Роль** | OpenClaw Hook Bridge | Python библиотека памяти |
| **Что делает** | Триггерит хуки, управляет жизненным циклом | Извлечение памяти, оценка, затухание |
| **Интерфейс** | TypeScript Hooks → LanceDB | Python `MemoryManager`, `VectorRetriever` |
| **Устанавливает** | npm-пакеты, системные зависимости | Клонируется в `~/.openclaw/workspace/` |

**Они работают вместе**: hawk-bridge решает *когда* действовать, context-hawk отвечает за *как*.

---

## 📖 Связанные проекты

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python библиотека памяти
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — Рабочее пространство командной работы
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Стандарты разработки Laravel

# 🦅 hawk-bridge

> **OpenClaw Hook 브릿지 → hawk Python 메모리 시스템**
>
> *모든 AI Agent에 기억을 부여 — autoCapture(자동 추출) + autoRecall(자동 주입), 수동 작업 제로*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## 개요

AI Agent는 각 세션 후 모든 것을 잊어버립니다. **hawk-bridge**는 OpenClaw의 Hook 시스템과 hawk의 Python 메모리 시스템을 연결하여 Agent에게 지속 가능하고 자기 개선형 기억을 제공합니다:

- **모든 응답** → hawk가 의미 있는 메모리를 자동으로 추출하여 저장
- **모든 새 세션** → hawk가 사고 시작 전에 관련 메모리를 자동으로 주입
- **수동 작업 제로** — 꺼내자마자 작동, 자동 실행

**hawk-bridge 없이:**
> 사용자: "간결한 답변을 원합니다. 긴 문단은 싫어요."
> Agent: "알겠습니다!" ✅
> (다음 세션 — 다시 잊어버림)

**hawk-bridge로:**
> 사용자: "간결한 답변을 원합니다"
> Agent: `preference:communication`으로 저장됨 ✅
> (다음 세션 — 자동으로 주입되어 즉시 적용)

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


## ✨ 핵심 기능

| # | 기능 | 설명 |
|---|---------|-------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk가 6가지 카테고리 메모리를 자동 추출 |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk가 첫 응답 전에 관련 메모리 주입 |
| 3 | **하이브리드 검색** | BM25 + 벡터 검색 + RRF 퓨전, API 키 없이도 동작 |
| 4 | **제로 설정 폴백** | BM25-only 모드로 꺼내자마자 작동, API 키 불필요 |
| 5 | **4가지 임베딩 Provider** | Ollama(로컬) / sentence-transformers(CPU) / Jina AI(무료 API) / OpenAI |
| 6 | **그레이스풀 데그레이드** | API 키를 사용할 수 없을 때 자동으로 대안으로 전환 |
| 7 | **Embedder 없이도 검색 가능** | BM25 순위 점수를 직접 사용 |
| 8 | **시드 메모리** | 팀 구조,規範, 프로젝트 컨텍스트 등 11개 초기 메모리 사전 채워짐 |
| 9 | **100ms 미만의 리콜** | LanceDB ANN 인덱스로 순간 검색 |
| 10 | **크로스 플랫폼 설치** | 하나의 명령으로 Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE 지원 |

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← 첫 응답 전에              │
│  │    (before first response)  │     Agent 컨텍스트에           │
│  └─────────────────────────────┘     관련 메모리 주입            │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   벡터 검색 + BM25 + RRF 퓨전              │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← 추출 / 점수 매기기 / 감쇠 │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 원 команд 설치

```bash
# 원격 설치 (권장 — 한 줄, 완전 자동)
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# 그런 다음 활성화:
openclaw plugins install /tmp/hawk-bridge
```

설치 스크립트가 자동으로 다음을 수행합니다:

| 단계 | 내용 |
|------|------|
| 1 | Node.js, Python3, git, curl 감지 및 설치 |
| 2 | npm 종속성 설치 (lancedb, openai) |
| 3 | Python 패키지 설치 (lancedb, rank-bm25, sentence-transformers) |
| 4 | `context-hawk`를 `~/.openclaw/workspace/context-hawk`에 클론 |
| 5 | `~/.openclaw/hawk` 심볼릭 링크 생성 |
| 6 | **Ollama** 설치 (없는 경우) |
| 7 | `nomic-embed-text` 임베딩 모델 다운로드 |
| 8 | TypeScript Hooks 빌드 + 초기 메모리 시드 |

**지원 배포판**: Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### 배포판별 빠른 시작

| 배포판 | 설치 명령 |
|--------|---------------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> 동일한 명령이 모든 배포판에서 작동합니다. 설치 스크립트가 시스템을 자동 감지하여 올바른 패키지 관리자를 선택합니다.

---

## 🔧 수동 설치 (배포판별)

원 команд 스크립트를 사용하지 않으려면 수동으로 단계별로 설치할 수 있습니다:

### Ubuntu / Debian

```bash
# 1. 시스템 종속성
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. 리포지토리 클론
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 종속성
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (선택사항)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 빌드
npm install && npm run build

# 7. 메모리 시드
node dist/seed.js

# 8. 활성화
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. 시스템 종속성
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. 리포지토리 클론
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 종속성
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (선택사항)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 빌드
npm install && npm run build

# 7. 메모리 시드
node dist/seed.js

# 8. 활성화
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. 시스템 종속성
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. 리포지토리 클론
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 종속성
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (선택사항)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 빌드
npm install && npm run build

# 7. 메모리 시드
node dist/seed.js

# 8. 활성화
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. 시스템 종속성
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. 리포지토리 클론
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 종속성
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (선택사항)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 빌드
npm install && npm run build

# 7. 메모리 시드
node dist/seed.js

# 8. 활성화
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. 시스템 종속성
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. 리포지토리 클론
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 종속성
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama (선택사항)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 빌드
npm install && npm run build

# 7. 메모리 시드
node dist/seed.js

# 8. 활성화
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. Homebrew 설치 (없는 경우)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 시스템 종속성
brew install node python git curl

# 3. 리포지토리 클론
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Python 종속성
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama (선택사항)
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + 빌드
npm install && npm run build

# 8. 메모리 시드
node dist/seed.js

# 9. 활성화
openclaw plugins install /tmp/hawk-bridge
```

> **참고**: Linux에서는 PEP 668을 우회하기 위해 `--break-system-packages`가 필요합니다. macOS에서는 불필요합니다. Ollama 설치 스크립트는 macOS에서 자동으로 Homebrew를 사용합니다.

---

## 🔧 설정

설치 후 환경 변수로 임베딩 모드를 선택합니다:

```bash
# ① Ollama 로컬 (권장 — 완전 무료, API 키 불필요, GPU 가속)
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU 로컬 (완전 무료, GPU 불필요, 약 90MB 모델)

# ③ Jina AI 무료 티어 (jina.ai에서 무료 API 키 필요)
export JINA_API_KEY=내_무료_키

# ④ 설정 없음 → BM25-only 모드 (기본값, 키워드 검색만)
```

### 🔑 무료 Jina API 키 받기 (권장)

Jina AI는**넉넉한 무료 티어**를 제공하며 개인 사용에 충분합니다 (신용카드 불필요):

1. **등록**: https://jina.ai/ 에서 가입 (GitHub 로그인 지원)
2. **키 받기**: https://jina.ai/settings/ → API Keys → Create API Key
3. **키 복사**: `jina_`로 시작하는 문자열
4. **설정**:
```bash
export JINA_API_KEY=jina_내_키
```

> **왜 Jina인가?** 월 100만 토큰 무료, 우수한 품질, OpenAI 호환 형식, 가장 쉬운 설정.

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

> API 키는 설정 파일에 넣지 않고, 전부 환경 변수로 관리합니다.

---

## 📊 검색 모드 비교

| 모드 | Provider | API 키 | 품질 | 속도 |
|------|----------|---------|------|------|
| **BM25-only** | 내장 | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | 로컬 CPU | ❌ | ⭐⭐⭐ | ⭐⚡ |
| **Ollama** | 로컬 GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | 클라우드 | ✅ 무료 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**기본값**: BM25-only — 설정 없이 즉시 작동.

---

## 🔄 데그레이드 로직

```
OLLAMA_BASE_URL이 있나요?      → 완전 하이브리드: 벡터 + BM25 + RRF
JINA_API_KEY가 있나요?         → Jina 벡터 + BM25 + RRF
Has QWEN_API_KEY?          → Qianwen (阿里云 DashScope) + BM25 + RRF
아무것도 설정되지 않았나요?      → BM25-only (키워드만, API 호출 없음)
```

API 키 없음 = 충돌 없음 = 그레이스풀 데그레이드.

---

## 🌱 시드 메모리

첫 설치 시 11개의 기초 메모리가 자동으로 시드됩니다:

- 팀 구조 (main/wukong/bajie/bailong/tseng 역할)
- 협업規範 (GitHub inbox → done 워크플로우)
- 프로젝트 컨텍스트 (hawk-bridge, qujingskills, gql-openclaw)
- 커뮤니케이션 선호도
- 실행 원칙

이 메모리들은 hawk-recall이 첫날부터 주입할 콘텐츠를 갖도록 합니다.

---

## 📁 파일 구조

```
hawk-bridge/
├── README.md
├── README.ko.md
├── LICENSE
├── install.sh                   # 원 명령 설치 관리자 (curl | bash)
├── package.json
├── openclaw.plugin.json          # 플러그인 매니페스트 + configSchema
├── src/
│   ├── index.ts              # 플러그인 진입점
│   ├── config.ts             # OpenClaw 설정 리더 + 환경 감지
│   ├── lancedb.ts           # LanceDB 래퍼
│   ├── embeddings.ts           # 5가지 임베딩 Provider
│   ├── retriever.ts           # 하이브리드 검색 (BM25 + 벡터 + RRF)
│   ├── seed.ts               # 시드 메모리 이니셜라이저
│   └── hooks/
│       ├── hawk-recall/      # agent:bootstrap Hook
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # message:sent Hook
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk (install.sh가 설치)
```

---

## 🔌 기술 사양

| | |
|---|---|
| **런타임** | Node.js 18+ (ESM), Python 3.12+ |
| **벡터 DB** | LanceDB (로컬, 서버리스) |
| **검색** | BM25 + ANN 벡터 검색 + RRF 퓨전 |
| **Hook 이벤트** | `agent:bootstrap` (recall), `message:sent` (capture) |
| **종속성** | 하드 종속성 제로 — 모두 선택적, 자동 폴백 |
| **영속성** | 로컬 파일 시스템, 외부 DB 불필요 |
| **라이선스** | MIT |

---

## 🤝 context-hawk와의 관계

| | hawk-bridge | context-hawk |
|---|---|---|
| **역할** | OpenClaw Hook 브릿지 | Python 메모리 라이브러리 |
| **하는 일** | Hook 트리거, 라이프사이클 관리 | 메모리 추출, 점수 매기기, 감쇠 |
| **인터페이스** | TypeScript Hooks → LanceDB | Python `MemoryManager`, `VectorRetriever` |
| **설치** | npm 패키지, 시스템 종속성 | `~/.openclaw/workspace/`에 클론 |

**함께 작동**: hawk-bridge는 *언제* 행동할지를 결정하고, context-hawk는 *어떻게* 실행할지를 담당합니다.

---

## 📖 관련 프로젝트

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python 메모리 라이브러리
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — 팀 협업 워크스페이스
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Laravel 개발 표준

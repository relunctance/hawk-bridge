# 🦅 hawk-bridge

> **OpenClaw Hook ブリッジ → hawk Python メモリシステム**
>
> *任意の AI Agent に記憶を付与 — autoCapture（自動抽出）+ autoRecall（自動注入）、手作業ゼロ*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md)** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## 概要

AI Agent はセッションごとにすべてを忘れます。**hawk-bridge** は OpenClaw の Hook システムと hawk の Python メモリシステムを橋渡しし、Agent に永続的で自己改善型の記憶を付与します：

- **すべての返信** → hawk が意味のあるメモリを自動抽出・保存
- **すべての新規セッション** → hawk が思考前に相關メモリを自動注入
- **手作業ゼロ** — 箱から出してすぐ動作、自动運行

**hawk-bridge なし：**
> ユーザー：「簡潔な返信をお願いします。長文は避けてください」
> Agent：「承知しました！」 ✅
> （次のセッション — また忘れる）

**hawk-bridge あり：**
> ユーザー：「簡潔な返信をお願いします」
> Agent：`preference:communication` として保存 ✅
> （次のセッション — 自動注入、すぐに適用）

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


## ✨ コア機能

| # | 機能 | 説明 |
|---|---------|-------|
| 1 | **Auto-Capture Hook** | `message:sent` → hawk が 6 カテゴリのメモリを自動抽出 |
| 2 | **Auto-Recall Hook** | `agent:bootstrap` → hawk が最初の返信前に関連メモリを注入 |
| 3 | **ハイブリッド検索** | BM25 + ベクトル検索 + RRF フュージョン、API キー不要 |
| 4 | **ゼロ設定フォールバック** | BM25-only モードで箱から出してすぐ動作、API キー不要 |
| 5 | **4 種類の埋め込み Provider** | Ollama（ローカル）/ sentence-transformers（CPU）/ Jina AI（free API）/ OpenAI |
| 6 | **グレースフルデグラデーション** | API キーが利用できない場合、自動的に代替手段に切り替え |
| 7 | **Embedder なしでも検索可能** | BM25 ランキングスコアを直接使用 |
| 8 | **シードメモリ** | チーム構造、規範、プロジェクトコンテキストなど 11 件の初期メモリを事前登録 |
| 9 | **サブ 100ms  recall** | LanceDB ANN インデックスで瞬時検索 |
| 10 | **クロスプラットフォーム対応** | 1 コマンドで Ubuntu/Debian/Fedora/Arch/Alpine/openSUSE に対応 |

---

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                               │
│  agent:bootstrap │  message:sent                                │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                │
│  │       🦅 hawk-recall       │  ← 最初の返信前に             │
│  │    (before first response)  │     Agent コンテキストに      │
│  └─────────────────────────────┘     関連メモリを注入           │
│                   ↓                                               │
│  ┌─────────────────────────────────────────┐                   │
│  │              LanceDB                      │                   │
│  │   ベクトル検索 + BM25 + RRF フュージョン │                   │
│  └─────────────────────────────────────────┘                   │
│                   ↓                                               │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← 抽出 / スコアリング / 減衰 │
│         │  MemoryManager + Extractor │                       │
│         └───────────────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 ワンコマンドインストール

```bash
# リモートインストール（推奨 — 1 行、完全自動）
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# 続いてアクティブ化：
openclaw plugins install /tmp/hawk-bridge
```

インストールスクリプトが自動的に以下を実行：

| ステップ | 内容 |
|------|------|
| 1 | Node.js、Python3、git、curl を検出・インストール |
| 2 | npm 依存関係をインストール（lancedb、openai） |
| 3 | Python パッケージをインストール（lancedb、rank-bm25、sentence-transformers） |
| 4 | `context-hawk` を `~/.openclaw/workspace/context-hawk` にクローン |
| 5 | `~/.openclaw/hawk` シンボリックリンクを作成 |
| 6 | **Ollama** をインストール（存在しない場合） |
| 7 | `nomic-embed-text` 埋め込みモデルをダウンロード |
| 8 | TypeScript Hooks をビルド + 初期メモリをシード |

**対応ディストリビューション**：Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### ディストリビューション別クイックスタート

| ディストリビューション | インストールコマンド |
|--------|---------------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> 同じコマンドがすべてのディストリビューションで動作します。インストールスクリプトがシステムを自動検出、適切なパッケージマネージャーを選択します。

---

## 🔧 手動インストール（ディストリビューション別）

ワンコマンドスクリプトを使用したくない場合は、手動でステップバイステップインストールできます：

### Ubuntu / Debian

```bash
# 1. システム依存関係
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. リポジトリをクローン
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依存関係
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（オプション）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + ビルド
npm install && npm run build

# 7. メモリをシード
node dist/seed.js

# 8. アクティブ化
openclaw plugins install /tmp/hawk-bridge
```

### Fedora / RHEL / CentOS / Rocky / AlmaLinux

```bash
# 1. システム依存関係
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. リポジトリをクローン
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依存関係
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（オプション）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + ビルド
npm install && npm run build

# 7. メモリをシード
node dist/seed.js

# 8. アクティブ化
openclaw plugins install /tmp/hawk-bridge
```

### Arch / Manjaro / EndeavourOS

```bash
# 1. システム依存関係
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. リポジトリをクローン
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依存関係
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（オプション）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + ビルド
npm install && npm run build

# 7. メモリをシード
node dist/seed.js

# 8. アクティブ化
openclaw plugins install /tmp/hawk-bridge
```

### Alpine

```bash
# 1. システム依存関係
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. リポジトリをクローン
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依存関係
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（オプション）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + ビルド
npm install && npm run build

# 7. メモリをシード
node dist/seed.js

# 8. アクティブ化
openclaw plugins install /tmp/hawk-bridge
```

### openSUSE / SUSE Linux Enterprise

```bash
# 1. システム依存関係
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. リポジトリをクローン
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依存関係
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（オプション）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + ビルド
npm install && npm run build

# 7. メモリをシード
node dist/seed.js

# 8. アクティブ化
openclaw plugins install /tmp/hawk-bridge
```

### macOS

```bash
# 1. Homebrew をインストール（未インストールの場合）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. システム依存関係
brew install node python git curl

# 3. リポジトリをクローン
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Python 依存関係
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama（オプション）
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + ビルド
npm install && npm run build

# 8. メモリをシード
node dist/seed.js

# 9. アクティブ化
openclaw plugins install /tmp/hawk-bridge
```

> **注意**：Linux では PEP 668 をバイパスするために `--break-system-packages` が必要です。macOS では不要です。Ollama インストールスクリプトは macOS で Homebrew を自動使用します。

---

## 🔧 設定

インストール後、環境変数で埋め込みモードを選択：

```bash
# ① Ollama ローカル（推奨 — 完全無料、API キー不要、GPU 対応）
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU ローカル（完全無料、GPU 不要、約 90MB モデル）

# ③ Jina AI フリープラン（jina.ai から無料 API キーを取得）
export JINA_API_KEY=あなたの無料キー

# ④ 設定なし → BM25-only モード（デフォルト、キーワード検索のみ）
```

### 🔑 免费 Jina API キーを取得（推奨）

Jina AI は**十分な無料枠**を提供しており、個人利用には十分です（クレジットカード不要）：

1. **登録**：https://jina.ai/ にアクセス（GitHub ログイン対応）
2. **キーを取得**：https://jina.ai/settings/ → API Keys → Create API Key
3. **キーをコピー**：`jina_` で始まる文字列
4. **設定**：
```bash
export JINA_API_KEY=jina_あなたのキー
```

> **なぜ Jina なのか？** 月間 100 万トークンの無料枠、優れた品質、OpenAI 互換フォーマット、最も簡単な設定。

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

> API キーは設定ファイルに記述せず、すべて環境変数で管理します。

---

## 📊 検索モード比較

| モード | Provider | API キー | 品質 | 速度 |
|------|----------|---------|------|------|
| **BM25-only** | 組み込み | ❌ | ⭐⭐ | ⚡⚡⚡ |
| **sentence-transformers** | ローカル CPU | ❌ | ⭐⭐⭐ | ⚡⚡ |
| **Ollama** | ローカル GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |
| **Jina AI** | クラウド | ✅ 免费 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ |

**デフォルト**：BM25-only — 設定なしで動作開始。

---

## 🔄 デグラデーションロジック

```
OLLAMA_BASE_URL がある場合？      → 完全ハイブリッド：ベクトル + BM25 + RRF
JINA_API_KEY がある場合？         → Jina ベクトル + BM25 + RRF
何も設定されていない？             → BM25-only（キーワードのみ、API 呼び出しなし）
```

API キーなし = クラッシュなし = グレースフルデグラデーション。

---

## 🌱 シードメモリ

初回インストール時に 11 件の基盤メモリが自動的にシードされます：

- チーム構造（main/wukong/bajie/bailong/tseng の役割）
- コラボレーション規範（GitHub inbox → done ワークフロー）
- プロジェクトコンテキスト（hawk-bridge、qujingskills、gql-openclaw）
- コミュニケーションの好み
- 動作原則

これらにより、hawk-recall は初日から注入するコンテンツを持ちます。

---

## 📁 ファイル構造

```
hawk-bridge/
├── README.md
├── README.ja.md
├── LICENSE
├── install.sh                   # ワンコマンドインストーラー（curl | bash）
├── package.json
├── openclaw.plugin.json          # プラグイン マニフェスト + configSchema
├── src/
│   ├── index.ts              # プラグイン エントリポイント
│   ├── config.ts             # OpenClaw 設定リーダー + 環境検出
│   ├── lancedb.ts           # LanceDB ラッパー
│   ├── embeddings.ts           # 5 つの埋め込み Provider
│   ├── retriever.ts           # ハイブリッド検索（BM25 + ベクトル + RRF）
│   ├── seed.ts               # シードメモリ初期化子
│   └── hooks/
│       ├── hawk-recall/      # agent:bootstrap Hook
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # message:sent Hook
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk（install.sh でインストール）
```

---

## 🔌 技術仕様

| | |
|---|---|
| **ランタイム** | Node.js 18+ (ESM)、Python 3.12+ |
| **ベクトル DB** | LanceDB（ローカル、サーバーレス） |
| **検索** | BM25 + ANN ベクトル検索 + RRF フュージョン |
| **Hook イベント** | `agent:bootstrap`（recall）、`message:sent`（capture） |
| **依存関係** | ハード依存関係ゼロ — すべてオプション、自动フォールバック |
| **永続化** | ローカルファイルシステム、外部 DB 不要 |
| **ライセンス** | MIT |

---

## 🤝 context-hawk との関係

| | hawk-bridge | context-hawk |
|---|---|---|
| **役割** | OpenClaw Hook ブリッジ | Python メモリライブラリ |
| **動作** | Hook をトリガー、ライフサイクル管理 | メモリの抽出、スコアリング、減衰 |
| **インターフェース** | TypeScript Hooks → LanceDB | Python `MemoryManager`、`VectorRetriever` |
| **インストール** | npm パッケージ、システム依存関係 | `~/.openclaw/workspace/` にクローン |

**連携して動作**：hawk-bridge は「いつ」行動するかを決定し、context-hawk は「どのように」実行するかを担当します。

---

## 📖 関連プロジェクト

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python メモリライブラリ
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — チームコラボレーション ワークスペース
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Laravel 開発標準

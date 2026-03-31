# hawk-bridge

> **OpenClaw Hook Bridge → hawk Python Memory System**
> 为 hawk 添加 autoCapture（自动提取记忆）和 autoRecall（自动注入记忆）

---

## 架构

```
OpenClaw Gateway (TypeScript Hooks)
    │
    ├── agent:bootstrap
    │       → recall hook
    │       → LanceDB 向量检索
    │       → 记忆注入上下文
    │
    └── message:sent
            → capture hook
            → Python LLM 智能提取（6类分类）
            → LanceDB 写入
```

## 目录结构

```
hawk-bridge/
├── openclaw.plugin.json    # 插件元数据 + 配置schema
├── package.json            # npm依赖（lancedb, openai）
├── install.sh              # 一键安装脚本（支持跨Linux发行版）
├── src/
│   ├── index.ts           # 插件入口
│   ├── config.ts          # 从openclaw.json读取配置
│   ├── lancedb.ts         # LanceDB封装（存储/检索）
│   ├── embeddings.ts       # 向量化（OpenAI/Ollama/Jina/sentence-transformers）
│   ├── retriever.ts       # 混合检索（BM25 + 向量 + RRF融合）
│   ├── seed.ts            # 种子记忆初始化
│   └── hooks/
│       ├── hawk-recall/   # agent:bootstrap → 注入记忆
│       └── hawk-capture/  # message:sent → 提取记忆
└── python/                # context-hawk（通过 install.sh 克隆）
```

## 一键安装

**远程（推荐，一行命令）：**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)
```

**本地：**
```bash
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
bash /tmp/hawk-bridge/install.sh
```

安装脚本会自动：
- 检测并安装系统依赖（Node.js、Python3、git、curl）
- 安装 npm 和 Python 包
- 安装 Ollama + `nomic-embed-text` 向量模型
- 克隆 context-hawk workspace
- 创建必要符号链接
- 初始化种子记忆

**支持的 Linux 发行版**：Ubuntu / Debian / Fedora / CentOS / Arch / Alpine / openSUSE 等

## 启动插件

```bash
openclaw plugins install /tmp/hawk-bridge
```

## Embedding 配置（四选一）

安装完成后设置环境变量：

```bash
# ① Ollama 本地（推荐，完全免费）
export OLLAMA_BASE_URL=http://localhost:11434

# ② sentence-transformers CPU本地（完全免费，无需GPU）
export USE_LOCAL_EMBEDDING=1

# ③ Jina 免费 API（需要申请 key）
export JINA_API_KEY=你的key

# ④ 无配置 → BM25-only 模式（关键词检索，无需任何依赖）
```

> 默认 BM25-only 模式，不需要任何 API Key 或 Ollama。

## 配置（openclaw.json）

```json
{
  "plugins": {
    "load": {
      "paths": ["/absolute/path/to/hawk-bridge"]
    },
    "allow": ["hawk-bridge"]
  }
}
```

环境变量配置即可，无需在 openclaw.json 里写死 key。

## 降级机制

| 配置 | 模式 | 说明 |
|------|------|------|
| 无任何配置 | **BM25-only** | 纯关键词检索，无 API 调用 |
| `USE_LOCAL_EMBEDDING=1` | sentence-transformers | 本地 CPU 向量，~90MB 模型 |
| `OLLAMA_BASE_URL` | Ollama | 本地向量模型，支持 GPU |
| `JINA_API_KEY` | Jina AI | 免费 tier API |
| `MINIMAX_API_KEY` | Minimax | 需要 API Key |

## 依赖

**系统（install.sh 自动安装）：**
- Node.js ≥ 18、Python3、git、curl

**npm：**
- `@lancedb/lancedb` ≥ 0.26.2
- `openai` ≥ 6.21.0

**Python（pip，自动安装）：**
- `lancedb`、`openai`、`tiktoken`、`rank-bm25`、`sentence-transformers`

## 与 context-hawk 的关系

- **context-hawk**（Python 包）：`MemoryManager`、`VectorRetriever`、`Extractor` 等 Python 原生能力
- **hawk-bridge**（本插件）：OpenClaw Hooks → context-hawk 的桥接器

两者协同工作，hawk-bridge 负责"何时触发"，context-hawk 负责"具体怎么做"。

## 已知限制

1. Hook `agent:bootstrap` 的 recall 需要 OpenClaw 传递 session 历史
2. Python subprocess 调用有 ~1s 延迟，不影响 Gateway 响应
3. BM25-only 模式下无语义检索能力，关键词匹配为主

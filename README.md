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
├── src/
│   ├── index.ts           # 插件入口
│   ├── config.ts          # 从openclaw.json读取配置
│   ├── lancedb.ts        # LanceDB封装（存储/检索）
│   ├── embeddings.ts     # OpenAI/Jina向量化
│   └── hooks/
│       ├── recall.ts     # agent:bootstrap → 注入记忆
│       └── capture.ts    # message:sent → 提取记忆
└── python/
    └── hawk_memory/
        ├── __init__.py
        └── extractor.py  # LLM 6类分类提取器
```

## 安装

```bash
cd /path/to/hawk-bridge
npm install
bash install.sh
```

## 配置（openclaw.json）

```json
{
  "plugins": {
    "load": {
      "paths": ["/absolute/path/to/hawk-bridge"]
    },
    "allow": ["hawk-bridge"],
    "entries": {
      "hawk-bridge": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "openai",
            "apiKey": "${OPENAI_API_KEY}",
            "model": "text-embedding-3-small",
            "baseURL": "https://api.openai.com/v1",
            "dimensions": 1536
          },
          "recall": {
            "topK": 5,
            "minScore": 0.6,
            "injectEmoji": "🦅"
          },
          "capture": {
            "enabled": true,
            "maxChunks": 3,
            "importanceThreshold": 0.5
          },
          "python": {
            "pythonPath": "python3.12",
            "hawkDir": "~/.openclaw/hawk"
          }
        }
      }
    }
  }
}
```

## 依赖

**npm:**
- `@lancedb/lancedb` ≥ 0.26.2
- `openai` ≥ 6.21.0

**Python:**
- `lancedb`
- `openai`

```bash
pip install lancedb openai
```

## 与 context-hawk 的关系

- **context-hawk**（我们开发的Python包）：提供 `MemoryManager`、`VectorRetriever`、`MarkdownImporter` 等Python原生能力
- **hawk-bridge**（本插件）：桥接 OpenClaw Gateway Hooks → hawk Python 系统，实现零手动操作的 autoCapture/autoRecall

两者协同工作，hawk-bridge 负责"何时触发"，context-hawk 负责"具体怎么做"。

## 已知限制

1. Hook `agent:bootstrap` 的 recall 需要 OpenClaw 传递 session 历史，当前实现依赖 `sessionEntry.messages` API
2. Python subprocess 调用有 ~1s 延迟，不影响 Gateway 响应
3. 需配置 `OPENAI_API_KEY` 环境变量（或在 config 中直接传入）

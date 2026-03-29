# hawk-bridge — OpenClaw 记忆系统 Skill

> **OpenClaw Hook Bridge + context-hawk Python Memory Engine**
> 单一 Skill，同时解决：自动记忆捕获 + 自动记忆检索 + 四层衰减 + 向量搜索 + Markdown兼容

---

## 核心能力

| 能力 | 说明 |
|------|------|
| **autoCapture Hook** | 每次回复后，自动用 LLM 提取对话内容 → 存入 LanceDB |
| **autoRecall Hook** | 每次回复前，自动检索相关记忆 → 注入上下文 |
| **四层记忆衰减** | Working → Short → Long → Archive，自动淘汰低价值记忆 |
| **混合检索** | 向量 + BM25 + RRF融合 + 噪声过滤 + 交叉编码重排 |
| **Markdown兼容** | 一键导入用户已有 `.md` 记忆文件 |
| **零配置** | 自动读取 OpenClaw 配置（minimax等），无需额外 API Key |

---

## 架构

```
OpenClaw Gateway (TypeScript Hooks)
    │
    ├── agent:bootstrap → hawk-recall hook
    │       → HybridRetriever (向量 + BM25)
    │       → 检索 LanceDB
    │       → 记忆注入上下文 🦅
    │
    └── message:sent → hawk-capture hook
            → Python LLM 智能提取（fact/preference/decision/entity/other）
            → 存入 LanceDB
            → Governance 日志

Python Core (hawk_memory/)
    ├── memory.py       — MemoryManager 四层衰减
    ├── compressor.py   — ContextCompressor 上下文压缩
    ├── self_improving.py — 自我反思学习
    ├── extractor.py    — LLM 6类分类提取
    ├── governance.py   — 系统巡检指标
    ├── vector_retriever.py — 向量检索
    └── markdown_importer.py — .md 文件导入
```

---

## 安装

### 方式1：OpenClaw Skill（推荐）
```bash
openclaw skills install https://github.com/relunctance/hawk-bridge
```

### 方式2：手动安装
```bash
git clone git@github.com:relunctance/hawk-bridge.git /path/to/hawk-bridge
cd /path/to/hawk-bridge
npm install
pip install lancedb openai rank_bm25
```

### 注册到 openclaw.json
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

---

## 自动配置（零额外Key）

**embedding + LLM 默认使用 OpenClaw 已配置的 provider（minimax 等）：**

| 配置项 | 来源 | 说明 |
|--------|------|------|
| embedding provider | openclaw.json `models.providers` | 自动检测 |
| LLM provider | openclaw.json `models.providers` | 自动检测 |
| API Key | openclaw.json `auth.profiles` | 自动透传 |

**环境变量覆盖（可选）：**
```bash
export MINIMAX_API_KEY="your-key"        # Minimax API Key
export MINIMAX_BASE_URL="https://..."     # 自定义端点
export MINIMAX_MODEL="MiniMax-M2.7"      # 指定模型
export OLLAMA_BASE_URL="http://localhost:11434"  # Ollama本地（免费）
export LLM_PROVIDER="groq"               # 切换LLM后端
```

---

## 配置项（openclaw.json）

```json
{
  "plugins": {
    "entries": {
      "hawk-bridge": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "openclaw",
            "apiKey": "",
            "model": "embedding-minimax",
            "baseURL": "",
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

---

## Python API

### 四层记忆 + 衰减
```python
from hawk_memory import MemoryManager

mm = MemoryManager()
mm.store("用户偏好：喜欢简洁的回复风格", category="preference")
results = mm.recall("用户的沟通风格是什么")
print(results)
```

### 向量检索
```python
from hawk_memory.vector_retriever import VectorRetriever

retriever = VectorRetriever(top_k=5)
chunks = retriever.recall("老板之前部署过哪些服务")
print(retriever.format_for_context(chunks))
```

### Markdown 导入
```python
from hawk_memory.markdown_importer import MarkdownImporter

importer = MarkdownImporter(memory_dir="~/.openclaw/memory")
result = importer.import_all()  # 增量导入，已导入的打标签跳过
print(f"导入 {result['files']} 个文件, {result['chunks']} 个块")
```

### 上下文压缩
```python
from hawk_memory.compressor import ContextCompressor

compressor = ContextCompressor(max_tokens=4000)
compressed = compressor.compress(conversation_history)
```

### 自我反思
```python
from hawk_memory.self_improving import SelfImproving

si = SelfImproving()
si.learn_from_error("记忆提取返回空", context={"query": "..."})
stats = si.get_stats()
```

---

## CLI 工具

```bash
# 导入 Markdown 记忆文件
python3.12 -m hawk_memory.markdown_importer --dry-run  # 预览
python3.12 -m hawk_memory.markdown_importer            # 实际导入

# 记忆提取（LLM 6类分类）
echo "对话内容..." | python3.12 -m hawk_memory.extractor --provider openclaw

# 查看记忆数量
python3.12 -c "from hawk_memory import MemoryManager; print(MemoryManager().count())"

# 查看治理指标
python3.12 -c "from hawk_memory.governance import Governance; print(Governance().get_stats(24))"
```

---

## 与 context-hawk 的关系

**context-hawk** 是本 Skill 的底层 Python 引擎，已整合进 `python/hawk_memory/` 目录。

如果你之前装了 context-hawk 作为独立 Skill，可以卸载：
```bash
openclaw skills uninstall context-hawk
```

本 Skill 是 context-hawk 的超集，提供完整功能和自动 Hook。

---

## 目录结构

```
hawk-bridge/
├── SKILL.md                    ← 本文档
├── openclaw.plugin.json        ← 插件元数据 + 配置schema
├── package.json
├── src/
│   ├── index.ts              # 插件入口
│   ├── config.ts             # 自动读取openclaw.json配置
│   ├── lancedb.ts            # LanceDB封装
│   ├── embeddings.ts         # 向量化（多后端）
│   ├── retriever.ts          # 混合检索管线
│   └── hooks/
│       ├── recall.ts         # autoRecall hook
│       └── capture.ts        # autoCapture hook
└── python/
    └── hawk_memory/
        ├── __init__.py
        ├── memory.py         # MemoryManager 四层衰减
        ├── compressor.py     # ContextCompressor
        ├── config.py          # Config
        ├── self_improving.py # 自我反思
        ├── extractor.py      # LLM 6类提取
        ├── governance.py      # 治理指标
        ├── vector_retriever.py # 向量检索
        └── markdown_importer.py # Markdown导入
```

---

## 依赖

**npm:** `npm install`
- `@lancedb/lancedb` ≥ 0.26.2
- `openai` ≥ 6.21.0
- `rank_bm25` ≥ 1.2.0

**Python:** `pip install`
- `lancedb`
- `openai`
- `rank_bm25`

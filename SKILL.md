---
name: hawk-bridge
description: 'OpenClaw Hook Bridge + context-hawk Python Memory Engine. Auto-capture memories on every reply, auto-inject relevant memories before each response. Supports 4-tier decay, hybrid vector + BM25 search, and Markdown import.'
metadata:
  {
    "openclaw":
      {
        "emoji": "🦅",
        "requires": { "anyBins": ["node", "python3.12"] },
        "install": [
          {
            "id": "node-deps",
            "kind": "npm",
            "package": "@lancedb/lancedb",
            "label": "Install LanceDB (npm)"
          },
          {
            "id": "python-deps",
            "kind": "pip",
            "package": "lancedb openai rank-bm25",
            "label": "Install Python deps"
          }
        ]
      },
  }
---

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
| **零配置** | 默认 Jina 免费 Embedding API，装完就能用，无需任何 API Key |
| **28条文本清洗** | Markdown/URL/标点/时间戳/Emoji/HTML/调试日志等自动清理 |
| **敏感信息安全** | API Key/电话/邮箱/身份证/信用卡自动脱敏后存储 |
| **TTL 过期** | 记忆默认30天自动过期，节省存储空间 |
| **Recall 阈值门控** | relevance score < minScore 的记忆不注入上下文 |
| **审计日志** | 所有 capture/skip/reject/recall 事件记录到 `~/.hawk/audit.log` |
| **有害内容过滤** | 暴力/欺诈/黑客/CSAM 等内容在 capture 阶段直接拒绝 |

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

**大部分情况不需要配置**——装完默认 Jina 免费 API 就能跑。

如需定制，在 `openclaw.json` 的 `plugins.entries.hawk-bridge.config` 下添加：

```json
{
  "plugins": {
    "entries": {
      "hawk-bridge": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "jina",
            "apiKey": "",          // jina 免费，无需填
            "model": "jina-embeddings-v5-small",
            "dimensions": 1024
          },
          "llm": {
            "provider": "groq",
            "apiKey": "",          // groq 免费，无需填
            "model": "llama-3.3-70b-versatile"
          },
          "recall": {
            "topK": 5,
            "minScore": 0.6,
            "injectEmoji": "🦅"
          },
          "capture": {
            "enabled": true,
            "maxChunks": 3,
            "importanceThreshold": 0.5,
            "ttlMs": 2592000000,
            "maxChunkSize": 2000,
            "minChunkSize": 20,
            "dedupSimilarity": 0.95
          },
          "audit": {
            "enabled": true
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

**不要单独装 context-hawk！** hawk-bridge 安装脚本会自动克隆 context-hawk 到 `~/.openclaw/workspace/context-hawk`，并通过符号链接 `~/.openclaw/hawk` 指向它。

| | hawk-bridge | context-hawk |
|---|---|---|
| **安装方式** | `openclaw plugins install` 或 `clawhub install` | 由 hawk-bridge 自动管理 |
| **手动安装 context-hawk？** | ❌ 不要 | 会造成双份记忆数据 |
| **独立使用？** | ❌ 不支持，必须配合 OpenClaw | ✅ 可以，Python 库方式单独使用 |

**正确的安装流程：**
```bash
# 方式1：clawhub（推荐）
clawhub install hawk-bridge

# 方式2：直接安装脚本（自动处理一切）
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)
```

**卸载：**
```bash
openclaw plugins uninstall hawk-bridge   # 移除插件
rm -rf ~/.openclaw/hawk ~/.hawk         # 清除记忆数据（不可恢复！）
rm -rf ~/.openclaw/workspace/context-hawk
```

---

## 目录结构

```
hawk-bridge/                          ← OpenClaw 插件（TypeScript）
├── SKILL.md
├── install.sh                        ← 一键安装脚本
├── openclaw.plugin.json              ← 插件元数据 + 配置schema
├── manifest.json                     ← Hook 注册信息
├── package.json
└── src/
    ├── index.ts                     # 插件入口
    ├── config.ts                    # 自动读取 openclaw.json 配置
    ├── lancedb.ts                   # LanceDB 封装
    ├── embeddings.ts                # 向量化（多后端）
    ├── retriever.ts                 # 混合检索管线
    ├── constants.ts                 # 所有可调参数
    └── hooks/
        ├── hawk-recall/
        │   ├── handler.ts           # autoRecall handler
        │   └── HOOK.md
        └── hawk-capture/
            ├── handler.ts           # autoCapture handler（含 normalize）
            └── HOOK.md

~/.openclaw/workspace/context-hawk/  ← Python 记忆引擎（安装脚本自动克隆）
└── hawk/
    ├── memory.py                    # 四层记忆管理
    ├── normalize.py                 # 28条文本清洗（与 TypeScript 层同步）
    ├── extractor.py                  # LLM 6类提取
    ├── vector_retriever.py           # 向量检索
    ├── compressor.py                 # 上下文压缩
    ├── self_improving.py            # 自我反思
    ├── governance.py                 # 治理指标
    └── markdown_importer.py          # Markdown 导入

~/.openclaw/hawk → ~/.openclaw/workspace/context-hawk/hawk  ← 符号链接
~/.hawk/                                             ← LanceDB 数据目录
~/.hawk/audit.log                                    ← 审计日志
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

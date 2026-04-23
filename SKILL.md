---
name: hawk-bridge
description: 'OpenClaw Hook Bridge + Hermes Hook Bridge + context-hawk Python Memory Engine. Auto-capture memories on every reply, auto-inject relevant memories before each response. Supports 4-tier decay, hybrid vector + BM25 search, and Markdown import.'
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
| **6大检索优化** | Query扩展 · MMR多样性 · 置信度过滤 · 分域加权BM25 · 会话感知 · 结果压缩 |
| **Markdown兼容** | 一键导入用户已有 `.md` 记忆文件 |
| **零配置** | 默认 Jina 免费 Embedding API，装完就能用，无需任何 API Key |
| **28条文本清洗** | Markdown/URL/标点/时间戳/Emoji/HTML/调试日志等自动清理 |
| **敏感信息安全** | API Key/电话/邮箱/身份证/信用卡自动脱敏后存储 |
| **TTL 过期** | 记忆默认30天自动过期，节省存储空间 |
| **Recall 阈值门控** | relevance score < minScore 的记忆不注入上下文 |
| **审计日志** | 所有 capture/skip/reject/recall 事件记录到 `~/.hawk/audit.log` |
| **有害内容过滤** | 暴力/欺诈/黑客/CSAM 等内容在 capture 阶段直接拒绝 |
| **多模态记忆** | 支持 text / audio / video 三种来源，统一存储统一检索 |

---

## 多模态记忆

hawk-bridge v1.2+ 支持多模态记忆，统一存储 text、audio、video 类型的记忆。

### 记忆来源类型

| source_type | 说明 | 典型场景 |
|-------------|------|----------|
| `text` | 文本对话（默认） | 聊天记录、文档内容 |
| `audio` | 音频记忆 | 通话录音、会议录音、语音消息 |
| `video` | 视频记忆 | 会议录像、课程视频、演示文稿 |

### 数据模型

所有记忆统一存储在 `hawk_memories` 表，通过 `source_type` 字段区分：

```typescript
interface MemoryEntry {
  id: string;
  text: string;              // ASR 转录文本 / 视频描述
  vector: number[];          // 文本嵌入向量
  category: string;          // fact | preference | decision | entity
  scope: string;
  importance: number;
  timestamp: number;
  expiresAt: number;
  metadata: Record<string, unknown>;  // 类型特有元数据
  source_type: 'text' | 'audio' | 'video';  // 记忆来源
}
```

### metadata 结构

```typescript
// audio 记忆
metadata: {
  audio: {
    path: "/path/to/audio.mp3",
    duration_ms: 180000,           // 180秒
    speaker: "张三",
    emotion: "neutral",
    transcript_segments: [
      { start: 0, end: 5000, text: "大家好..." },
      { start: 5000, end: 12000, text: "今天讨论..." }
    ]
  }
}

// video 记忆
metadata: {
  video: {
    path: "/path/to/video.mp4",
    duration_ms: 300000,
    description: "产品发布会演示文稿讲解",
    keyframes: [
      { timestamp: 10000, description: "开场白" },
      { timestamp: 60000, description: "产品介绍" }
    ]
  }
}
```

### 检索示例

```typescript
// 检索所有记忆（默认 text only）
const results = await retriever.search("用户偏好");

// 检索 text + audio
const results = await retriever.search("上周那个客户电话说了什么", 5, undefined, ["text", "audio"]);

// 检索所有类型
const results = await retriever.search("那个演示文稿", 5, undefined, ["text", "audio", "video"]);
```

---

## 架构

```
OpenClaw Gateway (TypeScript Hooks)
    │
    ├── agent:bootstrap → hawk-recall hook
    │       → HybridRetriever
    │       ┌─────────────────────────────────────────────────────┐
    │       │ 1. Query Expansion (查询扩展成多个相关表述)          │
    │       │ 2. Multi-query Vector+BM25 (每个查询独立检索)        │
    │       │ 3. RRF Fusion (结果融合)                           │
    │       │ 4. Noise Filter (去除"好的""收到"等噪声)          │
    │       │ 5. Cross-encoder Rerank (重排)                     │
    │       │ 6. Confidence Threshold (置信度过滤)                │
    │       │ 7. MMR Diversity (多样性排序)                       │
    │       │ 8. Layer Penalty (低层级降权)                      │
    │       │ 9. Result Compression (长文本压缩)                  │
    │       └─────────────────────────────────────────────────────┘
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
          },
          "optimizer": {
            "queryExpansionEnabled": true,
            "queryExpansionCount": 3,
            "mmrEnabled": true,
            "mmrLambda": 0.5,
            "confidenceThresholdEnabled": true,
            "confidenceThreshold": 0.3,
            "fieldWeightedBm25Enabled": true,
            "compressionEnabled": true,
            "compressionMaxChars": 200
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

## 6 大检索优化策略

### 1. Query Expansion（查询扩展）
将用户的一个问题扩展成 3-4 个语义相关的表述，分别检索再合并。

```typescript
query = "openclaw 架构"
// 扩展为：
// ["openclaw 架构", "openclaw design", "openclaw 底层原理", "openclaw 系统概览"]
// 各查询独立检索 → RRF 合并 → 解决"措辞不一致"导致的漏召回
```

**触发：** `optimizerConfig.queryExpansionEnabled = true`（默认开启）

---

### 2. MMR Diversity（最大边际相关性）
在选择最终 topK 时，故意选一些"和已有结果不太一样"的内容，保证多样性。

```typescript
// MMR 公式：λ × 相关性 - (1-λ) × 与已选结果的最大相似度
while (results.length < topK) {
  next = max(λ × rerankScore - (1-λ) × maxSimilarityToSelected)
}
```

| λ 值 | 效果 |
|------|------|
| 0.0 | 只顾相关性，和原 RRF 一样 |
| 0.5（默认） | 平衡相关性和多样性 |
| 1.0 | 最高多样性 |

**触发：** `optimizerConfig.mmrEnabled = true, mmrLambda = 0.5`（默认开启）

---

### 3. Confidence Threshold（置信度过滤）
重排后设一个最低分数阈值，低于阈值的直接丢弃，不进入最终结果。

```typescript
// 低于 0.3 分的记忆直接丢弃
.filter(r => r.rerankScore >= 0.3)
```

**触发：** `optimizerConfig.confidenceThresholdEnabled = true`（默认开启，阈值 0.3）

---

### 4. Field-weighted BM25（分域加权）
对 text、category、scope 三个字段分别 BM25 检索，给 category 和 scope 更高权重。

```typescript
// 公式：score = bm25(text)×1.0 + bm25(category)×2.0 + bm25(scope)×1.5
// category 命中（如 "fact"）比普通文本匹配权重更高
```

**触发：** `optimizerConfig.fieldWeightedBm25Enabled = true`（默认开启）

---

### 5. Session Context Awareness（会话上下文感知）
把最近 1-3 轮对话的摘要拼入 query，让检索理解当前话题。

```typescript
// 从 session messages 中提取最近 user queries，构建 conversationSummary
// "openclaw 架构 | openclaw 底层原理"  → 组合查询
sessionContext = {
  recentQueries: ["openclaw 底层原理", "openclaw 架构"],
  conversationSummary: "openclaw 底层原理 | openclaw 架构"
}
```

**触发：** 自动注入（从 sessionEntry.messages 中提取）

---

### 6. Result Compression（结果压缩）
对超过 200 字符的记忆文本，在注入上下文前截断到句子边界。

```typescript
// 超过 maxChars 的文本，截断到最后一个句号或换行符
compressText(text, maxChars = 200)
// "这是很长的记忆文本..." → "这是很长的记忆文本。"（自然断句）
```

**触发：** `optimizerConfig.compressionEnabled = true`（默认开启，200字符）

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
~/.hermes/hooks/hawk-bridge/                         ← Hermes Hook 适配层
~/.hermes/hooks/hawk-bridge/HOOK.yaml               ← Hermes 钩子注册
~/.hermes/hooks/hawk-bridge/handler.py              ← Hermes Hook 处理函数（Python）
```

---

## Hermes 接入（v2.0 新增）

hawk-bridge 同时支持 OpenClaw 和 Hermes 两个框架，共用同一份 LanceDB 记忆数据。

### Hermes 目录结构

```
~/.hermes/hooks/hawk-bridge/
├── HOOK.yaml      # 声明 agent:start / agent:end 事件
└── handler.py     # Hermes Hook 处理函数（Python）
```

### HOOK.yaml

```yaml
name: hawk-bridge-hermes
description: "Hermes Hook Bridge for hawk-bridge memory system"
events:
  - agent:start   # 召回记忆 → 注入上下文
  - agent:end     # 捕获对话 → 存储记忆
```

### hawk-memory-api — HTTP 服务层

OpenClaw 的 Python subprocess 调用和 Hermes 的 handler.py 都通过 HTTP 与 `hawk-memory-api` 通信：

```
                    ┌─────────────────────────────────────┐
                    │      hawk-memory-api (FastAPI)       │
                    │  POST /recall  → LanceDB 召回       │
                    │  POST /capture → LanceDB 存储        │
                    │  POST /extract → LLM 提取记忆        │
                    │  GET  /stats   → 统计信息            │
                    └──────────────┬──────────────────────┘
                                   │
              HTTP (HAWK_PYTHON_HTTP_MODE) │              HTTP
                    ┌───────────────┴──────┐         ┌──────────────┐
                    │ hawk-capture (OpenClaw)│         │ Hermes hook   │
                    │ subprocess fallback   │         │ handler.py    │
                    └──────────────────────┘         └──────────────┘
```

### 启动 hawk-memory-api

```bash
# 方式1: 直接运行
python3 ~/repos/hawk-memory-api/server.py

# 方式2: 使用启动脚本
bash ~/repos/hawk-memory-api/run.sh

# 方式3: 通过 cronjob 常驻后台
nohup python3 ~/repos/hawk-memory-api/server.py > ~/.hawk/api.log 2>&1 &
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HAWK__PYTHON__HTTP_MODE` | `false` | 启用 HTTP 模式（替代 subprocess） |
| `HAWK__PYTHON__HTTP_BASE` | `http://127.0.0.1:18360` | hawk-memory-api 地址 |
| `HAWK_API_BASE` | — | 同上（deprecated） |
| `HAWK_PYTHON_HTTP_MODE` | — | 同上（deprecated） |

### OpenClaw 启用 HTTP 模式

```bash
# 推荐方式（HAWK__ 前缀嵌套）
export HAWK__PYTHON__HTTP_MODE=true
export HAWK__PYTHON__HTTP_BASE=http://127.0.0.1:18360

# 兼容旧方式（deprecated）
export HAWK_PYTHON_HTTP_MODE=true
export HAWK_API_BASE=http://127.0.0.1:18360
```

**注意：** HTTP 模式默认为 `false`（subprocess），设为 `true` 后优先走 HTTP，连接失败自动 fallback 到 subprocess。

---

## Hook 事件注册（OpenClaw）

| Hook | 触发事件 |
|------|---------|
| hawk-capture | `message:sent` — 每次 agent 回复后自动提取记忆 |
| hawk-recall | `agent:bootstrap` + `message:sent` — agent 启动时 + 每次回复前注入记忆 |

**注意**：修改 HOOK.md 的 `events` 数组后必须 `npm run build` + 重启 Gateway 才能生效。

---

## 开发调试

### 两套路径（重要！）

hawk-bridge 有两套路径，改完 Hook 源码后必须同步：

| 路径 | 用途 |
|------|------|
| `src/hooks/` | **源码**（你改的地方） |
| `dist/hooks/` | **构建产物**（Gateway 实际加载） |
| `~/.openclaw/workspace/dist/hooks/` | Gateway 安装目录的构建产物 |

**每次改完 `src/hooks/` 后必须：**

```bash
cd ~/repos/hawk-bridge
npm run build                # 编译 + 拷贝 HOOK.md 到 dist/
systemctl --user restart openclaw-gateway  # 重启 Gateway
```

**验证是否生效：**
```bash
# 确认 dist/ 是最新
ls -la dist/hooks/hawk-capture/

# 看 Gateway 日志
journalctl --user-unit openclaw-gateway -f
```

### 常见误区

- ❌ 改完 `src/hooks/` 直接跑 Gateway — 跑的是旧版
- ❌ 只看源码有没有保存 — dist/ 可能几天前的
- ❌ 重启 Gateway 就以为会重新加载 — 没 build 的话 restart 也没用

### 构建脚本

`scripts/build.js` 定义了编译和拷贝规则：
- 编译 `.ts` → `.js`
- 拷贝 `HOOK.md`

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

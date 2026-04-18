# 🦅 hawk-bridge

> AI 会话记忆桥梁。连接 OpenClaw Hook 系统与持久化记忆存储，实现跨会话记忆自动注入与自动提取。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)

---

## 一句话理解

```
每次对话结束 → 自动提取记忆存入 LanceDB
每次新对话开始 → 自动注入相关记忆
零手动操作，记忆跨会话、跨 Agent 共享
```

---

## 核心问题对比

| 场景 | 无 hawk-bridge | 有 hawk-bridge |
|------|---------------|----------------|
| 新对话开始 | 白板状态，什么都不记得 | ✅ 自动注入相关记忆 |
| 用户重复偏好 | "我之前说过了" | 记住 session 1 的偏好 |
| 长任务持续多天 | 重启 = 从头开始 | 任务状态持久化，无缝恢复 |
| 上下文膨胀 | Token 账单飙升 💸 | 5 种压缩策略保持精简 |
| 重复记忆 | 同一事实存 10 份 | SimHash 去重，只存一份 |
| 记忆召回 | 5 条相似记忆重复注入 | MMR 多样性召回，不重复 |
| 记忆管理 | 堆积如山永不清理 | 4 层衰减——噪声消失，信号保留 |
| 多 Agent 协作 | 各 Agent 从零开始 | 共享 LanceDB，互相学习 |

---

## 工作原理

```
用户消息 / Agent 回复
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                    hawk-capture                         │
│  提取 → 分类（fact/preference/decision/entity）        │
│  → 去重 → 重要性评分 → 存入 LanceDB                   │
└───────────────────────────────────────────────────────┘
        │
        ▼
                  LanceDB（持久化）
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                    hawk-recall                          │
│  新对话 bootstrap → 查找相关记忆 → 注入上下文           │
└───────────────────────────────────────────────────────┘
        │
        ▼
              LLM 回复
```

**两个核心 Hook：**

- `message:sent` + `message:received` → `hawk-capture` 自动提取记忆
- `agent:bootstrap` → `hawk-recall` 在首次回复前注入相关记忆

---

## 快速安装

```bash
# 方式 A：一条命令（推荐）
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)

# 方式 B：ClawHub
clawhub install hawk-bridge

# 方式 C：手动
git clone https://github.com/relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge && npm install && npm run build
```

安装脚本自动完成：检测 Node.js / Python3 → 安装依赖 → 克隆 context-hawk → 构建 → 初始化记忆。

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                   OpenClaw Gateway                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  agent:bootstrap ──→ 🦅 hawk-recall ──→ 注入记忆        │
│                                                          │
│  message:sent                     🦅 hawk-capture         │
│  message:received ──────────────→ 提取记忆 ──→ LanceDB   │
│                                                          │
├─────────────────────────────────────────────────────────┤
│              LanceDB（本地，无外部依赖）                  │
│         向量搜索 + BM25 + RRF 融合                      │
├─────────────────────────────────────────────────────────┤
│             xinference bge-m3（本地 embedding）          │
│                   port 9997                              │
└─────────────────────────────────────────────────────────┘
```

---

## 性能数据

> 实测：xinference bge-m3 (CPU) + LanceDB 0.30 + FastAPI 单 worker

| 操作 | 场景 | 延迟 | QPS |
|------|------|------|-----|
| **Recall** | 冷启动 | 77ms | — |
| **Recall** | 5 并发用户 | P50 284ms / P95 419ms | **13** |
| **Recall** | 20 并发（过载） | P50 1501ms | 12 |
| **Capture（含 LLM 提取）** | 单次 | ~2900ms | — |
| **Capture（旁路 LLM）** | 估算 | ~250ms | ~4 |
| xinference embedding | 单次 | 240ms | — |
| xinference embedding | 并发 5 | 28ms 总（5.6ms/call） | — |

**说明：**
- Recall 瓶颈在 xinference embedding（240ms/call），但并发时多核 CPU 收益巨大
- Capture 瓶颈在外部 LLM（Minimax，约 2.5s），非 LanceDB 本身
- 5 并发用户内性能稳定，P50 仅 284ms

---

## 配置

**配置文件**：`~/.hawk/config.yaml`

```yaml
# embedding：本地 xinference（OpenAI-compatible 协议）
embedding:
  provider: openai
  apiKey: ""                        # 本地服务无认证
  model: bge-m3
  dimensions: 1024
  baseURL: http://localhost:9997/v1

# extraction：LLM 提取（Minimax）
extraction:
  provider: openclaw
  model: MiniMax-M2.7
  apiKey: ${MINIMAX_API_KEY}
  baseURL: https://api.minimaxi.com/v1

recall:
  topK: 5
  minScore: 0.3

capture:
  enabled: true
  importanceThreshold: 0.5
```

**环境变量**（可选，覆盖 YAML）：

```bash
# embedding 配置
export HAWK__EMBEDDING__PROVIDER=openai
export HAWK__EMBEDDING__BASE_URL=http://localhost:9997/v1
export HAWK__EMBEDDING__MODEL=bge-m3
export HAWK__EMBEDDING__DIMENSIONS=1024

# extraction LLM
export MINIMAX_API_KEY="your-key"
```

---

## 常用命令

```bash
cd ~/.openclaw/workspace/hawk-bridge

hawk doctor          # 查看记忆统计（数量、分类、可靠性分布）
hawk recall "关键词" # 自然语言查询记忆
hawk 否认 N         # 标记记忆不可靠（reliability -5%）
hawk 确认 N         # 确认记忆正确（verification_count +1）
hawk 纠正 N 新内容   # 纠正记忆内容

hawk导出            # 导出所有记忆到 JSON
hawk清空            # 清空所有记忆（⚠️ 不可逆）
hawk清理            # 清理过期/锁定记忆
hawk过期            # 扫描过期/陈旧记忆

hawk锁定 N          # 锁定记忆（防止自动删除）
hawk解锁 N          # 解锁记忆
```

---

## 核心特性

> 全部 37 项（对比参考：`README.original-en.md` 为原始英文版，`README.zh-CN.md` 为原始中文版）

| # | 特性 | 说明 |
|---|------|------|
| 1 | **自动捕获钩子** | `message:sent` + `message:received` → hawk 自动提取 6 类记忆 |
| 2 | **自动召回钩子** | `agent:bootstrap` → 新会话前注入相关记忆 |
| 3 | **混合检索** | BM25 + 向量搜索 + RRF 融合 — 无需 API key 也能用 |
| 4 | **零配置降级** | 开箱即用，xinference bge-m3 默认启用 |
| 5 | **多 Embedding 提供者** | xinference / Jina AI / 千问 / OpenAI / Cohere |
| 6 | **优雅降级** | API key 不可用时自动降级到 BM25 |
| 7 | **上下文感知注入** | 无 embedder 时直接用 BM25 分数 |
| 8 | **亚 100ms 召回** | LanceDB ANN 索引，即时检索 |
| 9 | **跨平台安装** | 一键安装，兼容所有主流 Linux 发行版 |
| 10 | **自动去重** | 存储前文本相似度去重 — 防止重复记忆 |
| 11 | **MMR 多样召回** | 最大边际相关性 — 既相关又多样，减少 context 大小 |
| 12 | **28 条文本规范化** | 清理 markdown、URL、标点、时间戳、emoji、HTML、调试日志 |
| 13 | **敏感信息脱敏** | 自动清除 API key、电话、邮箱、身份证、银行卡号 |
| 14 | **TTL / 过期机制** | 记忆可配置过期时间（默认 30 天） |
| 15 | **召回分数门槛** | 低于相关度阈值的记忆不注入 context |
| 16 | **审计日志** | 所有捕获/跳过/拒绝/召回事件记录到 `~/.hawk/audit.log` |
| 17 | **有害内容过滤** | 捕获时拒绝暴力/欺诈/黑客/CSAM 内容 |
| 18 | **综合分数排序** | score×0.6 + reliability×0.4 — 优先高可靠性记忆 |
| 19 | **多轮联合抽取** | 合并连续用户消息后再送 LLM 提取 — 更好上下文 |
| 20 | **代码块 + URL 提取** | 自动将代码块（fact/0.8）和 URL（fact/0.7）捕获为记忆 |
| 21 | **24h Embedder 缓存** | Embedding 结果缓存 24h — 避免重复 API 调用 |
| 22 | **增量 BM25 索引** | ≤10 条新记忆 → 懒合并；>10 条 → 全量重建 — 可扩展到 1000+ |
| 23 | **预过滤** | 数字/单 emoji/少于 30 字的内容在调用 LLM 前跳过 |
| 24 | **Did-You-Mean** | 召回结果为空 → 按关键词重叠度推荐相似记忆 |
| 25 | **记忆统计** | `hawk doctor` — 类别/作用域/可靠性分布面板 |
| 26 | **效果反馈** | `hawk 否认 N` → reliability -5%；`hawk 确认 N` → verification_count +1 |
| 27 | **多 Agent 内存隔离** | 通过 `owner_agent` 字段实现每 Agent 记忆池 — 个人 + 团队记忆 |
| 28 | **LanceDB trygc** | Decay 后自动垃圾回收 — 保持数据库精简 |
| 29 | **结构化 JSON 输出** | 所有 LLM 调用使用 `response_format=json_object` — 可靠解析 |
| 30 | **Auto-Dream 定期整合** | 后台合并重复记忆、检测过期内容、确认新鲜记忆（每 24 小时或新增 5 条记忆后触发） |
| 31 | **记忆过期检测** | 🕐 可信记忆 7 天未验证则标记；`hawk 过期` 命令扫描所有记忆 |
| 32 | **多 Provider 精排** | Jina AI / Cohere / Mixedbread AI / OpenAI 兼容精排器，自动回退到余弦相似度 |
| 33 | **4 类记忆分类** | fact / preference / decision / entity — 每类独立可靠性追踪和过期感知召回 |
| 34 | **整合锁机制** | 锁文件防止多进程同时整合记忆；60 分钟或进程死后自动回收 stale lock |
| 35 | **What NOT to Save** | 预过滤跳过代码模式/git历史/调试方案/临时任务 — 减少噪声 |
| 36 | **双重选择器** | Header 扫描(name+description) → LLM 选 topN → 向量搜索 — 比纯向量更准 |
| 37 | **Session Transcript 扫描** | 扫描 `transcripts/*.jsonl` 在整合时提供相关历史上下文 |

---

## 文件结构

```
hawk-bridge/
├── src/
│   ├── index.ts              # 插件入口，Hook 注册
│   ├── config.ts             # 配置加载（YAML + 环境变量）
│   ├── lancedb.ts            # LanceDB 封装
│   ├── embeddings.ts         # Embedding 提供者（含 fetchWithRetry）
│   ├── retriever.ts          # 混合检索（BM25 + 向量 + RRF）
│   ├── logger.ts            # pino 日志
│   ├── constants.ts         # 常量定义
│   ├── types.ts             # 类型定义
│   └── hooks/
│       ├── hawk-recall/     # agent:bootstrap → 注入记忆
│       │   └── handler.ts
│       └── hawk-capture/     # message:sent/received → 提取记忆
│           ├── handler.ts
│           └── normalizeText.ts  # 28 步文本规范化管道
├── docs/
│   ├── http_api.md          # HTTP API 文档
│   └── go-integration.md    # Go 语言集成指南（含性能数据）
└── scripts/
    └── build.js             # 构建脚本
```

---

## 与 context-hawk 的关系

```
hawk-bridge（TypeScript 插件）         context-hawk（Python 库）
┌──────────────────────┐            ┌─────────────────────────┐
│  OpenClaw Hook 桥接   │  spawn()   │  Python MemoryManager   │
│  决定"何时"触发操作   │ ────────→ │  处理存储/检索/提取     │
└──────────────────────┘ subprocess └─────────────────────────┘
```

- **hawk-bridge**：决定"何时"动作（Hook 时机）
- **context-hawk**：处理"如何"存储（Python 内存引擎）

两者独立仓库，通过 subprocess 通信。存储层升级（如 JSON → SQLite → LanceDB）对上层透明。

---

## Go 集成

详见 [docs/go-integration.md](docs/go-integration.md)，包含：
- 方案 A：直接调 HTTP API（最简单）
- 方案 B：旁路 LLM 提取，高频写入
- 方案 C：LanceDB REST Server，极致性能
- 完整 Go 代码示例和性能数据

---

## 技术规格

| 项目 | 说明 |
|------|------|
| 运行时 | Node.js 18+（ESM）+ Python 3.12+ |
| 存储 | LanceDB（本地，无外部 DB） |
| 检索 | BM25 + ANN 向量搜索 + RRF 融合 |
| Hook 事件 | `agent:bootstrap`（recall），`message:sent/received`（capture） |
| 依赖 | 零硬依赖，全可选，自动降级 |
| 许可证 | MIT |

# 🦅 hawk-bridge

> **你的 OpenClaw 还在当"金鱼"？**
>
> Session 结束就忘、跨 Agent 就失忆、Context 爆了 Token 烧光——
> hawk-bridge 给 AI 装上持久记忆，autoCapture + autoRecall，零手动，帮你省 Token 省钱。

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenClaw 兼容](https://img.shields.io/badge/OpenClaw-2026.3%2B-brightgreen)](https://github.com/openclaw/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue)](https://python.org)

**[English](README.md)** | [中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)**

---

## 它做什么？

AI Agent 每次会话结束就会遗忘一切。**hawk-bridge** 将 OpenClaw 的 Hook 系统与 hawk 的 Python 记忆系统桥接，让 Agent 拥有持久化、自我改进的记忆：

- **每次回复** → hawk 自动提取并存入有意义的内容
- **每次新会话** → hawk 在思考前自动注入相关记忆
- **零手动操作** — 开箱即用，自动运行

**没有 hawk-bridge：**
> 用户："我喜欢简洁的回复，不要长段落"
> Agent："好的！" ✅
> （下一个 session — 又忘了）

**有 hawk-bridge：**
> 用户："我喜欢简洁的回复"
> Agent：自动存入 `preference:communication` ✅
> （下一个 session — 自动注入，立即生效）

---

## ❌ 没有 vs ✅ 有 hawk-bridge

| 场景 | ❌ 没有 hawk-bridge | ✅ 有 hawk-bridge |
|----------|------------------------|---------------------|
| **新 session 开始** | 空白 — 对你一无所知 | ✅ 自动注入相关记忆 |
| **用户重复偏好** | "我跟你说过了..." | 从 session 1 就记住 |
| **长任务持续数天** | 重启 = 从头开始 | 任务状态持久化，无缝衔接 |
| **上下文变大** | Token 费用飙升，💸 | 5 种压缩策略保持精简 |
| **重复信息** | 同一事实存了 10 份 | SimHash 去重 — 只存一份 |
| **记忆召回** | 全部相似、重复注入 | MMR 多样性召回 — 不重复 |
| **记忆管理** | 一切永远堆积 | 4 层衰减 — 噪音消散，信号保留 |
| **自我改进** | 重复同样的错误 | importance + access_count 追踪 → 智能升级 |
| **多 Agent 团队** | 每个 Agent 从零开始，无共享上下文 | 共享 LanceDB — 所有 Agent 互相学习 |

---

## 🎯 核心定位：记忆的本质是学习，不是存储

> **竞品（Mem0 / Notion AI / Copilot / Rewind AI）都在做同一件事**：存储"说过的话"——把对话记录成文本块，用向量检索找回来。它们本质是"更高级的文本向量检索系统"。
>
> **hawk-bridge 在做另一件事**：存储"学到的知识"——从 Raw → Pattern → Principle → Skill 的知识进化体系。记忆不是存储单位，是学习单位。

### 知识进化金字塔

```
┌─────────────────────────────────────────────────────────────┐
│  L4 Skill（技能）                                          │
│  "npx create-next-app 的标准流程"                          │
│  来源：10次项目经验的Pattern汇总                            │
├─────────────────────────────────────────────────────────────┤
│  L3 Principle（原则）                                       │
│  "Next.js项目应该用App Router"                             │
│  来源：5个项目的架构决策Pattern                             │
├─────────────────────────────────────────────────────────────┤
│  L2 Pattern（模式）                                        │
│  "App Router的layout.tsx是全局布局入口点"                  │
│  来源：3次Next.js项目经验                                  │
├─────────────────────────────────────────────────────────────┤
│  L1 Raw（原始记忆）                                        │
│  "2024-03-15 用户提到想用Next.js做项目"                   │
│  来源：单次对话记录                                         │
└─────────────────────────────────────────────────────────────┘
```

### 100年后，差异天壤之别

| | 竞品 | hawk-bridge |
|--|------|-------------|
| 10年后 | 噪音沼泽——10万条文本块，无法检索有价值信息 | 高度蒸馏的知识资产——Pattern/Principle 可直接指导决策 |
| 核心价值 | 减少重复提问 | 知识进化与传承 |
| 技术护城河 | 向量检索优化 | 知识蒸馏 + 血缘链 + 企业知识治理 |

### hawk-bridge 的竞争护城河（95项 TODO 覆盖）

| 能力 | Mem0 | Notion AI | Copilot | Rewind AI | hawk-bridge |
|------|------|-----------|---------|-----------|-------------|
| 知识蒸馏分层 | ❌ | ❌ | ❌ | ❌ | ✅ #75-78 |
| 企业知识治理 | ❌ | ⚠️ 部分 | ⚠️ 部分 | ❌ | ✅ #79 |
| 血缘链追溯 | ❌ | ❌ | ❌ | ❌ | ✅ #77 |
| 记忆经济学 | ❌ | ❌ | ❌ | ❌ | ✅ #85 |
| 记忆可证明性 | ❌ | ❌ | ❌ | ❌ | ✅ #83 |
| 主动遗忘机制 | ❌ | ❌ | ❌ | ❌ | ✅ #84 |

**核心挑战**（🔴 最高优先级）：
- **#94 记忆验证引擎** — 需要打通外部验证源（文件系统/代码仓库），依赖 autoself 巡检验证闭环
- **#95 跨设备 Sync** — 分层 Sync + CRDT tombstone 机制，HOT 实时 / COLD 批量

---

## 🦅 解决了什么问题？

**没有它：** AI Agent 会遗忘一切——跨 Session 忘，跨 Agent 也忘，Token 费用还失控。

**有了它：** 持久化记忆 + 共享上下文 + 节省 Token。

### hawk-bridge 解决的痛点

| 痛点 | ❌ 没有 | ✅ 有 hawk-bridge |
|------|--------|-----------------|
| **Session 结束就忘** | ❌ 新 Session 从零开始 | ✅ 跨 Session 记忆注入 |
| **团队信息孤岛** | ❌ 每个 Agent 各自为战 | ✅ 共享 LanceDB，全员可读 |
| **多 Agent 重复犯错** | ❌ Agent A 不知道 Agent B 的决策 | ✅ 记忆共享，不重蹈覆辙 |
| **LLM 费用失控** | ❌ 无限制 Context 膨胀，<span style="color:red">**token太烧钱**</span> | ✅ 压缩 + 去重 + MMR，Context 变小 |
| **Context 溢出 / 爆 Token** | ❌ Session 历史无限堆积直到崩溃 | ✅ 自动裁剪 + 4 层衰减 |
| **重要决策被遗忘** | ❌ 只存在旧 Session 里，永远丢失 | ✅ 带 importance 存 LanceDB |
| **重复记忆堆积** | ❌ 同样内容存了 N 份 | ✅ SimHash 去重，64位指纹 |
| **召回重复啰嗦** | ❌ "说说 X" → 注入 5 条相似记忆 | ✅ MMR 多样性，不重复 |
| **记忆不会自我改进** | ❌ 不会越用越好 | ✅ importance + access_count 智能升级 |

### hawk-bridge 解决 5 个核心问题

**问题1：Session 有上下文窗口限制**
Context 有 Token 上限（比如 32k）。Session 历史太长会挤掉其他重要内容。
→ hawk-bridge 帮你压缩/归档，只注入最相关的。

**问题2：AI 跨 Session 就忘**
Session 结束，Context 消失。下次对话：AI 完全不记得上次说了什么。
→ hawk-recall 每次启动前从 LanceDB 注入相关记忆。

**问题3：多 Agent 之间信息不共享**
Agent A 不知道 Agent B 做了什么决策，各自从头开始。
→ 共享 LanceDB：所有 Agent 读写同一个记忆库，打破信息孤岛。

**问题4：发送给 LLM 前 Context 太大太冗余**
召回没优化的话，Context 里一堆重复相似内容，浪费 token。
→ 经过压缩 + SimHash 去重 + MMR 多样性召回后，发送给 LLM 的 Context **体积大幅缩小**，节省 token 消耗。

**问题5：记忆不会自动管理**
没有 hawk-bridge：所有消息都堆在 Session 里，越积越多，最后 Context 溢出。
→ hawk-capture 自动提取重要信息 → 存 LanceDB。不重要的自动 delete，重要的 promote 到 long 层。

---

## 🔄 hawk-bridge 在 Session/Context 生命周期中的位置

```
Session（持久化磁盘）
    │
    └─► 历史消息
            │
            ▼
    Context 组装（内存）
            │
            ├──► hawk-recall 注入记忆 ← 从 LanceDB 召回
            │
            ├──► Skills 描述
            ├──► Tools 列表
            └──► System Prompt
                    │
                    ▼
                LLM 回复
                    │
                    ▼
            hawk-capture 提取 → 存 LanceDB
```

**工作流程：**
1. 每次回复 → `hawk-capture` 提取有意义的内容 → 存入 LanceDB
2. 每次新会话 → `hawk-recall` 从 LanceDB 召回相关记忆 → 注入 Context
3. 老旧记忆 → 通过 4 层衰减自动管理（Working → Short → Long → Archive）
4. 重复记忆 → SimHash 去重，避免浪费存储
5. 冗余召回 → MMR 确保多样、不重复的注入

---

## ✨ 核心功能

| # | 功能 | 说明 |
|---|------|------|
| 1 | **自动捕获钩子** | `message:sent` + `message:received` → hawk 自动提取 6 类记忆 |
| 2 | **自动召回钩子** | `agent:bootstrap` → 新会话前注入相关记忆 |
| 3 | **混合检索** | BM25 + 向量搜索 + RRF 融合 — 无需 API key 也能用 |
| 4 | **零配置降级** | 开箱即用，Jina 免费额度默认启用 |
| 5 | **5 种 Embedding 提供者** | Ollama (本地 GPU) / Jina AI (免费云) / 千问 / OpenAI / Cohere |
| 6 | **优雅降级** | API key 不可用时自动降级 |
| 7 | **上下文感知注入** | 无 embedder 时直接用 BM25 分数 |
| 8 | **亚 100ms 召回** | LanceDB ANN 索引，即时检索 |
| 9 | **跨平台安装** | 一键安装，兼容所有主流 Linux 发行版 |
| 10 | **自动去重** | 存储前文本相似度去重 — 防止重复记忆 |
| 11 | **MMR 多样召回** | 最大边际相关性 — 既相关又多样，减少 context 大小 |
| 12 | **28 条文本规范化规则** | 清理 markdown、URL、标点、时间戳、emoji、HTML、调试日志 |
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
| 25 | **记忆统计** | `hawk统计` — 类别/作用域/可靠性分布面板 |
| 26 | **效果反馈** | `hawk否认 N` → reliability -5%；`hawk确认 N 对/纠正` → reliability -30% |
| 27 | **多 Agent 内存隔离** | 通过 `owner_agent` 字段实现每 Agent 记忆池 — 个人 + 团队记忆 |
| 28 | **LanceDB trygc** | Decay 后自动垃圾回收 — 保持数据库精简 |
| 29 | **结构化 JSON 输出** | 所有 LLM 调用使用 `response_format=json_object` — 可靠解析 |
| 30 | **Auto-Dream 自动整合** *(from Claude)* | 定期后台整合：合并重复记忆、检测过期内容、确认新鲜记忆（每24小时或新增5条记忆后触发） |
| 31 | **记忆过期检测** *(from Claude)* | 🕐 可信记忆7天未验证则标记；`hawk过期` 命令扫描所有记忆 |
| 32 | **多 Provider 精排** | Jina AI / Cohere / Mixedbread AI / OpenAI兼容 精排器，自动回退到余弦相似度 |
| 33 | **4类记忆分类** *(from Claude)* | fact / preference / decision / entity — 每类独立可靠性追踪和过期感知召回 |


| 34 | **整合锁机制** *(from Claude)* | 锁文件防止多进程同时整合记忆；60分钟或进程死后自动回收 stale lock |
| 35 | **What NOT to Save** *(from Claude)* | 预过滤跳过代码模式/git历史/调试方案/临时任务 — 减少噪声 |
| 36 | **双重选择器** *(from Claude)* | Header扫描(name+description) → LLM选topN → 向量搜索 — 比纯向量更准 |
| 37 | **Session Transcript 扫描** *(from Claude)* | 扫描 `transcripts/*.jsonl` 在整合时提供相关历史上下文 |
---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
├───────────────────┬───────────────────────────────────────────────┤
│                   │                                                │
│  agent:bootstrap │  message:sent, message:received             │
│         ↓         │         ↓                                    │
│  ┌────────────────┴───────────┐                                 │
│  │       🦅 hawk-recall       │  ← 在首次回复前              │
│  │    (before first response)  │     向 Agent 上下文          │
│  └─────────────────────────────┘     注入相关记忆              │
│                   ↓                                                │
│  ┌─────────────────────────────────────────┐                 │
│  │              LanceDB                      │                 │
│  │   向量搜索 + BM25 + RRF 融合              │                 │
│  └─────────────────────────────────────────┘                 │
│                   ↓                                                │
│         ┌───────────────────────┐                             │
│         │  context-hawk (Python) │  ← 提取 / 评分 / 衰减     │
│         │  MemoryManager         │                             │
│         │  SQLite WAL 存储        │ ← v2.0: 替代 JSON 文件   │
│         │  + VectorRetriever     │                             │
│         └───────────────────────┘                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📈 性能数据

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

## 🚀 一键安装

选择最适合你的方式：

### 方式一 — ClawHub（推荐）
```bash
# 最简单 — 一条命令搞定
clawhub install hawk-bridge
# 或通过 OpenClaw
openclaw skills install hawk-bridge
```
> ✅ 自动更新、易管理、无需手动配置

### 方式二 — 克隆 + 安装脚本
```bash
# 自动下载并运行安装脚本
bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)
```
> ✅ 支持所有 Linux 发行版，全自动

### 方式三 — 手动安装
```bash
git clone https://github.com/relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge
npm install && npm run build
# 然后添加到 openclaw.json：
openclaw plugins install /tmp/hawk-bridge
```
> ✅ 完全可控，适合高级用户

### 方式四 — OpenClaw 图形界面
1. 打开 OpenClaw 面板 → Skills → 浏览
2. 搜索 "hawk-bridge"
3. 点击安装
> ✅ 无需命令行

---

安装脚本自动完成：

| 步骤 | 内容 |
|------|------|
| 1 | 检测并安装 Node.js、Python3、git、curl |
| 2 | 安装 npm 依赖（lancedb、openai） |
| 3 | 安装 Python 包（lancedb、rank-bm25、sentence-transformers） |
| 4 | 克隆 `context-hawk` 到 `~/.openclaw/workspace/context-hawk` |
| 5 | 创建 `~/.openclaw/hawk` 符号链接 |
| 6 | 安装 **Ollama**（若不存在） |
| 7 | 下载 `nomic-embed-text` 向量模型 |
| 8 | 构建 TypeScript Hooks + 初始化种子记忆 |

**支持的发行版**：Ubuntu · Debian · Fedora · CentOS · Arch · Alpine · openSUSE

### 各系统快速开始

| 发行版 | 安装命令 |
|--------|---------|
| **Ubuntu / Debian** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Fedora / RHEL / CentOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Arch / Manjaro** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **Alpine** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **openSUSE** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |
| **macOS** | `bash <(curl -fsSL https://raw.githubusercontent.com/relunctance/hawk-bridge/master/install.sh)` |

> 所有发行版使用同一命令，安装脚本自动检测系统并选择正确的包管理器。

---

## 🦅 快速命令

所有命令在 `hawk-bridge` 工作目录下执行：
```bash
cd ~/.openclaw/workspace/hawk-bridge
```

### 📊 统计与诊断

```bash
# 🦅 诊断 — 检查安装状态、配置、连接
node dist/cli/doctor.js
# 或简写
hawk doctor

# 📊 统计 — 显示记忆数量、分类/来源/可信度分布
node dist/cli/doctor.js --stats
```

### 📖 读写记忆

```bash
# 写入一条记忆
node dist/cli/write.js --text "团队决策：使用 Redis 做缓存" --category decision --importance 0.8 --source user-import

# 按来源读取记忆（如 evolution-success、user-feedback）
node dist/cli/read-source.js --source evolution-success --source evolution-failure --limit 20
```

### 🔍 查询记忆

```bash
# 语义搜索记忆（需要配置 embedding）
 hawk recall "我们关于架构做了什么决定"

# 对比两条记忆
 hawk对比 1 2
```

### ✏️ 反馈与纠正

```bash
# ❌ 标记记忆 N 不可靠（可信度 -5%）
 hawk否认 3

# ✅ 标记记忆 N 正确（可信度不变，验证计数 +1）
 hawk确认 3

# ✏️ 纠正记忆 N 的内容
 hawk纠正 3 修正后的新内容

# 🔍 扫描过期/陈旧记忆
 hawk过期
```

### 🗑️ 维护操作

```bash
# 导出所有记忆为 JSON
 hawk导出

# 清空所有记忆（⚠️ 不可逆）
 hawk清空

# 清理过期/锁定记忆
 hawk清理

# 锁定记忆 N（防止自动删除）
 hawk锁定 5

# 解锁记忆 N
 hawk解锁 5
```

### ⚡ 批量操作

```bash
# 锁定所有记忆
 hawk锁定all

# 解锁所有记忆
 hawk解锁all
```

---

## 🔧 各系统手动安装

如果你不想用一键脚本，可以手动逐步安装：

<details>
<summary><b>Ubuntu / Debian</b></summary>

```bash
# 1. 系统依赖
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>Fedora / RHEL / CentOS / Rocky / AlmaLinux</b></summary>

```bash
# 1. 系统依赖
sudo dnf install -y nodejs npm python3 python3-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>Arch / Manjaro / EndeavourOS</b></summary>

```bash
# 1. 系统依赖
sudo pacman -Sy --noconfirm nodejs npm python python-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>Alpine</b></summary>

```bash
# 1. 系统依赖
apk add --no-cache nodejs npm python3 py3-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>openSUSE / SUSE Linux Enterprise</b></summary>

```bash
# 1. 系统依赖
sudo zypper install -y nodejs npm python3 python3-pip git curl

# 2. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 3. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers --break-system-packages

# 4. Ollama（可选）
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text

# 5. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 6. npm + 构建
npm install && npm run build

# 7. 初始化种子记忆
node dist/seed.js

# 8. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

</details>

<details>
<summary><b>macOS</b></summary>

```bash
# 1. 安装 Homebrew（如果没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 系统依赖
brew install node python git curl

# 3. 克隆仓库
git clone git@github.com:relunctance/hawk-bridge.git /tmp/hawk-bridge
cd /tmp/hawk-bridge

# 4. Python 依赖
pip3 install lancedb openai tiktoken rank-bm25 sentence-transformers

# 5. Ollama（可选）
brew install ollama
ollama pull nomic-embed-text

# 6. context-hawk
git clone git@github.com:relunctance/context-hawk.git ~/.openclaw/workspace/context-hawk
ln -sf ~/.openclaw/workspace/context-hawk/hawk ~/.openclaw/hawk

# 7. npm + 构建
npm install && npm run build

# 8. 初始化种子记忆
node dist/seed.js

# 9. 激活插件
openclaw plugins install /tmp/hawk-bridge
```

</details>

> **注意**：Linux 上需要 `--break-system-packages` 来绕过 PEP 668（禁止系统 Python 安装包）。macOS 不需要此参数。Ollama 安装脚本在 macOS 上会自动使用 Homebrew。

---

## 🔧 配置

安装完成后，通过环境变量选择向量模式：

```bash
# ① 默认：Qianwen 阿里云百炼（无需 API Key 开箱即用）
# 免费额度充足，国内访问稳定：
export QWEN_API_KEY=你的阿里云API_KEY

# ② Ollama 本地 GPU（推荐，完全免费）
export OLLAMA_BASE_URL=http://localhost:11434

# ③ Jina AI 免费额度（需从 jina.ai 申请免费 Key）
export JINA_API_KEY=你的免费key
# ⚠️ 中国大陆需要代理：设置 HTTP/SOCKS 代理
export HTTPS_PROXY=http://你的代理地址:端口

# ④ OpenAI（付费，高质量）
export OPENAI_API_KEY=sk-...

# ⑤ 无配置 → BM25-only 模式（纯关键词检索，无需任何依赖）
```

### 🔑 获取 Qianwen API Key（国内首选）

阿里云百炼提供免费额度，新用户有赠券：

1. **注册/登录**：https://dashscope.console.aliyun.com/（可用阿里云账号）
2. **开通服务**：搜索"百炼" → 文本嵌入 → 开通
3. **获取 Key**：https://dashscope.console.aliyun.com/apiKey → 创建 API-KEY
4. **配置**:
```bash
export QWEN_API_KEY=sk-xxxxxxxxxxxxxxxx
```

### 🔑 获取免费 Jina API Key

Jina AI 提供**免费额度**，足够个人使用，无需信用卡：

1. **注册账号**：访问 https://jina.ai/（支持 GitHub 登录）
2. **获取 Key**：进入 https://jina.ai/settings/ → API Keys → Create API Key
3. **复制 Key**：以 `jina_` 开头的字符串

> ⚠️ **重要：中国大陆需要代理才能访问 Jina API（api.jina.ai 被墙）。** 设置 `HTTPS_PROXY` 为你的代理地址。

### ~/.hawk/config.yaml

> 当前生产配置示例（xinference bge-m3 + Minimax LLM）：

```yaml
db:
  provider: lancedb
  path: ~/.hawk/lancedb

# embedding：本地 xinference bge-m3（OpenAI-compatible 协议）
embedding:
  provider: openai                    # xinference 是 OpenAI-compatible
  apiKey: ""                          # 本地服务无认证
  model: bge-m3
  dimensions: 1024
  baseURL: http://localhost:9997/v1

# extraction：LLM 提取（Minimax）
extraction:
  provider: openclaw
  model: MiniMax-M2.7
  apiKey: ${MINIMAX_API_KEY}
  baseURL: https://api.minimaxi.com/v1

capture:
  enabled: true
  importanceThreshold: 0.5

recall:
  topK: 5
  minScore: 0.3
```

| Provider | 环境变量 | 说明 |
|---------|---------|------|
| **xinference（推荐）** | `OLLAMA_BASE_URL` | 本地 GPU/NPU 推理，最快 |
| Jina | `JINA_API_KEY` | Jina API Key，以 `jina_` 开头 |
| Qianwen | `QWEN_API_KEY` | 阿里云百炼 API Key，免费额度，国内首选 |
| Ollama | `OLLAMA_BASE_URL` | 如 `http://localhost:11434` |
| OpenAI | `OPENAI_API_KEY` | OpenAI API Key |
| Generic | `baseURL` + `apiKey` | 任意 OpenAI 兼容端点 |

> ⚠️ **当前生产使用 xinference bge-m3**，xinference 是 OpenAI-compatible，不需要额外的 xinference API Key。

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

> API Key 不写在配置文件里，全部通过环境变量管理。

---

## 📊 向量模式对比

| 模式 | Provider | API Key | 质量 | 速度 | 国内访问 |
|------|----------|---------|------|------|---------|
| **BM25-only** | 内置 | ❌ | ⭐⭐ | ⚡⚡⚡ | ✅ |
| **Ollama** | 本地 GPU | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ | ✅ |
| **Qianwen** | 阿里云百炼 | ✅ 免费额度 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ | ✅ 首选 |
| **Jina AI** | 云端 | ✅ 免费 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ | ⚠️ 需代理 |
| **OpenAI** | 云端 | ✅ 付费 | ⭐⭐⭐⭐⭐ | ⚡⚡⚡⚡⚡ | ⚠️ 需代理 |

**默认**：Qianwen 阿里云 — 开箱即用，国内访问稳定。

---

## 🔄 降级逻辑

```
有 OLLAMA_BASE_URL？        → Ollama 向量 + BM25 + RRF
有 QWEN_API_KEY？          → Qianwen（阿里云百炼）+ BM25 + RRF
有 JINA_API_KEY？          → Jina 向量 + BM25 + RRF
有 OPENAI_API_KEY？        → OpenAI 向量 + BM25 + RRF
有 COHERE_API_KEY？        → Cohere 向量 + BM25 + RRF
什么都没配置？              → BM25-only（纯关键词，无 API 调用）
```

没有 API Key 不会报错 — 自动降级到当前可用的最佳模式。


- 团队成员结构（main/wukong/bajie/bailong/tseng 角色）
- 协作规范（GitHub inbox → done 工作流）
- 项目背景（hawk-bridge、qujingskills、gql-openclaw）
- 沟通偏好
- 执行原则

这些记忆确保 hawk-recall 从第一天起就有内容可注入。

---

## 📁 目录结构

```
hawk-bridge/
├── README.md
├── README.zh-CN.md
├── LICENSE
├── install.sh                   # 一键安装脚本（curl | bash）
├── package.json
├── openclaw.plugin.json          # 插件清单 + configSchema
├── src/
│   ├── index.ts              # 插件入口
│   ├── config.ts             # 读取 openclaw 配置 + 环境变量检测
│   ├── lancedb.ts           # LanceDB 封装
│   ├── embeddings.ts           # 6 种向量 Provider（Qianwen/Ollama/Jina/Cohere/OpenAI/OpenAI-Compatible）
│   ├── retriever.ts           # 混合检索（BM25 + 向量 + RRF）
│   ├── seed.ts               # 种子记忆初始化器
│   └── hooks/
│       ├── hawk-recall/      # agent:bootstrap Hook
│       │   ├── handler.ts
│       │   └── HOOK.md
│       └── hawk-capture/     # message:sent + message:received Hook
│           ├── handler.ts
│           └── HOOK.md
└── python/                   # context-hawk（由 install.sh 克隆）
```

---

## 🔌 技术规格

| | |
|---|---|
| **运行时** | Node.js 18+ (ESM)、Python 3.12+ |
| **存储** | LanceDB（本地、无服务器） |
| **检索方式** | BM25 + ANN 向量搜索 + RRF 融合 |
| **向量生成（生产）** | xinference bge-m3（本地，1024 维） |
| **向量生成（可选）** | Jina AI / Qianwen / Ollama / OpenAI / Cohere |
| **LLM 提取（生产）** | Minimax MiniMax-M2.7（外部 API） |
| **Hook 事件** | `agent:bootstrap`（召回）、`message:sent` + `message:received`（捕获） |
| **依赖** | 零硬依赖 — 全部可选，自动降级 |
| **持久化** | 本地文件系统，无需外部数据库 |
| **许可证** | MIT |

---

## 🤝 与 context-hawk 的关系

hawk-bridge 和 context-hawk 是**两个独立的 GitHub 仓库**，协同工作：

```
 hawk-bridge (TypeScript 插件)         context-hawk (Python 库)
┌──────────────────────────┐            ┌─────────────────────────────┐
│  TypeScript OpenClaw      │  spawn()    │  Python MemoryManager       │
│  Hook 处理器               │ ────────→  │  SQLite WAL 存储           │
│  (hawk-recall 等)        │  subprocess │  + VectorRetriever         │
└──────────────────────────┘            └─────────────────────────────┘
        ↑ 决定*何时*行动                       ↑ 处理*如何*执行
```

| | hawk-bridge | context-hawk |
|---|---|---|
| **GitHub** | `relunctance/hawk-bridge` | `relunctance/context-hawk` |
| **语言** | TypeScript | Python |
| **角色** | OpenClaw Hook 桥接器（触发 Hook、管理生命周期） | Python 记忆引擎（存储、检索、提取） |
| **存储** | 无（纯编排层） | SQLite WAL + LanceDB 向量 |
| **调用方式** | `python3 -c "from hawk.memory import MemoryManager"` | 返回结果给 hawk-bridge |
| **安装方式** | npm 包 | 克隆到 `~/.openclaw/workspace/context-hawk` |

**核心原则**：hawk-bridge 不直接操作存储，所有读写都通过 context-hawk 的 Python API。这意味着：
- **存储升级对 hawk-bridge 透明** — 例如从 JSON 切换到 SQLite 完全不需要改动 hawk-bridge
- **100年架构完全在 context-hawk** — tier/permanence_policy/storage_tier 字段在 Python 层计算，TypeScript 只看到最终结果
- **迁移无需任何 hawk-bridge 改动** — Python 接口保持兼容即可

**两者协同**：hawk-bridge 决定"*何时*行动"，context-hawk 负责"*如何*执行"。

---

## 🐹 Go 语言集成

详见 [docs/go-integration.md](docs/go-integration.md)，包含：

- **方案 A**：直接调 HTTP API（最简单，5 并发 P50 284ms）
- **方案 B**：旁路 LLM 提取，高频写入（>1/s）
- **方案 C**：LanceDB REST Server，极致性能（1000+ QPS）
- 完整 Go 代码示例（recall/capture/get/forget/health）
- 性能优化建议（HTTP keep-alive、批量请求）

---

## 🎯 统一记忆架构：5层 × 3维度

hawk-bridge 采用**双维度**架构，同时解决**个人100年记忆**和**企业ToB**两大场景。

### 核心理念：Tier × Scope 矩阵

**Tier = 时间维度**（记忆能活多久）
**Scope = 所有权维度**（记忆属于谁）

```
            Scope →
Tier ↓      Personal      Org           System（外部企业系统）
─────────────────────────────────────────────────────────────
L0 宪法     个人价值观     企业宪章        连接器协议、数据契约
L1 生命     人生里程碑     企业里程碑      组织架构沿革
L2 周期     十年分桶       项目/财年周期   行业周期
L3 事件     日常记忆       团队决策        外部系统事件
L4 工作     会话上下文     项目上下文       实时数据流
```

### 5层记忆（时间维度）

| 层级 | 名称 | 说明 | 存储期限 |
|------|------|------|---------|
| **L0** | 宪法层 | 核心身份、基本价值观、永久约定 | 100 年+ |
| **L1** | 生命层 | 人生里程碑 — 职业、关系、重大决策 | 50 年+ |
| **L2** | 周期层 | 带时代背景的十年分桶 | 30 年+ |
| **L3** | 事件层 | 普通记忆，带衰减机制 | 5-10 年 |
| **L4** | 工作层 | 仅会话上下文 | 会话生命周期 |

### 3大范围（所有权维度）

| 范围 | 说明 | 示例 |
|------|------|------|
| **personal** | 属于个人的记忆 | 用户偏好、习惯、工作风格 |
| **org** | 组织内共享的记忆 | 部门策略、团队决策、OKR |
| **system** | 外部企业系统（可插拔连接器） | SAP ERP、Confluence、Jira、飞书 |

### 企业连接器插件系统

外部企业系统是**可插拔连接器**，映射为 `Scope=system`：

| 连接器 | 企业系统 | 记忆类型 |
|--------|---------|---------|
| `FeishuConnector` | 飞书 | 日历、文档、审批 |
| `ConfluenceConnector` | Confluence | 内部知识库 |
| `JiraConnector` | JIRA | 项目任务、Bug 状态 |
| `GitHubConnector` | GitHub | 代码决策、PR 评论 |
| `SapConnector` | SAP ERP | 库存、采购数据 |

### 核心设计原则

1. **Tier = 时间，Scope = 所有权** — 两个独立维度，不是单一层级
2. **宪法层是锚点** — 所有记忆最终成为宪法记忆或逐渐消亡
3. **DARK 文件格式** — 每条记忆 = 一个独立 JSON 文件（永远不依赖数据库格式）
4. **只追加不修改** — 不覆盖，不删除，除非用户明确授权
5. **多副本存储** — GitHub + Gitee + 本地 NAS（无单点故障）
6. **连接器插件系统** — 企业接入自己的系统作为 `Scope=system`
7. **可迁移设计** — 格式可以变更，内容必须存活 100 年

### v2.0+ 规划

- **v2.0**：统一 Schema（Tier + Scope 双字段）+ L0/L1/L2 层
- **v2.1**：DARK Archive + 冷存储管道（GitHub + Gitee 双推）
- **v2.2**：企业连接器系统 + Scope=system 实现
- **v2.3**：Org 记忆层 + Scope=org + 访问控制
- **v2.4**：层级晋升引擎（L3 → L2 → L1 → L0）
- **v2.5**：分层 + 分范围统一检索

详见 [TODO.md](TODO.md)。

---

## 🛡️ 记忆污染防御与反幻觉体系

> **纵深防御：入口阻止污染，存储层限制损坏，查询层过滤风险**

### 为什么重要

LLM 幻觉 + 记忆系统 = **放大器效应**。一条错误的记忆一旦存入系统，就会在后续所有对话中被当作"真相"召回。记忆污染比预防更难修复。

### 防御层次

```
输入层
  └── 注入检测器 — 写入前扫描文本，标记可疑模式
         │
         ▼
存储层
  ├── 写入置信度阈值 — confidence < 0.7 的条目被拒绝
  ├── 幻觉风险评分 — 每条记忆 0–1 分（llm_inference +0.3，stale +0.2…）
  ├── 审计日志 — 每次写入/更新/删除记录到 SQLite，防篡改
  └── 版本保留更新 — 旧版本保留，从不静默覆盖
         │
         ▼
查询层
  ├── Session/Agent 隔离 — recall 必须带 sessionId，不允许空范围查询
  ├── 置信度过滤召回 — risk_score ≥ 0.6 的记忆默认不召回
  ├── 过时记忆警告 — [❌90天+] / [⚠️30天+] / [🕐7天+] / [✅实时] 年龄标签
  └── 记忆隔离区 — 被污染的记忆条目隔离，查询时排除
```

### 核心机制

| 功能 | 作用 | 状态 |
|------|------|------|
| **注入检测器** | 扫描 9 种注入模式（ignore previous / XXE / XSS…）| ✅ 已设计 |
| **幻觉风险评分** | 0–1 分：llm_inference +0.3，single_source +0.2，stale +0.2… | ✅ 已设计 |
| **写入置信度阈值** | confidence < 0.7 → 拒绝写入 | ✅ 已设计 |
| **审计日志** | SQLite 审计跟踪，每次操作可追溯 | ✅ 已设计 |
| **Session 隔离** | 每次 recall 必须带 sessionId | ✅ 已设计 |
| **过滤召回** | risk_score ≥ 0.6 默认不返回 | ✅ 已设计 |
| **来源追溯** | recall 结果附带 citation（来源、置信度、年龄）| ✅ 已设计 |
| **过时警告** | 每条 recall 结果附带年龄标签 | ✅ 已设计 |
| **漂移检测器** | 同一 event_id 30天内更新 5+ 次 → 告警 | 📋 计划中 |
| **LLM 自我验证** | 高风险写入触发二次验证后才提交 | 📋 计划中 |
| **事实性分类** | factual / inferential / opinion / preference 每条分类 | 📋 计划中 |

### 幻觉风险评分公式

```typescript
risk_score = min(1.0, 各因子之和)

// 因子：
llm_inference      → +0.3   // LLM 生成，非用户输入
single_source       → +0.2   // 单一来源，无佐证
stale (>30天)      → +0.2   // 信息可能已过期
injection_suspected → +0.2   // 检测到可疑注入模式
no_external_ref     → +0.1   // 无可验证的外部引用

// 示例：
用户输入: "我的名字叫张三"              → risk = 0.0 ✅
LLM 推断: "用户可能喜欢 Python"         → risk = 0.3 🟡
3个月前推断 + 单一来源                  → risk = 0.5 🟡
LLM 推断 + 已过期 + 无引用               → risk = 0.8 🔴
```

### 携带风险上下文的 Recall 结果

```
正常 recall 返回示例：

[✅低风险] 2天前 · user_input · 置信度95%
记忆内容: "使用 miniMax 模型作为默认模型"
---
[⚠️中风险] 35天前 · agent_inference · 置信度72% · 🟡可能过期30天+
记忆内容: "xinference 大概在 9997 端口"
---
[⚠️高风险] 90天前 · agent_inference · 置信度45% · ❌已过期90天+
记忆内容: "这个 API 每天限额 1000 次"  ← 建议验证后再使用
```

### 在架构中的位置

```
┌─────────────────────────────────────────────┐
│          记忆污染防御与反幻觉体系              │
├─────────────────────────────────────────────┤
│  入口:   注入检测器                           │
│  存储:   风险评分 + 审计日志 + 版本控制       │
│  查询:   Session 隔离 + 过滤召回              │
│  验证:   漂移检测 + 自我验证                  │
└─────────────────────────────────────────────┘
         ↑
         ↓
┌─────────────────────────────────────────────┐
│          hawk-bridge（L0 记忆层）            │
│  capture → 风险评估 → 带审计存储             │
│  recall → 风险过滤 → 带年龄返回              │
└─────────────────────────────────────────────┘
```

完整实现细节：见 [TODO.md](TODO.md) → `## 🛡️ Memory Contamination Defense` 和 `## 🧠 Anti-Hallucination`。



## 📖 相关项目

- [🦅 context-hawk](https://github.com/relunctance/context-hawk) — Python 记忆库
- [📋 gql-openclaw](https://github.com/relunctance/gql-openclaw) — 团队协作工作区
- [📖 qujingskills](https://github.com/relunctance/qujingskills) — Laravel 开发规范

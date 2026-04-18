# TODO — hawk-bridge v1.x+v2.x 待办事项

> Last updated: 2026-04-19

---

## 🔴 高优先级（v1.x 内核强化）

### Recall 召回质量（8项）

| # | 任务 | 说明 |
|---|------|------|
| 1 | 记忆 Taxonomy 扩展 | 4类 → user/feedback/project/reference + body_structure |
| 2 | What NOT to Save 指导 | 显式告知 LLM 什么不该存入记忆 |
| 3 | Trust 验证机制 | 记忆提及文件路径时，要求验证真实性 |
| 4 | 记忆年龄标签 | 超过7天显示 freshness caveat |
| 5 | 来源追溯增强 | mtime + category + verification_count |
| 6 | Recent tools-aware 选择 | 排除正在使用工具的文档记忆 |
| 7 | 双重选择器 | manifest 扫描 → LLM 选 topN → 读文件 |
| 8 | Ignore Memory 指令 | 支持"忽略记忆"指令 |

### Capture 写入质量（4项）

| # | 任务 | 说明 |
|---|------|------|
| 9 | 相对日期→绝对日期 | normalizeText 管道增加日期转换 |
| 10 | 写入置信度阈值 | confidence < 0.7 不写入 |
| 11 | 注入检测器 | 扫描 prompt injection 模式 |
| 12 | 来源类型标注 | user_input / agent_inference / system |

---

## 🟡 中优先级（autoself 10层支撑）

| # | 任务 | 支撑 autoself 哪层 |
|---|------|-------------------|
| 13 | Hook 系统完善（Session/Task 生命周期） | L6 agent-brain |
| 14 | 子 Agent 上下文注入 API | L3 执行层 |
| 15 | Learnings 记忆分类 | L1 巡检 + L4 验收 |
| 16 | Task History 记忆 | L6 task-tracker |
| 17 | Effect Evaluation 记忆 | L6 effect-evaluator + L5 进化 |
| 18 | Cron Job 结果自动写入记忆 | L1 定时巡检 |
| 19 | Multi-Agent Session Isolation 验证 | L3 多 Agent |
| 20 | Constitution 锚定记忆接口 | L6 qujin-editor |

---

## 🔵 架构升级（v2.0-v2.x）

### v2.0 统一 Schema

| # | 任务 | 说明 |
|---|------|------|
| v2.0-1 | Tier + Scope 双维度 | L0-L4 时间维度 × Personal/Org/System 所有权维度 |
| v2.0-2 | DARK Archive | 每条记忆一个 JSON 文件，永久存储 |
| v2.0-3 | 冷存储管道 | GitHub + Gitee + NAS 多副本 |
| v2.0-4 | 层级晋升引擎 | L3→L2→L1→L0 自动晋升规则 |

### v2.x 连接器生态

| # | 任务 | 说明 |
|---|------|------|
| v2.x-1 | knowledg-hub 连接器 | 个人/ToB 数据接入 |
| v2.x-2 | 企业连接器 | 飞书/Jira/Confluence/SAP |
| v2.x-3 | Org 记忆层 + ACL | 组织内访问控制 |
| v2.x-4 | 联邦检索 | 跨 scope 统一搜索 |

---

## ✅ 已完成

- v1.2: P0/P1/P2 性能修复（20项）
- v1.1: 9 项改进（retry、backup、pagination、logging、health、reranking、metrics、config）
- v1.0: LanceDB + Ollama/Xinference 基础支持
- FTS5 全文索引
- BM25 + 向量混合搜索
- 4层衰减（Working/Short/Long/Archive）

---

## 📊 功能对比总览

| 维度 | Claude Code | Hermes | hawk-bridge |
|------|-------------|--------|-------------|
| 记忆分类 | 4类 + body_structure | 简单 | 基础4类 |
| What NOT to Save | 显式指导 | 无 | 隐式过滤 |
| Trust 验证 | 有 | 无 | 无 |
| 记忆年龄 | freshness text | 无 | 无 |
| Team Memory | 完整+安全 | 无 | 无 |
| 双重选择器 | scan→LLM→load | 无 | 纯向量 |
| Hook 系统 | 完整 | 有 | 仅 decay |
| autoself 支撑 | — | — | 8项待实现 |

---

*Last updated: 2026-04-19*

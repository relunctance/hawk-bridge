# 修复任务：hawk-bridge 代码未 commit

## 问题描述

- 发现时间：2026-04-15 21:50
- 状态：**严重** — 记忆污染防御体系核心代码未 commit

## 未 commit 的改动

| 文件 | 改动说明 |
|------|----------|
| `src/constants.ts` | 新增 MIN_RECALL_SCORE, INFERENCE_RELIABILITY, INFERENCE_RECALL_PENALTY, UNVERIFIED_LEARNINGS_RELIABILITY, LEARNINGS_VERIFY_BOOST, CORRECTION_BOOST |
| `src/types.ts` | MemoryEntry 新增字段 |
| `src/store/adapters/lancedb.ts` | 新增 confidence/supersedes/supersededBy 字段 + schema 更新 |

## 根因

build 后只 commit 了 TODO.md（d76bed8），src 源码改动未 commit

## 修复步骤

```bash
cd ~/repos/hawk-bridge
git add src/
git commit -m "feat: 记忆污染防御 - 核心字段与可靠性系统"
git push
```

## 验收

- git log 最新 commit 应包含 src/ 改动
- git status 应无未 commit 的 src 改动

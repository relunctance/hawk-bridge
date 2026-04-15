# 修复任务：src/cli/stats.ts 仍未 commit（第6次）

## 问题描述

`src/cli/stats.ts` 持续处于 uncommitted 状态，dist 已编译（11:31）但源码从未 push。历史任务：

- `2026-04-15-1013-stats-not-committed-again.md`
- `2026-04-15-1028-stats-ts-still-uncommitted.md`
- `2026-04-15-1058-push-stats-commit.md`
- `2026-04-15-1114-push-and-stats-uncommitted-4th.md`
- `2026-04-15-1144-escalate-stats-uncommitted-5th.md`

## 根因

build 成功后忘记 `git add + git commit + git push`。

## 修复要求

```bash
cd ~/repos/hawk-bridge
git add src/cli/stats.ts
git commit -m "feat(cli): add stats command"
git push origin main
```

## 验收

- `git log --oneline -1` 显示 stats.ts 的 commit
- GitHub 上可见

## 紧急度

高 — 源码未 push = 代码丢失风险

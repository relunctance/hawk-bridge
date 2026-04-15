# 修复任务：提交 stats.ts 源码（第3次审核未通过）

## 问题
`src/cli/stats.ts` 源码自首次提交后一直未 commit，这是本审核周期内第3次发现相同问题。前两次任务（10:13、10:28）均未修复。

## 当前状态（10:43 检查）
- `src/cli/stats.ts` — **untracked（从未被 git commit）**
- `dist/cli/stats.js` — 已构建但未 commit
- `dist/cli/decay-verify.js` — 已构建但未 commit
- 前两次修复任务均未执行

## 历史记录
- 07:28 — 首次发现 dist 未 commit，创建 push 任务
- 07:58 — 创建 dist-uncommitted 任务
- 10:13 — 创建 stats-not-committed-again 任务
- 10:28 — 创建 stats-ts-still-uncommitted 任务（标注"第2次"）
- 10:43 — 本任务（标注"第3次"）

## 修复步骤
```bash
cd ~/repos/hawk-bridge
git status  # 确认 untracked 文件

# 1. 提交源码
git add src/cli/stats.ts
git commit -m "feat(cli): add stats command for memory statistics"

# 2. 提交编译产物
git add dist/cli/stats.js
# 如果 decay-verify.ts 存在也需要提交
git add dist/cli/decay-verify.js
git commit -m "build: compile stats.ts and decay-verify to dist"

# 3. 构建验证
npm run build

# 4. 推送
git push

# 5. 确认
git log --all --oneline -- src/cli/stats.ts  # 应有输出
```

## 验收标准
- `git log --all --oneline -- src/cli/stats.ts` 有 commit 输出
- `git log --all --oneline -- dist/cli/stats.js` 有 commit 输出
- `git push` 成功，无报错
- 本次 push 的 commit 均已出现在 GitHub

## 优先级
最高 — 同一问题重复3次未修复，违反交付协议

## 创建时间
2026-04-15 10:43

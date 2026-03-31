/**
 * hawk-bridge seed script
 * Populates initial memories about the team so hawk-recall has something to inject
 * 
 * Usage: npx tsx src/seed.ts
 * or: node -e "const {seed}=require('./dist/seed.js');seed()"
 */

import { HawkDB } from './lancedb.js';
import { randomBytes } from 'crypto';

const SEED_MEMORIES = [
  // Team structure
  {
    text: '团队成员：main（统筹/老大）、wukong（悟空/后端）、bajie（八戒/前端）、bailong（白龙/测试）、tseng（唐僧/架构师）',
    category: 'fact',
    importance: 0.9,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: '团队协作规范仓库：https://github.com/relunctance/gql-openclaw，本地路径 /tmp/gql-openclaw，所有任务流转通过 GitHub inbox 机制',
    category: 'fact',
    importance: 0.9,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: '任务流转规范：tasks/inbox/{agent}/ → tasks/in-progress/{agent}/ → tasks/done/{agent}/，命名格式 YYYY-MM-DD-{序号}-{描述}.md',
    category: 'fact',
    importance: 0.8,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: '报告制度：日报 reports/daily/YYYY-MM-DD/{agent}.md，周报 reports/weekly/YYYY-WXX/{agent}.md',
    category: 'fact',
    importance: 0.8,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Git 规范：统一 email 334136724@qq.com，各自 agentID 作为 commit name，消息格式 <agent>: <subject>',
    category: 'fact',
    importance: 0.8,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  // Project context
  {
    text: 'hawk-bridge：记忆系统插件，GitHub github.com/relunctance/hawk-bridge，hook: hawk-recall（启动注入记忆）和 hawk-capture（响应后捕获记忆）',
    category: 'fact',
    importance: 0.9,
    layer: 'long',
    scope: 'project',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'qujingskills：技术规范 Skill，路径 /home/gql/qujingskills/qujin-laravel-team/，定义 Laravel 开发标准和角色 Prompt',
    category: 'fact',
    importance: 0.8,
    layer: 'long',
    scope: 'project',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: '当前项目：goskills（Go 多Agent团队规范）、user-feedback（用户反馈系统）、context-hawk（Python 记忆核心）',
    category: 'fact',
    importance: 0.7,
    layer: 'long',
    scope: 'project',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  // Team norms
  {
    text: '团队规范：所有正式任务流转走 GitHub 仓库，飞书只做提醒和通知，不作为正式任务渠道',
    category: 'decision',
    importance: 0.9,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: '沟通原则：只让用户做简单又关键的一步，其他我来；遇到问题带方案汇报，不只抛问题',
    category: 'preference',
    importance: 0.8,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: '重要原则：修改 openclaw.json 必须先确认，安装 skills 要先检查依赖和风险',
    category: 'decision',
    importance: 0.9,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
];

function generateId(): string {
  return randomBytes(16).toString('hex');
}

export async function seed(): Promise<void> {
  console.log('[seed] Starting seed...');
  const db = new HawkDB();
  await db.init();

  const count = SEED_MEMORIES.length;
  console.log(`[seed] Seeding ${count} memories...`);

  for (const memory of SEED_MEMORIES) {
    const id = generateId();
    await db.store({
      id,
      text: memory.text,
      vector: [], // Empty vector - BM25-only mode doesn't need vectors
      category: memory.category,
      scope: memory.scope,
      importance: memory.importance,
      timestamp: Date.now(),
      metadata: JSON.stringify(memory.metadata),
    });
    console.log(`[seed] Added: ${memory.text.slice(0, 50)}...`);
  }

  console.log(`[seed] Done! Seeded ${count} memories.`);
  process.exit(0);
}

// Run if called directly
seed().catch(err => {
  console.error('[seed] Seed failed:', err);
  process.exit(1);
});

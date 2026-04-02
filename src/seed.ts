/**
 * hawk-bridge seed script
 * Populates generic initial memories about AI agent teams so hawk-recall has context to inject.
 * Users should customize these for their own team after installation.
 * 
 * Usage: npx tsx src/seed.ts
 * or: node -e "const {seed}=require('./dist/seed.js');seed()"
 */

import { HawkDB } from './lancedb.js';
import { createHash } from 'crypto';

const SEED_MEMORIES = [
  // Generic AI agent team context
  {
    text: 'hawk-bridge is an OpenClaw plugin that provides auto-capture and auto-recall of memories for AI agents. It uses LanceDB for storage and supports hybrid search (BM25 + vector).',
    category: 'fact',
    importance: 0.9,
    layer: 'long',
    scope: 'project',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Memory system: Working (temporary) → Short (days) → Long (weeks) → Archive (months). Old memories are automatically pruned based on access patterns.',
    category: 'fact',
    importance: 0.8,
    layer: 'long',
    scope: 'project',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Four retrieval modes: BM25-only (zero-config), Ollama local (free GPU), sentence-transformers (CPU), Jina AI (cloud API with free tier).',
    category: 'fact',
    importance: 0.7,
    layer: 'long',
    scope: 'project',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'hawk-recall hook: Injects relevant memories into agent context before first response. hawk-capture hook: Extracts and stores meaningful content after each response.',
    category: 'fact',
    importance: 0.9,
    layer: 'long',
    scope: 'project',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  // Generic team collaboration concepts
  {
    text: 'AI agent teams work best with clear role definitions: architect (design), engineer (implement), reviewer (quality), coordinator (orchestrate).',
    category: 'fact',
    importance: 0.8,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Structured task workflows improve reliability: inbox → in-progress → done. Task descriptions should include context, acceptance criteria, and priority.',
    category: 'fact',
    importance: 0.8,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Memory persistence: agents benefit from remembering user preferences, project context, and past decisions across sessions.',
    category: 'fact',
    importance: 0.9,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Fallback behavior: when uncertain, ask clarifying questions rather than making assumptions. Prefer conservative actions over destructive ones.',
    category: 'preference',
    importance: 0.8,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Configuration changes (openclaw.json, skills, plugins) should be verified before deployment. Test in non-production environments first.',
    category: 'decision',
    importance: 0.9,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Documentation lives in README files, SKILL.md files, and project wikis. Keep them updated when behavior changes.',
    category: 'fact',
    importance: 0.7,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
  {
    text: 'Customize this seed data after installation to reflect your actual team structure, projects, and conventions. Delete or modify these as needed.',
    category: 'decision',
    importance: 0.5,
    layer: 'long',
    scope: 'team',
    metadata: { source: 'seed', created_at: new Date().toISOString() },
  },
];

/** Deterministic ID from memory text — ensures idempotent seeding */
function seedId(text: string): string {
  return 'seed_' + createHash('sha256').update(text).digest('hex').slice(0, 24);
}

export async function seed(): Promise<void> {
  console.log('[seed] Starting seed...');
  const db = new HawkDB();
  await db.init();

  let added = 0;
  let skipped = 0;

  for (const memory of SEED_MEMORIES) {
    const id = seedId(memory.text);

    // Skip if already exists
    const existing = await db.getById(id);
    if (existing) {
      console.log(`[seed] Skipped (already exists): ${memory.text.slice(0, 60)}...`);
      skipped++;
      continue;
    }

    await db.store({
      id,
      text: memory.text,
      vector: [], // Empty vector - BM25-only mode doesn't need vectors
      category: memory.category as 'fact' | 'preference' | 'decision' | 'entity' | 'other',
      scope: memory.scope,
      importance: memory.importance,
      timestamp: Date.now(),
      metadata: memory.metadata as Record<string, unknown>,
    });
    console.log(`[seed] Added: ${memory.text.slice(0, 60)}...`);
    added++;
  }

  console.log(`[seed] Done! Added: ${added}, Skipped (already exist): ${skipped}.`);
  console.log('[seed] IMPORTANT: Customize these memories for your team in ~/.hawk/lancedb/');
  process.exit(0);
}

// Run if called directly
seed().catch(err => {
  console.error('[seed] Seed failed:', err);
  process.exit(1);
});

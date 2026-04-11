/**
 * hawk-verify — SoulForge × hawk-bridge 协同验证工具
 *
 * 功能：
 * - 读取 SoulForge 的 pattern 分析结果（review/latest.json）
 * - 找到对应的 hawk-bridge 记忆
 * - 将验证结果回写到 LanceDB（reliability boost + soul_verified 标记）
 *
 * 设计原则（解耦）：
 * - hawk-bridge 不导入 soul-force
 * - soul-force 不导入 hawk-bridge
 * - 共享通过 LanceDB schema + JSON 协议实现
 *
 * SoulForge 输出协议（review/latest.json）：
 * {
 *   "patterns": [
 *     {
 *       "id": "pattern_xxx",
 *       "trigger_memory_texts": ["用户说项目用 Python", "用户确认用 Python3"],
 *       "confidence": 0.85,
 *       "applied": true,
 *       "files": ["SOUL.md"],
 *       "pattern_text": "用户偏好简洁回复",
 *       "created_at": "2026-04-11T12:00:00Z"
 *     }
 *   ]
 * }
 *
 * LanceDB 协议（hawk-bridge 已有的 provenance 字段）：
 * - memory.sessionId        → 用于关联同一会话
 * - memory.text            → 用于内容匹配
 * - memory.reliability     → 验证通过 +0.15
 * - memory.soulVerified    → 是否被 soul-force 验证过
 * - memory.soulPatternId   → 对应的 pattern ID
 *
 * 用法：
 *   node dist/cli/verify.js                    # 验证并回写
 *   node dist/cli/verify.js --dry-run          # 只显示不写入
 *   node dist/cli/verify.js --min-confidence 0.8  # 只处理高置信度
 *   node dist/cli/verify.js --soul-dir ~/.soulforge-main  # 指定 soul-force 目录
 */

import { HawkDB } from '../lancedb.js';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

const ARGV = process.argv.slice(2);

function getArg(arg: string, fallback: string): string {
  const idx = ARGV.indexOf(arg);
  return idx >= 0 && ARGV[idx + 1] !== undefined ? ARGV[idx + 1] : fallback;
}

function hasFlag(flag: string): boolean { return ARGV.includes(flag); }

const DRY_RUN     = hasFlag('--dry-run');
const MIN_CONF    = parseFloat(getArg('--min-confidence', '0')) || 0;
const SOUL_DIR    = path.resolve(getArg('--soul-dir', path.join(homedir(), '.soulforge-main')));
const BOOST       = parseFloat(getArg('--boost', '0.15'));  // reliability 每次验证通过 +0.15
const SOUL_CONFIG = path.join(SOUL_DIR, '.soulforgerc.json');

// ─── SoulForge Output Parser ──────────────────────────────────────────────────

interface SoulPattern {
  id: string;
  trigger_memory_texts: string[];
  confidence: number;
  applied: boolean;
  files: string[];
  pattern_text: string;
  created_at: string;
}

interface SoulReviewOutput {
  patterns: SoulPattern[];
  analyzed_at?: string;
}

function findSoulReviewFiles(): string[] {
  const reviewDir = path.join(SOUL_DIR, 'review');
  if (!fs.existsSync(reviewDir)) return [];

  const interactiveFiles = fs.readdirSync(reviewDir)
    .filter(f => f.startsWith('interactive_') && f.endsWith('.json'))
    .sort()
    .reverse()
    .map(f => path.join(reviewDir, f));

  const latest = path.join(reviewDir, 'latest.json');
  const files: string[] = fs.existsSync(latest) ? [latest] : [];
  return [...files, ...interactiveFiles.slice(0, 3)];
}

function parseSoulReview(filePath: string): SoulReviewOutput | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    if (data.patterns && Array.isArray(data.patterns)) {
      return data as SoulReviewOutput;
    }
    // Some formats store patterns differently
    if (Array.isArray(data)) {
      return { patterns: data as SoulPattern[] };
    }
    // v2.2 full format
    if (data.patterns?.patterns) {
      return data.patterns as SoulReviewOutput;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Text Matching ────────────────────────────────────────────────────────────

/** 提取关键词（与 hawk-bridge 的 extractKeywords 保持一致） */
function extractKeywords(text: string): string[] {
  const stop = new Set(['的','了','是','在','和','也','有','就','不','我','你','他','她','它','们','这','那','个','与','或','被','为','上','下','来','去']);
  const words: string[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    const w = text.slice(i, i+2);
    if (!stop.has(w)) words.push(w);
  }
  for (let i = 0; i < text.length - 2; i++) {
    const w = text.slice(i, i+3);
    if (!stop.has(w)) words.push(w);
  }
  return [...new Set(words)];
}

function textSimilarity(a: string, b: string): number {
  const kwA = extractKeywords(a);
  const kwB = extractKeywords(b);
  if (!kwA.length || !kwB.length) return 0;
  const overlap = kwA.filter((k: string) => kwB.includes(k)).length;
  const union  = new Set([...kwA, ...kwB]).size;
  return union > 0 ? overlap / union : 0;
}

/** 在 hawk 记忆中找与 trigger_text 最匹配的记忆 */
async function findMatchingMemory(
  db: HawkDB,
  triggerText: string,
  minSimilarity: number = 0.25,
): Promise<{ id: string; similarity: number } | null> {
  const all = await db.getAllMemories();
  if (!all.length) return null;

  let best: { id: string; similarity: number } | null = null;
  for (const mem of all) {
    const sim = textSimilarity(triggerText, mem.text);
    if (sim >= minSimilarity && (!best || sim > best.similarity)) {
      best = { id: mem.id, similarity: sim };
    }
  }
  return best;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('[hawk-verify] Starting SoulForge × hawk-bridge verification sync');
  if (DRY_RUN) console.log('[hawk-verify] DRY RUN — no changes will be written');

  // Detect SoulForge directory from config
  let soulDir = SOUL_DIR;
  if (fs.existsSync(SOUL_CONFIG)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(SOUL_CONFIG, 'utf-8'));
      if (cfg.learnings_dir) {
        // Learnings dir is like ~/.soulforge-main/learnings/
        // Parent is the soulforge root
        soulDir = path.dirname(cfg.learnings_dir);
      }
    } catch { /* ignore */ }
  }

  const reviewFiles = findSoulReviewFiles();
  if (reviewFiles.length === 0) {
    console.log('[hawk-verify] No SoulForge review files found in:', path.join(soulDir, 'review'));
    console.log('[hawk-verify] Run soul-force first: python3 soulforge.py review');
    process.exit(0);
  }

  console.log('[hawk-verify] Found review files:', reviewFiles.map(f => path.basename(f)).join(', '));

  // Collect all patterns from all review files
  const allPatterns: SoulPattern[] = [];
  for (const file of reviewFiles) {
    const data = parseSoulReview(file);
    if (data?.patterns) {
      allPatterns.push(...data.patterns.filter(p => p.applied && p.confidence >= MIN_CONF));
    }
  }

  if (allPatterns.length === 0) {
    console.log('[hawk-verify] No applied patterns found (min_confidence:', MIN_CONF, ')');
    process.exit(0);
  }

  console.log('[hawk-verify] Found', allPatterns.length, 'applied patterns with confidence >=' + MIN_CONF);

  // Connect to hawk-bridge DB
  const db = new HawkDB();
  await db.init();
  const totalMemories = await db.count();
  console.log('[hawk-verify] Hawk memories in DB:', totalMemories);

  let verified = 0;
  let skipped = 0;
  const results: Array<{ pattern: string; memory: string; sim: number; boost: number }> = [];

  for (const pattern of allPatterns) {
    for (const triggerText of pattern.trigger_memory_texts || []) {
      const match = await findMatchingMemory(db, triggerText);
      if (!match) { skipped++; continue; }

      const mem = await db.getById(match.id);
      if (!mem) { skipped++; continue; }

      // Skip already verified by this pattern (idempotent)
      if ((mem as any).soulPatternId === pattern.id) { skipped++; continue; }

      const boostAmount = BOOST * pattern.confidence;

      if (DRY_RUN) {
        console.log(`  [DRY] Would boost: "${mem.text.slice(0, 40)}..."`);
        console.log(`       pattern: "${pattern.pattern_text.slice(0, 40)}..." +${(boostAmount * 100).toFixed(0)}%`);
      } else {
        await db.verifySoulPattern(match.id, pattern.id, pattern.pattern_text, boostAmount);
        verified++;
        console.log(`  ✅ Boosted: "${mem.text.slice(0, 40)}..."`);
        console.log(`     ← "${pattern.pattern_text.slice(0, 40)}..." +${(boostAmount * 100).toFixed(0)}%`);
      }

      results.push({
        pattern: pattern.pattern_text.slice(0, 50),
        memory: mem.text.slice(0, 50),
        sim: match.similarity,
        boost: boostAmount,
      });
    }
  }

  console.log('\n[h hawk-verify] Summary');
  console.log('  Patterns processed:', allPatterns.length);
  console.log('  Memories verified:', verified);
  console.log('  Skipped (no match):', skipped);
  if (DRY_RUN) console.log('  (DRY RUN — no changes written)');

  // Save verification record
  if (!DRY_RUN && verified > 0) {
    try {
      const recordDir = path.join(homedir(), '.hawk');
      if (!fs.existsSync(recordDir)) fs.mkdirSync(recordDir, { recursive: true });
      const recordFile = path.join(recordDir, `verify-${Date.now()}.json`);
      fs.writeFileSync(recordFile, JSON.stringify({
        verified_at: new Date().toISOString(),
        patterns_processed: allPatterns.length,
        memories_verified: verified,
        results,
        min_confidence: MIN_CONF,
        boost_per_confidence_unit: BOOST,
      }, null, 2));
      console.log('  Record saved:', recordFile);
    } catch { /* ignore */ }
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('[hawk-verify] Fatal error:', err);
  process.exit(1);
});

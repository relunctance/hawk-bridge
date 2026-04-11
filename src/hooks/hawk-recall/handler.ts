// hawk-recall hook
// Triggered on: agent:bootstrap
// Action: Hybrid search (vector + BM25 + RRF + rerank + noise filter) → inject memories

import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { HawkDB } from '../../lancedb.js';
import { HybridRetriever } from '../../retriever.js';
import { getConfig } from '../../config.js';
import { RELIABILITY_THRESHOLD_HIGH, RECENCY_GRACE_DAYS } from '../../constants.js';

// Shared HawkDB instance — single connection, reused across handler calls
let sharedDb: HawkDB | null = null;
function getSharedDb(): HawkDB {
  if (!sharedDb) { sharedDb = new HawkDB(); }
  return sharedDb;
}

// Global dirty flag: set by hawk-capture after storing new memories
let bm25DirtyGlobal = false;
export function markBm25Dirty(): void { bm25DirtyGlobal = true; }

// Promise-based cache for retriever
let retrieverPromise: Promise<HybridRetriever> | null = null;

async function getRetriever(): Promise<HybridRetriever> {
  if (!retrieverPromise) {
    retrieverPromise = (async () => {
      const config = await getConfig();
      const db = getSharedDb();
      await db.init();
      const { Embedder } = await import('../../embeddings.js');
      const embedder = new Embedder(config.embedding);
      const r = new HybridRetriever(db, embedder);
      await r.buildNoisePrototypes();
      return r;
    })();
  }
  const retriever = await retrieverPromise;
  if (bm25DirtyGlobal) { retriever.markDirty(); bm25DirtyGlobal = false; }
  return retriever;
}

// ─── Intent Detection ─────────────────────────────────────────────────────────

const FORGET_PATTERNS = [
  /^忘掉\s*(.+)/, /^忘记\s*(.+)/, /^别记得\s*(.+)/,
  /^不用记\s*(.+)/, /^forget\s+(.+)/i, /^delete\s+(.+)/i,
];

// 只接受显式纠正句式：纠正: 新内容
const CORRECT_PATTERN = /^(?:纠正|correct)\s*[:：]\s*(.+)/i;

const LOCK_PATTERNS = [
  /^锁定\s*(.+)/, /^lock\s+(.+)/i,
];
const UNLOCK_PATTERNS = [
  /^解锁\s*(.+)/, /^unlock\s+(.+)/i,
];

function detectForget(text: string): string | null {
  for (const p of FORGET_PATTERNS) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function detectCorrect(text: string): string | null {
  const m = text.match(CORRECT_PATTERN);
  return m ? m[1].trim() : null;
}

function detectLock(text: string): string | null {
  for (const p of LOCK_PATTERNS) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function detectUnlock(text: string): string | null {
  for (const p of UNLOCK_PATTERNS) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

// ─── Semantic Memory Matcher ───────────────────────────────────────────────────

/**
 * 用语义相似度找最可能被纠正的记忆
 * 策略：
 * 1. 提取新内容的关键词
 * 2. 在所有记忆中找文本相似度最高的（编辑距离 + 关键词重叠）
 * 3. 返回最匹配的 ID
 */
async function findMemoryBySemanticMatch(
  db: HawkDB,
  newContent: string,
): Promise<string | null> {
  const all = await db.getAllMemories();
  if (!all.length) return null;

  // 提取关键词（简单的中文分词）
  const keywords = extractKeywords(newContent);
  let best: { id: string; score: number } | null = null;

  for (const m of all) {
    const memKeywords = extractKeywords(m.text);
    // Jaccard similarity on keywords
    const overlap = keywords.filter(k => memKeywords.includes(k)).length;
    const union = new Set([...keywords, ...memKeywords]).size;
    const jaccard = union > 0 ? overlap / union : 0;

    // 额外的文本长度惩罚（太长或太短的匹配可信度低）
    const lenPenalty = Math.min(m.text.length / newContent.length, newContent.length / m.text.length);
    const score = jaccard * 0.7 + lenPenalty * 0.3;

    if (!best || score > best.score) {
      best = { id: m.id, score };
    }
  }

  return best && best.score > 0.1 ? best.id : null;
}

/**
 * 简单中文关键词提取（基于字符 n-gram + 停用词过滤）
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['的', '了', '是', '在', '和', '也', '有', '就', '不', '我', '你', '他', '她', '它', '们', '这', '那', '个', '与', '或', '的', '被', '为', '上', '下', '来', '去']);
  const words: string[] = [];
  // 2-char and 3-char ngrams
  for (let i = 0; i < text.length - 1; i++) {
    const w2 = text.slice(i, i + 2);
    if (!stopWords.has(w2)) words.push(w2);
  }
  for (let i = 0; i < text.length - 2; i++) {
    const w3 = text.slice(i, i + 3);
    if (!stopWords.has(w3)) words.push(w3);
  }
  return [...new Set(words)];
}

// ─── Formatter ────────────────────────────────────────────────────────────────

function formatMemoryForDashboard(m: ReturnType<HawkDB['getAllMemories']> extends Promise<infer T> ? T extends (infer U)[] ? U : never : never, emoji: string): string {
  const rel = m.reliability >= RELIABILITY_THRESHOLD_HIGH ? '✅' : m.reliability >= 0.4 ? '⚠️' : '❌';
  const relPct = Math.round(m.reliability * 100);
  const lockedTag = m.locked ? ' 🔒' : '';
  const correctionNote = m.correctionHistory.length > 0
    ? ` [纠正×${m.correctionHistory.length}]`
    : '';

  let timeNote = '';
  if (m.lastVerifiedAt) {
    const daysSince = Math.floor((Date.now() - m.lastVerifiedAt) / 86400000);
    if (daysSince === 0) timeNote = '(今天验证)';
    else if (daysSince < 30) timeNote = `(${daysSince}天前验证)`;
    else timeNote = `(${Math.floor(daysSince / 30)}个月前验证)`;
  }

  return `${rel} ${relPct}%${lockedTag} [${m.category}]${correctionNote} ${m.text.slice(0, 80)}${m.text.length > 80 ? '...' : ''} ${timeNote}`;
}

function formatRecallWithReliability(memories: any[], emoji: string): string {
  if (!memories.length) return '';
  const lines = [`${emoji} ** hawk 记忆检索结果 **`];
  for (const m of memories) {
    const scoreTag = `(${(m.score * 100).toFixed(0)}%相关)`;
    const lockTag = m.locked ? ' 🔒' : '';
    const correctionNote = m.correctionCount > 0 ? ` (纠正×${m.correctionCount})` : '';
    lines.push(`${m.reliabilityLabel} ${scoreTag}${lockTag}${correctionNote} [${m.category}] ${m.text}`);
  }
  return lines.join('\n');
}

// ─── Sanitizer ────────────────────────────────────────────────────────────────

const RECALL_SANITIZE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[\w-]{8,}["']?/gi, '$1: [REDACTED]'],
  [/\b1[3-9]\d{9}\b/g, '[PHONE_REDACTED]'],
  [/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, '[EMAIL_REDACTED]'],
  [/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, '[ID_REDACTED]'],
];

function sanitizeForRecall(text: string): string {
  let result = text;
  for (const [p, r] of RECALL_SANITIZE_PATTERNS) {
    result = result.replace(p, r);
  }
  return result;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

function auditRecall(count: number, query: string): void {
  try {
    const { appendFileSync } = require('fs');
    const { homedir } = require('os');
    const { join } = require('path');
    const logPath = join(homedir(), '.hawk', 'audit.log');
    appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), action: 'recall', count, query }) + '\n');
  } catch { /* non-critical */ }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

const recallHandler = async (event: HookEvent) => {
  if (event.type !== 'agent' || event.action !== 'bootstrap') return;

  try {
    const config = await getConfig();
    const { topK, injectEmoji, minScore } = config.recall;

    const sessionEntry = event.context?.sessionEntry;
    if (!sessionEntry) return;

    const messages: any[] = sessionEntry.messages || [];
    let latestUserMessage = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user' && msg.content) {
        latestUserMessage = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        break;
      }
    }
    if (!latestUserMessage || latestUserMessage.trim().length < 2) return;

    const db = getSharedDb();
    await db.init();
    const trimmed = latestUserMessage.trim();

    // ─── hawk记忆 / hawk记忆列表 ───────────────────────────────────────────
    if (trimmed === 'hawk记忆' || trimmed === 'hawk记忆列表') {
      const all = await db.getAllMemories();
      if (!all.length) {
        event.messages.push(`\n${injectEmoji} 还没有任何记忆。\n`);
        return;
      }
      // 按 reliability 排序
      const sorted = [...all].sort((a, b) => b.reliability - a.reliability);
      const lines = [`${injectEmoji} ** hawk 记忆列表（共 ${all.length} 条） **`];
      for (const m of sorted.slice(0, 30)) {
        lines.push(formatMemoryForDashboard(m, injectEmoji));
      }
      if (all.length > 30) lines.push(`...还有 ${all.length - 30} 条`);
      event.messages.push(`\n${lines.join('\n')}\n`);
      return;
    }

    // ─── 锁定 ────────────────────────────────────────────────────────────────
    const lockKeyword = detectLock(trimmed);
    if (lockKeyword) {
      const all = await db.getAllMemories();
      const match = all.find(m => m.text.toLowerCase().includes(lockKeyword.toLowerCase()));
      if (match) {
        await db.lock(match.id);
        event.messages.push(`\n${injectEmoji} 已锁定该记忆（decay 不再影响，遗忘保护）\n`);
        return;
      } else {
        event.messages.push(`\n${injectEmoji} 没有找到与"${lockKeyword}"相关的记忆\n`);
        return;
      }
    }

    // ─── 解锁 ────────────────────────────────────────────────────────────────
    const unlockKeyword = detectUnlock(trimmed);
    if (unlockKeyword) {
      const all = await db.getAllMemories();
      const match = all.find(m => m.text.toLowerCase().includes(unlockKeyword.toLowerCase()));
      if (match) {
        await db.unlock(match.id);
        event.messages.push(`\n${injectEmoji} 已解锁该记忆\n`);
        return;
      } else {
        event.messages.push(`\n${injectEmoji} 没有找到与"${unlockKeyword}"相关的记忆\n`);
        return;
      }
    }

    // ─── 遗忘 ────────────────────────────────────────────────────────────────
    const forgetKeyword = detectForget(trimmed);
    if (forgetKeyword) {
      const all = await db.getAllMemories();
      const match = all.find(m => m.text.toLowerCase().includes(forgetKeyword.toLowerCase()));
      if (match) {
        const ok = await db.forget(match.id);
        if (ok) {
          event.messages.push(`\n${injectEmoji} 已遗忘该记忆。\n`);
        } else {
          event.messages.push(`\n${injectEmoji} 该记忆已锁定，无法遗忘。如需删除请先解锁。\n`);
        }
        return;
      } else {
        event.messages.push(`\n${injectEmoji} 没有找到与"${forgetKeyword}"相关的记忆。\n`);
        return;
      }
    }

    // ─── 纠正 ────────────────────────────────────────────────────────────────
    const correctContent = detectCorrect(trimmed);
    if (correctContent) {
      const id = await findMemoryBySemanticMatch(db, correctContent);
      if (id) {
        await db.verify(id, false, correctContent);
        event.messages.push(`\n${injectEmoji} 已纠正记忆 → ${correctContent}\n`);
        return;
      } else {
        event.messages.push(`\n${injectEmoji} 没有找到需要纠正的记忆。请先确认是哪条记忆出错。\n`);
        return;
      }
    }

    // ─── 正常召回 ───────────────────────────────────────────────────────────
    const retrieverInstance = await getRetriever();
    const memories = await retrieverInstance.search(trimmed, topK);

    // 高可靠性可 override 低分数；低可靠性需要更高分数
    const useable = memories.filter(m =>
      m.score >= minScore || m.reliability >= RELIABILITY_THRESHOLD_HIGH
    );

    if (!useable.length) return;

    const sanitized = useable.map(m => ({ ...m, text: sanitizeForRecall(m.text) }));
    const injectionText = formatRecallWithReliability(sanitized, injectEmoji);
    event.messages.push(`\n${injectionText}\n`);

    // 成功应用的记忆提升可靠性
    for (const m of useable) {
      if (m.score >= minScore) {
        await db.verify(m.id, true);
      }
    }

    if (config.audit?.enabled) {
      auditRecall(sanitized.length, trimmed.slice(0, 100));
    }

  } catch (err) {
    console.error('[hawk-recall] Error:', err);
  }
};

export default recallHandler;

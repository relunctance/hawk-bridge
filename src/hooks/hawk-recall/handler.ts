// hawk-recall hook
// Triggered on: agent:bootstrap
// Action: Hybrid search (vector + BM25 + RRF + rerank + noise filter) → inject memories

import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { HawkDB } from '../../lancedb.js';
import { Embedder, formatRecallForContext } from '../../embeddings.js';
import { HybridRetriever } from '../../retriever.js';
import { getConfig } from '../../config.js';
import { RELIABILITY_THRESHOLD_HIGH } from '../../constants.js';

// Global dirty flag: set by hawk-capture after storing new memories
let bm25DirtyGlobal = false;
export function markBm25Dirty(): void { bm25DirtyGlobal = true; }

// Shared HawkDB instance — single connection, reused across handler calls
let sharedDb: HawkDB | null = null;

function getSharedDb(): HawkDB {
  if (!sharedDb) {
    sharedDb = new HawkDB();
  }
  return sharedDb;
}

// Promise-based cache prevents concurrent initialization
let retrieverPromise: Promise<HybridRetriever> | null = null;

async function getRetriever(): Promise<HybridRetriever> {
  if (!retrieverPromise) {
    retrieverPromise = (async () => {
      const config = await getConfig();
      const db = getSharedDb();
      await db.init();
      const embedder = new Embedder(config.embedding);
      const r = new HybridRetriever(db, embedder);
      await r.buildNoisePrototypes();
      return r;
    })();
  }
  const retriever = await retrieverPromise;
  if (bm25DirtyGlobal) {
    retriever.markDirty();
    bm25DirtyGlobal = false;
  }
  return retriever;
}

const recallHandler = async (event: HookEvent) => {
  if (event.type !== 'agent' || event.action !== 'bootstrap') return;

  try {
    const config = await getConfig();
    const { topK, injectEmoji, minScore } = config.recall;

    const sessionEntry = event.context?.sessionEntry;
    if (!sessionEntry) return;

    const messages: any[] = sessionEntry.messages || [];

    // 提取用户最新消息
    let latestUserMessage = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user' && msg.content) {
        latestUserMessage = typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);
        break;
      }
    }

    if (!latestUserMessage || latestUserMessage.trim().length < 2) return;

    const db = getSharedDb();
    await db.init();

    // ─── Handle "Show Memories" ──────────────────────────────────────────────
    if (latestUserMessage.trim() === 'hawk记忆' || latestUserMessage.trim() === 'hawk 记忆') {
      const all = await db.getAllMemories();
      if (!all.length) {
        event.messages.push(`\n${injectEmoji} 还没有任何记忆。\n`);
        return;
      }
      const lines = [`${injectEmoji} ** 当前记忆列表（共 ${all.length} 条） **`];
      for (const m of all.slice(0, 20)) {
        const rel = m.reliability >= RELIABILITY_THRESHOLD_HIGH ? '✅' : m.reliability >= 0.4 ? '⚠️' : '❌';
        lines.push(`${rel} [${m.category}] ${m.text.slice(0, 80)}${m.text.length > 80 ? '...' : ''}`);
      }
      if (all.length > 20) lines.push(`...还有 ${all.length - 20} 条`);
      event.messages.push(`\n${lines.join('\n')}\n`);
      return;
    }

    // ─── Handle Forget ────────────────────────────────────────────────────────
    const forgetKeyword = detectForget(latestUserMessage);
    if (forgetKeyword) {
      const id = await findMemoryByKeyword(db, forgetKeyword);
      if (id) {
        await db.forget(id);
        event.messages.push(`\n${injectEmoji} 已遗忘相关记忆。\n`);
        return;
      } else {
        event.messages.push(`\n${injectEmoji} 没有找到与"${forgetKeyword}"相关的记忆。\n`);
        return;
      }
    }

    // ─── Handle Correct ───────────────────────────────────────────────────────
    // Reliable patterns: "纠正: 新内容" 或 "correct: 新内容"
    // 只提取新内容，然后通过语义匹配找最可能的记忆来替换
    const correctResult = detectCorrect(latestUserMessage);
    if (correctResult) {
      const { correct } = correctResult;
      // 用新内容做搜索，找最相关的记忆来纠正
      const candidates = await db.getAllMemories();
      if (candidates.length) {
        // 简单匹配：新内容包含某个关键词，或者记忆文本包含新内容的片段
        const match = candidates.find(m =>
          m.text.toLowerCase().includes(correct.toLowerCase().slice(0, 10)) ||
          correct.toLowerCase().includes(m.text.toLowerCase().slice(0, 10))
        );
        if (match) {
          await db.verify(match.id, false, correct);
          event.messages.push(`\n${injectEmoji} 已纠正记忆：${correct}\n`);
          return;
        }
      }
      event.messages.push(`\n${injectEmoji} 没有找到需要纠正的记忆，请先说清楚要纠正哪条。\n`);
      return;
    }

    // ─── Normal Recall ─────────────────────────────────────────────────────────
    const retrieverInstance = await getRetriever();
    const memories = await retrieverInstance.search(latestUserMessage, topK);

    // 高可靠性记忆可以 override 低分数阈值
    const useable = memories.filter(m =>
      m.score >= minScore || m.reliability >= RELIABILITY_THRESHOLD_HIGH
    );

    if (!useable.length) return;

    // 脱敏
    const sanitized = useable.map(m => ({
      ...m,
      text: sanitizeForRecall(m.text),
    }));

    const injectionText = formatRecallWithReliability(sanitized, injectEmoji);
    event.messages.push(`\n${injectionText}\n`);

    // 成功应用的记忆提升可靠性
    for (const m of useable) {
      if (m.score >= minScore) {
        await db.verify(m.id, true); // confirmed=true → +boost
      }
    }

    if (config.audit?.enabled) {
      auditRecall(sanitized.length, latestUserMessage.slice(0, 100));
    }

  } catch (err) {
    console.error('[hawk-recall] Error:', err);
  }
};

// ─── Intent Detection ─────────────────────────────────────────────────────────

const FORGET_PATTERNS = [
  /^忘掉\s*(.+)/,
  /^忘记\s*(.+)/,
  /^别记得\s*(.+)/,
  /^不用记\s*(.+)/,
  /^forget\s+(.+)/i,
  /^delete\s+(.+)/i,
];

// 只保留明确的纠正句式，避免误判
// 格式：纠正: 新内容  / correct: 新内容
const CORRECT_PATTERN = /^(?:纠正|correct)\s*[:：]\s*(.+)/i;

/**
 * 从用户消息中检测 forget 意图
 */
function detectForget(queryText: string): string | null {
  const text = queryText.trim();
  for (const pattern of FORGET_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * 从用户消息中检测 correct 意图
 * 返回新内容（纠正后的正确说法）
 */
function detectCorrect(queryText: string): { correct: string } | null {
  const text = queryText.trim();
  const match = text.match(CORRECT_PATTERN);
  if (match && match[1]) return { correct: match[1].trim() };
  return null;
}

/**
 * 用关键词搜索找匹配的记忆（不加载全量）
 */
async function findMemoryByKeyword(db: HawkDB, keyword: string): Promise<string | null> {
  const all = await db.getAllMemories();
  const lower = keyword.toLowerCase();
  // 优先精确匹配
  const exact = all.find(m => m.text.toLowerCase().includes(lower));
  return exact ? exact.id : null;
}

// ─── Recall Formatter with Reliability ────────────────────────────────────────

function formatRecallWithReliability(
  memories: RetrievedMemory[],
  emoji: string = '🦅'
): string {
  if (!memories.length) return '';
  const lines = [`${emoji} ** hawk 记忆检索结果 **`];
  for (const m of memories) {
    const scoreTag = `(${(m.score * 100).toFixed(0)}%相关)`;
    lines.push(`${m.reliabilityLabel} ${scoreTag} [${m.category}] ${m.text}`);
  }
  return lines.join('\n');
}

// ─── Sanitizer ────────────────────────────────────────────────────────────────

const RECALL_SANITIZE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[\w-]{8,}["']?/gi, '$1: [RECALLED_REDACTED]'],
  [/\b1[3-9]\d{9}\b/g, '[PHONE_REDACTED]'],
  [/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, '[EMAIL_REDACTED]'],
  [/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, '[ID_REDACTED]'],
];

function sanitizeForRecall(text: string): string {
  let result = text;
  for (const [pattern, replacement] of RECALL_SANITIZE_PATTERNS) {
    result = result.replace(pattern, replacement);
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
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      action: 'recall',
      count,
      query,
    }) + '\n';
    appendFileSync(logPath, entry);
  } catch {
    // Non-critical
  }
}

export default recallHandler;

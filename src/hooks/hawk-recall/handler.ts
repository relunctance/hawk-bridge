// hawk-recall hook
// Triggered on: agent:bootstrap
// Action: Hybrid search (vector + BM25 + RRF + rerank + noise filter) → inject memories

import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { HawkDB } from '../../lancedb.js';
import { Embedder, formatRecallForContext } from '../../embeddings.js';
import { HybridRetriever } from '../../retriever.js';
import { getConfig } from '../../config.js';

// Global dirty flag: set by hawk-capture after storing new memories
// Checked at start of each search to trigger BM25 index rebuild
let bm25DirtyGlobal = false;
export function markBm25Dirty(): void { bm25DirtyGlobal = true; }

// Promise-based cache prevents concurrent initialization (race condition fix)
let retrieverPromise: Promise<HybridRetriever> | null = null;

async function getRetriever(): Promise<HybridRetriever> {
  if (!retrieverPromise) {
    retrieverPromise = (async () => {
      const config = await getConfig();
      const db = new HawkDB();
      await db.init();
      const embedder = new Embedder(config.embedding);
      const r = new HybridRetriever(db, embedder);
      await r.buildNoisePrototypes();
      // BM25 index is built lazily on first search via _ensureBm25Index()
      return r;
    })();
  }
  const retriever = await retrieverPromise;
  // If hawk-capture stored new memories, invalidate BM25 index so it rebuilds on next search
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

    const db = new HawkDB();
    await db.init();

    // ─── Handle Forget ────────────────────────────────────────────────────────
    const forgetKeyword = detectForget(latestUserMessage);
    if (forgetKeyword) {
      const id = await findMemoryForForget(db, forgetKeyword);
      if (id) {
        await db.forget(id);
        event.messages.push(`\n${injectEmoji} 已遗忘相关记忆。\n`);
        console.log(`[hawk-recall] Forgotten: ${forgetKeyword}`);
        return;
      } else {
        event.messages.push(`\n${injectEmoji} 没有找到与"${forgetKeyword}"相关的记忆。\n`);
        return;
      }
    }

    // ─── Handle Correct ───────────────────────────────────────────────────────
    const correctResult = detectCorrect(latestUserMessage);
    if (correctResult) {
      const { wrong, correct } = correctResult;
      const id = await findMemoryForCorrect(db, wrong, correct);
      if (id) {
        await db.verify(id, false, correct);
        event.messages.push(`\n${injectEmoji} 已纠正记忆：${correct}\n`);
        console.log(`[hawk-recall] Corrected memory ${id}: ${correct}`);
        return;
      }
    }

    // ─── Normal Recall ─────────────────────────────────────────────────────────
    const retrieverInstance = await getRetriever();
    const memories = await retrieverInstance.search(latestUserMessage, topK);

    // 高可靠性记忆可以 override 低分数阈值（但低可靠性记忆需要更高分数）
    const useable = memories.filter(m =>
      m.score >= minScore || m.reliability >= 0.7
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
        await db.verify(m.id, true); // confirmed=true → +0.1
      }
    }

    if (config.audit?.enabled) {
      auditRecall(sanitized.length, latestUserMessage.slice(0, 100));
    }

  } catch (err) {
    console.error('[hawk-recall] Error:', err);
  }
};

// ─── Forget / Correct Detection ───────────────────────────────────────────────

const FORGET_PATTERNS = [
  /忘掉[。,]?\s*(.+)/,
  /忘记[。,]?\s*(.+)/,
  /别记得[。,]?\s*(.+)/,
  /不用记[。,]?\s*(.+)/,
  /forget[。,\s]+(.+)/i,
  /delete[。,\s]+(.+)/i,
];

const CORRECT_PATTERNS = [
  /^不对[，。]?(.+)/,
  /不是[（(]?(.*?)[)）][。,]?(.+)/,
  /纠正[，,]?\s*(.+)/,
  /其实[是]?[。,]?\s*(.+)/,
  /correct[：:]\s*(.+)/i,
];

/**
 * 从用户消息中检测 forget 意图
 */
function detectForget(queryText: string): string | null {
  for (const pattern of FORGET_PATTERNS) {
    const match = queryText.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * 从用户消息中检测 correct 意图
 */
function detectCorrect(queryText: string): { wrong: string; correct: string } | null {
  for (const pattern of CORRECT_PATTERNS) {
    const match = queryText.match(pattern);
    if (match && match.length >= 2) {
      const wrong = (match[1] || '').trim();
      const correct = (match.slice(2).join(' ') || wrong).trim();
      if (wrong && correct) return { wrong, correct };
    }
  }
  return null;
}

/**
 * 查找与关键词最匹配的记忆 ID（用于 forget）
 */
async function findMemoryForForget(db: HawkDB, keyword: string): Promise<string | null> {
  const all = await db.getAllMemories?.() ?? [];
  const lower = keyword.toLowerCase();
  const match = all.find(m => m.text.toLowerCase().includes(lower));
  return match ? match.id : null;
}

/**
 * 查找与错误说法最匹配的记忆（用于 correct）
 */
async function findMemoryForCorrect(db: HawkDB, wrongText: string, correctText: string): Promise<string | null> {
  const all = await db.getAllMemories?.() ?? [];
  const lower = wrongText.toLowerCase();
  const match = all.find(m => m.text.toLowerCase().includes(lower));
  return match ? match.id : null;
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

// ─── Recall Sanitizer ─────────────────────────────────────────────────────────

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

// ─── Audit Log ────────────────────────────────────────────────────────────────

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

function extractQueryFromSession(sessionEntry: any): string {
  if (!sessionEntry) return '';
  const messages: any[] = sessionEntry.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && msg.content) {
      return typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
    }
  }
  return '';
}

export default recallHandler;

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

    const queryText = extractQueryFromSession(sessionEntry);
    if (!queryText || queryText.trim().length < 2) return;

    const retrieverInstance = await getRetriever();
    const memories = await retrieverInstance.search(queryText, topK);

    // ─── Recall Gate: enforce minScore ─────────────────────────────────────────
    const relevant = memories.filter(m => m.score >= minScore);

    // ─── Sanitize recalled memories before injection ───────────────────────────
    const sanitized = relevant.map(m => ({
      ...m,
      text: sanitizeForRecall(m.text),
    }));

    if (!sanitized.length) return;

    const injectionText = formatRecallForContext(
      sanitized.map(m => ({
        text: m.text,
        score: m.score,
        category: m.category,
      })),
      injectEmoji
    );

    event.messages.push(`\n${injectionText}\n`);

    // Audit log
    if (config.audit?.enabled) {
      auditRecall(sanitized.length, queryText.slice(0, 100));
    }

  } catch (err) {
    console.error('[hawk-recall] Error:', err);
  }
};

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

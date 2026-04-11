// hawk-recall hook
// Triggered on: agent:bootstrap
// Action: Hybrid search + reliability UX commands

import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { HawkDB } from '../../lancedb.js';
import { HybridRetriever } from '../../retriever.js';
import { getConfig } from '../../config.js';
import { RELIABILITY_THRESHOLD_HIGH } from '../../constants.js';

// Shared HawkDB instance
let sharedDb: HawkDB | null = null;
function getSharedDb(): HawkDB {
  if (!sharedDb) sharedDb = new HawkDB();
  return sharedDb;
}

// Global dirty flag
let bm25DirtyGlobal = false;
export function markBm25Dirty(): void { bm25DirtyGlobal = true; }

// Retriever cache
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

const FORGET_PATTERNS   = [/^忘掉\s*(.+)/, /^忘记\s*(.+)/, /^别记得\s*(.+)/, /^不用记\s*(.+)/, /^forget\s+(.+)/i, /^delete\s+(.+)/i];
const CORRECT_PATTERN   = /^(?:纠正|correct)\s*[:：]\s*(.+)/i;
const LOCK_PATTERNS     = [/^锁定\s*(.+)/, /^lock\s+(.+)/i];
const UNLOCK_PATTERNS   = [/^解锁\s*(.+)/, /^unlock\s+(.+)/i];
const EDIT_PATTERN      = /^hawk\s*编辑\s*(?:\s*(\d+))?/i;      // hawk编辑 / hawk编辑 3
const HISTORY_PATTERN   = /^hawk\s*历史\s*(?:[:：]\s*(.+))?/i; // hawk历史 / hawk历史: 项目
const CHECK_PATTERN     = /^hawk\s*检查(?:\s+(\d+))?/i;        // hawk检查 / hawk检查 5
const MEMORY_LIST_PATTERN = /^hawk\s*记忆(?:\s+(.+?)(?:\s+(\d+))?)?/i; // hawk记忆 / hawk记忆 fact / hawk记忆 2

function matchFirst<T>(text: string, patterns: Array<RegExp>): T | null {
  const trimmed = text.trim();
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1]?.trim() as T;
  }
  return null;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function relLabel(r: number): string {
  return r >= 0.7 ? '✅' : r >= 0.4 ? '⚠️' : '❌';
}

function fmtRel(m: { reliability: number; baseReliability?: number }): string {
  const r = m.reliability;
  const base = m.baseReliability ?? r;
  if (Math.abs(r - base) < 0.01) return `${Math.round(r*100)}%`;
  return `${Math.round(r*100)}% (基础${Math.round(base*100)}%)`;
}

function formatMemoryRow(m: any, idx: number, showId: boolean): string {
  const rel  = relLabel(m.reliability);
  const tag  = m.locked ? ' 🔒' : '';
  const corr = m.correctionCount > 0 ? ` [纠正×${m.correctionCount}]` : '';
  const id_  = showId ? `[${idx}] ` : '';
  return `${rel} ${fmtRel(m)}${tag}${corr} [${m.category}] ${id_}${m.text.slice(0, 80)}${m.text.length > 80 ? '...' : ''}`;
}

function formatRecallResults(memories: any[], emoji: string): string {
  if (!memories.length) return '';
  const lines = [`${emoji} ** hawk 记忆检索结果 **`];
  for (const m of memories) {
    const lock = m.locked ? ' 🔒' : '';
    const corr = m.correctionCount > 0 ? ` (纠正×${m.correctionCount})` : '';
    const score = `(${(m.score*100).toFixed(0)}%相关)`;
    lines.push(`${m.reliabilityLabel} ${score}${lock}${corr} [${m.category}] ${m.text}`);
  }
  return lines.join('\n');
}

// ─── Sanitizer ─────────────────────────────────────────────────────────────

const SANITIZE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[\w-]{8,}["']?/gi, '$1: [REDACTED]'],
  [/\b1[3-9]\d{9}\b/g, '[PHONE_REDACTED]'],
  [/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, '[EMAIL_REDACTED]'],
  [/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, '[ID_REDACTED]'],
];

function sanitize(text: string): string {
  let r = text;
  for (const [p, repl] of SANITIZE_PATTERNS) r = r.replace(p, repl);
  return r;
}

// ─── Semantic Correction Matcher ─────────────────────────────────────────────

async function findMemoryBySemanticMatch(db: HawkDB, newContent: string): Promise<string | null> {
  const all = await db.getAllMemories();
  if (!all.length) return null;
  const keywords = extractKeywords(newContent);
  let best: { id: string; score: number } | null = null;
  for (const m of all) {
    const memKw = extractKeywords(m.text);
    const overlap = keywords.filter(k => memKw.includes(k)).length;
    const union  = new Set([...keywords, ...memKw]).size;
    const jaccard = union > 0 ? overlap / union : 0;
    const lenPenalty = Math.min(m.text.length / Math.max(newContent.length, 1), newContent.length / Math.max(m.text.length, 1));
    const score = jaccard * 0.7 + lenPenalty * 0.3;
    if (!best || score > best.score) best = { id: m.id, score };
  }
  return best && best.score > 0.1 ? best.id : null;
}

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

// ─── Main Handler ───────────────────────────────────────────────────────────

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
    if (!latestUserMessage?.trim()) return;

    const db = getSharedDb();
    await db.init();
    const trimmed = latestUserMessage.trim();
    const sessionId = sessionEntry.sessionId ?? undefined;

    // ─── hawk记忆 [category] [page] ─────────────────────────────────────────
    {
      const m = trimmed.match(MEMORY_LIST_PATTERN);
      if (m) {
        const category = m[1] || '';
        const page     = Math.max(1, parseInt(m[2] || '1', 10));
        const PAGE_SIZE = 20;
        const all = await db.getAllMemories();
        if (!all.length) { event.messages.push(`\n${injectEmoji} 还没有任何记忆。\n`); return; }

        let filtered = all;
        if (category && ['fact','preference','decision','entity','other'].includes(category)) {
          filtered = all.filter(x => x.category === category);
        }
        // Sort: locked first, then by reliability desc
        const sorted = [...filtered].sort((a, b) => {
          if (a.locked !== b.locked) return a.locked ? -1 : 1;
          return b.reliability - a.reliability;
        });

        const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
        const pageItems  = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

        const lines = [`${injectEmoji} ** hawk 记忆列表 **${category ? ` [${category}]` : ''} ${page}/${totalPages}页 共${sorted.length}条 **`];
        for (let i = 0; i < pageItems.length; i++) {
          lines.push(formatMemoryRow(pageItems[i], (page-1)*PAGE_SIZE + i + 1, true));
        }
        if (totalPages > 1) lines.push(`\n→ hawk记忆 ${category} ${page+1}  查看下一页`);
        event.messages.push(`\n${lines.join('\n')}\n`);
        return;
      }
    }

    // ─── hawk编辑 [n] ─────────────────────────────────────────────────────
    {
      const m = trimmed.match(EDIT_PATTERN);
      if (m) {
        const all = await db.getAllMemories();
        if (!all.length) { event.messages.push(`\n${injectEmoji} 还没有任何记忆。\n`); return; }
        // 如果没有数字，显示前5条让用户选择
        const sorted = [...all].sort((a, b) => b.reliability - a.reliability);
        if (!m[1]) {
          const lines = [`${injectEmoji} ** 选择要编辑的记忆 **`];
          for (let i = 0; i < Math.min(5, sorted.length); i++) {
            lines.push(`[${i+1}] ${formatMemoryRow(sorted[i], i+1, false)}`);
          }
          lines.push(`\n→ hawk编辑 <编号>  例如：hawk编辑 3`);
          event.messages.push(`\n${lines.join('\n')}\n`);
          return;
        }
        const idx = parseInt(m[1], 10) - 1;
        if (idx < 0 || idx >= sorted.length) {
          event.messages.push(`\n${injectEmoji} 无效编号，有效范围 1-${sorted.length}\n`);
          return;
        }
        const mem = sorted[idx];
        const timeInfo = mem.sessionId
          ? `\n📝 创建于: ${formatTime(mem.createdAt)} | session: ${mem.sessionId}`
          : `\n📝 创建于: ${formatTime(mem.createdAt)}`;
        const editPrompt =
          `\n${injectEmoji} ** 编辑记忆 [#${idx+1}] **` +
          `\n分类: ${mem.category} | 可靠性: ${fmtRel(mem)} | ${mem.locked ? '🔒 已锁定' : '未锁定'}` +
          `${timeInfo}` +
          `\n内容: ${mem.text}` +
          (mem.correctionCount > 0 ? `\n纠正历史: ${mem.correctionCount}次` : '') +
          `\n\n请回复新内容，格式: hawk新内容 <新文本>` +
          `\n或 hawk改分类 <fact|preference|decision|entity|other>`;
        event.messages.push(`${editPrompt}\n`);
        // 记住编辑状态（通过一个临时标记）
        event.context._hawkEditTarget = mem.id;
        return;
      }
    }

    // ─── hawk新内容 <文本> ─────────────────────────────────────────────────
    if (trimmed.startsWith('hawk新内容 ')) {
      const newText = trimmed.slice('hawk新内容 '.length).trim();
      const targetId = (event.context as any)._hawkEditTarget;
      if (!targetId || !newText) {
        event.messages.push(`\n${injectEmoji} 无效的编辑请求。\n`); return;
      }
      const ok = await db.update(targetId, { text: newText });
      delete (event.context as any)._hawkEditTarget;
      event.messages.push(`\n${injectEmoji} ${ok ? '✅ 记忆已更新' : '❌ 更新失败'} → ${newText.slice(0,60)}${newText.length > 60 ? '...' : ''}\n`);
      return;
    }

    // ─── hawk改分类 <category> ──────────────────────────────────────────────
    if (trimmed.startsWith('hawk改分类 ')) {
      const cat = trimmed.slice('hawk改分类 '.length).trim();
      const valid = ['fact','preference','decision','entity','other'];
      if (!valid.includes(cat)) {
        event.messages.push(`\n${injectEmoji} 无效分类。有效值: ${valid.join(', ')}\n`); return;
      }
      const targetId = (event.context as any)._hawkEditTarget;
      if (!targetId) {
        event.messages.push(`\n${injectEmoji} 请先执行 hawk编辑 选择要编辑的记忆。\n`); return;
      }
      const ok = await db.update(targetId, { category: cat });
      delete (event.context as any)._hawkEditTarget;
      event.messages.push(`\n${injectEmoji} ${ok ? `✅ 已更新分类为 [${cat}]` : '❌ 更新失败'}\n`);
      return;
    }

    // ─── hawk历史 [关键词] ─────────────────────────────────────────────────
    {
      const m = trimmed.match(HISTORY_PATTERN);
      if (m) {
        const keyword = m[1]?.trim() || '';
        const all = await db.getAllMemories();
        const withHistory = all.filter(x => x.correctionHistory.length > 0);
        const relevant = keyword
          ? withHistory.filter(x => x.text.toLowerCase().includes(keyword.toLowerCase()))
          : withHistory;

        if (!relevant.length) {
          event.messages.push(`\n${injectEmoji} 没有找到${keyword ? `与"${keyword}"相关` : ''}的纠正历史。\n`);
          return;
        }

        const lines = [`${injectEmoji} ** 纠正历史 ${keyword ? `(关键词: ${keyword}) ` : ''}共${relevant.length}条 **`];
        for (const mem of relevant) {
          lines.push(`\n📌 [${mem.category}] ${mem.text.slice(0,60)}${mem.text.length > 60 ? '...' : ''}`);
          for (let i = 0; i < mem.correctionHistory.length; i++) {
            const c = mem.correctionHistory[i];
            lines.push(`   ${i+1}. ${formatTime(c.ts)}: "${c.oldText.slice(0,50)}${c.oldText.length > 50 ? '...' : ''}" → "${c.newText.slice(0,50)}${c.newText.length > 50 ? '...' : ''}"`);
          }
        }
        event.messages.push(`\n${lines.join('\n')}\n`);
        return;
      }
    }

    // ─── hawk检查 [n] ─────────────────────────────────────────────────────
    {
      const m = trimmed.match(CHECK_PATTERN);
      if (m) {
        const count = Math.min(10, Math.max(1, parseInt(m[1] || '1', 10)));
        const all = await db.getAllMemories();
        if (!all.length) { event.messages.push(`\n${injectEmoji} 还没有任何记忆。\n`); return; }

        // 选最低可靠性的记忆（优先级：❌ 未验证 > ⚠️ > ✅）
        const candidates = [...all].sort((a, b) => a.reliability - b.reliability);
        const picked = candidates.slice(0, count);

        const lines = [`${injectEmoji} ** 主动验证 (${count}条最低可靠性记忆) **\n请确认以下记忆是否正确：\n`];
        for (let i = 0; i < picked.length; i++) {
          const mem = picked[i];
          lines.push(`${i+1}. ${relLabel(mem.reliability)} ${fmtRel(mem)} [${mem.category}] ${mem.text.slice(0,70)}${mem.text.length > 70 ? '...' : ''}`);
          lines.push(`   → 回复"${i+1} 对"确认正确，或"${i+1} 纠正: 正确内容"来纠正`);
        }
        event.messages.push(`\n${lines.join('\n')}\n`);
        event.context._hawkCheckIndex = picked.map(m => m.id);
        return;
      }
    }

    // ─── hawk确认 [n] [对|纠正: 内容] ──────────────────────────────────────
    {
      const confirmMatch = trimmed.match(/^hawk确认\s+(\d+)\s+(.+)/i);
      if (confirmMatch) {
        const idx = parseInt(confirmMatch[1], 10) - 1;
        const action = confirmMatch[2].trim();
        const targetIds: string[] = (event.context as any)._hawkCheckIndex || [];

        if (idx < 0 || idx >= targetIds.length) {
          event.messages.push(`\n${injectEmoji} 无效编号。\n`); return;
        }
        const id = targetIds[idx];
        if (action === '对' || action === '正确') {
          await db.verify(id, true);
          event.messages.push(`\n${injectEmoji} ✅ 已确认第 ${idx+1} 条记忆，可靠性已提升。\n`);
        } else if (action.startsWith('纠正:') || action.startsWith('纠正：')) {
          const correct = action.replace(/^纠正[:：]\s*/, '').trim();
          await db.verify(id, false, correct);
          event.messages.push(`\n${injectEmoji} ✅ 已纠正第 ${idx+1} 条记忆 → ${correct}\n`);
        } else {
          event.messages.push(`\n${injectEmoji} 无效操作。请用"${idx+1} 对"确认或"${idx+1} 纠正: 正确内容"纠正。\n`);
        }
        return;
      }
    }

    // ─── 锁定 ───────────────────────────────────────────────────────────────
    {
      const keyword = matchFirst<string>(trimmed, LOCK_PATTERNS);
      if (keyword !== null) {
        const all = await db.getAllMemories();
        const match = all.find(x => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) {
          await db.lock(match.id);
          event.messages.push(`\n${injectEmoji} 🔒 已锁定该记忆。\n`);
        } else {
          event.messages.push(`\n${injectEmoji} 没有找到与"${keyword}"相关的记忆。\n`);
        }
        return;
      }
    }

    // ─── 解锁 ───────────────────────────────────────────────────────────────
    {
      const keyword = matchFirst<string>(trimmed, UNLOCK_PATTERNS);
      if (keyword !== null) {
        const all = await db.getAllMemories();
        const match = all.find(x => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) {
          await db.unlock(match.id);
          event.messages.push(`\n${injectEmoji} 🔓 已解锁该记忆。\n`);
        } else {
          event.messages.push(`\n${injectEmoji} 没有找到与"${keyword}"相关的记忆。\n`);
        }
        return;
      }
    }

    // ─── 遗忘 ───────────────────────────────────────────────────────────────
    {
      const keyword = matchFirst<string>(trimmed, FORGET_PATTERNS);
      if (keyword !== null) {
        const all = await db.getAllMemories();
        const match = all.find(x => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) {
          const ok = await db.forget(match.id);
          event.messages.push(`\n${injectEmoji} ${ok ? '✅ 已遗忘该记忆。' : '❌ 该记忆已锁定，无法遗忘。请先解锁。'}\n`);
        } else {
          event.messages.push(`\n${injectEmoji} 没有找到与"${keyword}"相关的记忆。\n`);
        }
        return;
      }
    }

    // ─── 纠正 ───────────────────────────────────────────────────────────────
    {
      const correct = matchFirst<string>(trimmed, [CORRECT_PATTERN]);
      if (correct !== null) {
        const id = await findMemoryBySemanticMatch(db, correct);
        if (id) {
          await db.verify(id, false, correct);
          event.messages.push(`\n${injectEmoji} ✅ 已纠正 → ${correct}\n`);
        } else {
          event.messages.push(`\n${injectEmoji} 没有找到需要纠正的记忆。\n`);
        }
        return;
      }
    }

    // ─── 正常召回 ──────────────────────────────────────────────────────────
    const retrieverInstance = await getRetriever();
    const memories = await retrieverInstance.search(trimmed, topK);
    const useable = memories.filter(m => m.score >= minScore || m.reliability >= RELIABILITY_THRESHOLD_HIGH);
    if (!useable.length) return;

    const sanitized = useable.map(m => ({ ...m, text: sanitize(m.text) }));
    event.messages.push(`\n${formatRecallResults(sanitized, injectEmoji)}\n`);

    for (const m of useable) {
      if (m.score >= minScore) await db.verify(m.id, true);
    }

    if (config.audit?.enabled) {
      try {
        const { appendFileSync, join } = require('fs');
        const { homedir } = require('os');
        appendFileSync(join(homedir(), '.hawk', 'audit.log'),
          JSON.stringify({ ts: new Date().toISOString(), action: 'recall', count: sanitized.length, query: trimmed.slice(0, 100) }) + '\n');
      } catch { /* non-critical */ }
    }

  } catch (err) {
    console.error('[hawk-recall] Error:', err);
  }
};

export default recallHandler;

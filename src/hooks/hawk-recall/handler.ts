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
function getSharedDb(): HawkDB { if (!sharedDb) sharedDb = new HawkDB(); return sharedDb; }

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

// ─── Intent Patterns ──────────────────────────────────────────────────────────

const FORGET_PATTERNS    = [/^忘掉\s*(.+)/, /^忘记\s*(.+)/, /^别记得\s*(.+)/, /^不用记\s*(.+)/, /^forget\s+(.+)/i, /^delete\s+(.+)/i];
const CORRECT_PATTERN    = /^(?:纠正|correct)\s*[:：]\s*(.+)/i;
const LOCK_PATTERNS      = [/^锁定\s*(.+)/, /^lock\s+(.+)/i];
const UNLOCK_PATTERNS    = [/^解锁\s*(.+)/, /^unlock\s+(.+)/i];
const EDIT_PATTERN       = /^hawk\s*编辑(?:\s*(\d+))?/i;
const HISTORY_PATTERN    = /^hawk\s*历史(?:\s*[:：]\s*(.+))?/i;
const CHECK_PATTERN      = /^hawk\s*检查(?:\s+(\d+))?/i;
const MEMORY_LIST_PATTERN = /^hawk\s*记忆(?:\s+([a-z]+))?(?:\s+(\d+))?$/i;
const IMPORTANT_PATTERN   = /^hawk\s*重要\s*(\d+)(?:\s*×?([\d.]+))?$/i;
const UNIMPORTANT_PATTERN  = /^hawk\s*不重要\s*(\d+)$/i;
const REVIEW_PATTERN     = /^hawk\s*回顾(?:\s+(\d+))?$/i;
const SCOPE_PATTERN      = /^hawk\s*(?:scope|作用域)\s*(\d+)\s+(personal|team|project)$/i;
const CONFLICT_PATTERN   = /^hawk\s*冲突\s*(\d+)$/i;

function matchFirst(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) { const m = text.trim().match(p); if (m) return (m[1] ?? '').trim(); }
  return null;
}

// ─── Formatters ────────────────────────────────────────────────────────────

function relLabel(r: number): string { return r >= 0.7 ? '✅' : r >= 0.4 ? '⚠️' : '❌'; }

function fmtRel(m: { reliability: number; baseReliability?: number }): string {
  const r = m.reliability, b = m.baseReliability ?? r;
  return Math.abs(r - b) < 0.01 ? `${Math.round(r*100)}%` : `${Math.round(r*100)}%(基础${Math.round(b*100)}%)`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatMemoryRow(m: any, idx: number): string {
  const rel   = relLabel(m.reliability);
  const tag   = m.locked ? ' 🔒' : '';
  const imp   = m.importanceOverride > 1.5 ? ' ⭐' : m.importanceOverride < 0.7 ? ' ↓' : '';
  const cold  = m.coldStartUntil && Date.now() < m.coldStartUntil ? ' 🛡' : '';
  const corr  = m.correctionCount > 0 ? ` [纠正×${m.correctionCount}]` : '';
  const scope = m.scope !== 'personal' ? ` [${m.scope}]` : '';
  return `${rel} ${fmtRel(m)}${tag}${imp}${cold}${corr}${scope} [${idx}] [${m.category}] ${m.text.slice(0, 75)}${m.text.length > 75 ? '...' : ''}`;
}

function formatRecallResults(memories: any[], emoji: string): string {
  if (!memories.length) return '';
  const lines = [`${emoji} ** hawk 记忆检索 **`];
  for (const m of memories) {
    const lock  = m.locked ? ' 🔒' : '';
    const imp   = m.importanceOverride > 1.5 ? ' ⭐' : '';
    const corr  = m.correctionCount > 0 ? ` (纠正×${m.correctionCount})` : '';
    const score = `(${(m.score*100).toFixed(0)}%相关)`;
    const reason = m.matchReason ? `\n   → ${m.matchReason}` : '';
    lines.push(`${m.reliabilityLabel} ${score}${lock}${imp}${corr} [${m.category}] ${m.text}${reason}`);
  }
  return lines.join('\n');
}

// ─── Keyword Extractor ─────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  const stop = new Set(['的','了','是','在','和','也','有','就','不','我','你','他','她','它','们','这','那','个','与','或','被','为','上','下','来','去']);
  const words: string[] = [];
  for (let i = 0; i < text.length - 1; i++) { const w = text.slice(i,i+2); if (!stop.has(w)) words.push(w); }
  for (let i = 0; i < text.length - 2; i++) { const w = text.slice(i,i+3); if (!stop.has(w)) words.push(w); }
  return [...new Set(words)];
}

function computeMatchReason(query: string, memory: any): string {
  const qKw = extractKeywords(query);
  const mKw = extractKeywords(memory.text);
  const overlap = qKw.filter((k: string) => mKw.includes(k));
  if (overlap.length === 0) return '';
  return `命中: "${overlap.slice(0,3).join('", "')}"`;
}

// ─── Semantic Matcher ────────────────────────────────────────────────────────

async function findMemoryBySemanticMatch(db: HawkDB, newContent: string): Promise<{ id: string; score: number } | null> {
  const all = await db.getAllMemories();
  if (!all.length) return null;
  const keywords = extractKeywords(newContent);
  let best: { id: string; score: number } | null = null;
  for (const m of all) {
    const memKw  = extractKeywords(m.text);
    const overlap = keywords.filter((k: string) => memKw.includes(k)).length;
    const union  = new Set([...keywords, ...memKw]).size;
    const jaccard = union > 0 ? overlap / union : 0;
    const lenPenalty = Math.min(m.text.length / Math.max(newContent.length, 1), newContent.length / Math.max(m.text.length, 1));
    const score = jaccard * 0.7 + lenPenalty * 0.3;
    if (!best || score > best.score) best = { id: m.id, score };
  }
  return best && best.score > 0.1 ? best : null;
}

// ─── Sanitizer ─────────────────────────────────────────────────────────────

const SANITIZE: Array<[RegExp, string]> = [
  [/(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[\w-]{8,}["']?/gi, '$1: [REDACTED]'],
  [/\b1[3-9]\d{9}\b/g, '[PHONE_REDACTED]'],
  [/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, '[EMAIL_REDACTED]'],
  [/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, '[ID_REDACTED]'],
];
function sanitize(text: string): string { let r = text; for (const [p, repl] of SANITIZE) r = r.replace(p, repl); return r; }

// ─── Main Handler ─────────────────────────────────────────────────────────

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
    const ctx: any = event.context;

    // ─── hawk记忆 [category] [page] ──────────────────────────────────────
    if ((m = trimmed.match(MEMORY_LIST_PATTERN))) {
      const category = m[1] || '';
      const page     = Math.max(1, parseInt(m[2] || '1', 10));
      const PAGE_SIZE = 20;
      let all = await db.getAllMemories();
      if (!all.length) { event.messages.push(`\n${injectEmoji} 还没有任何记忆。\n`); return; }
      if (category && ['fact','preference','decision','entity','other'].includes(category)) {
        all = all.filter(x => x.category === category);
      }
      const sorted = [...all].sort((a, b) => {
        if (a.locked !== b.locked) return a.locked ? -1 : 1;
        return b.reliability - a.reliability;
      });
      const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
      const pageItems  = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
      const lines = [`${injectEmoji} ** hawk 记忆 ${page}/${totalPages}页 共${sorted.length}条 **${category ? ` [${category}]` : ''}**`];
      for (let i = 0; i < pageItems.length; i++) {
        lines.push(formatMemoryRow(pageItems[i], (page-1)*PAGE_SIZE + i + 1));
      }
      if (totalPages > 1) lines.push(`\n→ hawk记忆 ${category} ${page+1}`);
      lines.push(`\n→ hawk重要 N ×2  标记为重要`);
      lines.push(`→ hawk不重要 N     降低重要性`);
      event.messages.push(`\n${lines.join('\n')}\n`);
      return;
    }

    // ─── hawk重要 N [×倍数] ──────────────────────────────────────────────
    var m = trimmed.match(IMPORTANT_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const mult = parseFloat(m[2] || '2');
      const all = await getSortedMemories(db);
      if (idx < 1 || idx > all.length) { event.messages.push(`\n${injectEmoji} 无效编号 (1-${all.length})\n`); return; }
      const mem = all[idx-1];
      await db.markImportant(mem.id, mult);
      const lines = [`${injectEmoji} ** 已标记为重要 **`];
      lines.push(formatMemoryRow(mem, idx));
      lines.push(`\n→ importanceOverride: ${mem.importanceOverride} → ${mult}`);
      event.messages.push(`\n${lines.join('\n')}\n`);
      return;
    }

    // ─── hawk不重要 N ────────────────────────────────────────────────────
    var m = trimmed.match(UNIMPORTANT_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const all = await getSortedMemories(db);
      if (idx < 1 || idx > all.length) { event.messages.push(`\n${injectEmoji} 无效编号 (1-${all.length})\n`); return; }
      const mem = all[idx-1];
      await db.update(mem.id, { importanceOverride: 0.5 });
      event.messages.push(`\n${injectEmoji} 已降低优先级。\n`);
      return;
    }

    // ─── hawk作用域 N personal|team|project ─────────────────────────────────
    var m = trimmed.match(SCOPE_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const scopeVal = m[2] as 'personal' | 'team' | 'project';
      const all = await getSortedMemories(db);
      if (idx < 1 || idx > all.length) { event.messages.push(`\n${injectEmoji} 无效编号 (1-${all.length})\n`); return; }
      await db.update(all[idx-1].id, { scope: scopeVal });
      event.messages.push(`\n${injectEmoji} 已设置作用域为 [${scopeVal}]\n`);
      return;
    }

    // ─── hawk编辑 [n] ─────────────────────────────────────────────────────
    var m = trimmed.match(EDIT_PATTERN);
    if (m) {
      const all = await getSortedMemories(db);
      if (!all.length) { event.messages.push(`\n${injectEmoji} 还没有任何记忆。\n`); return; }
      if (!m[1]) {
        const lines = [`${injectEmoji} ** 选择要编辑的记忆 **`];
        for (let i = 0; i < Math.min(5, all.length); i++) lines.push(`[${i+1}] ${formatMemoryRow(all[i], i+1)}`);
        lines.push(`\n→ hawk编辑 <编号>`);
        event.messages.push(`\n${lines.join('\n')}\n`);
        return;
      }
      const idx = parseInt(m[1], 10) - 1;
      if (idx < 0 || idx >= all.length) { event.messages.push(`\n${injectEmoji} 无效编号 (1-${all.length})\n`); return; }
      const mem = all[idx];
      ctx._hawkEditTarget = mem.id;
      const scopeMap: Record<string, string> = { personal: '个人', team: '团队', project: '项目' };
      event.messages.push(
        `\n${injectEmoji} ** 编辑记忆 [#${idx+1}] **` +
        `\n分类: ${mem.category} | 可靠性: ${fmtRel(mem)} | 作用域: ${scopeMap[mem.scope] ?? mem.scope}` +
        `\n创建: ${formatTime(mem.createdAt)} | 修改: ${formatTime(mem.updatedAt)}` +
        (mem.sessionId ? `\nsession: ${mem.sessionId}` : '') +
        `\n内容: ${mem.text}` +
        (mem.correctionCount > 0 ? `\n纠正历史: ${mem.correctionCount}次` : '') +
        `\n\n→ hawk新内容 <文本>` +
        `\n→ hawk改分类 <fact|preference|decision|entity|other>` +
        `\n→ hawk重要 ×2    → hawk不重要    → hawk作用域 personal|team|project` +
        `\n→ hawk冲突 ${idx+1}  检查是否与新内容冲突\n`
      );
      return;
    }

    // ─── hawk新内容 <文本> ───────────────────────────────────────────────
    if (trimmed.startsWith('hawk新内容 ')) {
      const newText = trimmed.slice('hawk新内容 '.length).trim();
      const targetId = ctx._hawkEditTarget;
      if (!targetId || !newText) { event.messages.push(`\n${injectEmoji} 无效编辑请求。\n`); return; }
      const ok = await db.update(targetId, { text: newText });
      delete ctx._hawkEditTarget;
      event.messages.push(`\n${injectEmoji} ${ok ? '✅ 已更新' : '❌ 失败'} → ${newText.slice(0,60)}\n`);
      return;
    }

    // ─── hawk改分类 <cat> ────────────────────────────────────────────────
    if (trimmed.startsWith('hawk改分类 ')) {
      const cat = trimmed.slice('hawk改分类 '.length).trim();
      const valid = ['fact','preference','decision','entity','other'];
      if (!valid.includes(cat)) { event.messages.push(`\n${injectEmoji} 无效分类: ${valid.join(', ')}\n`); return; }
      const targetId = ctx._hawkEditTarget;
      if (!targetId) { event.messages.push(`\n${injectEmoji} 请先执行 hawk编辑 选择记忆。\n`); return; }
      const ok = await db.update(targetId, { category: cat });
      delete ctx._hawkEditTarget;
      event.messages.push(`\n${injectEmoji} ${ok ? `✅ 已更新为 [${cat}]` : '❌ 失败'}\n`);
      return;
    }

    // ─── hawk历史 [关键词] ────────────────────────────────────────────────
    var m = trimmed.match(HISTORY_PATTERN);
    if (m) {
      const kw = m[1]?.trim() || '';
      const all = await db.getAllMemories();
      const withHistory = all.filter(x => x.correctionHistory.length > 0);
      const relevant = kw ? withHistory.filter(x => x.text.toLowerCase().includes(kw.toLowerCase())) : withHistory;
      if (!relevant.length) { event.messages.push(`\n${injectEmoji} 没有找到${kw ? `"${kw}"相关` : ''}的纠正历史。\n`); return; }
      const lines = [`${injectEmoji} ** 纠正历史 ${kw ? `(关键词: ${kw}) ` : ''}共${relevant.length}条 **`];
      for (const mem of relevant) {
        lines.push(`\n📌 [${mem.category}] ${mem.text.slice(0,60)}`);
        for (let i = 0; i < mem.correctionHistory.length; i++) {
          const c = mem.correctionHistory[i];
          lines.push(`   ${i+1}. ${formatTime(c.ts)}: "${c.oldText.slice(0,40)}" → "${c.newText.slice(0,40)}"`);
        }
      }
      event.messages.push(`\n${lines.join('\n')}\n`);
      return;
    }

    // ─── hawk冲突 N ──────────────────────────────────────────────────────
    var m = trimmed.match(CONFLICT_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const all = await getSortedMemories(db);
      if (idx < 1 || idx > all.length) { event.messages.push(`\n${injectEmoji} 无效编号\n`); return; }
      const mem = all[idx-1];
      const conflicts = await db.detectConflicts(mem.text, mem.category);
      if (!conflicts.length) { event.messages.push(`\n${injectEmoji} 未检测到与[#${idx}]冲突的记忆。\n`); return; }
      const lines = [`${injectEmoji} ⚠️ ** 检测到 ${conflicts.length} 条可能冲突 **`];
      for (const c of conflicts) {
        lines.push(`\n🔴 [${c.category}] "${c.text.slice(0,60)}"`);
        lines.push(`   可靠性: ${fmtRel(c)} | 创建: ${formatTime(c.createdAt)}`);
      }
      event.messages.push(`\n${lines.join('\n')}\n`);
      return;
    }

    // ─── hawk回顾 [N] ───────────────────────────────────────────────────
    var m = trimmed.match(REVIEW_PATTERN);
    if (m) {
      const count = Math.min(10, Math.max(1, parseInt(m[1] || '3', 10)));
      const reviewConfig = config.review;
      const minRel = reviewConfig?.minReliability ?? 0.5;
      const batch = reviewConfig?.batchSize ?? 5;
      const candidates = await db.getReviewCandidates(minRel, batch);
      if (!candidates.length) { event.messages.push(`\n${injectEmoji} 没有需要回顾的记忆（可靠性均≥${Math.round(minRel*100)}%）。\n`); return; }
      const lines = [`${injectEmoji} ** 主动回顾 (${candidates.length}条最低可靠性) **`];
      for (let i = 0; i < candidates.length; i++) {
        const mem = candidates[i];
        lines.push(`\n${i+1}. ${relLabel(mem.reliability)} ${fmtRel(mem)} [${mem.category}] ${mem.text.slice(0,70)}`);
        lines.push(`   → 回复"${i+1} 对"确认 或 "${i+1} 纠正: 正确内容"`);
      }
      event.messages.push(`\n${lines.join('\n')}\n`);
      ctx._hawkCheckIndex = candidates.map(m => m.id);
      return;
    }

    // ─── hawk检查 [N] (legacy alias for hawk回顾) ─────────────────────────
    var m = trimmed.match(CHECK_PATTERN);
    if (m) {
      const count = Math.min(10, Math.max(1, parseInt(m[1] || '3', 10)));
      const candidates = await db.getReviewCandidates(0.5, count);
      if (!candidates.length) { event.messages.push(`\n${injectEmoji} 没有需要检查的记忆。\n`); return; }
      const lines = [`${injectEmoji} ** 主动检查 (${candidates.length}条) **`];
      for (let i = 0; i < candidates.length; i++) {
        const mem = candidates[i];
        lines.push(`\n${i+1}. ${relLabel(mem.reliability)} ${fmtRel(mem)} [${mem.category}] ${mem.text.slice(0,70)}`);
        lines.push(`   → "${i+1} 对" 或 "${i+1} 纠正: 正确内容"`);
      }
      event.messages.push(`\n${lines.join('\n')}\n`);
      ctx._hawkCheckIndex = candidates.map(m => m.id);
      return;
    }

    // ─── hawk确认 N 对|纠正: 内容 ──────────────────────────────────────
    const confirmMatch = trimmed.match(/^hawk确认\s+(\d+)\s+(.+)/i);
    if (confirmMatch) {
      const idx   = parseInt(confirmMatch[1], 10) - 1;
      const action = confirmMatch[2].trim();
      const targetIds: string[] = ctx._hawkCheckIndex || [];
      if (idx < 0 || idx >= targetIds.length) { event.messages.push(`\n${injectEmoji} 无效编号\n`); return; }
      const id = targetIds[idx];
      if (action === '对' || action === '正确') {
        await db.verify(id, true);
        event.messages.push(`\n${injectEmoji} ✅ 已确认，可靠性提升。\n`);
      } else if (/^纠正/.test(action)) {
        const correct = action.replace(/^纠正[:：]?\s*/, '').trim();
        await db.verify(id, false, correct);
        event.messages.push(`\n${injectEmoji} ✅ 已纠正 → ${correct}\n`);
      } else {
        event.messages.push(`\n${injectEmoji} 无效操作。用"${idx+1} 对"或"${idx+1} 纠正: 正确内容"\n`);
      }
      return;
    }

    // ─── 锁定 ───────────────────────────────────────────────────────────
    {
      const keyword = matchFirst(trimmed, LOCK_PATTERNS);
      if (keyword !== null) {
        const all = await db.getAllMemories();
        const match = all.find(x => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) { await db.lock(match.id); event.messages.push(`\n${injectEmoji} 🔒 已锁定。\n`); }
        else event.messages.push(`\n${injectEmoji} 没有找到与"${keyword}"相关的记忆。\n`);
        return;
      }
    }

    // ─── 解锁 ───────────────────────────────────────────────────────────
    {
      const keyword = matchFirst(trimmed, UNLOCK_PATTERNS);
      if (keyword !== null) {
        const all = await db.getAllMemories();
        const match = all.find(x => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) { await db.unlock(match.id); event.messages.push(`\n${injectEmoji} 🔓 已解锁。\n`); }
        else event.messages.push(`\n${injectEmoji} 没有找到与"${keyword}"相关的记忆。\n`);
        return;
      }
    }

    // ─── 遗忘 ───────────────────────────────────────────────────────────
    {
      const keyword = matchFirst(trimmed, FORGET_PATTERNS);
      if (keyword !== null) {
        const all = await db.getAllMemories();
        const match = all.find(x => x.text.toLowerCase().includes(keyword.toLowerCase()));
        if (match) {
          const ok = await db.forget(match.id);
          event.messages.push(`\n${injectEmoji} ${ok ? '✅ 已遗忘。' : '❌ 已锁定，无法遗忘。'}\n`);
        } else {
          event.messages.push(`\n${injectEmoji} 没有找到与"${keyword}"相关的记忆。\n`);
        }
        return;
      }
    }

    // ─── 纠正 ───────────────────────────────────────────────────────────
    {
      const correct = matchFirst(trimmed, [CORRECT_PATTERN]);
      if (correct !== null) {
        const result = await findMemoryBySemanticMatch(db, correct);
        if (result) {
          await db.verify(result.id, false, correct);
          event.messages.push(`\n${injectEmoji} ✅ 已纠正 → ${correct}\n`);
        } else {
          event.messages.push(`\n${injectEmoji} 没有找到需要纠正的记忆。\n`);
        }
        return;
      }
    }

    // ─── 正常召回 ───────────────────────────────────────────────────────
    const retriever = await getRetriever();
    const memories  = await retriever.search(trimmed, topK);
    const useable   = memories.filter(m => m.score >= minScore || m.reliability >= RELIABILITY_THRESHOLD_HIGH);
    if (!useable.length) return;

    // Compute match reasons for each result
    const withReasons = useable.map(m => ({
      ...m,
      matchReason: computeMatchReason(trimmed, m),
    }));

    const sanitized = withReasons.map(m => ({ ...m, text: sanitize(m.text) }));
    event.messages.push(`\n${formatRecallResults(sanitized, injectEmoji)}\n`);

    for (const m of useable) {
      if (m.score >= minScore) await db.verify(m.id, true);
    }

    if (config.audit?.enabled) {
      try {
        const { appendFileSync, join } = require('fs');
        const { homedir } = require('os');
        appendFileSync(join(homedir(), '.hawk', 'audit.log'),
          JSON.stringify({ ts: new Date().toISOString(), action: 'recall', count: sanitized.length, query: trimmed.slice(0,100) }) + '\n');
      } catch { /* non-critical */ }
    }

  } catch (err) {
    console.error('[hawk-recall] Error:', err);
  }
};

// Helper
async function getSortedMemories(db: HawkDB) {
  const all = await db.getAllMemories();
  return [...all].sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    return b.reliability - a.reliability;
  });
}

export default recallHandler;

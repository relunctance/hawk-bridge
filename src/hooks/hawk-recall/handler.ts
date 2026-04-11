// hawk-recall hook
// Triggered on: agent:bootstrap
// Action: Hybrid search + reliability UX commands

import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import * as path from 'path';
import { homedir } from 'os';
import { getMemoryStore } from '../../store/factory.js';
import type { MemoryStore } from '../../store/interface.js';
import { HybridRetriever } from '../../retriever.js';
import { Embedder } from '../../embeddings.js';
import { getConfig } from '../../config.js';
import { t } from '../../i18n/index.js';

// Language from env (set via HAWK_LANG=zh or HAWK_LANG=en)
// Full i18n Phase 2: migrate output strings to t() calls
const LANG = (process.env.HAWK_LANG as 'zh' | 'en') || 'zh';
import { getEmbedder } from '../../embeddings.js';
import { RELIABILITY_THRESHOLD_HIGH, DRIFT_THRESHOLD_DAYS } from '../../constants.js';

// Recall injection control
const INJECTION_LIMIT = 5;          // 最多注入 5 条记忆
const MAX_INJECTION_CHARS = 2000;   // 总 injection 不超过 2000 字符（压缩前）
const COMPOSITE_WEIGHT_RELIABILITY = 0.4;
const COMPOSITE_WEIGHT_SCORE = 0.6;

// Shared MemoryStore instance
let sharedDb: MemoryStore | null = null;
async function getSharedDb(): Promise<any> {
  if (!sharedDb) {
    sharedDb = await getMemoryStore();
  }
  return sharedDb;
}

// Shared embedder instance
let sharedEmbedder: Embedder | null = null;
async function getSharedEmbedder(): Promise<Embedder> {
  if (!sharedEmbedder) {
    const config = await getConfig();
    sharedEmbedder = new Embedder(config.embedding);
  }
  return sharedEmbedder;
}

// For restore handler — use shared embedder
async function getEmbedder(): Promise<Embedder> { return getSharedEmbedder(); }

// Global dirty flag
let bm25DirtyGlobal = false;
export function markBm25Dirty(): void { bm25DirtyGlobal = true; }

// Search history: last 20 queries with timestamps
const SEARCH_HISTORY_MAX = 20;
const searchHistory: Array<{ q: string; ts: number; resultCount: number }> = [];
export { searchHistory };

// Record a search query
export function recordSearch(query: string, resultCount: number): void {
  searchHistory.unshift({ q: query, ts: Date.now(), resultCount });
  if (searchHistory.length > SEARCH_HISTORY_MAX) searchHistory.pop();
}

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
const EXPORT_PATTERN    = /^hawk\s*导出(?:\s+(.+?))?$/i;   // hawk导出 / hawk导出 /path/to/file.json
const RESTORE_PATTERN   = /^hawk\s*恢复\s*(.+)$/i;   // hawk恢复 /path/to/backup.json
const DRIFT_PATTERN      = /^hawk\s*(?:drift|过期|陈旧)$/i;   // hawk过期 / hawk drift
const SEARCH_HISTORY_PATTERN = /^hawk\s*搜索历史$/i;   // hawk搜索历史
const CLEAR_PATTERN     = /^hawk\s*清空$/i;                 // hawk清空
const BATCHLOCK_PATTERN = /^hawk\s*锁定\s*all(?:\s+(.+))?$/i;  // hawk锁定all / hawk锁定all fact
const BATCHUNLOCK_PATTERN = /^hawk\s*解锁\s*all$/i;
const COMPARE_PATTERN   = /^hawk\s*对比\s*(\d+)\s+(\d+)$/i;  // hawk对比 3 4
const PURGE_PATTERN     = /^hawk\s*清理$/i;  // hawk清理 强制执行decay+purge
const ADD_PATTERN       = /^hawk\s*添加\s*(.+)$/i;  // hawk添加 <记忆内容>
const DELETE_IDX_PATTERN = /^hawk\s*删除\s*(\d+)$/i;  // hawk删除 3
const STATS_PATTERN     = /^hawk\s*统计$/i;  // hawk统计 显示记忆分布
const QUALITY_PATTERN   = /^hawk\s*质量$/i;  // hawk质量 记忆健康评分
const STATUS_PATTERN     = /^hawk\s*状态$/i;  // hawk状态 系统状态面板
const DENY_PATTERN      = /^hawk\s*否认\s*(\d+)$/i;  // hawk否认 3

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
  const now = Date.now();
  const DRIFT_MS = DRIFT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  for (const m of memories) {
    const lock  = m.locked ? ' 🔒' : '';
    const imp   = m.importanceOverride > 1.5 ? ' ⭐' : '';
    const corr  = m.correctionCount > 0 ? ` (纠正×${m.correctionCount})` : '';
    const score = `(${(m.score*100).toFixed(0)}%相关)`;
    const reason = m.matchReason ? `\n   → ${m.matchReason}` : '';
    // Memory drift indicator: reliable memory + not verified recently → 🕐
    const daysSince = m.lastVerifiedAt ? (now - m.lastVerifiedAt) / 86400000 : Infinity;
    const drift = (m.reliability >= 0.5 && daysSince > DRIFT_THRESHOLD_DAYS) ? ' 🕐' : '';
    lines.push(`${m.reliabilityLabel} ${score}${lock}${imp}${corr}${drift} [${m.category}] ${m.text}${reason}`);
  }
  return lines.join('\n');
}

// ─── Text Compression ─────────────────────────────────────────────────────

/**
 * 压缩过长的记忆文本
 * 策略：保留首句 + 关键词片段，总长不超过 limit
 */
function compressText(text: string, limit: number = 400): string {
  if (text.length <= limit) return text;
  // 保留第一句（到句号/换行/冒号）
  const first = text.slice(0, limit * 0.6);
  const breakIdx = Math.max(
    first.lastIndexOf('。'),
    first.lastIndexOf('\n'),
    first.lastIndexOf('：'),
    first.lastIndexOf('.')
  );
  const head = breakIdx > limit * 0.3 ? text.slice(0, breakIdx + 1) : first;
  // 提取关键词片段
  const kw = extractKeywords(text).slice(0, 5);
  return `${head.slice(0, limit - kw.join('、').length - 5)}... [关键词: ${kw.join('、')}]`;
}

/**
 * 计算记忆的综合排序分数
 * composite = score × WEIGHT_SCORE + reliability × WEIGHT_RELIABILITY
 */
function compositeScore(m: any): number {
  return m.score * COMPOSITE_WEIGHT_SCORE + m.reliability * COMPOSITE_WEIGHT_RELIABILITY;
}

// ─── Keyword Extractor ─────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  const stop = new Set(['的','了','是','在','和','也','有','就','不','我','你','他','她','它','们','这','那','个','与','或','被','为','上','下','来','去']);
  const words: string[] = [];
  for (let i = 0; i < text.length - 1; i++) { const w = text.slice(i,i+2); if (!stop.has(w)) words.push(w); }
  for (let i = 0; i < text.length - 2; i++) { const w = text.slice(i,i+3); if (!stop.has(w)) words.push(w); }
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

function computeMatchReason(query: string, memory: any): string {
  const qKw = extractKeywords(query);
  const mKw = extractKeywords(memory.text);
  const overlap = qKw.filter((k: string) => mKw.includes(k));
  if (overlap.length === 0) return '';
  return `命中: "${overlap.slice(0,3).join('", "')}"`;
}

// ─── Semantic Matcher ────────────────────────────────────────────────────────

async function findMemoryBySemanticMatch(db: any, newContent: string): Promise<{ id: string; score: number } | null> {
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
      lines.push(`→ hawk删除 N       删除记忆`);
      event.messages.push(`\n${lines.join('\n')}\n`);
      ctx._hawkListIndex = sorted.map((mem: any) => mem.id);  // for hawk删除 N
      return;
    }

    // ─── hawk重要 N [×倍数] ──────────────────────────────────────────────
    var m = trimmed.match(IMPORTANT_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10);
      const mult = parseFloat(m[2] || '2');
      const all = await getSortedMemories(db, getAgentId(ctx));
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
      const all = await getSortedMemories(db, getAgentId(ctx));
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
      const all = await getSortedMemories(db, getAgentId(ctx));
      if (idx < 1 || idx > all.length) { event.messages.push(`\n${injectEmoji} 无效编号 (1-${all.length})\n`); return; }
      await db.update(all[idx-1].id, { scope: scopeVal });
      event.messages.push(`\n${injectEmoji} 已设置作用域为 [${scopeVal}]\n`);
      return;
    }

    // ─── hawk编辑 [n] ─────────────────────────────────────────────────────
    var m = trimmed.match(EDIT_PATTERN);
    if (m) {
      const all = await getSortedMemories(db, getAgentId(ctx));
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
      const all = await getSortedMemories(db, getAgentId(ctx));
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

    // ─── hawk对比 N M ───────────────────────────────────────────────
    var m = trimmed.match(COMPARE_PATTERN);
    if (m) {
      const idxA = parseInt(m[1], 10) - 1;
      const idxB = parseInt(m[2], 10) - 1;
      const all = await getSortedMemories(db, getAgentId(ctx));
      if (idxA < 0 || idxA >= all.length || idxB < 0 || idxB >= all.length) {
        event.messages.push(`\n${injectEmoji} 无效编号 (1-${all.length})\n`); return;
      }
      const memA = all[idxA];
      const memB = all[idxB];
      const sim = textSimilarity(memA.text, memB.text);
      const kwA = extractKeywords(memA.text);
      const kwB = extractKeywords(memB.text);
      const overlap = kwA.filter((k: string) => kwB.includes(k));
      const lines = [
        `${injectEmoji} ** 记忆对比 [#${idxA+1} vs #${idxB+1}] **`,
        ``,
        `[#${idxA+1}] ${relLabel(memA.reliability)} ${fmtRel(memA)} [${memA.category}]`,
        `内容: ${memA.text.slice(0, 80)}`,
        `创建: ${formatTime(memA.createdAt)} | 验证: ${memA.verificationCount}次`,
        ``,
        `[#${idxB+1}] ${relLabel(memB.reliability)} ${fmtRel(memB)} [${memB.category}]`,
        `内容: ${memB.text.slice(0, 80)}`,
        `创建: ${formatTime(memB.createdAt)} | 验证: ${memB.verificationCount}次`,
        ``,
        `相似度: ${(sim * 100).toFixed(0)}%`,
        `共同关键词: ${overlap.length > 0 ? overlap.slice(0, 5).join(', ') : '无'}`,
        sim >= 0.6 ? `⚠️ 可能矛盾（相似但不同）` : sim < 0.3 ? `✅ 完全不同` : `⚡ 部分重叠`,
      ];
      event.messages.push(`\n${lines.join('\n')}\n`);
      return;
    }

    // ─── hawk导出 [filepath] ────────────────────────────────────────
    var m = trimmed.match(EXPORT_PATTERN);
    if (m) {
      const filepath = m[1]?.trim() || path.join(homedir(), '.hawk', `export-${Date.now()}.json`);
      const all = await db.getAllMemories();
      const exported = all.map(m => ({
        id: m.id, text: m.text, category: m.category,
        reliability: m.reliability, scope: m.scope,
        locked: m.locked, verificationCount: m.verificationCount,
        createdAt: formatTime(m.createdAt), updatedAt: formatTime(m.updatedAt),
        correctionHistory: m.correctionHistory,
      }));
      try {
        const { writeFileSync, mkdirSync, existsSync } = require('fs');
        const dir = path.dirname(filepath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filepath, JSON.stringify({ exported_at: new Date().toISOString(), count: exported.length, memories: exported }, null, 2));
        event.messages.push(`\n${injectEmoji} ✅ 已导出 ${exported.length} 条记忆到\n${filepath}\n`);
      } catch (err: any) {
        event.messages.push(`\n${injectEmoji} ❌ 导出失败: ${err.message}\n`);
      }
      return;
    }

    // ─── hawk过期 / hawk drift ─────────────────────────────────────
    if (DRIFT_PATTERN.test(trimmed)) {
      const all = await db.getAllMemories(getAgentId(ctx));
      if (!all.length) { event.messages.push(`\n${injectEmoji} 还没有任何记忆。\n`); return; }
      const now = Date.now();
      const DRIFT_MS = DRIFT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
      const stale = all.filter(m => m.deletedAt === null && m.reliability >= 0.5 &&
        (!m.lastVerifiedAt || (now - m.lastVerifiedAt) > DRIFT_MS));
      const lines = [`${injectEmoji} ** hawk 过期检测 ** (${DRIFT_THRESHOLD_DAYS}天未验证)`];
      if (!stale.length) {
        lines.push('✅ 所有记忆都是新鲜的');
      } else {
        stale.sort((a, b) => {
          const aDays = a.lastVerifiedAt ? (now - a.lastVerifiedAt) / 86400000 : Infinity;
          const bDays = b.lastVerifiedAt ? (now - b.lastVerifiedAt) / 86400000 : Infinity;
          return bDays - aDays;
        });
        for (const m of stale.slice(0, 20)) {
          const days = m.lastVerifiedAt ? ((now - m.lastVerifiedAt) / 86400000).toFixed(0) : '从未';
          lines.push(`🕐 [${days}天未验证] [${m.category}] ${m.text.slice(0, 80)}${m.text.length > 80 ? '...' : ''}`);
        }
        if (stale.length > 20) lines.push(`...还有 ${stale.length - 20} 条`);
        lines.push(`\n提示: 使用 hawk确认 N 对 来验证记忆，或 hawk否认 N 来标记不可靠`);
      }
      event.messages.push('\n' + lines.join('\n') + '\n');
      return;
    }

    // ─── hawk恢复 <filepath> ─────────────────────────────────────────
    var m = trimmed.match(RESTORE_PATTERN);
    if (m) {
      const filepath = m[1].trim();
      try {
        const { readFileSync, existsSync } = require('fs');
        if (!existsSync(filepath)) {
          event.messages.push(`\n${injectEmoji} ❌ 文件不存在: ${filepath}\n`);
          return;
        }
        const raw = JSON.parse(readFileSync(filepath, 'utf-8'));
        const memories = raw.memories || [];
        if (!memories.length) {
          event.messages.push(`\n${injectEmoji} 文件为空或格式错误: ${filepath}\n`);
          return;
        }
        const embedderInstance = await getEmbedder();
        let imported = 0, skipped = 0, failed = 0;
        const existingIds = new Set((await db.getAllMemories()).map((m: any) => m.id));
        for (const mem of memories) {
          if (existingIds.has(mem.id)) { skipped++; continue; }
          try {
            const [vector] = await embedderInstance.embed([mem.text]);
            await db.store({
              id: mem.id || ('hawk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)),
              text: mem.text,
              vector,
              category: mem.category || 'fact',
              scope: mem.scope || 'global',
              importance: mem.importance ?? 0.5,
              timestamp: mem.createdAt ? new Date(mem.createdAt).getTime() : Date.now(),
              expiresAt: 0,
              locked: mem.locked ?? false,
              metadata: { source: 'hawk-restore', original_id: mem.id },
            });
            imported++;
          } catch { failed++; }
        }
        event.messages.push(`\n${injectEmoji} ✅ 恢复完成：导入 ${imported}，跳过（已存在）${skipped}，失败 ${failed}\n`);
      } catch (err: any) {
        event.messages.push(`\n${injectEmoji} ❌ 恢复失败: ${err.message}\n`);
      }
      return;
    }

    // ─── hawk搜索历史 ─────────────────────────────────────────────
    if (SEARCH_HISTORY_PATTERN.test(trimmed)) {
      if (!searchHistory.length) {
        event.messages.push(`\n${injectEmoji} 暂无搜索历史。\n`);
        return;
      }
      const lines = [`\n${injectEmoji} ** 最近搜索历史 **\n`];
      for (let i = 0; i < searchHistory.length; i++) {
        const h = searchHistory[i];
        const time = new Date(h.ts).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        lines.push(`  ${i + 1}. [${time}] "${h.q}" → ${h.resultCount} 条`);
      }
      event.messages.push(lines.join('\n') + '\n');
      return;
    }

    // ─── hawk清空 ──────────────────────────────────────────────────
    if (CLEAR_PATTERN.test(trimmed)) {
      const all = await db.getAllMemories();
      const unlocked = all.filter(m => !m.locked);
      if (!unlocked.length) { event.messages.push(`\n${injectEmoji} 没有可清空的记忆（全部已锁定）\n`); return; }
      let cleared = 0;
      for (const m of unlocked) { if (await db.forget(m.id)) cleared++; }
      event.messages.push(`\n${injectEmoji} ✅ 已清空 ${cleared} 条未锁定记忆。\n`);
      return;
    }

    // ─── hawk锁定all [category] ────────────────────────────────────
    var m = trimmed.match(BATCHLOCK_PATTERN);
    if (m) {
      const cat = m[1]?.trim();
      const all = await db.getAllMemories();
      const targets = cat ? all.filter(x => x.category === cat && !x.locked) : all.filter(x => !x.locked);
      if (!targets.length) { event.messages.push(`\n${injectEmoji} 没有找到${cat ? `[${cat}]` : ''}未锁定的记忆。\n`); return; }
      let locked = 0;
      for (const t of targets) { if (await db.lock(t.id)) locked++; }
      event.messages.push(`\n${injectEmoji} 🔒 已锁定 ${locked} 条${cat ? `[${cat}]` : ''}记忆。\n`);
      return;
    }

    // ─── hawk解锁all ────────────────────────────────────────────────
    if (BATCHUNLOCK_PATTERN.test(trimmed)) {
      const all = await db.getAllMemories();
      const locked = all.filter(x => x.locked);
      if (!locked.length) { event.messages.push(`\n${injectEmoji} 没有已锁定的记忆。\n`); return; }
      let unlocked = 0;
      for (const t of locked) { if (await db.unlock(t.id)) unlocked++; }
      event.messages.push(`\n${injectEmoji} 🔓 已解锁 ${unlocked} 条记忆。\n`);
      return;
    }

    // ─── hawk清理 ──────────────────────────────────────────────────
    if (PURGE_PATTERN.test(trimmed)) {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const distDecay = path.join(process.cwd(), 'dist/cli/decay.js');
      try {
        const { stdout } = await execAsync(`node "${distDecay}"`, { timeout: 30000 });
        event.messages.push(`\n${injectEmoji} ${stdout.trim()}\n`);
      } catch (err: any) {
        event.messages.push(`\n${injectEmoji} ❌ 清理失败: ${err.message}\n`);
      }
      return;
    }

    // ─── hawk统计 ───────────────────────────────────────────────────
    if (STATS_PATTERN.test(trimmed)) {
      const all = await db.getAllMemories(getAgentId(ctx));
      if (!all.length) { event.messages.push(`\n${injectEmoji} 暂无记忆。\n`); return; }

      const total = all.length;
      const locked = all.filter(m => m.locked).length;
      const byCat: Record<string, number> = {};
      const byScope: Record<string, number> = {};
      const byRel: Record<string, number> = {};
      const now = Date.now();

      for (const m of all) {
        byCat[m.category] = (byCat[m.category] || 0) + 1;
        byScope[m.scope] = (byScope[m.scope] || 0) + 1;
        const relBand = m.reliability >= 0.8 ? 'high' : m.reliability >= 0.5 ? 'mid' : 'low';
        byRel[relBand] = (byRel[relBand] || 0) + 1;
      }

      const avgImp = (all.reduce((s, m) => s + m.importance, 0) / total).toFixed(2);
      const expired = all.filter(m => m.expiresAt > 0 && m.expiresAt < now).length;

      const lines = [
        `\n${injectEmoji} ** hawk 记忆统计 **\n`,
        `总记忆: ${total} | 锁定: ${locked} | 已过期: ${expired}`,
        `平均重要性: ${avgImp}`,
        ``,
        `**按类别**:`,
        ...Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
        ``,
        `**按作用域**:`,
        ...Object.entries(byScope).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
        ``,
        `**按可靠性**: high≥80%:${byRel.high||0} | mid50-80%:${byRel.mid||0} | low<50%:${byRel.low||0}`,
      ];
      event.messages.push(lines.join('\n') + '\n');
      return;
    }

    // ─── hawk质量 ───────────────────────────────────────────────────
    if (QUALITY_PATTERN.test(trimmed)) {
      const all = await db.getAllMemories(getAgentId(ctx));
      if (!all.length) { event.messages.push(`\n${injectEmoji} 暂无记忆。\n`); return; }

      const total = all.length;
      const now = Date.now();

      // Compute health score components
      const avgRel = all.reduce((s, m) => s + m.reliability, 0) / total;
      const avgImp = all.reduce((s, m) => s + m.importance, 0) / total;
      const lockedRatio = all.filter(m => m.locked).length / total;
      const expiredCount = all.filter(m => m.expiresAt > 0 && m.expiresAt < now).length;
      const recentCount = all.filter(m => now - m.timestamp < 7 * 86400000).length;

      // Composite health score (0-100)
      const relScore = avgRel * 40;          // reliability weight 40
      const impScore = avgImp * 25;          // importance weight 25
      const lockScore = lockedRatio * 15;   // lock ratio weight 15
      const recencyScore = Math.min(recentCount / Math.max(total * 0.3, 1), 1) * 20;  // recency weight 20
      const healthScore = Math.round(relScore + impScore + lockScore + recencyScore);

      const grade = healthScore >= 80 ? '🟢 优秀' : healthScore >= 60 ? '🟡 良好' : healthScore >= 40 ? '🟠 一般' : '🔴 需优化';

      event.messages.push(
        `\n${injectEmoji} ** hawk 记忆健康评分 **\n` +
        `健康度: ${grade} (${healthScore}/100)\n` +
        `平均可靠性: ${(avgRel * 100).toFixed(1)}% | 平均重要性: ${(avgImp * 100).toFixed(1)}%\n` +
        `总记忆: ${total} | 锁定: ${lockedRatio > 0 ? (lockedRatio * 100).toFixed(1) + '%' : '0'} | 已过期: ${expiredCount}\n` +
        `近7天新增: ${recentCount} 条\n\n` +
        `评分说明: 可靠性40% + 重要性25% + 锁定率15% + 活跃度20%\n`
      );
      return;
    }

    // ─── hawk状态 ───────────────────────────────────────────────────
    if (STATUS_PATTERN.test(trimmed)) {
      const all = await db.getAllMemories(getAgentId(ctx));
      const now = Date.now();
      const total = all.length;
      const expired = all.filter(m => m.expiresAt > 0 && m.expiresAt < now).length;
      const locked = all.filter(m => m.locked).length;

      // Embedder cache stats
      const embedderInstance = await getSharedEmbedder();
      const cacheSize = (embedderInstance as any).cache?.size ?? 0;

      // BM25 corpus size (via retriever if available)
      let bm25Size = 0;
      try {
        const retriever = await getRetriever();
        bm25Size = (retriever as any).corpus?.length ?? 0;
      } catch { /* non-critical */ }

      // DB size
      let dbSizeMB = 0;
      try {
        const stats = await (db as any).getDBStats?.();
        if (stats) dbSizeMB = stats.sizeMB;
      } catch { /* non-critical */ }

      // Last decay time (from last successful decay run)
      const lastDecay = (global as any).__hawk_last_decay__;
      const decayAgo = lastDecay ? Math.round((now - lastDecay) / 60000) + ' 分钟前' : '从未';

      event.messages.push(
        `\n${injectEmoji} ** hawk 系统状态 **\n` +
        `记忆总数: ${total} | 已过期: ${expired} | 锁定: ${locked}\n` +
        `数据库: ${dbSizeMB > 0 ? dbSizeMB.toFixed(2) + ' MB' : '(计算中...)'}\n` +
        `BM25索引: ${bm25Size} 条\n` +
        `Embed缓存: ${cacheSize} 条\n` +
        `最后Decay: ${decayAgo}\n` +
        `搜索历史: ${searchHistory.length} 条\n`
      );
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

    // ─── hawk否认 N ─────────────────────────────────────────────────
    var m = trimmed.match(DENY_PATTERN);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      const targetIds: string[] = ctx._hawkCheckIndex || [];
      if (idx < 0 || idx >= targetIds.length) { event.messages.push(`\n${injectEmoji} 无效编号\n`); return; }
      const id = targetIds[idx];
      await db.flagUnhelpful(id, 0.05);
      event.messages.push(`\n${injectEmoji} 已标记该记忆为不可靠（reliability -5%）\n`);
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

    // ─── hawk添加 <text> ───────────────────────────────────────────────
    {
      const m = trimmed.match(ADD_PATTERN);
      if (m) {
        const text = m[1].trim();
        if (text.length < 5) {
          event.messages.push(`\n${injectEmoji} 内容太短，至少5个字。\n`);
          return;
        }
        const embedderInstance = await getSharedEmbedder();
        try {
          const [vector] = await embedderInstance.embed([text]);
          await db.store({
            id: 'hawk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
            text,
            vector,
            category: 'fact',
            scope: 'personal',
            importance: 0.8,
            timestamp: Date.now(),
            expiresAt: 0,
            locked: false,
            metadata: { source: 'hawk-添加' },
          });
          event.messages.push(`\n${injectEmoji} ✅ 已添加记忆：${text.slice(0, 60)}${text.length > 60 ? '...' : ''}\n`);
        } catch (err: any) {
          event.messages.push(`\n${injectEmoji} ❌ 添加失败: ${err.message}\n`);
        }
        return;
      }
    }

    // ─── hawk删除 N ───────────────────────────────────────────────────
    {
      const m = trimmed.match(DELETE_IDX_PATTERN);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        // Get the currently displayed list from context
        const targetIds: string[] = ctx._hawkListIndex || [];
        const id = targetIds[idx];
        if (!id) {
          // Fallback: find from sorted list
          const all = await db.getAllMemories(getAgentId(ctx));
          const sorted = [...all].sort((a, b) => {
            if (a.locked !== b.locked) return a.locked ? -1 : 1;
            return b.reliability - a.reliability;
          });
          if (idx < 0 || idx >= sorted.length) {
            event.messages.push(`\n${injectEmoji} 无效编号。\n`);
            return;
          }
          const mem = sorted[idx];
          const ok = await db.forget(mem.id);
          event.messages.push(`\n${injectEmoji} ${ok ? '✅ 已删除：' + mem.text.slice(0, 50) + '...' : '❌ 已锁定，无法删除。'}\n`);
          return;
        }
        const ok = await db.forget(id);
        event.messages.push(`\n${injectEmoji} ${ok ? '✅ 已删除。' : '❌ 已锁定，无法删除。'}\n`);
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
    recordSearch(trimmed, useable.length);  // track search history
    if (!useable.length) {
      // Did-you-mean: search for similar terms in memory texts
      const all = await db.getAllMemories(getAgentId(ctx));
      if (all.length > 0) {
        const queryWords = trimmed.toLowerCase().split(/\s+/);
        const suggestions = all
          .map(m => {
            const textWords = m.text.toLowerCase().split(/\s+/);
            const overlap = queryWords.filter(w => textWords.some(tw => tw.includes(w) || w.includes(tw))).length;
            return { id: m.id, text: m.text, overlap };
          })
          .filter(s => s.overlap > 0)
          .sort((a, b) => b.overlap - a.overlap)
          .slice(0, 3);
        if (suggestions.length > 0) {
          const tips = suggestions.map(s => `  · "${s.text.slice(0, 50)}"`).join('\n');
          event.messages.push(`\n${injectEmoji} 没找到直接匹配的。是不是指：\n${tips}\n`);
        }
      }
      return;
    }

    // Sort by composite score (reliability × 0.4 + score × 0.6)
    const sorted = [...useable].sort((a, b) => compositeScore(b) - compositeScore(a));

    // Take top N and track char budget
    const result: any[] = [];
    let totalChars = 0;
    for (const m of sorted) {
      if (result.length >= INJECTION_LIMIT) break;
      const compressed = compressText(m.text);
      if (totalChars + compressed.length > MAX_INJECTION_CHARS) continue;
      result.push(m);
      totalChars += compressed.length;
    }

    if (!result.length) return;

    // Compute match reasons
    const withReasons = result.map(m => ({
      ...m,
      matchReason: computeMatchReason(trimmed, m),
      text: sanitize(compressText(m.text)),
    }));

    event.messages.push(`\n${formatRecallResults(withReasons, injectEmoji)}\n`);

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

// Helper - gets agent ID from event context if available
function getAgentId(ctx: any): string | null {
  return ctx?.agentId ?? null;
}

// Get memories for current agent (personal + team memories)
async function getSortedMemories(db: any, agentId?: string | null) {
  const all = await db.getAllMemories(agentId);
  return [...all].sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    return b.reliability - a.reliability;
  });
}

export default recallHandler;

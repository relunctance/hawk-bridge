// hawk-capture hook
//
// ⚠️ OpenClaw Hook Event Format IMPORTANT:
// Events MUST use UNDERSCORE format in openclaw.plugin.json (not colon):
//   ✅ message_received  ✅ message_sent  ✅ agent_bootstrap
//   ❌ message:received  ❌ message:sent  ❌ agent:bootstrap
//
// Gateway uses hookRunner.hasHooks("message_received") to check (underscore),
// NOT createInternalHookEvent which uses colon format internally.
//
// Triggered on: message:sent, message_received, message:preprocessed, session:compact:after
// Action: After agent responds OR user message received, extract meaningful content → store in LanceDB

import { spawn, exec as execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';
import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { getMemoryStore } from '../../store/factory.js';
import type { MemoryStore } from '../../store/interface.js';
import { Embedder } from '../../embeddings.js';
import { getConfig } from '../../config.js';
import type { RetrievedMemory } from '../../types.js';
import {
  MAX_CHUNK_SIZE, MIN_CHUNK_SIZE, MAX_TEXT_LEN,
  DEDUP_SIMILARITY, MEMORY_TTL_MS,
} from '../../constants.js';
// Shared: invalidate BM25 index when new memories are stored
import { markBm25Dirty } from '../hawk-recall/handler.js';
import { logger } from '../../logger.js';
import { memoryErrors } from '../../metrics.js';

// Platform identity — set via HAWK_PLATFORM env var (openclaw | hermes | ...)
const HAWK_PLATFORM = process.env.HAWK_PLATFORM || 'openclaw';

const exec = promisify(execSync);

// ─── Concurrency limiter ───────────────────────────────────────────────────────
// Prevents spawning too many Python subprocesses simultaneously under high load.
// Uses a simple semaphore: acquire before spawn, release on completion.
const MAX_CONCURRENT_SUBPROCESSES = parseInt(
  process.env.HAWK_MAX_CONCURRENT_SUBPROCESSES ?? '5', 10
);
let activeSubprocesses = 0;
const subprocessWaitQueue: Array<() => void> = [];

function acquireSubprocessSlot(): Promise<void> {
  if (activeSubprocesses < MAX_CONCURRENT_SUBPROCESSES) {
    activeSubprocesses++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => {
    subprocessWaitQueue.push(resolve);
  });
}

function releaseSubprocessSlot(): void {
  const next = subprocessWaitQueue.shift();
  if (next) {
    next();
  } else {
    activeSubprocesses--;
  }
}

let db: MemoryStore | null = null;
let embedder: Embedder | null = null;

async function getDB(): Promise<any> {
  if (!db) {
    db = await getMemoryStore();
  }
  return db;
}

async function getEmbedder(): Promise<Embedder> {
  if (!embedder) {
    const config = await getConfig();
    embedder = new Embedder(config.embedding);
  }
  return embedder;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

const AUDIT_LOG_PATH = path.join(os.homedir(), '.hawk', 'audit.log');

// Retry utility: attempts fn up to maxAttempts times
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 1000): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        logger.warn({ attempt, maxAttempts, delayMs: delayMs * attempt, err: err.message }, 'Capture attempt failed, retrying');
        await new Promise(res => setTimeout(res, delayMs * attempt));
      } else {
        logger.error({ err: err.message }, 'All capture attempts failed');
      }
    }
  }
  throw lastErr;
}

function audit(action: 'capture' | 'skip' | 'reject', reason: string, text: string): void {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    action,
    reason,
    text: text.slice(0, 200),  // truncate for log safety
  }) + '\n';
  try {
    // Ensure directory exists first
    const dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(AUDIT_LOG_PATH, entry);
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to write audit log');
  }
}

// ─── Text Normalizer ──────────────────────────────────────────────────────────

/**
 * Full text normalization pipeline — applied after sanitization, before dedup.
 * Consolidates all structural cleaning: invisible chars, whitespace, punctuation,
 * markdown artifacts, URLs, repeated sentences, timestamps, etc.
 *
 * Refactored into discrete named steps (pipe pattern) for maintainability.
 */

// ─── Individual pipeline steps ─────────────────────────────────────────────────

function _stripInvisible(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
}

function _normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function _stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}

function _stripMarkdownImages(text: string): string {
  return text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[图片]');
}

function _stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function _stripMarkdownMarkers(text: string): string {
  return text
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\w*]*\n([\s\S]*?)```/g, (_, code) => code.trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '');
}

function _stripLogStatements(text: string): string {
  return text
    .replace(/\bconsole\s*\.\s*(log|debug|info|warn|error)\s*\([^)]*\)/gi, '[日志]')
    .replace(/\bprint\s*\([^)]*\)/g, '[日志]')
    .replace(/\bprint\b(?!\s*=)/g, '[日志]')
    .replace(/\blogger\s*\.\s*(debug|info|warn|error)\s*\([^)]*\)/gi, '[日志]');
}

function _collapseStackTraces(text: string): string {
  return text.replace(
    /(^	at\s+[^\n]+\n)((\tat\s+[^\n]+\n)*)(\tat\s+[^\n]+$)/gm,
    (_, head, middle, tail) => head + (middle ? '\n  ...\n' : '') + tail
  );
}

function _mergeBrokenUrls(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s\n,，]+)[\n-]([^\s,，]+)/g, '$1$2')
    .replace(/(https?:\/\/[^\s　'\"<>】】]+)\/([^\s　'\"<>】】]{0,60}[^\s　'\"<>】】]*)/g,
      (_, domain, path) => domain + '/' + (path.length > 60 ? path.slice(0, 60) + '...' : path));
}

function _stripEmoji(text: string): string {
  return text.replace(
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{1FA00}-\u{1FAFF}]|[\u{1F900}-\u{1F9FF}]/gu,
    ''
  );
}

function _normalizePunctuation(text: string): string {
  return text
    .replace(/。/g, '.').replace(/，/g, ',').replace(/；/g, ';')
    .replace(/：/g, ':').replace(/？/g, '?').replace(/！/g, '!')
    .replace(/"/g, '"').replace(/"/g, '"').replace(/'/g, "'").replace(/'/g, "'")
    .replace(/（/g, '(').replace(/）/g, ')').replace(/【/g, '[').replace(/】/g, ']')
    .replace(/《/g, '<').replace(/》/g, '>').replace(/、/g, ',').replace(/…/g, '...').replace(/～/g, '~');
}

function _normalizeTimestamps(text: string): string {
  return text.replace(
    /\b(?:\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?\s*(?:[时分]?\s*\d{1,2}[：:]\d{1,2}(?:[：:]\d{1,2})?\s*(?:AM|PM|am|pm)?)?|\d{1,2}[-/月]\d{1,2}[日]?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)\b/g,
    '[时间]'
  );
}

function _compactWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(line => line.trim()).join('\n')
    .trim();
}

function _abbreviateNumbers(text: string): string {
  return text.replace(/\b(\d{1,3}(?:,\d{3}){2,})(?:\b|[^\d])/g, (match) => {
    const num = parseInt(match.replace(/,/g, ''), 10);
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return match;
  });
}

function _stripBase64(text: string): string {
  return text.replace(/\b[A-Za-z0-9+/]{100,}={0,2}\b/g, '[BASE64数据]');
}

function _compactJson(text: string): string {
  return text.replace(/(\{\"[^\"]+\":\s*\"[^\"]+\"\})/g, (json) => {
    try { return JSON.stringify(JSON.parse(json)); } catch { return json; }
  });
}

function _dedupeSentences(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  return sentences.filter(s => {
    const normalized = s.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).join(' ');
}

function _dedupeParagraphs(text: string): string {
  const paras = text.split(/\n\n+/);
  const seen = new Set<string>();
  return paras.filter(p => {
    const normalized = p.trim().toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).join('\n\n');
}

function _minimizeMixedSpaces(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff])([A-Za-z])/g, '$1$2')
    .replace(/([A-Za-z])([\u4e00-\u9fff])/g, '$1$2');
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return _minimizeMixedSpaces(
    _dedupeParagraphs(
      _dedupeSentences(
        _compactJson(
          _stripBase64(
            _abbreviateNumbers(
              _compactWhitespace(
                _normalizeTimestamps(
                  _normalizePunctuation(
                    _stripEmoji(
                      _mergeBrokenUrls(
                        _collapseStackTraces(
                          _stripLogStatements(
                            _stripMarkdownMarkers(
                              _stripMarkdownLinks(
                                _stripMarkdownImages(
                                  _stripHtmlTags(
                                    _normalizeLineEndings(
                                      _stripInvisible(text)
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  );
}

// ─── Content Validation ───────────────────────────────────────────────────────

function isValidChunk(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHUNK_SIZE) return false;
  if (trimmed.length > MAX_TEXT_LEN) return false;
  // Reject pure numbers or pure symbols
  if (/^[\d\s.+-]+$/.test(trimmed)) return false;
  if (/^[^\w\u4e00-\u9fff]+$/.test(trimmed)) return false;  // no letters, no CJK
  return true;
}

// ─── What NOT to Save (from Claude memory guidelines) ──────────────────────────
// Content that should NOT be stored as memory because it can be derived from code/state
const SKIP_PATTERNS: Array<[RegExp, string]> = [
  // Code patterns / file paths (derivable from reading code)
  [/\b(function|class|const|let|var|import|export|interface|type)\s+\w+/g, 'code_pattern'],
  [/\b(file|path|directory|folder)\s+[:=]\s*['"`][\w./-]+['"`]/g, 'file_path'],
  [/`[^`]*\.(ts|js|py|go|rs|java|cpp|c|h|md|json|yaml|yml)`/g, 'code_reference'],
  // Git history / who-changed-what (use git log/blame instead)
  [/\b(git|commit|branch|merge|PR|pull.request|checkout|rebase)\b/gi, 'git_history'],
  // Debug solutions / fix recipes (the fix is in the code, commit has context)
  [/\b(fix|bug|issue|error|exception|crash|patch)\s+(was|is|to|:)/gi, 'debug_solution'],
  // Ephemeral task details
  [/^(TODO|FIXME|HACK|XXX|NOTE|BUG|NB):/gm, 'dev_note'],
  // Already in CLAUDE.md files
  [/\bCLAUDE\.(md|local\.md|rules)/gi, 'already_documented'],
];

function shouldSkipChunk(text: string): { skip: boolean; reason: string } {
  for (const [pattern, label] of SKIP_PATTERNS) {
    if (pattern.test(text)) {
      return { skip: true, reason: label };
    }
  }
  return { skip: false, reason: '' };
}

// ─── Truncation ───────────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number = MAX_CHUNK_SIZE): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '');  // break at word boundary
}

// ─── Harmful Content Filter ───────────────────────────────────────────────────

const HARMFUL_PATTERNS = [
  /kill|murder|suicide|attack/i,
  /bomb|explosive|terror/i,
  /child(?:porn|sexual)|CSAM/i,
  /fraud|scam|phishing/i,
  /hack|crack(?:ing)?\s+(?:password|account)/i,
];

function isHarmful(text: string): boolean {
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// ─── Sensitive Information Sanitizer ─────────────────────────────────────────

const SANITIZE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key)\s*[:=]\s*["']?([\w-]{8,})["']?/gi, '$1: [REDACTED]'],
  [/(Bearer\s+)[\w.-]{10,}/gi, '$1[REDACTED]'],
  [/(AKIA[0-9A-Z]{16})/g, '[AWS_KEY_REDACTED]'],
  [/(ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,})/g, '[GITHUB_TOKEN_REDACTED]'],
  [/\b[a-zA-Z0-9]{32,}\b/g, '[KEY_REDACTED]'],
  [/\b1[3-9]\d{9}\b/g, '[PHONE_REDACTED]'],
  [/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, '[EMAIL_REDACTED]'],
  [/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, '[ID_REDACTED]'],
  [/\b(?:\d{4}[- ]?){3}\d{4}\b/g, '[CARD_REDACTED]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]'],
  [/\/\/[^:@\/]+:[^@\/]+@/g, '//[CREDS_REDACTED]@'],
];

function sanitize(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SANITIZE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── Deduplication ─────────────────────────────────────────────────────────────

/** Simple char-based similarity for deduplication (no external deps needed). */
function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  // Quick length check
  if (Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 0.3) return 0;

  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const intersection = [...setA].filter(c => setB.has(c)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

async function isDuplicate(text: string, threshold: number = DEDUP_SIMILARITY): Promise<boolean> {
  try {
    const db = await getDB();
    // 使用 search 做相似度检查，覆盖所有记忆，去重阈值 0.85
    // minScore=0.85 保证只跳过真正高度相似的记忆，不误伤
    const results = await db.search(text, 5, 0.85);
    for (const m of results) {
      // search 返回的 score 来自向量相似度（HTTP 走 /recall，LanceDB 走 FTS）
      // score 范围 0-1，threshold 0.85
      if (m.score >= threshold) return true;
    }
  } catch {
    // Non-critical
  }
  return false;
}

/**
 * Saturation check: if ≥3 highly-similar memories exist in recent 50,
 * skip storing a new one — just bump accessTime of existing ones.
 * Returns true if saturated (store skipped), false otherwise.
 */
async function handleSaturation(text: string, threshold: number = 0.70): Promise<boolean> {
  try {
    const dbInstance = await getDB();
    const recent = await dbInstance.listRecent(50);
    const similar = recent.filter(m => textSimilarity(text, m.text) >= threshold);
    if (similar.length >= 3) {
      // Bump accessTime of all similar existing memories
      for (const m of similar) {
        await dbInstance.incrementAccess(m.id);
      }
      return true;  // saturated, skip store
    }
  } catch {
    // Non-critical
  }
  return false;  // not saturated, proceed
}

// ─── Main Capture Handler ──────────────────────────────────────────────────────

const captureHandler = async (event: HookEvent) => {
  logger.debug({ type: event.type, action: event.action, sessionKey: event.sessionKey }, 'hawk-capture: event received');

  // Handle both message:sent (agent outbound) and message:received (user inbound)
  if (event.type !== 'message') return;
  if (!['sent', 'received'].includes(event.action)) return;
  // Only require success for outbound 'sent'; 'received' has no success field
  if (event.action === 'sent' && !event.context?.success) return;

  try {
    const config = await getConfig();
    if (!config.capture.enabled) return;

    const { maxChunks, importanceThreshold, ttlMs } = config.capture;

    const sourceType = event.action === 'received' ? 'hawk-capture:received' : 'hawk-capture:sent';

    const content = event.context?.content;
    if (typeof content !== 'string') return;

    // Pre-filter: skip obviously low-value content
    const trimmedContent = content.trim();
    // Pure numbers / timestamps / single-word responses
    if (/^[\d\s.,]+$/.test(trimmedContent)) return;
    // Single emoji or reaction
    if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]{1,3}$/u.test(trimmedContent)) return;

    // ─── LLM 生成内容检测（用于 hawk-capture:sent，即 agent 回复）───────────────
    // 通过启发式规则识别 LLM 生成的推理内容，降低其初始可信度
    // 注意：避免误伤用户正常内容，规则需要同时满足多个特征才判定为 LLM 生成
    const isLlmmaybe = (() => {
      // 统计特征
      const boldCount = (content.match(/\*\*[^*]+\*\*/g) || []).length;
      const orderedListCount = (content.match(/^\d+\.\s+\S+/gm) || []).length;
      const hasModelRef = /\[[Mm]odel:\s*[\w\-\.]+\]/.test(content);
      const hasProviderRef = /\[[Pp]rovide r:\s*\w+\]/.test(content);
      const hasSummaryPhrase = /\b(Therefore|In conclusion|Summary:|综上所述|总而言之|简单来说)\b/i.test(content);
      const hasContextualRef = /\bAs (discussed|mentioned|noted) (above|earlier|in this)\b/i.test(content);
      const hasGenericReasoning = /\b(it is worth noting|it is important to note|please note|note that)\b/gi.test(content);
      const hasSelfConfirm = /\b(does this (help|answer|make sense|sound right))\b/i.test(content);
      const hasOfferHelp = /\b(feel free to|please let me know if you)\b/i.test(content);

      // 必要条件：必须有明确的 LLM 文风标记（排除用户正常写作）
      // 单一特征不足触发，必须满足 ≥2 个特征
      const featureCount = [
        hasModelRef,
        hasProviderRef,
        hasSummaryPhrase,
        hasContextualRef,
        hasSelfConfirm,
        hasOfferHelp,
      ].filter(Boolean).length;

      // markdown 格式化需同时满足：≥3个bold 或 ≥4个有序列表（且 featureCount ≥ 1）
      const hasHeavyMarkdown = boldCount >= 3 || orderedListCount >= 4;

      // 通用推理口吻需要 featureCount ≥ 1 才计入
      const hasGeneric = hasGenericReasoning && featureCount >= 1;

      return featureCount >= 2 || hasHeavyMarkdown || hasModelRef || hasProviderRef;
    })();

    // ─── Pre-extraction: Code blocks ─────────────────────────────────────
    // Extract fenced code blocks as high-importance fact memories
    const CODE_BLOCK_RE = /```(?:\w+)?\n([\s\S]{20,500}?)```/g;
    const codeBlockMemories: any[] = [];
    let codeMatch;
    while ((codeMatch = CODE_BLOCK_RE.exec(content)) !== null) {
      const code = codeMatch[1].trim();
      if (code.length < 20) continue;
      // Detect language hint from the fence
      const fenceWithLang = content.slice(Math.max(0, codeMatch.index - 10), codeMatch.index);
      const langMatch = fenceWithLang.match(/```(\w+)/);
      const lang = langMatch ? langMatch[1] : 'code';
      codeBlockMemories.push({
        text: `[${lang.toUpperCase()}] ${code.slice(0, 200)}${code.length > 200 ? '...' : ''}`,
        category: 'fact',
        importance: 0.8,
        abstract: `代码片段 (${lang})，${code.split('\n').length} 行`,
        overview: `用户分享的 ${lang} 代码：${code.slice(0, 100)}`,
      });
    }

    // ─── Pre-extraction: URLs ─────────────────────────────────────────────
    // Extract URLs with surrounding context as fact memories
    const URL_RE = /(?:https?:\/\/[^\s\n，,。!?）\]]+)/g;
    const urlMemories: any[] = [];
    let urlMatch;
    const seenUrls = new Set<string>();
    while ((urlMatch = URL_RE.exec(content)) !== null) {
      const url = urlMatch[0];
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      // Get surrounding context (50 chars before URL)
      const ctxStart = Math.max(0, urlMatch.index - 80);
      const ctx = content.slice(ctxStart, urlMatch.index).replace(/\n/g, ' ').trim();
      urlMemories.push({
        text: `分享链接: ${url}`,
        category: 'fact',
        importance: 0.7,
        abstract: `链接分享: ${url}`,
        overview: ctx || `分享的链接: ${url}`,
      });
    }

    // ─── Multi-turn grouping: merge consecutive user messages ─────────────
    // Group consecutive user messages into a single context block for extraction
    let enrichedContent = content;
    const USER_MSG_RE = /^user:\s*(.+)/gim;
    const userMessages: Array<{ text: string; idx: number }> = [];
    let um;
    while ((um = USER_MSG_RE.exec(content)) !== null) {
      userMessages.push({ text: um[1], idx: um.index });
    }
    if (userMessages.length >= 2) {
      // Merge consecutive user messages (within 200 chars of each other)
      const merged: Array<{ text: string; start: number; end: number }> = [];
      for (const msg of userMessages) {
        const prev = merged[merged.length - 1];
        if (prev && msg.idx - (prev.end) < 200) {
          prev.text += '\n' + msg.text;
          prev.end = msg.idx + msg.text.length + 5; // "user: " prefix
        } else {
          merged.push({ text: msg.text, start: msg.idx, end: msg.idx + msg.text.length + 5 });
        }
      }
      // Replace original content with merged content for better extraction
      enrichedContent = merged.map(m => `user: ${m.text}`).join('\n\n');
    }

    const memories = await withRetry(() => callExtractor(enrichedContent, config), 3, 2000);
    if (!memories || !memories.length) return;

    // Merge pre-extracted memories (code blocks + URLs) with LLM-extracted memories
    const allMemories = [
      ...codeBlockMemories,
      ...urlMemories,
      ...memories,
    ];

    const significant = allMemories.filter(
      (m: any) => m.importance >= importanceThreshold
    ).slice(0, maxChunks);

    if (!significant.length) return;

    const [dbInstance, embedderInstance] = await Promise.all([
      getDB(),
      getEmbedder(),
    ]);

    // ─── 统一预处理：normalize + validate + sanitize + truncate ─────────────────
    // 提前处理，避免 LLM 提取后的文本进入逐条处理循环时重复处理
    type PreppedMemory = {
      m: any;
      text: string;
      isEntity: boolean;
      isPreExtracted: boolean; // code block / URL（不需要重复 embedding）
    };

    const prepped: PreppedMemory[] = [];
    for (const m of significant) {
      let text = normalizeText(m.text.trim());

      const { skip, reason } = shouldSkipChunk(text);
      if (skip) { audit('skip', reason, text); continue; }

      if (!isValidChunk(text)) { audit('skip', 'invalid_chunk', text); continue; }

      if (isHarmful(text)) { audit('reject', 'harmful_content', text); continue; }

      text = sanitize(text);
      text = truncate(text);

      // pre-extracted code blocks and URLs bypass deduplication (already deduplicated above)
      const isPreExtracted = codeBlockMemories.includes(m) || urlMemories.includes(m);

      prepped.push({
        m,
        text,
        isEntity: m.category === 'entity',
        isPreExtracted,
      });
    }

    // ─── 预过滤项（code blocks / URLs）直接 embed 并存储 ─────────────────────────
    const preExtracted = prepped.filter(p => p.isPreExtracted);
    const llmItems = prepped.filter(p => !p.isPreExtracted);

    // Compute TTL once for all items
    const effectiveTtl = ttlMs || MEMORY_TTL_MS;
    const expiresAt = effectiveTtl > 0 ? Date.now() + effectiveTtl : 0;

    const sessionId = event.context?.sessionEntry?.sessionId ?? undefined;

    // 预过滤项：逐条 embed + store
    for (const p of preExtracted) {
      const id = generateId();
      try {
        const [vector] = await withRetry(() => embedderInstance.embed([p.text]), 3, 1000);
        await dbInstance.store({
          id,
          text: p.text,
          vector,
          category: p.m.category,
          scope: 'global',
          importance: p.m.importance,
          timestamp: Date.now(),
          expiresAt,
          metadata: {
            capture_trigger: 'pre_extracted',
            capture_confidence: p.m.importance,
            l0_abstract: p.m.abstract,
            l1_overview: p.m.overview,
            source_type: sourceType,
            sender_id: senderId,
            platform: HAWK_PLATFORM,
          },
          source_type: 'text',
          platform: HAWK_PLATFORM,
        }, sessionId);
        audit('capture', 'success', p.text);
      } catch (storeErr) {
        audit('reject', 'store_error:' + String(storeErr), p.text);
      }
    }

    // ─── LLM 提取项：去重 + 饱和检查 + 批量 embedding + 存储 ───────────────────
    const toEmbed: PreppedMemory[] = [];
    for (const p of llmItems) {
      // 5. Deduplication
      if (await isDuplicate(p.text, config.capture.dedupSimilarity)) { audit('skip', 'duplicate', p.text); continue; }
      // 5b. Saturation check
      if (await handleSaturation(p.text)) { audit('skip', 'saturated', p.text); continue; }
      toEmbed.push(p);
    }

    let storedCount = preExtracted.length;

    if (toEmbed.length > 0) {
      // 批量 embedding：N 条记忆只需 1 次网络往返
      const textsToEmbed = toEmbed.map(p => p.text);
      let vectors: number[][];
      try {
        vectors = await withRetry(() => embedderInstance.embed(textsToEmbed), 3, 1000);
      } catch (embedErr) {
        logger.warn({ err: embedErr }, 'Batch embedding failed, falling back to per-item');
        vectors = [];
        for (const p of toEmbed) {
          try {
            const [v] = await withRetry(() => embedderInstance.embed([p.text]), 3, 1000);
            vectors.push(v);
          } catch {
            vectors.push([]);
          }
        }
      }

      for (let i = 0; i < toEmbed.length; i++) {
        const p = toEmbed[i];
        const vector = vectors[i] ?? [];
        const id = generateId();
        const capture_trigger = p.isEntity ? 'new_entity'
          : p.m.category === 'decision' ? 'decision_made'
          : p.m.category === 'preference' ? 'preference_signal'
          : 'general_content';

        // Entity deduplication：merge with existing similar entity
        if (p.isEntity) {
          const existing = await dbInstance.findSimilarEntity(p.text);
          if (existing) {
            await dbInstance.update(existing.id, {
              text: p.text,
              importance: Math.max(existing.importance, p.m.importance),
            });
            audit('capture', `entity_merge:${existing.id}`, p.text);
            continue;
          }
        }

        // LLM 生成检测：sent 模式下 isLlmmaybe → 标记为 agent_inference
        const isLlmg = isLlmmaybe && event.action === 'sent';
        const memorySource = isLlmg ? 'agent_inference' : sourceType;
        const memoryReliability = isLlmg ? (config.capture.inferenceReliability ?? 0.3) : 0.5;
        const memoryConfidence = isLlmg ? (config.capture.inferenceConfidence ?? 0.5) : 0.0;

        try {
          await dbInstance.store({
            id,
            text: p.text,
            vector,
            category: p.m.category,
            scope: 'global',
            importance: p.m.importance,
            timestamp: Date.now(),
            expiresAt,
            metadata: {
              capture_trigger,
              capture_confidence: p.m.importance,
              l0_abstract: p.m.abstract,
              l1_overview: p.m.overview,
              name: (p.m as any).name || '',
              description: (p.m as any).description || '',
              source_type: memorySource,
              sender_id: senderId,
              platform: HAWK_PLATFORM,
            },
            source_type: 'text',
            source: memorySource,
            reliability: memoryReliability,
            confidence: memoryConfidence,
            platform: HAWK_PLATFORM,
          }, sessionId);
          storedCount++;
          audit('capture', 'success', p.text);
        } catch (storeErr) {
          audit('reject', 'store_error:' + String(storeErr), p.text);
        }
      }
    }

    if (storedCount > 0) {
      logger.info({ storedCount }, 'Stored memories');
      audit('capture', 'stored', `Stored ${storedCount} memories`);
      markBm25Dirty();
    }

  } catch (err) {
    logger.error({ err }, 'hawk-capture handler error');
    memoryErrors.inc({ type: 'capture_handler' });
  }
};

// ─── Python Extractor ─────────────────────────────────────────────────────────

function callExtractor(conversationText: string, config: any): Promise<any[]> {
  return new Promise((resolve) => {
    const apiKey = config.llm?.apiKey || config.embedding.apiKey || '';
    const model = config.llm?.model || 'MiniMax-M2.7';
    const provider = config.llm?.provider || 'openclaw';
    const baseURL = config.llm?.baseURL || '';
    const httpMode = config.python?.httpMode ?? false;
    const httpBase = config.python?.httpBase || process.env.HAWK_API_BASE || 'http://127.0.0.1:18789';

    // ── HTTP mode: call hawk-memory-api /extract endpoint ──────────────────────
    if (httpMode) {
      const postData = JSON.stringify({
        text: conversationText,
        provider,
        model,
        api_key: apiKey,
        base_url: baseURL,
      });

      const url = new URL(httpBase + '/extract');
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        url.toString(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 30000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              logger.warn({ status: res.statusCode }, 'HTTP extractor error, falling back to subprocess');
              resolve(callExtractorSubprocess(conversationText, config));
              return;
            }
            try {
              const data = JSON.parse(body);
              resolve(Array.isArray(data.memories) ? data.memories : []);
            } catch {
              logger.warn('HTTP extractor JSON parse failed, falling back to subprocess');
              resolve(callExtractorSubprocess(conversationText, config));
            }
          });
        },
      );

      req.on('error', (err) => {
        logger.warn({ err: err.message }, 'HTTP extractor connection error, falling back to subprocess');
        resolve(callExtractorSubprocess(conversationText, config));
      });

      req.on('timeout', () => {
        req.destroy();
        logger.warn('HTTP extractor timeout, falling back to subprocess');
        resolve(callExtractorSubprocess(conversationText, config));
      });

      req.write(postData);
      req.end();
      return;
    }

    // ── Default: subprocess mode ───────────────────────────────────────────────
    resolve(callExtractorSubprocess(conversationText, config));
  });
}

function callExtractorSubprocess(conversationText: string, config: any): Promise<any[]> {
  return new Promise(async (resolve) => {
    await acquireSubprocessSlot(); // block if too many concurrent

    try {
      const apiKey = config.llm?.apiKey || config.embedding.apiKey || '';
      const model = config.llm?.model || 'MiniMax-M2.7';
      const provider = config.llm?.provider || 'openclaw';
      const baseURL = config.llm?.baseURL || '';

      const proc = spawn(
        config.python.pythonPath,
        ['-c', buildExtractorScript(conversationText, apiKey, model, provider, baseURL)],
      );

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        logger.warn('Subprocess timeout, killing');
        proc.kill('SIGTERM');
      }, 30000);

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        releaseSubprocessSlot();
        if (code !== 0) {
          logger.error({ code, stderr }, 'Extractor subprocess error');
          resolve([]);
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (Array.isArray(result)) {
            resolve(result);
          } else {
            logger.warn({ output: stdout.slice(0, 200) }, 'Unexpected extractor output, discarding');
            resolve([]);
          }
        } catch {
          logger.warn('Extractor JSON parse failed, discarding output');
          resolve([]);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        releaseSubprocessSlot();
        logger.error({ err: err.message }, 'Subprocess error');
        resolve([]);
      });
    } catch (err) {
      releaseSubprocessSlot();
      logger.error({ err }, 'callExtractorSubprocess unexpected error');
      resolve([]);
    }
  });
}

function buildExtractorScript(conversation: string, apiKey: string, model: string, provider: string, baseURL: string): string {
  const safeConv = JSON.stringify(conversation);
  const safeKey = JSON.stringify(apiKey);
  const safeModel = JSON.stringify(model);
  const safeProvider = JSON.stringify(provider);
  const safeBaseURL = JSON.stringify(baseURL);
  return `
import sys, json, os
sys.path.insert(0, os.path.expanduser('~/.openclaw/workspace/hawk-bridge/python'))
try:
    from hawk_memory import extract_memories
    conv = json.loads(${safeConv})
    key = json.loads(${safeKey})
    mdl = json.loads(${safeModel})
    prov = json.loads(${safeProvider})
    burl = json.loads(${safeBaseURL})
    result = extract_memories(conv, key, mdl, prov, burl)
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
}

function generateId(): string {
  return 'hawk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export default captureHandler;


// ─── Feishu Reaction (🦅) ───────────────────────────────────────────────
// TODO(hawk-bridge): Feishu reaction to indicate capture success.
// Requires OpenClaw plugin system to expose:
//   1. Bot access token (via openclaw's internal credential store)
//   2. A `bot.addReaction(messageId, emoji)` API callable from hooks
// When implemented:
//   - After successful store(), call addHawkReaction(messageId, chatId, '🦅')
//   - Feishu API: POST /open-apis/reaction/v1/reactions
//   - Reaction type: emoji with emoji_id 'approve'
// Currently: capture success is logged to ~/.hawk/audit.log (already implemented)

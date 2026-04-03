// hawk-capture hook
// Triggered on: message:sent
// Action: After agent responds, extract meaningful content → store in LanceDB

import { spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { HawkDB } from '../../lancedb.js';
import { Embedder } from '../../embeddings.js';
import { getConfig } from '../../config.js';
import type { RetrievedMemory } from '../../types.js';
import {
  MAX_CHUNK_SIZE, MIN_CHUNK_SIZE, MAX_TEXT_LEN,
  DEDUP_SIMILARITY, MEMORY_TTL_MS,
} from '../../constants.js';
// Shared: invalidate BM25 index when new memories are stored
import { markBm25Dirty } from '../hawk-recall/handler.js';

const exec = promisify((require('child_process').exec));

let db: HawkDB | null = null;
let embedder: Embedder | null = null;

async function getDB(): Promise<HawkDB> {
  if (!db) {
    db = new HawkDB();
    await db.init();
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

function audit(action: 'capture' | 'skip' | 'reject', reason: string, text: string): void {
  const config = getConfig();
  if (!config.audit?.enabled) return;
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    action,
    reason,
    text: text.slice(0, 200),  // truncate for log safety
  }) + '\n';
  try {
    fs.appendFileSync(AUDIT_LOG_PATH, entry);
  } catch {
    // Non-critical
  }
}

// ─── Text Normalizer ──────────────────────────────────────────────────────────

/**
 * Full text normalization pipeline — applied after sanitization, before dedup.
 * Consolidates all structural cleaning: invisible chars, whitespace, punctuation,
 * markdown artifacts, URLs, repeated sentences, timestamps, etc.
 */
function normalizeText(text: string): string {
  let t = text;

  // 1. Remove invisible / zero-width / control characters
  t = t.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');

  // 2. Normalize line endings
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Remove HTML / XML tags
  t = t.replace(/<[^>]+>/g, '');

  // 4. Remove Markdown images: ![alt](url) → [图片]
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[图片]');

  // 5. Remove Markdown links: [text](url) → text
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 6. Remove Markdown formatting markers: **bold**, *italic*, __underline__
  t = t.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');

  // 7. Remove Markdown headers: # ## ### ...
  t = t.replace(/^#{1,6}\s+/gm, '');

  // 8. Remove Markdown code fences (keep content): ```lang\n...\n```
  t = t.replace(/```[\w*]*\n([\s\S]*?)```/g, (_, code) => code.trim());

  // 9. Remove inline code markers: `code` → code
  t = t.replace(/`([^`]+)`/g, '$1');

  // 10. Remove Markdown blockquote markers
  t = t.replace(/^>\s+/gm, '');

  // 11. Remove Markdown list markers
  t = t.replace(/^[\s]*[-*+]\s+/gm, '');
  t = t.replace(/^[\s]*\d+\.\s+/gm, '');

  // 12. Remove console.log / debug comments: console.log(...) → [日志]
  t = t.replace(/\bconsole\s*\.\s*(log|debug|info|warn|error)\s*\([^)]*\)/gi, '[日志]');
  t = t.replace(/\bprint\s*\([^)]*\)/g, '[日志]');
  t = t.replace(/\bprint\b(?!\s*=)/g, '[日志]');  // Python print
  t = t.replace(/\blogger\s*\.\s*(debug|info|warn|error)\s*\([^)]*\)/gi, '[日志]');

  // 13. Remove stack trace lines (keep first and last frame)
  t = t.replace(/(^\tat\s+[^\n]+\n)((\tat\s+[^\n]+\n)*)(\bat\s+[^\n]+$)/gm,
    (_, head, middle, tail) => head + (middle ? '\n  ...\n' : '') + tail);

  // 14. Merge broken URLs (URL split by newline/hyphen)
  t = t.replace(/(https?:\/\/[^\s\n,，]+)[\n-]([^\s,，]+)/g, '$1$2');

  // 15. Compress over-long URLs: keep domain + TLD + first 60 path chars
  t = t.replace(/(https?:\/\/[^\s　'"<>】】]+)\/([^\s　'"<>】】]{0,60}[^\s　'"<>】】]*)/g,
    (_, domain, path) => {
      const fullPath = path.length > 60 ? path.slice(0, 60) + '...' : path;
      return domain + '/' + fullPath;
    });

  // 16. Remove Emoji
  t = t.replace(
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{1FA00}-\u{1FAFF}]|[\u{1F900}-\u{1F9FF}]/gu,
    ''
  );

  // 17. Normalize Chinese punctuation → English equivalents
  t = t
    .replace(/。/g, '.')
    .replace(/，/g, ',')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .replace(/？/g, '?')
    .replace(/！/g, '!')
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    .replace(/《/g, '<')
    .replace(/》/g, '>')
    .replace(/、/g, ',')
    .replace(/…/g, '...')
    .replace(/～/g, '~');

  // 18. Normalize timestamps: various date/time formats → [时间]
  t = t.replace(
    /\b(?:\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?\s*(?:[时分]?\s*\d{1,2}[：:]\d{1,2}(?:[：:]\d{1,2})?\s*(?:AM|PM|am|pm)?)?|\d{1,2}[-/月]\d{1,2}[日]?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)\b/g,
    '[时间]'
  );

  // 19. Compact whitespace: multiple spaces → single space
  t = t.replace(/[ \t]{2,}/g, ' ');

  // 20. Collapse multiple newlines to max 2
  t = t.replace(/\n{3,}/g, '\n\n');

  // 21. Trim each line (remove leading/trailing whitespace)
  t = t.split('\n').map(line => line.trim()).join('\n');

  // 22. Remove blank lines at start/end
  t = t.trim();

  // 23. Simplify large numbers: 1,500,000 → 1.5M
  t = t.replace(/\b(\d{1,3}(?:,\d{3}){2,})(?:\b|[^\d])/g, (match) => {
    const num = parseInt(match.replace(/,/g, ''), 10);
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return match;
  });

  // 24. Replace over-long base64 strings: >100 chars of base64 → [BASE64数据]
  t = t.replace(/\b[A-Za-z0-9+/]{100,}={0,2}\b/g, '[BASE64数据]');

  // 25. Compress JSON: {"key": "value"} → {"key":"value"}
  // Only applied to standalone JSON lines or blocks
  t = t.replace(/(\{"[^"]+":\s*"[^"]+"\})/g, (json) => {
    try { return JSON.stringify(JSON.parse(json)); } catch { return json; }
  });

  // 26. Collapse repeated sentences (exact duplicate sentences)
  {
    const sentences = t.split(/(?<=[.!?])\s+/);
    const seen = new Set<string>();
    t = sentences.filter(s => {
      const normalized = s.toLowerCase().trim();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }).join(' ');
  }

  // 27. Collapse repeated paragraphs (exact duplicate blocks separated by \n\n)
  {
    const paras = t.split(/\n\n+/);
    const seenPara = new Set<string>();
    t = paras.filter(p => {
      const normalized = p.trim().toLowerCase();
      if (seenPara.has(normalized)) return false;
      seenPara.add(normalized);
      return true;
    }).join('\n\n');
  }

  // 28. Minimize spaces between Chinese and English (中文 text 中文 → 中文text中文)
  t = t.replace(/([\u4e00-\u9fff])([A-Za-z])/g, '$1$2');
  t = t.replace(/([A-Za-z])([\u4e00-\u9fff])/g, '$1$2');

  return t;
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
    const dbInstance = await getDB();
    const recent = await dbInstance.listRecent(20);
    for (const m of recent) {
      if (textSimilarity(text, m.text) >= threshold) return true;
    }
  } catch {
    // Non-critical
  }
  return false;
}

// ─── Main Capture Handler ──────────────────────────────────────────────────────

const captureHandler = async (event: HookEvent) => {
  if (event.type !== 'message' || event.action !== 'sent') return;
  if (!event.context?.success) return;

  try {
    const config = await getConfig();
    if (!config.capture.enabled) return;

    const { maxChunks, importanceThreshold, ttlMs } = config.capture;

    const content = event.context?.content;
    if (typeof content !== 'string' || content.length < 50) return;

    const memories = await callExtractor(content, config);
    if (!memories || !memories.length) return;

    const significant = memories.filter(
      (m: any) => m.importance >= importanceThreshold
    ).slice(0, maxChunks);

    if (!significant.length) return;

    const [dbInstance, embedderInstance] = await Promise.all([
      getDB(),
      getEmbedder(),
    ]);

    const { batchStore } = dbInstance;
    let storedCount = 0;

    for (const m of significant) {
      let text = m.text.trim();

      // 0. Full text normalization (structural cleaning)
      text = normalizeText(text);

      // 1. Validate (after normalization so length is accurate)
      if (!isValidChunk(text)) {
        audit('skip', 'invalid_chunk', text);
        continue;
      }

      // 2. Harmful content check
      if (isHarmful(text)) {
        audit('reject', 'harmful_content', text);
        continue;
      }

      // 3. Sanitize (sensitive info redaction — after normalize so URL/JSON is cleaned)
      text = sanitize(text);

      // 4. Truncate
      text = truncate(text);

      // 5. Deduplication
      if (await isDuplicate(text)) {
        audit('skip', 'duplicate', text);
        continue;
      }

      // 6. Compute TTL
      const effectiveTtl = ttlMs || MEMORY_TTL_MS;
      const expiresAt = effectiveTtl > 0 ? Date.now() + effectiveTtl : 0;

      // 7. Embed & store
      const id = generateId();
      try {
        const [vector] = await embedderInstance.embed([text]);
        await dbInstance.store({
          id,
          text,
          vector,
          category: m.category,
          scope: 'global',
          importance: m.importance,
          timestamp: Date.now(),
          expiresAt,
          metadata: {
            l0_abstract: m.abstract,
            l1_overview: m.overview,
            source: 'hawk-capture',
          },
        });
        storedCount++;
        audit('capture', 'success', text);
      } catch (storeErr) {
        audit('reject', 'store_error:' + String(storeErr), text);
      }
    }

    if (storedCount > 0) {
      console.log(`[hawk-capture] Stored ${storedCount} memories`);
      markBm25Dirty();
    }

  } catch (err) {
    console.error('[hawk-capture] Error:', err);
  }
};

// ─── Python Extractor ─────────────────────────────────────────────────────────

function callExtractor(conversationText: string, config: any): Promise<any[]> {
  return new Promise((resolve) => {
    const apiKey = config.embedding.apiKey || process.env.OPENAI_API_KEY || process.env.MINIMAX_API_KEY || '';
    const model = config.llm?.model || process.env.MINIMAX_MODEL || 'MiniMax-M2.7';
    const provider = config.llm?.provider || 'openclaw';
    const baseURL = config.llm?.baseURL || process.env.MINIMAX_BASE_URL || '';

    const proc = spawn(
      config.python.pythonPath,
      ['-c', buildExtractorScript(conversationText, apiKey, model, provider, baseURL)],
    );

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      console.warn('[hawk-capture] subprocess timeout, killing...');
      proc.kill('SIGTERM');
    }, 30000);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error('[hawk-capture] extractor error:', code, stderr ? `stderr: ${stderr}` : '');
        resolve([]);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (Array.isArray(result)) {
          resolve(result);
        } else {
          console.warn('[hawk-capture] unexpected extractor output, discarding');
          resolve([]);
        }
      } catch {
        console.warn('[hawk-capture] JSON parse failed, discarding output');
        resolve([]);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      console.error('[hawk-capture] subprocess error:', err.message);
      resolve([]);
    });
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

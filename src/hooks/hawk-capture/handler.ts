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

      // 1. Validate
      if (!isValidChunk(text)) {
        audit('skip', 'invalid_chunk', text);
        continue;
      }

      // 2. Harmful content check
      if (isHarmful(text)) {
        audit('reject', 'harmful_content', text);
        continue;
      }

      // 3. Sanitize
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

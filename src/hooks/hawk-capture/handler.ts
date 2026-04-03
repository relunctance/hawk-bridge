// hawk-capture hook
// Triggered on: message:sent
// Action: After agent responds, extract meaningful content → store in LanceDB

import { spawn } from 'child_process';
import { promisify } from 'util';
import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { HawkDB } from '../../lancedb.js';
import { Embedder } from '../../embeddings.js';
import { getConfig } from '../../config.js';
import type { RetrievedMemory } from '../../types.js';
// Shared: invalidate BM25 index when new memories are stored
import { markBm25Dirty } from '../hawk-recall/handler.js';

const exec = promisify((require('child_process').exec));

// ─── Sensitive Information Sanitizer ───────────────────────────────────────
// Applied before storing memories to prevent PII/secrets from being captured.
// Each pattern returns a two-element tuple [regex, replacement].

const SANITIZE_PATTERNS: Array<[RegExp, string]> = [
  // API keys / secrets: api_key=xxx, secret: "xxx", token: 'xxx'
  [/(?:api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key)\s*[:=]\s*["']?([\w-]{8,})["']?/gi, '$1: [REDACTED]'],
  // Bearer / Authorization tokens
  [/(Bearer\s+)[\w.-]{10,}/gi, '$1[REDACTED]'],
  // AWS keys
  [/(AKIA[0-9A-Z]{16})/g, '[AWS_KEY_REDACTED]'],
  // GitHub tokens
  [/(ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,})/g, '[GITHUB_TOKEN_REDACTED]'],
  // Generic long alphanumeric strings that look like keys (≥32 chars)
  [/\b[a-zA-Z0-9]{32,}\b/g, '[KEY_REDACTED]'],
  // Chinese mobile phone numbers (11 digits starting with 1)
  [/\b1[3-9]\d{9}\b/g, '[PHONE_REDACTED]'],
  // Email addresses
  [/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, '[EMAIL_REDACTED]'],
  // Chinese ID card numbers
  [/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, '[ID_REDACTED]'],
  // Credit card numbers (16 digits, with or without spaces/dashes)
  [/\b(?:\d{4}[- ]?){3}\d{4}\b/g, '[CARD_REDACTED]'],
  // IP addresses (IPv4)
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]'],
  // URLs with credentials
  [/\/\/[^:@\/]+:[^@\/]+@/g, '//[CREDS_REDACTED]@'],
];

/**
 * Remove or redact sensitive information from text before storage.
 * Applied at capture time — already-captured memories are not retroactively sanitized.
 */
function sanitize(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SANITIZE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

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

const captureHandler = async (event: HookEvent) => {
  // Only handle message:sent
  if (event.type !== 'message' || event.action !== 'sent') return;
  if (!event.context?.success) return; // Only on successful sends

  try {
    const config = await getConfig();
    if (!config.capture.enabled) return;

    const { maxChunks, importanceThreshold } = config.capture;

    // Build conversation text from recent messages
    // We use the outbound content as the trigger for extraction
    const content = event.context?.content;
    if (typeof content !== 'string' || content.length < 50) return;

    // Call Python extractor via subprocess
    const memories = await callExtractor(content, config);
    if (!memories || !memories.length) return;

    // Filter by importance threshold
    const significant = memories.filter(
      (m: any) => m.importance >= importanceThreshold
    ).slice(0, maxChunks);

    if (!significant.length) return;

    // Store each memory
    const [dbInstance, embedderInstance] = await Promise.all([
      getDB(),
      getEmbedder(),
    ]);

    const texts = significant.map((m: any) => m.text);
    const vectors = await embedderInstance.embed(texts);

    for (let i = 0; i < significant.length; i++) {
      const m = significant[i];
      const vector = vectors[i];
      const id = generateId();
      const sanitizedText = sanitize(m.text);

      await dbInstance.store({
        id,
        text: sanitizedText,
        vector,
        category: m.category,
        scope: 'global',
        importance: m.importance,
        timestamp: Date.now(),
        metadata: {
          l0_abstract: m.abstract,
          l1_overview: m.overview,
          source: 'hawk-capture',
        },
      });
    }

    console.log(`[hawk-capture] Stored ${significant.length} memories`);

    // Notify hawk-recall that BM25 index is stale — will rebuild on next search
    markBm25Dirty();

  } catch (err) {
    console.error('[hawk-capture] Error:', err);
    // Non-critical
  }
};

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

    // Auto-kill subprocess after timeout (Node.js spawn does NOT auto-kill on timeout)
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
  // Escape all variables injected into Python single-quoted strings.
  // Use a safe JSON-based approach: JSON.stringify forces double-quote context
  // and prevents any shell/Python injection.
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

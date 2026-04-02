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

      await dbInstance.store({
        id,
        text: m.text,
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

    // Auto-kill subprocess after timeout (Node.js spawn does NOT auto-kill on timeout)
    const timer = setTimeout(() => {
      console.warn('[hawk-capture] subprocess timeout, killing...');
      proc.kill('SIGTERM');
    }, 30000);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error('[hawk-capture] extractor error:', code);
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

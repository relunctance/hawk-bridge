// hawk-recall hook
// Triggered on: agent:bootstrap
// Action: Search LanceDB for relevant memories and inject into context

import type { HookEvent } from '../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { HawkDB } from '../lancedb.js';
import { Embedder, formatRecallForContext } from '../embeddings.js';
import { getConfig } from '../config.js';
import type { RetrievedMemory } from '../types.js';

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

// Inject marker used by the context engine
const RECALL_INJECTION_MARKER = '<!-- hawk-recall -->';

const recallHandler = async (event: HookEvent) => {
  // Only handle agent:bootstrap
  if (event.type !== 'agent' || event.action !== 'bootstrap') return;

  try {
    const config = await getConfig();
    const { topK, minScore, injectEmoji } = config.recall;

    // Get the user's prompt from context
    // For agent:bootstrap, the sessionEntry contains the bootstrap message
    // We extract the most recent user message to use as query
    const sessionEntry = event.context?.sessionEntry;
    if (!sessionEntry) return;

    // Extract query text from session entry
    const queryText = extractQueryFromSession(sessionEntry);
    if (!queryText || queryText.length < 10) return;

    // Query LanceDB
    const [dbInstance, embedderInstance] = await Promise.all([
      getDB(),
      getEmbedder(),
    ]);

    const queryVector = await embedderInstance.embedQuery(queryText);
    const memories: RetrievedMemory[] = await dbInstance.search(
      queryVector,
      topK,
      minScore,
      'global' // default scope
    );

    if (!memories.length) return;

    // Format and inject
    const injectionText = formatRecallForContext(
      memories.map(m => ({
        text: m.text,
        score: m.score,
        category: m.category,
      })),
      injectEmoji
    );

    // Push to messages to inject into context
    // The context engine will pick up these messages
    event.messages.push(`\n${injectionText}\n`);

  } catch (err) {
    console.error('[hawk-recall] Error:', err);
    // Non-critical — don't fail the bootstrap
  }
};

function extractQueryFromSession(sessionEntry: any): string {
  // Try to extract the most recent user message as query
  if (!sessionEntry) return '';

  // sessionEntry is a SessionEntry object
  // messages are in sessionEntry.messages or similar
  const messages: any[] = sessionEntry.messages || [];

  // Find last user message
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

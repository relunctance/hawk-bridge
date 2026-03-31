// hawk-recall hook
// Triggered on: agent:bootstrap
// Action: Hybrid search (vector + BM25 + RRF + rerank + noise filter) → inject memories

import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { HawkDB } from '../../lancedb.js';
import { Embedder, formatRecallForContext } from '../../embeddings.js';
import { HybridRetriever } from '../../retriever.js';
import { getConfig } from '../../config.js';

let retriever: HybridRetriever | null = null;

async function getRetriever(): Promise<HybridRetriever> {
  if (!retriever) {
    const config = await getConfig();
    const db = new HawkDB();
    await db.init();
    const embedder = new Embedder(config.embedding);
    retriever = new HybridRetriever(db, embedder);
    await retriever.buildBm25Index();
    await retriever.buildNoisePrototypes();
  }
  return retriever;
}

const recallHandler = async (event: HookEvent) => {
  if (event.type !== 'agent' || event.action !== 'bootstrap') return;

  try {
    const config = await getConfig();
    const { topK, injectEmoji } = config.recall;

    const sessionEntry = event.context?.sessionEntry;
    if (!sessionEntry) return;

    const queryText = extractQueryFromSession(sessionEntry);
    if (!queryText || queryText.length < 10) return;

    const retrieverInstance = await getRetriever();
    const memories = await retrieverInstance.search(queryText, topK);

    if (!memories.length) return;

    const injectionText = formatRecallForContext(
      memories.map(m => ({
        text: m.text,
        score: m.score,
        category: m.category,
      })),
      injectEmoji
    );

    event.messages.push(`\n${injectionText}\n`);

  } catch (err) {
    console.error('[hawk-recall] Error:', err);
  }
};

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

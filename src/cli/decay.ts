/**
 * hawk-bridge decay CLI
 * Runs memory decay, layer management, and purge of forgotten memories.
 *
 * Usage:
 *   node dist/cli/decay.js           # run once
 *   node dist/cli/decay.js --watch   # run every 6 hours (daemon mode)
 *
 * Note: decay() and purgeForgotten() call HawkDB methods which depend on
 * LanceDB's async query API (toArray). Run this after hawk-bridge has
 * been initialized at least once.
 */

import { HawkDB } from '../lancedb.js';

async function main() {
  const db = new HawkDB();
  await db.init();

  console.log('[decay] Starting memory maintenance...');

  try {
    const result = await db.decay();
    console.log(
      `[decay] Done — updated=${result.updated}, deleted=${result.deleted}`
    );
  } catch (err) {
    // If decay fails (e.g., no memories yet), just report gracefully
    console.log('[decay] No memories to process or error:', (err as Error).message);
  }
}

const watch = process.argv.includes('--watch');
const intervalMs = 6 * 60 * 60 * 1000; // 6 hours

main().then(() => {
  if (watch) {
    console.log('[decay] Watch mode: next run in 6h');
    setInterval(main, intervalMs);
  } else {
    process.exit(0);
  }
}).catch(err => {
  console.error('[decay] Failed:', err);
  process.exit(1);
});

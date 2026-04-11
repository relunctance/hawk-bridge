// hawk-bridge plugin entry point
// Bridges OpenClaw Gateway hooks to hawk Python memory system

import recallHandler from './hooks/hawk-recall/handler.js';
import captureHandler from './hooks/hawk-capture/handler.js';
import { getMemoryStore } from './store/factory.js';

export { recallHandler as 'hawk-recall', captureHandler as 'hawk-capture' };

/**
 * Public feedback API — rate a recalled memory.
 * Called by OpenClaw hooks after a memory is used in context.
 *
 * @param memoryId  The memory ID returned from recall results
 * @param rating     'helpful' | 'neutral' | 'harmful'
 * @param sessionId  Optional; stored for audit trail
 */
export async function rateMemory(
  memoryId: string,
  rating: 'helpful' | 'neutral' | 'harmful',
  sessionId?: string
): Promise<void> {
  const store = await getMemoryStore();
  await store.rateMemory(memoryId, rating, sessionId);
}

function register(api: any) {
  api.registerHook(['agent:bootstrap'], recallHandler, {
    name: 'hawk-recall',
    description: 'Inject relevant hawk memories before agent starts',
  });
  api.registerHook(['message:sent'], captureHandler, {
    name: 'hawk-capture',
    description: 'Auto-extract and store memories after agent responds',
  });
}

export default { register };

// hawk-decay hook
// Triggered on: agent:heartbeat (periodic background maintenance)
// Action: Age importance scores, promote/demote memory layers, purge forgotten memories

import type { HookEvent } from '../../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { getMemoryStore } from '../../store/factory.js';
import type { MemoryStore } from '../../store/interface.js';
import { FORGET_GRACE_DAYS } from '../../constants.js';
import { logger } from '../../logger.js';

let lastDecayRun = 0;
let tierMaintenanceDone = false;
const DECAY_INTERVAL_MS = 6 * 60 * 60 * 1000; // minimum 6h between decay runs

const decayHandler = async (event: HookEvent) => {
  // Guard: only handle agent heartbeat events
  if (event.type !== 'agent' || event.action !== 'heartbeat') return;

  // Rate-limit: don't run decay more than once every DECAY_INTERVAL_MS
  const now = Date.now();
  if (now - lastDecayRun < DECAY_INTERVAL_MS) return;
  lastDecayRun = now;

  try {
    const db = await getMemoryStore() as any;
    await db.init();

    // Run value-driven tier maintenance once at startup (not on every heartbeat)
    if (!tierMaintenanceDone) {
      const tierResult = await db.runTierMaintenance();
      tierMaintenanceDone = true;
      if (tierResult.updated > 0) {
        logger.debug({ updated: tierResult.updated }, '[hawk-decay] tier maintenance: updated={updated} memories');
      }
    }

    // Run importance decay + layer management
    const decayResult = await db.decay();

    // Track last decay time globally (for hawk状态)
    (global as any).__hawk_last_decay__ = Date.now();

    // Purge soft-deleted memories past grace period
    const purged = await db.purgeForgotten(FORGET_GRACE_DAYS);

    const total = decayResult.updated + decayResult.deleted + purged;
    if (total > 0) {
      logger.debug({ updated: decayResult.updated, deleted: decayResult.deleted, purged }, '[hawk-decay] decay complete');
    }
  } catch (err) {
    logger.error({ err }, '[hawk-decay] Error');
  }
};

export default decayHandler;

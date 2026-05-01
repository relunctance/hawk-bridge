// hawk-trigger hook
//
// Listens to every user message (message_received) and evaluates trigger rules.
// If a rule matches, sets trigger context so hawk-recall can inject procedures.
//
// ⚠️ OpenClaw Hook Event Format:
//   ✅ message_received  (underscore in openclaw.plugin.json)
//   ❌ message:received  (colon format)

// ─── Hawk Trigger Hook ─────────────────────────────────────────────────────────────────────
//
// Trigger flow:
//   message_received → hawk-trigger evaluates rules → sets trigger_context
//   → hawk-recall reads trigger_context → injects matched procedures
//
// This separation allows:
//   1. hawk-trigger: rule evaluation (fast, no LLM)
//   2. hawk-recall: procedure injection into context (already has LLM)

// ─── Implementation ────────────────────────────────────────────────────────────────────────

import * as http from 'http';
import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { logger } from '../../logger.js';

// ─── Types ─────────────────────────────────────────────────────────────────

interface TriggerEvaluateResponse {
  should_trigger: boolean;
  matched_rule_ids: string[];
  matched_rule_types: string[];
  procedures: Array<{
    memory_id: string;
    title: string;
    text: string;
    importance: number;
    score: number;
  }>;
  injection_constraints: {
    require_context_fields: string[];
    require_steps: boolean;
  } | null;
  alternative_recall: string;
  negative_blocked: boolean;
}

// ─── hawk-memory (Go) HTTP client ─────────────────────────────────────────────────────────

const API_BASE = process.env.HAWK_API_URL || 'http://127.0.0.1:18368';

function httpPost(path: string, body: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const postData = JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json',
      },
      timeout: 5000,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(postData);
    req.end();
  });
}

// ─── Trigger Context Storage ─────────────────────────────────────────────────────────────
//
// Since hooks run independently, we use a module-level cache keyed by session_id.
// hawk-recall reads from this cache on each recall invocation.

interface TriggerContext {
  sessionId: string;
  query: string;
  response: TriggerEvaluateResponse;
  timestamp: number;
}

const _triggerCache = new Map<string, TriggerContext>();

export function getTriggerContext(sessionId: string): TriggerContext | null {
  const ctx = _triggerCache.get(sessionId);
  if (!ctx) return null;
  // Expire after 30 seconds
  if (Date.now() - ctx.timestamp > 30_000) {
    _triggerCache.delete(sessionId);
    return null;
  }
  return ctx;
}

// ─── Main Hook Handler ─────────────────────────────────────────────────────────────────

export async function onMessageReceived(event: HookEvent): Promise<void> {
  // Only process user messages (role === 'user')
  const message = event.data?.message ?? event.data?.text ?? '';
  const role: string = event.data?.role ?? '';

  if (role !== 'user' && !message) return;

  // Extract session id
  const sessionId: string =
    event.data?.session_id ??
    event.data?.sessionId ??
    event.context?.sessionId ??
    'default';

  // Extract actual query text
  const query = typeof message === 'string' ? message : String(message);
  if (!query.trim()) return;

  logger.debug(`[hawk-trigger] evaluating session=${sessionId} query=${query.slice(0, 80)}`);

  try {
    const result = await httpPost('/rules/evaluate', {
      query,
      context: null,
      include_negative: true,
    }) as TriggerEvaluateResponse;

    // Go binary has no /rules/evaluate endpoint — this will 404
    // Catch below handles gracefully so hawk-trigger doesn't crash
    if (!result || !('should_trigger' in result)) {
      throw new Error('unexpected response shape');
    }

    if (result.should_trigger && result.procedures.length > 0) {
      // Cache the trigger context for hawk-recall to consume
      _triggerCache.set(sessionId, {
        sessionId,
        query,
        response: result,
        timestamp: Date.now(),
      });

      logger.info(
        `[hawk-trigger] triggered rules=${result.matched_rule_ids.join(',')} ` +
        `procedures=${result.procedures.length} session=${sessionId}`
      );
    } else if (result.negative_blocked) {
      logger.debug(`[hawk-trigger] negative blocked session=${sessionId}`);
      // Negative rule matched — clear any cached trigger
      _triggerCache.delete(sessionId);
    }

  } catch (err) {
    // Trigger evaluation is best-effort — don't fail the message
    logger.warn(`[hawk-trigger] evaluation failed: ${err}`);
  }
}

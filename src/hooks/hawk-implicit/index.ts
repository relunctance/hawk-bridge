// hawk-implicit hook — entry point
//
// Listens to:
//   - message_received: user message → detect query/feedback/choice
//   - message_sent: agent response → buffer for context
//
// Requires hawk-memory running at HAWK_API_BASE (default http://127.0.0.1:18368)

import type { HookEvent } from '../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import { handleMessageReceived, handleMessageSent } from './collector.js';
import { logger } from '../../logger.js';

// Platform identity
const HAWK_PLATFORM = process.env.HAWK_PLATFORM || 'openclaw';

function extractSessionKey(event: HookEvent): string {
  // session_key from event metadata
  if (event.session?.key) return event.session.key;
  if (event.sessionKey) return event.sessionKey;
  if (typeof event.metadata?.sessionKey === 'string') return event.metadata.sessionKey;
  return 'unknown';
}

function extractAgentID(event: HookEvent): string {
  if (event.agent?.id) return event.agent.id;
  if (typeof event.metadata?.agentId === 'string') return event.metadata.agentId;
  return 'default';
}

function extractTenantID(event: HookEvent): string {
  if (event.agent?.tenantId) return event.agent.tenantId;
  if (typeof event.metadata?.tenantId === 'string') return event.metadata.tenantId;
  return '';
}

// ─── Hook Handlers ─────────────────────────────────────────────────────────────

async function onMessageReceived(event: HookEvent): Promise<void> {
  const sessionKey = extractSessionKey(event);
  const agentID = extractAgentID(event);
  const tenantID = extractTenantID(event);

  // Get user message text from the event
  let userMessage = '';
  if (typeof event.content?.text === 'string') {
    userMessage = event.content.text;
  } else if (typeof event.content === 'string') {
    userMessage = event.content;
  }

  if (!userMessage || userMessage.trim().length === 0) {
    return;
  }

  try {
    await handleMessageReceived(sessionKey, agentID, tenantID, userMessage.trim());
  } catch (err) {
    logger.error({ err, sessionKey, agentID }, 'hawk-implicit: onMessageReceived error');
  }
}

async function onMessageSent(event: HookEvent): Promise<void> {
  const sessionKey = extractSessionKey(event);
  const agentID = extractAgentID(event);
  const tenantID = extractTenantID(event);

  let agentMessage = '';
  if (typeof event.content?.text === 'string') {
    agentMessage = event.content.text;
  } else if (typeof event.content === 'string') {
    agentMessage = event.content;
  }

  if (!agentMessage || agentMessage.trim().length === 0) {
    return;
  }

  try {
    await handleMessageSent(sessionKey, agentID, tenantID, agentMessage.trim());
  } catch (err) {
    logger.error({ err, sessionKey, agentID }, 'hawk-implicit: onMessageSent error');
  }
}

// ─── OpenClaw Hook Export ───────────────────────────────────────────────────────

// Default handler — OpenClaw calls this for each matching event
export default async function hawkImplicitHook(event: HookEvent): Promise<void> {
  const eventName = event.event ?? (event as any).name ?? '';

  switch (eventName) {
    case 'message_received':
    case 'message_received': // underscore format for hook registration
      await onMessageReceived(event);
      break;
    case 'message_sent':
    case 'message_sent': // underscore format
      await onMessageSent(event);
      break;
    default:
      logger.debug({ eventName }, 'hawk-implicit: unhandled event');
  }
}

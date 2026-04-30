// hawk-implicit — Implicit Knowledge Capture behavioral event collector
//
// Collects:
//   - onChoiceMade: user selects from options offered by agent
//   - onFeedback: user reacts or gives feedback on a memory/response
//   - onQuerySubmit: user submits a query or question
//
// Events:
//   POST /v1/implicit-knowledge/event (hawk-memory)
//
// NOTE: This hook is phase 1 of KR-IK-2. It uses pattern-based detection
// (regex, keyword matching). Full version would use LLM to analyze conversation
// for implicit signals.

import { getConfig } from '../../config.js';
import { logger } from '../../logger.js';

const HAWK_PLATFORM = process.env.HAWK_PLATFORM || 'openclaw';

// ─── Event Types ────────────────────────────────────────────────────────────────

export interface ChoiceMadeEvent {
  type: 'choice_made';
  agent_id: string;
  tenant_id: string;
  session_key: string;
  timestamp: number;
  choice_text: string;
  rejected_options: string[];
  context: string;
  source: 'user_message';
}

export interface FeedbackEvent {
  type: 'feedback';
  agent_id: string;
  tenant_id: string;
  session_key: string;
  timestamp: number;
  memory_id?: string;
  query?: string;
  feedback_type: 'positive' | 'negative' | 'correction' | 'neutral';
  feedback_text?: string;
  source: 'message';
}

export interface QuerySubmitEvent {
  type: 'query_submit';
  agent_id: string;
  tenant_id: string;
  session_key: string;
  timestamp: number;
  query_text: string;
  query_type: 'question' | 'recall' | 'task' | 'other';
  has_clarification: boolean;
  source: 'user_message';
}

// ─── Session Buffer ─────────────────────────────────────────────────────────────

// Per-session ring buffer of recent messages for context
interface MessageEntry {
  role: 'user' | 'agent';
  text: string;
  ts: number;
}

const SESSION_BUFFER_SIZE = 6;
const sessionBuffers = new Map<string, MessageEntry[]>();

function getSessionBuffer(sessionKey: string): MessageEntry[] {
  if (!sessionBuffers.has(sessionKey)) {
    sessionBuffers.set(sessionKey, []);
  }
  return sessionBuffers.get(sessionKey)!;
}

function pushMessage(sessionKey: string, role: 'user' | 'agent', text: string) {
  const buf = getSessionBuffer(sessionKey);
  buf.push({ role, text, ts: Date.now() });
  if (buf.length > SESSION_BUFFER_SIZE) {
    buf.shift();
  }
}

// ─── Pattern Detectors ─────────────────────────────────────────────────────────

// Check if a user message is a choice selection (A/B/C, "第一个", "这个", etc.)
const CHOICE_SELECT_PATTERNS = [
  /^(?:选?|用?|就|采用?|选?(?:这个?|那(?:个?|个))|第[一二三1-3]个?|A|B|C|方案[一二三1-3]?)$/i,
  /^(?:ok|yes|no|cancel|confirm|confirm|accept|decline)$/i,
];

function isChoiceSelection(text: string): boolean {
  const trimmed = text.trim();
  return CHOICE_SELECT_PATTERNS.some(p => p.test(trimmed));
}

// Check if an agent message contains option choices (A. B. C. or 1. 2. 3.)
const OPTION_LIST_PATTERNS = [
  /(?:^|\n)\s*[A-C]\s*[:.、][^\n]+/i,
  /(?:^|\n)\s*[1-3]\s*[:.、][^\n]+/i,
  /(?:^|\n)\s*[一二三]\s*[:.、][^\n]+/i,
  /以下(?:是|为).*?(?:选项|方案|建议)/i,
  /请问选(?:哪个|哪个方案)/i,
];

function hasOptionList(text: string): boolean {
  return OPTION_LIST_PATTERNS.some(p => p.test(text));
}

// Extract options from agent message
function extractOptions(text: string): string[] {
  const options: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([A-C1-3一二三])\s*[:.、]\s*(.+)$/);
    if (match) {
      options.push(match[2].trim());
    }
  }
  return options;
}

// Check if user message is a question/query
const QUERY_PATTERNS = [
  /\?$/,
  /^请问/,
  /^我想知道/,
  /^有没有/,
  /^可以告诉我/,
  /^What is|^How do|^Why does|^Can I|^Is there/,
];

function isQuery(text: string): boolean {
  const trimmed = text.trim();
  return QUERY_PATTERNS.some(p => p.test(trimmed));
}

// Query type classifier
function classifyQueryType(text: string): QuerySubmitEvent['query_type'] {
  const trimmed = text.trim().toLowerCase();
  if (/^(?:帮我|帮我做|请帮我|帮我写|帮我创建)/.test(trimmed)) return 'task';
  if (/^(?:recall|记忆|搜索|查找)/.test(trimmed)) return 'recall';
  if (trimmed.endsWith('?')) return 'question';
  return 'other';
}

// Feedback detection
const POSITIVE_PATTERNS = /^(?:对|可以|好|没错?|有用?|👍|ok|yes|yep|yeah|correct|right)$/i;
const NEGATIVE_PATTERNS = /^(?:不对?|错|没用?|不对|不对|❌|👎|no|nope|incorrect)$/i;
const CORRECTION_PATTERNS = /^不(?:是|对)，/i;

function detectFeedbackType(text: string): FeedbackEvent['feedback_type'] | null {
  const trimmed = text.trim();
  if (POSITIVE_PATTERNS.test(trimmed)) return 'positive';
  if (NEGATIVE_PATTERNS.test(trimmed)) return 'negative';
  if (CORRECTION_PATTERNS.test(trimmed)) return 'correction';
  return null;
}

// ─── Hawk-memory API client ─────────────────────────────────────────────────────

const API_BASE = process.env.HAWK_API_BASE ?? 'http://127.0.0.1:18368';

async function sendBehavioralEvent(event: ChoiceMadeEvent | FeedbackEvent | QuerySubmitEvent): Promise<void> {
  try {
    const body = JSON.stringify(event);
    await fetch(`${API_BASE}/v1/implicit-knowledge/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // fire-and-forget; errors are logged but not fatal
    });
  } catch (err) {
    logger.warn({ err }, 'hawk-implicit: sendBehavioralEvent failed');
  }
}

// ─── Core Detection Logic ───────────────────────────────────────────────────────

// Check if the last agent message offered options, and the current user message is a choice
async function detectChoiceMade(
  sessionKey: string,
  agentID: string,
  tenantID: string,
  userMessage: string,
): Promise<ChoiceMadeEvent | null> {
  const buf = getSessionBuffer(sessionKey);

  // Look for the most recent agent message with options
  let lastOptionList = '';
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i].role === 'agent' && hasOptionList(buf[i].text)) {
      lastOptionList = buf[i].text;
      break;
    }
  }

  if (!lastOptionList || !isChoiceSelection(userMessage)) {
    return null;
  }

  const options = extractOptions(lastOptionList);
  // Determine which option was selected
  const trimmed = userMessage.trim().toLowerCase();
  let selectedOption = userMessage;
  const options_lower = options.map(o => o.toLowerCase());

  // Match by index
  if (/^[1-3]$/.test(trimmed)) {
    const idx = parseInt(trimmed) - 1;
    if (idx < options.length) selectedOption = options[idx];
  } else if (/^[A-C]$/i.test(trimmed)) {
    const idx = trimmed.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
    if (idx < options.length) selectedOption = options[idx];
  } else if (/^第[一二三]/.test(trimmed)) {
    const map: Record<string, number> = { '一': 0, '二': 1, '三': 2 };
    const m = trimmed.match(/^第(.)/);
    if (m && map[m[1]] !== undefined && map[m[1]] < options.length) {
      selectedOption = options[map[m[1]]];
    }
  } else if (/^(?:ok|yes|yep|correct|confirm|accept)$/i.test(trimmed)) {
    // User accepted the first/default option
    selectedOption = options[0] ?? userMessage;
  }

  // Build context from recent messages
  const contextParts = buf.slice(-4).map(e => `${e.role}: ${e.text}`).join('\n');
  const fullContext = `${contextParts}\nuser: ${userMessage}`.slice(0, 500);

  return {
    type: 'choice_made',
    agent_id: agentID,
    tenant_id: tenantID,
    session_key: sessionKey,
    timestamp: Date.now(),
    choice_text: selectedOption,
    rejected_options: options.filter(o => o !== selectedOption),
    context: fullContext,
    source: 'user_message',
  };
}

// Detect feedback in user message
function detectFeedback(
  sessionKey: string,
  agentID: string,
  tenantID: string,
  userMessage: string,
): FeedbackEvent | null {
  const feedbackType = detectFeedbackType(userMessage);
  if (!feedbackType) return null;

  // Try to extract memory_id from context (if user referenced a recalled memory)
  // For now, we emit the event without memory_id — hawk-memory will handle
  return {
    type: 'feedback',
    agent_id: agentID,
    tenant_id: tenantID,
    session_key: sessionKey,
    timestamp: Date.now(),
    feedback_type: feedbackType,
    feedback_text: userMessage,
    source: 'message',
  };
}

// Detect query submission in user message
function detectQuerySubmit(
  sessionKey: string,
  agentID: string,
  tenantID: string,
  userMessage: string,
): QuerySubmitEvent | null {
  if (!isQuery(userMessage) && classifyQueryType(userMessage) === 'other') {
    return null;
  }

  // Check if this follows a previous message from user (has clarification)
  const buf = getSessionBuffer(sessionKey);
  const hasClarification = buf.length > 0 && buf[buf.length - 1].role === 'user';

  return {
    type: 'query_submit',
    agent_id: agentID,
    tenant_id: tenantID,
    session_key: sessionKey,
    timestamp: Date.now(),
    query_text: userMessage,
    query_type: classifyQueryType(userMessage),
    has_clarification: hasClarification,
    source: 'user_message',
  };
}

// ─── Main Handler ───────────────────────────────────────────────────────────────

export async function handleMessageReceived(
  sessionKey: string,
  agentID: string,
  tenantID: string,
  userMessage: string,
): Promise<void> {
  // Always push user message to buffer first
  pushMessage(sessionKey, 'user', userMessage);

  const events: (ChoiceMadeEvent | FeedbackEvent | QuerySubmitEvent)[] = [];

  // Priority: choice > feedback > query
  const choice = await detectChoiceMade(sessionKey, agentID, tenantID, userMessage);
  if (choice) {
    events.push(choice);
  } else {
    const feedback = detectFeedback(sessionKey, agentID, tenantID, userMessage);
    if (feedback) {
      events.push(feedback);
    } else {
      const query = detectQuerySubmit(sessionKey, agentID, tenantID, userMessage);
      if (query) {
        events.push(query);
      }
    }
  }

  for (const event of events) {
    logger.info({ eventType: event.type, agent_id: agentID, sessionKey }, 'hawk-implicit: emitting event');
    await sendBehavioralEvent(event);
  }
}

export async function handleMessageSent(
  sessionKey: string,
  agentID: string,
  tenantID: string,
  agentMessage: string,
): Promise<void> {
  // Push agent message to buffer for context
  pushMessage(sessionKey, 'agent', agentMessage);
}

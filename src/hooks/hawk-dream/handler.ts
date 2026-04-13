// hawk-dream hook
// Triggered on: agent:heartbeat (periodic background consolidation)
// Action: Review recent memories, merge duplicates, update stale content, refresh context

import type { HookEvent } from '../../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { getMemoryStore } from '../../store/factory.js';
import type { MemoryStore } from '../../store/interface.js';
import { getConfig } from '../../config.js';
import { DRIFT_THRESHOLD_DAYS, DRIFT_REVERIFY_DAYS } from '../../constants.js';

// Dream state file (tracks last consolidation time)
const DREAM_STATE_FILE = path.join(
  process.env.HAWK_DIR || path.join(process.env.HOME || '~', '.hawk'),
  '.dream-state.json'
);

interface DreamState {
  lastDreamAt: number;         // timestamp of last consolidation
  lastDreamMemoryCount: number; // memory count at last consolidation
}

function readDreamState(): DreamState {
  try {
    if (fs.existsSync(DREAM_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(DREAM_STATE_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { lastDreamAt: 0, lastDreamMemoryCount: 0 };
}

function writeDreamState(state: DreamState): void {
  try {
    const dir = path.dirname(DREAM_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DREAM_STATE_FILE, JSON.stringify(state));
  } catch (e) {
    console.warn('[hawk-dream] Failed to write dream state:', e);
  }
}

// Dream configuration
const DREAM_CONFIG = {
  minHours: 24,             // hours since last dream
  minNewMemories: 5,        // minimum new memories to trigger consolidation
  maxMemoriesToProcess: 50, // max memories to review in one dream
  similarityThreshold: 0.75, // merge memories with similarity > this
  driftCheckReliability: 0.6, // re-verify memories with reliability > this (trust but verify)
};

// Drift verify queue — memories requiring forced re-verify after extended drift
const DRIFT_VERIFY_QUEUE = path.join(homedir(), '.hawk', 'drift-verify-queue.jsonl');

// ─── Consolidation Lock (prevents concurrent dream runs) ────────────────────
// Lock file: ~/.hawk/.consolidate-lock
// Contains: { pid, mtime, expiredAt }
// Expiry: 60 minutes (PID reuse protection — if holder process is dead, lock is stale)

const LOCK_FILE = path.join(
  process.env.HAWK_DIR || path.join(process.env.HOME || '~', '.hawk'),
  '.consolidate-lock'
);
const LOCK_TTL_MS = 60 * 60 * 1000; // 60 minutes

interface LockData {
  pid: number;
  mtime: number;
  expiredAt: number;
}

/**
 * Try to acquire the consolidation lock.
 * Returns prior mtime if lock was acquired (null if already held by live process).
 */
function tryAcquireConsolidationLock(): number | null {
  const now = Date.now();
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const data: LockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      // Check if lock is expired (TTL passed) or holder process is dead
      if (now < data.expiredAt) {
        try {
          // Check if holder process is still alive
          process.kill(data.pid, 0); // signal 0 = check existence
          // Process is alive, lock is held
          return null;
        } catch {
          // Process is dead — stale lock, can be reclaimed
        }
      }
    }
    // Write our lock
    const lockData: LockData = { pid: process.pid, mtime: now, expiredAt: now + LOCK_TTL_MS };
    const dir = path.dirname(LOCK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData));
    return now; // acquired
  } catch (e) {
    console.warn('[hawk-dream] lock acquire error:', e);
    return null;
  }
}

/**
 * Rollback the lock on failure (restore prior mtime if provided).
 */
function rollbackConsolidationLock(priorMtime: number | null): void {
  try {
    if (priorMtime === null) {
      // We wrote a fresh lock, remove it
      if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    }
    // If priorMtime was set, the lock file was already stale when we started — don't restore
  } catch (e) {
    console.warn('[hawk-dream] lock rollback error:', e);
  }
}

let lastDreamRun = 0;
const DREAM_INTERVAL_MS = 6 * 60 * 60 * 1000; // min 6h between dream runs

/**
 * After consolidation, check for memories with driftDetectedAt > 0 AND age > DRIFT_THRESHOLD_DAYS * 2.
 * Write them to ~/.hawk/drift-verify-queue.jsonl for forced re-verification.
 */
async function writeDriftVerifyQueue(db: any, now: number): Promise<void> {
  try {
    const allMemories = await db.getAllMemories();
    const activeMemories = allMemories.filter((m: any) => m.deletedAt === null);
    const ageThresholdMs = DRIFT_THRESHOLD_DAYS * 2 * 24 * 60 * 60 * 1000;

    // Load existing queue to avoid duplicates
    const existingIds = new Set<string>();
    try {
      if (fs.existsSync(DRIFT_VERIFY_QUEUE)) {
        const lines = fs.readFileSync(DRIFT_VERIFY_QUEUE, 'utf-8').trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try { existingIds.add(JSON.parse(line).memory_id); } catch { /* ignore */ }
        }
      }
    } catch { /* non-critical */ }

    const toVerify: Array<{ memory_id: string; text: string; detected_at: number }> = [];
    for (const m of activeMemories) {
      const driftDetectedAt = (m as any).driftDetectedAt || 0;
      if (driftDetectedAt > 0) {
        const ageMs = now - m.createdAt;
        if (ageMs > ageThresholdMs && !existingIds.has(m.id)) {
          toVerify.push({
            memory_id: m.id,
            text: m.text.slice(0, 200),
            detected_at: driftDetectedAt,
          });
        }
      }
    }

    if (toVerify.length > 0) {
      const dir = path.dirname(DRIFT_VERIFY_QUEUE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const lines = toVerify.map(item => JSON.stringify(item)).join('\n') + '\n';
      fs.appendFileSync(DRIFT_VERIFY_QUEUE, lines);
      console.log(`[hawk-dream] queued ${toVerify.length} memories for drift re-verify`);
    }
  } catch (e) {
    console.warn('[hawk-dream] drift verify queue error:', e);
  }
}

/**
 * Calculate text similarity (simple Jaccard + length normalized)
 */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;
  // Length penalty: similar length texts are more likely to be true duplicates
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return jaccard * 0.6 + lenRatio * 0.4;
}

/**
 * Build consolidation prompt for LLM
 */
function buildDreamPrompt(memories: Array<{ id: string; text: string; category: string; reliability: number }>): string {
  const memoryList = memories.map((m, i) =>
    `[${i + 1}] (reliability=${(m.reliability * 100).toFixed(0)}%, type=${m.category})\n    ${m.text}`
  ).join('\n\n');

  return `# Dream: Memory Consolidation

You are performing a dream consolidation — reviewing recent memories, merging duplicates, and refreshing stale content.

Memory pool:
${memoryList}

## Your tasks:

### 1. Find Duplicates
Identify memory pairs that describe the same fact. Merge them by keeping the more complete text and the higher reliability.

### 2. Detect Drift
For memories with reliability > 60%, check if the content still matches reality. If something changed (e.g., "user works at X" → user changed jobs), mark it as potentially stale.

### 3. Priority Flags
- HIGH: contradictions or significant updates detected
- MEDIUM: duplicate pair found, needs merge
- LOW: content is current, no action needed

## Output format:
Respond with a JSON object:
{
  "actions": [
    {
      "type": "merge" | "drift" | "confirm",
      "ids": ["memory_id_1", "memory_id_2"], // ids involved
      "newText": "...", // for merge/drift: new consolidated text
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "reason": "..."
    }
  ],
  "summary": "Brief summary of what was done"
}`;
}

/**
 * Extract JSON from LLM response
 */
function extractJson(text: string): any | null {
  // Try markdown code block first
  const codeMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeMatch) text = codeMatch[1];

  // Try raw JSON
  try {
    // Find first { and last }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(text.substring(start, end + 1));
    }
  } catch { /* ignore */ }
  return null;
}

const dreamHandler = async (event: HookEvent) => {
  if (event.type !== 'agent' || event.action !== 'heartbeat') return;

  const now = Date.now();
  if (now - lastDreamRun < DREAM_INTERVAL_MS) return;
  lastDreamRun = now;

  const state = readDreamState();
  const hoursSince = (now - state.lastDreamAt) / 3_600_000;

  if (hoursSince < DREAM_CONFIG.minHours) {
    console.log(`[hawk-dream] time gate not passed: ${hoursSince.toFixed(1)}h < ${DREAM_CONFIG.minHours}h`);
    return;
  }

  // ─── Consolidation Lock ───────────────────────────────────────────────
  const priorMtime = tryAcquireConsolidationLock();
  if (priorMtime === null) {
    console.log('[hawk-dream] consolidation already in progress by another process, skipping');
    return;
  }

  let lockHeld = true;
  try {
    await runDreamConsolidation(state, now);
  } finally {
    if (lockHeld) rollbackConsolidationLock(priorMtime);
  }
}

async function runDreamConsolidation(state: DreamState, now: number): Promise<void> {
  const db = await getMemoryStore() as any;
  await db.init();

  const allMemories = await db.getAllMemories();
  const activeMemories = allMemories.filter((m: any) => m.deletedAt === null);
  const newMemoriesSince = activeMemories.filter((m: any) =>
    state.lastDreamAt > 0 && m.createdAt > state.lastDreamAt
  );

  console.log(`[hawk-dream] ${newMemoriesSince.length} new memories since last dream, total active: ${activeMemories.length}`);

  if (newMemoriesSince.length < DREAM_CONFIG.minNewMemories) {
    console.log(`[hawk-dream] not enough new memories: ${newMemoriesSince.length} < ${DREAM_CONFIG.minNewMemories}`);
    return;
  }

    // Take most recent memories to review
    const toReview = [...activeMemories]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, DREAM_CONFIG.maxMemoriesToProcess);

    const memoryInputs = toReview.map(m => ({
      id: m.id,
      text: m.text,
      category: m.category,
      reliability: m.reliability,
    }));

    // Call LLM to consolidate
    const config = await getConfig();
    const prompt = buildDreamPrompt(memoryInputs);

    let actions: any[] = [];
    try {
      const response = await fetch(`${config.llm.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.llm.apiKey}`,
        },
        body: JSON.stringify({
          model: config.llm.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const content = data.choices?.[0]?.message?.content || '';
        const parsed = extractJson(content);
        if (parsed?.actions) {
          actions = parsed.actions;
        }
        console.log(`[hawk-dream] LLM returned ${actions.length} actions`);
      } else {
        console.warn(`[hawk-dream] LLM call failed: ${response.status}`);
      }
    } catch (e) {
      console.warn('[hawk-dream] LLM consolidation error:', e);
    }

    // Apply actions
    let merged = 0, drifted = 0, confirmed = 0;
    for (const action of actions) {
      if (action.type === 'merge' && action.ids?.length >= 2) {
        // Keep first id, update text, soft-delete others
        const [keepId, ...deleteIds] = action.ids;
        await db.update(keepId, { text: action.newText, updatedAt: now });
        for (const id of deleteIds) {
          await db.delete(id);
          merged++;
        }
      } else if (action.type === 'drift' && action.ids?.length >= 1) {
        // Mark as potentially stale, reduce reliability
        await db.update(action.ids[0], {
          text: action.newText || undefined,
          reliability: Math.max(0.3, (action.priority === 'HIGH' ? 0.4 : 0.5)),
          updatedAt: now,
        });
        drifted++;
      } else if (action.type === 'confirm') {
        // Refresh verification timestamp
        await db.update(action.ids?.[0], { lastVerifiedAt: now } as any);
        confirmed++;
      }
    }

    console.log(`[hawk-dream] done: merged=${merged}, drifted=${drifted}, confirmed=${confirmed}`);

    // ─── Drift timeout auto re-verify ──────────────────────────────────
    // After consolidation, check for memories with driftDetectedAt > 0 AND age > DRIFT_THRESHOLD_DAYS * 2
    // These are written to drift-verify-queue.jsonl for forced re-verification
    await writeDriftVerifyQueue(db, now);

  // Update state
  writeDreamState({
    lastDreamAt: now,
    lastDreamMemoryCount: activeMemories.length,
  });

  // Trigger auto-evolve inspect if enough new memories were consolidated
  if (newMemoriesSince.length >= DREAM_CONFIG.minNewMemories) {
    const autoEvolveScript = path.join(process.env.HAWK_DIR || path.join(process.env.HOME || '~', '.hawk'), '..', 'scripts', 'auto-evolve.py');
    console.log(`[hawk-dream] triggering auto-evolve inspect: ${newMemoriesSince.length} new memories >= ${DREAM_CONFIG.minNewMemories}`);
    spawn('python3', [autoEvolveScript, 'inspect', '--repo', '.'], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(process.env.HAWK_DIR || path.join(process.env.HOME || '~', '.hawk'), '..'),
    });
  }
}

// ─── Session Transcript Scanner (from Claude) ────────────────────────────────────
// Scans session transcript JSONL files for context relevant to recent memories.
// This挖掘 historical context that might inform drift detection.

function findRecentTranscriptFiles(sinceMs: number): string[] {
  const transcriptsDir = path.join(
    process.env.HAWK_DIR || path.join(process.env.HOME || '~', '.hawk'),
    'transcripts'
  );
  const files: string[] = [];
  try {
    if (!fs.existsSync(transcriptsDir)) return files;
    const entries = fs.readdirSync(transcriptsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const fullPath = path.join(transcriptsDir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > sinceMs) {
            files.push(fullPath);
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return files;
}

interface TranscriptHit {
  file: string;
  linePreview: string;
  relevanceScore: number;
}

/**
 * Grep a transcript file for narrow search terms relevant to a memory topic.
 * Returns top N hits with relevance scoring.
 */
function grepTranscript(
  filePath: string,
  searchTerms: string[],
  topN: number = 5
): TranscriptHit[] {
  const hits: TranscriptHit[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      let score = 0;
      for (const term of searchTerms) {
        if (lowerLine.includes(term.toLowerCase())) score++;
      }
      if (score > 0) {
        // Extract a preview (first 200 chars of the message content if JSON)
        let preview = line.slice(0, 200);
        try {
          const parsed = JSON.parse(line);
          if (parsed.content) preview = String(parsed.content).slice(0, 200);
        } catch { /* use raw */ }
        hits.push({ file: path.basename(filePath), linePreview: preview, relevanceScore: score });
      }
    }
  } catch { /* ignore */ }
  return hits
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topN);
}

/**
 * Get relevant transcript context for a list of search terms.
 * Used by the dream consolidation prompt to provide recent session context.
 */
export function getRecentTranscriptContext(
  searchTerms: string[],
  sinceMs: number,
  topN: number = 10
): string {
  const files = findRecentTranscriptFiles(sinceMs);
  if (!files.length) return '';
  const allHits: TranscriptHit[] = [];
  for (const file of files) {
    allHits.push(...grepTranscript(file, searchTerms, topN));
  }
  if (!allHits.length) return '';
  const grouped = allHits
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topN)
    .map(h => `[${h.file}] ${h.linePreview}`)
    .join('\n\n');
  return `\n\n## Recent Transcript Context\n${grouped}`;
}

export default dreamHandler;

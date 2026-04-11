// hawk-dream hook
// Triggered on: agent:heartbeat (periodic background consolidation)
// Action: Review recent memories, merge duplicates, update stale content, refresh context

import type { HookEvent } from '../../../../../../.npm-global/lib/node_modules/openclaw/dist/v10/types/hooks.js';
import * as fs from 'fs';
import * as path from 'path';
import { getMemoryStore } from '../../store/factory.js';
import type { MemoryStore } from '../../store/interface.js';
import { getConfig } from '../../config.js';

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

let lastDreamRun = 0;
const DREAM_INTERVAL_MS = 6 * 60 * 60 * 1000; // min 6h between dream runs

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

  try {
    const db = await getMemoryStore() as any;
    await db.init();

    const allMemories = await db.getAllMemories();
    const activeMemories = allMemories.filter(m => m.deletedAt === null);
    const newMemoriesSince = activeMemories.filter(m =>
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

    // Update state
    writeDreamState({
      lastDreamAt: now,
      lastDreamMemoryCount: activeMemories.length,
    });

  } catch (err) {
    console.error('[hawk-dream] Error:', err);
  }
};

export default dreamHandler;

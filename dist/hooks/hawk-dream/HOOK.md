# hawk-dream Hook

Periodic memory consolidation hook.

## Trigger
- agent:heartbeat (every 6h check, at least once per 6h)

## Actions
- Check time gate: >= 24h since last consolidation
- Check new memory count: >= 5 new memories since last run
- If both pass: call LLM to find duplicates, detect drift, confirm fresh memories
- Write consolidation state to ~/.hawk/.dream-state.json
- Lock file: ~/.hawk/.consolidate-lock (prevents concurrent dream runs)

## Environment Variables
- HAWK_DRIFT_THRESHOLD_DAYS: days before memory flagged as stale (default 7)
- HAWK_DREAM_MIN_HOURS: hours between dream runs (default 24)
- HAWK_DREAM_MIN_MEMORIES: minimum new memories to trigger (default 5)

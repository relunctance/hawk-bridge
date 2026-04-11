# hawk-decay Hook

**Trigger**: `agent:heartbeat` (every ~30 minutes)

**Purpose**: Background memory maintenance — importance decay, layer management, and purging forgotten memories.

## What it does

1. **Importance decay**: Memories that haven't been accessed for N days get their importance score reduced by `DECAY_RATE` per day
2. **Layer promotion/demotion**: Based on new importance + access count, memories move between working/short/long/archive layers
3. **Purge forgotten**: Permanently deletes memories that were soft-deleted more than `FORGET_GRACE_DAYS` (30 days) ago

## Rate limiting

Decay runs at most once every 6 hours (even if heartbeat fires more frequently).

## Manual trigger

```bash
node dist/hooks/hawk-decay/hawk-decay.js
```

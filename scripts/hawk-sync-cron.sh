#!/bin/bash
# hawk-sync-cron: 定期同步会话消息到 LanceDB
# 用法: hawk-sync-cron.sh

set -e

SESSIONS_JSON="$HOME/.openclaw/agents/main/sessions/sessions.json"
BOOKMARK_FILE="$HOME/.hawk/bookmark.json"
PYTHON_SCRIPT="$HOME/.openclaw/workspace/hawk-bridge/python/hawk_session_history.py"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$(dirname "$SCRIPT_DIR")/dist"

# Load bookmark
if [ -f "$BOOKMARK_FILE" ]; then
  LAST_TS=$(python3 -c "import json; d=json.load(open('$BOOKMARK_FILE')); print(d.get('lastTimestamp',''))" 2>/dev/null || echo "")
else
  LAST_TS=""
fi

# Find active session transcript
SESSION_FILE=$(python3 -c "
import json, sys
try:
    sessions = json.load(open('$SESSIONS_JSON'))
    for k, v in sessions.items():
        if k.startswith('agent:main'):
            print(v.get('sessionFile',''))
            break
except: pass
" 2>/dev/null || echo "")

if [ -z "$SESSION_FILE" ] || [ ! -f "$SESSION_FILE" ]; then
  echo "No active session transcript found"
  exit 0
fi

# Run Python extractor
RESULT=$(python3 "$PYTHON_SCRIPT" "$SESSION_FILE" 50 2>/dev/null)

# Check for errors or empty
if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(1 if (d.get('error') or not d.get('messages')) else 0)" 2>/dev/null; then
  echo "No new messages"
  exit 0
fi

# Get new messages (filter by timestamp if bookmark exists)
if [ -n "$LAST_TS" ]; then
  NEW_MSGS=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
msgs = d.get('messages', [])
new_msgs = [m for m in msgs if m.get('timestamp', '') > '$LAST_TS']
print(json.dumps(new_msgs))
" 2>/dev/null || echo "[]")
else
  NEW_MSGS=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(json.dumps(d.get('messages', [])))
" 2>/dev/null || echo "[]")
fi

if [ "$NEW_MSGS" = "[]" ] || [ -z "$NEW_MSGS" ]; then
  echo "No new messages after filtering"
  exit 0
fi

# Call the hawk-bridge CLI to store via Node.js
# We use a simple approach: spawn node with the store API
# For now, use the write CLI which accepts --text
COUNT=$(echo "$NEW_MSGS" | python3 -c "
import sys, json
msgs = json.load(sys.stdin)
count = 0
for m in msgs:
    text = m.get('text', '').strip()
    if len(text) < 30:
        continue
    print(f'{m.get(\"role\",\"?\")}:{text[:50]}')
    count += 1
print(f'Total: {count}')
" 2>/dev/null)

echo "New messages found:"
echo "$COUNT"

# Update bookmark with latest timestamp
LATEST_TS=$(echo "$NEW_MSGS" | python3 -c "
import sys, json
msgs = json.load(sys.stdin)
if msgs:
    print(msgs[-1].get('timestamp', ''))
" 2>/dev/null || echo "")

if [ -n "$LATEST_TS" ]; then
  python3 -c "
import json
d = {'lastTimestamp': '$LATEST_TS', 'lastRun': '$(date -Iseconds)'}
with open('$BOOKMARK_FILE', 'w') as f:
    json.dump(d, f, indent=2)
"
  echo "Bookmark updated: $LATEST_TS"
fi

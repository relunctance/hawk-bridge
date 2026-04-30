---
name: hawk-implicit
description: "Implicit Knowledge Capture — behavioral event collector (choice/feedback/query)"
homepage: https://github.com/relunctance/hawk-bridge
metadata:
  { "openclaw": { "emoji": "🧠", "events": ["message_received", "message_sent"], "requires": {} } }
---

# hawk-implicit Hook

Collects behavioral events from user/agent interactions for Implicit Knowledge Capture (PreferenceMiner).

Triggered on:
- **`message_received`**: user message → detect query_submit, feedback
- **`message_sent`**: agent response → detect choice options (followed by user's subsequent choice)

Action: detect patterns → POST to hawk-memory `/v1/implicit-knowledge/event`

⚠️ **OpenClaw Hook Event Format**: events use UNDERSCORE format in plugin registration:
- ✅ `message_received` (underscore)
- ❌ `message:received` (colon — will NOT match gateway hook check)

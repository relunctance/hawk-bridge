---
name: hawk-capture
description: "Auto-extract and store memories from user/agent messages"
homepage: https://github.com/relunctance/hawk-bridge
metadata:
  { "openclaw": { "emoji": "🦅", "events": ["message:sent", "message_received", "message:preprocessed", "session:compact:after"], "requires": {} } }
---

# hawk-capture

Triggered on:
- **`message:sent`**: after agent sends a response
- **`message_received`**: when user sends a message (⚠️ NOTE: use underscore format in openclaw.plugin.json, NOT colon)
- **`message:preprocessed`**: preprocessed message content
- **`session:compact:after`**: session compaction

Action: extract meaningful content (facts, code, URLs) from conversation → store in LanceDB via hawk-memory-api.

⚠️ **OpenClaw Hook Event Format**: events MUST use underscore format in plugin registration:
- ✅ `message_received` (underscore)
- ❌ `message:received` (colon — will NOT match gateway hook check)

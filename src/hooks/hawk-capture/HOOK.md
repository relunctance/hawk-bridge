---
name: hawk-capture
description: "Auto-extract and store memories after agent sends a message"
homepage: https://github.com/relunctance/hawk-bridge
metadata:
  { "openclaw": { "emoji": "🦅", "events": ["message:sent"], "requires": {} } }
---

# hawk-capture

Triggered on **`message:sent`**: after the agent sends a response, extract meaningful content (facts, code blocks, URLs) from the conversation and store in LanceDB.

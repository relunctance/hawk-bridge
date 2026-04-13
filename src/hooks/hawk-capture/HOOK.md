---
name: hawk-capture
description: "Auto-extract and store memories from both inbound user messages and outbound agent responses"
homepage: https://github.com/relunctance/hawk-bridge
metadata:
  { "openclaw": { "emoji": "🦅", "events": ["message:sent", "message:received"], "requires": {} } }
---

# hawk-capture

Auto-extract and store memories from both:
- **`message:received`**: inbound user messages → stored with `source_type: user-message`
- **`message:sent`**: outbound agent responses → stored with `source_type: hawk-capture`

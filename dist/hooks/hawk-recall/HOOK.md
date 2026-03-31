---
name: hawk-recall
description: "Inject relevant hawk memories before agent starts"
homepage: https://github.com/relunctance/hawk-bridge
metadata:
  { "openclaw": { "emoji": "🦅", "events": ["agent:bootstrap"], "requires": {} } }
---

# hawk-recall

Hybrid search (vector + BM25 + RRF + rerank + noise filter) → inject memories before agent bootstrap.

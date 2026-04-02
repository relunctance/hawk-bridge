"""
hawk_memory — thin wrapper that imports from context-hawk workspace

The canonical source is: ~/.openclaw/workspace/context-hawk/hawk/

This shim allows hawk-bridge's TypeScript hooks to call Python code
by importing from the context-hawk workspace copy.
"""

import sys, os

_CONTEXT_HAWK_PATHS = [
    os.path.expanduser("~/.openclaw/workspace/context-hawk/hawk"),
    os.path.expanduser("~/.openclaw/hawk"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "context-hawk", "hawk"),
    os.path.join(os.getcwd(), "context-hawk", "hawk"),
    # Skill installation path (openclaw skills install)
    os.path.join(os.path.expanduser("~/.openclaw"), "workspace", "skills", "hawk-bridge", "context-hawk", "hawk"),
    os.path.join(os.path.expanduser("~/.openclaw"), "workspace", "skills", "hawk-bridge", "python", "hawk_memory", "..", "..", "..", "context-hawk", "hawk"),
]

for _p in _CONTEXT_HAWK_PATHS:
    if os.path.exists(_p) and _p not in sys.path:
        sys.path.insert(0, os.path.dirname(_p))

try:
    from hawk.memory import MemoryManager
    from hawk.compressor import ContextCompressor
    from hawk.config import Config
    from hawk.self_improving import SelfImproving
    from hawk.vector_retriever import VectorRetriever, RetrievedChunk
    from hawk.markdown_importer import MarkdownImporter
    from hawk.governance import Governance
    from hawk.extractor import extract_memories

    __all__ = [
        "MemoryManager", "ContextCompressor", "Config", "SelfImproving",
        "VectorRetriever", "RetrievedChunk", "MarkdownImporter", "Governance", "extract_memories",
    ]
except ImportError as e:
    import sys
    print(f"[hawk_memory] Import failed: {e}", file=sys.stderr)
    raise

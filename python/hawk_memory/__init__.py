"""
hawk_memory — hawk-bridge Python core shim

This package re-exports from context-hawk for hawk-bridge plugin use.
The actual implementation lives in: /home/gql/.openclaw/workspace/context-hawk/hawk/

For standalone Python use, install context-hawk separately:
  pip install context-hawk

Or import directly from context-hawk:
  from hawk.memory import MemoryManager
"""

import sys
import os

# Add context-hawk to path if available
_context_hawk_path = os.path.expanduser("~/.openclaw/workspace/context-hawk/hawk")
if os.path.exists(_context_hawk_path) and _context_hawk_path not in sys.path:
    sys.path.insert(0, _context_hawk_path)

try:
    from hawk.memory import MemoryManager
    from hawk.compressor import ContextCompressor
    from hawk.config import Config
    from hawk.self_improving import SelfImproving
    from hawk.vector_retriever import VectorRetriever, RetrievedChunk
    from hawk.markdown_importer import MarkdownImporter
    from hawk.governance import Governance
    from hawk.extractor import extract_memories
    _FROM_CONTEXT_HAWK = True
except ImportError:
    # Fallback: import from local hawk_memory directory (legacy/bundled)
    from .memory import MemoryManager
    from .compressor import ContextCompressor
    from .config import Config
    from .self_improving import SelfImproving
    from .vector_retriever import VectorRetriever, RetrievedChunk
    from .markdown_importer import MarkdownImporter
    from .governance import Governance
    from .extractor import extract_memories
    _FROM_CONTEXT_HAWK = False

__all__ = [
    "MemoryManager",
    "ContextCompressor",
    "Config",
    "SelfImproving",
    "VectorRetriever",
    "RetrievedChunk",
    "MarkdownImporter",
    "Governance",
    "extract_memories",
]

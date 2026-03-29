# hawk_memory/__init__.py
# Python-side memory extraction for hawk-bridge
# Called by TS hook via subprocess

from .extractor import extract_memories

__all__ = ["extract_memories"]

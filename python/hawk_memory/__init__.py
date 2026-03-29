"""
hawk_memory — hawk-bridge Python Core
整合了 context-hawk 的核心模块：
- MemoryManager: 四层记忆 + Weibull衰减
- ContextCompressor: 上下文压缩
- Config: 配置管理
- SelfImproving: 自我反思学习
- VectorRetriever: 向量检索
- MarkdownImporter: Markdown导入
- Extractor: LLM记忆提取
- Governance: 治理指标
"""

from .memory import MemoryManager
from .compressor import ContextCompressor
from .config import Config
from .self_improving import SelfImproving
from .vector_retriever import VectorRetriever, RetrievedChunk
from .markdown_importer import MarkdownImporter
from .governance import Governance
from .extractor import extract_memories

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

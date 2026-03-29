"""
Memory extractor for hawk-bridge

Receives conversation text from TypeScript hook via stdin.
Outputs JSON array of extracted memories to stdout.

Usage (as subprocess):
  echo "conversation text" | python3.12 -m hawk_memory.extractor [--api-key KEY] [--model gpt-4o-mini]
"""

import sys
import json
import os
import argparse
from typing import TypedDict


class ExtractedMemory(TypedDict):
    text: str
    category: str  # fact | preference | decision | entity | other
    importance: float  # 0-1
    abstract: str  # L0: one sentence
    overview: str  # L1: structured summary


EXTRACTION_PROMPT = """你是一个记忆提取引擎。从以下对话内容中提取值得长期记忆的信息。

分类标准：
- fact: 客观事实、知识、数据
- preference: 用户偏好、习惯、风格
- decision: 用户做出的决定、选择、承诺
- entity: 用户提到的实体（人/公司/产品/项目）
- other: 其他值得记住的内容

输出要求：
- 只输出真正重要的信息，单条不超过200字
- 忽略寒暄、问候、确认类内容
- importance 0.0-1.0，表示这条记忆的重要程度
- abstract: 一句话概括（L0层）
- overview: 结构化摘要（L1层）

对话内容：
{conversation}

输出格式（JSON数组）：
[
  {{"text": "记忆内容", "category": "fact|preference|decision|entity|other", "importance": 0.0-1.0, "abstract": "一句话概括", "overview": "结构化摘要"}}
]

只输出JSON，不要其他文字："""


def extract_memories(conversation_text: str, api_key: str, model: str = "gpt-4o-mini") -> list[ExtractedMemory]:
    """使用OpenAI LLM从对话中提取记忆"""
    try:
        from openai import OpenAI
    except ImportError:
        print(json.dumps({"error": "openai not installed. Run: pip install openai"}), file=sys.stderr)
        sys.exit(1)

    if not api_key:
        print(json.dumps({"error": "OPENAI_API_KEY not provided"}), file=sys.stderr)
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    prompt = EXTRACTION_PROMPT.format(conversation=conversation_text)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "你是一个精确的记忆提取引擎。只输出JSON数组，不输出任何其他内容。"},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        max_tokens=2000,
    )

    content = response.choices[0].message.content.strip()

    # Strip markdown code blocks if present
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1])

    try:
        memories = json.loads(content)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON parse failed: {e}", "raw": content[:500]}), file=sys.stderr)
        sys.exit(1)

    # Validate and normalize
    valid_categories = {"fact", "preference", "decision", "entity", "other"}
    validated = []
    for m in memories:
        if not isinstance(m, dict) or "text" not in m:
            continue
        cat = m.get("category", "other")
        if cat not in valid_categories:
            cat = "other"
        validated.append({
            "text": m["text"][:500],  # Hard limit
            "category": cat,
            "importance": min(1.0, max(0.0, float(m.get("importance", 0.5)))),
            "abstract": m.get("abstract", "")[:100],
            "overview": m.get("overview", "")[:300],
        })

    return validated


def main():
    parser = argparse.ArgumentParser(description="hawk-bridge memory extractor")
    parser.add_argument("--api-key", default=os.environ.get("OPENAI_API_KEY", ""))
    parser.add_argument("--model", default="gpt-4o-mini")
    parser.add_argument("--conversation", default=None)  # If passed directly
    args = parser.parse_args()

    # Read from stdin if no --conversation
    if args.conversation:
        conversation = args.conversation
    else:
        conversation = sys.stdin.read()

    if not conversation.strip():
        print("[]")
        return

    try:
        memories = extract_memories(conversation, args.api_key, args.model)
        print(json.dumps(memories, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Reads recent messages from an OpenClaw session transcript (.jsonl).
Used by hawk-capture's session:compact:after handler to capture
AI replies that didn't trigger message:sent events.

Usage:
    python hawk_session_history.py <transcript_path> [max_messages]

Output: JSON array of {role, text, id, timestamp}
"""
import sys
import json
import os


def read_transcript_messages(transcript_path: str, max_messages: int = 20):
    """Read recent messages from a .jsonl transcript file."""
    if not os.path.exists(transcript_path):
        return {"error": f"Transcript not found: {transcript_path}", "messages": []}

    messages = []
    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if obj.get('type') == 'message':
                    msg = obj.get('message', {})
                    role = msg.get('role')
                    if role not in ('user', 'assistant'):
                        continue

                    # Extract text content
                    content = msg.get('content', [])
                    text_parts = []
                    if isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict):
                                if block.get('type') == 'text':
                                    text_parts.append(block.get('text', ''))
                                elif block.get('type') == 'thinking':
                                    # Skip thinking blocks - not useful for memory
                                    pass
                    elif isinstance(content, str):
                        text_parts.append(content)

                    text = '\n'.join(text_parts).strip()
                    if not text:
                        continue

                    messages.append({
                        'id': obj.get('id', ''),
                        'role': role,
                        'text': text[:5000],  # Truncate very long messages
                        'timestamp': obj.get('timestamp', ''),
                    })
    except Exception as e:
        return {"error": str(e), "messages": []}

    # Return most recent messages (last max_messages)
    recent = messages[-max_messages:] if len(messages) > max_messages else messages
    return {"messages": recent, "total": len(messages)}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python hawk_session_history.py <transcript_path> [max_messages]"}))
        sys.exit(1)

    path = sys.argv[1]
    max_msg = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    result = read_transcript_messages(path, max_msg)
    print(json.dumps(result, ensure_ascii=False))

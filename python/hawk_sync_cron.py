#!/usr/bin/env python3
"""
hawk-sync-cron: 定期同步会话消息到 LanceDB

每分钟运行一次，读取当前活跃 session 的 transcript，
将新的用户/助手消息通过 hawk-bridge CLI 存入 LanceDB。

用法: python3 hawk_sync_cron.py
"""
import sys
import os
import json
import subprocess
import re
from datetime import datetime

HOME = os.path.expanduser("~")
SESSIONS_JSON = os.path.join(HOME, ".openclaw", "agents", "main", "sessions", "sessions.json")
BOOKMARK_FILE = os.path.join(HOME, ".hawk", "bookmark.json")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)  # hawk-bridge root
HAWK_WRITE_CLI = os.path.join(ROOT_DIR, "dist", "cli", "write.js")


def log(msg):
    print(f"[hawk-sync] {msg}", flush=True)


def load_bookmark():
    try:
        if os.path.exists(BOOKMARK_FILE):
            with open(BOOKMARK_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {"lastTimestamp": None, "lastMsgId": None}


def save_bookmark(bookmark):
    try:
        os.makedirs(os.path.dirname(BOOKMARK_FILE), exist_ok=True)
        with open(BOOKMARK_FILE, "w") as f:
            json.dump(bookmark, f, indent=2)
    except Exception as e:
        log(f"Failed to save bookmark: {e}")


def find_active_transcript():
    """Find the current main session transcript path."""
    try:
        with open(SESSIONS_JSON) as f:
            sessions = json.load(f)
        for key, val in sessions.items():
            if key.startswith("agent:main"):
                return val.get("sessionFile")
    except Exception as e:
        log(f"Failed to read sessions.json: {e}")
    return None


def read_transcript_messages(transcript_path, max_messages=50):
    """Read recent messages from transcript .jsonl file."""
    if not os.path.exists(transcript_path):
        return []

    messages = []
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if obj.get("type") == "message":
                    msg = obj.get("message", {})
                    role = msg.get("role")
                    if role not in ("user", "assistant"):
                        continue

                    content = msg.get("content", [])
                    text_parts = []
                    if isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                text_parts.append(block.get("text", ""))
                    elif isinstance(content, str):
                        text_parts.append(content)

                    text = "\n".join(text_parts).strip()
                    if not text:
                        continue

                    messages.append({
                        "id": obj.get("id", ""),
                        "role": role,
                        "text": text[:5000],
                        "timestamp": obj.get("timestamp", ""),
                    })
    except Exception as e:
        log(f"Failed to read transcript: {e}")

    return messages[-max_messages:]


def is_low_value(text):
    """Check if message is low value and should be skipped."""
    if not text or len(text) < 30:
        return True
    if re.match(r"^[\d\s.,]+$", text):
        return True
    # Very short messages that are just a few emoji or punctuation
    if len(text) < 10 and not any(c.isalnum() for c in text):
        return True
    return False


def store_message(role, text):
    """Call hawk-bridge CLI to store a message."""
    source_type = "user-message" if role == "user" else "hawk-capture"
    # Truncate text for CLI
    short_text = text[:2000] if len(text) > 2000 else text
    cmd = [
        "node", HAWK_WRITE_CLI,
        "--text", short_text,
        "--category", "conversation",
        "--importance", "0.5",
        "--scope", "global",
        "--metadata", json.dumps({
            "capture_trigger": "cron_sync",
            "source_type": source_type,
            "original_role": role,
        })
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=ROOT_DIR,
        )
        return result.returncode == 0
    except Exception as e:
        log(f"Store failed: {e}")
        return False


def main():
    log("Starting sync")

    bookmark = load_bookmark()
    transcript_path = find_active_transcript()

    if not transcript_path:
        log("No active transcript found")
        return

    log(f"Reading transcript: {transcript_path}")
    messages = read_transcript_messages(transcript_path)

    if not messages:
        log("No messages in transcript")
        return

    # Filter by bookmark timestamp
    new_messages = messages
    if bookmark.get("lastTimestamp"):
        last_ts = bookmark["lastTimestamp"]
        new_messages = [m for m in messages if m["timestamp"] > last_ts]

    if not new_messages:
        log("No new messages since last run")
        return

    log(f"Found {len(new_messages)} new messages")

    stored = 0
    for msg in new_messages:
        text = msg["text"].strip()
        if is_low_value(text):
            continue

        role = msg["role"]
        if store_message(role, text):
            stored += 1

    if stored > 0:
        latest = new_messages[-1]
        save_bookmark({
            "lastTimestamp": latest["timestamp"],
            "lastMsgId": latest["id"],
            "lastRun": datetime.now().isoformat(),
        })
        log(f"Stored {stored} messages. Bookmark updated: {latest['timestamp']}")
    else:
        # Even if no messages were stored (low-value filtering),
        # advance the bookmark to avoid re-processing the same messages
        if new_messages:
            latest = new_messages[-1]
            save_bookmark({
                "lastTimestamp": latest["timestamp"],
                "lastMsgId": latest["id"],
                "lastRun": datetime.now().isoformat(),
                "filtered": stored,
            })
            log(f"Messages filtered (low-value). Bookmark advanced: {latest['timestamp']}")
        else:
            log("No new messages")


if __name__ == "__main__":
    main()

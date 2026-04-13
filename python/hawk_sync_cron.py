#!/usr/bin/env python3
"""
hawk-sync-cron: 定期同步会话消息到 LanceDB (v2)

每分钟运行一次，扫描所有 agent:main:* session transcript，
将新的用户/助手消息通过 hawk-bridge CLI 存入 LanceDB。

防重复机制：存储前先查 LanceDB，确认 session_msg_id 不存在再写。
"""
import sys
import os
import json
import subprocess
import re
import time
from datetime import datetime, timedelta

HOME = os.path.expanduser("~")
SESSIONS_JSON = os.path.join(HOME, ".openclaw", "agents", "main", "sessions", "sessions.json")
BOOKMARK_FILE = os.path.join(HOME, ".hawk", "bookmark.json")
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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
    return {"lastTimestamps": {}, "lastRun": None}


def save_bookmark(bookmark):
    try:
        os.makedirs(os.path.dirname(BOOKMARK_FILE), exist_ok=True)
        with open(BOOKMARK_FILE, "w") as f:
            json.dump(bookmark, f, indent=2)
    except Exception as e:
        log(f"Failed to save bookmark: {e}")


def find_active_sessions():
    """Find all active sessions that should be scanned."""
    try:
        with open(SESSIONS_JSON) as f:
            sessions = json.load(f)
        active = []
        now = time.time() * 1000  # ms
        for key, val in sessions.items():
            if not key.startswith("agent:main"):
                continue
            # Must have a session file
            if not val.get("sessionFile"):
                continue
            # Skip very old sessions (>24h old)
            updated = val.get("updatedAt", 0)
            if updated and (now - updated) > 24 * 3600 * 1000:
                continue
            active.append({
                "key": key,
                "sessionFile": val["sessionFile"],
                "updatedAt": updated,
            })
        return active
    except Exception as e:
        log(f"Failed to read sessions.json: {e}")
    return []


def read_transcript_messages(transcript_path, max_messages=100):
    """Read recent messages from a .jsonl transcript file."""
    if not os.path.exists(transcript_path):
        return []

    messages = []
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        # Read last max_messages lines
        recent_lines = lines[-max_messages:] if len(lines) > max_messages else lines

        for line in recent_lines:
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
        log(f"Failed to read transcript {transcript_path}: {e}")

    return messages


def is_low_value(text):
    """Check if message is low value and should be skipped."""
    if not text or len(text) < 30:
        return True
    if re.match(r"^[\d\s.,]+$", text):
        return True
    if len(text) < 10 and not any(c.isalnum() for c in text):
        return True
    return False


def get_existing_msg_ids(session_key_filter=None):
    """Query LanceDB for existing session_msg_id values to avoid duplicates."""
    try:
        import lancedb
        db = lancedb.connect(os.path.join(HOME, ".hawk", "lancedb"))
        tbl = db.open_table("hawk_memories")
        # Use head + to_pydict to get existing IDs
        data = tbl.head(10000)
        d = data.to_pydict()
        existing_ids = set()
        metadata_list = d.get("metadata", [])
        for meta_str in metadata_list:
            if not meta_str or not isinstance(meta_str, str):
                continue
            try:
                meta = json.loads(meta_str)
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(meta, dict) and meta.get("session_msg_id"):
                existing_ids.add(meta["session_msg_id"])
        return existing_ids
    except Exception as e:
        log(f"LanceDB query failed (skipping dedup): {e}")
        return set()


def get_env():
    """Build env dict with correct embedding config for local Xinference."""
    env = os.environ.copy()
    # Local Xinference embedding (no API key needed)
    env['OLLAMA_BASE_URL'] = 'http://localhost:9997/v1'
    env['OLLAMA_EMBED_MODEL'] = 'bge-m3'
    env['HAWK_EMBEDDING_DIM'] = '1024'
    # Deprecated but needed for backward compat
    env['HAWK__EMBEDDING__PROVIDER'] = 'ollama'
    return env


def store_message(role, text, session_key, msg_id, timestamp):
    """Call hawk-bridge CLI to store a message."""
    source_type = "user-message" if role == "user" else "hawk-capture"
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
            "session_msg_id": msg_id,
            "session_timestamp": timestamp,
            "session_key": session_key,
        })
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=ROOT_DIR,
            env=get_env(),
        )
        if result.returncode != 0:
            # Log first few failures for debugging
            stderr = result.stderr.strip()[:200]
            log(f"CLI error: {stderr}")
        return result.returncode == 0
    except Exception as e:
        log(f"Store failed: {e}")
        return False


def main():
    log("Starting sync")

    bookmark = load_bookmark()
    last_timestamps = bookmark.get("lastTimestamps", {})

    active_sessions = find_active_sessions()
    if not active_sessions:
        log("No active sessions found")
        return

    log(f"Found {len(active_sessions)} active sessions")

    # Get existing session_msg_ids for deduplication (one-time cost per run)
    existing_ids = get_existing_msg_ids()
    log(f"Existing records in LanceDB: {len(existing_ids)}")

    total_stored = 0

    for sess in active_sessions:
        session_key = sess["key"]
        transcript_path = sess["sessionFile"]
        last_ts = last_timestamps.get(session_key)

        messages = read_transcript_messages(transcript_path)
        if not messages:
            continue

        # Filter by bookmark timestamp
        if last_ts:
            new_messages = [m for m in messages if m["timestamp"] > last_ts]
        else:
            new_messages = messages

        if not new_messages:
            continue

        log(f"Session {session_key[:50]}...: {len(new_messages)} new messages")

        stored = 0
        skip_dup = 0
        skip_low = 0
        skip_fail = 0
        for msg in new_messages:
            text = msg["text"].strip()
            if is_low_value(text):
                skip_low += 1
                continue

            msg_id = msg["id"]
            # Deduplication check
            if msg_id in existing_ids:
                skip_dup += 1
                continue

            role = msg["role"]
            ok = store_message(role, text, session_key, msg_id, msg["timestamp"])
            if ok:
                stored += 1
                existing_ids.add(msg_id)
            else:
                skip_fail += 1

        log(f"  stored={stored}, skip_dup={skip_dup}, skip_low={skip_low}, fail={skip_fail}")

        if stored > 0:
            total_stored += stored
            # Update bookmark for this session
            latest = new_messages[-1]
            last_timestamps[session_key] = latest["timestamp"]

    if total_stored > 0:
        save_bookmark({
            "lastTimestamps": last_timestamps,
            "lastRun": datetime.now().isoformat(),
        })
        log(f"Stored {total_stored} messages. Bookmarks updated.")
    else:
        log("No new messages to store")


if __name__ == "__main__":
    main()

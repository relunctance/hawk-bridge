"""
handler.py — Hermes Hook Bridge for hawk-bridge

Triggered on:
  - agent:start  → recall memories from LanceDB, inject into context
  - agent:end    → capture conversation into LanceDB

Communication: HTTP API (hawk-memory-api FastAPI server)
"""

import os
import sys
import json
import time
import logging
import asyncio
import httpx
from pathlib import Path

# ─── Logging ───────────────────────────────────────────────────────────────────

logger = logging.getLogger("hooks.hawk-bridge-hermes")

# ─── Config ────────────────────────────────────────────────────────────────────

HAWK_API_BASE = os.environ.get("HAWK_API_BASE", "http://127.0.0.1:18360")
HAWK_API_TIMEOUT = float(os.environ.get("HAWK_API_TIMEOUT", "10.0"))
HAWK_INJECTION_LIMIT = int(os.environ.get("HAWK_INJECTION_LIMIT", "5"))
HAWK_INJECTION_MAX_CHARS = int(os.environ.get("HAWK_INJECTION_MAX_CHARS", "2000"))


# ─── HTTP Client ───────────────────────────────────────────────────────────────

_http_client: httpx.AsyncClient | None = None


async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            base_url=HAWK_API_BASE,
            timeout=HAWK_API_TIMEOUT,
        )
    return _http_client


# ─── Format helpers ────────────────────────────────────────────────────────────

def format_recall_results(memories: list, emoji: str = "🦅") -> str:
    """
    Format recalled memories for injection into the agent context.

    Format:
        🦅 ** hawk 记忆检索 **
        ✅ 85% [fact] 用户偏好：喜欢简洁回复 (来源: 2024-03-15)
        ⚠️ 72% [preference] 沟通风格：直接
    """
    if not memories:
        return ""

    lines = [f"{emoji} ** hawk 记忆检索 ({len(memories)}条) **"]
    for m in memories:
        reliability = m.get("reliability", 0.5)
        reliability_pct = int(reliability * 100)
        if reliability >= 0.7:
            icon = "✅"
        elif reliability >= 0.4:
            icon = "⚠️"
        else:
            icon = "❌"

        category = m.get("category", "other")
        text = m.get("text", "")
        created = m.get("created_at", 0)
        if created:
            date_str = time.strftime("%Y-%m-%d", time.localtime(created / 1000))
        else:
            date_str = "unknown"

        lines.append(
            f"{icon} {reliability_pct}% [{category}] {text} (来源: {date_str})"
        )

    return "\n".join(lines)


# ─── agent:start handler ────────────────────────────────────────────────────────

async def handle_agent_start(context: dict) -> None:
    """
    Called on agent:start.
    Action: recall memories from hawk-memory-api and inject into context dict.

    The gateway reads context["_hawk_recall"] after all hooks run and appends
    the value to the context_prompt fed to the agent.

    context keys (from Hermes HookRegistry):
        - platform: str        (e.g. "feishu")
        - user_id: str
        - session_id: str
        - message: str         (user's message, first 500 chars)

    Modifies:
        - context["_hawk_recall"]: str | None  — formatted recall string
    """
    session_id = context.get("session_id", "")
    user_id = context.get("user_id", "")
    message = context.get("message", "")

    if not session_id and not user_id:
        return

    try:
        client = await get_http_client()
        query = message or f"session {session_id}"

        resp = await client.post(
            "/recall",
            json={
                "query": query,
                "session_id": session_id,
                "user_id": user_id,
                "top_k": HAWK_INJECTION_LIMIT,
                "min_score": 0.3,
            },
        )

        if resp.status_code != 200:
            logger.warning(f"hawk-bridge recall API error: {resp.status_code} {resp.text}")
            return

        data = resp.json()
        memories = data.get("memories", [])

        if not memories:
            return

        formatted = format_recall_results(memories)

        # Truncate if too long
        if len(formatted) > HAWK_INJECTION_MAX_CHARS:
            formatted = formatted[:HAWK_INJECTION_MAX_CHARS] + "\n... (记忆过多，已截断)"

        # Inject directly into context dict — gateway reads context["_hawk_recall"]
        context["_hawk_recall"] = "\n" + formatted + "\n"

    except httpx.TimeoutException:
        logger.warning("hawk-bridge recall timeout")
    except Exception as e:
        logger.warning(f"hawk-bridge recall error: {e}")


# ─── agent:end handler ─────────────────────────────────────────────────────────

async def handle_agent_end(context: dict) -> None:
    """
    Called on agent:end.
    Action: capture the conversation into hawk-memory-api (LanceDB).

    context keys (from Hermes HookRegistry):
        - platform: str        (e.g. "feishu")
        - user_id: str
        - session_id: str
        - message: str         (user's message)
        - response: str        (agent's response)
    """
    session_id = context.get("session_id", "")
    user_id = context.get("user_id", "")
    message = context.get("message", "")
    response = context.get("response", "")

    if not session_id and not user_id:
        return
    if not message and not response:
        return

    try:
        client = await get_http_client()

        await client.post(
            "/capture",
            json={
                "session_id": session_id,
                "user_id": user_id,
                "message": message,
                "response": response,
                "platform": context.get("platform", "hermes"),
            },
        )

    except httpx.TimeoutException:
        logger.warning("hawk-bridge capture timeout")
    except Exception as e:
        logger.warning(f"hawk-bridge capture error: {e}")


# ─── Main handler (called by Hermes HookRegistry) ───────────────────────────────

async def handle(event_type: str, context: dict) -> None:
    """
    Hermes HookRegistry entry point.
    event_type: "agent:start" or "agent:end"
    context: dict with keys described above

    For agent:start: writes formatted recall string into context["_hawk_recall"]
    For agent:end: side-effect only (capture to hawk-memory-api)
    """
    if event_type == "agent:start":
        await handle_agent_start(context)
    elif event_type == "agent:end":
        await handle_agent_end(context)


# ─── Sync wrapper (for compatibility with HookRegistry that may call sync fns) ─

def handle_sync(event_type: str, context: dict) -> None:
    """Synchronous wrapper — runs the async handler in a new event loop."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If loop is already running, create a new task
            asyncio.create_task(_run_async(event_type, context))
        else:
            loop.run_until_complete(_run_async(event_type, context))
    except RuntimeError:
        asyncio.run(_run_async(event_type, context))


async def _run_async(event_type: str, context: dict) -> str | None:
    return await handle(event_type, context)

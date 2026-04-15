#!/usr/bin/env python3
"""
Fix zero vectors in hawk-bridge LanceDB by re-embedding the text content.

Usage:
    python3 scripts/fix_zero_vectors.py [--dry-run]

Steps:
    1. Find all memories with zero vectors (all elements == 0.0)
    2. For each, fetch text from LanceDB
    3. Re-embed using xinference (bge-m3, localhost:9997, no auth)
    4. Update the LanceDB record with the new vector
"""

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

import lancedb
import tqdm

try:
    import httpx
except ImportError:
    httpx = None


def get_embedding_config() -> dict:
    """Load embedding config from environment variables."""
    # xinference local server (no auth)
    base_url = os.environ.get("EMBEDDING_BASE_URL", "http://localhost:9997")
    model = os.environ.get("EMBEDDING_MODEL", "bge-m3")
    api_key = os.environ.get("MINIMAX_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    return {"api_key": api_key, "base_url": base_url, "model": model}


def embed_texts(texts: list[str], config: dict) -> list[list[float]]:
    """Embed texts via xinference (local server, no auth required)."""
    if httpx is None:
        raise RuntimeError("httpx not installed: pip install httpx")

    base_url = config.get("base_url", "http://localhost:9997")
    model = config.get("model", "bge-m3").lower()
    url = f"{base_url}/v1/embeddings"

    headers = {}
    if config.get("api_key"):
        headers["Authorization"] = f"Bearer {config['api_key']}"

    payload = {"model": model, "input": texts}
    resp = httpx.post(url, json=payload, headers=headers, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return [item["embedding"] for item in data["data"]]


def find_zero_vector_ids(db_path: str) -> list[str]:
    """Find all memory IDs with zero vectors."""
    db = lancedb.connect(db_path)
    tbl = db.open_table("hawk_memories")
    data = tbl.to_arrow()
    vectors = data["vector"].to_pylist()
    ids = data["id"].to_pylist()
    return [mid for mid, vec in zip(ids, vectors) if all(x == 0.0 for x in vec)]


async def fix_zero_vectors(db_path: str, dry_run: bool = True):
    """Re-embed memories with zero vectors."""
    config = get_embedding_config()
    print(f"Config: model={config['model']}, base_url={config['base_url']}")

    zero_ids = find_zero_vector_ids(db_path)
    print(f"Found {len(zero_ids)} zero-vector memories")

    if not zero_ids:
        print("No zero vectors to fix.")
        return

    if dry_run:
        print(f"[DRY RUN] Would re-embed {len(zero_ids)} memories:")
        for mid in zero_ids[:10]:
            print(f"  - {mid}")
        if len(zero_ids) > 10:
            print(f"  ... and {len(zero_ids) - 10} more")
        return

    # Connect and load zero-vector records
    db = lancedb.connect(db_path)
    tbl = db.open_table("hawk_memories")

    # Fetch records
    records = []
    for mid in tqdm.tqdm(zero_ids, desc="Fetching records"):
        result = tbl.search().where(f"id = '{mid}'").limit(1).to_list()
        if result:
            records.append(result[0])

    print(f"Fetched {len(records)} records")

    # Batch re-embed
    batch_size = 20
    all_texts = [r["text"][:8000] for r in records]
    all_vectors = []

    for i in tqdm.tqdm(range(0, len(all_texts), batch_size), desc="Re-embedding"):
        batch = all_texts[i : i + batch_size]
        try:
            vectors = embed_texts(batch, config)
            all_vectors.extend(vectors)
        except Exception as e:
            print(f"\nBatch {i // batch_size} failed: {e}, retrying one by one")
            for text in batch:
                try:
                    vec = embed_texts([text], config)
                    all_vectors.append(vec[0])
                except Exception as e2:
                    print(f"  Single embed failed: {e2}")
                    # Fallback: leave as zero vector
                    all_vectors.append([0.0] * 1024)

    # Update LanceDB
    print("Updating LanceDB...")
    now_ms = int(time.time() * 1000)
    for record, new_vec in zip(records, all_vectors):
        result = tbl.update(
            where=f"id = '{record['id']}'",
            values={"vector": new_vec, "updated_at": now_ms}
        )
        if result.rows_updated != 1:
            print(f"  WARNING: updated {result.rows_updated} rows for {record['id']}")

    print(f"Fixed {len(records)} zero-vector memories")

    # Verify
    remaining = find_zero_vector_ids(db_path)
    print(f"Verification: {len(remaining)} zero vectors remain")


def main():
    parser = argparse.ArgumentParser(description="Fix zero vectors in hawk-bridge")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fixed")
    parser.add_argument("--db-path", default=None, help="LanceDB path (default: ~/.hawk/lancedb/)")
    args = parser.parse_args()

    db_path = args.db_path or str(Path.home() / ".hawk" / "lancedb")
    asyncio.run(fix_zero_vectors(db_path, dry_run=args.dry_run))


if __name__ == "__main__":
    main()

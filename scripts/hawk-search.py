#!/usr/bin/env python3
"""
hawk-search - Semantic search in hawk-bridge LanceDB
Usage: hawk-search.py "query text" [top_k] [table_name] [db_path]

Requires:
  - requests
  - LanceDB
  - Ollama or Xinference running

Environment:
  OLLAMA_BASE_URL  (default: http://localhost:9997/v1)
  OLLAMA_EMBED_MODEL (default: bge-m3)
"""
import sys
import os
import json
import math
import requests

DEFAULT_DB = "/home/gql/.hawk/lancedb"
DEFAULT_TABLE = "hawk_memories"
DEFAULT_TOP_K = 5

def get_embedding(texts, base_url=None, model=None):
    """Get embeddings from Ollama/Xinference."""
    base_url = base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:9997/v1")
    model = model or os.environ.get("OLLAMA_EMBED_MODEL", "bge-m3")

    url = f"{base_url.rstrip('/')}/embeddings"
    resp = requests.post(url, json={"model": model, "input": texts}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict) and "data" in data:
        return [item["embedding"] for item in data["data"]]
    elif isinstance(data, list):
        return [item["embedding"] for item in data]
    return []

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    query = sys.argv[1]
    top_k = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_TOP_K
    table_name = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_TABLE
    db_path = sys.argv[4] if len(sys.argv) > 4 else DEFAULT_DB

    try:
        import lancedb
    except ImportError:
        print("错误: 需要安装 lancedb 库 (pip install lancedb)", file=sys.stderr)
        sys.exit(1)

    try:
        # Get query embedding
        print(f"🔍 查询: {query}\n")
        query_vec = get_embedding([query])[0]

        # Load table and search with vector
        db = lancedb.connect(db_path)
        table = db.open_table(table_name)

        # Use LanceDB's native vector search
        results = table.search(query_vec).limit(top_k).to_arrow().to_pydict()

        n = len(next(iter(results.values())))
        print(f"📊 搜索结果 (top {n}):\n")

        for i in range(n):
            row = {k: results[k][i] for k in results}
            text = str(row.get("text", ""))[:120]
            cat = row.get("category", "-")
            rel = row.get("reliability", 0)
            distance = row.get("_distance", 0)
            created = row.get("created_at", "-")
            if isinstance(created, (int, float)) and created > 0:
                from datetime import datetime
                dt = datetime.fromtimestamp(created / 1000 if created > 1e10 else created)
                created = dt.strftime('%Y-%m-%d')
            print(f"{i+1}. [distance={distance:.4f}] {cat} | rel={rel}")
            print(f"   {text}")
            print(f"   创建: {created}")
            print()

    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

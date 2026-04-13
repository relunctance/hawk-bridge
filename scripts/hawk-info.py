#!/usr/bin/env python3
"""
hawk-info - Show overview of hawk-bridge LanceDB database
Usage: hawk-info.py [db_path]
"""
import sys
import lancedb
import os

DEFAULT_DB = "/home/gql/.hawk/lancedb"

def format_bytes(n):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if abs(n) < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"

def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB

    if not os.path.exists(db_path):
        print(f"数据库不存在: {db_path}", file=sys.stderr)
        sys.exit(1)

    db_size = 0
    for root, dirs, files in os.walk(db_path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                db_size += os.path.getsize(fp)
            except:
                pass

    print(f"📁 数据库目录: {db_path}")
    print(f"💾 占用空间: {format_bytes(db_size)}")
    print()

    db = lancedb.connect(db_path)
    response = db.list_tables()
    tables = response.tables if hasattr(response, "tables") else list(response)
    print(f"📊 表数量: {len(tables)}\n")

    total_records = 0

    for name in tables:
        t = db.open_table(name)
        count = t.count_rows()
        total_records += count

        # Get vector dimension from schema
        schema = t.schema
        vector_dim = "?"
        for field in schema:
            if 'vector' in field.name.lower():
                vt = str(field.type)
                if 'FixedSizeList' in vt:
                    import re
                    m = re.search(r'<item: float>\[(\d+)\]', vt)
                    if m:
                        vector_dim = m.group(1)
                break

        print(f"  📋 {name}")
        print(f"     记录数: {count:,}  向量维度: {vector_dim}")

        # Sample categories if hawk_memories
        if name == "hawk_memories":
            try:
                rows = t.head(min(1000, count)).to_pydict()
                categories = {}
                n = len(next(iter(rows.values())))
                for i in range(n):
                    cat = rows.get("category", ["unknown"])[i]
                    categories[cat] = categories.get(cat, 0) + 1
                if categories:
                    top_cats = sorted(categories.items(), key=lambda x: -x[1])[:5]
                    cats_str = "  ".join(f"{k}({v})" for k, v in top_cats)
                    print(f"     分类分布: {cats_str}")
            except:
                pass

        # Last updated approximation
        try:
            last_rows = t.head(1).to_pydict()
            if last_rows:
                last = last_rows.get("updated_at", [0])[0] or last_rows.get("created_at", [0])[0]
                if last:
                    from datetime import datetime
                    dt = datetime.fromtimestamp(last / 1000 if last > 1e10 else last)
                    print(f"     最新记录: {dt.strftime('%Y-%m-%d %H:%M')}")
        except:
            pass

        print()

    print(f"  总计: {total_records:,} 条记录")

    # Check for backup files
    hawk_dir = os.path.dirname(db_path.rstrip('/'))
    backups = [f for f in os.listdir(hawk_dir) if 'backup' in f or 'bak' in f]
    if backups:
        print(f"\n⚠️  发现备份文件: {', '.join(backups)}")

    # Check for learnings
    learnings = os.path.join(hawk_dir, "learnings.json")
    if os.path.exists(learnings):
        size = os.path.getsize(learnings)
        print(f"📄 learnings.json: {format_bytes(size)}")

if __name__ == "__main__":
    main()

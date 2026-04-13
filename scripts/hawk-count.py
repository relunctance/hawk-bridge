#!/usr/bin/env python3
"""
hawk-count - Count records in LanceDB tables
Usage: hawk-count.py [db_path]
"""
import sys
import lancedb

DEFAULT_DB = "/home/gql/.hawk/lancedb"

def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB

    try:
        db = lancedb.connect(db_path)
        response = db.list_tables()
        tables = response.tables if hasattr(response, "tables") else list(response)

        total_all = 0
        print(f"数据库: {db_path}\n")
        print(f"  {'表名':<30} {'记录数':>10}")
        print(f"  {'-'*30} {'-'*10}")

        for name in tables:
            t = db.open_table(name)
            count = t.count_rows()
            total_all += count
            print(f"  {name:<30} {count:>10,}")

        print(f"  {'-'*30} {'-'*10}")
        print(f"  {'总计':<30} {total_all:>10,}")

    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

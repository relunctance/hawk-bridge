#!/usr/bin/env python3
"""
hawk-ls - List all LanceDB tables
Usage: hawk-ls.py [db_path]
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
        print(f"数据库: {db_path}")
        print(f"表数量: {len(tables)}")
        print()
        for i, name in enumerate(tables, 1):
            t = db.open_table(name)
            count = t.count_rows()
            print(f"  {i}. {name}  ({count} 条记录)")
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

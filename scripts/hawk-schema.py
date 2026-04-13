#!/usr/bin/env python3
"""
hawk-schema - Show schema of a LanceDB table
Usage: hawk-schema.py [table_name] [db_path]
"""
import sys
import lancedb

DEFAULT_DB = "/home/gql/.hawk/lancedb"
DEFAULT_TABLE = "hawk_memories"

def main():
    db_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_DB
    table_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TABLE

    try:
        db = lancedb.connect(db_path)
        table = db.open_table(table_name)
        schema = table.schema

        print(f"表: {table_name}")
        print(f"记录数: {table.count_rows()}")
        print(f"\n字段列表 ({len(schema)} 个):\n")
        print(f"  {'字段名':<30} {'类型':<20} {'nullable'}")
        print(f"  {'-'*30} {'-'*20} {'-'*9}")

        for field in schema:
            nullability = "✓" if not field.nullable else "✗"
            print(f"  {field.name:<30} {str(field.type):<20} {nullability}")

    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

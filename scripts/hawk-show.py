#!/usr/bin/env python3
"""
hawk-sample - Show sample records from a LanceDB table
Usage: hawk-sample.py [table_name] [limit] [db_path]
"""
import sys
import lancedb

DEFAULT_DB = "/home/gql/.hawk/lancedb"
DEFAULT_TABLE = "hawk_memories"
DEFAULT_LIMIT = 10

def pyarrow_to_dicts(table):
    """Convert PyArrow Table to list of dicts."""
    cols = table.to_pydict()
    n = len(next(iter(cols.values())))
    return [dict(zip(cols.keys(), (cols[k][i] for k in cols))) for i in range(n)]

def main():
    db_path = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_DB
    table_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TABLE
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_LIMIT

    try:
        db = lancedb.connect(db_path)
        table = db.open_table(table_name)
        total = table.count_rows()
        rows = pyarrow_to_dicts(table.head(limit))

        print(f"表: {table_name}  (共 {total} 条)")
        print(f"显示前 {len(rows)} 条:\n")

        for i, row in enumerate(rows, 1):
            print(f"── 记录 {i} ──")
            for key in ['id', 'name', 'category', 'text', 'importance', 'reliability',
                         'created_at', 'updated_at', 'access_count', 'verification_count',
                         'last_used_at', 'source']:
                if key in row and row[key] is not None:
                    val = row[key]
                    if key == 'text' and len(str(val)) > 100:
                        val = str(val)[:100] + "..."
                    elif isinstance(val, float):
                        val = round(val, 4)
                    print(f"  {key}: {val}")
            print()
        print(f"表: {table_name}  (共 {total} 条)")
        print(f"显示前 {len(rows)} 条:\n")

    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

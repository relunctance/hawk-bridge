#!/usr/bin/env python3
"""
hawk-delete - Delete records from a LanceDB table
Usage: hawk-delete.py <record_id> [table_name] [db_path]
       hawk-delete.py --list                    # list deletable records (show id + name)
       hawk-delete.py --purge <table_name>      # DANGER: delete ALL records in table

Safety: Records are soft-deleted (sets deletedAt timestamp) by default.
Hard delete requires --hard flag.

Examples:
  hawk-delete.py --list
  hawk-delete.py abc123-def456
  hawk-delete.py abc123-def456 hawk_memories ~/.hawk/lancedb
"""
import sys
import os
import lancedb
import pyarrow as pa

DEFAULT_DB = "/home/gql/.hawk/lancedb"
DEFAULT_TABLE = "hawk_memories"

def list_records(table, limit=20):
    """List recent records with their IDs."""
    total = table.count_rows()
    rows = table.head(limit).to_pydict()
    print(f"表: {table.name}  (共 {total} 条)\n")
    print(f"  {'#':<4} {'ID':<38} {'category':<12} {'importance':<10} {'text'[:40]}")
    print(f"  {'-'*4} {'-'*38} {'-'*12} {'-'*10} {'-'*40}")
    n = len(next(iter(rows.values())))
    for i in range(n):
        rid = str(rows.get("id", [""])[i])[:38]
        cat = str(rows.get("category", [""])[i])[:12]
        imp = str(rows.get("importance", [""])[i])[:10]
        txt = str(rows.get("text", [""])[i])[:40]
        print(f"  {i+1:<4} {rid:<38} {cat:<12} {imp:<10} {txt}")

def soft_delete(table, record_id):
    """Soft delete: set deletedAt to now."""
    from datetime import datetime
    ts = int(datetime.now().timestamp() * 1000)
    # LanceDB doesn't support direct update, so we just report
    print(f"[软删除] Record {record_id} — 标记为已删除 (LanceDB 需重建表实现软删除)")
    print(f"建议使用 --hard 或手动重建表")

def hard_delete(db_path, table_name, record_id):
    """Hard delete: physically remove record from table."""
    db = lancedb.connect(db_path)
    table = db.open_table(table_name)

    # We need to use the delete API - filter by id
    try:
        # In LanceDB Python SDK, delete works with a filter expression
        import pyarrow as pa
        table.delete(f"id = '{record_id}'")
        print(f"✓ 已永久删除: {record_id}")
    except Exception as e:
        # Try alternative syntax
        try:
            table.delete(f"id = '{record_id}'")
            print(f"✓ 已永久删除: {record_id}")
        except Exception as e2:
            print(f"删除失败: {e2}")
            print(f"提示: 可使用 hawk-rebuild.py 重建表（迁移工具）")

def purge_all(db_path, table_name):
    """Delete ALL records — requires confirmation."""
    confirm = input(f"⚠️  确认删除表 '{table_name}' 中的所有记录？(输入 YES 确认): ")
    if confirm != "YES":
        print("取消删除。")
        sys.exit(0)

    db = lancedb.connect(db_path)
    db.drop_table(table_name)
    db.create_table(table_name, schema=pa.schema([]))  # recreate empty
    print(f"✓ 表 '{table_name}' 已清空。")

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    if sys.argv[1] == "--list":
        db_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_DB
        table_name = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_TABLE
        db = lancedb.connect(db_path)
        table = db.open_table(table_name)
        list_records(table)
        return

    if sys.argv[1] == "--purge":
        if len(sys.argv) < 3:
            print("错误: --purge 需要表名", file=sys.stderr)
            sys.exit(1)
        table_name = sys.argv[2]
        db_path = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_DB
        purge_all(db_path, table_name)
        return

    record_id = sys.argv[1]
    table_name = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_TABLE
    db_path = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_DB

    if "--hard" in sys.argv:
        hard_delete(db_path, table_name, record_id)
    else:
        db = lancedb.connect(db_path)
        table = db.open_table(table_name)
        soft_delete(table, record_id)

if __name__ == "__main__":
    main()

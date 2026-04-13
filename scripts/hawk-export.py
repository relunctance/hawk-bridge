#!/usr/bin/env python3
"""
hawk-export - Export all records from a table to JSON
Usage: hawk-export.py [table_name] [output_file] [db_path]

Examples:
  hawk-export.py                                    # export hawk_memories to stdout
  hawk-export.py hawk_memories /tmp/export.json   # export to file
  hawk-export.py hawk_memories -  ~/.hawk/lancedb # export to stdout
"""
import sys
import json
import lancedb

DEFAULT_DB = "/home/gql/.hawk/lancedb"
DEFAULT_TABLE = "hawk_memories"

def main():
    argc = len(sys.argv)

    # Parse args: [table] [output] [db_path]
    if argc >= 4:
        table_name, output_file, db_path = sys.argv[1], sys.argv[2], sys.argv[3]
    elif argc >= 3:
        if sys.argv[2].startswith('/') or sys.argv[2] == '-':
            table_name, output_file, db_path = sys.argv[1], sys.argv[2], DEFAULT_DB
        else:
            table_name, output_file, db_path = DEFAULT_TABLE, sys.argv[1], sys.argv[2]
    elif argc >= 2:
        if sys.argv[1].startswith('/'):
            table_name, output_file, db_path = DEFAULT_TABLE, sys.argv[1], DEFAULT_DB
        else:
            table_name, output_file, db_path = sys.argv[1], "-", DEFAULT_DB
    else:
        table_name, output_file, db_path = DEFAULT_TABLE, "-", DEFAULT_DB

    try:
        db = lancedb.connect(db_path)
        table = db.open_table(table_name)
        total = table.count_rows()

        # head() returns PyArrow Table
        arrow_table = table.head(total)
        col_dict = arrow_table.to_pydict()
        n = len(next(iter(col_dict.values())))

        records = []
        for i in range(n):
            d = {k: col_dict[k][i] for k in col_dict}
            # Convert numpy types
            for k, v in d.items():
                if hasattr(v, 'item'):
                    d[k] = v.item()
                elif hasattr(v, 'tolist'):
                    d[k] = v.tolist()
            records.append(d)

        output = {
            "table": table_name,
            "count": len(records),
            "records": records
        }

        json_str = json.dumps(output, ensure_ascii=False, indent=2)

        if output_file == "-":
            print(json_str)
        else:
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(json_str)
            print(f"导出完成: {table_name} → {output_file}  ({len(records)} 条记录)")

    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

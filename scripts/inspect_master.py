#!/usr/bin/env python3
"""Inspect july_master.xlsx sheets to reverse-engineer the SKU model."""
import openpyxl, sys

SRC = "/home/ubuntu/july_master.xlsx"
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)

def dump_sheet(name, max_rows=18, max_cols=30):
    ws = wb[name]
    print("=" * 90)
    print(f"SHEET: {name}  (dims={ws.calculate_dimension(force=True)})")
    print("-" * 90)
    n = 0
    for r in ws.iter_rows(values_only=True):
        if n >= max_rows:
            print("... (more rows)")
            break
        vals = list(r)[:max_cols]
        # trim trailing None
        while vals and vals[-1] is None:
            vals.pop()
        print(n, vals)
        n += 1

for s in sys.argv[1:]:
    dump_sheet(s)
wb.close()

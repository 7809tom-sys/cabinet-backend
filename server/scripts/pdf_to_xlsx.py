#!/usr/bin/env python3
"""
PDF pricing sheet → XLSX converter for Cabinet Dealz.

Usage:
  python3 pdf_to_xlsx.py <input.pdf> <output.xlsx>

Handles the US Cabinet Depot / Capital Collection format:
  - Col 0: Cabinet (SKU)
  - Col 1: Weight (lbs)
  - Col 2+: Price columns with multi-style headers like
            "Shaker White (SW)\nShaker Antique White (SA)\nShaker Dove (SD)"

Output XLSX columns:
  SKU | Weight | Category | <one column per style code> ...

Category is inferred from section-header rows that appear above data rows.
"""

import sys
import re
import pdfplumber
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

# ── helpers ────────────────────────────────────────────────────────────────────

# Strip footnote markers and whitespace from a cell value
FOOTNOTE_RE = re.compile(r'[\*†‡§¶]+')
PRICE_RE = re.compile(r'[\$,]')

def clean_price(val: str) -> str:
    """Strip $ and commas, return numeric string or empty."""
    v = FOOTNOTE_RE.sub('', val).strip()
    if v.upper() in ('X', 'N/A', '-', ''):
        return ''
    return PRICE_RE.sub('', v).strip()

def clean_sku(val: str) -> str:
    """Strip footnote markers from SKU."""
    return FOOTNOTE_RE.sub('', val).strip()

# Extract style codes from a multi-line header like:
#   "Shaker White (SW)\nShaker Antique White (SA)\nShaker Dove (SD)\nShaker Grey (SG)"
STYLE_CODE_RE = re.compile(r'\(([A-Z]{1,5})\)')

def extract_style_codes(header: str) -> list[str]:
    return STYLE_CODE_RE.findall(header)

# A row is a category/section header if col 0 has text but all price cols are empty
def is_category_row(cells: list[str]) -> bool:
    if not cells[0]:
        return False
    # All columns after col 1 (weight) must be empty
    return all(not c for c in cells[2:])

# A row is a data row if col 0 looks like a SKU (starts with letter, has digits)
SKU_RE = re.compile(r'^[A-Z][A-Z0-9\-]{1,19}[\*†‡]*$', re.IGNORECASE)

def is_data_row(cells: list[str]) -> bool:
    sku = clean_sku(cells[0])
    return bool(SKU_RE.match(sku))

# ── main ───────────────────────────────────────────────────────────────────────

def convert(pdf_path: str, xlsx_path: str) -> dict:
    style_codes: list[str] = []   # ordered list of all style codes found
    col_to_styles: list[list[str]] = []  # index = price col index (0-based from col 2)

    rows: list[dict] = []
    current_category = ''

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            for tbl in tables:
                for row_idx, row in enumerate(tbl):
                    if not row:
                        continue
                    cells = [str(c or '').strip() for c in row]
                    # Pad to at least 6 columns
                    while len(cells) < 6:
                        cells.append('')

                    # Header row — extract style codes from price columns
                    if cells[0].lower() == 'cabinet' and cells[1].lower() == 'weight':
                        col_to_styles = []
                        style_codes_seen = set(style_codes)
                        for price_col in cells[2:]:
                            codes = extract_style_codes(price_col)
                            col_to_styles.append(codes)
                            for c in codes:
                                if c not in style_codes_seen:
                                    style_codes.append(c)
                                    style_codes_seen.add(c)
                        continue

                    # Category/section header row
                    if is_category_row(cells):
                        current_category = cells[0]
                        continue

                    # Data row
                    if is_data_row(cells):
                        sku = clean_sku(cells[0])
                        weight = cells[1].strip() if len(cells) > 1 else ''
                        prices: dict[str, str] = {}
                        for col_offset, codes in enumerate(col_to_styles):
                            raw_price = cells[2 + col_offset] if 2 + col_offset < len(cells) else ''
                            price_val = clean_price(raw_price)
                            for code in codes:
                                # All styles in the same column share the same price
                                prices[code] = price_val
                        rows.append({
                            'sku': sku,
                            'weight': weight,
                            'category': current_category,
                            'prices': prices,
                        })

    if not rows:
        raise ValueError("No data rows found in PDF — check that the PDF contains a table.")

    # ── Build XLSX ─────────────────────────────────────────────────────────────
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Pricing"

    # Header row
    header = ['SKU', 'Weight', 'Category'] + style_codes
    ws.append(header)

    # Style the header
    header_fill = PatternFill(start_color='1F3864', end_color='1F3864', fill_type='solid')
    header_font = Font(color='FFFFFF', bold=True)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')

    # Data rows
    for r in rows:
        row_data = [r['sku'], r['weight'], r['category']]
        for code in style_codes:
            row_data.append(r['prices'].get(code, ''))
        ws.append(row_data)

    # Auto-width columns
    for col_cells in ws.columns:
        max_len = max((len(str(c.value or '')) for c in col_cells), default=8)
        ws.column_dimensions[col_cells[0].column_letter].width = min(max_len + 2, 30)

    wb.save(xlsx_path)

    return {
        'rows': len(rows),
        'style_codes': style_codes,
        'xlsx_path': xlsx_path,
    }


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: pdf_to_xlsx.py <input.pdf> <output.xlsx>", file=sys.stderr)
        sys.exit(1)
    result = convert(sys.argv[1], sys.argv[2])
    print(f"Converted {result['rows']} rows, {len(result['style_codes'])} style codes: {result['style_codes']}")
    print(f"Output: {result['xlsx_path']}")

#!/usr/bin/env python3
"""
Insert missing B-12 through B-36 standard base cabinet SKUs for all styles
that have pricing in the master price list but no existing SKU in the DB.
"""
import csv
import json
import os
import subprocess
import sys

# Cabinet code -> cabinet ID mapping
CABINET_IDS = {
    'B12': 57,
    'B15': 59,
    'B18': 49,
    'B21': 50,
    'B24': 51,
    'B27': 52,
    'B30': 62,
    'B33': 53,
    'B36': 54,
}

# Style abbreviation -> style ID mapping (from backup analysis)
ABBREV_TO_STYLE = {
    'AC': 30023, 'AG': 30015, 'AW': 30022, 'CG': 30038, 'CS': 30056, 'CW': 30055,
    'DDW': 30025, 'DSG': 30024, 'EW': 30052, 'FE': 30042, 'FG': 30041, 'FW': 30040,
    'GR': 30012, 'HD': 30057, 'HE': 30060, 'HG': 30033, 'HW': 30032, 'IB': 30016,
    'LG': 30018, 'MB': 30034, 'MG': 30039, 'MI': 30035, 'NB': 30014, 'OB': 30036,
    'OM': 30058, 'OS': 30054, 'OT': 30059, 'OW': 30053, 'RW': 30021, 'SA': 30043,
    'SAG': 30028, 'SAO': 30030, 'SB': 30049, 'SC': 30051, 'SD': 30044, 'SDW': 30027,
    'SE': 30013, 'SEO': 30061, 'SG': 30045, 'SH': 30050, 'SI': 30047, 'SIB': 30029,
    'SN': 30048, 'SW': 30046, 'SWO': 30031, 'TC': 30020
}

# Load the price list CSV
price_list_path = '/home/ubuntu/price_list.csv'
with open(price_list_path) as f:
    reader = csv.DictReader(f)
    rows = {r['SKU']: r for r in reader}

# Load the backup to find existing SKUs
backup_path = '/home/ubuntu/cabinet-dealz/scripts/skus-backup-2026-06-23T17-02-46-893Z.json'
with open(backup_path) as f:
    backup = json.load(f)
existing_skus = set(s.get('platformSku', '') for s in backup)

# Also check the backfill-inserted file
backfill_path = '/home/ubuntu/cabinet-dealz/scripts/skus-backfill-inserted-2026-06-23T17-02-46-893Z.json'
if os.path.exists(backfill_path):
    with open(backfill_path) as f:
        backfill = json.load(f)
    if isinstance(backfill, list):
        existing_skus.update(backfill)

# Build list of SKUs to insert
to_insert = []
b_codes = ['B12', 'B15', 'B18', 'B21', 'B24', 'B27', 'B30', 'B33', 'B36']

for abbrev, style_id in sorted(ABBREV_TO_STYLE.items(), key=lambda x: x[1]):
    for code in b_codes:
        sku_key = f'{code}-{abbrev}-SK'
        price_row = rows.get(code, {})
        price_str = price_row.get(abbrev, '#N/A') if price_row else '#N/A'
        
        if sku_key in existing_skus:
            continue
        if price_str in ('#N/A', '', None):
            continue
        
        try:
            wholesale_price = float(price_str)
        except ValueError:
            continue
        
        cabinet_id = CABINET_IDS[code]
        # Pricing tiers based on existing patterns:
        # listPrice = wholesale * 1.4 (approx)
        # contractorPrice = wholesale * 1.0
        # homeownerPrice = wholesale * 1.3 (approx)
        list_price = round(wholesale_price * 1.4, 2)
        contractor_price = round(wholesale_price * 1.0, 2)
        homeowner_price = round(wholesale_price * 1.3, 2)
        your_cost = round(wholesale_price * 0.5, 2)
        adjusted_list = round(wholesale_price * 1.25, 2)
        
        to_insert.append({
            'platformSku': sku_key,
            'cabinetId': cabinet_id,
            'styleId': style_id,
            'wholesalePrice': wholesale_price,
            'listPrice': list_price,
            'contractorPrice': contractor_price,
            'homeownerPrice': homeowner_price,
            'yourCost': your_cost,
            'adjustedListPrice': adjusted_list,
            'isAvailable': True,
            'isPublished': True,
        })

print(f'Total SKUs to insert: {len(to_insert)}')
print('Sample:')
for s in to_insert[:5]:
    print(f"  {s['platformSku']} styleId={s['styleId']} wholesale={s['wholesalePrice']}")

# Get DB connection info from environment
db_url = os.environ.get('DATABASE_URL', '')
if not db_url:
    # Try to read from .env or project config
    env_file = '/home/ubuntu/cabinet-dealz/.env'
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.strip().split('=', 1)[1].strip('"\'')
                    break

if not db_url:
    print('ERROR: DATABASE_URL not found')
    sys.exit(1)

# Parse MySQL URL: mysql://user:pass@host:port/dbname
import re
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', db_url)
if not m:
    print(f'ERROR: Cannot parse DATABASE_URL: {db_url[:50]}...')
    sys.exit(1)

user, password, host, port, dbname = m.groups()
print(f'\nConnecting to {host}:{port}/{dbname} as {user}')

# Build SQL INSERT statements
# distributorId=3 is the Milestone/Clark&Sons distributor (same as BFH-* SKUs)
DISTRIBUTOR_ID = 3

sql_lines = []
sql_lines.append('SET NAMES utf8mb4;')
sql_lines.append('START TRANSACTION;')

for s in to_insert:
    dist_sku = s['platformSku']  # use platformSku as distributorSku too
    sql_lines.append(
        f"INSERT IGNORE INTO distributor_skus "
        f"(platformSku, distributorSku, cabinetId, distributorId, styleId, wholesalePrice, listPrice, contractorPrice, "
        f"homeownerPrice, yourCost, adjustedListPrice, isAvailable, isPublished, createdAt) "
        f"VALUES ("
        f"'{s['platformSku']}', '{dist_sku}', {s['cabinetId']}, {DISTRIBUTOR_ID}, {s['styleId']}, "
        f"{s['wholesalePrice']}, {s['listPrice']}, {s['contractorPrice']}, "
        f"{s['homeownerPrice']}, {s['yourCost']}, {s['adjustedListPrice']}, "
        f"1, 1, NOW());"
    )

sql_lines.append('COMMIT;')

sql_content = '\n'.join(sql_lines)

# Write SQL to file for review
sql_file = '/home/ubuntu/insert_b_skus.sql'
with open(sql_file, 'w') as f:
    f.write(sql_content)
print(f'\nSQL written to {sql_file} ({len(to_insert)} INSERT statements)')

# Execute via mysql CLI
cmd = ['mysql', f'-u{user}', f'-p{password}', f'-h{host}', f'-P{port}', dbname]
result = subprocess.run(cmd, input=sql_content.encode(), capture_output=True)
if result.returncode == 0:
    print('SUCCESS: All SKUs inserted!')
    stderr = result.stderr.decode()
    if stderr and 'Warning' not in stderr:
        print('STDERR:', stderr)
else:
    print('ERROR:', result.stderr.decode())
    sys.exit(1)

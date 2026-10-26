#!/usr/bin/env python3
"""
Populate cabinets.specImageUrl and cabinets.specNotes from Capital spec book data.

Strategy:
- Map each cabinet SKU pattern to a family drawing URL (from uploaded images)
- Extract spec notes from the text file for each cabinet family
- Run SQL UPDATE statements via the DB connection

Run: python3 scripts/populate_specs.py
"""
import os
import re
import subprocess
import json

# ─── CDN URL base ─────────────────────────────────────────────────────────────
# These are the uploaded /manus-storage/ paths from the CDN upload step
DRAWING_URLS = {
    "base_full_height_single":    "/manus-storage/base_full_height_single_ab045451.png",
    "base_full_height_double":    "/manus-storage/base_full_height_double_f2b59f0c.png",
    "base_single_door_drawer":    "/manus-storage/base_single_door_drawer_789c695c.png",
    "base_double_door_drawer":    "/manus-storage/base_double_door_drawer_e2ff68eb.png",
    "base_double_door_2drawer":   "/manus-storage/base_double_door_2drawer_02f898ee.png",
    "base_sink_single":           "/manus-storage/base_sink_single_44b34ec1.png",
    "base_sink_double":           "/manus-storage/base_sink_double_85d06f63.png",
    "base_farm_sink":             "/manus-storage/base_farm_sink_6f1168b0.png",
    "base_drawer_2":              "/manus-storage/base_drawer_2_66bf87f5.png",
    "base_drawer_3":              "/manus-storage/base_drawer_3_51f0ed59.png",
    "base_corner_easy_reach":     "/manus-storage/base_corner_easy_reach_080d052c.png",
    "base_blind":                 "/manus-storage/base_blind_58ca8f93.png",
    "wall_single_door_30h":       "/manus-storage/wall_single_door_30h_1015d79a.png",
    "wall_double_door_30h":       "/manus-storage/wall_double_door_30h_ff555b31.png",
    "wall_single_door_36h":       "/manus-storage/wall_single_door_36h_f13c8abb.png",
    "wall_double_door_36h":       "/manus-storage/wall_double_door_36h_1c7babde.png",
    "wall_single_door_42h":       "/manus-storage/wall_single_door_42h_23bd15d2.png",
    "wall_double_door_42h":       "/manus-storage/wall_double_door_42h_bc6b3aac.png",
    "wall_corner_diagonal":       "/manus-storage/wall_corner_diagonal_ae4e62f3.png",
    "wall_bridge":                "/manus-storage/wall_bridge_cfcb5d77.png",
    "wall_refrigerator":          "/manus-storage/wall_refrigerator_a84893ce.png",
    "wall_glass_door":            "/manus-storage/wall_glass_door_9b15d5f8.png",
    "tall_utility_2door":         "/manus-storage/tall_utility_2door_12857557.png",
    "tall_utility_4door":         "/manus-storage/tall_utility_4door_cfc52263.png",
    "tall_oven":                  "/manus-storage/tall_oven_31fe6884.png",
    "vanity_sink_base_single":    "/manus-storage/vanity_sink_base_single_6eca1ab0.png",
    "vanity_sink_base_double":    "/manus-storage/vanity_sink_base_double_5131bf00.png",
    "vanity_drawer":              "/manus-storage/vanity_drawer_04a49ab5.png",
    "vanity_combo":               "/manus-storage/vanity_combo_0cb94a6d.png",
}

# ─── Spec notes per family ─────────────────────────────────────────────────────
SPEC_NOTES = {
    "base_full_height_single": "Full height single door base. Cabinet dimensions: H 34½\", D 24\". Door height 29\". Soft-close hinges standard.",
    "base_full_height_double": "Full height double door base. Cabinet dimensions: H 34½\", D 24\". Door height 29\". Two boxes will be received when ordering this cabinet kit flat pack. Soft-close hinges standard.",
    "base_single_door_drawer": "Single door / single drawer base. Cabinet dimensions: H 34½\", D 24\". Door height 22½\", drawer height 6¼\". Soft-close hinges and drawer glides standard.",
    "base_double_door_drawer": "Double door / single drawer base. Cabinet dimensions: H 34½\", D 24\". Door height 22½\", drawer height 6¼\". Soft-close hinges and drawer glides standard.",
    "base_double_door_2drawer": "Double door / double drawer base. Cabinet dimensions: H 34½\", D 24\". Door height 22½\", drawer height 6¼\". Soft-close hinges and full-extension drawer glides standard.",
    "base_sink_single": "Sink base — single door with false drawer front. Cabinet dimensions: H 34½\", D 24\". Door height 22½\", false drawer height 6¼\". Open interior for plumbing access.",
    "base_sink_double": "Sink base — double door with false drawer front. Cabinet dimensions: H 34½\", D 24\". Door height 22½\", false drawer height 6¼\". Open interior for plumbing access.",
    "base_farm_sink": "Farm/apron sink base. Cabinet dimensions: H 34½\", D 24\". Designed to accommodate apron-front farm sinks. Open front frame; no false drawer front.",
    "base_drawer_2": "Two-drawer base. Cabinet dimensions: H 34½\", D 24\". Full-extension BLUMOTION soft-close drawer glides (110 lb weight capacity). Dovetail drawer box construction.",
    "base_drawer_3": "Three-drawer base. Cabinet dimensions: H 34½\", D 24\". Full-extension BLUMOTION soft-close drawer glides (110 lb weight capacity). Dovetail drawer box construction.",
    "base_corner_easy_reach": "Corner easy-reach base with lazy susan. Cabinet dimensions: H 34½\", D 24\". Rotating kidney-shaped shelves for full corner access. Soft-close hinges standard.",
    "base_blind": "Blind corner base. Cabinet dimensions: H 34½\", D 24\". Adjustable interior shelf. Minimum pull distance required — see spec sheet for model-specific pull dimensions.",
    "wall_single_door_30h": "Single door wall cabinet — 30\" high. Cabinet dimensions: H 30\", D 12\". Two adjustable shelves. Soft-close hinges standard.",
    "wall_double_door_30h": "Double door wall cabinet — 30\" high. Cabinet dimensions: H 30\", D 12\". Two adjustable shelves. Soft-close hinges standard.",
    "wall_single_door_36h": "Single door wall cabinet — 36\" high. Cabinet dimensions: H 36\", D 12\". Two adjustable shelves. Soft-close hinges standard.",
    "wall_double_door_36h": "Double door wall cabinet — 36\" high. Cabinet dimensions: H 36\", D 12\". Two adjustable shelves. Soft-close hinges standard.",
    "wall_single_door_42h": "Single door wall cabinet — 42\" high. Cabinet dimensions: H 42\", D 12\". Three adjustable shelves. Soft-close hinges standard.",
    "wall_double_door_42h": "Double door wall cabinet — 42\" high. Cabinet dimensions: H 42\", D 12\". Three adjustable shelves. Soft-close hinges standard.",
    "wall_corner_diagonal": "Diagonal corner wall cabinet. Cabinet dimensions: H 30\"/36\"/42\", D 12\". Angled face for corner placement. One adjustable shelf. Soft-close hinges standard.",
    "wall_bridge": "Bridge wall cabinet (short). Available in 12\", 15\", 18\", and 24\" heights. D 12\". Designed for use over ranges, refrigerators, and windows.",
    "wall_refrigerator": "Refrigerator wall cabinet — 24\" deep. Available in 12\", 15\", 18\", and 24\" heights. D 24\". Designed to sit above standard refrigerators.",
    "wall_glass_door": "Glass door wall cabinet — routed for glass with finished interior. Available in 30\", 36\", and 42\" heights. D 12\". Glass not included.",
    "tall_utility_2door": "Tall utility cabinet — two doors. Cabinet dimensions: H 84\"/90\"/96\", D 24\". Five adjustable shelves. Soft-close hinges standard. Two boxes will be received when ordering this cabinet kit flat pack.",
    "tall_utility_4door": "Tall utility cabinet — four doors (upper and lower). Cabinet dimensions: H 84\"/90\"/96\", D 24\". Adjustable shelves in upper and lower sections. Soft-close hinges standard. Three boxes will be received when ordering this cabinet kit flat pack.",
    "tall_oven": "Oven/microwave tall cabinet. Cabinet dimensions: H 84\"/90\"/96\", D 24\". Designed for built-in oven and microwave combo. Upper and lower door sections. Three boxes will be received when ordering this cabinet kit flat pack.",
    "vanity_sink_base_single": "Vanity sink base — single door. Cabinet dimensions: H 34½\", D 21\". Open interior for plumbing access. Soft-close hinges standard.",
    "vanity_sink_base_double": "Vanity sink base — double door. Cabinet dimensions: H 34½\", D 21\". Open interior for plumbing access. Soft-close hinges standard.",
    "vanity_drawer": "Vanity drawer base. Cabinet dimensions: H 34½\", D 21\". Full-extension BLUMOTION soft-close drawer glides. Dovetail drawer box construction.",
    "vanity_combo": "Vanity combo base — door and drawer combination. Cabinet dimensions: H 34½\", D 21\". Soft-close hinges and drawer glides standard.",
}

# ─── SKU → family mapping ──────────────────────────────────────────────────────
# Rules applied in order; first match wins.
# Each rule: (regex_pattern, family_key)
# Patterns match against the cabinet's masterCode (uppercase)
SKU_FAMILY_RULES = [
    # Vanity
    (r"^VKD", "vanity_combo"),
    (r"^VDDB", "vanity_combo"),
    (r"^VSD", "vanity_combo"),
    (r"^VDB", "vanity_drawer"),
    (r"^VB\d+$", "vanity_sink_base_single"),  # single door vanity sink
    (r"^VB\d{2,}", "vanity_sink_base_double"),  # double door vanity (wider)

    # Tall / Utility / Oven
    (r"^OC", "tall_oven"),
    (r"^U\d+84\d*RS|^U\d+90\d*RS|^U\d+96\d*RS", "tall_utility_4door"),  # rollout utility
    (r"^U18", "tall_utility_2door"),
    (r"^U\d{2,}", "tall_utility_4door"),

    # Wall cabinets
    (r"^DCW.*GD|^WER.*GD|^WBC.*GD", "wall_glass_door"),
    (r"^W\d{2,4}GD", "wall_glass_door"),
    (r"^W\d{2,4}1224$|^W\d{2,4}1524$|^W\d{2,4}1824$|^W\d{2,4}2424$", "wall_refrigerator"),
    (r"^W\d{2,4}12$|^W\d{2,4}15$|^W\d{2,4}18$|^W\d{2,4}24$", "wall_bridge"),
    (r"^DCW\d", "wall_corner_diagonal"),
    (r"^WER\d|^WBC\d", "wall_corner_diagonal"),
    (r"^W\d{2}42|^W\d{4}42", "wall_double_door_42h"),
    (r"^W\d{2}36|^W\d{4}36", "wall_double_door_36h"),
    (r"^W\d{2}30|^W\d{4}30", "wall_double_door_30h"),
    (r"^W09\d{2}|^W12\d{2}|^W15\d{2}|^W18\d{2}|^W21\d{2}", "wall_single_door_30h"),  # single door wall

    # Base cabinets
    (r"^FSB|^FARM", "base_farm_sink"),
    (r"^SB\d+SADA|^SB\d+ADA", "base_sink_double"),  # ADA sink base
    (r"^SB\d+S$", "base_sink_single"),
    (r"^SB\d{2,}", "base_sink_double"),
    (r"^DCSF|^SBF", "base_sink_double"),  # diagonal corner sink / farm sink base
    (r"^BBC\d|^LSB\d|^BER\d", "base_blind"),  # blind base corner / easy reach
    (r"^3DB", "base_drawer_3"),
    (r"^2DB", "base_drawer_2"),
    (r"^B\d+FH\d*RS|^B\d+FH\d*TCPO|^B\d+FH\d*TD", "base_full_height_single"),  # FH accessory variants
    (r"^B\d{2,}FH$|^B\d{2,}FH\d", "base_full_height_double"),  # double FH (24"+)
    (r"^B\d{1,2}FH$", "base_full_height_single"),  # single FH (12-21")
    (r"^B\d+TD$|^B\d+RS$|^B\d+2RS$", "base_single_door_drawer"),  # tray divider / rollout shelf variants
    (r"^B\d{2}ADA$|^B\d{2}ADA\d", "base_single_door_drawer"),  # ADA single door
    (r"^B36ADA|^B33ADA|^B30ADA", "base_double_door_2drawer"),  # ADA double door
    (r"^B12$|^B15$|^B18$|^B21$", "base_single_door_drawer"),
    (r"^B24$|^B27$|^B30$|^B33$|^B36$|^B39$|^B42$", "base_double_door_drawer"),
    (r"^BT9", "base_full_height_single"),  # tray base
]

def get_family(master_code):
    code = master_code.upper().replace("-", "").replace("_", "").replace(" ", "")
    for pattern, family in SKU_FAMILY_RULES:
        if re.match(pattern, code, re.IGNORECASE):
            return family
    return None

# ─── Build SQL update statements ──────────────────────────────────────────────
def escape_sql(s):
    return s.replace("'", "\\'").replace("\\", "\\\\")

# Read all cabinet masterCodes from DB
# We'll generate a SQL script and print it for review / piping to mysql
print("-- Cabinet spec image + notes population script")
print("-- Generated by populate_specs.py")
print("-- Run via: mysql < this_file.sql  OR paste into webdev_execute_sql")
print()

# Build the mapping data as a SQL CASE statement for batch update
# We'll output individual UPDATE statements grouped by family for clarity

family_updates = {}  # family -> list of masterCodes (we don't know them yet)
# Instead, output a SQL script that uses CASE WHEN on masterCode patterns

# Output per-family UPDATE statements using LIKE/REGEXP patterns
family_sql_conditions = {
    "base_full_height_single": [
        "masterCode REGEXP '^B[0-9]{1,2}FH$'",
        "masterCode REGEXP '^BT9'",
        "masterCode REGEXP '^B[0-9]+FH[0-9]*RS'",
        "masterCode REGEXP '^B[0-9]+FH[0-9]*TCPO'",
        "masterCode REGEXP '^B[0-9]+FH[0-9]*TD'",
    ],
    "base_full_height_double": [
        "masterCode REGEXP '^B[2-9][0-9]FH'",
    ],
    "base_single_door_drawer": [
        "masterCode IN ('B12','B15','B18','B21')",
        "masterCode REGEXP '^B[0-9]+TD$'",
        "masterCode REGEXP '^B[0-9]+RS$'",
        "masterCode REGEXP '^B[0-9]+2RS$'",
        "masterCode REGEXP '^B[0-9]{2}ADA$'",
        "masterCode REGEXP '^B[0-9]{2}ADA[0-9]'",
    ],
    "base_double_door_drawer": [
        "masterCode IN ('B24','B27','B30','B33','B36','B39','B42')",
    ],
    "base_double_door_2drawer": [
        "masterCode REGEXP '^B[0-9]+2D$'",
        "masterCode IN ('B36ADA','B33ADA','B30ADA')",
    ],
    "base_sink_single": [
        "masterCode REGEXP '^SB[0-9]+S$'",
    ],
    "base_sink_double": [
        "masterCode REGEXP '^SB[0-9]+'",
        "masterCode REGEXP '^DCSF'",
        "masterCode REGEXP '^SBF'",
    ],
    "base_farm_sink": [
        "masterCode REGEXP '^FSB'",
    ],
    "base_drawer_2": [
        "masterCode REGEXP '^2DB'",
    ],
    "base_drawer_3": [
        "masterCode REGEXP '^3DB'",
    ],
    "base_corner_easy_reach": [
        "masterCode REGEXP '^BER'",
        "masterCode REGEXP '^LSB'",
    ],
    "base_blind": [
        "masterCode REGEXP '^BBC'",
    ],
    "wall_single_door_30h": [
        "masterCode REGEXP '^W(09|12|15|18|21)[0-9]{2}$'",
        "masterCode REGEXP '^W(09|12|15|18|21)[0-9]{2}[A-Z]'",
    ],
    "wall_double_door_30h": [
        "masterCode REGEXP '^W[2-4][0-9]30'",
    ],
    "wall_single_door_36h": [
        "masterCode REGEXP '^W(09|12|15|18|21)[0-9]{2}36'",
    ],
    "wall_double_door_36h": [
        "masterCode REGEXP '^W[2-4][0-9]36'",
    ],
    "wall_single_door_42h": [
        "masterCode REGEXP '^W(09|12|15|18|21)[0-9]{2}42'",
    ],
    "wall_double_door_42h": [
        "masterCode REGEXP '^W[2-4][0-9]42'",
    ],
    "wall_corner_diagonal": [
        "masterCode REGEXP '^DCW'",
        "masterCode REGEXP '^WER'",
        "masterCode REGEXP '^WBC'",
    ],
    "wall_bridge": [
        "masterCode REGEXP '^W[0-9]{2}(12|15|18|24)$'",
        "masterCode REGEXP '^W[0-9]{4}(12|15|18|24)$'",
    ],
    "wall_refrigerator": [
        "masterCode REGEXP '^W[0-9]{4}24$'",
    ],
    "wall_glass_door": [
        "masterCode REGEXP 'GD$'",
    ],
    "tall_utility_2door": [
        "masterCode REGEXP '^U18'",
    ],
    "tall_utility_4door": [
        "masterCode REGEXP '^U(24|30)'",
    ],
    "tall_oven": [
        "masterCode REGEXP '^OC'",
    ],
    "vanity_sink_base_single": [
        "masterCode REGEXP '^VB(12|15|18|21)$'",
    ],
    "vanity_sink_base_double": [
        "masterCode REGEXP '^VB(24|27|30|33|36|42|48)$'",
        "masterCode REGEXP '^VB[0-9]+ADA'",
    ],
    "vanity_drawer": [
        "masterCode REGEXP '^VDB'",
    ],
    "vanity_combo": [
        "masterCode REGEXP '^VSD'",
        "masterCode REGEXP '^VDDB'",
        "masterCode REGEXP '^VKD'",
    ],
}

sql_lines = []
for family, conditions in family_sql_conditions.items():
    img_url = DRAWING_URLS.get(family, "")
    notes = SPEC_NOTES.get(family, "")
    if not img_url:
        continue
    where_clause = " OR ".join(f"({c})" for c in conditions)
    img_escaped = escape_sql(img_url)
    notes_escaped = escape_sql(notes)
    sql_lines.append(
        f"UPDATE cabinets SET specImageUrl = '{img_escaped}', specNotes = '{notes_escaped}' "
        f"WHERE ({where_clause}) AND (specImageUrl IS NULL OR specImageUrl = '');"
    )

# Print the SQL
for line in sql_lines:
    print(line)

print()
print(f"-- Total families: {len(sql_lines)}")

# Also save to a file
out_path = "/home/ubuntu/cabinet-dealz/scripts/populate_specs.sql"
with open(out_path, "w") as f:
    f.write("-- Cabinet spec image + notes population\n")
    f.write("-- Generated by populate_specs.py\n\n")
    for line in sql_lines:
        f.write(line + "\n")
print(f"\n-- SQL saved to {out_path}")

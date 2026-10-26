# Fridge Surround Feature - Cabinet Naming Patterns

## Problem
The server's `surroundForFridge` procedure queries for cabinet codes using patterns that don't match the actual database naming convention.

## Actual Cabinet Codes Found

### End Panels (refrigerator side panels)
- `REPV3096` — "Refrigerator End Panel Veneer 30x96" (width=30, height=96, depth=0.75)
- `Unfinished-REPVKIT` — "Unfinished Refrigerator End Panel Kit w/ L-Brackets - 1-1/2"W x 96"H x 30"D" (width=1.5, height=96, depth=30)
- `Unfinished-REPV3096` — "Unfinished Refrigerator End Panel - 1-1/2"W x 96"H x 30"D" (width=1.5, height=96, depth=30)
- `TDEP2484`, `TDEP2490`, `TDEP2496` — "Tall Decorative End Panel" (width=23, height=78/84/96)

### Bridge Cabinets (short wall cabinets above fridge)
- `W3612` — "36" x 12" Bridge Wall Cabinet" (width=36, height=12, depth=12)
- `SU-W3612`, `SU-W3015`, `SU-W3615`, `SU-W3018`, `SU-W3618`, `SU-W3024`, `SU-W3624` — Shaker Unfinished Bridge Cabinets

### Deep Fridge Wall Cabinets (24" deep, goes above fridge)
- `SU-W301224` — "Shaker Unfinished Wall Refrigerator Cabinet - 30"W x 12"H x 24"D" (width=30, height=12, depth=24)
- `SU-W331224` — 33"W x 12"H x 24"D
- `SU-W361224` — 36"W x 12"H x 24"D
- `SU-W302424` — 30"W x 24"H x 24"D
- `SU-W332424` — 33"W x 24"H x 24"D
- `SU-W362424` — 36"W x 24"H x 24"D

### Smooth Skin Panels (WSV equivalent)
- `REPV3096` — "Refrigerator End Panel Veneer 30x96" (depth=0.75)
- `USV2496` — "24" x 96" Universal Skin / Island Panel (1/4" - cut to fit)" (depth=0.25)
- Style-prefixed: `Cashmere-WSV42`, `Cashmere-USV2496`, etc.

## Server Query Patterns (WRONG → CORRECT)

### Deep wall above fridge
- WRONG: `LIKE 'W-%-24'`
- CORRECT: `depth = 24 AND description LIKE '%Wall%'` OR `masterCode LIKE '%-%-24'` (last segment = depth)

### Bridge cabinets
- WRONG: `LIKE 'W-%'` then filter height <= 18
- CORRECT: `LIKE '%Bridge%'` in description OR height <= 18 AND depth = 12

### End panels
- WRONG: `LIKE 'REPV-%'`
- CORRECT: `LIKE '%REPV%'` OR description LIKE '%Refrigerator End Panel%'

### Smooth skin panels
- WRONG: `LIKE 'WSV-%'`
- CORRECT: `LIKE '%WSV%'` OR description LIKE '%Skin%' OR description LIKE '%Veneer%'

## Fix Approach
Update the SQL queries in `server/routers/design.ts` `surroundForFridge` procedure to use:
1. Description-based matching for bridge/deep/panel cabinets
2. Depth-based matching for deep fridge wall cabinets (depth=24)
3. Pattern `%REPV%` for end panels
4. Pattern `%WSV%` OR `%USV%` for smooth skin panels

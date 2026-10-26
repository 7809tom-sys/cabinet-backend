# GraphicType Cheat Sheet — CabinetDealz

The `graphicType` field tells the 2D designer exactly how to draw a cabinet's front elevation.
It overrides the automatic detection from description/category when set.
**Leave blank** to let the system auto-detect from the cabinet code and description.

---

## Base Cabinets

| GraphicType | What It Draws | Typical Codes |
|---|---|---|
| `base_1door` | 1 door + 1 drawer at top | B-12, B-15, B-18 |
| `base_2door` | 2 side-by-side doors + 1 drawer at top | B-24, B-30, B-36 |
| `base_1door_1drawer` | 1 door + 1 drawer (explicit) | B-15, B-18 |
| `base_2door_1drawer` | 2 doors + 1 drawer at top | B-24, B-27 |
| `base_2door_2drawer` | 2 doors + 2 drawers at top | specialty bases |
| `base_1door_fullheight` | 1 full-height door, no drawer | BFH-15, BFH-18 |
| `base_2door_fullheight` | 2 full-height doors, no drawer | BFH-24, BFH-30 |
| `base_2drawer` | 2 equal-height drawers, no doors | 2DB-24, 2DB-30 |
| `base_3drawer` | 3 equal-height drawers, no doors | 3DB-15, 3DB-18 |
| `base_0door_5drawer` | 5 stacked drawers | specialty |
| `base_0door` | Open base (no doors, no drawers) | open shelf base |
| `base_sink` | False tilt-out tray at top + 2 doors below | SB-30, SB-33, SB-36 |
| `base_angle` | Diagonal/angled corner base | DCB-*, angle base |
| `base_easy_reach` | L-corner with lazy Susan | LS-3612, BER-33 |

---

## Wall Cabinets

| GraphicType | What It Draws | Typical Codes |
|---|---|---|
| `wall_1door` | 1 door, no drawer | W-1230, W-1236 |
| `wall_2door` | 2 side-by-side doors | W-2430, W-3036 |
| `wall_0door` | Open wall shelf (no doors) | open shelf wall |
| `wall_1door_glass` | 1 glass-front door | W-1230GD |
| `wall_2door_glass` | 2 glass-front doors | W-2430GD |
| `wall_0door_glass` | Open glass display | glass display |
| `wall_blind_corner` | Blind corner wall cabinet | WBC-*, WBL-*, WBR-* |
| `wall_diagonal_corner` | 45° angled wall corner | DCW-*, WDC-* |
| `wall_easy_reach` | L-corner wall lazy Susan | WLS-*, WBER-* |
| `wall_angle` | Angled wall corner | AW-* |

---

## Tall Cabinets

| GraphicType | What It Draws | Typical Codes |
|---|---|---|
| `tall_2door` | Pantry: 2 doors top + 2 doors bottom (split at 54") | PT-1884, PT-2484 |
| `tall_oven` | Oven: 2 upper doors + oven opening + drawers | O-309024, UOC-3390 |

---

## Specialty / Other

| GraphicType | What It Draws | Typical Codes |
|---|---|---|
| `accessory` | Thin strip (molding, filler, scribe) | crown, filler, rail |

---

## Rules

1. **Leave blank** for standard cabinets — the system auto-detects from code + description.
2. **Set explicitly** when the auto-detection gets it wrong (e.g. a full-height base that auto-detects as having a drawer).
3. **numberOfDrawers = 0** overrides any drawer rail regardless of graphicType or description.
4. **numberOfDoors = 0** forces an open-front rendering (no door panels).
5. The `graphicType` field is a hint to the renderer — `numberOfDoors` and `numberOfDrawers` are the authoritative counts.

---

## Quick Fix Guide

| Problem | Fix |
|---|---|
| Black line through a plain door cabinet | Set `numberOfDrawers = 0` in admin |
| Cabinet shows as white box | Wrong type detected — check code prefix or set `graphicType` |
| Drawer rail at wrong height | Set `numberOfDrawers` to the correct count |
| Full-height door showing drawer band | Set `graphicType = base_1door_fullheight` or `base_2door_fullheight` |
| Pantry showing as single door | Set `graphicType = tall_2door` or category = Tall |
| Oven cabinet showing as white box | Code not recognized — contact admin to add prefix to oven-tall detection |

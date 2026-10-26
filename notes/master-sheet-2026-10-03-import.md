# Master sheet 2026-10-03 import — working notes

Source: /home/ubuntu/upload/cabinetdealz_master_UPDATED_2026-10-03.xlsx (cleaned copy; 683 rows, 529 masters, 519 active)
OWNER HARD RULE: **NO PRICING CHANGES** ("dont change no pricing!", "not pricing", "but everything else"). Apply everything else.

## Done (committed to live DB, 10:39 CDT)
- Migration drizzle/0171_outgoing_valkyrie.sql: cabinets.homeownerDescription, cabinets.originalDescription (applied).
- scripts/apply-master-sheet-2026-10-03.mjs --apply: 683 cabinets updated, 683 recovery snapshots (reason before-master-sheet-2026-10-03),
  2574 change-log rows (scope master, changedByName "master sheet 2026-10-03"), 153 aliases, 150 code equivalences (merge pairs + alias-is-own-row).
  42 code undashes (old code kept as alias). 111 deactivations, 36 reactivations. Active cabinets now 519.
- Prices verified identical before/after: distributor_skus n=17978, sum list 11509761.27, sum cost 3298006.86, max id 6001554.
- scripts/diff-master-sheet-2026-10-03.mjs = dry-run diff tool.

## Sheet facts (other tabs)
- designerEligible=NO (127 active): ALL 127 actually HAVE prices in distributor_skus (sheet author lacked price files). showInDesigner untouched. => do NOT hide them.
- AW1230/36/42 already graphicType wall-end-angle in DB; BEC24 base-end-quarter-octagon. Code: AW handled by isAngledWallCabinet (design.ts ~5095), plan clip triangleCornerClipPath(0) (PlanCanvas 239), 3D isAngledWallProfile → "diagonal-corner" kind (InteractiveRoom3D ~3145). BEC: isBaseEndCornerCabinet (design.ts 2257), footprint 24x24.
  Sheet rule 12: AW = wall version of BEC end design (end cabinet, not corner); "New 3D shapes" tab says wall-end-angle must be built.
- Brand Attributes tab (per-distributor overrides, rule 7): USCD BBC36 box 27"; Skyline BBC36 box 33"; Faircrest BBC36 36". WBC27xx box 27. B30: USCD 1 drawer (B30S), Skyline/Faircrest 2 drawers → draw brand's drawer count. BEC24 shelves USCD 2 / Faircrest 1. Glass: USCD GD = no glass; Skyline GD includes glass; Faircrest partial. CSB36 Skyline 1 false front. MB30 order codes USCD BMW30 / Faircrest BMC30. No existing per-distributor attribute table in schema (only distributor_skus / cabinet_distributor_eligibility).
- Color map: all USCD color→group mappings UNVERIFIED (Zenith Sage→Oxford Sage?). Pricing-related → skip.
- Native code gaps: 114 active masters with no native order code (info only; needs Tom).
- NEEDS TOM open: plate vs plain glass; 8 zero-door cabinets (B18TCPO, DCSF42, DFB18, FSB30, PWB-BBC45-TRAY, SB39, WSC30, WSD630); W2412PG 1 vs 2 doors; DCW2442GD price; Zenith Sage colour; DCW27xx discontinued at Skyline but active.
- 19 rules in READ ME FIRST: rule 18 crown on top of stack incl. glass stackers, never on bridge (NOTE: conflicts w/ this morning's fix which crowns the fridge bridge top at 96"; "bridge" in rule 18 means mid-height bridge surface — bridge top IS the top of its stack, so consistent).

## Remaining plan
1. Brand Attributes → store as structured JSON (new table cabinet_brand_attributes or specNotes) — non-price only.
2. AW wall-end-angle 3D shape review (already renders as triangular end; verify matches BEC-style end design).
3. Checkpoint + report. Do not touch pricing, Site prices tab, Color map.

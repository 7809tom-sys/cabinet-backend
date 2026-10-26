# ERB / BER alias diagnostic (Part 2) — 2026-10-03 08:10 CT

## Lines and corner codes (live DB, published + available SKUs)

| Line | Family | Codes | Priced style rows |
|---|---|---|---|
| Skyline Cabinetry (180001) | ERB | ERB33, ERB36 | 27 each |
| Madison (210002) | BER | BER33, BER36, BER36ADA; also LSB33, LSB36, LSB36ADA | 24 / 24 / 5 |
| Ashford (210001) | LS | LS3312, LS3612 (36" deep bodies) | 13 each |

## (a) Where the master nomenclature list lives

No single list file. Master = live TiDB `cabinets.masterCode` plus three alias stores:

| Store | Rows | Direction | Read by Designer pricing? |
|---|---|---|---|
| `sku_master_aliases` (aliasCode → masterCode, conflictStatus) | 384 (382 ok) | one-way | yes |
| `cabinet_aliases` (alias → cabinetId) | 361 | one-way | yes (dash/space-insensitive) |
| `cabinets.altSku1-3` | 314 cabinets | n/a | **no** |

`shared/catalogNomenclature.ts` (in the live bundle) parses code families only; it has no ERB/BER equivalence. No uploaded file in the workspace contains both ERB and BER codes.

## (b) Mapping function

`priceForCabinetsByStyles` — `server/routers/design.ts` ~L859–1020. Queries `sku_master_aliases WHERE aliasCode IN (requested) AND conflictStatus='ok'`, then `cabinet_aliases` by normalized alias, prices `distributor_skus` for `[requested, canonical]` only. Helper `resolveDesignPriceAliases` (~L84) and `server/lib/designPriceAliases.ts` (`canonicalizeDesignPriceItems`, hard-coded `WFR2442 → W-24-42`) follow the same one-hop, one-way shape. Import side: `server/lib/catalogImportLogic.ts` `masterByAlias` map, also one-way.

## (c) Why ERB → BER failed

1. Missing entry: only `ERB-33→ERB33`, `ERB-36→ERB36` exist; no ERB↔BER in any store; `altSku` null on all five rows.
2. One-direction-only lookup: 0 of 29 live↔live alias rows have a reverse row.
3. One hop, exact canonical string: A→C and B→C never make A↔B equivalent. Case/spacing is already normalized. The code was in the live build; it had no data to match.

## (d) Pairs that fail the same way

### sku_master_aliases rows linking two live priced masters (reverse never resolves)

| alias (line) | master (lines) |
|---|---|
| DCW-2436 (Skyline) | DCW2436 (Skyline, Madison) |
| WF342, BF-3 (Ashford) | F342 (Skyline, Madison) |
| REP2496 (Ashford) | REPV2496 (Skyline) |
| W1542, W1830, W1842, W2130, W2136, W2142, W2742 (Skyline) | W-1542 … W-2742 (all three) |
| WER-2430/2436/2442 (Skyline) | WER2430/2436/2442 (Skyline, Madison) |
| W-15-36, W-18-36, W-15-30 (all three) | W-1536, W-1836, W-1530 (Skyline) |
| WBC-27-30/36/42 (all three) | WBC2730/2736/2742 (Skyline) |
| CHROME-TRAY33/36 | CHROME TRAY 33/36 (Skyline) |
| PR-30-15 (Skyline, Ashford) | PR3015 (Skyline) |
| WRC3015 (Skyline) | LWR3015 (Ashford) |
| AW-12-30/36/42 (Skyline) | AW1230/1236/1242 (Skyline, Madison) |
| F642 (Skyline, Madison) | WF642 (Ashford) |
| ADA-3VDB12 | 3DB12ADA (Skyline) |

### altSku link only (no alias row in either direction; never priced across lines)

UOC3384(O338424)/UOC3390(O339024)/UOC3396(O339624) ↔ O338424/O339024/O339624 (Madison); WR331524(W331524), WR3318(W331824), WR3612(W361224), WR3615(W361524), WR3618(W361824), WR3624(W362424) ↔ W3xxx24; VDB1221(3VDB12), VDB1521(3VDB15), VDB1821(3VDB18), VDB2121, VDB2421 ↔ 3VDB12–24; TK-8(TKC) ↔ TKC.

### Corner family, same dimensions, no link anywhere

| Code A (lines) | Code B (lines) | Dims |
|---|---|---|
| ERB33 (Skyline) | BER33 (Madison) | 33 × 34.5 × 24 |
| ERB36 (Skyline) | BER36 (Madison) | 36 × 34.5 × 24 |
| WDC2436 (Ashford) | DCW-2436 (Skyline) / DCW2436 (Skyline, Madison) | 24 × 36 × 12 |
| WCA1230/1236/1242 (Ashford) | AW1230/1236/1242 (Skyline, Madison) | 12 × 30/36/42 × 12 |

Not equivalents (kept distinct per Part 3 rule 4): BER36 vs LSB36 (Madison, different interior/price), LS3312/LS3612 (Ashford, 36" deep) vs 24"-deep ERB/BER, WBC2430 vs DCW2430 (blind vs diagonal), DCW2430 vs DCW2430GD (glass).

Raw query output: `/tmp/alias_pairs_audit.out`, scripts `/tmp/erb_ber_audit.cjs`, `/tmp/alias_pairs_audit.cjs`, `/tmp/corner_audit.cjs`.


# Part 5 audit — BT9 example and whole alias report (2026-10-03 08:23 CT)

## BT9 family (live DB)

| Store | Rows |
|---|---|
| `cabinets` | one row: `BT9` id 9390192, "9\" Tray Base Cabinet", Base / Full height, 9 × 34.5 × 24, altSku1 `BT-09`, altSku2 `FHB-09`, altSku3 `BT09`; lines Madison + Skyline |
| `sku_master_aliases` | `BFH9 → BT9`, `FHB09 → BT9` |
| `cabinet_aliases` | `BFH9 → BT9`, `BT09 → BT9` |
| `distributor_skus` | Skyline sells it as distributorSku `BT09` (23 styles); Madison as `BT9` (24 styles) |
| Not found anywhere | `FHBO9`, `TBO9`, `B9`, `B-9` — no cabinet, SKU, or alias rows (user-supplied aliases; to be added as alias rows pointing to BT9) |
| Distinct product | `BT09ADA` = 9" ADA base 32.5" tall — NOT a BT9 alias (own alias `ADA-BT09`) |

Note: user said BT9 = "9\" base cabinet (no drawer)"; the catalog description is "Tray Base Cabinet" (full-height door, 0 drawers) — consistent.

## Whole alias report

- 291 master groups in `sku_master_aliases` (ok rows, alias ≠ master), 382 ok rows total; 2 conflict rows (`BEC-24`, `BEC24 → BA-24`, canonical BA-24 missing — user said BEC is abandoned).
- Masters with NO cabinet row (unassignable until cabinet exists or reversed): `W-24-18 → W2418` (W2418 missing; cabinet is `W-2418`), `3DB15ADA → ADA-3DB15`, `3DB18ADA → ADA-3DB18`, `VS36ADA → ADA-VS36` (reverse rows also exist = 2-cycles, i.e. ADA-xxx aren't cabinets; real masters are 3DB15ADA/3DB18ADA/VS36ADA).
- Chains (alias → master that is itself an alias): `B-36FH/FHB36 → B36FH → BFH36`, `B-30FH/FHB30 → B30FH → BFH30` (BFH30/36 have NO priced lines; B30FH/B36FH do — the live-priced code is the one lines carry), `F-6-42 → F642 → WF642`, `WRC-30-15 → WRC3015 → LWR3015`, `W-24-18 → W2418 → W-2418`.
- Groups whose master has no priced line but an alias does (resolution must pick the line's code, not the master): 3VDB12/15/18/21/24, BFH24/27/30/33/36, LRM8, V3021DL/DR, V3621DL/DR, VA48, W-3930, W331524, W331824, W361224, W361524, W361824, W362424.
- Line coverage: Skyline-only groups dominate (dash variants W-xx-xx), Madison shares most W-xxxx/B-xx; Ashford carries W-39xx/W-42xx, B48, WF642, LWR3015, 3DB*.

Full group table (master | aliases | lines): `/tmp/bt9_audit.out` lines 33–390.

# Implementation progress (09:03 CT)

Done so far (uncommitted, local):
- `shared/codeEquivalence.ts` (+test, 11 pass): union-find two-way groups; normalization strips punctuation + single leading width zero (BT09=BT9).
- `server/lib/codeEquivalenceLoader.ts`: builds groups from sku_master_aliases(ok) + cabinet_aliases + altSku1-3 + NEW `cabinet_code_equivalences`; 30s cache.
- `server/routers/design.ts` priceForCabinetsByStyles: candidate cabinets widened to whole group; exact code wins; response adds `resolvedMasterCode`, `resolvedCabinetId`, `aliasSwapped`.
- Migration `drizzle/0170_faithful_ken_ellis.sql` APPLIED: tables `cabinet_code_equivalences` (seeded 6 rows: ERB33↔BER33, ERB36↔BER36 CORNER; BT9↔FHBO9/TBO9/B9/B-9) and `design_missing_price_events`.
- `server/routers/designMissingPrice.ts` registered as `designMissingPrice` (logMissing, adminList, adminResolve, adminEquivalences, alternatives).
- `shared/nomenclatureFamily.ts` (+test): CORNER family tagger (65 live codes, see docs/audits/corner-family-2026-10-03.txt), Part 4 ranking.
- Live-data test `server/routers/designCodeEquivalence.liveData.test.ts` (4 pass): ERB36 on Madison 330014 → BER36 price, Skyline keeps ERB36, Ashford → [] , BT09→BT9.
- Pre-existing failing test (before my change too): designPriceAliases.liveData.test.ts WFR2442 (price drift 265.06→253.81) — not caused by this work.

Remaining: client Part 1 flags (Floor Plan red outline + badge, 3D red outline, materials list "PRICE MISSING — code" + banner, checkout block, logMissing call), Part 4 popup (alternatives + Accept/Dismiss), admin tab "Designer Price Flags", docs/ledger, checkpoint, live proof.
Key client facts: DesignTool.tsx priceRows query ~L2830; priceMap ~L2870; unitPriceFor ~L2885; conflict banner ~L15273; cart export button ~L11790 (uses hasConflicts/window.confirm); PlanCanvas inConflict border ~L2469 (prop conflictUids); InteractiveRoom3D attributes outline BoxHelper ~L9205 (pattern for red outline); DesignMaterialsListDialog footer ~L170; AdminGroupedTabs tabs list ~L138/144, content ~L519/525; UnpricedCabinetsAdmin exists (catalog-level, different purpose).

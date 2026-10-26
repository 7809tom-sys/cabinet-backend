# Retired SKU master/alias audit — 2026-10-13

**Status: complete and applied.** This audit preserves every nomenclature code; it does not delete cabinet rows or distributor price rows.

## Rule applied

- Every code remains either a master cabinet code or an alias; no code is retired or hidden.
- Each previously inactive code is assigned to an active canonical master, or is promoted to an active master when the connected group has no stronger active candidate.
- The master is selected by total approved master/alias coverage first. Supplier-link count, active state, visibility, inbound links, and lexical order are tie-breakers.
- Alias targets are direct: an alias must resolve in one hop to an actual cabinet master.

## Before and after

| Measure | Before | After |
|---|---:|---:|
| Cabinet rows | 682 | 682 |
| Active cabinet rows | 552 | 682 |
| Inactive cabinet rows | 130 | 0 |
| Approved SKU aliases | 382 | 580 |
| Conflict aliases | 2 | 0 |
| Cabinet aliases | 514 | 607 |
| Code equivalences | 155 | 155 |
| Missing master targets | not previously counted | 0 |
| Alias chains | not previously counted | 0 |

**Result:** 130 previously inactive rows are now active and visible; 78 already had active canonical coverage, and 52 required promotion/normalization into the active master graph. There are now **0 inactive rows, 0 unresolved groups, 0 conflict aliases, 0 missing master targets, and 0 alias chains**.

## Important resolutions

- **BA-24:** the existing physical `BEC24` row was promoted under the canonical master code `BA-24`; `BEC-24` and `BEC24` remain active aliases.
- **W-2742:** remains the active master `W2742`; the legacy hyphenated code resolves directly to it.
- **RS family:** `RS18-TYPEA` through `RS36-TYPEA` won their connected groups by link/supplier coverage; `RS18`, `RS-18`, etc. remain aliases.
- **Wall-angle family:** `AW1230`, `AW1236`, and `AW1242` are the selected masters; `WCA1230`, `WCA1236`, and `WCA1242` remain aliases.
- No distributor SKU, price, cabinet dimension, catalog image, order, cart, or historical design row was deleted or rewritten.

## Promoted master rows

| Formerly inactive code | Final canonical master | Cabinet ID |
|---|---|---:|
| `ERB33` | `ERB33` | 9360041 |
| `ERB36` | `ERB36` | 9360042 |
| `WRC3015` | `WRC3015` | 9360166 |
| `RS18` | `RS18-TYPEA` | 9360181 |
| `RS21` | `RS21-TYPEA` | 9360183 |
| `RS24` | `RS24-TYPEA` | 9360185 |
| `RS27` | `RS27-TYPEA` | 9360187 |
| `RS30` | `RS30-TYPEA` | 9360189 |
| `RS33` | `RS33-TYPEA` | 9360190 |
| `RS36` | `RS36-TYPEA` | 9360191 |
| `DD-Q` | `DD-Q` | 9390037 |
| `KIOSK-DA` | `KIOSK-DA` | 9390045 |
| `LRM-8` | `LRM8` | 9390047 |
| `PR-30-15` | `PR3015` | 9390058 |
| `UOC3390(O339024)` | `UOC3390(O339024)` | 9390084 |
| `V-30-21DL` | `V3021DL` | 9390092 |
| `V-30-21DR` | `V3021DR` | 9390093 |
| `V-36-21DL` | `V3621DL` | 9390095 |
| `V-36-21DR` | `V3621DR` | 9390096 |
| `VA-48` | `VA48` | 9390099 |
| `W-3312` | `W-3312` | 9390142 |
| `W-3315` | `W-3315` | 9390144 |
| `W-3318` | `W-3318` | 9390145 |
| `W-3324` | `W-3324` | 9390147 |
| `W-39-30` | `W-39-30` | 9390160 |
| `WBC-27-30` | `WBC2730` | 9390166 |
| `WBC-27-36` | `WBC2736` | 9390167 |
| `WBC-27-42` | `WBC2742` | 9390168 |
| `WCA1230` | `AW1230` | 9390169 |
| `WCA1236` | `AW1236` | 9390170 |
| `WCA1242` | `AW1242` | 9390171 |
| `WDC2436` | `DCW2436` | 9390173 |
| `WR331524(W331524)` | `W331524` | 9390183 |
| `UOC339024` | `UOC3390(O339024)` | 9390366 |
| `3VDB15ADA` | `3VDB15ADA` | 9390383 |
| `VDB42` | `VDB42` | 9390391 |
| `VDB48` | `VDB48` | 9390392 |
| `MERCHHUTCH` | `MERCHHUTCH` | 9390461 |
| `B12-DISPLAYFRONT` | `B12-DISPLAYFRONT` | 9390462 |
| `10SWATCH` | `10SWATCH` | 9390464 |
| `AW-12-30` | `AW1230` | 9450008 |
| `AW-12-36` | `AW1236` | 9450009 |
| `AW-12-42` | `AW1242` | 9450010 |
| `DCW-2436` | `DCW2436` | 9450046 |
| `SB15MINI` | `SB15MINI` | 9450078 |
| `V-36-21TDL` | `V-36-21TDL` | 9450098 |
| `V-36-21TDR` | `V-36-21TDR` | 9450099 |
| `WER-2430` | `WER2430` | 9450181 |
| `WER-2436` | `WER2436` | 9450182 |
| `WER-2442` | `WER2442` | 9450183 |
| `ADA-3VDB15` | `3VDB15ADA` | 9690007 |
| `TEST-ONE-DOLLAR-1789756227567` | `TEST-ONE-DOLLAR-1789756227567` | 11310001 |

## Verification evidence

- Final database audit: `682` cabinet rows, `682` active, `0` inactive, `580` approved SKU aliases, `0` conflicts.
- Final alias graph verifier: `0` missing master targets, `0` alias chains, `0` conflicts.
- Representative live database checks confirmed `BA-24`, `W2742`, `ERB33`, `RS18`, `AW-12-30`, and `VDB42` are active and visible; representative legacy aliases resolve with `conflictStatus = ok`.
- The detailed 130-row pre-migration evidence and final verification payload are in the accompanying JSON report.

## Reusable scripts

- `scripts/apply_retired_sku_master_audit.ts` — idempotent initial promotion and alias assignment.
- `scripts/reconcile_sku_aliases.ts` — idempotent one-hop canonical alias reconciliation.
- `scripts/verify_alias_graph2.ts` — final missing-target, chain, and conflict verifier.

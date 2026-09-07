# Skyline Catalog Approval Report

**Purpose.** This is an evidence-only approval gate for the Skyline catalog. It proposes no database updates, price changes, publication changes, or source-identity disclosure. Every item below remains pending owner authorization.

## Evidence reviewed

| Evidence | Relevant finding | Treatment in this report |
|---|---|---|
| `notes/skyline-refresh.md` | 245 distinct orderable source codes were reconciled; 225 were matched to the CabinetDealz catalog. The source records identify 14 configuration discrepancies requiring review. | Uses the stated findings; does not infer additional mappings. |
| `references/skyline-trim-audit-report.md` | The earlier trim review documented discontinued items, possible coverage differences, and initially flagged valance sizes for investigation. | Treated as historical audit evidence only. |
| `scripts/skyline-audit.md` | The later active-item audit lists VA-30, VA-36, and VA-42 as Skyline items, alongside the already identified cabinet families. | Prevents a duplicate “add valance” recommendation. |

## Guardrails

| Boundary | Required treatment |
|---|---|
| Pricing | **No price columns may be changed.** The confirmed Skyline instruction is that the existing multiplier already makes pricing correct. |
| Product identity | Do not merge or overwrite records when a code, product role, dimensions, door count, or eligibility is uncertain. Keep ambiguous mappings separate. |
| Public presentation | Continue white-label product presentation and do not disclose supplier or distributor identity on public storefronts. |
| Descriptions | Do not bulk-replace current descriptions with terse source-catalog text. Use source material only to verify product identity and configuration. |
| Availability | Do not activate inactive styles, products, or SKUs without explicit approval and source support. |

## Decisions requested

### 1. Correct 14 source-supported configuration discrepancies

The working notes group the 14 findings into three bounded corrections. No change should be made until the owner approves each group.

| Proposed group | Source-supported correction | Records implicated | Approval required |
|---|---|---|---|
| Wine racks | Change the product description/classification from refrigerator wall cabinet to **wall wine-rack cabinet**. | WRC-24-30, WRC-30-15, WRC-30-18 | Approve the name/configuration correction only; preserve SKUs, prices, styles, and availability. |
| Tall utility/pantry fronts | Align door counts with the manufacturer catalog: U-18 variants require two doors; U-24/U-30 variants require four doors. | U-18-84/90/96-24 and U-24/U-30-84/90/96-24 | Approve only after confirming that the current 2D/3D cabinet profiles support the corrected face counts. |
| Easy-reach base detail | Add the missing “with Lazy Susan” construction detail. | ERB-33 and ERB-36 | Approve only if the product specification and Designer configuration will remain consistent. |

> **Recommended decision:** Approve the three groups above as catalog-identity corrections, with a targeted preview and regression review before publication. They are not price or availability changes.

### 2. Resolve ambiguous mappings separately

The existing checklist identifies 89 rows with competing canonical or alias candidates, 13 platform-SKU collisions, and source-available rows connected to inactive masters. Those items should stay unresolved until their exact source identity, ownership, and availability are reviewed. They must not be batch-merged, activated, or overwritten as part of the 14 corrections.

> **Recommended decision:** Keep every ambiguous mapping and inactive-master candidate on hold. Approve a row-level reconciliation process only after a reviewer can see the source code, candidate record, dimensions, product role, and intended availability side by side.

### 3. Maintain the present trim and new-SKU posture

The earlier trim report flagged VA-30, VA-36, and VA-42 as potentially absent. The later active-catalog audit lists all three, so this report does **not** recommend adding them. Items labeled discontinued in the earlier source review remain excluded. The remaining possible new trim, filler, or sample-product candidates require confirmation that they are current, orderable products rather than reference diagrams or showroom items.

> **Recommended decision:** No bulk additions. Continue to hold any new trim, filler, shelf-board, interior-panel, sample, or display candidate until orderability and product identity are verified.

## Approval choices

Please reply with the identifiers you approve, or mark any item “hold.”

| Identifier | Decision requested | Default if no approval |
|---|---|---|
| A | Correct the three WRC wine-rack records | Hold |
| B | Correct tall utility/pantry door counts after renderer review | Hold |
| C | Correct ERB-33/ERB-36 lazy-Susan detail after Designer review | Hold |
| D | Begin an evidence-first, row-level ambiguity review | Hold |
| E | Evaluate additional confirmed-orderable trim/filler candidates one by one | Hold |

## Next action after approval

For each approved group, the implementation sequence will be: create a bounded record list; verify source identity and current database values; preview the Designer/catalog impact; add targeted regressions; apply only the approved fields; and publish only after the reviewed result matches the authorized decision. Prices, cost fields, public supplier visibility, and unrelated catalog records will remain unchanged.

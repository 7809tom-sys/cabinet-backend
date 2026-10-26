# Catalog link repair — 2026-10-03

## What was repaired

A catalog-maintenance change retired cabinet records while leaving their existing, published distributor SKU/price rows linked to the retired IDs. The Designer intentionally excludes inactive master records, which made priced products disappear from the catalog even though their price rows still existed. This was a **record-link problem**, not a price or SKU problem.

The repair relinked only rows whose source record had a verified, active equivalent. The existing distributor SKU text, availability, publication state, list price, cost, and sell-tier values were preserved exactly.

| Distributor line | Relinked published / available SKU rows |
|---|---:|
| Madison (`210002`) | 1,233 |
| Skyline (`180001`) | 1,891 |
| Ashford (`210001`) | 1,033 |
| Additional approved line (`2190003`) | 9 |
| **Total** | **4,166** |

## Verified restorations

On Iroy Dune / Madison (`styleId 330028`), `W3024` and `W362424` now link to active master records. Their existing price values were preserved; e.g. `W362424` retains list `$904.00`, homeowner `$351.50`, and cost `$222.47`.

The local browser matrix proof confirms every offered 30/33/36 width × height × depth over-fridge combination selects a catalog code whose displayed dimensions match that same record. The selected `W362424` placed into the Designer and priced as `$351.50` in the line item.

## Deliberately not auto-merged

The repair retained 404 published/available rows still linked to retired masters because an automatic relink would be unsafe:

- **272** have no verified active equivalence-group member.
- **106** already have a current active SKU row for the same style/item, so a second link would violate the one-SKU-per-style-item rule.
- **26** are 13 pairs of legacy rows that converge on one active target (notably `TF396` / `WF396` to `F396`). Their prices are identical but their source SKU text differs, so merging would discard a supplier SKU without explicit approval.

These entries remain intact rather than being deleted, repriced, or silently mapped to a different product.

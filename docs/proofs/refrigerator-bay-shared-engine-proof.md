# Refrigerator Bay — Shared-Engine Proof

**Date:** 2026-09-30  
**Scope:** 3D Designer and Continuous Wall Builder use one refrigerator-bay contract. No catalog prices or source catalog data were changed.

## Verified configuration

| Item | Measured result |
|---|---:|
| Refrigerator | 36″ W × 70″ H × 30″ D |
| Required clearance above refrigerator | 2″ |
| Cabinet above | 36″ W × 12″ H × 24″ D |
| Cabinet-above bottom / top | 72″ / 84″ |
| Finished panel height | 84″ |
| Refrigerator opening | 37″ |
| Left and right appliance clearance | ½″ each |
| Cabinet-above center versus refrigerator center | 0″ |
| Panel source depth in this proof | 24″ |

## Shared behavior now enforced

1. A refrigerator, its selected source-priced cap, cap fillers, and selected end panels move as **one assembly** on a plan drag, nudge, measured wall-offset change, Snap-to-wall action, or 3D movement.
2. An assembly move is rejected if a member would collide, leave a run, or leave the drawn room—no panel is silently left outside a Continuous Wall Builder wall.
3. Selecting or opening Attributes for a placed refrigerator reopens the same Refrigerator Options popup with its current dimensions, cap, and panel selection.
4. Deleting a refrigerator with linked parts asks whether to remove only the refrigerator or the whole bay.
5. The actual placed cap, panels, and fillers remain normal catalog records, so their source SKU/pricing flows into the cart, invoice, and materials list. Countertops stop at the refrigerator/panel break.

## Local browser renders

| Room model | Floor plan | 3D proof |
|---|---|---|
| Standard rectangular room | [Floor plan](refrigerator-current-standard-top.png) | [3D render](refrigerator-current-standard-front.png) |
| Continuous Wall Builder room | [Floor plan](refrigerator-current-continuous-top.png) | [3D render](refrigerator-current-continuous-front.png) |

Both renders show the cap centered above the refrigerator, panels on both sides, base cabinets butting the panels, one countertop on each base run, and the source-priced parts in the visible materials/price panel.

## Live-site verification

Checkpoint **51a8b852** was observed on `www.cabinetdealz.com`. The deployed `DesignTool-FqBVcyKA.js` contains the grouped refrigerator-move and complete-bay-delete code markers, and the same persisted fixture rendered successfully in both live room types:

| Live room model | Floor plan | 3D proof |
|---|---|---|
| Standard rectangular room | [Floor plan](refrigerator-live-standard-top.png) | [3D render](refrigerator-live-standard-front.png) |
| Continuous Wall Builder room | [Floor plan](refrigerator-live-continuous-top.png) | [3D render](refrigerator-live-continuous-front.png) |

The live browser run reported the same **37″ opening**, **½″ left/right gaps**, and **0″ cap-center offset**. It found the two `REPV3096` panels, `WR3612(W361224)` cap, source-priced `F342` cap fillers, B24 bases, and countertop in both rooms.

## Automated validation

- **495 focused tests passed**: refrigerator assembly geometry, Continuous Wall Builder 45° group movement and endpoint containment, popup behavior, DesignTool actions, 3D movement, and shared geometry.
- TypeScript check passed.
- Production build and `git diff --check` passed.

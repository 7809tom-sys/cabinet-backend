# Capital Specification Book Source Notes

**Authoritative source:** `/home/ubuntu/upload/Capital_Spec_Book_Single_Pages_V8_DIGITAL_ONLY_2.pdf`, *U.S. Cabinet Depot Specification Manual V8*, 87 pages.

The document groups cabinet specifications by product family. Pages 29–55 cover base cabinets; 56–69 cover wall cabinets; 70–72 cover tall cabinets; 73–78 cover vanities; 79–81 cover mouldings; 82–85 cover fillers and panels; and 86–87 cover accessories. Pricing tables appear on pages 23–27, but the product-specification pages are the authoritative source for structural product identity, dimensions, included components, and generic technical drawings.

## Verified WMS3018 source fact

Page 68, **“Specialty Walls – Wall Microwave Cabinet Kits,”** specifies `WMS3018` as a **Wall Microwave Cabinet Kit** with cabinet dimensions **30 × 18 × 12 inches**. It includes a separate shelf insert with dimensions **26½ × ¾ × 17 inches**, ships as two flat-pack boxes, and names `WMSSHELF` as the individual shelf-insert SKU. The page’s technical image matches the user-provided `WMS3018-8.jpg` generic product drawing. This source supersedes the prior incorrect “30-inch microwave wall/double door wall” metadata.

## Nearby verified wall specialty codes

On the same page, `WXR3018` is a distinct **Wall X Rack Cabinet Kit** at **30 × 18 × 12 inches** with a **26½ × 14½ × 11 inch** shelf insert; it must not inherit the WMS image or description. `WWC630` is a **Wall Accessory Wine Cubby**, **30 × 6 × 12 inches**, fitting six bottles.

## Current source-driven catalog policy

A Capital-specified product should be matched only by its exact code (or an already verified alias). The source image is a reusable **generic code-keyed technical drawing**; it belongs on the canonical master and is shared across finishes and distributors. No source image, description, dimension, feature, or alias is inferred from resemblance alone.

## Applied exact-code repairs

The following changes were applied only where a live CabinetDealz canonical master matched a printed Capital source code (or an already verified source-code mapping). No source pricing was imported or altered.

- `WMS3018` is corrected as the 30 × 18 × 12 Wall Microwave **Cabinet Kit**. `WMSSHELF` is corrected as its separate 26½ × ¾ × 17 shelf insert and now has a dedicated generic shelf-insert fallback drawing rather than reusing a wall-cabinet image.
- `O339624` now exposes the source-supported two-door, three-drawer oven-cabinet configuration.
- `U2484244RS` through `U3096244RS` now expose four doors and use source-backed descriptions/notes: four roll-out shelves, side-mounted ball-bearing glides with no soft close, and five flat-pack boxes. They remain unavailable in the storefront/designer because their existing visibility state was not changed.
- `BAM`, `COV`, `FBM`, `LRM`, and `SHM` now use their exact source profile names and dimensions.
- `BSV`, `BDEP`, and `VDEP` now use source-backed panel identity, dimensions, and zero door/drawer facts. `WSV42` was already source-aligned and was not changed.
- `CBT` and `CLDL` now use their source-backed Traditional Corbel / Classic Decorative Leg identities and dimensions, with zero door/drawer facts.
- `RS18` through `RS36` now represent the individual Type A roll-out shelf insert dimensions and hardware facts. Exact source aliases such as `RS18-Type A` resolve to their existing canonical master.

The reports in `docs/capital-spec-audit/` identify the remaining unmatched codes and source conflicts that were deliberately left untouched pending exact canonical ownership and code-keyed image provenance.

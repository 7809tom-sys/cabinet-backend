# Pelican Price-Shopping Research & Per-Category Markup Analysis

"Cost" = the currently-imported `listPrice` in the DB (owner confirmed this is OUR cost).
Market prices gathered via web search of major retailers/marketplaces (Home Depot, Lowe's, Kohler, Signature Hardware, Floor & Decor, quartz slab dealers, etc.), July 2026.

## Item-level findings

### Flooring — 20 mil dryback LVP planks (cost $58.00 / box)
- Retail 20 mil LVP: ~$2.00–$5.00 / sq ft; common ~$3.19/sq ft (~$97/30 sq ft case at Home Depot).
- $58 is a per-box wholesale cost; assuming ~30–36 sq ft/box → ~$1.60–$1.90/sq ft cost.
- Sources: homedepot.com (HDMLCL272RC $3.19/sq ft, $97.14/case), lowes.com (20 mil $1.00–$1.99/sq ft), reallycheapfloors.com ($2.00–$4.50/sq ft), facebook 20mil retail "regular $5.99/sq ft".
- Room for markup: HIGH. ~60–90% still lands ~$3.00–$3.50/sq ft, competitive.

### Quartz Slabs (Countertops) — 3cm super jumbo ~138"x79" (cost $1,250–$1,350 / slab)
- Retail full slab: ~$850–$1,750; mid-range ~$925–$1,040; premium $1,700+.
- Sources: marbinosurfaces.com ($925–$1,040), fabquartz.com super jumbo (from $837), zcbuildingsupply.com ($1,749), eurostone ($999+ starting), americanquartzgranite ($1,500–$8,000 installed).
- Room for markup: LOW at slab level. Cost is already high-end. ~10–25% → ~$1,400–$1,700 (premium only).

### Shower & Bath — marble-look shower surround/wall panels 60"x(30-36)"x96" (cost $581.43)
- Retail solid-surface/marble-look surround kits: ~$450–$900; Glacier Bay 4-pc ~$649; premium Swan/WOODBRIDGE higher.
- Sources: homedepot.com (Glacier Bay $649), lowes.com (allen+roth Carrara), woodbridgebath.com, swanstone.com.
- Room for markup: LOW–MODERATE. Cost near premium retail. ~15–35% → ~$670–$785.

### Sinks & Faucets — enameled cast iron farmhouse/apron sink, colored (cost $971.43)
- Retail cast iron apron sinks: ~$989–$1,800; Kohler Whitehaven ~$1,267; Signature Hardware Almeria ~$989; American Standard $1,325–$1,898 list; colored/premium up to ~$1,800.
- Sources: signaturehardware.com, homedepot.com (Kohler K-6489 $1,266.86), americanstandard-us.com, vintagetub.com ($1,499+).
- Room for markup: MODERATE–HIGH. ~30–50% → ~$1,270–$1,460; colored variants justify high end.

### Toilets & Bidets — one-piece / smart / matte black (cost $1,159.99–$1,569.99)
- Retail range very wide: budget one-piece $250–$770; mid one-piece $700–$1,200; smart bidet toilets $2,000–$2,250+ (Kohler Leap smart bidet $2,249).
- Sources: homedepot.com (Black one-piece avg $250–$2,000; Kohler Leap smart bidet $2,249.97), theinteriorgallery Siena ($1,200), allsumhome smart ($769+).
- Room for markup: MODERATE (depends on whether smart/bidet). If these are smart/luxury, cost $1,160–$1,570 supports ~25–45% → ~$1,450–$2,275, competitive with smart-toilet retail.

### Tile & Mosaic — decorative/large-format tile panels 48-66" (cost $195.33–$399.00)
- Comparable decorative/large-format & marble-look panels retail broadly; healthy spread above cost.
- Sources: newgendepot ($2.47/sq ft UV marble panels), izodekor large marble panels, dundeedeco faux marble.
- Room for markup: HIGH. ~40–60%.

## Recommended per-category markup (starting points, editable in admin)

| Category | Our Cost basis | Market read | Recommended markup % | Rationale |
|---|---|---|---|---|
| Flooring | ~$1.60–1.90/sq ft (box $58) | $2–5/sq ft retail | 70% | Lands ~$3.0–3.2/sq ft, mid-market competitive, strong margin |
| Tile & Mosaic | $195–$399 | wide, high spread | 55% | Decorative panels carry healthy retail markups |
| Sinks & Faucets | $971 | $989–$1,800 | 40% | ~$1,360 sell; between Kohler/premium colored |
| Toilets & Bidets | $1,160–$1,570 | $700–$2,250 (smart high) | 35% | ~$1,570–$2,120 sell; competitive if smart/luxury |
| Shower & Bath | $581 | $450–$900 | 25% | Cost already near premium retail; keep competitive |
| Quartz Slabs (Countertops) | $1,250–$1,350 | $850–$1,750 | 15% | Cost is high-end; slab margin thin, add value at fabrication |
| Samples | typically low/$0 | n/a | 0% (hide from retail) | Not consumer retail items |
| Marketing & Merchandise | mixed | n/a | 0% (hide from retail) | Not consumer retail items |

Notes:
- These are DEFAULT starting points. The whole point is they're editable per-category in the admin Pricing & Margins section (no hardcoding).
- Sell price = cost x (1 + category markup%). Zero/blank-cost items should be hidden from customer views until priced.
- Quartz/shower have thin slab-level margin; real margin on those lines comes at fabrication/install, not the slab markup.

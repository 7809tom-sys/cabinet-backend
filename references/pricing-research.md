# Cabinet Dealz — Competitive Pricing Research (working notes)

Date: 2026-06-21
Posture agreed with owner: "meet-or-beat — target ~5% under market median, never below cost floor."
Competitor set: Lily Ann Cabinets, Cabinet Kings, The RTA Store, Wholesale Cabinets,
Kitchen Cabinet Kings, Cabinets.com, Home Depot/Lowe's stock lines.

## Key structural finding
- The public catalog product page exposes only **Wholesale** and **Contractor** trade-pricing tabs plus an **MSRP** number.
- There is **no separate "homeowner/retail" price** surfaced to guests today; the de-facto homeowner number is the **MSRP**.
- Pricing is computed from `distributor_skus` rows (listPrice / wholesalePrice / contractorPrice) per cabinet × door style; MSRP shown ≈ list.

## Cabinet Dealz current prices (Aura Blanc / Aero Alba entry shaker, cheapest style shown)
| Code | Description | Contractor | MSRP (homeowner-facing) |
|---|---|---|---|
| B-24 | 24" 2-door 1-drawer base | $465.60 | $776.00 |
| W-30-30 | 30x30 double-door wall | $376.60 | $538.00 |
| SB-36 | 36" sink base | $485.10 | $693.00 |

## Competitor market prices (white shaker, RTA, comparable size) — from search snippets
B24 (24" base, white shaker RTA):
- Lily Ann (Charleston/White Shaker): ~$175–$186 special; some assembled higher
- Kitchen Cabinet Kings B24 Shaker Gray: (need exact)
- RTA Cabinet Supply B24 Classic White Shaker PRE-ASSEMBLED: $878 (assembled, not comparable)
- Craftsman Black/Natural shaker B24: $312.85 sale (premium finish)
- Rough RTA white-shaker B24 market band: ~$175–$315

W3030 (30x30 wall, white shaker RTA):
- Lily Ann Colorado White Shaker: $284.56 special (reg $1,138 — inflated MSRP tactic)
- Lily Ann Charleston Linen: $293.10 special
- Discount Kitchen Direct Shaker Gray: $249.00
- Rough RTA white-shaker W3030 market band: ~$249–$293

SB36 (36" sink base, white shaker RTA): need direct comps (typically ~$255–$330 RTA)

## Observations
- Competitors use an inflated "regular price" then a steep "special price"; the **special price is the real street price**.
- Cabinet Dealz MSRP is ~2.5–4x the competitor street price for the same nominal size.
- BUT comparison must account for: assembled vs RTA, plywood vs particleboard box, soft-close hardware,
  and the fact that Cabinet Dealz contractor price already includes a markup over distributor cost.
- The cost floor = distributor cost (wholesale/contractor basis). Need exact wholesale numbers to set a safe floor.

## TODO to finish research
- [ ] Capture wholesale price for each basket item (cost floor)
- [ ] Get 2-3 direct white-shaker comps for SB36 and 2 wall sizes
- [ ] Build median + recommended homeowner price (=~5% under median, >= floor) per item
- [ ] Recommend whether to add an explicit Homeowner tier vs. adjust MSRP

## Direct competitor comps (white shaker, comparable size) — captured 2026-06-21

### B-24 (24" double-door single-drawer base, white shaker)
| Retailer | Price (street) | Notes |
|---|---|---|
| Lily Ann (White Shaker) | $186.49 | RTA special |
| Kitchen Cabinet Kings (Antique White) | $375.44 | RTA |
| CabinetSelect (Shaker White) | $371.00 | RTA |
| Cabinets.com (Bright White, frameless) | $759.70 | assembled, premium |
| Kabinet King (Inset White, assembled) | $569.00 | assembled inset |
- RTA street median ≈ **$371** (range $186–$375 RTA); assembled runs $569–$760.

### W-30-30 (30x30 double-door wall, white shaker)
| Retailer | Price (street) | Notes |
|---|---|---|
| Lily Ann (Colorado White) | $284.56 | RTA special |
| Discount Kitchen Direct (Shaker Gray) | $249.00 | RTA |
| Kabinet King (USCD Shaker White) | $262.00 | RTA |
| The WC Supply (Weston White) | $303.50 | RTA wholesale |
| RTA Cabinet Supply (assembled) | $466.79 | assembled |
- RTA street median ≈ **$273** (range $249–$303 RTA); assembled ~$467.

### SB-36 (36" sink base, white shaker)
| Retailer | Price (street) | Notes |
|---|---|---|
| Prime Cabinetry (Destin White) | $436.99 | RTA |
| CabinetSelect (Navy Shaker) | $403.00 | RTA |
| Kabinet King (Inset White, assembled) | $591.00 | assembled inset |
- RTA street median ≈ **$420** (range $403–$437 RTA); assembled ~$591.

## Cabinet Dealz full tier ladder (captured)
| Code | Wholesale (floor) | Contractor | MSRP (homeowner) |
|---|---|---|---|
| B-24 | (need) | $465.60 | $776.00 |
| W-30-30 | (need) | $376.60 | $538.00 |
| SB-36 | $404.25 | $485.10 | $693.00 |

## Interpretation
- Cabinet Dealz MSRP sits ABOVE even assembled-cabinet competitor prices, and ~2x the RTA street median.
- The relevant question: are Cabinet Dealz boxes ASSEMBLED + all-plywood + soft-close? If so, the right
  comparison is the assembled tier (~$569–$760 B24, ~$467 W3030, ~$591 SB36), where current MSRP is closer
  but still high. If they ship RTA, MSRP is far above market.
- Cabinet Dealz CONTRACTOR price ($465 B24 / $377 W3030 / $485 SB36) already lands near the ASSEMBLED market,
  which suggests the platform is positioned as assembled/premium.

## TRIM / ACCESSORY — your cost & current tiers (captured 2026-06-21)
Format: code | subcat | yourCost range | homeowner range | contractor range | list range
- BAM | Base Angle Molding | $13.20–$26.29 | $35.20–$70.10 | $26.40–$52.58 | $39–$69
- BF-3 | Base Filler 3"x34.5" | $12.54–$14.05 | $33.44–$37.46 | $25.08–$28.10 | $33–$37
- F-3-96 | Filler 3"x96" | $31.85–$53.90 | $84.94–$143.74 | $63.70–$107.80 | $91–$170
- F-6-96 | Filler 6"x96" | $51.80–$81.60 | $138.14–$217.60 | $103.60–$163.20 | $148–$272
- FBM | Flat Base Molding 4"x96" | $62.30–$74.55 | $166.14–$198.80 | $124.60–$149.10 | $178–$239
- CBT | Corner Base Trim | $62.30–$91.80 | $166.14–$244.80 | $124.60–$183.60 | $178–$306
- COV | Cove Molding 96" | $75.00–$99.60 | $200.00–$265.60 | $150.00–$199.20 | $233–$332
- BCM-8 | Base Crown 8"x96" | $63.00–$71.40 | $168.00–$190.40 | $126.00–$142.80 | $180–$204
- CM-4 | Crown 4"x96" | $61.25–$73.50 | $163.34–$196.00 | $122.50–$147.00 | $175–$210
- CM-8 | Crown 3-1/4"x96" | $13.50–$58.80 | $36.00–$156.80 | $27.00–$117.60 | $45–$168  (WIDE/inconsistent — flag)
- DWR-3 | Drawer Front 3" | $45.85–$58.20 | $122.26–$155.20 | $91.70–$116.40 | $131–$194

## TRIM — market street prices (white shaker, 96") captured 2026-06-21
Crown molding 96":
- Kabinet King CM96 (Ice White): $67.00
- Kitchen Cabinet Kings CM96K-4: $184.40
- RTA Cabinet Store BCM8 (Florence): $136.35
- CabinetSelect WS-COV (3-1/2"x96"): $137.00
- Lily Ann Angle Crown 96": $142.76
- RTA Wholesalers (4-1/4"): $146.52
=> crown street median ≈ **$137** (range $67–$184)

Filler 3"x96":
- Discount Kitchen Direct (Dove White): $50.00
- CabinetSelect WS-F396 list: $157.00 (list; street lower)
- RTA Cabinet Store F396-SW: (~$50–$70 street)
=> 3"x96" filler street median ≈ **$55** (range $50–$70 street; one $157 list outlier)

Light rail molding 96":
- Lily Ann Angle Light Rail: $64.80
- CabinetSelect Double Shaker: $84.80
- RTA Wholesalers: $63.18
=> light rail street median ≈ **$65**

Skin/veneer panel:
- Buy Wholesale Cabinets base skin: $42.00

## TRIM interpretation / FLAGS
- Your trim cost→homeowner markup is a flat ~2.67x (same as cabinets). For commodity trim sticks this OVERPRICES vs market:
  * CM-4 / CM-8 / BCM-8 crown homeowner $156–$196 vs market ~$137 median (and as low as $67). HIGH.
  * COV cove $200–$266 vs crown/cove street ~$137. HIGH.
  * F-3-96 filler $85–$144 vs street ~$55. HIGH.
  * F-6-96 filler $138–$218 vs ~$90–$110 street. HIGH.
  * FBM base molding $166–$199 — base molding is cheap commodity; HIGH.
- BF-3 small base filler $33–$37 is reasonable.
- CM-8 has a broken-looking range ($13.50 cost to $58.80 cost / $36–$157 home) — likely a data inconsistency to clean up.
- Recommendation: trim should NOT use the cabinet 2.67x markup. Use a lower trim multiple (~1.6–1.8x cost)
  to land near market: e.g., CM-4 cost ~$61 -> ~$110–$125 home; F-3-96 cost ~$32 -> ~$55–$60 home.

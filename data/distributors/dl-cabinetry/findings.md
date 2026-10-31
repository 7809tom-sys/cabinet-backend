# DL Cabinetry vs Kitchen Crest vs CabinetDealz.com: findings (2026-10-30)

Sources and how old they are:
- DL: "Price List - P5 (v1_13_26)" PDF from Rich, received 2026-10-09. These are DL's published Core/Slim/Luxe prices. DL sells direct, and **no dealer discount was provided**, so these are treated as the price we would pay before any discount.
- Kitchen Crest: kc_price_2022.xlsx, "List Price (Updated)" sheet, "Updated as of 6/16/2022". It is **more than 4 years old**. The White (SW) list column was used. The sheet's multiplier cell E1 = 0.4 suggests dealer cost = 40% of list. The KC 2026 catalog (kcc.txt) has no prices.
- CabinetDealz.com: live public read-only API, pulled 2026-10-30 (design.priceForCabinets). For three white shaker lines (Madison SW 330014, Preston SW 390001, Ashford WS 330013) it returned `listPrice` (distributor list) and `contractorPrice` (the price CabinetDealz charges). Comparisons use contractorPrice.

Median % difference, DL Core vs the other source (negative = DL is cheaper):
| Category | vs KC 2022 list | vs Madison SW site | vs Preston SW site | vs Ashford WS site |
|---|---|---|---|---|
| Base | -59.9 (n=25) | -35.0 | -32.0 | -37.5 |
| Wall | -54.4 (n=51) | -30.1 | -22.6 | -21.4 |
| Tall | -54.3 (n=12) | -28.7 | -20.9 | -27.5 |
| Vanity | -68.2 (n=3) | -43.8 | -46.2 | -49.2 |
| All | -58.0 (n=91) | -32.6 (n=86) | -26.4 (n=90) | -26.1 (n=84) |

Compared with KC **cost** (40% of the 2022 list), DL Core is a median **+4.9% higher** (n=91; DL is cheaper on only 21 of 91). This is roughly at parity, but the KC figures are from 2022.
Examples: B24 is DL $166, KC22 list $407 (cost $162.80), site contractor $246.35 (Madison) / $240.65 (Preston). SB36 is DL $183, KC22 $441, site $267.31/$260.52. W3030 is DL $139, KC22 $343, site $211.12/$202.72/$174.21. DB24 (= 3DB24) is DL $221, KC22 $551, site $333.35. WP249027 (= U249024) is DL $420, KC22 $942, site $599.39.
The one exception is the sample door: DL $20 vs Madison $3.17 contractor.
DL Slim is about +10% and Luxe about 2x, so Luxe is generally above site contractor prices. See price_compare.csv.

## Go-live prep (2026-10-30)

### Door styles found on dlcabinetry.com (13) and their line
Source list: https://www.dlcabinetry.com/collections and https://www.dlcabinetry.com/pages-sitemap.xml. Each gallery is at https://www.dlcabinetry.com/<slug>-gallery.
No public page (galleries, collections, homepage, blog posts) labels any door as Core, Slim or Luxe.

| styleCode | DL name | line | basis |
|---|---|---|---|
| DL-WS | White Shaker | Core | Tom: Core is the white shaker baseline (not stated on site) |
| DL-SSA | Slim Shaker Alabaster | Slim? | INFERRED from the name only, unconfirmed |
| DL-SSE | Slim Shaker Ebony | Slim? | INFERRED from the name only, unconfirmed |
| DL-LUXE-TBD | placeholder | Luxe | no door identified for Luxe |
| DL-VS, DL-PW, DL-GW, DL-EWO, DL-DW, DL-DG, DL-DC, DL-CG, DL-CM, DL-MC | Versa Shaker, Pearl White, Glacier White, European White Oak, Driftwood, Dove Grey, Dark Caramel, Cyber Grey, Champagne Mist, Midnight Cove | LINE UNKNOWN | door_styles rows only, no SKUs |

### Multipliers: BLOCKED
Rich's 2026-10-09 email has no body; the PDF does not say list vs dealer cost; the discount is unknown.
Formula (schema.ts): costMultiplier = baseMultiplier × (1 + freightMultiplier); our cost = PDF price × costMultiplier.
- Scenario A, PDF = dealer cost: baseMultiplier 1.0, cost = PDF price (plus freight if any). Core then sits ~+4.9% above KC cost and ~26–33% below current site contractor prices.
- Scenario B, PDF = list: baseMultiplier = (1 − discount), discount unknown; cost = list × (1 − discount). Example only: a 0.40 factor would make Core cost ~58% below KC cost.
### retailPriceBasis
Recommend `cost_plus_tier` (keep our controlled tier ladder). Use `source_list` only if Rich confirms the PDF is a verified published retail/list price; under scenario A it would sell at cost.

### Freight origins (2026-10-31)
Six candidate LTL origins, all in `distributors.warehouseZips` (see README): 32256 Jacksonville (HQ), 78754 Austin, 37086 La Vergne/Nashville, 70126 New Orleans, 32822 Orlando, 33634 Tampa. Nearest-to-destination is the default; the quote shows the origin ZIP used. Earlier text that said "origin ZIPs TBD" is superseded. Not yet checked: whether DL SKUs have packaged weight and cube data for the live quote.

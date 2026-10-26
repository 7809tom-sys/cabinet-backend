# Pelican Faucet Public-Source Audit — 2026-10-18

## Official sources consulted

- [Kitchen Faucets](https://buildpelican.com/collections/kitchen-faucets)
  - Public collection reports **18 products**.
  - Includes pull-down, pull-out, bridge, wall-mounted, pot-filler, and other kitchen faucet types.
  - Publicly displays product cards with images, product links, prices, and variants.
- [Bathroom Faucets](https://buildpelican.com/collections/faucets/bathroom)
  - Public collection reports **19 products**.
  - Includes Cascade vanity faucets, Flowline freestanding tub faucets, and Hydra shower/bathtub faucet sets, as well as a pop-up drain entry.
- [All Faucets — page 1](https://buildpelican.com/collections/faucets)
- [All Faucets — page 2](https://buildpelican.com/collections/faucets?p=2)
- [All Faucets — page 3](https://buildpelican.com/collections/faucets?p=3)
  - Public collection reports **44 products** across three pages, including faucet accessories (such as soap dispensers, drains, deck plates, and an air switch) alongside kitchen and bath fixtures.

## Source evidence used

The public Pelican collections expose product pages, item codes, current public starting prices, product imagery, and variant options. The browser-confirmed kitchen collection hydrated to show 18 product cards with images, including PL-8218, PL-8248, PL-8217, PL-8222, and PL-8203. The source catalog will be reconciled at the **variant SKU** level, rather than assuming a product-family code is sufficient for an exact finish.

## Design requirements retained during reconciliation

1. Use only official Pelican product imagery and public source data; do not substitute generic faucet photos.
2. Preserve every exact SKU/finish identity, image reference, price, and source product URL.
3. Make each source-verified faucet selectable with its image in the Designer, like the hardware picker.
4. Keep kitchen and bathroom fixture paths separate. Bathroom vanity faucets must not appear in the kitchen sink workflow.
5. Do not add a Designer-visible line item unless it has a positive price or is explicitly marked quote-required; no invented prices.
6. A faucet selection must persist to the saved plan and render as the selected faucet, not a generic faucet.

## Initial public-source observations

- Kitchen collection contains 18 public products. Examples: PL-8224, PL-8207, PL-8369 (pot filler), PL-8210, PL-8480 (bridge), PL-8410 and PL-8461 (wall-mounted), PL-8237, PL-8231, PL-8206, PL-8257, PL-8211, PL-8218, PL-8248, PL-8217, PL-8222, PL-8203, PL-8213.
- Bathroom collection contains 19 public products. Examples: PL-8107, PL-8116, PL-8136, PL-8162, PL-8142, PL-8112, PL-8330, PL-8312, PL-8104, PL-8113; Flowline PL-8515/PL-8522/PL-8538; and Hydra PL-86H15/PL-86A23/PL-86S22/PL-86A33/PL-86H55.
- Product pages and Shopify collection JSON will be used for the machine-readable reconciliation and current image URLs.

## 2026-10-19 variant reconciliation result

The source reconciliation separates actual faucet variants from the broader public collection, which also contains drains, disposal trim, deck plates, soap dispensers, and air-switch accessories. The **114 public faucet variants** matched active local catalog rows one-for-one: all 114 have a local catalog image and a positive authorized source-price field. No faucet variant was unmatched.

- **Kitchen:** 48 public faucet variants; all 48 are active, priced, and photographed locally. Thirty-three have an exact Pelican technical profile for the present sink-mounted 3D workflow. Fifteen remain catalog-covered but cannot be represented as a generic sink-mounted fixture because they are bridge, wall-mounted, or otherwise lack supported single-hole mounting geometry.
- **Bathroom:** 66 public faucet variants; all 66 are active, priced, and photographed locally. Two PL-8112 vanity faucet finishes have an exact profile for the current vanity workflow. Freestanding tub and shower systems remain in the bathroom catalog and require their own placement workflows rather than being treated as vanity faucets.
- **Collection-wide accessory note:** the earlier 146-variant public all-faucets reconciliation includes five unmatched accessory/drain codes. They are not missing kitchen or bathroom faucet fixtures and remain excluded from the sink-mounted faucet picker.

The regular Designer quick-change picker should therefore show the complete list returned by the strict measured-fixture API, with each card carrying the official image, exact SKU, and calculated price. Catalog coverage does not authorize invented 3D mounting geometry: unmeasured bridge, wall-mounted, tub, shower, and accessory products must remain separate until their supported workflows exist.

## 2026-10-19 official technical-fixture evidence

### PL-8410 and PL-8461 — wall-mounted kitchen faucets

Pelican’s official product pages classify both families as **Wall Mounted Kitchen Faucet - Double Handle**. The product records identify 8-inch centers and the official technical drawings provide enough physical envelope information for a dedicated wall-mounted, two-handle kitchen fixture workflow. Neither product may be represented as a single-hole deck faucet.

- **PL-8410 BN / PL-8410 MB:** 8-inch (203 mm) centers; 12-5/8-inch overall lateral envelope; 10-1/2-inch overall vertical dimension; 7-1/2-inch outlet-height dimension; 9-3/4-inch forward reach. Official source: [product page](https://buildpelican.com/products/pl-8410), [technical drawing](https://buildpelican.com/cdn/shop/files/PL-8410LD.png?v=1776786236), and Pelican’s compatible-sink technical PDF confirming 8-inch-center wall-mount compatibility: [PL-CI8004 specification](https://cdn.accentuate.io/8980582989964/1776100660059/PL-CI8004-Spec.pdf?v=1776100660059).
- **PL-8461 BN / PL-8461 MB:** 8-inch (203 mm) centers; 14-1/4-inch overall lateral envelope; 4-3/8-inch overall vertical dimension; 3-1/8-inch outlet-height dimension; 8-3/4-inch forward reach. Official source: [product page](https://buildpelican.com/products/pl-8461), [technical drawing](https://buildpelican.com/cdn/shop/files/PL-8461LD.png?v=1776783551), and [PL-CI8004 specification](https://cdn.accentuate.io/8980582989964/1776100660059/PL-CI8004-Spec.pdf?v=1776100660059).

The public sources do **not** document hole diameter, valve connection, rough-in depth, finished-wall tolerance, or required mounting height. A safe workflow must require a selected mounting wall, an explicit project mounting height, and a sink/bowl target; it must not invent construction validation for the undocumented values.

### PL-8538 — floor-mounted freestanding tub filler

The official Pelican page classifies PL-8538 as a **Freestanding Bathtub Faucet With Hand Shower - Single Handle**, explicitly designed to operate outside the tub basin and floor-mounted. Its official line drawing supplies a 5-7/8-inch base width, 8-7/8-inch spout reach, 41-7/8-inch maximum height, 36-1/4-inch spout-top height, and 35-inch outlet height. The active finishes are PL-8538 BG, PL-8538 BN, and PL-8538 MB. Official source: [product page](https://buildpelican.com/products/pl-8538) and [technical drawing](https://buildpelican.com/cdn/shop/files/PL-8538LD.png?v=1774294349).

This supports a bathroom-only, floor-anchored tub-filler workflow adjacent to a freestanding tub, without a countertop association or a made-up floor cutout. Pelican’s public materials do not state a floor-hole/rough-in specification, so that installation item remains explicit installer confirmation.

### PL-8480 — bridge kitchen faucet

Pelican publicly identifies PL-8480 as a **Deck Mounted Bridge Kitchen Faucet - Double Handle** with a `4" Spread` tag. Active finishes are PL-8480 BG, PL-8480 BN, PL-8480 CHR, and PL-8480 MB. Official source: [product page](https://buildpelican.com/products/pl-8480) and [variant record](https://buildpelican.com/products/pl-8480.js).

Pelican does not currently publish a technical drawing or dimensions for PL-8480: no overall height, spout reach, spout height, exact hole count, center-to-center definition, hole diameters, or maximum deck thickness are available in the official public material. It remains catalog-visible but must not enter a measured 3D bridge workflow until Pelican supplies that data.

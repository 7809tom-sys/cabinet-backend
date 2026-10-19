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

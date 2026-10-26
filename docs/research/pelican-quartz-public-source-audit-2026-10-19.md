# Pelican Quartz Public-Source Audit — 2026-10-19

## Official sources consulted

- [Pelican Quartz collection](https://buildpelican.com/collections/quartz)
  - The official collection declares **29 products** across two catalog pages.
  - Product cards identify the product name, public starting price, stated slab size, thickness, availability, and official product page.
- [Pelican Quartz collection — page 2](https://buildpelican.com/collections/quartz?p=2)
- [Pelican Quartz collection JSON](https://buildpelican.com/collections/quartz/products.json?limit=250)
  - The public Shopify collection data is the reconciliation authority for current product handles, variant SKUs, prices, availability, tags, descriptions, and official card-image URLs.

## Reconciliation rule

Reconcile at the exact public variant/SKU level. Each source record is matched to `pelican_products.pelicanCode` after neutral punctuation/case normalization. A product family name alone is insufficient where Pelican exposes multiple variants, such as Riviera 3cm Left and Riviera 3cm Right.

For a missing row, preserve the official product title, public product handle, exact variant SKU, public description, stated slab size, public image URL, and retrieval date in the guarded import manifest. The database row uses:

- `category: "Quartz Slabs (Countertops)"`
- `subCategory: "Quartz Slab"`
- `listPrice` only for a verified supplier price basis unless a separate actual landed cost is supplied
- a rehosted official card image in `imageUrl`
- `materialImageUrl: null` unless a separately vetted repeatable material swatch is available
- `unsupportedOverhangLimitIn: null` unless Pelican or a fabricator provides an exact verified limit

The public Pelican collection price must not be copied into a cost field without verifying the pricing policy. Cabinet Dealz applies the category markup to the positive `yourCost` or `listPrice` base, so treating a public retail price as cost could compound retail pricing.

## 2026-10-19 live catalog result

The source JSON returned **29 products and 30 exact variants**. All **30/30 variants** match active Cabinet Dealz quartz rows by exact normalized SKU. Every matched row has a positive authorized price basis, an active catalog image, catalog visibility, and Designer visibility. Therefore there were **no missing official quartz variants to add** in this run.

The source collection has one two-variant product: Riviera 3cm exposes distinct **Left** and **Right** exact SKU records. Both are already present independently.

The source audit found that the local quartz table has 35 rows, five more than the public collection. These retained local-only rows are not proof of missing current Pelican products; they must not be silently retired, hidden, or deleted without separate source evidence and explicit approval.

Official source card photos remain catalog imagery only. A retail/staged card image is never promoted into `materialImageUrl`.

## Review findings deliberately not applied

The five local-only rows are **Apollo 3cm**, **Calacatta Terremotto Left**, **Calacatta Terremotto Right**, **Pietra Grey 3cm**, and **Full Moon 3cm (old)**. No action was taken on them. Their absence from this one current public collection is insufficient evidence to retire a catalog row or alter existing customer selections.

Pelican currently marks **Calista 3cm**, **Icelandic 3cm**, and **Icelandic 3cm Super Jumbo** as out of stock in its public collection. Cabinet Dealz keeps those rows active and visible pending a separately authorized availability policy; this reconciliation does not use a public out-of-stock signal to hide or retire a product.

All 30 current public source prices differ from the local `msrp` references. The local source-price bases remain positive and resolve as `listPrice` values. No price was overwritten: the public product price may be a consumer retail value, while Cabinet Dealz applies an 18% quartz-category markup to the stored authorized base. Updating a base cost from the public retail value without a supplier cost confirmation could compound markup.

There are no source-to-local slab-size mismatches. Eight supplier product handles differ from locally unique slugs, including the two Riviera orientation variants and several `jumbo` versus `super-jumbo` suffixes; each still matches its exact source SKU. The names and codes, not an arbitrary supplier handle, remain the matching authority.

## 3D material-source qualification — completed

Official Pelican product galleries distinguish clean named slab photography from staged room and insetting photography. For example, the Bedrock page exposes `BedrockSlab.jpg` alongside `BedrockInsetting.png`, `BedrockMidLevel.jpg`, and `BedrockCloseUp.jpg`; the Calacatta Oro page exposes its named `CALACATTAORO3CM_A` through `D` product images separately from `Kitchen2` room images. Only the clean, exact-product slab image may be evaluated as a material-map candidate. Staged kitchens, inset counters, close-up details, generic series art, and image-generated substitutes are excluded. [1] [2]

The regular Designer already passes a selected countertop’s distinct `catalogCountertopImageUrl` into its surface-texture loader, independently of the product-card image and selected product identity. Assigning a qualified exact slab map therefore does not require countertop geometry, price, selected-surface persistence, or Continuous Wall Builder changes. The current source page does not state that its photographs are seamless/tileable texture assets. Any approved image must consequently be mapped as one exact slab face rather than promoted to an arbitrarily repeated material pattern unless Pelican supplies a specifically repeatable manufacturer texture.

The currently stored Bedrock 3D asset is a 1260×630 WebP whose average pixel color materially differs from Pelican’s current 2000×1500 `BedrockSlab.jpg`; it is not treated as proof that the remaining current product maps may be inferred from it. Each candidate must be retained with its exact product URL, source image URL, file dimensions, and visual qualification result.

### Applied source-only map update

On 2026-10-19, each current official variant was matched to its specific official clean slab image. The material-bearing interior was deterministically cropped—without generative editing, recoloring, tiling, or substitution—and rehosted through the approved project storage workflow. The checked-in registry at `client/src/lib/pelicanQuartzMaterialMaps.ts` records the official product URL, exact official source image URL and filename, input dimensions, crop coordinates, rehosted map URL, and physical slab coordinate basis.

- **29 physical slab maps / 30 official variants** were approved: Riviera Left and Right correctly share the one source product slab map.
- Standard 3 cm variants use a documented **126 × 63 inch** finite coordinate basis; Super Jumbo variants use **138 × 79 inches**. The 3D renderer preserves world-slab coordinates across adjacent countertop pieces rather than turning these photographs into generic repeated texture patterns.
- The guarded live update changed **only `pelican_products.materialImageUrl` on 30 current official rows**. It did not add, retire, hide, rename, reprice, re-categorize, or alter availability, source/card imagery, overhang limits, or selected-plan data.
- An all-row before/after snapshot check verified 35 quartz rows total, 30 changed rows, and `materialImageUrl` as the sole changed field. The five local-only/historical rows—Apollo 3cm, Calacatta Terremotto Left, Calacatta Terremotto Right, Pietra Grey 3cm, and Full Moon 3cm (old)—remain active and untouched. In particular, the retained `(old)` code is not normalized into the current Full Moon source map.

The completed map set makes every current official Pelican Quartz selection photo-accurate in the regular Designer without changing countertop geometry, continuous-run behavior, physical cutouts, raised bars, tiered peninsula voids, pricing, or Continuous Wall Builder behavior.

## References

[1]: https://buildpelican.com/products/bedrock-3cm "Pelican Bedrock 3cm product page"
[2]: https://buildpelican.com/products/calacatta-oro-3cm "Pelican Calacatta Oro 3cm product page"

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

All official source card photos are retained as catalog imagery only. Quartz products may remain selectable and priced in the Designer when their repeatable 3D material swatch is pending, using the established neutral preview. A retail/staged card image is not promoted into `materialImageUrl`.

## Review findings deliberately not applied

The five local-only rows are **Apollo 3cm**, **Calacatta Terremotto Left**, **Calacatta Terremotto Right**, **Pietra Grey 3cm**, and **Full Moon 3cm (old)**. No action was taken on them. Their absence from this one current public collection is insufficient evidence to retire a catalog row or alter existing customer selections.

Pelican currently marks **Calista 3cm**, **Icelandic 3cm**, and **Icelandic 3cm Super Jumbo** as out of stock in its public collection. Cabinet Dealz keeps those rows active and visible pending a separately authorized availability policy; this reconciliation does not use a public out-of-stock signal to hide or retire a product.

All 30 current public source prices differ from the local `msrp` references. The local source-price bases remain positive and resolve as `listPrice` values. No price was overwritten: the public product price may be a consumer retail value, while Cabinet Dealz applies an 18% quartz-category markup to the stored authorized base. Updating a base cost from the public retail value without a supplier cost confirmation could compound markup.

There are no source-to-local slab-size mismatches. Eight supplier product handles differ from locally unique slugs, including the two Riviera orientation variants and several `jumbo` versus `super-jumbo` suffixes; each still matches its exact source SKU. The names and codes, not an arbitrary supplier handle, remain the matching authority.

# Pelican Flooring — Public Source Audit

**Audit date:** 2026-10-19  
**Scope:** Public Pelican flooring collection reconciliation for Cabinet Dealz; no source price is treated as supplier net cost without authorized dealer evidence.

## Official public sources

- Collection: <https://buildpelican.com/collections/flooring>
- Machine-readable collection export: <https://buildpelican.com/collections/flooring/products.json?limit=250>

The collection page identified **48 products** on the audit date. The official collection JSON returned **235 exact purchasable variants** with product name, SKU, public availability, public price, and official Shopify imagery.

## Reconciliation result

The read-only reconciliation matched Shopify `variant.sku` to `pelican_products.pelicanCode` using punctuation/case-insensitive exact identity.

| Measure | Count |
|---|---:|
| Official products | 48 |
| Official purchasable variants | 235 |
| Official floor-covering variants | 72 |
| Official accessory / trim / underlayment variants | 163 |
| Unclassified source variants | 0 |
| Existing local Flooring rows | 252 |
| Exact source variants already matched | 230 |
| Exact current source variants not yet present | 5 |
| Source variants without an official SKU | 0 |
| Local-only retained rows | 22 |

### Exact official variants not yet present

| Official code | Product / source variant | Public availability | Public price | Official product image |
|---|---|---|---:|---|
| `Tigertail 12mil Vinyl Flooring` | Tigertail — 12mil Planks | Available | $104.65 | `TIGERTAIL_A.jpg` |
| `Tigertail 20mil Vinyl Flooring` | Tigertail — 20mil Planks | Available | $79.23 | `TIGERTAIL_A.jpg` |
| `Sanibel 12mil  Vinyl Flooring` | Sanibel — 12mil Planks | Out of stock | $104.65 | `SANIBEL_A.jpg` |
| `Madeira 20mil Vinyl Flooring` | Madeira — 20mil Planks | Available | $79.23 | `MADEIRA_A.jpg` |
| `Madeira Liteback Vinyl Flooring` | Madeira — Liteback Planks | Available | $159.99 | `MADEIRA_B.jpg` |

The source JSON contains the exact image URLs for each row; those URLs are recorded in the local reconciliation artifact during the active work session.

## Price and visibility boundary

The official collection exposes a **public storefront price**, but it does not disclose an authorized dealer cost/net basis for the five unmatched variants. Cabinet Dealz computes sell price from a positive authorized `yourCost` or `listPrice` plus the configured Flooring markup. Therefore:

1. The five codes must not be imported with the public Shopify price in `yourCost`.
2. They must not become Designer-selectable until a positive authorized price basis exists; Designer items cannot be unpriced.
3. They are imported as active, catalog-visible **quote-only** records: official public price is retained in `msrp` as source reference evidence, while `yourCost` and `listPrice` remain null. The public catalog shows `Call for pricing`; cart and Designer actions remain unavailable. This prevents a current source SKU from being silently omitted without manufacturing a sale price.

## User-supplied supplier price list reconciliation — 2026-10-19

The user supplied `NLSPrintForm(1).pdf`, a Pelican **Price List dated 7/1/2026**, addressed to First Class Flooring and Cabinet Design. Its prices are authorized supplier list bases, not customer retail prices and not landed cost.

| Exact current source SKU | Price-list evidence | Applied `listPrice` | Result |
|---|---:|---:|---|
| Tigertail 12mil Vinyl Flooring | PDF p. 145, 12pc/box 28.36 SF/box | $45.00 | Source-priced catalog product; existing Designer readiness remains unchanged pending an approved material map. |
| Tigertail 20mil Vinyl Flooring | PDF p. 145, 8pc/box 18.91 SF/box | $33.85 | Source-priced catalog product; existing Designer readiness remains unchanged pending an approved material map. |
| Madeira 20mil Vinyl Flooring | PDF p. 35, 8pc/box 18.91 SF/box | $33.85 | Source-priced catalog product; existing Designer readiness remains unchanged pending an approved material map. |

The document does **not** contain an exact selling line for current `Sanibel 12mil  Vinyl Flooring` (only samples/stair nose and Sanibel 20mil are listed) or `Madeira Liteback Vinyl Flooring` (the document lists **Sanibel** Liteback, not Madeira). Those two source-current SKUs stay catalog-visible quote-only: their `listPrice` and `yourCost` remain null, and no price is inferred from a family member or Shopify public price.

The guarded update modified only the `listPrice` field on the three exact matches. It left all five rows active/catalog-visible, outside the Designer, with their stored official imagery and public MSRP reference unchanged.

### Admin follow-up

The Pelican Catalog admin grid marks every item without a positive authorized cost or supplier list as **Needs authorized price**. For a source-current catalog-visible product that has only an MSRP reference, the note explicitly states that it is quote-only and outside the Designer, and directs the administrator to enter a verified cost or supplier list. The note applies to `Sanibel 12mil  Vinyl Flooring` and `Madeira Liteback Vinyl Flooring` until exact supplier pricing is supplied.
4. No existing local or historical rows are retired, hidden, renamed, price-mutated, or normalized into another SKU by this audit.

## Flooring accessory recommendation policy

The official collection combines planks and matching transition pieces within many product families. The regular Designer may offer accessories **only after a person chooses a floor**, and only as explicit suggestions:

- Suggestions are based on exact normalized family and wear-layer identity from authoritative catalog code/name fields.
- A trim with `12mil`, `20mil`, `22mil`, or `mm` metadata only matches the same floor variant.
- A trim without a wear-layer indicator is rejected when the family has multiple floor variants; no compatibility is guessed.
- Accessories are never auto-added, never replace the selected floor, never become a 3D floor material, and retain their own source-backed catalog price as an optional material/cart line.
- Generic baseboards or unrelated trim are not suggested without an exact family match.

## Preservation rules

Catalog product image (`imageUrl`) is distinct from an approved repeatable 3D material swatch (`materialImageUrl`). A retail/staged Shopify photo must never be promoted into a repeatable 3D texture merely because it is available in the public catalog.

# Pelican-Only Catalog Organization & Naming Roadmap

## Decision and Scope

CabinetDealz should adopt the **useful organization principles** of Pelican International’s public catalog while retaining its own brand, prices, product data, content, and user interface. This roadmap applies only to the imported **Pelican surfaces and fixtures** catalog. The cabinet catalog—including cabinet families, cabinet SKUs, cabinet prices, cabinet labels, and Designer cabinet navigation—will remain unchanged.

The objective is to let a homeowner or dealer understand a product before they learn its product code. Each Pelican item will keep its authoritative Pelican code for quotes, carts, orders, and support, but its browse card and detail page will lead with a practical product type and use description.

## Public Structure Worth Adapting

Pelican organizes customer browsing from a broad department to a product family, then provides application and specification filters. Its public top-level navigation separates **Kitchen**, **Bathroom**, and **Surfaces**. The Surfaces department leads to flooring, quartz, mosaics, surrounds, and accessories; Kitchen separates sinks, faucets, installation pathways, and accessories; Bathroom separates sinks, faucets, toilets, tubs, showers, doors, and accessories. [1]

Pelican’s collection pages use the same practical pattern. Flooring can be narrowed by installation, piece size, color tone, wear layer, thickness, and collection. Quartz can be narrowed by collection, slab size, and design type. Mosaics can be narrowed by material, application area, and waterproofing. Sinks can be narrowed by installation, material, mount type, and finish. [2] [3] [4] [5]

## Recommended CabinetDealz Pelican Departments

| CabinetDealz department | Plain-language shopping paths | Existing Pelican categories included | Product-information emphasis |
|---|---|---|---|
| **Kitchen Surfaces** | Countertops, Backsplash & Wall Tile, Kitchen Flooring | Quartz Slabs (Countertops), Tile & Mosaic, Flooring | Slab/sheet or plank size, thickness, material, installation/application, collection, color family |
| **Kitchen Fixtures** | Kitchen Sinks, Kitchen Faucets, Disposals & Sink Accessories, Range Tops | Sinks & Faucets, Range Tops | Installation or mount type, bowl/configuration, material/finish, size, compatible accessories |
| **Bathroom Fixtures** | Bathroom Sinks, Bathroom Faucets, Toilets & Bidets, Shower & Bath | Sinks & Faucets, Toilets & Bidets, Shower & Bath | Fixture type, mount style, drain/rough-in attributes, material/finish, size, compliance where supplied |
| **Bath Surfaces & Enclosures** | Mosaic Tile, Shower Surrounds, Glass Doors, Shower Accessories | Tile & Mosaic, Shower & Bath | Application area, waterproofing, module size, material, door/enclosure or surround configuration |

This structure is simpler than exposing the importer’s raw category names such as **Quartz Slabs (Countertops)** or **Sinks & Faucets** as the primary shopper language. The original category and subcategory remain retained underneath for data integrity and filter behavior.

## Clear Product Naming Rule

The public title should be a **plain-language name followed by the retained product code**, while the detail page retains all technical data verbatim. This does not rewrite the source identity. It gives people enough context to decide whether to open the product.

| Product group | Current source-style pattern | Recommended customer-facing pattern | Example |
|---|---|---|---|
| Quartz | Finish name plus thickness | **Finish — Quartz Countertop Slab**; retain slab size and thickness directly below | *Calacatta Oro — 3 cm Super Jumbo Quartz Countertop Slab*; `138 in × 79 in` |
| Flooring | Finish name plus construction | **Finish — [construction] Flooring**; retain plank/tile size and wear layer below | *Vanguard — Click-Lock Vinyl Flooring*; `9 in × 60 in planks` |
| Tile & Mosaic | Finish name plus material | **Finish — [material] [wall/floor] Mosaic**; retain sheet size and water/application suitability below | *Mystic Trace — Glass & Marble Wall Mosaic*; `11.81 in × 11.81 in sheet` |
| Sinks | Often an abbreviated source code | **[product code] — [mount/type] Sink**; retain dimensions immediately below | *PL-3082 — Vessel Sink*; `20 1/4 in × 14 1/8 in × 5 3/4 in` |
| Faucets | Finish/series or source code | **[series or product code] — [mount/control] Faucet**; retain finish and configuration below | *[Code] — Single-Handle Kitchen Faucet* |
| Bath fixtures | Source name or code | **[product code/name] — [fixture type]**; retain size, drain/mount, material, and compliance attributes below | *PL-7201 — 4-inch Spread Pedestal Sink* |

The format should never remove the product code. It should place the code in a consistent, secondary **“Item code”** line on catalog cards, product pages, the cart, quotations, and exports. A shopper can browse by meaning; a dealer can still order by code.

## Original Catalog Page Experience

The existing `Surfaces & Fixtures` landing page already has the foundation for category browsing. The staged improvement should make it task-led rather than importer-led.

| Page | Proposed organization | Purpose |
|---|---|---|
| **Surfaces & Fixtures home** | Four department cards: Kitchen Surfaces, Kitchen Fixtures, Bathroom Fixtures, Bath Surfaces & Enclosures | Helps a shopper start with the room and task, not unfamiliar catalog taxonomy. |
| **Department page** | Product-family cards followed by featured Pelican items | Lets a user choose *Countertops* or *Kitchen Sinks* before encountering full catalog filters. |
| **Product-family collection** | Clear title, one-sentence usage cue, filter drawer, featured products, and full grid | Keeps filtering relevant; for example, backsplash shoppers should not see toilet filters. |
| **Product detail** | Plain-language title, retained item code, specification summary, product description, price, images, related compatible products, and “Add to project” action where supported | Makes the decision and ordering identity equally clear. |

## Filter Model

The current CabinetDealz public API supports a category, an optional subcategory, search, paging, and popularity. The next stage should add normalized **display facets** for Pelican data without modifying cabinetry records. The existing source strings in `size`, `description`, `category`, and `subCategory` can support the first release; a curated facet table can follow only where parsing is ambiguous.

| Product family | Release-one filters | Later curated filters when source data supports them |
|---|---|---|
| Countertops | Collection, slab size, thickness, color/design family | Finish direction, movement level, jumbo availability |
| Flooring | Collection, installation method, plank/tile size, color tone, thickness, wear layer | Room suitability, water-resistance class, package coverage |
| Backsplash & mosaic | Material, wall/floor application, sheet/module size, waterproofing | Pattern geometry, color family, grout/installation guidance |
| Sinks | Kitchen/Bathroom, mount/installation, material, size | Bowl count, drain configuration, ADA attribute |
| Faucets | Kitchen/Bathroom, mount type, configuration, finish | Handle/control type, spray function, compatible sink type |
| Shower & bath | Fixture/enclosure/surround/accessory, material, configuration | Drain position, glass style, series, compatible hardware |

## Phased Implementation

| Stage | Change | Cabinetry impact | Acceptance test |
|---|---|---|---|
| **1. Information architecture** | Add Pelican-only department and product-family routes; keep existing raw category routes as redirects or technical fallbacks. | None. | Cabinet pages and Designer cabinet categories are unchanged. |
| **2. Readable labels** | Add a shared display-name and product-type helper for Pelican cards, detail pages, search results, cart lines, and surface pickers. | None. | Product code, price, slug, cart identity, and source description remain intact. |
| **3. Practical filters** | Add Pelican-only faceted filters based on reliable source data. | None. | Each filter returns only matching Pelican products; no cabinet queries or tables are touched. |
| **4. Guided use paths** | Add product-family descriptions, selection help, and product pairings such as sink-to-faucet. | None. | Links preserve the selected Pelican product and its quoted price. |
| **5. Designer handoff** | Add an optional “Add to design” action only for products already supported by the Designer surface roles. | None. | Current selected surface product, material swatch, plan geometry, and cabinet data remain unchanged. |

## Data and Safety Rules

The display layer must retain `pelicanCode`, `slug`, true pricing, original `name`, original `description`, original category, and original subcategory. Plain-language labels are a separate presentation layer, not a replacement for order data. Product imagery remains catalog imagery only; a raw image must never become a 3D material map unless it has separately been approved as `materialImageUrl`.

## Recommendation

Begin with **Stages 1 and 2**. They offer the largest usability benefit with the lowest risk: customers will see understandable Pelican-only departments and names, while CabinetDealz preserves its existing catalog, pricing, source identity, cabinetry, and Designer behavior. After owner review of the labels and grouping, add filters in small product-family batches.

## References

1. [Pelican Collections Navigation](https://buildpelican.com/collections)
2. [Pelican Flooring Collection](https://buildpelican.com/collections/flooring)
3. [Pelican Quartz Collection](https://buildpelican.com/collections/quartz)
4. [Pelican Mosaic Tiles Collection](https://buildpelican.com/collections/mosaic-tiles)
5. [Pelican Bathroom Sinks Collection](https://buildpelican.com/collections/sinks/Bathroom)

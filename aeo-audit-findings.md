# CabinetDealz AEO Audit Findings

## Public crawl and metadata baseline

On 2026-09-10, the public homepage at `https://www.cabinetdealz.com/` rendered a self-canonical URL, an index/follow robots directive with `max-image-preview:large`, a unique title and description, Open Graph title and description, and two valid JSON-LD entity types: `Organization` and `WebSite`.

`robots.txt` permits public crawling while excluding transactional, private, administration, account, cart, checkout, order, designer, and API paths. The public sitemap lists the primary public routes and active door-style family routes. However, the served sitemap currently uses the Railway application host rather than the canonical `www.cabinetdealz.com` host.

## Representative collection findings

The public Shaker Navy collection page renders a descriptive H1, summary, door and finish attributes, a room-scene image, a door-sample image, physical cabinet dimensions, customer-facing prices, and internal links to individual product URLs. This supports human users and answer-engine extraction.

The public collection page is a JavaScript application that initially presents a loading shell before full product content renders. After load, the full catalog content is present in the browser. This makes server-rendered metadata and structured data especially important for reliable crawling.

## Identified priority gaps to validate

1. The sitemap host should resolve to the public canonical host rather than a deployment hostname.
2. The homepage schema is present, but collection and product pages still need type-level inspection for `Product`, `Offer`, `BreadcrumbList`, and appropriate collection/item-list markup.
3. Public product detail extraction needs inspection because text-only extraction returned footer-only content for a representative product URL, which may indicate limited initial HTML content for non-JavaScript crawlers.
4. The site has strong shopping and service copy, but needs a deliberate answer-content layer covering cabinet sizing, materials, ordering, shipping, design workflow, and trade/affiliate questions.

## Structured-data coverage confirmed

The rendered Shaker Navy collection page has unique canonical metadata and a targeted description. Its JSON-LD currently contains only the shared `Organization` and `WebSite` entities; it does not expose a collection-level `ItemList`, `BreadcrumbList`, or product-level structured entities in its rendered head.

The representative public product URL initially renders a generic loading state and footer-only extractable text before the JavaScript application finishes loading. This confirms that product details need a dedicated crawlability and product-schema pass rather than assuming the rich browser view alone is sufficient for answer engines.

## Representative product findings

After the application completes rendering, the representative 30-inch two-drawer base cabinet product page provides a canonical URL without the selected-style query parameter, a unique title, a product-focused meta description, one H1, visible dimensions, drawer count, weight, specification drawing, construction notes, door-style information, imagery, and a dedicated `Product` JSON-LD entity with SKU `2-DB30`.

The product entity does not currently expose an `Offer`. That means the publicly visible price and availability context are not supplied in the product schema. The page also does not expose a visible breadcrumb schema entity in its JSON-LD, despite rendering a human-readable breadcrumb.

## Answer-content and external-guidance assessment

Existing public content covers commerce and service topics well: cabinet style collections, individual product specifications, surfaces, affiliate value propositions, shipping policy, return policy, and a customer-facing kitchen design workflow. The codebase also contains more detailed educational material, but much of that material currently appears within affiliate-only resources rather than public, indexable educational pages.

Google's current documentation confirms that product structured data can communicate price, availability, shipping, returns, and variants, and that pairing on-page structured data with a Merchant Center feed improves eligibility for product experiences. Google also recommends validating JSON-LD against the page's visible content and notes that SPA content can require a separate render pass; server-side or pre-rendered content is still beneficial for users and crawlers. Schema.org defines `FAQPage` for pages that visibly contain frequently asked questions; it should be used only where the matching on-page questions and answers exist.

### Sources consulted

- Google Search Central: Product structured data, accessed 2026-09-10.
- Google Search Central: General structured data guidelines, accessed 2026-09-10.
- Google Search Central: JavaScript SEO basics, accessed 2026-09-10.
- Schema.org: FAQPage definition, accessed 2026-09-10.

## Affiliate storefront findings

The public Reaves Way Cabinet Shop affiliate storefront already contains the desired kitchen-first commercial narrative: a full kitchen catalog, finish selection, a 2D kitchen designer, a quotation call to action, complete-kitchen bundle promotion, surfaces and fixtures, and real affiliate branding. It also makes the journey from room-scene/door style to “Shop This Kitchen,” design, quote, cart, and order visible to customers.

The affiliate route currently uses white-label browser title and social metadata, but its canonical URL resolves to the Railway deployment host instead of the affiliate public hostname or its routed canonical `www.cabinetdealz.com/store/...` address. The page currently outputs only shared `Organization` and `WebSite` JSON-LD referencing CabinetDealz; it does not emit a visible affiliate `LocalBusiness`/`Organization`, `WebPage`, kitchen-bundle, or service-area entity. The title and description are affiliate-branded, but the description is only the short tagline and does not specify the kitchen-planning service or service area.

The storefront already has optional affiliate-owned public contact and service-area fields. These should be the authoritative inputs for any local discovery work, with no invented locations, delivery coverage, testimonials, or credentials.

## Affiliate local SEO guardrails

Google local-business guidance requires a real business name and physical address for LocalBusiness rich-result eligibility; it recommends accurate, complete public business information and identifies relevance, distance, and prominence as main local-result factors. Each affiliate should therefore receive local business schema only after it has supplied verified public contact/location data appropriate for publication. For an affiliate without a customer-facing physical location, retain an organization/storefront entity rather than inventing a street address or geographic coordinates.

Every indexable affiliate page needs meaningful affiliate-specific value: verified service area, actual public phone/email or contact path, real team/process information, unique completed-kitchen imagery or documented project details, and reviewed answers to local buyer questions. Generic city-name swaps across affiliates or cities should not be published. Google emphasizes helpful, reliable people-first content and cautions against mass-produced pages made mainly to attract search visits. It also advises keeping duplicate-content signals controlled through a consistent preferred URL and by avoiding empty or stub pages.

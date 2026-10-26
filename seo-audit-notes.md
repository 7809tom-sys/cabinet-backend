# SEO Audit Notes

## Live main storefront — 2026-08-19

- URL audited: `https://www.cabinetdealz.com/`
- Title: `Cabinet Dealz — The Trade Platform for Kitchen Cabinets`
- Meta description and Open Graph description are present.
- Canonical URL is present and resolves to `https://www.cabinetdealz.com/`.
- Robots directive is `index, follow, max-image-preview:large`.
- Open Graph title and image are present.
- No JSON-LD structured-data script is currently emitted on the home page.

## Immediate audit priorities

1. Add organization and website structured data to public main-site pages.
2. Verify route-specific canonical URLs rather than only homepage metadata.
3. Audit affiliate-storefront metadata and determine index/noindex behavior per active public storefront.
4. Expand robots disallow rules for private design, saved-plan, and transactional areas.

## Live affiliate storefront — 2026-08-19

- URL audited: `https://reaves-way-cabinet-shop.cabinetdealz.com/store/reaves-way-cabinet-shop`
- Rendered title: `Reaves Way Cabinet Shop. — Cabinets At Value`.
- The public page content correctly uses affiliate branding; no CabinetDealz name was visible in the rendered public storefront copy.
- The initial document title before client rendering was the generic Cabinet Dealz platform title, which confirms route metadata is client-side and needs crawler-safe static/dynamic support.
- The affiliate page presents a public catalog and should have a self-referential canonical URL on its affiliate host, not a central-domain canonical.
- The public affiliate home has no verified JSON-LD structured data yet.

## Implementation direction

1. Emit a stable public-page canonical and social metadata record for the main site.
2. Emit self-referential white-label metadata for public affiliate storefront routes.
3. Add organization/website JSON-LD to the main public site and LocalBusiness/website JSON-LD to public affiliate storefronts when business details exist.
4. Keep account, cart, order, saved design, designer, admin, and private dashboard routes out of crawlable indexes.

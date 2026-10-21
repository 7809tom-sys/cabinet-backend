# Google Analytics GA4 site-wide implementation — 2026-10-19

Cabinet Dealz will use one administrator-managed GA4 Measurement ID across the Cabinet Dealz storefront and all affiliate storefront hostnames. The tracking loader must run at the application root so it covers ordinary storefront routes, `/store/:slug` affiliate routes, custom affiliate hostnames rewritten into that route tree, the Designer, product pages, and checkout-success routes.

The Measurement ID is intentionally stored as configuration rather than a secret. Google defines it as the public identifier of a web data stream. The administration UI must validate the `G-...` format, allow administrators to save or clear it, and never enable tracking with a missing or malformed ID.

The browser loader will follow Google’s documented gtag.js pattern: load `https://www.googletagmanager.com/gtag/js?id=<Measurement ID>`, initialize `window.dataLayer`, call `gtag('js', new Date())`, configure the measurement ID, and send page views for SPA route changes. It will not run on local development hosts or temporary Manus development-preview hosts. The production default deployment domain and actual Cabinet Dealz/affiliate production hosts remain eligible.

The page-view payload will include the normal URL and page title, which permits GA4 to report the hostname as part of the page location. It will also include the current storefront hostname as `site_hostname`, preserving affiliate-store attribution in the shared GA4 property. The GA4 property administrator may register that event parameter as a custom dimension if it should appear as a separate report dimension.

## Sources

[1]: https://developers.google.com/tag-platform/gtagjs "Set up the Google tag with gtag.js"

[2]: https://support.google.com/analytics/answer/12270356?hl=en "Measurement ID"

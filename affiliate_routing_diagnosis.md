# Affiliate Routing Diagnosis

## Live observations — 2026-08-13

- `https://reaves-way-cabinet-shop.cabinetdealz.com/` is currently returning the main Cabinet Dealz storefront instead of `/store/reaves-way-cabinet-shop`.
- The live browser title remains `Cabinet Dealz — Professional Cabinet Platform`, which confirms the affiliate bootstrap script was not injected on the deployed custom-domain response.
- The live HTML response reported `x-manus-proxy-mode: transparent/1`, `x-powered-by: Express`, and a stale `last-modified` timestamp from the prior build while the newer checkpoint was being investigated.
- The local development route correctly resolves an affiliate slug when supplied through `X-Original-Host` or `X-Forwarded-Host`, and returns the Reeves Way white-label title and `window.__AFFILIATE_SLUG__` bootstrap.
- The local development routing diagnostic endpoint receives no forwarded-host headers when accessed through the standard sandbox preview host, which is expected for that host and does not identify the custom-domain edge header.

## Current next step

The live custom-domain request still returned the previous main-site application behavior after the temporary diagnostic deployment. Its diagnostic path rendered the SPA 404 page rather than the server endpoint, which shows the custom domain is not yet serving the latest server routing build. The next step is to wait for the custom-domain deployment target to receive the current revision, query the diagnostic endpoint again, then use the observed public host value to complete routing and remove the temporary endpoint.

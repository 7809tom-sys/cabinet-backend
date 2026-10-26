# Affiliate Routing Diagnosis

## Live observations — 2026-08-13

- `https://reaves-way-cabinet-shop.cabinetdealz.com/` is currently returning the main Cabinet Dealz storefront instead of `/store/reaves-way-cabinet-shop`.
- The live browser title remains `Cabinet Dealz — Professional Cabinet Platform`, which confirms the affiliate bootstrap script was not injected on the deployed custom-domain response.
- The live HTML response reported `x-manus-proxy-mode: transparent/1`, `x-powered-by: Express`, and a stale `last-modified` timestamp from the prior build while the newer checkpoint was being investigated.
- The local development route correctly resolves an affiliate slug when supplied through `X-Original-Host` or `X-Forwarded-Host`, and returns the Reeves Way white-label title and `window.__AFFILIATE_SLUG__` bootstrap.
- The local development routing diagnostic endpoint receives no forwarded-host headers when accessed through the standard sandbox preview host, which is expected for that host and does not identify the custom-domain edge header.

## Current next step

The final deployed custom-domain response now includes `window.__AFFILIATE_SLUG__="reaves-way-cabinet-shop"`, the Reeves Way white-label title, and the Reeves Way Open Graph site name. A live browser visit redirected into `/store/reaves-way-cabinet-shop` and rendered the Reaves Way Cabinet Shop storefront rather than the main Cabinet Dealz storefront. The temporary diagnostic endpoint has been removed from the final deployment.

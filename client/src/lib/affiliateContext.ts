/**
 * Detect whether the current page is part of an affiliate's white-labeled
 * storefront experience.
 *
 * Affiliate subdomains (e.g. reaves-way-cabinet-shop.cabinetdealz.com) are
 * internally rewritten by the server to /store/:slug, so a path check covers
 * both the subdomain and the /store/:slug URL forms.
 *
 * Anything inside this context must be 100% white-label: no platform name,
 * logo, imagery, or platform-branded widgets.
 */
export function isAffiliateStorefrontPath(pathname: string): boolean {
  return pathname.startsWith("/store/") || pathname.startsWith("/store-preview/");
}

/** Extract the affiliate slug from a storefront path, when present. */
export function affiliateSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/store\/([^/]+)/);
  return m ? m[1] : null;
}

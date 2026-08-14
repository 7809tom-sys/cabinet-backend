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

/** Resolve a single branded CabinetDealz subdomain in the browser. */
export function affiliateSlugFromHostname(hostname: string | null | undefined): string | null {
  const host = (hostname ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  const suffix = ".cabinetdealz.com";
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return slug && slug !== "www" && !slug.includes(".") ? slug : null;
}

/**
 * Fallback SPA route for a transparent proxy that serves the public custom
 * host without applying the server rewrite. It keeps the customer on their
 * same subdomain while activating the white-label route tree.
 */
export function affiliateStorefrontFallbackPath(
  pathname: string,
  hostname: string | null | undefined,
  search = "",
): string | null {
  const slug = affiliateSlugFromHostname(hostname);
  if (!slug || isAffiliateStorefrontPath(pathname)) return null;
  const suffix = pathname === "/" ? "" : pathname;
  return `/store/${slug}${suffix}${search}`;
}

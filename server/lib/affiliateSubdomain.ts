/**
 * Resolve a single-level CabinetDealz affiliate subdomain from the host that a
 * browser requested. The deployment proxy may pass this through X-Forwarded-Host
 * while the ordinary Host header names an internal Manus domain.
 */
export function affiliateSlugFromHost(hostHeader: string | null | undefined): string | null {
  const host = (hostHeader || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  const suffix = ".cabinetdealz.com";
  if (!host.endsWith(suffix)) return null;
  const candidate = host.slice(0, -suffix.length);
  if (!candidate || candidate === "www" || candidate.includes(".")) return null;
  return candidate;
}

/**
 * Prefer original public-host headers over proxy/internal hosts. Different
 * deployment layers use different names, so try the standard variants in
 * caller-supplied priority order and stop at the first valid affiliate slug.
 */
export function affiliateSlugFromHostCandidates(
  hosts: Array<string | string[] | null | undefined>,
): string | null {
  for (const host of hosts) {
    const value = Array.isArray(host) ? host[0] : host;
    const slug = affiliateSlugFromHost(value);
    if (slug) return slug;
  }
  return null;
}

/** Build the canonical SPA path for a public affiliate custom-domain request. */
export function affiliateStorefrontPath(slug: string, requestedUrl: string): string {
  const suffix = requestedUrl === "/" ? "" : requestedUrl;
  return `/store/${slug}${suffix}`;
}

/** Paths that must reach server middleware instead of the storefront SPA redirect. */
export function isAffiliateStorefrontBypassPath(requestPath: string): boolean {
  return (
    requestPath.startsWith("/api/") ||
    requestPath.startsWith("/store/") ||
    requestPath.startsWith("/__manus__") ||
    requestPath.startsWith("/manus-storage") ||
    requestPath.startsWith("/assets/") ||
    requestPath === "/robots.txt" ||
    requestPath === "/sitemap.xml" ||
    /\.(?:css|js|mjs|map|ico|png|jpe?g|gif|webp|svg|woff2?|ttf)(?:\?|$)/i.test(requestPath)
  );
}

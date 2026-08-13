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

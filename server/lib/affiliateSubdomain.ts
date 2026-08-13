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

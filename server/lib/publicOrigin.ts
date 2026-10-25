type HostValue = string | string[] | undefined | null;

export type CanonicalOriginInput = {
  protocol?: string | null;
  hostCandidates: HostValue[];
  affiliateSlug?: string | null;
  production?: boolean;
};

function normalizedHost(value: HostValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return null;
  return first.replace(/^https?:\/\//, "").replace(/:\d+$/, "").replace(/\/$/, "") || null;
}

function cabinetDealzHost(value: string): string | null {
  if (value === "cabinetdealz.com") return "www.cabinetdealz.com";
  if (value === "www.cabinetdealz.com") return value;
  if (/^[a-z0-9-]+\.cabinetdealz\.com$/i.test(value)) return value;
  return null;
}

/**
 * Resolve the one customer-facing origin used by canonical, social, robots, and
 * sitemap output. CDN and deployment hosts are never allowed to become the
 * production canonical when the original public CabinetDealz host is missing.
 */
export function canonicalPublicOrigin(input: CanonicalOriginInput): string {
  const protocol = input.protocol?.split(",")[0]?.trim() || "https";
  const hosts = input.hostCandidates
    .map(normalizedHost)
    .filter((host): host is string => Boolean(host));

  for (const host of hosts) {
    const publicHost = cabinetDealzHost(host);
    if (publicHost) return `https://${publicHost}`;
  }

  if (input.production) {
    const slug = input.affiliateSlug?.trim().toLowerCase();
    if (slug && /^[a-z0-9-]+$/.test(slug)) {
      return `https://${slug}.cabinetdealz.com`;
    }
    return "https://www.cabinetdealz.com";
  }

  return `${protocol}://${hosts[0] ?? "localhost"}`;
}

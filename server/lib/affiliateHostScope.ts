/**
 * Which storefront a request is really for, decided from the request itself.
 *
 * The public host is the authority. An affiliate subdomain
 * (`store.cabinetdealz.com`) or a mapped custom domain pins every design read
 * and write to that store, so a client-supplied `affiliateSlug` can no longer
 * carry a request across stores. On the platform hosts (`www`, the apex, the
 * API hostname) the routed `/store/:slug` address stays the storefront
 * selector, exactly as before.
 *
 * When the API runs on its own hostname the browser sends `Origin` for the page
 * that made the call, so the Origin is read before the Host header. Without it
 * every split-deployment API call would look like a house request.
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { affiliates } from "../../drizzle/schema";
import { getDb } from "../db";
import { isMissingSchemaError } from "./orderSchemaGuard";

export const HOUSE_STORE_NAME = "Cabinet Dealz";
export const PLATFORM_ROOT_DOMAIN = "cabinetdealz.com";

export type HostAffiliateRow = {
  id: number;
  slug: string;
  storeName: string;
  referralCode?: string | null;
  status?: string | null;
};

export type StoreScopeSource =
  | "origin"
  | "original-host"
  | "forwarded-host"
  | "storefront"
  | "x-host"
  | "host"
  | "platform-host"
  | "absent";

export type RequestStoreScope = {
  /** True when the request arrived on an address that belongs to one store. */
  pinned: boolean;
  affiliateId: number | null;
  slug: string | null;
  storeName: string;
  /** Public host that decided the scope, when one was usable. */
  host: string | null;
  source: StoreScopeSource;
};

export type ResolvedHostScope = RequestStoreScope & { row: HostAffiliateRow | null };

export const HOUSE_SCOPE: RequestStoreScope = {
  pinned: false,
  affiliateId: null,
  slug: null,
  storeName: HOUSE_STORE_NAME,
  host: null,
  source: "absent",
};

const RESERVED_PLATFORM_HOSTS = new Set([
  PLATFORM_ROOT_DOMAIN,
  `www.${PLATFORM_ROOT_DOMAIN}`,
  `api.${PLATFORM_ROOT_DOMAIN}`,
]);

/** Deployment and local hosts that never name a store. */
const NON_STORE_HOST_SUFFIXES = [
  ".manus.space",
  ".manus.computer",
  ".vercel.app",
  ".up.railway.app",
  ".onrender.com",
  ".fly.dev",
];

/** Same shape the storefront route accepts: one lowercase DNS label. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function normalizeStoreSlug(value: string | null | undefined): string | null {
  const slug = (value ?? "").trim().toLowerCase();
  if (!slug || slug === "owner") return null;
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/** Header text can carry a list; the first entry is the public one. */
export function firstHostValue(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = (raw ?? "").split(",")[0]?.trim() ?? "";
  if (!first) return null;
  const bare = first
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .split("/")[0]
    .replace(/:\d+$/, "")
    .toLowerCase();
  return bare || null;
}

/** Host of an `Origin` header, only when it is a CabinetDealz page. */
export function originHost(origin: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(origin) ? origin[0] : origin;
  if (!raw || raw === "null") return null;
  let host: string;
  try {
    host = new URL(raw.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host !== PLATFORM_ROOT_DOMAIN && !host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) return null;
  return host;
}

/**
 * True for a public hostname an affiliate could point at us. Localhost, bare
 * IPs, and deployment suffixes are excluded so a preview URL never becomes a
 * custom-domain lookup.
 */
export function isCustomDomainCandidate(host: string | null): host is string {
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return false;
  if (host === PLATFORM_ROOT_DOMAIN || host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) return false;
  return !NON_STORE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Affiliate slug addressed as a single platform subdomain, if any. */
export function slugFromPlatformHost(host: string | null): string | null {
  if (!host) return null;
  const suffix = `.${PLATFORM_ROOT_DOMAIN}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null;
  if (label === "www" || label === "api") return null;
  return SLUG_PATTERN.test(label) ? label : null;
}

export type HostCandidate = { host: string; source: StoreScopeSource };

/**
 * Public-host candidates in the order this deployment exposes them.
 *
 * A CabinetDealz `Origin` is set by the browser and cannot be forged by page
 * script, so when one is present it is the only storefront candidate. The
 * forwarded host headers are proxy-owned and are used only when the page is not
 * a CabinetDealz origin or when there is no Origin at all. `x-cd-storefront-host`
 * is the client's own page host: it only restores identity when a CDN stripped
 * Origin, and the resolver still requires a real affiliate row behind it.
 */
export function requestHostCandidates(req: Request | undefined | null): HostCandidate[] {
  if (!req) return [];
  const headers = req.headers ?? {};
  const origin = originHost(headers.origin);
  if (origin) return [{ host: origin, source: "origin" }];
  const candidates: HostCandidate[] = [];
  const named: Array<[string | string[] | undefined, StoreScopeSource]> = [
    [headers["x-original-host"], "original-host"],
    [headers["x-forwarded-host"], "forwarded-host"],
    [headers["x-cd-storefront-host"], "storefront"],
    [headers["x-host"], "x-host"],
    [headers.host, "host"],
  ];
  for (const [value, source] of named) {
    const host = firstHostValue(value);
    if (host) candidates.push({ host, source });
  }
  return candidates;
}

export type HostAffiliateLookup = {
  findBySlug: (slug: string) => Promise<HostAffiliateRow | null>;
  findByCustomDomain: (host: string) => Promise<HostAffiliateRow | null>;
};

function isServingStore(row: HostAffiliateRow): boolean {
  return row.status !== "inactive";
}

/**
 * Turn host candidates into one store scope.
 *
 * A single affiliate host decides the store. Two different affiliate hosts in
 * one request mean a proxy is routing one storefront's traffic as another's,
 * so the request is refused instead of picking a winner.
 */
export async function resolveHostStoreScope(
  candidates: HostCandidate[],
  lookup: HostAffiliateLookup,
): Promise<ResolvedHostScope> {
  const matches = new Map<number, HostCandidate & { row: HostAffiliateRow }>();
  let platformHost: string | null = null;

  for (const candidate of candidates) {
    const slug = slugFromPlatformHost(candidate.host);
    const row = slug
      ? await lookup.findBySlug(slug)
      : isCustomDomainCandidate(candidate.host)
        ? await lookup.findByCustomDomain(candidate.host)
        : null;
    if (row && isServingStore(row)) {
      matches.set(row.id, { ...candidate, row });
      continue;
    }
    if (RESERVED_PLATFORM_HOSTS.has(candidate.host) && !platformHost) platformHost = candidate.host;
  }

  if (matches.size > 1) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This request arrived on two different storefront addresses. Reload the store you were working in and try again.",
    });
  }

  const match = Array.from(matches.values())[0];
  if (match) {
    return {
      pinned: true,
      affiliateId: match.row.id,
      slug: match.row.slug,
      storeName: match.row.storeName,
      host: match.host,
      source: match.source,
      row: match.row,
    };
  }

  return {
    ...HOUSE_SCOPE,
    host: platformHost ?? candidates[0]?.host ?? null,
    source: platformHost ? "platform-host" : "absent",
    row: null,
  };
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function dbHostAffiliateLookup(db: Db): HostAffiliateLookup {
  return {
    findBySlug: async (slug) => {
      const [row] = await db
        .select({
          id: affiliates.id,
          slug: affiliates.slug,
          storeName: affiliates.storeName,
          referralCode: affiliates.referralCode,
          status: affiliates.status,
        })
        .from(affiliates)
        .where(eq(affiliates.slug, slug))
        .limit(1);
      return row ?? null;
    },
    findByCustomDomain: async (host) => {
      try {
        const [row] = await db
          .select({
            id: affiliates.id,
            slug: affiliates.slug,
            storeName: affiliates.storeName,
            referralCode: affiliates.referralCode,
            status: affiliates.status,
            customDomain: affiliates.customDomain,
          })
          .from(affiliates)
          .where(eq(affiliates.customDomain, host))
          .limit(1);
        return row ?? null;
      } catch (error) {
        // The mapping column ships as a migration. Until it is applied, a
        // custom host keeps the platform's path-scoped behavior.
        if (isMissingSchemaError(error)) return null;
        throw error;
      }
    },
  };
}

const requestScopeCache = new WeakMap<object, Promise<ResolvedHostScope>>();

/** One resolution per request, even when several procedures share the context. */
export async function resolveRequestStoreScope(
  req: Request | undefined | null,
): Promise<ResolvedHostScope> {
  if (!req || typeof req !== "object") return { ...HOUSE_SCOPE, row: null };
  const cached = requestScopeCache.get(req);
  if (cached) return cached;
  const pending = (async (): Promise<ResolvedHostScope> => {
    const db = await getDb();
    if (!db) return { ...HOUSE_SCOPE, host: requestHostCandidates(req)[0]?.host ?? null, row: null };
    return resolveHostStoreScope(requestHostCandidates(req), dbHostAffiliateLookup(db));
  })();
  requestScopeCache.set(req, pending);
  return pending;
}

/**
 * The client may pick a storefront only where the address does not pin one.
 * On an affiliate host a different slug is a cross-store request and is
 * refused before any row is read or written.
 */
export function clientStoreScopeConflict(
  scope: RequestStoreScope,
  clientSlug: string | null | undefined,
): string | null {
  if (!scope.pinned) return null;
  const requested = normalizeStoreSlug(clientSlug);
  if (requested == null || requested === scope.slug) return null;
  return `This browser is on the ${scope.storeName} storefront, so it cannot open the "${requested}" store. Reload the store you were working in and try again.`;
}

export function assertClientStoreScope(
  scope: RequestStoreScope,
  clientSlug: string | null | undefined,
): void {
  const conflict = clientStoreScopeConflict(scope, clientSlug);
  if (conflict) throw new TRPCError({ code: "PRECONDITION_FAILED", message: conflict });
}

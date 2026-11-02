import { describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  assertClientStoreScope,
  clientStoreScopeConflict,
  firstHostValue,
  isCustomDomainCandidate,
  normalizeStoreSlug,
  originHost,
  requestHostCandidates,
  resolveHostStoreScope,
  slugFromPlatformHost,
  type HostAffiliateLookup,
} from "./affiliateHostScope";

const stores = [
  { id: 7, slug: "store-a", storeName: "Store A", status: "active" },
  { id: 9, slug: "store-b", storeName: "Store B", status: "active" },
  { id: 11, slug: "closed", storeName: "Closed Store", status: "inactive" },
];

/** Custom-domain rows exist only for the host the affiliate mapped. */
const domains: Record<string, number> = { "reaveswaycabinets.com": 7 };

const lookup: HostAffiliateLookup = {
  findBySlug: async (slug) => stores.find((store) => store.slug === slug) ?? null,
  findByCustomDomain: async (host) => stores.find((store) => store.id === domains[host]) ?? null,
};

function request(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

describe("affiliate host scope — host parsing", () => {
  it("reads a single affiliate subdomain and leaves the platform hosts alone", () => {
    expect(slugFromPlatformHost("store-a.cabinetdealz.com")).toBe("store-a");
    expect(slugFromPlatformHost("www.cabinetdealz.com")).toBeNull();
    expect(slugFromPlatformHost("cabinetdealz.com")).toBeNull();
    expect(slugFromPlatformHost("api.cabinetdealz.com")).toBeNull();
    expect(slugFromPlatformHost("a.b.cabinetdealz.com")).toBeNull();
    expect(slugFromPlatformHost("evil-cabinetdealz.com")).toBeNull();
  });

  it("strips ports, schemes and comma lists to one host", () => {
    expect(firstHostValue("store-a.cabinetdealz.com:443")).toBe("store-a.cabinetdealz.com");
    expect(firstHostValue("https://store-a.cabinetdealz.com/path")).toBe("store-a.cabinetdealz.com");
    expect(firstHostValue("store-a.cabinetdealz.com, internal.manus.space")).toBe("store-a.cabinetdealz.com");
    expect(firstHostValue(undefined)).toBeNull();
  });

  it("only accepts a CabinetDealz origin as the storefront page", () => {
    expect(originHost("https://store-a.cabinetdealz.com")).toBe("store-a.cabinetdealz.com");
    expect(originHost("https://www.cabinetdealz.com")).toBe("www.cabinetdealz.com");
    expect(originHost("https://evil.com")).toBeNull();
    expect(originHost("https://cabinetdealz.com.evil.com")).toBeNull();
    expect(originHost("null")).toBeNull();
  });

  it("excludes local, IP and deployment hosts from custom-domain lookups", () => {
    expect(isCustomDomainCandidate("reaveswaycabinets.com")).toBe(true);
    expect(isCustomDomainCandidate("shop.reaveswaycabinets.com")).toBe(true);
    for (const host of [
      "localhost",
      "127.0.0.1",
      "cabinet-frontend.vercel.app",
      "cabinetz-dq7pucbp.manus.space",
      "cabinet-backend.up.railway.app",
      "store-a.cabinetdealz.com",
      "cabinetdealz.com",
    ]) {
      expect(isCustomDomainCandidate(host), host).toBe(false);
    }
  });

  it("accepts the client's page-host hint only when no Origin is present", () => {
    expect(requestHostCandidates(request({
      origin: "https://store-a.cabinetdealz.com",
      "x-cd-storefront-host": "store-b.cabinetdealz.com",
    }))).toEqual([{ host: "store-a.cabinetdealz.com", source: "origin" }]);
    const withoutOrigin = requestHostCandidates(request({
      host: "api.cabinetdealz.com",
      "x-cd-storefront-host": "store-b.cabinetdealz.com",
    }));
    expect(withoutOrigin[0]).toEqual({ host: "store-b.cabinetdealz.com", source: "storefront" });
  });

  it("treats an empty or 'owner' client scope as the house store", () => {
    expect(normalizeStoreSlug("owner")).toBeNull();
    expect(normalizeStoreSlug("  ")).toBeNull();
    expect(normalizeStoreSlug("Store-A")).toBe("store-a");
    expect(normalizeStoreSlug("store a")).toBeNull();
  });
});

describe("affiliate host scope — resolution", () => {
  it("pins the subdomain store even when an internal host is also present", async () => {
    const scope = await resolveHostStoreScope(
      requestHostCandidates(request({
        "x-original-host": "store-a.cabinetdealz.com",
        host: "internal.manus.space",
      })),
      lookup,
    );
    expect(scope).toMatchObject({ pinned: true, affiliateId: 7, slug: "store-a", storeName: "Store A" });
  });

  it("prefers the page Origin so split-deployment API calls keep the store", async () => {
    const scope = await resolveHostStoreScope(
      requestHostCandidates(request({
        origin: "https://store-b.cabinetdealz.com",
        host: "api.cabinetdealz.com",
      })),
      lookup,
    );
    expect(scope).toMatchObject({ pinned: true, affiliateId: 9, slug: "store-b", source: "origin" });
  });

  it("maps a custom domain to the affiliate that claimed it", async () => {
    const scope = await resolveHostStoreScope(
      requestHostCandidates(request({ host: "reaveswaycabinets.com" })),
      lookup,
    );
    expect(scope).toMatchObject({ pinned: true, affiliateId: 7, slug: "store-a" });
  });

  it("leaves www, the apex and the API on the path-scoped house behavior", async () => {
    for (const host of ["www.cabinetdealz.com", "cabinetdealz.com", "api.cabinetdealz.com"]) {
      const scope = await resolveHostStoreScope(requestHostCandidates(request({ host })), lookup);
      expect(scope, host).toMatchObject({ pinned: false, affiliateId: null });
    }
  });

  it("does not pin a paused-out (inactive) store", async () => {
    const scope = await resolveHostStoreScope(
      requestHostCandidates(request({ host: "closed.cabinetdealz.com" })),
      lookup,
    );
    expect(scope.pinned).toBe(false);
  });

  it("refuses a request that arrives on two different storefronts", async () => {
    await expect(resolveHostStoreScope(
      requestHostCandidates(request({
        "x-original-host": "store-a.cabinetdealz.com",
        "x-forwarded-host": "store-b.cabinetdealz.com",
      })),
      lookup,
    )).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("lets the browser Origin outrank a forwarded host a client tried to inject", async () => {
    // Origin is browser-set and cannot be overridden by page script; the
    // forwarded header is ignored whenever a CabinetDealz Origin exists.
    const scope = await resolveHostStoreScope(
      requestHostCandidates(request({
        origin: "https://store-a.cabinetdealz.com",
        "x-forwarded-host": "store-b.cabinetdealz.com",
      })),
      lookup,
    );
    expect(scope).toMatchObject({ pinned: true, affiliateId: 7, source: "origin" });
  });
});

describe("affiliate host scope — client slug conflicts", () => {
  const pinnedA = {
    pinned: true,
    affiliateId: 7,
    slug: "store-a",
    storeName: "Store A",
    host: "store-a.cabinetdealz.com",
    source: "origin" as const,
  };

  it("accepts the store's own slug and the house label", () => {
    expect(clientStoreScopeConflict(pinnedA, "store-a")).toBeNull();
    expect(clientStoreScopeConflict(pinnedA, "Store-A")).toBeNull();
    expect(clientStoreScopeConflict(pinnedA, "owner")).toBeNull();
    expect(clientStoreScopeConflict(pinnedA, undefined)).toBeNull();
  });

  it("rejects a slug that names another store than the host", () => {
    const message = clientStoreScopeConflict(pinnedA, "store-b");
    expect(message).toContain("Store A");
    expect(() => assertClientStoreScope(pinnedA, "store-b")).toThrow(/cannot open the "store-b" store/);
  });

  it("never restricts the platform hosts, where the route picks the store", () => {
    const house = { ...pinnedA, pinned: false, affiliateId: null, slug: null };
    expect(clientStoreScopeConflict(house, "store-b")).toBeNull();
  });
});

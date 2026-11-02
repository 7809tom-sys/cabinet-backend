/**
 * Cross-affiliate design leak — deterministic (in-memory database) checks.
 *
 * The Designer used to take the storefront from the slug the browser sent, so a
 * design saved on store A opened on store B for every role. These tests run the
 * real routers against in-memory rows and assert that the request Host/Origin
 * header decides the store.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, kitchenDesigns } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { memoryStore, type Row } from "./lib/__testDb";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("./db", () => ({
  getDb: getDbMock,
  notInConflict: () => undefined,
  getPricingSettings: async () => ({}),
  getPlatformPricingSettings: async () => ({}),
}));
vi.mock("./lib/affiliateAccess", () => ({
  resolveAffiliateAccess: async () => null,
  loadAffiliateResolution: async () => ({ access: null, ambiguousAffiliateIds: [], link: null }),
}));

const CUSTOMER = {
  name: "Host Scope Customer",
  email: "host-scope-customer@example.test",
  phone: "555-010-0177",
  address: { line1: "100 Host Street", city: "Testville", state: "FL", zip: "34201" },
};

const STORE_A = { id: 7, slug: "store-a", storeName: "Store A", status: "active", referralCode: "STOREA", storefrontEnabled: true };
const STORE_B = { id: 9, slug: "store-b", storeName: "Store B", status: "active", referralCode: "STOREB", storefrontEnabled: true };

let tables: Map<unknown, Row[]>;

function seed(designs: Row[] = []) {
  tables = new Map<unknown, Row[]>([
    [affiliates, [STORE_A, STORE_B]],
    [kitchenDesigns, designs],
  ]);
  getDbMock.mockResolvedValue(memoryStore(tables));
}

function caller(host: string, user: { id: number; role: string }, origin?: string) {
  const headers: Record<string, string> = { host };
  if (origin) headers.origin = origin;
  return appRouter.createCaller({
    user: {
      id: user.id,
      openId: `host-scope-${user.id}`,
      name: `Host Scope ${user.id}`,
      email: `host-scope-${user.id}@example.test`,
      role: user.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext);
}

/** A design that already belongs to store A. */
const STORE_A_DESIGN: Row = {
  id: 501,
  userId: 990101,
  affiliateId: 7,
  name: "Store A kitchen",
  roomData: { width: 120, depth: 120 },
  placedCabinets: [],
  updatedAt: new Date(),
};

const ROLES = [
  ["owner", { id: 990101, role: "user" }],
  ["admin", { id: 990102, role: "admin" }],
  ["contractor", { id: 990103, role: "contractor" }],
  ["regular user", { id: 990104, role: "user" }],
] as const;

describe("saved design store isolation by request host", () => {
  beforeEach(() => seed([STORE_A_DESIGN]));

  it("hides a design saved on store A from store B for owner, admin, contractor, and regular user", async () => {
    for (const [label, user] of ROLES) {
      const onB = caller("store-b.cabinetdealz.com", user);
      // Host-matched slug: store B's scope simply has no such row.
      expect(await onB.design.byId({ id: 501, affiliateSlug: "store-b" }), `${label} byId`).toBeNull();
      const list = await onB.design.myDesigns({ affiliateSlug: "store-b" });
      expect(list.some((design) => design.id === 501), `${label} myDesigns`).toBe(false);
      // The historical leak path: the client names store A while on store B.
      await expect(onB.design.byId({ id: 501, affiliateSlug: "store-a" }), `${label} cross-slug byId`).rejects.toThrow(
        /cannot open the "store-a" store/,
      );
      await expect(onB.design.myDesigns({ affiliateSlug: "store-a" }), `${label} cross-slug myDesigns`).rejects.toThrow(
        /cannot open the "store-a" store/,
      );
      await expect(onB.design.byId({ id: 501, affiliateSlug: "store-a", assist: true }), `${label} assist`).rejects.toThrow(
        /cannot open the "store-a" store/,
      );
    }
  });

  it("still shows the design on its own storefront", async () => {
    const onA = caller("store-a.cabinetdealz.com", { id: 990101, role: "user" });
    expect((await onA.design.byId({ id: 501, affiliateSlug: "store-a" }))?.name).toBe("Store A kitchen");
    const list = await onA.design.myDesigns({ affiliateSlug: "store-a" });
    expect(list.some((design) => design.id === 501)).toBe(true);
  });

  it("rejects a client slug that disagrees with the host", async () => {
    const onB = caller("store-b.cabinetdealz.com", { id: 990101, role: "user" });
    await expect(onB.design.byId({ id: 501, affiliateSlug: "store-a" })).rejects.toThrow(/cannot open the "store-a" store/);
    await expect(onB.design.myDesigns({ affiliateSlug: "store-a" })).rejects.toThrow(/cannot open the "store-a" store/);
    await expect(onB.design.remove({ id: 501, affiliateSlug: "store-a" })).rejects.toThrow(/cannot open the "store-a" store/);
    await expect(onB.design.save({
      customer: CUSTOMER,
      id: 501,
      name: "Cross-store overwrite",
      affiliateSlug: "store-a",
      originScope: "store-a",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    })).rejects.toThrow(/cannot open the "store-a" store/);
    // The design is untouched.
    expect((tables.get(kitchenDesigns) ?? []).find((row) => row.id === 501)?.name).toBe("Store A kitchen");
  });

  it("scopes the assist branch for admins too", async () => {
    const adminOnB = caller("store-b.cabinetdealz.com", { id: 990102, role: "admin" });
    expect(await adminOnB.design.byId({ id: 501, affiliateSlug: "store-b", assist: true })).toBeNull();
    const adminOnA = caller("store-a.cabinetdealz.com", { id: 990102, role: "admin" });
    expect(await adminOnA.design.byId({ id: 501, affiliateSlug: "store-a", assist: true })).toMatchObject({ id: 501 });
  });

  it("stamps a new save with the host's affiliate, never the client's", async () => {
    // Client claims store A while browsing store B: refused.
    const onB = caller("store-b.cabinetdealz.com", { id: 990101, role: "user" });
    await expect(onB.design.save({
      customer: CUSTOMER,
      name: "Mislabeled kitchen",
      affiliateSlug: "store-a",
      originScope: "store-a",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    })).rejects.toThrow(/cannot open the "store-a" store/);

    // The house label ("owner", also the input default) names no store, so it is
    // not a cross-store request. The write is still stamped with store B.
    const saved = await onB.design.save({
      customer: CUSTOMER,
      name: "House-label kitchen",
      affiliateSlug: "owner",
      originScope: "owner",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    });
    const row = (tables.get(kitchenDesigns) ?? []).find((design) => design.id === saved.id);
    expect(row?.affiliateId).toBe(9);
  });

  it("keeps the house store house-only on the platform hosts", async () => {
    const onWww = caller("www.cabinetdealz.com", { id: 990101, role: "user" });
    // The platform host has no storefront pinned, so the storefront route picks
    // the store exactly as before: store A's design is never read as a house row,
    // and the store's own scope still opens it.
    expect(await onWww.design.byId({ id: 501, affiliateSlug: "store-b" })).toBeNull();
    expect((await onWww.design.byId({ id: 501, affiliateSlug: "store-a" }))?.name).toBe("Store A kitchen");
  });

  it("resolves the store from the page Origin on the split API host", async () => {
    seed([STORE_A_DESIGN]);
    // api.cabinetdealz.com with a storefront Origin is store A.
    const viaOrigin = caller("api.cabinetdealz.com", { id: 990101, role: "user" }, "https://store-a.cabinetdealz.com");
    expect((await viaOrigin.design.byId({ id: 501, affiliateSlug: "store-a" }))?.name).toBe("Store A kitchen");
    // The same API host with no storefront Origin falls back to the routed slug,
    // which is the pre-existing platform behavior. Nothing is pinned or widened.
    const plainApi = caller("api.cabinetdealz.com", { id: 990101, role: "user" });
    expect(await plainApi.design.byId({ id: 501, affiliateSlug: "store-b" })).toBeNull();
  });
});

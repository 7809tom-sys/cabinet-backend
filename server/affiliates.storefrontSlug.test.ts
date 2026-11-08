/**
 * Storefront slug immutability: only an admin may change a slug after the
 * affiliate claimed it. These run the real router against in-memory rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, affiliateStorefrontClaims } from "../drizzle/schema";
import { memoryStore, type Row } from "./lib/__testDb";
import { appRouter } from "./routers";
import type { TrpcContext } from "../_core/context";

const { getDbMock, accessState } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessState: {
    access: null as null | {
      affiliateId: number;
      isOwner: boolean;
      accessCrm: boolean;
      accessDesigner: boolean;
      accessMarketing: boolean;
      teamMemberId: number | null;
    },
  },
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: getDbMock };
});

vi.mock("./lib/affiliateAccess", () => ({
  resolveAffiliateAccess: async () => accessState.access,
  loadAffiliateResolution: async () => ({ access: accessState.access, ambiguousAffiliateIds: [], link: null }),
}));

const CLAIMED: Row = {
  id: 42,
  slug: "oak-iron",
  storeName: "Oak & Iron",
  email: "owner@example.test",
  status: "active",
  membershipStatus: "active",
  membershipExpiresAt: new Date("2027-06-01T00:00:00Z"),
  storefrontEnabled: true,
  referralCode: "OAKIRON",
  commissionRate: "0.0500",
};

const OTHER: Row = {
  id: 77,
  slug: "first-class",
  storeName: "First Class",
  email: "other@example.test",
  status: "active",
  membershipStatus: "active",
  membershipExpiresAt: new Date("2027-06-01T00:00:00Z"),
  storefrontEnabled: true,
  referralCode: "FIRSTCLASS",
  commissionRate: "0.0500",
};

let tables: Map<unknown, Row[]>;

function ctx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function rowsOf(table: unknown): Row[] {
  return tables.get(table) ?? [];
}

function storeRow(id: number): Row | undefined {
  return rowsOf(affiliates).find((row) => row.id === id);
}

beforeEach(() => {
  tables = new Map<unknown, Row[]>([
    [affiliates, [{ ...CLAIMED }, { ...OTHER }]],
    [
      affiliateStorefrontClaims,
      [{ id: 1, affiliateId: 42, claimedSlug: "oak-iron", claimedByName: "Oak & Iron", claimedByUserId: 900, claimedAt: new Date() }],
    ],
  ]);
  getDbMock.mockReset();
  getDbMock.mockResolvedValue(memoryStore(tables));
  accessState.access = {
    affiliateId: 42,
    isOwner: true,
    accessCrm: true,
    accessDesigner: true,
    accessMarketing: true,
    teamMemberId: null,
  };
});

const admin = ctx({ id: 1, email: "admin@example.test", role: "admin" });
const owner = ctx({ id: 900, email: "owner@example.test", role: "user" });

describe("partner cannot change a claimed slug", () => {
  it("ignores a slug sent to updateMyStorefront", async () => {
    const caller = appRouter.createCaller(owner);
    await caller.affiliates.updateMyStorefront({ storeName: "Oak & Iron Cabinetry", slug: "hijacked" } as never);
    expect(storeRow(42)?.slug).toBe("oak-iron");
    expect(storeRow(42)?.storeName).toBe("Oak & Iron Cabinetry");
  });

  it("has no partner procedure that writes a slug", () => {
    const procedures = Object.keys(appRouter._def.procedures);
    const partnerWriters = procedures.filter((name) => /^affiliates\.(updateMy|applyWebsiteBrandImport)/.test(name));
    expect(partnerWriters.length).toBeGreaterThan(0);
    for (const name of partnerWriters) {
      expect(name).not.toMatch(/slug/i);
    }
  });
});

describe("adminUpdate slug", () => {
  it("lets an admin rename the storefront", async () => {
    const caller = appRouter.createCaller(admin);
    const result = await caller.affiliates.adminUpdate({ id: 42, slug: "Oak & Iron Cabinets" });
    expect(result).toEqual({ id: 42 });
    expect(storeRow(42)?.slug).toBe("oak-iron-cabinets");
    // The claim keeps what the affiliate chose, so the rename stays visible.
    expect(rowsOf(affiliateStorefrontClaims)[0].claimedSlug).toBe("oak-iron");
  });

  it("refuses a slug another store already uses", async () => {
    const caller = appRouter.createCaller(admin);
    await expect(caller.affiliates.adminUpdate({ id: 42, slug: "First Class" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(storeRow(42)?.slug).toBe("oak-iron");
  });

  it("refuses a reserved slug", async () => {
    const caller = appRouter.createCaller(admin);
    await expect(caller.affiliates.adminUpdate({ id: 42, slug: "catalog" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storeRow(42)?.slug).toBe("oak-iron");
  });

  it("leaves the slug alone when the admin does not send one", async () => {
    const caller = appRouter.createCaller(admin);
    await caller.affiliates.adminUpdate({ id: 42, tagline: "Quality cabinets." });
    expect(storeRow(42)?.slug).toBe("oak-iron");
    expect(storeRow(42)?.tagline).toBe("Quality cabinets.");
  });

  it("is still admin-only", async () => {
    const caller = appRouter.createCaller(owner);
    await expect(caller.affiliates.adminUpdate({ id: 42, slug: "something-else" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storeRow(42)?.slug).toBe("oak-iron");
  });
});

describe("adminCreate reserved words", () => {
  it("refuses a store name that slugifies to a platform route", async () => {
    const caller = appRouter.createCaller(admin);
    await expect(
      caller.affiliates.adminCreate({
        storeName: "Admin",
        email: "new@example.test",
        status: "active",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/reserved/i) });
  });

  it("refuses an explicitly reserved slug even when the store name is fine", async () => {
    const caller = appRouter.createCaller(admin);
    await expect(
      caller.affiliates.adminCreate({
        storeName: "Bayside Cabinets",
        slug: "Cart",
        email: "new@example.test",
        status: "active",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/reserved/i) });
  });
});

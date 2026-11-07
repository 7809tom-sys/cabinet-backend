/**
 * affiliateStorefrontName router — the endpoint the final onboarding step calls.
 *
 * Runs the real tRPC router against in-memory rows. The onboarding gate's
 * legal-document and document checks come from sibling PRs that are not merged,
 * so they stay blocking here; these tests assert the two things that matter while
 * that is true: an unfinished affiliate cannot publish, and the availability check
 * never writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, affiliateStorefrontClaims } from "../../drizzle/schema";
import { memoryStore, type Row } from "../lib/__testDb";
import { appRouter } from "../routers";
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

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: getDbMock };
});

vi.mock("../lib/affiliateAccess", () => ({
  resolveAffiliateAccess: async () => accessState.access,
  loadAffiliateResolution: async () => ({ access: accessState.access, ambiguousAffiliateIds: [], link: null }),
}));

const OWNER = { id: 900, email: "owner@example.test", role: "user" as const };

const MY_STORE: Row = {
  id: 42,
  slug: "my-store",
  storeName: "My Store",
  email: "owner@example.test",
  status: "active",
  membershipStatus: "active",
  membershipExpiresAt: new Date("2027-06-01T00:00:00Z"),
  storefrontEnabled: false,
  referralCode: "MYSTORE",
};

const TAKEN_STORE: Row = {
  id: 77,
  slug: "first-class",
  storeName: "First Class",
  email: "other@example.test",
  status: "active",
  membershipStatus: "active",
  membershipExpiresAt: new Date("2027-06-01T00:00:00Z"),
  storefrontEnabled: true,
  referralCode: "FIRSTCLASS",
};

let tables: Map<unknown, Row[]>;

function ctx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  tables = new Map<unknown, Row[]>([
    [affiliates, [{ ...MY_STORE }, { ...TAKEN_STORE }]],
    [affiliateStorefrontClaims, []],
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

function rowsOf(table: unknown): Row[] {
  return tables.get(table) ?? [];
}

describe("affiliateStorefrontName.status", () => {
  it("reports the unclaimed store, its current slug, and what still blocks publishing", async () => {
    const caller = appRouter.createCaller(ctx(OWNER));
    const status = await caller.affiliateStorefrontName.status();
    expect(status).toMatchObject({
      storeName: "My Store",
      storeSlug: "my-store",
      claimed: false,
      claimedSlug: null,
      slugChangedByAdmin: false,
      storefrontEnabled: false,
    });
    expect(status.gate.ok).toBe(false);
    expect(status.gate.blockers).toEqual(["legal_docs_unsigned", "documents_missing"]);
    expect(status.gate.checks).toEqual({
      membership: true,
      legalDocuments: false,
      requiredDocuments: false,
    });
  });

  it("refuses a caller with no affiliate account", async () => {
    accessState.access = null;
    const caller = appRouter.createCaller(ctx(OWNER));
    await expect(caller.affiliateStorefrontName.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a team member: only the owner may set the public name", async () => {
    accessState.access = {
      affiliateId: 42,
      isOwner: false,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: false,
      teamMemberId: 7,
    };
    const caller = appRouter.createCaller(ctx({ id: 901, email: "team@example.test", role: "user" }));
    await expect(caller.affiliateStorefrontName.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.affiliateStorefrontName.checkName({ name: "Oak & Iron" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a signed-out caller", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.affiliateStorefrontName.status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("affiliateStorefrontName.checkName", () => {
  it("returns the path a free name would publish, without writing anything", async () => {
    const caller = appRouter.createCaller(ctx(OWNER));
    const check = await caller.affiliateStorefrontName.checkName({ name: "Oak & Iron Cabinets" });
    expect(check).toMatchObject({
      slug: "oak-iron-cabinets",
      path: "/store/oak-iron-cabinets",
      available: true,
      blocker: null,
      claimed: false,
    });
    expect(rowsOf(affiliateStorefrontClaims)).toHaveLength(0);
    expect(rowsOf(affiliates).find((row) => row.id === 42)?.slug).toBe("my-store");
  });

  it("explains a reserved name", async () => {
    const caller = appRouter.createCaller(ctx(OWNER));
    const check = await caller.affiliateStorefrontName.checkName({ name: "Catalog" });
    expect(check.available).toBe(false);
    expect(check.blocker).toBe("reserved");
    expect(check.message).toMatch(/reserved/i);
  });

  it("explains a name another storefront owns", async () => {
    const caller = appRouter.createCaller(ctx(OWNER));
    const check = await caller.affiliateStorefrontName.checkName({ name: "First Class" });
    expect(check.available).toBe(false);
    expect(check.blocker).toBe("taken");
    expect(check.path).toBeNull();
  });

  it("explains a too-short name before asking the database", async () => {
    const caller = appRouter.createCaller(ctx(OWNER));
    const check = await caller.affiliateStorefrontName.checkName({ name: "ab" });
    expect(check.available).toBe(false);
    expect(check.blocker).toBe("too_short");
  });
});

describe("affiliateStorefrontName.claimName", () => {
  it("refuses to publish while the legal-document and document checks are stubs", async () => {
    const caller = appRouter.createCaller(ctx(OWNER));
    await expect(caller.affiliateStorefrontName.claimName({ name: "Oak & Iron" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    // Nothing published, nothing recorded.
    expect(rowsOf(affiliates).find((row) => row.id === 42)?.slug).toBe("my-store");
    expect(rowsOf(affiliates).find((row) => row.id === 42)?.storefrontEnabled).toBe(false);
    expect(rowsOf(affiliateStorefrontClaims)).toHaveLength(0);
  });

  it("refuses an affiliate whose membership is not active", async () => {
    tables.set(affiliates, [{ ...MY_STORE, membershipStatus: "pending" }, { ...TAKEN_STORE }]);
    const caller = appRouter.createCaller(ctx(OWNER));
    await expect(caller.affiliateStorefrontName.claimName({ name: "Oak & Iron" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/membership/i) });
    expect(rowsOf(affiliateStorefrontClaims)).toHaveLength(0);
  });

  it("refuses a team member", async () => {
    accessState.access = {
      affiliateId: 42,
      isOwner: false,
      accessCrm: true,
      accessDesigner: false,
      accessMarketing: false,
      teamMemberId: 7,
    };
    const caller = appRouter.createCaller(ctx({ id: 901, email: "team@example.test", role: "user" }));
    await expect(caller.affiliateStorefrontName.claimName({ name: "Oak & Iron" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rowsOf(affiliateStorefrontClaims)).toHaveLength(0);
  });

  it("does not publish a name owned by another store", async () => {
    const caller = appRouter.createCaller(ctx(OWNER));
    // The gate blocks first, so this asserts the gate ordering rather than the
    // name rule; the name rule itself is covered in the lib test.
    await expect(caller.affiliateStorefrontName.claimName({ name: "First Class" })).rejects.toBeTruthy();
    expect(rowsOf(affiliates).find((row) => row.id === 77)?.slug).toBe("first-class");
  });
});

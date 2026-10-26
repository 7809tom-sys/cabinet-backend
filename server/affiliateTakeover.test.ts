import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  access: null as null | { affiliateId: number; isOwner: boolean; accessCrm: boolean; accessDesigner: boolean; teamMemberId: number | null },
  row: null as Record<string, unknown> | null,
  list: [] as Array<Record<string, unknown>>,
  updates: 0,
  limitCalls: 0,
}));

vi.mock("./db", () => ({
  getDb: async () => (globalThis as { __affiliateGuardDb?: unknown }).__affiliateGuardDb,
}));

vi.mock("./lib/affiliateAccess", () => ({
  resolveAffiliateAccess: async () => state.access,
}));

import { appRouter } from "./routers";

const fullTaxId = "123456789";

function ctx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  state.updates = 0;
  state.limitCalls = 0;
  state.access = null;
  state.row = {
    id: 42,
    storeName: "Secret Shop",
    slug: "secret-shop",
    contactName: "Owner Name",
    email: "owner-login@example.com",
    phone: "555-0100",
    referralCode: "SECRET",
    status: "active",
    userId: 99,
    storefrontEnabled: true,
    w9TaxId: fullTaxId,
    w9TaxIdLast4: "6789",
    w9Status: "submitted",
    w9LegalName: "Owner Name",
    w9IdDocumentUrl: "/manus-storage/affiliate-w9-id/license.jpg",
    notes: "private notes",
    setupToken: "setup-secret",
    commissionRate: "0.1000",
    publicEmail: "hello@shop.example",
    publicPhone: "555-0199",
    publicAddress: "1 Main",
    embedEnabled: false,
    embedCode: null,
    location: "Tampa",
  };
  state.list = state.row ? [state.row] : [];
  const chain = {
    from() { return chain; },
    where() { return chain; },
    orderBy() { return chain; },
    limit: async () => {
      state.limitCalls += 1;
      if (state.limitCalls > 1) return [];
      return state.row ? [state.row] : [];
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(state.list).then(onFulfilled, onRejected);
    },
  };
  (globalThis as { __affiliateGuardDb?: unknown }).__affiliateGuardDb = {
    select: () => chain,
    update: () => {
      state.updates += 1;
      return { set: () => ({ where: async () => undefined }) };
    },
  };
});

describe("affiliates.myAffiliate", () => {
  it("does not link a team member or admin onto the owner account and does not return the tax ID", async () => {
    state.access = { affiliateId: 42, isOwner: false, accessCrm: true, accessDesigner: false, teamMemberId: 7 };
    const team = await appRouter.createCaller(ctx({ id: 5, email: "team@example.com", role: "user" } as TrpcContext["user"])).affiliates.myAffiliate();
    expect(team?.email).toBeNull();
    expect(team?.phone).toBeNull();
    expect(team?.contactName).toBeNull();
    expect(JSON.stringify(team)).not.toContain(fullTaxId);
    expect(state.updates).toBe(0);

    state.access = null;
    const admin = await appRouter.createCaller(ctx({ id: 1, email: "admin@example.com", role: "admin" } as TrpcContext["user"])).affiliates.myAffiliate();
    expect(admin).toBeNull();
    expect(state.updates).toBe(0);
  });

  it("returns a masked tax ID to the owner", async () => {
    state.access = { affiliateId: 42, isOwner: true, accessCrm: true, accessDesigner: true, teamMemberId: null };
    const owner = await appRouter.createCaller(ctx({ id: 99, email: "owner-login@example.com", role: "user" } as TrpcContext["user"])).affiliates.myAffiliate();
    expect(owner?.email).toBe("owner-login@example.com");
    expect(owner?.w9TaxIdMasked).toBe("***-**-6789");
    expect(JSON.stringify(owner)).not.toContain(fullTaxId);
    expect(state.updates).toBe(0);
  });

  it("refuses anonymous callers and team members on tax procedures", async () => {
    await expect(appRouter.createCaller(ctx(null)).affiliates.myAffiliate()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    state.access = { affiliateId: 42, isOwner: false, accessCrm: true, accessDesigner: false, teamMemberId: 7 };
    const team = appRouter.createCaller(ctx({ id: 5, email: "team@example.com", role: "user" } as TrpcContext["user"]));
    await expect(team.affiliates.getW9Status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(team.affiliates.myTeam()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("public affiliate storefronts", () => {
  it("omits login email, private phone, contact name, and tax ID", async () => {
    const caller = appRouter.createCaller(ctx(null));
    const one = await caller.affiliates.bySlug({ slug: "secret-shop" });
    const list = await caller.affiliates.listActive();
    for (const dto of [one, ...list]) {
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain("owner-login@example.com");
      expect(serialized).not.toContain("555-0100");
      expect(serialized).not.toContain("Owner Name");
      expect(serialized).not.toContain(fullTaxId);
      expect(dto).not.toHaveProperty("email");
      expect(dto).not.toHaveProperty("phone");
      expect(dto).not.toHaveProperty("contactName");
    }
    expect(one?.publicEmail).toBe("hello@shop.example");
  });
});

describe("affiliates.adminList", () => {
  it("masks the tax ID for admins and refuses non-admins", async () => {
    await expect(appRouter.createCaller(ctx({ id: 5, role: "user" } as TrpcContext["user"])).affiliates.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rows = await appRouter.createCaller(ctx({ id: 1, role: "admin" } as TrpcContext["user"])).affiliates.adminList();
    expect(rows[0]?.w9TaxId).toBeNull();
    expect(rows[0]?.w9TaxIdMasked).toBe("***-**-6789");
    expect(rows[0]?.w9IdDocumentUrl).toBeNull();
    expect(JSON.stringify(rows)).not.toContain(fullTaxId);
  });
});

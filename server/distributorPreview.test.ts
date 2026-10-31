import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { distributors, distributorSkus, doorStyles } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const dbState = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: vi.fn(async () => dbState.current),
}));

import { appRouter } from "./routers";
import { assertNoPreviewSuppliers, skuVisibleToViewer } from "./lib/distributorPreview";

const dialect = new MySqlDialect();
const render = (query: Parameters<MySqlDialect["sqlToQuery"]>[0]) => dialect.sqlToQuery(query);

function userOf(role: string, id = 7) {
  return {
    id, openId: `${role}-test`, name: role, email: `${role}@example.invalid`, role, distributorId: null, approvedVendorLineId: null,
    passwordHash: null, failedLoginAttempts: 0, lockedUntil: null, loginMethod: "test", pricingTier: "homeowner", companyName: null,
    emailLower: null, createdAt: new Date(), updatedAt: new Date(),
  } as unknown as TrpcContext["user"];
}
const caller = (user: TrpcContext["user"]) =>
  appRouter.createCaller({ user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => {} } as unknown as TrpcContext["res"] });

/** A db stub whose selects resolve to canned rows by table, and which records transactional updates. */
function fakeDb(rows: { distributor: Record<string, unknown>; pendingSkus: number; styles: number }) {
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const resultFor = (table: unknown) => (table === distributors ? [rows.distributor] : table === distributorSkus ? [{ n: rows.pendingSkus }] : [{ n: rows.styles }]);
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => Object.assign(Promise.resolve(resultFor(table)), { limit: async () => resultFor(table) }),
      }),
    }),
    transaction: async (run: (tx: unknown) => Promise<void>) =>
      run({ update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updates.push({ table, values }); } }) }) }),
  };
  return { db, updates };
}

const offlineSupplier = (overrides: Record<string, unknown> = {}) => ({
  id: 41, code: "XYZ", name: "Line X", brandName: null, isActive: false, goLiveAcceptedAt: null,
  costMultiplier: "0.2461", baseMultiplier: "0.2300", freightMultiplier: "0.0700", retailPriceBasis: "cost_plus_tier",
  shippingRuleMode: "live", warehouseZips: ["60601"], leadTimeDays: 7, ...overrides,
});

beforeEach(() => { dbState.current = null; });

describe("skuVisibleToViewer", () => {
  it("lets everyone else see only published SKUs of live suppliers", () => {
    const { sql } = render(skuVisibleToViewer(false));
    expect(sql).toContain("`distributor_skus`.`isPublished`");
    expect(sql).toContain("`distributors`.`isActive`");
    expect(sql).not.toContain(" or ");
  });

  it("lets admins also see every SKU of an offline supplier", () => {
    const { sql, params } = render(skuVisibleToViewer(true));
    expect(sql).toContain(" or ");
    expect(sql).toContain("`distributors`.`isActive`");
    expect(params).toContain(false);
  });
});

describe("assertNoPreviewSuppliers", () => {
  const dbReturning = (rows: unknown[]) => {
    const select = vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => rows }) }) }) }));
    return { select };
  };

  it("blocks an order line from an offline supplier or a door style belonging to one", async () => {
    await expect(assertNoPreviewSuppliers(dbReturning([{ id: 41 }]), { distributorIds: [41] })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(assertNoPreviewSuppliers(dbReturning([{ id: 41 }]), { styleIds: [900] })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("allows live suppliers and does not query when there is nothing to check", async () => {
    await expect(assertNoPreviewSuppliers(dbReturning([]), { distributorIds: [1, null], styleIds: [2, undefined] })).resolves.toBeUndefined();
    const db = dbReturning([{ id: 1 }]);
    await expect(assertNoPreviewSuppliers(db, { distributorIds: [null], styleIds: [] })).resolves.toBeUndefined();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("distributorAdmin.goLive", () => {
  it("is admin only", async () => {
    await expect(caller(userOf("user")).distributorAdmin.goLive({ distributorId: 41, acceptedTerms: true, termsVersion: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(null).distributorAdmin.goLive({ distributorId: 41, acceptedTerms: true, termsVersion: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires the terms to be accepted", async () => {
    const { db, updates } = fakeDb({ distributor: offlineSupplier(), pendingSkus: 5, styles: 2 });
    dbState.current = db;
    await expect(
      caller(userOf("admin")).distributorAdmin.goLive({ distributorId: 41, acceptedTerms: false as unknown as true, termsVersion: "x" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates).toHaveLength(0);
  });

  it("goes live for any distributor in one step and records who accepted and when", async () => {
    const { db, updates } = fakeDb({ distributor: offlineSupplier(), pendingSkus: 5, styles: 2 });
    dbState.current = db;
    const admin = caller(userOf("admin", 99));
    const terms = await admin.distributorAdmin.goLiveSummary({ distributorId: 41 });
    const result = await admin.distributorAdmin.goLive({ distributorId: 41, acceptedTerms: true, termsVersion: terms.version });
    expect(result).toMatchObject({ id: 41, isActive: true, publishedSkus: 5, activatedStyles: 2 });
    expect(updates.map((u) => u.table)).toEqual([distributorSkus, doorStyles, distributors]);
    expect(updates[0]!.values).toEqual({ isPublished: true, status: "approved" });
    expect(updates[1]!.values).toEqual({ isActive: true });
    expect(updates[2]!.values).toMatchObject({ isActive: true, goLiveAcceptedByUserId: 99, goLiveTermsVersion: terms.version });
    expect(updates[2]!.values.goLiveAcceptedAt).toBeInstanceOf(Date);
    expect(updates[2]!.values.goLiveTermsSnapshot).toMatchObject({ facts: { pendingSkuCount: 5, doorStyleCount: 2 } });
  });

  it("refuses stale terms and a supplier that is already live", async () => {
    dbState.current = fakeDb({ distributor: offlineSupplier(), pendingSkus: 1, styles: 1 }).db;
    await expect(caller(userOf("admin")).distributorAdmin.goLive({ distributorId: 41, acceptedTerms: true, termsVersion: "old" })).rejects.toMatchObject({ code: "CONFLICT" });
    const live = fakeDb({ distributor: offlineSupplier({ isActive: true }), pendingSkus: 1, styles: 1 });
    dbState.current = live.db;
    const version = (await caller(userOf("admin")).distributorAdmin.goLiveSummary({ distributorId: 41 })).version;
    await expect(caller(userOf("admin")).distributorAdmin.goLive({ distributorId: 41, acceptedTerms: true, termsVersion: version })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(live.updates).toHaveLength(0);
  });
});

describe("distributorAdmin.setActive", () => {
  it("cannot switch on a supplier that has never gone live, so Go live cannot be bypassed", async () => {
    const { db } = fakeDb({ distributor: offlineSupplier(), pendingSkus: 1, styles: 1 });
    dbState.current = db;
    await expect(caller(userOf("admin")).distributorAdmin.setActive({ distributorId: 41, isActive: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("distributors.list (what the Designer shows)", () => {
  const supplier = (id: number, code: string, isActive: boolean) => ({
    id, code, name: `Line ${code}`, initials: code[0], brandName: null, brandInitials: null, whiteLabel: true, displayMode: "neutral",
    seriesName: null, markupPercent: "0", leadTimeDays: 7, isActive,
  });
  const all = [supplier(1, "LIVE", true), supplier(41, "XYZ", false), supplier(42, "ABC", false)];
  const listDb = () => ({
    select: () => ({
      from: () => Object.assign(Promise.resolve(all), { where: async () => all.filter((row) => row.isActive) }),
    }),
    selectDistinct: () => ({ from: () => ({ innerJoin: () => ({ where: async () => all.map((row) => ({ distributorId: row.id })) }) }) }),
  });

  it("gives admins every offline supplier flagged isPreview, and live suppliers no flag", async () => {
    dbState.current = listDb();
    const rows = await caller(userOf("admin")).distributors.list();
    expect(rows.map((row) => [row.code, row.isPreview])).toEqual([["LIVE", false], ["XYZ", true], ["ABC", true]]);
  });

  it("never shows an offline supplier to non-admins or the public", async () => {
    dbState.current = listDb();
    for (const user of [null, userOf("user"), userOf("affiliate"), userOf("contractor")]) {
      const rows = await caller(user).distributors.list();
      expect(rows.map((row) => row.code)).toEqual(["LIVE"]);
      expect(rows.every((row) => row.isPreview === false)).toBe(true);
    }
  });
});

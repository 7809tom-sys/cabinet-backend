/**
 * crm.linkableDesigns used to fall through to `where: undefined` whenever the
 * caller's scope resolved to the house pipeline (every admin without a store)
 * or a contractor, which listed every store's saved designs. These tests pin
 * the store boundary on that list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, kitchenDesigns } from "../../drizzle/schema";
import { crmRouter } from "./crm";
import { memoryStore, type Row } from "../lib/__testDb";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../lib/affiliateAccess", () => ({ resolveAffiliateAccess: async () => null }));

const STORE_A = { id: 7, slug: "store-a", storeName: "Store A", status: "active", referralCode: "STOREA" };
const STORE_B = { id: 9, slug: "store-b", storeName: "Store B", status: "active", referralCode: "STOREB" };

function design(id: number, affiliateId: number | null, userId: number): Row {
  return { id, affiliateId, userId, name: `Design ${id}`, updatedAt: new Date(), placedCabinets: [] };
}

let tables: Map<unknown, Row[]>;

beforeEach(() => {
  tables = new Map<unknown, Row[]>([
    [affiliates, [STORE_A, STORE_B]],
    [kitchenDesigns, [design(101, 7, 900), design(102, 9, 901), design(103, null, 902)]],
  ]);
  getDbMock.mockResolvedValue(memoryStore(tables));
});

function caller(host: string, user: { id: number; role: string }) {
  return crmRouter.createCaller({
    user: { id: user.id, email: `crm-${user.id}@example.test`, role: user.role },
    req: { protocol: "https", headers: { host } } as never,
    res: {} as never,
  } as never);
}

describe("crm.linkableDesigns store boundary", () => {
  it("never lists every store's designs for an admin on a storefront host", async () => {
    const rows = await caller("store-a.cabinetdealz.com", { id: 1, role: "admin" }).linkableDesigns();
    expect(rows.map((row) => row.id)).toEqual([101]);
  });

  it("scopes a contractor to its own designs and never to every store", async () => {
    const rows = await caller("store-b.cabinetdealz.com", { id: 901, role: "contractor" }).linkableDesigns();
    expect(rows.map((row) => row.id)).toEqual([102]);
  });

  it("keeps the house list house-only on the platform hosts", async () => {
    const rows = await caller("www.cabinetdealz.com", { id: 1, role: "admin" }).linkableDesigns();
    expect(rows.map((row) => row.id)).toEqual([103]);
  });
});

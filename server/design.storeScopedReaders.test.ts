/**
 * The other design readers that leaked across stores: assisted editing,
 * the booking design picker, and the countertop quote admin list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, countertopQuotes, kitchenDesigns } from "../drizzle/schema";
import { designAssistRouter } from "./routers/designAssist";
import { consultationsRouter } from "./routers/consultations";
import { designRouter } from "./routers/design";
import { memoryStore, type Row } from "./lib/__testDb";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./lib/affiliateAccess", () => ({ resolveAffiliateAccess: async () => null }));

const STORE_A = { id: 7, slug: "store-a", storeName: "Store A", status: "active", referralCode: "STOREA" };
const STORE_B = { id: 9, slug: "store-b", storeName: "Store B", status: "active", referralCode: "STOREB" };

const DESIGN_A: Row = {
  id: 601,
  userId: 990301,
  affiliateId: 7,
  name: "Store A kitchen",
  roomData: { width: 120, depth: 120 },
  placedCabinets: [],
  recordKind: "customer",
};

let tables: Map<unknown, Row[]>;

beforeEach(() => {
  tables = new Map<unknown, Row[]>([
    [affiliates, [STORE_A, STORE_B]],
    [kitchenDesigns, [DESIGN_A]],
    [
      countertopQuotes,
      [
        { id: 1, affiliateId: 7, contactEmail: "a@example.test", createdAt: new Date(), status: "new" },
        { id: 2, affiliateId: 9, contactEmail: "b@example.test", createdAt: new Date(), status: "new" },
        { id: 3, affiliateId: null, contactEmail: "house@example.test", createdAt: new Date(), status: "new" },
      ],
    ],
  ]);
  getDbMock.mockResolvedValue(memoryStore(tables));
});

function ctx(host: string, user: { id: number; role: string } | null) {
  return {
    user: user
      ? {
          id: user.id,
          openId: `store-${user.id}`,
          name: `Store ${user.id}`,
          email: `store-${user.id}@example.test`,
          role: user.role,
        }
      : null,
    req: { protocol: "https", headers: { host } } as never,
    res: {} as never,
  } as never;
}

describe("assisted editing stays inside the request's store", () => {
  it("does not hand another store's design to an administrator", async () => {
    const onB = designAssistRouter.createCaller(ctx("store-b.cabinetdealz.com", { id: 1, role: "admin" }));
    await expect(onB.suggestCopy({
      designId: 601,
      name: "Cross-store suggestion",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("still loads the design on its own storefront", async () => {
    const onA = designAssistRouter.createCaller(ctx("store-a.cabinetdealz.com", { id: 1, role: "admin" }));
    // The design exists here, so the store check passes; the copy itself is then
    // written, which proves the read was allowed.
    await expect(onA.suggestCopy({
      designId: 601,
      name: "Store A suggestion",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    })).resolves.toMatchObject({ originalId: 601 });
  });
});

describe("booking design picker stays inside the request's store", () => {
  it("lists only the storefront's own designs", async () => {
    const owner = { id: 990301, role: "user" };
    const onB = consultationsRouter.createCaller(ctx("store-b.cabinetdealz.com", owner));
    expect(await onB.myDesigns()).toEqual([]);
    const onA = consultationsRouter.createCaller(ctx("store-a.cabinetdealz.com", owner));
    expect((await onA.myDesigns()).map((row) => row.id)).toEqual([601]);
  });
});

describe("countertop quotes stay inside the request's store", () => {
  it("lists only the storefront's own quotes on an affiliate host", async () => {
    const onA = designRouter.createCaller(ctx("store-a.cabinetdealz.com", { id: 1, role: "admin" }));
    expect((await onA.listCountertopQuotes()).map((row) => row.id)).toEqual([1]);
  });

  it("refuses to update another store's quote", async () => {
    const onB = designRouter.createCaller(ctx("store-b.cabinetdealz.com", { id: 1, role: "admin" }));
    await expect(onB.updateCountertopQuote({ id: 1, status: "won" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const unchanged = (tables.get(countertopQuotes) ?? []).find((row) => row.id === 1);
    expect(unchanged?.status).toBe("new");
  });
});

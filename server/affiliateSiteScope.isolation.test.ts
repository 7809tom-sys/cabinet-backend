import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, affiliateTeamMembers, orderRequests } from "../drizzle/schema";
import { decideDirectoryAccess, recordInDirectoryScope } from "@shared/customerDirectory";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));

import { affiliateCustomersRouter } from "./routers/affiliateCustomers";
import { orderTrackingRouter } from "./routers/orderTracking";

type Store = { id: number; userId: number | null; email: string | null; status: string; slug: string; storeName: string };
type Order = {
  id: number;
  affiliateId: number | null;
  userId: number | null;
  originatorEmail: string | null;
  originatorName: string | null;
  requestNumber: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  totalAmount: string | null;
  confirmedAt: Date | null;
  paidAt: Date | null;
  sentToDistributorAt: Date | null;
  taxAmount: string | null;
  freightQuoteCents: number | null;
  lineItems: unknown[];
  qboInvoiceId: string | null;
  styleName: string | null;
};

function chain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  const builder: Record<string, unknown> = {
    leftJoin: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    groupBy: () => builder,
    limit: () => promise,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => promise.then(resolve, reject),
  };
  return builder;
}

function caller(user: { id: number; role: string; email: string | null }) {
  return {
    user,
    req: { headers: {} },
    res: {},
  } as never;
}

const stores: Store[] = [
  { id: 7, userId: 1, email: "ada@shop.test", status: "active", slug: "ada", storeName: "Ada Store" },
  { id: 8, userId: 2, email: "bea@shop.test", status: "active", slug: "bea", storeName: "Bea Store" },
  { id: 9, userId: 1, email: "ada@shop.test", status: "active", slug: "ada-west", storeName: "Ada West" },
];

function order(partial: Partial<Order> & Pick<Order, "id" | "affiliateId" | "requestNumber">): Order {
  return {
    userId: null,
    originatorEmail: `guest-${partial.id}@shop.test`,
    originatorName: "Guest",
    status: "submitted",
    createdAt: new Date("2026-10-22T12:00:00Z"),
    updatedAt: new Date("2026-10-22T12:00:00Z"),
    totalAmount: "10.00",
    confirmedAt: null,
    paidAt: null,
    sentToDistributorAt: null,
    taxAmount: null,
    freightQuoteCents: null,
    lineItems: [],
    qboInvoiceId: null,
    styleName: "DoorBase",
    ...partial,
  };
}

const orders = [
  order({ id: 1, affiliateId: 7, requestNumber: "CD-20261022-ADA" }),
  order({ id: 2, affiliateId: 8, requestNumber: "CD-20261022-BEA" }),
  order({ id: 3, affiliateId: null, requestNumber: "CD-20261022-HOUSE" }),
];

describe("affiliate site scope decisions", () => {
  const ada = { affiliateId: 7, isOwner: true, accessCrm: true, accessDesigner: true };

  it("does not treat an admin as every store unless adminAll is set", () => {
    expect(decideDirectoryAccess({ role: "admin", access: ada }, null)).toMatchObject({ ok: true, mode: "store", affiliateId: 7 });
    expect(decideDirectoryAccess({ role: "admin", access: null }, null)).toMatchObject({ ok: false });
    expect(decideDirectoryAccess({ role: "admin", access: null }, { adminAll: true })).toMatchObject({ mode: "all" });
    expect(decideDirectoryAccess({ role: "user", access: ada }, { adminAll: true })).toMatchObject({ ok: false });
    expect(recordInDirectoryScope(8, { mode: "store", affiliateId: 7 })).toBe(false);
    expect(recordInDirectoryScope(null, { mode: "store", affiliateId: 7 })).toBe(false);
    expect(recordInDirectoryScope(null, { mode: "house", affiliateId: null })).toBe(true);
    expect(recordInDirectoryScope(8, { mode: "all", affiliateId: null })).toBe(true);
  });

  it("makes a login that owns two stores name one", () => {
    const both = { ...ada, affiliateIds: [7, 9] };
    expect(decideDirectoryAccess({ role: "partner", access: both }, null)).toMatchObject({ ok: false });
    expect(decideDirectoryAccess({ role: "partner", access: both }, { affiliateId: 9 })).toMatchObject({ mode: "store", affiliateId: 9 });
    expect(decideDirectoryAccess({ role: "partner", access: both }, { affiliateId: 8 })).toMatchObject({ ok: false });
  });
});

describe("affiliate customers and order tracking stay on one store", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    getDbMock.mockResolvedValue({
      select: () => ({
        from: (table: unknown) => chain(
          table === affiliates ? stores
            : table === affiliateTeamMembers ? []
              : table === orderRequests ? orders
                : [],
        ),
      }),
    });
  });

  it("shows an admin who is also an affiliate only the store being viewed", async () => {
    const admin = affiliateCustomersRouter.createCaller(caller({ id: 1, role: "admin", email: "ada@shop.test" }));
    const ownStore = await admin.list({ affiliateId: 7 });
    expect(ownStore.customers.map((customer) => customer.email)).toEqual(["guest-1@shop.test"]);
    expect(ownStore.customers[0]?.ownerStoreName).toBe("Ada Store");
    expect(JSON.stringify(ownStore)).not.toContain("guest-2@shop.test");
    expect(JSON.stringify(ownStore)).not.toContain("guest-3@shop.test");

    const otherStore = await admin.list({ affiliateId: 8 });
    expect(otherStore.customers.map((customer) => customer.email)).toEqual(["guest-2@shop.test"]);

    const everyone = await admin.list({ adminAll: true });
    expect(everyone.customers.map((customer) => customer.email).sort()).toEqual([
      "guest-1@shop.test",
      "guest-2@shop.test",
      "guest-3@shop.test",
    ]);
    expect(everyone.customers.find((customer) => customer.affiliateId == null)?.ownerStoreName).toBe("Cabinet Dealz (direct)");
  });

  it("keeps a plain affiliate off another store and off house orders", async () => {
    const affiliate = affiliateCustomersRouter.createCaller(caller({ id: 2, role: "partner", email: "bea@shop.test" }));
    const listed = await affiliate.list({ affiliateId: 8 });
    expect(listed.customers.map((customer) => customer.email)).toEqual(["guest-2@shop.test"]);
    await expect(affiliate.list({ adminAll: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not put another store's order on the order status list", async () => {
    const admin = orderTrackingRouter.createCaller(caller({ id: 1, role: "admin", email: "ada@shop.test" }));
    const viewed = await admin.list({ affiliateId: 7 });
    expect(viewed.map((row) => row.requestNumber)).toEqual(["CD-20261022-ADA"]);
    const ownAccount = await admin.list();
    expect(ownAccount.map((row) => row.requestNumber)).not.toContain("CD-20261022-BEA");
    const all = await admin.list({ adminAll: true });
    expect(all.map((row) => row.requestNumber).sort()).toEqual([
      "CD-20261022-ADA",
      "CD-20261022-BEA",
      "CD-20261022-HOUSE",
    ]);
  });

  it("accepts house and adminAll on customer edits for every admin", async () => {
    const admins = [
      affiliateCustomersRouter.createCaller(caller({ id: 1, role: "admin", email: "ada@shop.test" })),
      affiliateCustomersRouter.createCaller(caller({ id: 4, role: "admin", email: "second-admin@shop.test" })),
    ];
    for (const admin of admins) {
      await expect(admin.setStatus({ adminAll: true, customerKey: "missing-customer", status: "new" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(admin.addNote({ house: true, customerKey: "missing-customer", body: "Called the showroom." })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(admin.setFollowUp({ adminAll: true, customerKey: "missing-customer", followUpAt: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(admin.openDeal({ house: true, customerKey: "missing-customer" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    const affiliate = affiliateCustomersRouter.createCaller(caller({ id: 2, role: "partner", email: "bea@shop.test" }));
    await expect(affiliate.setStatus({ adminAll: true, customerKey: "missing-customer", status: "new" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only an admin can view every store.",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { contractorAccessRequests, users } from "../../drizzle/schema";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("../db", () => ({ getDb: getDbMock }));

import { contractorAccessRouter } from "./contractorAccess";

type StoredUser = { id: number; role: string; email: string | null; emailLower: string | null };
type StoredRequest = {
  id: number;
  userId: number | null;
  submittedByUserId: number | null;
  contractorName: string | null;
  contractorEmail: string | null;
  businessName: string | null;
  phone: string | null;
  licenseNumber: string | null;
  status: string;
  reviewedByUserId: number | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

const application = {
  businessName: "Pat Kitchens",
  phone: "555-0100",
  licenseNumber: "LIC-9",
};

function caller(user: { id: number; role: string; email: string | null } | null) {
  return contractorAccessRouter.createCaller({
    user,
    req: { headers: {} },
    res: {},
  } as never);
}

function chain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  const builder: Record<string, unknown> = {
    leftJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: (count: number) => Promise.resolve(rows.slice(0, count)),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => promise.then(resolve, reject),
  };
  return builder;
}

describe("contractorAccess", () => {
  let userRows: StoredUser[];
  let requestRows: StoredRequest[];
  let updates: { table: string; set: Record<string, unknown> }[];
  let nextId: number;

  beforeEach(() => {
    userRows = [];
    requestRows = [];
    updates = [];
    nextId = 1;
    getDbMock.mockReset();
    getDbMock.mockResolvedValue({
      select: () => ({
        from: (table: unknown) => chain(table === users ? userRows : requestRows),
      }),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          if (table !== contractorAccessRequests) throw new Error("unexpected insert");
          const id = nextId++;
          requestRows.push({
            id,
            userId: null,
            submittedByUserId: null,
            contractorName: null,
            contractorEmail: null,
            businessName: null,
            phone: null,
            licenseNumber: null,
            status: "pending",
            reviewedByUserId: null,
            reviewedAt: null,
            createdAt: new Date(),
            ...values,
          } as StoredRequest);
          return [{ insertId: id }];
        },
      }),
      update: (table: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => {
            updates.push({
              table: table === users ? "users" : "requests",
              set,
            });
          },
        }),
      }),
    });
  });

  it("keeps self-service submit limited to role user and returns an existing pending row", async () => {
    const customer = caller({ id: 8, role: "user", email: "pat@shop.test" });
    const created = await customer.submit(application);
    expect(created).toEqual({ id: 1, status: "pending" });
    expect(requestRows).toHaveLength(1);
    expect(requestRows[0]).toMatchObject({
      userId: 8,
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: "LIC-9",
      status: "pending",
      submittedByUserId: null,
      contractorEmail: null,
      contractorName: null,
    });

    const again = await customer.submit({ ...application, businessName: "Other Name" });
    expect(again).toEqual({ id: 1, status: "pending" });
    expect(requestRows).toHaveLength(1);
    expect(updates).toEqual([]);

    await expect(caller({ id: 9, role: "partner", email: "ada@shop.test" }).submit(application))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Affiliate and staff accounts keep their current role." });
    await expect(caller({ id: 1, role: "admin", email: "admin@shop.test" }).submit(application))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Affiliate and staff accounts keep their current role." });
    await expect(caller({ id: 4, role: "contractor", email: "already@shop.test" }).submit(application))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: "This account is already an approved contractor." });
    expect(requestRows).toHaveLength(1);
  });

  it("lets an affiliate or admin file a contractor and stores the normalized email", async () => {
    userRows.push({ id: 8, role: "user", email: "Pat@Shop.test", emailLower: "pat@shop.test" });
    const affiliate = caller({ id: 9, role: "partner", email: "ada@shop.test" });
    const created = await affiliate.submitForContractor({
      contractorName: " Pat Contractor ",
      contractorEmail: "Pat@Shop.test",
      ...application,
    });
    expect(created).toEqual({ id: 1, status: "pending", duplicate: false });
    expect(requestRows[0]).toMatchObject({
      userId: 8,
      submittedByUserId: 9,
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: "LIC-9",
      status: "pending",
    });

    requestRows.length = 0;
    nextId = 1;
    userRows.length = 0;
    const admin = caller({ id: 1, role: "admin", email: "admin@shop.test" });
    const withoutAccount = await admin.submitForContractor({
      contractorName: "New Contractor",
      contractorEmail: "new@shop.test",
      businessName: "New Co",
      phone: "555-0199",
    });
    expect(withoutAccount).toEqual({ id: 1, status: "pending", duplicate: false });
    expect(requestRows[0]).toMatchObject({
      userId: null,
      submittedByUserId: 1,
      contractorEmail: "new@shop.test",
      licenseNumber: null,
    });
  });

  it("rejects submitForContractor from anyone who is not an affiliate or admin", async () => {
    for (const role of ["user", "contractor", "designer", "distributor"]) {
      await expect(caller({ id: 3, role, email: "person@shop.test" }).submitForContractor({
        contractorName: "Pat Contractor",
        contractorEmail: "pat@shop.test",
        ...application,
      })).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Only affiliate and admin accounts can add a contractor.",
      });
    }
    expect(requestRows).toHaveLength(0);
    await expect(caller(null).submitForContractor({
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      ...application,
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses a contractor who is already approved", async () => {
    userRows.push({ id: 8, role: "contractor", email: "pat@shop.test", emailLower: "pat@shop.test" });
    await expect(caller({ id: 9, role: "partner", email: "ada@shop.test" }).submitForContractor({
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      ...application,
    })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This account is already an approved contractor.",
    });
    expect(requestRows).toHaveLength(0);
  });

  it("prevents a second pending row across self-service and affiliate submit", async () => {
    requestRows.push({
      id: 50,
      userId: 99,
      submittedByUserId: null,
      contractorName: null,
      contractorEmail: "other@shop.test",
      businessName: "Other",
      phone: "555-0000",
      licenseNumber: null,
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date("2026-01-01"),
    });
    userRows.push({ id: 8, role: "user", email: "pat@shop.test", emailLower: "pat@shop.test" });
    const customer = caller({ id: 8, role: "user", email: "pat@shop.test" });
    const affiliate = caller({ id: 9, role: "affiliate", email: "ada@shop.test" });

    const self = await customer.submit(application);
    expect(self).toEqual({ id: 1, status: "pending" });
    const fromAffiliate = await affiliate.submitForContractor({
      contractorName: "Pat Contractor",
      contractorEmail: "PAT@shop.test",
      ...application,
    });
    expect(fromAffiliate).toEqual({ id: 1, status: "pending", duplicate: true });
    expect(requestRows.filter((row) => row.contractorEmail === "pat@shop.test" || row.userId === 8)).toHaveLength(1);

    requestRows.length = 0;
    nextId = 1;
    const filed = await affiliate.submitForContractor({
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      ...application,
    });
    expect(filed).toEqual({ id: 1, status: "pending", duplicate: false });
    const selfAgain = await customer.submit({ ...application, businessName: "Should Not Insert" });
    expect(selfAgain).toEqual({ id: 1, status: "pending" });
    expect(requestRows).toHaveLength(1);

    requestRows.length = 0;
    userRows.length = 0;
    nextId = 1;
    await affiliate.submitForContractor({
      contractorName: "Future Contractor",
      contractorEmail: "future@shop.test",
      businessName: "Future Co",
      phone: "555-0188",
    });
    const laterAccount = caller({ id: 12, role: "user", email: "Future@Shop.test" });
    const attached = await laterAccount.submit(application);
    expect(attached).toEqual({ id: 1, status: "pending" });
    expect(requestRows).toHaveLength(1);
    expect(updates).toContainEqual({ table: "requests", set: { userId: 12 } });
  });

  it("lists the affiliate's own requests newest first with hasAccount", async () => {
    requestRows.push(
      {
        id: 1,
        userId: null,
        submittedByUserId: 9,
        contractorName: "Older",
        contractorEmail: "older@shop.test",
        businessName: "Older Co",
        phone: "555-0101",
        licenseNumber: null,
        status: "pending",
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
      {
        id: 2,
        userId: 8,
        submittedByUserId: 9,
        contractorName: "Newer",
        contractorEmail: "newer@shop.test",
        businessName: "Newer Co",
        phone: "555-0102",
        licenseNumber: "L",
        status: "approved",
        reviewedByUserId: 1,
        reviewedAt: new Date("2026-03-02T00:00:00Z"),
        createdAt: new Date("2026-03-01T00:00:00Z"),
      },
      {
        id: 3,
        userId: null,
        submittedByUserId: 4,
        contractorName: "Someone Else",
        contractorEmail: "else@shop.test",
        businessName: "Else Co",
        phone: "555-0103",
        licenseNumber: null,
        status: "pending",
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: new Date("2026-04-01T00:00:00Z"),
      },
    );
    const rows = await caller({ id: 9, role: "partner", email: "ada@shop.test" }).myAffiliateRequests();
    expect(rows.map((row) => row.id)).toEqual([2, 1]);
    expect(rows[0]).toMatchObject({
      contractorName: "Newer",
      contractorEmail: "newer@shop.test",
      businessName: "Newer Co",
      phone: "555-0102",
      licenseNumber: "L",
      status: "approved",
      hasAccount: true,
      submittedByUserId: 9,
    });
    expect(rows[1]).toMatchObject({ contractorName: "Older", hasAccount: false, status: "pending" });
    await expect(caller({ id: 8, role: "user", email: "pat@shop.test" }).myAffiliateRequests())
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("shows admins the source and the affiliate who submitted each request", async () => {
    const createdAt = new Date("2026-05-01T00:00:00Z");
    const joined = [
      {
        id: 7,
        userId: null,
        businessName: "Affiliate Co",
        phone: "555-0100",
        licenseNumber: null,
        status: "pending",
        createdAt,
        email: null,
        name: null,
        role: null,
        submittedByUserId: 9,
        submittedByName: "Ada Affiliate",
        submittedByEmail: "ada@shop.test",
        contractorName: "Pat Contractor",
        contractorEmail: "pat@shop.test",
      },
      {
        id: 8,
        userId: 3,
        businessName: "Self Co",
        phone: "555-0111",
        licenseNumber: "S",
        status: "approved",
        createdAt: new Date("2026-04-01T00:00:00Z"),
        email: "self@shop.test",
        name: "Self User",
        role: "contractor",
        submittedByUserId: null,
        submittedByName: null,
        submittedByEmail: null,
        contractorName: null,
        contractorEmail: null,
      },
    ];
    let selected: Record<string, unknown> | undefined;
    let joins = 0;
    getDbMock.mockResolvedValue({
      select: (shape: Record<string, unknown>) => {
        selected = shape;
        const builder = {
          leftJoin: () => {
            joins += 1;
            return builder;
          },
          orderBy: async () => joined,
        };
        return { from: () => builder };
      },
    });
    const admin = caller({ id: 1, role: "admin", email: "admin@shop.test" });
    const rows = await admin.list();
    expect(Object.keys(selected ?? {})).toEqual(expect.arrayContaining([
      "id",
      "userId",
      "businessName",
      "phone",
      "licenseNumber",
      "status",
      "createdAt",
      "email",
      "name",
      "role",
      "submittedByUserId",
      "submittedByName",
      "submittedByEmail",
      "contractorName",
      "contractorEmail",
    ]));
    expect(joins).toBe(2);
    expect(rows).toMatchObject([
      {
        id: 7,
        userId: null,
        businessName: "Affiliate Co",
        email: null,
        name: null,
        role: null,
        source: "affiliate",
        submittedByUserId: 9,
        submittedByName: "Ada Affiliate",
        submittedByEmail: "ada@shop.test",
        contractorName: "Pat Contractor",
        contractorEmail: "pat@shop.test",
      },
      {
        id: 8,
        userId: 3,
        email: "self@shop.test",
        name: "Self User",
        role: "contractor",
        source: "self",
        submittedByUserId: null,
        submittedByName: null,
        submittedByEmail: null,
        contractorName: null,
        contractorEmail: null,
      },
    ]);

    const pending = await admin.list({ status: "pending" });
    expect(pending.map((row) => row.id)).toEqual([7]);
    const byAffiliate = await admin.list({ submittedByUserId: 9 });
    expect(byAffiliate.map((row) => row.id)).toEqual([7]);
    await expect(caller({ id: 9, role: "partner", email: "ada@shop.test" }).list())
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("approves a linked account the same way and an unlinked affiliate row without an account", async () => {
    userRows.push({ id: 8, role: "user", email: "pat@shop.test", emailLower: "pat@shop.test" });
    requestRows.push({
      id: 4,
      userId: 8,
      submittedByUserId: 9,
      contractorName: "Pat",
      contractorEmail: "pat@shop.test",
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: null,
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date(),
    });
    const admin = caller({ id: 1, role: "admin", email: "admin@shop.test" });
    const approved = await admin.review({ id: 4, decision: "approved" });
    expect(approved).toEqual({ ok: true, status: "approved" });
    expect(updates).toEqual([
      { table: "users", set: { role: "contractor" } },
      expect.objectContaining({
        table: "requests",
        set: expect.objectContaining({ status: "approved", reviewedByUserId: 1 }),
      }),
    ]);

    updates.length = 0;
    requestRows[0] = { ...requestRows[0], userId: null, status: "pending" };
    const unlinked = await admin.review({ id: 4, decision: "approved" });
    expect(unlinked).toEqual({ ok: true, status: "approved" });
    expect(updates.map((update) => update.table)).toEqual(["requests"]);
    expect(updates[0].set).toMatchObject({ status: "approved", reviewedByUserId: 1 });

    updates.length = 0;
    userRows[0] = { ...userRows[0], role: "contractor" };
    requestRows[0] = { ...requestRows[0], userId: 8, status: "pending" };
    const already = await admin.review({ id: 4, decision: "approved" });
    expect(already).toEqual({ ok: true, status: "approved" });
    expect(updates.map((update) => update.table)).toEqual(["requests"]);

    updates.length = 0;
    requestRows[0] = { ...requestRows[0], userId: null, status: "pending" };
    const denied = await admin.review({ id: 4, decision: "rejected" });
    expect(denied).toEqual({ ok: true, status: "rejected" });
    expect(updates.map((update) => update.table)).toEqual(["requests"]);
    expect(updates[0].set).toMatchObject({ status: "rejected" });
  });

  it("still rejects approval when the linked account is staff or missing", async () => {
    userRows.push({ id: 9, role: "partner", email: "ada@shop.test", emailLower: "ada@shop.test" });
    requestRows.push({
      id: 4,
      userId: 9,
      submittedByUserId: null,
      contractorName: null,
      contractorEmail: null,
      businessName: "Ada",
      phone: "555-0100",
      licenseNumber: null,
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date(),
    });
    const admin = caller({ id: 1, role: "admin", email: "admin@shop.test" });
    await expect(admin.review({ id: 4, decision: "approved" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This account already has a staff or affiliate role.",
    });
    expect(updates).toEqual([]);

    requestRows[0].userId = 404;
    userRows.length = 0;
    await expect(admin.review({ id: 4, decision: "approved" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Account not found.",
    });
  });

  it("lets the submitting affiliate approve their pending row and blocks everyone else", async () => {
    userRows.push({ id: 8, role: "user", email: "pat@shop.test", emailLower: "pat@shop.test" });
    requestRows.push({
      id: 4,
      userId: 8,
      submittedByUserId: 9,
      contractorName: "Pat",
      contractorEmail: "pat@shop.test",
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: null,
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date(),
    });
    const affiliate = caller({ id: 9, role: "partner", email: "ada@shop.test" });
    const approved = await affiliate.affiliateReview({ id: 4, decision: "approved" });
    expect(approved).toEqual({ ok: true, status: "approved" });
    expect(updates).toEqual([
      { table: "users", set: { role: "contractor" } },
      expect.objectContaining({
        table: "requests",
        set: expect.objectContaining({ status: "approved", reviewedByUserId: 9 }),
      }),
    ]);

    updates.length = 0;
    await expect(caller({ id: 4, role: "partner", email: "other@shop.test" }).affiliateReview({ id: 4, decision: "rejected" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "You can only review contractors you submitted." });
    await expect(caller({ id: 8, role: "contractor", email: "pat@shop.test" }).affiliateReview({ id: 4, decision: "approved" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Only an affiliate can review contractors they submitted." });

    requestRows[0].status = "approved";
    await expect(affiliate.affiliateReview({ id: 4, decision: "rejected" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: "Only a pending request can be reviewed." });
    expect(updates).toEqual([]);
  });

  it("lets any admin approve any pending row through affiliateReview", async () => {
    requestRows.push({
      id: 4,
      userId: null,
      submittedByUserId: 9,
      contractorName: "Pat",
      contractorEmail: "pat@shop.test",
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: null,
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date(),
    });
    const otherAdmin = caller({ id: 2, role: "admin", email: "rich@shop.test" });
    const approved = await otherAdmin.affiliateReview({ id: 4, decision: "approved" });
    expect(approved).toEqual({ ok: true, status: "approved" });
    expect(updates).toEqual([
      expect.objectContaining({
        table: "requests",
        set: expect.objectContaining({ status: "approved", reviewedByUserId: 2 }),
      }),
    ]);
  });
});

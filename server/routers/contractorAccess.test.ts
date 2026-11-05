import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, affiliateTeamMembers, contractorAccessRequests, users } from "../../drizzle/schema";

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
  affiliateId?: number | null;
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

type SqlNode = { queryChunks: unknown[] };

function isSqlNode(node: unknown): node is SqlNode {
  return !!node && typeof node === "object" && Array.isArray((node as SqlNode).queryChunks);
}

function isParamNode(node: unknown): node is { value: unknown } {
  return isSqlNode(node) === false
    && !!node
    && typeof node === "object"
    && (node as { constructor?: { name?: string } }).constructor?.name === "Param";
}

function isColumnNode(node: unknown): node is { name: string } {
  return !!node
    && typeof node === "object"
    && typeof (node as { name?: unknown }).name === "string"
    && !isSqlNode(node)
    && !isParamNode(node);
}

/**
 * Drizzle trees are not plain strings, so flatten the SQL/column/param nodes
 * into a token list and interpret the handful of comparisons the router emits.
 * Anything this does not understand counts as matched, which keeps the fake
 * database permissive instead of silently returning the wrong rows.
 */
function flatten(node: unknown, out: unknown[] = []): unknown[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) flatten(item, out);
    return out;
  }
  if (typeof node === "object") {
    const name = (node as { constructor?: { name?: string } }).constructor?.name;
    if (name === "StringChunk") {
      const raw = (node as { value?: unknown }).value;
      out.push(Array.isArray(raw) ? raw.join("") : String(raw ?? ""));
      return out;
    }
    if (isParamNode(node) || isColumnNode(node)) {
      out.push(node);
      return out;
    }
    if (isSqlNode(node)) {
      for (const chunk of node.queryChunks) flatten(chunk, out);
      return out;
    }
  }
  return out;
}

function matchesCondition(condition: unknown, row: Record<string, unknown>): boolean {
  if (condition == null) return true;
  const list = flatten(condition).filter((token) => !(typeof token === "string" && token.trim() === ""));
  let index = 0;

  const isNoise = (token: unknown) => typeof token === "string"
    && !token.startsWith(" and ")
    && !token.startsWith(" or ")
    && token.trim() !== ")"
    && token.trim() !== "(";

  const readComparison = (): boolean => {
    if (list[index] === "(") {
      index += 1;
      const inner = readOr();
      if (list[index] === ")") index += 1;
      return inner;
    }
    // Skip raw-SQL wrappers such as `lower(` that wrap a plain column.
    while (isNoise(list[index])) index += 1;
    const column = list[index];
    if (!isColumnNode(column)) {
      index += 1;
      return true;
    }
    index += 1;
    const operatorToken = list[index];
    if (typeof operatorToken !== "string") return true;
    const operator = operatorToken.trim().toLowerCase();
    index += 1;
    if (operator === "is null") return (row[column.name] ?? null) === null;
    if (operator === "is not null") return (row[column.name] ?? null) !== null;
    while (isNoise(list[index])) index += 1;
    const param = list[index];
    index += 1;
    const expected = isParamNode(param) ? param.value : param;
    if (operator.includes("=")) return (row[column.name] ?? null) === (expected ?? null);
    return true;
  };

  const readAnd = (): boolean => {
    let value = readComparison();
    while (list[index] === " and ") {
      index += 1;
      value = readComparison() && value;
    }
    return value;
  };

  const readOr = (): boolean => {
    let value = readAnd();
    while (list[index] === " or ") {
      index += 1;
      value = readAnd() || value;
    }
    return value;
  };

  return readOr();
}

describe("contractorAccess", () => {
  let userRows: StoredUser[];
  let requestRows: StoredRequest[];
  let affiliateRows: Array<{ id: number; userId: number | null; email: string | null; status: string; slug: string }>;
  let updates: { table: string; set: Record<string, unknown> }[];
  let nextId: number;

  beforeEach(() => {
    userRows = [];
    requestRows = [];
    affiliateRows = [{ id: 70, userId: 9, email: "ada@shop.test", status: "active", slug: "ada-store" }];
    updates = [];
    nextId = 1;
    getDbMock.mockReset();
    getDbMock.mockResolvedValue({
      select: () => ({
        from: (table: unknown) => {
          const rows: unknown[] = table === users ? userRows
            : table === affiliates ? affiliateRows
              : table === affiliateTeamMembers ? []
                : requestRows;
          // affiliateTeamMembers has no rows in these tests, so every scope
          // lookup resolves through the owned-store (userId/email) join only.
          const filter = (condition: unknown) => {
            if (!condition) return rows;
            if (table === affiliateTeamMembers) return [];
            return rows.filter((row) => matchesCondition(condition, row as Record<string, unknown>));
          };
          const builder = (condition?: unknown): Record<string, unknown> => ({
            leftJoin: () => builder(condition),
            where: (where: unknown) => builder(where),
            orderBy: () => builder(condition),
            limit: async (count: number) => filter(condition).slice(0, count),
            then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => (
              Promise.resolve(filter(condition)).then(resolve, reject)
            ),
          });
          return builder();
        },
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
            affiliateId: null,
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
          where: async (condition: unknown) => {
            const target = table === users
              ? (userRows as unknown as Record<string, unknown>[])
              : (requestRows as unknown as Record<string, unknown>[]);
            const matched = target.filter((row) => matchesCondition(condition, row));
            if (matched.length === 0) return { affectedRows: 0 };
            updates.push({
              table: table === users ? "users" : "requests",
              set,
            });
            for (const row of matched) Object.assign(row, set);
            return { affectedRows: matched.length };
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
      affiliateId: 70,
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

  it("returns the affiliate's own pending row for the same contractor instead of inserting", async () => {
    userRows.push({ id: 8, role: "user", email: "pat@shop.test", emailLower: "pat@shop.test" });
    requestRows.push({
      id: 50,
      userId: 8,
      submittedByUserId: 9,
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: null,
      status: "pending",
      affiliateId: 70,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date("2026-01-01"),
    });
    const affiliate = caller({ id: 9, role: "partner", email: "ada@shop.test" });
    const again = await affiliate.submitForContractor({
      contractorName: "Pat Contractor Again",
      contractorEmail: "PAT@shop.test",
      ...application,
    });
    expect(again).toEqual({ id: 50, status: "pending", duplicate: true });
    expect(requestRows).toHaveLength(1);
    expect(updates).toEqual([]);

    const listed = await affiliate.myAffiliateRequests();
    expect(listed.map((row) => row.id)).toEqual([50]);
  });

  it("adopts an orphan pending row with no store and no submitter so it lands in the affiliate list", async () => {
    userRows.push({ id: 8, role: "user", email: "pat@shop.test", emailLower: "pat@shop.test" });
    requestRows.push({
      id: 61,
      userId: 8,
      submittedByUserId: null,
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: null,
      status: "pending",
      affiliateId: null,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date("2026-01-02"),
    });
    const affiliate = caller({ id: 9, role: "partner", email: "ada@shop.test" });

    expect(await affiliate.myAffiliateRequests()).toEqual([]);

    const adopted = await affiliate.submitForContractor({
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      ...application,
    });
    expect(adopted).toEqual({ id: 61, status: "pending", duplicate: true });
    expect(requestRows).toHaveLength(1);
    expect(requestRows[0]).toMatchObject({ affiliateId: 70, submittedByUserId: 9 });
    expect(updates).toEqual([{ table: "requests", set: { affiliateId: 70, submittedByUserId: 9 } }]);

    const listed = await affiliate.myAffiliateRequests();
    expect(listed.map((row) => row.id)).toEqual([61]);
    expect(listed[0]).toMatchObject({ contractorEmail: "pat@shop.test", submittedByUserId: 9 });
  });

  it("files its own pending row when the pending row belongs to a different store", async () => {
    affiliateRows.push({ id: 80, userId: 10, email: "bea@shop.test", status: "active", slug: "bea-store" });
    userRows.push({ id: 8, role: "user", email: "pat@shop.test", emailLower: "pat@shop.test" });
    requestRows.push({
      id: 71,
      userId: 8,
      submittedByUserId: 10,
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: null,
      status: "pending",
      affiliateId: 80,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date("2026-01-03"),
    });
    const affiliate = caller({ id: 9, role: "partner", email: "ada@shop.test" });

    const filed = await affiliate.submitForContractor({
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      ...application,
    });
    expect(filed).toEqual({ id: 1, status: "pending", duplicate: false });
    expect(requestRows).toHaveLength(2);
    expect(updates).toEqual([]);
    expect(requestRows[0]).toMatchObject({ id: 71, affiliateId: 80, submittedByUserId: 10 });
    expect(requestRows[1]).toMatchObject({ id: 1, affiliateId: 70, submittedByUserId: 9 });

    expect((await affiliate.myAffiliateRequests()).map((row) => row.id)).toEqual([1]);
    expect((await caller({ id: 10, role: "partner", email: "bea@shop.test" }).myAffiliateRequests())
      .map((row) => row.id)).toEqual([71]);
  });

  it("does not let a client-supplied affiliateId reach another store", async () => {
    affiliateRows.push({ id: 80, userId: 10, email: "bea@shop.test", status: "active", slug: "bea-store" });
    await expect(caller({ id: 9, role: "partner", email: "ada@shop.test" }).submitForContractor({
      contractorName: "Pat Contractor",
      contractorEmail: "pat@shop.test",
      affiliateId: 80,
      ...application,
    })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You can only view this store's own records.",
    });
    expect(requestRows).toHaveLength(0);
  });

  it("attaches a later account to the affiliate pending row on self-service submit", async () => {
    const affiliate = caller({ id: 9, role: "affiliate", email: "ada@shop.test" });
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
        affiliateId: 70,
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
        affiliateId: 70,
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
        affiliateId: 80,
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
    expect(joins).toBe(3);
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
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "You can only review contractors for this store." });
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

  it("lets every admin list contractor requests", async () => {
    requestRows.push({
      id: 3,
      userId: null,
      submittedByUserId: 9,
      contractorName: "Pat",
      contractorEmail: "pat@shop.test",
      businessName: "Pat Kitchens",
      phone: "555-0100",
      licenseNumber: null,
      status: "pending",
      affiliateId: 70,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    });
    const first = await caller({ id: 2, role: "admin", email: "one-admin@shop.test" }).list();
    const second = await caller({ id: 8, role: "admin", email: "second-admin@shop.test" }).list();
    expect(first.map((row) => row.id)).toEqual([3]);
    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
    await expect(caller({ id: 9, role: "partner", email: "one-admin@shop.test" }).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("logs the exact database error when list hits a missing column", async () => {
    const dbError = Object.assign(new Error("Failed query: select `affiliateId` from `contractor_access_requests`"), {
      cause: { code: "ER_BAD_FIELD_ERROR", errno: 1054, sqlMessage: "Unknown column 'affiliateId' in 'field list'" },
    });
    getDbMock.mockResolvedValue({
      select: () => {
        throw dbError;
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(caller({ id: 8, role: "admin", email: "second-admin@shop.test" }).list()).rejects.toMatchObject({
      message: "Failed query: select `affiliateId` from `contractor_access_requests`",
    });
    expect(spy).toHaveBeenCalledWith("contractorAccess.list", "Unknown column 'affiliateId' in 'field list'");
    spy.mockRestore();
  });
});

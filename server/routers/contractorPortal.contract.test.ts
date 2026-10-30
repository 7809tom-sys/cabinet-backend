import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));

import { contractorPortalRouter } from "./contractorPortal";

function caller(user: { id: number; role: string; email: string | null }) {
  return contractorPortalRouter.createCaller({ user, req: { headers: {} }, res: {} } as never);
}

describe("contractor portal payloads used by the contractor dashboard", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => {
          const builder = {
            where: () => builder,
            orderBy: async () => [],
            limit: async () => [],
          };
          return builder;
        },
      }),
      insert: () => ({
        values: async () => [{ insertId: 1 }],
      }),
      update: () => ({
        set: () => ({ where: async () => undefined }),
      }),
      delete: () => ({
        where: async () => undefined,
      }),
    });
  });

  it("accepts list with no input, create with null contact fields, and assign with a null customer", async () => {
    const contractor = caller({ id: 44, role: "contractor", email: "pat@shop.test" });
    await expect(contractor.customers.list()).resolves.toEqual([]);
    await expect(contractor.designs.list()).resolves.toEqual([]);
    await expect(contractor.customers.create({
      name: "Jane",
      email: null,
      phone: null,
      notes: null,
    })).resolves.toMatchObject({ name: "Jane", email: null, phone: null, notes: null });
    await expect(contractor.designs.assign({ designId: 5, customerId: null })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Saved design not found.",
    });
  });

  it("lets an admin pass contractorUserId and forbids that field for anyone else", async () => {
    const contractor = caller({ id: 44, role: "contractor", email: "pat@shop.test" });
    const admin = caller({ id: 2, role: "admin", email: "rich@shop.test" });
    await expect(contractor.customers.list({ contractorUserId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(contractor.designs.assign({ designId: 5, customerId: 1, contractorUserId: 99 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.customers.list()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.customers.list({ contractorUserId: 44 })).resolves.toEqual([]);
    await expect(admin.designs.list({ contractorUserId: 44 })).resolves.toEqual([]);
    await expect(caller({ id: 9, role: "partner", email: "ada@shop.test" }).customers.list())
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

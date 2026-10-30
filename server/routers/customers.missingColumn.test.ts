import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));

import { customersRouter } from "./customers";

function caller(user: { id: number; role: string; email: string }) {
  return customersRouter.createCaller({
    user,
    req: { headers: {} },
    res: {},
  } as never);
}

describe("customers.list missing column", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("logs the exact database error for every admin", async () => {
    const dbError = Object.assign(
      new Error("Failed query: select `signupAffiliateId` from `users`"),
      {
        cause: {
          code: "ER_BAD_FIELD_ERROR",
          errno: 1054,
          sqlMessage: "Unknown column 'signupAffiliateId' in 'field list'",
        },
      }
    );
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => Promise.reject(dbError),
          orderBy: () => ({
            limit: () => ({ offset: () => Promise.reject(dbError) }),
          }),
          groupBy: () => Promise.reject(dbError),
        }),
      }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      caller({ id: 3, role: "admin", email: "second-admin@shop.test" }).list({
        page: 1,
        pageSize: 10,
      })
    ).rejects.toMatchObject({
      message: "Failed query: select `signupAffiliateId` from `users`",
    });
    expect(spy).toHaveBeenCalledWith(
      "customers.list",
      "Unknown column 'signupAffiliateId' in 'field list'"
    );
    spy.mockRestore();
  });
});

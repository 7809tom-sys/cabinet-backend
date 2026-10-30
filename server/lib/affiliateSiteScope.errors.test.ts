import { describe, expect, it } from "vitest";
import { affiliates, affiliateTeamMembers } from "../../drizzle/schema";
import { resolveAffiliateSiteScope } from "./affiliateSiteScope";

function chain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  const builder: Record<string, unknown> = {
    where: () => builder,
    limit: () => promise,
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown
    ) => promise.then(resolve, reject),
  };
  return builder;
}

function database(
  stores: Array<{
    id: number;
    userId: number | null;
    email: string | null;
    status: string;
    slug: string;
  }>
) {
  return {
    select: () => ({
      from: (table: unknown) =>
        chain(
          table === affiliates || table === affiliateTeamMembers
            ? table === affiliates
              ? stores
              : []
            : []
        ),
    }),
  };
}

describe("affiliate site scope errors", () => {
  const stores = [
    { id: 7, userId: 2, email: "bea@shop.test", status: "active", slug: "bea" },
    {
      id: 9,
      userId: 2,
      email: "bea@shop.test",
      status: "active",
      slug: "bea-west",
    },
  ];

  it("uses 400 or 403 for scope failures and never UNAUTHORIZED", async () => {
    const db = database(stores);
    const failures = [
      resolveAffiliateSiteScope(
        db as never,
        { id: 2, email: "bea@shop.test", role: "partner" },
        { adminAll: true }
      ),
      resolveAffiliateSiteScope(
        db as never,
        { id: 2, email: "bea@shop.test", role: "partner" },
        { house: true }
      ),
      resolveAffiliateSiteScope(db as never, {
        id: 2,
        email: "bea@shop.test",
        role: "partner",
      }),
      resolveAffiliateSiteScope(db as never, {
        id: 5,
        email: "guest@shop.test",
        role: "user",
      }),
      resolveAffiliateSiteScope(db as never, {
        id: 8,
        email: "admin-without-store@shop.test",
        role: "admin",
      }),
    ];
    for (const attempt of failures) {
      const error = await attempt.then(
        () => null,
        (caught: { code?: string }) => caught
      );
      expect(error?.code).toBeTruthy();
      expect(error?.code).not.toBe("UNAUTHORIZED");
    }
    await expect(
      resolveAffiliateSiteScope(
        db as never,
        { id: 2, email: "bea@shop.test", role: "partner" },
        { adminAll: true }
      )
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only an admin can view every store.",
    });
    await expect(
      resolveAffiliateSiteScope(db as never, {
        id: 2,
        email: "bea@shop.test",
        role: "partner",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Choose which affiliate store to view.",
    });
    await expect(
      resolveAffiliateSiteScope(database([]) as never, {
        id: 8,
        email: "admin-without-store@shop.test",
        role: "admin",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Open the admin directory to view every store.",
    });
    await expect(
      resolveAffiliateSiteScope(database([]) as never, {
        id: 5,
        email: "guest@shop.test",
        role: "user",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "No affiliate account is linked to your login.",
    });
  });

  it("gives every admin the same all-store authority", async () => {
    const db = database([]);
    const first = await resolveAffiliateSiteScope(
      db as never,
      { id: 1, email: "ada@shop.test", role: "admin" },
      { adminAll: true }
    );
    const second = await resolveAffiliateSiteScope(
      db as never,
      { id: 44, email: "second-admin@shop.test", role: "admin" },
      { adminAll: true }
    );
    expect(first).toEqual({ mode: "all" });
    expect(second).toEqual(first);
    const house = await resolveAffiliateSiteScope(
      db as never,
      { id: 44, email: "second-admin@shop.test", role: "admin" },
      { house: true }
    );
    expect(house).toEqual({ mode: "house" });
  });
});

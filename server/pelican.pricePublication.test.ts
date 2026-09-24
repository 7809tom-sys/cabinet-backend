import { describe, expect, it } from "vitest";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { pelicanProducts } from "../drizzle/pelicanSchema";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function adminCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "admin@example.com",
    name: "Test Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const caller = appRouter.createCaller(adminCtx());

describe("Pelican price publication enforcement", () => {
  it("refuses to reactivate an item that has no positive authorized price base", async () => {
    const db = await getDb();
    if (!db) return;

    const [unpriced] = await db
      .select({ id: pelicanProducts.id })
      .from(pelicanProducts)
      .where(and(
        sql`COALESCE(${pelicanProducts.yourCost}, 0) <= 0`,
        sql`COALESCE(${pelicanProducts.listPrice}, 0) <= 0`,
        or(eq(pelicanProducts.isActive, false), eq(pelicanProducts.showInCatalog, false)),
      ))
      .orderBy(asc(pelicanProducts.id))
      .limit(1);
    if (!unpriced) return;

    await expect(caller.pelican.setVisibility({ id: unpriced.id, isActive: true })).rejects.toThrow(
      /cannot be activated or published/i,
    );
  });

  it("keeps a zero-priced item unavailable when an administrator saves its pricing", async () => {
    const db = await getDb();
    if (!db) return;

    const suffix = Date.now().toString(36);
    const insert = await db.insert(pelicanProducts).values({
      pelicanCode: `__vitest_unpriced_surface_${suffix}`,
      slug: `vitest-unpriced-surface-${suffix}`,
      name: "Vitest unpriced surface",
      description: "Temporary regression fixture",
      category: "Flooring",
    });
    const id = Number((insert as unknown as [{ insertId: number }])[0]?.insertId);
    expect(id).toBeGreaterThan(0);

    try {
      const result = await caller.pelican.setPricing({ id, yourCost: 0, listPrice: 0 });
      expect(result).toEqual({ success: true, unpublished: true });

      const [after] = await db
        .select({ isActive: pelicanProducts.isActive, showInCatalog: pelicanProducts.showInCatalog, showInDesigner: pelicanProducts.showInDesigner })
        .from(pelicanProducts)
        .where(eq(pelicanProducts.id, id));
      expect(after).toEqual({ isActive: false, showInCatalog: false, showInDesigner: false });
    } finally {
      await db.delete(pelicanProducts).where(eq(pelicanProducts.id, id));
    }
  });

  it("returns only records with no positive authorized source base in the administrator unpriced audit", async () => {
    const result = await caller.pelican.adminList({ unpricedOnly: true, limit: 500 });
    expect(result.items.every((item) => Number(item.yourCost) <= 0 && Number(item.listPrice) <= 0)).toBe(true);
  });
});

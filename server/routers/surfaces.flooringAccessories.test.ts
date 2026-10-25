import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { pelicanProducts } from "../../drizzle/pelicanSchema";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("surfaces flooring accessory suggestions", () => {
  it("returns only active, catalog-visible, source-priced exact trim suggestions after a real floor selection", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const floors = await db.select().from(pelicanProducts).where(and(
      eq(pelicanProducts.category, "Flooring"),
      eq(pelicanProducts.subCategory, "Planks & Flooring"),
      eq(pelicanProducts.isActive, true),
      eq(pelicanProducts.showInCatalog, true),
    ));

    let matches: Awaited<ReturnType<typeof caller.surfaces.matchingFlooringAccessories>> = [];
    for (const floor of floors) {
      matches = await caller.surfaces.matchingFlooringAccessories({ flooringProductId: floor.id, limit: 24 });
      if (matches.length > 0) break;
    }

    expect(matches.length).toBeGreaterThan(0);
    for (const row of matches) {
      expect(row.category).toBe("Flooring");
      expect(row.subCategory).toBe("Moldings & Trim");
      expect(row.sellPrice ?? 0).toBeGreaterThan(0);
      expect(row.pelicanCode).toBeTruthy();
    }
  });

  it("does not return trim for an invalid or non-floor product id", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const nonFloor = await db.select({ id: pelicanProducts.id }).from(pelicanProducts).where(eq(pelicanProducts.category, "Sinks & Faucets")).limit(1);
    if (!nonFloor[0]) return;
    await expect(caller.surfaces.matchingFlooringAccessories({ flooringProductId: nonFloor[0].id, limit: 24 })).resolves.toEqual([]);
  });

  it("refreshes an explicitly selected active flooring trim with its own live catalog price", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const trim = (await db.select().from(pelicanProducts).where(and(
      eq(pelicanProducts.category, "Flooring"),
      eq(pelicanProducts.subCategory, "Moldings & Trim"),
      eq(pelicanProducts.isActive, true),
      eq(pelicanProducts.showInCatalog, true),
    )).limit(1))[0];
    if (!trim) return;

    const rows = await caller.surfaces.designSelectionByIds({ ids: [trim.id] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: trim.id, category: "Flooring", subCategory: "Moldings & Trim" });
    expect(rows[0]?.sellPrice ?? 0).toBeGreaterThan(0);
  });
});

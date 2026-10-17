// ─────────────────────────────────────────────────────────────────────────────
// catalog.stylesForCabinet — regression guard.
//
// This query starts FROM distributor_skus and joins door_styles + distributors.
// It applies notInConflict(), which references cabinets.conflictStatus — so the
// cabinets table MUST be joined or the whole SQL statement fails (the bug that
// broke every /catalog/:code product page, e.g. CTRAY-33). This test asserts the
// procedure runs and returns an array without throwing.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, distributorSkus, doorStyles, distributors } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TEMPORARY_ONE_DOLLAR_TEST_SKU } from "../shared/temporaryCheckoutTest";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("catalog.stylesForCabinet", () => {
  it("runs without a SQL error and returns an array", async () => {
    const db = await getDb();
    if (!db) return;
    // Pick any cabinet that actually has a published/available SKU so we exercise
    // the join + conflict predicate on real rows.
    const rows = await db
      .select({ cabinetId: distributorSkus.cabinetId })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(and(eq(distributorSkus.isAvailable, true), eq(distributorSkus.isPublished, true)))
      .limit(1);
    if (rows.length === 0) return;

    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.pricing.stylesForCabinet({ cabinetId: rows[0].cabinetId });
    expect(Array.isArray(res)).toBe(true);
  });

  it("uses the verified public alias instead of the internal generic style name", async () => {
    const db = await getDb();
    if (!db) return;

    const rows = await db
      .select({ cabinetId: distributorSkus.cabinetId, styleId: doorStyles.id })
      .from(distributorSkus)
      .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(and(
        eq(doorStyles.aliasName, "Air Dawn (Preston)"),
        eq(doorStyles.ourName, "Slim White Oak"),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ))
      .limit(1);
    if (rows.length === 0) return;

    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.pricing.stylesForCabinet({ cabinetId: rows[0].cabinetId });
    const airDawn = res.find((row) => row.styleId === rows[0].styleId);

    expect(airDawn?.name).toBe("Air Dawn (Preston)");
    expect(airDawn?.name).not.toBe("Slim White Oak");
  });

  it("keeps a Frameless catalog link inside the selected USCD supplier line", async () => {
    const db = await getDb();
    if (!db) return;

    const [row] = await db
      .select({ cabinetId: cabinets.id, styleId: doorStyles.id, distributorId: distributors.id })
      .from(cabinets)
      .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
      .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .where(and(
        eq(cabinets.masterCode, "3DB21"),
        eq(distributors.code, "AEF"),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ))
      .limit(1);
    if (!row) return;

    const caller = appRouter.createCaller(publicCtx());
    const styles = await caller.pricing.stylesForCabinet({ cabinetId: row.cabinetId, styleId: row.styleId });

    expect(styles.length).toBeGreaterThan(0);
    expect(styles.every((style) => style.distributorId === row.distributorId)).toBe(true);
    expect(styles.some((style) => style.styleId === row.styleId)).toBe(true);
  });

  it("returns the published Frameless source description instead of shared-master staging text", async () => {
    const db = await getDb();
    if (!db) return;

    const [row] = await db
      .select({ cabinetId: cabinets.id, styleId: doorStyles.id })
      .from(cabinets)
      .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
      .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .where(and(
        eq(cabinets.masterCode, "2DBID36"),
        eq(distributors.code, "AEF"),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ))
      .limit(1);
    if (!row) return;

    const caller = appRouter.createCaller(publicCtx());
    const styles = await caller.pricing.stylesForCabinet({ cabinetId: row.cabinetId, styleId: row.styleId });
    const selected = styles.find((style) => style.styleId === row.styleId);

    expect(selected?.supplierDescription).toContain("Two Drawer Base with One Inner Drawer");
    expect(selected?.supplierDescription).not.toMatch(/staged|pending Designer proof/i);
  });

  it("keeps the temporary one-dollar checkout SKU purchasable with an active style", async () => {
    const db = await getDb();
    if (!db) return;

    const rows = await db
      .select({ cabinetId: cabinets.id, styleId: distributorSkus.styleId })
      .from(cabinets)
      .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
      .innerJoin(doorStyles, eq(doorStyles.id, distributorSkus.styleId))
      .where(and(
        eq(cabinets.masterCode, TEMPORARY_ONE_DOLLAR_TEST_SKU),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        eq(doorStyles.isActive, true),
      ))
      .limit(1);

    expect(rows).toHaveLength(1);
    const caller = appRouter.createCaller(publicCtx());
    const styles = await caller.pricing.stylesForCabinet({ cabinetId: rows[0].cabinetId });
    const checkoutStyle = styles.find((style) => style.styleId === rows[0].styleId);

    expect(checkoutStyle?.homeownerPrice).toBe("1.00");
    expect(checkoutStyle?.name).toBeTruthy();
  });
});

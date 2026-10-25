// ─────────────────────────────────────────────────────────────────────────────
// Regression: doorStyles.familyCatalog must return the viewer's TIER SELL price,
// not the raw list/MSRP column. Bug symptom: the cart showed list prices instead
// of the price the customer actually pays, because familyCatalog surfaced raw
// distributor_skus columns without computing the per-tier markup or gating the
// trade columns. This mirrors the entitlement logic in pricing.stylesForCabinet.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, getPricingSettings } from "./db";
import { sellPriceForTier } from "@shared/margins";
import { distributorSkus, cabinets, doorStyles } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function homeownerCtx(): TrpcContext {
  return {
    // A logged-in homeowner-tier customer (no trade tier).
    user: { id: 999999, role: "user", pricingTier: "homeowner" } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("doorStyles.familyCatalog — tier sell prices, not list", () => {
  it("never exposes trade (wholesale/contractor) columns to a homeowner viewer", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(homeownerCtx());
    const styles = await caller.doorStyles.list();
    if (styles.length === 0) return;

    const result = await caller.doorStyles.familyCatalog({ styleId: styles[0].id });
    for (const item of result.items) {
      // Homeowner entitlement: only homeowner + list-reference columns survive.
      expect(item.wholesalePrice).toBeNull();
      expect(item.contractorPrice).toBeNull();
    }
  });

  it("homeowner price is the computed sell price from the SKU cost base (markup applied)", async () => {
    const db = await getDb();
    if (!db) return;

    // Find a style that has published/available SKUs.
    const styleRow = await db
      .select({ styleId: distributorSkus.styleId })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .where(
        and(
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.isPublished, true),
          eq(cabinets.isActive, true),
          eq(doorStyles.isActive, true),
        ),
      )
      .limit(1);
    if (styleRow.length === 0) return;
    const styleId = styleRow[0].styleId!;

    // Pull the RAW cost columns straight from the DB for every SKU in the style,
    // keyed by cabinetId, so we can recompute the expected sell price the same
    // way the router does (from the SKU cost base, NOT the gated response).
    const rawRows = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        yourCost: distributorSkus.yourCost,
        wholesalePrice: distributorSkus.wholesalePrice,
        adjustedListPrice: distributorSkus.adjustedListPrice,
        listPrice: distributorSkus.listPrice,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(
        and(
          eq(distributorSkus.styleId, styleId),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.isPublished, true),
          eq(cabinets.isActive, true),
        ),
      );
    // Build the cheapest-cost cost row per cabinet (matches the router's
    // "prefer lowest contractor/wholesale" collapse closely enough for cost).
    const costByCabinet = new Map<number, (typeof rawRows)[number]>();
    for (const r of rawRows) {
      const existing = costByCabinet.get(r.cabinetId);
      if (!existing) {
        costByCabinet.set(r.cabinetId, r);
        continue;
      }
      const a = Number(r.wholesalePrice ?? r.listPrice ?? Infinity);
      const b = Number(existing.wholesalePrice ?? existing.listPrice ?? Infinity);
      if (a < b) costByCabinet.set(r.cabinetId, r);
    }

    const ps = await getPricingSettings();
    const caller = appRouter.createCaller(homeownerCtx());
    const result = await caller.doorStyles.familyCatalog({ styleId });
    if (result.items.length === 0) return;

    let checked = 0;
    for (const item of result.items) {
      if (item.homeownerPrice == null) continue;
      // The returned homeownerPrice must be a real computed number.
      expect(Number.isNaN(Number(item.homeownerPrice))).toBe(false);
      expect(Number(item.homeownerPrice)).toBeGreaterThan(0);

      // NOTE: the router collapses on lowest CONTRACTOR price; our test map
      // collapses on lowest wholesale. When there is a single SKU per cabinet
      // (the common case) they agree, so assert the exact sell-price math then.
      const raw = rawRows.filter((r) => r.cabinetId === item.cabinetId);
      if (raw.length === 1) {
        const expected = sellPriceForTier(raw[0], ps, "homeowner");
        if (expected != null) {
          expect(Number(item.homeownerPrice)).toBeCloseTo(expected, 2);
          checked++;
        }
      }
    }
    // We must have verified the exact markup math on at least one real SKU.
    expect(checked).toBeGreaterThan(0);
  });

  it("still runs for anonymous visitors and returns homeowner (retail) pricing", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const styles = await caller.doorStyles.list();
    if (styles.length === 0) return;
    const result = await caller.doorStyles.familyCatalog({ styleId: styles[0].id });
    for (const item of result.items) {
      expect(item.wholesalePrice).toBeNull();
      expect(item.contractorPrice).toBeNull();
    }
  });
});

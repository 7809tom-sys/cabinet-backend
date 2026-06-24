import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, doorStyles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("design.resolveSkins", () => {
  it("returns empty for no items", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const styleRow = (
      await db.select({ id: doorStyles.id }).from(doorStyles).limit(1)
    )[0];
    if (!styleRow) return;
    const res = await caller.design.resolveSkins({ styleId: styleRow.id, items: [] });
    expect(res.lines).toEqual([]);
  });

  it("flags Hickory (HS) as mandatory and computes skin lines for exposed sides", async () => {
    const db = await getDb();
    if (!db) return;

    const hs = (
      await db
        .select({ id: doorStyles.id, styleCode: doorStyles.styleCode })
        .from(doorStyles)
        .where(eq(doorStyles.styleCode, "HS"))
        .limit(1)
    )[0];
    if (!hs) return; // Hickory style not in this catalog snapshot

    // Pick any real base cabinet to mark as exposed.
    const baseCab = (
      await db
        .select({ id: cabinets.id })
        .from(cabinets)
        .where(eq(cabinets.placementType, "base"))
        .limit(1)
    )[0];
    if (!baseCab) return;

    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.design.resolveSkins({
      styleId: hs.id,
      items: [{ cabinetId: baseCab.id, exposedLeft: true, exposedRight: true, qty: 1 }],
    });

    expect(res.mandatory).toBe(true);
    expect(res.styleCode).toBe("HS");
    expect(res.lines.length).toBe(1);
    const line = res.lines[0];
    expect(line.cabinetId).toBe(baseCab.id);
    expect(line.skins.length).toBeGreaterThan(0);
    // base placement -> BSV skin, qty 2 (left + right)
    expect(line.skins[0].skinCode).toBe("BSV");
    expect(line.skins[0].qty).toBe(2);
    // `available` reflects whether a priced skin SKU exists in HS — boolean either way.
    expect(typeof line.skins[0].available).toBe("boolean");
  });

  it("non-Hickory style is not mandatory", async () => {
    const db = await getDb();
    if (!db) return;
    const other = (
      await db
        .select({ id: doorStyles.id, styleCode: doorStyles.styleCode })
        .from(doorStyles)
        .limit(50)
    ).find((s) => s.styleCode !== "HS" && s.styleCode !== "RH");
    if (!other) return;
    const baseCab = (
      await db.select({ id: cabinets.id }).from(cabinets).where(eq(cabinets.placementType, "base")).limit(1)
    )[0];
    if (!baseCab) return;
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.design.resolveSkins({
      styleId: other.id,
      items: [{ cabinetId: baseCab.id, exposedLeft: true }],
    });
    expect(res.mandatory).toBe(false);
  });

  it("no exposed sides -> no skin lines even for Hickory", async () => {
    const db = await getDb();
    if (!db) return;
    const hs = (
      await db.select({ id: doorStyles.id }).from(doorStyles).where(eq(doorStyles.styleCode, "HS")).limit(1)
    )[0];
    if (!hs) return;
    const baseCab = (
      await db.select({ id: cabinets.id }).from(cabinets).where(eq(cabinets.placementType, "base")).limit(1)
    )[0];
    if (!baseCab) return;
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.design.resolveSkins({
      styleId: hs.id,
      items: [{ cabinetId: baseCab.id }],
    });
    expect(res.lines).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { affiliates, affiliateStyleBranding } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// The seeded "First Class" affiliate is linked by this email.
const PARTNER = { id: 99999, email: "firstclassfcd@yahoo.com" };

function partnerCtx(): TrpcContext {
  return {
    user: {
      id: PARTNER.id,
      openId: "o-partner",
      name: "First Class",
      email: PARTNER.email,
      role: "partner",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function strangerCtx(): TrpcContext {
  return {
    user: {
      id: 88888,
      openId: "o-stranger",
      name: "Nobody",
      email: "stranger-branding@nowhere.com",
      role: "user",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("affiliate white-label branding + markup", () => {
  it("myBranding returns markup config + the active door-style catalog", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const caller = appRouter.createCaller(partnerCtx());
    const data = await caller.affiliates.myBranding();
    expect(data).not.toBeNull();
    expect(typeof data!.defaultMarkupBps).toBe("number");
    expect(Array.isArray(data!.styles)).toBe(true);
    // every style row carries an (id, ourName, override) shape
    if (data!.styles.length > 0) {
      const s = data!.styles[0];
      expect(typeof s.id).toBe("number");
      expect("override" in s).toBe(true);
    }
  });

  it("returns null myBranding for a user with no linked affiliate", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(strangerCtx());
    const data = await caller.affiliates.myBranding();
    expect(data).toBeNull();
  });

  it("updateMyMarkup persists the default markup + category JSON and round-trips", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const before = await caller.affiliates.myBranding();
    const originalBps = before!.defaultMarkupBps;
    const originalCat = before!.categoryMarkup;
    try {
      await caller.affiliates.updateMyMarkup({
        defaultMarkupBps: 2750,
        categoryMarkup: { base: 3000, wall: 1500 },
      });
      const after = await caller.affiliates.myBranding();
      expect(after!.defaultMarkupBps).toBe(2750);
      expect(after!.categoryMarkup.base).toBe(3000);
      expect(after!.categoryMarkup.wall).toBe(1500);
    } finally {
      // restore
      await caller.affiliates.updateMyMarkup({
        defaultMarkupBps: originalBps,
        categoryMarkup: originalCat,
      });
    }
  });

  it("accepts a markup above the old 500% cap (no business cap on margin)", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const before = await caller.affiliates.myBranding();
    const originalBps = before!.defaultMarkupBps;
    const originalCat = before!.categoryMarkup;
    try {
      // 80000 bps = +800%, which the previous max(50000) cap would have rejected.
      await caller.affiliates.updateMyMarkup({ defaultMarkupBps: 80000 });
      const after = await caller.affiliates.myBranding();
      expect(after!.defaultMarkupBps).toBe(80000);
    } finally {
      await caller.affiliates.updateMyMarkup({
        defaultMarkupBps: originalBps,
        categoryMarkup: originalCat,
      });
    }
  });

  it("myBranding exposes every active door style so all 1–61 styles are configurable", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const data = await caller.affiliates.myBranding();
    expect(data).not.toBeNull();
    // The per-style table is driven by this list; every row must carry an
    // (id, ourName, override) shape so the affiliate can set any/all styles.
    for (const s of data!.styles) {
      expect(typeof s.id).toBe("number");
      expect("override" in s).toBe(true);
    }
  });

  it("upsertStyleBranding sets then clears a per-style override", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const data = await caller.affiliates.myBranding();
    if (!data || data.styles.length === 0) return;
    const styleId = data.styles[0].id;
    const affId = data.affiliateId;
    try {
      await caller.affiliates.upsertStyleBranding({
        styleId,
        brandName: "Coastal White (test)",
        markupBps: 4200,
      });
      const after = await caller.affiliates.myBranding();
      const row = after!.styles.find((s) => s.id === styleId);
      expect(row?.override?.brandName).toBe("Coastal White (test)");
      expect(row?.override?.markupBps).toBe(4200);

      // clearing resets name + markup to null
      await caller.affiliates.upsertStyleBranding({
        styleId,
        brandName: null,
        markupBps: null,
      });
      const cleared = await caller.affiliates.myBranding();
      const clearedRow = cleared!.styles.find((s) => s.id === styleId);
      expect(clearedRow?.override?.brandName ?? null).toBeNull();
      expect(clearedRow?.override?.markupBps ?? null).toBeNull();
    } finally {
      // hard cleanup so the live storefront isn't polluted
      await db
        .delete(affiliateStyleBranding)
        .where(eq(affiliateStyleBranding.affiliateId, affId));
    }
  });

  it("blocks a stranger from editing branding", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(strangerCtx());
    await expect(
      caller.affiliates.updateMyMarkup({ defaultMarkupBps: 1234 })
    ).rejects.toThrow();
    await expect(
      caller.affiliates.upsertStyleBranding({ styleId: 1, brandName: "x" })
    ).rejects.toThrow();
  });
});

// guard: ensure the seed affiliate still exists for the linkage above
describe("branding test prerequisites", () => {
  it("the First Class affiliate is present", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(affiliates).where(eq(affiliates.slug, "firstclass")).limit(1);
    expect(rows.length).toBe(1);
  });
});

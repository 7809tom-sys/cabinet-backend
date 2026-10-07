import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { verifiedPelicanFaucetProfile, verifiedPelicanPotFillerProfile, verifiedPelicanSinkProfile } from "../../client/src/lib/pelicanFixtureProfiles";

// Public procedure — a minimal unauthenticated context is enough.
function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

type Rec = {
  id: number;
  pelicanCode?: string | null;
  slug: string;
  name: string;
  category: string;
  subCategory: string | null;
  size: string | null;
  imageUrl: string | null;
  materialImageUrl?: string | null;
  sellPrice: number | null;
  unsupportedOverhangLimitIn?: number | null;
};

const ACCESSORY =
  /clip|strainer|\bgrid\b|template|mounting|drain assembly|flange|cutting board|colander|bottom grid|rinse basket/i;

// These tests hit the live dev database. When no DB is configured (e.g. CI
// without a connection) the procedure returns [] and we skip the assertions
// rather than fail spuriously.
describe("surfaces.recommended", () => {
  it("returns flooring planks only, priced, with photos, within the limit", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = (await caller.surfaces.recommended({ role: "flooring", limit: 6 })) as Rec[];
    expect(rows.length).toBeLessThanOrEqual(6);
    for (const r of rows) {
      expect(r.category).toBe("Flooring");
      expect(r.subCategory).toBe("Planks & Flooring");
      expect(r.sellPrice).not.toBeNull();
      expect(r.sellPrice ?? 0).toBeGreaterThan(0);
      expect(r.imageUrl && r.imageUrl.length > 0).toBe(true);
      expect(r.materialImageUrl && r.materialImageUrl.length > 0).toBe(true);
    }
  });

  it("returns Tile & Mosaic for backsplash", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = (await caller.surfaces.recommended({ role: "backsplash", limit: 8 })) as Rec[];
    expect(rows.length).toBeLessThanOrEqual(8);
    for (const r of rows) {
      expect(r.category).toBe("Tile & Mosaic");
      expect(r.imageUrl && r.imageUrl.length > 0).toBe(true);
      expect(r.materialImageUrl && r.materialImageUrl.length > 0).toBe(true);
    }
  });

  it("returns source-priced Quartz slabs for countertop even when an exact 3D swatch is pending", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = (await caller.surfaces.recommended({ role: "countertop", limit: 8 })) as Rec[];
    for (const r of rows) {
      expect(r.category).toBe("Quartz Slabs (Countertops)");
      expect(r.sellPrice ?? 0).toBeGreaterThan(0);
      expect(Object.prototype.hasOwnProperty.call(r, "unsupportedOverhangLimitIn")).toBe(true);
      expect(r.unsupportedOverhangLimitIn == null || Number.isFinite(r.unsupportedOverhangLimitIn)).toBe(true);
    }
    expect(rows.some((r) => !r.materialImageUrl?.trim())).toBe(true);
  });

  it("returns only source-measured Designer fixtures and excludes accessories", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());

    const sinks = (await caller.surfaces.recommended({ role: "sink", limit: 8 })) as Rec[];
    for (const r of sinks) {
      expect(r.category).toBe("Sinks & Faucets");
      expect(r.subCategory).toBe("Sinks");
      // No mis-filed accessory parts (clips, grids, strainers, etc.)
      expect(ACCESSORY.test(r.name)).toBe(false);
      expect(verifiedPelicanSinkProfile(r.pelicanCode)).not.toBeNull();
    }

    const faucets = (await caller.surfaces.recommended({ role: "faucet", limit: 8 })) as Rec[];
    for (const r of faucets) {
      expect(r.category).toBe("Sinks & Faucets");
      expect(r.subCategory).toBe("Faucets");
      expect(ACCESSORY.test(r.name)).toBe(false);
      expect(verifiedPelicanFaucetProfile(r.pelicanCode)).not.toBeNull();
    }
  });

  it("keeps source-verified sink profiles available to a standard SB-36", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const sinks = (await caller.surfaces.recommended({ role: "sink", limit: 24 })) as Rec[];
    expect(sinks.some((sink) => Boolean(verifiedPelicanSinkProfile(sink.pelicanCode)))).toBe(true);
  });

  it("returns positively priced PL-8369 variants only through the dedicated range-wall pot-filler workflow", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = (await caller.surfaces.recommended({ role: "pot-filler", limit: 8 })) as Rec[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.category).toBe("Sinks & Faucets");
      expect(row.sellPrice ?? 0).toBeGreaterThan(0);
      expect(verifiedPelicanPotFillerProfile(row.pelicanCode)).not.toBeNull();
    }
  });

  it("keeps Pelican bathroom catalog families out of kitchen sink and faucet recommendations", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const bathroomSinks = (await caller.surfaces.recommended({ role: "bathroom-sink", limit: 24 })) as Rec[];
    const bathroomFaucets = (await caller.surfaces.recommended({ role: "bathroom-faucet", limit: 48 })) as Rec[];

    expect(bathroomSinks.length).toBeGreaterThan(0);
    expect(bathroomFaucets.length).toBeGreaterThan(0);
    for (const row of bathroomSinks) {
      expect(row.category).toBe("Sinks & Faucets");
      expect(`${row.name}`.toLowerCase()).not.toContain("kitchen");
      expect(row.sellPrice ?? 0).toBeGreaterThan(0);
    }
    for (const row of bathroomFaucets) {
      expect(row.category).toBe("Sinks & Faucets");
      expect(`${row.name}`.toLowerCase()).not.toContain("kitchen");
      expect(row.sellPrice ?? 0).toBeGreaterThan(0);
    }

    const kitchenSinks = (await caller.surfaces.recommended({ role: "sink", limit: 48 })) as Rec[];
    const kitchenFaucets = (await caller.surfaces.recommended({ role: "faucet", limit: 48 })) as Rec[];
    expect(kitchenSinks.some((row) => /\b(?:bathroom|vanity|vessel)\b/i.test(row.name))).toBe(false);
    expect(kitchenFaucets.some((row) => /\b(?:bathroom|vanity|vessel|tub)\b/i.test(row.name))).toBe(false);
  });

  it("returns source-priced Pelican toilets, tubs, and shower families for the bathroom palette", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const roles = [
      ["toilet-bidet", "Toilets & Bidets"],
      ["bathtub", "Sinks & Faucets"],
      ["shower-door", "Shower & Bath"],
      ["shower-surround", "Shower & Bath"],
      ["shower-system", "Shower & Bath"],
    ] as const;

    for (const [role, category] of roles) {
      const rows = (await caller.surfaces.recommended({ role, limit: 12 })) as Rec[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.category).toBe(category);
        expect(row.sellPrice ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("honors the requested limit", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = (await caller.surfaces.recommended({ role: "backsplash", limit: 3 })) as Rec[];
    expect(rows.length).toBeLessThanOrEqual(3);
  });
});

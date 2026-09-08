import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { verifiedPelicanSinkProfile } from "../../client/src/lib/pelicanFixtureProfiles";

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
    }
  });

  it("returns Quartz slabs for countertop", async () => {
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
  });

  it("splits sink vs faucet by subCategory and excludes accessories", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());

    const sinks = (await caller.surfaces.recommended({ role: "sink", limit: 8 })) as Rec[];
    for (const r of sinks) {
      expect(r.category).toBe("Sinks & Faucets");
      expect(r.subCategory).toBe("Sinks");
      // No mis-filed accessory parts (clips, grids, strainers, etc.)
      expect(ACCESSORY.test(r.name)).toBe(false);
    }

    const faucets = (await caller.surfaces.recommended({ role: "faucet", limit: 8 })) as Rec[];
    for (const r of faucets) {
      expect(r.category).toBe("Sinks & Faucets");
      expect(r.subCategory).toBe("Faucets");
      expect(ACCESSORY.test(r.name)).toBe(false);
    }
  });

  it("prioritizes source-verified sink profiles so a standard SB-36 has selectable fixtures", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const sinks = (await caller.surfaces.recommended({ role: "sink", limit: 24 })) as Rec[];
    expect(sinks.some((sink) => Boolean(verifiedPelicanSinkProfile(sink.pelicanCode)))).toBe(true);
  });

  it("honors the requested limit", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = (await caller.surfaces.recommended({ role: "backsplash", limit: 3 })) as Rec[];
    expect(rows.length).toBeLessThanOrEqual(3);
  });
});

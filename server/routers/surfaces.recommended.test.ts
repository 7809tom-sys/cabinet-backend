import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { verifiedPelicanFaucetProfile, verifiedPelicanPotFillerProfile, verifiedPelicanSinkProfile } from "../../client/src/lib/pelicanFixtureProfiles";
import { isSourceVerifiedPelicanBathtub, isSourceVerifiedPelicanToiletOrBidet } from "../lib/pelicanBathroomCatalog";
import { pelicanQuartzMaterialMap } from "../../client/src/lib/pelicanQuartzMaterialMaps";

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
  designerRenderReady?: boolean;
  hasSwatch?: boolean;
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
      expect(r.designerRenderReady).toBe(Boolean(r.materialImageUrl?.trim()));
      expect(r.hasSwatch).toBe(r.designerRenderReady);
    }
  });

  it("returns every priced flooring plank with a catalog photo, including planks that still need a 3D swatch", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = (await caller.surfaces.recommended({ role: "flooring", limit: 500 })) as Rec[];
    if (rows.length === 0) return;
    const capped = (await caller.surfaces.recommended({ role: "flooring", limit: 6 })) as Rec[];
    expect(rows.length).toBeLessThanOrEqual(500);
    expect(capped).toHaveLength(Math.min(6, rows.length));
    expect(rows.every((row) => row.subCategory === "Planks & Flooring")).toBe(true);
    expect(rows.every((row) => (row.imageUrl ?? "").length > 0 && (row.sellPrice ?? 0) > 0)).toBe(true);
    expect(rows.every((row) => row.hasSwatch === Boolean(row.materialImageUrl?.trim()) && row.designerRenderReady === row.hasSwatch)).toBe(true);
    expect(new Set(capped.map((row) => row.id))).toEqual(new Set(rows.slice(0, capped.length).map((row) => row.id)));
    if (rows.some((row) => row.hasSwatch === false)) {
      expect(rows.length).toBeGreaterThan(rows.filter((row) => row.hasSwatch).length);
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

  it("returns source-priced Quartz slabs for countertop with approved source-qualified 3D material maps", async () => {
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
    const currentOfficialRows = rows.filter((row) => pelicanQuartzMaterialMap(row.pelicanCode));
    expect(currentOfficialRows.length).toBeGreaterThan(0);
    expect(currentOfficialRows.every((row) => row.materialImageUrl === pelicanQuartzMaterialMap(row.pelicanCode)?.materialImageUrl)).toBe(true);
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

  it("returns PL-8461 through kitchen faucets despite its historical local Shower & Bath category", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const faucets = (await caller.surfaces.recommended({ role: "faucet", limit: 200 })) as Rec[];
    expect(faucets.map((product) => product.pelicanCode)).toContain("PL-8461 BN");
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

    const accessories = (await caller.surfaces.recommended({ role: "bathroom-accessory", limit: 80 })) as Rec[];
    expect(accessories.length).toBeGreaterThan(0);
    for (const row of accessories) {
      expect(["Shower & Bath", "Sinks & Faucets", "Toilets & Bidets"]).toContain(row.category);
      expect(row.sellPrice ?? 0).toBeGreaterThan(0);
      expect(
        (row.category === "Shower & Bath" && row.subCategory === "Shower Accessories")
        || (row.category === "Sinks & Faucets" && row.subCategory === "Sink & Faucet Accessories" && /\b(?:bathroom|bath|vanity|toilet|bidet)\b/i.test(row.name))
        || (row.category === "Toilets & Bidets" && /\baccessor(?:y|ies)\b/i.test(row.name)),
      ).toBe(true);
    }

    // Exact Pelican tub SKUs are imported under two historical source
    // categories, so their identity (not the legacy category label) decides
    // whether they belong in the bathroom fixture picker.
    const tubs = (await caller.surfaces.recommended({ role: "bathtub", limit: 80 })) as Rec[];
    expect(tubs.length).toBeGreaterThan(0);
    for (const row of tubs) {
      expect(["Sinks & Faucets", "Shower & Bath"]).toContain(row.category);
      expect(row.sellPrice ?? 0).toBeGreaterThan(0);
      expect(isSourceVerifiedPelicanBathtub(row.pelicanCode)).toBe(true);
    }
  });

  it("shows only source-verified toilet and tub models with usable product card images", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const toilets = (await caller.surfaces.recommended({ role: "toilet-bidet", limit: 80 })) as Rec[];
    const tubs = (await caller.surfaces.recommended({ role: "bathtub", limit: 80 })) as Rec[];
    const showerSurrounds = (await caller.surfaces.recommended({ role: "shower-surround", limit: 80 })) as Rec[];

    expect(toilets.length).toBeGreaterThan(0);
    expect(tubs.length).toBeGreaterThan(0);
    expect(toilets.every((row) => isSourceVerifiedPelicanToiletOrBidet(row.pelicanCode))).toBe(true);
    expect(tubs.every((row) => isSourceVerifiedPelicanBathtub(row.pelicanCode))).toBe(true);
    expect(showerSurrounds.some((row) => isSourceVerifiedPelicanBathtub(row.pelicanCode))).toBe(false);
    expect([...toilets, ...tubs].every((row) => Boolean(row.imageUrl?.trim()))).toBe(true);

    expect(toilets.some((row) => row.pelicanCode === "PL-12243")).toBe(false);
    expect(tubs.some((row) => /(?:NSO|BSO|drain|trim)/i.test(`${row.pelicanCode ?? ""} ${row.name}`))).toBe(false);

    const smartToilet = toilets.find((row) => row.pelicanCode === "PL-12005");
    const centerDrainTub = tubs.find((row) => row.pelicanCode === 'PL-02146 59"');
    expect(smartToilet?.imageUrl).toBe("/manus-storage/toilet-pl-12005_48351c94.png");
    expect(centerDrainTub?.imageUrl).toBe("/manus-storage/tub-pl-02146_56111d69.png");
  });

  it("honors the requested limit", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = (await caller.surfaces.recommended({ role: "backsplash", limit: 3 })) as Rec[];
    expect(rows.length).toBeLessThanOrEqual(3);
  });
});

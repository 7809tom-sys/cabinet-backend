import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { isPelicanDesignerReady } from "./lib/pelicanDesignerReadiness";

// A minimal unauthenticated context is enough for the public surfaces.byIds
// query, which reads from the shared Pelican catalog.
function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("surfaces.byIds", () => {
  it("returns an empty array for an empty id list", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const rows = await caller.surfaces.byIds({ ids: [] });
    expect(rows).toEqual([]);
  });

  it("returns products with a computed sellPrice for known ids", async () => {
    const caller = appRouter.createCaller(publicCtx());
    // ids 1..3 are seeded quartz slabs in the catalog (see live curl checks).
    const rows = await caller.surfaces.byIds({ ids: [1, 2, 3] });
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length === 0) return; // tolerate an empty DB in CI without a seed
    for (const r of rows) {
      expect(typeof r.id).toBe("number");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("category");
      // sellPrice is number|null; when a cost exists it must be a positive number.
      if (r.sellPrice != null) expect(r.sellPrice).toBeGreaterThan(0);
    }
  });
});

describe("surfaces.designerByIds", () => {
  it("keeps saved favorites behind the live exact Designer gate", async () => {
    const caller = appRouter.createCaller(publicCtx());
    expect(await caller.surfaces.designerByIds({ ids: [] })).toEqual([]);

    const candidates = await caller.surfaces.recommended({ role: "sink", limit: 1 });
    const candidate = candidates[0];
    if (!candidate) return; // tolerate a database without a loaded Pelican catalog
    const rows = await caller.surfaces.designerByIds({ ids: [candidate.id] });
    expect(rows).toHaveLength(1);
    for (const row of rows) {
      expect(row.id).toBe(candidate.id);
      expect(row.isActive).toBe(true);
      expect(row.showInDesigner).toBe(true);
      expect(row.sellPrice).toBeGreaterThan(0);
      expect(isPelicanDesignerReady(row)).toBe(true);
    }
  });
});

describe("Pelican full Designer palette", () => {
  it("returns the entire current verified fixture set within the 200-item palette limit", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const page = await caller.pelican.byCategory({
      category: "Sinks & Faucets",
      scope: "designer",
      limit: 200,
      offset: 0,
    });
    expect(page.items.length).toBe(Math.min(page.total, 200));
    for (const row of page.items) {
      expect(row.sellPrice).toBeGreaterThan(0);
      expect(isPelicanDesignerReady(row)).toBe(true);
    }
  });
});

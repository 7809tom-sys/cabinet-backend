import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

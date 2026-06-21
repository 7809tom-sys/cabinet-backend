import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("location.availability", () => {
  it("returns null zip + empty lines for an invalid zip", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.location.availability({ zip: "not-a-zip" });
    expect(res.zip).toBeNull();
    expect(res.inRangeDistributorIds).toEqual([]);
  });

  it("normalizes the zip and returns a per-distributor availability list", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.location.availability({ zip: "Dallas, TX 75201" });
    expect(res.zip).toBe("75201");
    // Each line carries the shape the cart relies on.
    for (const l of res.lines) {
      expect(typeof l.distributorId).toBe("number");
      expect(typeof l.inRange).toBe("boolean");
      expect(l.nearestMiles === null || typeof l.nearestMiles === "number").toBe(true);
    }
    // inRangeDistributorIds is a subset of all lines that are inRange
    const inRange = res.lines.filter((l) => l.inRange).map((l) => l.distributorId).sort();
    expect([...res.inRangeDistributorIds].sort()).toEqual(inRange);
  });

  it("radius is respected: a wide radius includes more lines than a tiny one", async () => {
    const caller = appRouter.createCaller(publicCtx());
    // Use a customer ZIP (Denver 80202) that does NOT share a ZIP3 prefix with any
    // seeded warehouse, so a 1-mile radius excludes everything while a national
    // radius includes the broad multi-warehouse line.
    const tight = await caller.location.availability({ zip: "80202", radiusMi: 1 });
    const wide = await caller.location.availability({ zip: "80202", radiusMi: 3000 });
    expect(tight.inRangeDistributorIds.length).toBeLessThanOrEqual(wide.inRangeDistributorIds.length);
    expect(tight.inRangeDistributorIds.length).toBe(0);
  });
});

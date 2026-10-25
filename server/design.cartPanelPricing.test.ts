import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

/**
 * Live-data regression for Cart refresh. REP2496 is both a still-sellable Clark
 * & Sons source master and an approved historical alias of REPV2496; Cart must
 * keep those two source identities distinct before it considers the fallback.
 */
describe("Cart refrigerator-panel pricing against live catalog data", () => {
  it("prices the active REP2496 source row at its exact Clark & Sons style and distributor", async () => {
    const caller = appRouter.createCaller({} as any);

    const rows = await caller.design.priceForCartItems({
      items: [{ masterCode: "REP2496", styleId: 330005, distributorId: 210001 }],
    });

    expect(rows).toEqual([expect.objectContaining({
      masterCode: "REP2496",
      styleId: 330005,
      distributorId: 210001,
      listPrice: "246.48",
      homeownerPrice: "147.98",
    })]);
  });

  it("prices REPV2496 from its own current Preston source", async () => {
    const caller = appRouter.createCaller({} as any);

    const rows = await caller.design.priceForCartItems({
      items: [{ masterCode: "REPV2496", styleId: 390019, distributorId: 180001 }],
    });

    expect(rows).toEqual([expect.objectContaining({
      masterCode: "REPV2496",
      styleId: 390019,
      distributorId: 180001,
      listPrice: "275.00",
      homeownerPrice: "152.08",
    })]);
  });

  it("uses the approved REP2496 alias only as a fallback to the Preston REPV2496 source", async () => {
    const caller = appRouter.createCaller({} as any);

    const rows = await caller.design.priceForCartItems({
      items: [{ masterCode: "REP2496", styleId: 390019, distributorId: 180001 }],
    });

    expect(rows).toEqual([expect.objectContaining({
      // Cart keeps the placed code for line identity even when the verified
      // cabinet_aliases route supplies the source-backed price.
      masterCode: "REP2496",
      styleId: 390019,
      distributorId: 180001,
      listPrice: "275.00",
      homeownerPrice: "152.08",
    })]);
  });

  it("does not cross distributors to manufacture a REP2496 price", async () => {
    const caller = appRouter.createCaller({} as any);

    await expect(caller.design.priceForCartItems({
      items: [{ masterCode: "REP2496", styleId: 330005, distributorId: 180001 }],
    })).resolves.toEqual([]);
  });

  it("hands the exact Cart code to Order matching with its live cabinet identity", async () => {
    const caller = appRouter.createCaller({} as any);

    const result = await caller.orders.matchCodes({
      items: [{ code: "REP2496", qty: 1 }],
    });

    expect(result).toMatchObject({ matchedCount: 1, unmatchedCount: 0 });
    expect(result.lines).toEqual([expect.objectContaining({
      matched: true,
      cabinetId: 9390059,
      masterCode: "REP2496",
    })]);
  });
});

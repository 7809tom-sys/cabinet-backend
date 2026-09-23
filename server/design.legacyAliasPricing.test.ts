import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

/**
 * Legacy saved plans retain their original geometry and database ids. Their
 * catalog price must follow an explicit approved master-code alias only; never
 * a guessed punctuation or dimension match.
 */
describe("Designer legacy alias price resolution", () => {
  it("prices the archived 3-DB24 saved-plan record through its approved 3DB24 Preston source row", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390032, styleId: 390019, masterCode: "3-DB24" }],
      distributorId: 180001,
    });

    expect(rows).toEqual([expect.objectContaining({
      // Preserve the legacy placed id so the client price map still matches the
      // saved geometry, while using the authorized active source price.
      cabinetId: 9390032,
      styleId: 390019,
      listPrice: "864.00",
      homeownerPrice: "477.79",
      contractorPrice: "390.10",
      wholesalePrice: "378.00",
    })]);
  });

  it("prices a verified legacy wall-filler alias through the current published F342 source row", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390177, styleId: 390019, masterCode: "WF342" }],
      distributorId: 180001,
    });

    expect(rows).toEqual([expect.objectContaining({
      cabinetId: 9390177,
      styleId: 390019,
      listPrice: "46.00",
      homeownerPrice: "25.44",
    })]);
  });

  it("prices the verified BF-3 base-filler alias through the same authorized F342 filler source", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390017, styleId: 390019, masterCode: "BF-3" }],
      distributorId: 180001,
    });

    expect(rows).toEqual([expect.objectContaining({
      cabinetId: 9390017,
      styleId: 390019,
      listPrice: "46.00",
      homeownerPrice: "25.44",
    })]);
  });

  it("prices the explicit WR3624 catalog alias through its verified current refrigerator-wall source", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390189, styleId: 390019, masterCode: "WR3624" }],
      distributorId: 180001,
    });

    expect(rows).toEqual([expect.objectContaining({
      cabinetId: 9390189,
      styleId: 390019,
      listPrice: "643.00",
      homeownerPrice: "355.58",
    })]);
  });

  it("keeps the approved master alias primary when a legacy cabinet-alias record disagrees", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390124, styleId: 390019, masterCode: "W-21-42" }],
      distributorId: 180001,
    });

    expect(rows).toEqual([expect.objectContaining({
      cabinetId: 9390124,
      styleId: 390019,
      listPrice: "502.00",
      homeownerPrice: "277.61",
    })]);
  });

  it("does not manufacture a price when no approved alias exists", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390032, styleId: 390019, masterCode: "NOT-A-VERIFIED-ALIAS" }],
      distributorId: 180001,
    });

    expect(rows).toEqual([]);
  });
});

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

  it("prices the verified REP2496 refrigerator-panel shorthand through the current REPV2496 source", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390208, styleId: 390019, masterCode: "REP2496" }],
      distributorId: 180001,
    });

    expect(rows).toEqual([expect.objectContaining({
      cabinetId: 9390208,
      styleId: 390019,
      listPrice: "275.00",
      homeownerPrice: "152.08",
    })]);
  });

  it("keeps Clark & Sons REP2496 available as the refrigerator end panel in its own source style", async () => {
    const caller = appRouter.createCaller({} as any);
    const surround = await caller.design.surroundForFridge({ styleId: 330005, fridgeWidth: 36 });

    expect(surround.endPanels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 9390059,
        masterCode: "REP2496",
        description: expect.stringMatching(/panel/i),
        width: "0.75",
        height: "96.00",
        depth: "24.00",
      }),
    ]));
    expect(surround.endPanels).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "PLYEB42" }),
    ]));
  });

  it("offers Madison S2496 as a refrigerator panel while preserving its shelf-board identity", async () => {
    const caller = appRouter.createCaller({} as any);
    const surround = await caller.design.surroundForFridge({ styleId: 330014, fridgeWidth: 36 });

    expect(surround.endPanels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 9360215,
        masterCode: "S2496",
        description: expect.stringMatching(/24 in\. W.*96 in\. H.*3\/4 in\. D/i),
        width: "24.00",
        height: "96.00",
        depth: "0.75",
      }),
    ]));
  });

  it("does not expose the Madison S2496 panel on a non-Madison style line", async () => {
    const caller = appRouter.createCaller({} as any);
    const surround = await caller.design.surroundForFridge({ styleId: 360001, fridgeWidth: 36 });

    expect(surround.endPanels).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "S2496" }),
    ]));
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

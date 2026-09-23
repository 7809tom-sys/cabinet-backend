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

  it("does not manufacture a price when no approved alias exists", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390032, styleId: 390019, masterCode: "NOT-A-VERIFIED-ALIAS" }],
      distributorId: 180001,
    });

    expect(rows).toEqual([]);
  });
});

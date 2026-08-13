import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("BEC-24 Ashford designer availability", () => {
  it("returns BEC-24 as a base end-angle cabinet for the selected Ashford style", async () => {
    const caller = appRouter.createCaller({} as any);
    const palette = await caller.design.placeableCabinets({
      placement: "base",
      distributorId: 210001,
      styleId: 330001,
      search: "BEC-24",
    });

    expect(palette).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 9450022,
          masterCode: "BEC-24",
          description: '24" Base End Angle Cabinet',
          isCornerCabinet: false,
          cornerType: "triangle",
          placement: "base",
        }),
      ]),
    );
  });
});

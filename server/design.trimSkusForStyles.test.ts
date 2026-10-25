import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("Designer trim SKU pricing", () => {
  it("returns the available, published Luxe Select LSP TKC source alias at its authorized tier price", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.trimSkusForStyles({
      styleIds: [540021],
      distributorId: 270001,
    });
    const toeKick = rows.find((row) => row.masterCode === "TKC" && row.styleId === 540021);

    expect(toeKick).toEqual(expect.objectContaining({
      cabinetId: 9360200,
      masterCode: "TKC",
      description: 'Toe Kick - 96"',
      listPrice: "200.00",
      homeownerPrice: "77.77",
      contractorPrice: "63.49",
      wholesalePrice: "61.53",
    }));
  });
});

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("Designer trim SKU pricing", () => {
  it("returns the available, published Preston Air Dawn toe kick at its authorized tier price", async () => {
    const caller = appRouter.createCaller({} as any);
    const rows = await caller.design.trimSkusForStyles({
      styleIds: [390020],
      distributorId: 180001,
    });
    const toeKick = rows.find((row) => row.masterCode === "TK-8(TKC)" && row.styleId === 390020);

    expect(toeKick).toEqual(expect.objectContaining({
      cabinetId: 9390073,
      masterCode: "TK-8(TKC)",
      description: 'Toe Kick 8\' Plywood - 96"',
      listPrice: "46.00",
      homeownerPrice: "25.44",
      contractorPrice: "20.77",
      wholesalePrice: "20.13",
    }));
  });
});

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("design WDC2442 replacement glass door", () => {
  it("links the cabinet to PGWDC42, keeps the door out of wall placement, and returns both verified prices", async () => {
    if (!(await getDb())) return;
    const caller = appRouter.createCaller(publicCtx());
    const common = { styleId: 330007, distributorId: 210001 };
    const [wall, accessories] = await Promise.all([
      caller.design.placeableCabinets({ placement: "wall", ...common }),
      caller.design.placeableCabinets({ placement: "accessory", ...common }),
    ]);

    const wdc = wall.find((item) => item.masterCode === "WDC2442");
    const pgwdc = accessories.find((item) => item.masterCode === "PGWDC42");
    expect(wdc).toMatchObject({
      id: 9390174,
      masterCode: "WDC2442",
      numberOfDoors: 1,
      numberOfAdjShelves: 3,
      glassDoorAddonCode: "PGWDC42",
    });
    expect(wall.some((item) => item.masterCode === "PGWDC42")).toBe(false);
    expect(pgwdc).toMatchObject({ id: 9390057, masterCode: "PGWDC42" });

    const prices = await caller.design.priceForCabinetsByStyles({
      pairs: [
        { cabinetId: 9390174, styleId: 330007 },
        { cabinetId: 9390057, styleId: 330007 },
      ],
      distributorId: 210001,
    });
    expect(prices.find((row) => row.cabinetId === 9390174)).toMatchObject({
      listPrice: "682.12",
      homeownerPrice: "427.70",
    });
    expect(prices.find((row) => row.cabinetId === 9390057)).toMatchObject({
      listPrice: "338.39",
      homeownerPrice: "212.17",
    });
  });
});

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

describe("design diagonal corner glass catalog", () => {
	  it("keeps the opaque corner and replacement PGWDC42 door distinct from the included-glass WDC42PG wall cabinet", async () => {
    if (!(await getDb())) return;
    const caller = appRouter.createCaller(publicCtx());
    const common = { styleId: 330007, distributorId: 210001 };
    const [wall, accessories] = await Promise.all([
      caller.design.placeableCabinets({ placement: "wall", ...common }),
      caller.design.placeableCabinets({ placement: "accessory", ...common }),
    ]);

	    const wdc = wall.find((item) => item.masterCode === "DCW2442");
	    const includedGlassCorner = wall.find((item) => item.masterCode === "WDC42PG");
	    const pgwdc = accessories.find((item) => item.masterCode === "PGWDC42");
	    expect(wdc).toMatchObject({
	      id: 9360151,
	      masterCode: "DCW2442",
	      numberOfDoors: 1,
	      numberOfAdjShelves: 3,
	    });
	    expect(includedGlassCorner).toMatchObject({
	      id: 9390175,
	      masterCode: "WDC42PG",
	      placement: "wall",
	      numberOfDoors: 1,
	      glassIncluded: true,
	    });
	    expect(wall.some((item) => item.masterCode === "PGWDC42")).toBe(false);
	    expect(accessories.some((item) => item.masterCode === "WDC42PG")).toBe(false);
	    expect(pgwdc).toMatchObject({ id: 9390057, masterCode: "PGWDC42" });

	    const prices = await caller.design.priceForCabinetsByStyles({
	      pairs: [
	        { cabinetId: 9360151, styleId: 330007 },
	        { cabinetId: 9390057, styleId: 330007 },
	        { cabinetId: 9390175, styleId: 330007 },
	      ],
	      distributorId: 210001,
	    });
	    expect(prices.find((row) => row.cabinetId === 9390175)).toMatchObject({
	      listPrice: "1020.52",
	      homeownerPrice: "612.72",
	    });
	  });
});

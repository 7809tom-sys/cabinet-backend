import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { cabinets } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("BEC-24 Ashford designer availability", () => {
  it("keeps the live Cabinet Config record as a 24-by-24 non-corner Base End Return", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    const [record] = await db!
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        category: cabinets.category,
        placementType: cabinets.placementType,
        productType: cabinets.productType,
        subCategory: cabinets.subCategory,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        toeKickHeight: cabinets.toeKickHeight,
        fillerRequired: cabinets.fillerRequired,
        graphicType: cabinets.graphicType,
        isCornerCabinet: cabinets.isCornerCabinet,
        cornerType: cabinets.cornerType,
        showInDesigner: cabinets.showInDesigner,
      })
      .from(cabinets)
      .where(eq(cabinets.masterCode, "BEC-24"));

    expect(record).toEqual({
      id: 9390014,
      masterCode: "BEC-24",
      category: "Base",
      placementType: "base",
      productType: "endCap",
      subCategory: "Base End Cabinet",
      width: "24.00",
      height: "34.50",
      depth: "24.00",
      toeKickHeight: "4.50",
      fillerRequired: false,
      graphicType: "end-angle",
      isCornerCabinet: false,
      cornerType: null,
      showInDesigner: true,
    });
  });

  it("returns BEC-24 as a base end-return cabinet for the selected Ashford style", async () => {
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
          id: 9390014,
          masterCode: "BEC-24",
          description: "24 in. Base End Cabinet — 45° angled end, 2 operational doors",
          isCornerCabinet: false,
          cornerType: null,
          placement: "base",
        }),
      ]),
    );
  });

  it("resolves the verified Ashford BEC-24 source price for the selected style", async () => {
    const caller = appRouter.createCaller({} as any);
    const prices = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390014, styleId: 330001 }],
      distributorId: 210001,
    });

    expect(prices).toEqual([
      expect.objectContaining({
        cabinetId: 9390014,
        styleId: 330001,
        listPrice: "583.66",
        adjustedListPrice: "739.30",
        homeownerPrice: "365.95",
        wholesalePrice: "277.24",
        contractorPrice: "286.11",
      }),
    ]);
  });
});

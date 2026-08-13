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
      .where(eq(cabinets.id, 9450022));

    expect(record).toEqual({
      masterCode: "BEC-24",
      category: "Base",
      placementType: "base",
      productType: "endCap",
      subCategory: "End Corner Return",
      width: "24.00",
      height: "34.50",
      depth: "24.00",
      toeKickHeight: "4.50",
      fillerRequired: false,
      graphicType: "base_end_return",
      isCornerCabinet: false,
      cornerType: "base-end-corner",
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
          id: 9450022,
          masterCode: "BEC-24",
          description: '24" Base End Angle Cabinet',
          isCornerCabinet: false,
          cornerType: "base-end-corner",
          placement: "base",
        }),
      ]),
    );
  });

  it("resolves the identical tier prices as BA-24 for the selected Ashford style", async () => {
    const caller = appRouter.createCaller({} as any);
    const prices = await caller.design.priceForCabinetsByStyles({
      pairs: [
        { cabinetId: 9390014, styleId: 330001 },
        { cabinetId: 9450022, styleId: 330001 },
      ],
      distributorId: 210001,
    });
    const ba = prices.find((row) => row.cabinetId === 9390014 && row.styleId === 330001);
    const bec = prices.find((row) => row.cabinetId === 9450022 && row.styleId === 330001);

    expect(ba).toBeDefined();
    expect(bec).toEqual({ ...ba, cabinetId: 9450022 });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeSavedPlanDemand } from "./analytics";

const analyticsSource = readFileSync(new URL("./analytics.ts", import.meta.url), "utf8");

describe("saved-plan vendor demand forecast", () => {

  it("keeps the query distributor-authorized and limited to saved-plan records", () => {
    expect(analyticsSource).toContain("savedPlanForecast: distributorProcedure");
    expect(analyticsSource).toContain("eq(kitchenDesigns.selectedDistributorId, distId)");
    expect(analyticsSource).toContain("gte(kitchenDesigns.updatedAt, since)");
    expect(analyticsSource).not.toContain("orders).where(and(\n            eq(kitchenDesigns.selectedDistributorId, distId)");
  });

  it("uses only persisted saved-plan selections to total vendor SKUs, styles, and recency", () => {
    const forecast = summarizeSavedPlanDemand(
      [
        {
          id: 1,
          selectedStyleId: 11,
          placedCabinets: [
            { cabinetId: 101, quantity: 2 },
            { cabinetId: 202, styleId: 12 },
          ],
          updatedAt: new Date("2026-09-01T12:00:00.000Z"),
        },
        {
          id: 2,
          selectedStyleId: 11,
          placedCabinets: [{ cabinetId: 101 }],
          updatedAt: new Date("2026-09-03T12:00:00.000Z"),
        },
      ],
      [
        { cabinetId: 101, styleId: 11, distributorSku: "B24-SW", platformSku: "B24-SW-VENDOR" },
        { cabinetId: 202, styleId: 12, distributorSku: "W30-GR", platformSku: "W30-GR-VENDOR" },
      ],
      [
        { id: 11, ourName: "Snow White", aliasName: "Arctic White", distributorName: "Snow White" },
        { id: 12, ourName: "Graphite", aliasName: null, distributorName: "Graphite" },
      ],
    );

    expect(forecast.savedPlanCount).toBe(2);
    expect(forecast.projectedCabinetQty).toBe(4);
    expect(forecast.topSkus).toEqual([
      expect.objectContaining({ sku: "B24-SW", style: "Arctic White", units: 3, planCount: 2 }),
      expect.objectContaining({ sku: "W30-GR", style: "Graphite", units: 1, planCount: 1 }),
    ]);
    expect(forecast.topStyles).toEqual([
      expect.objectContaining({ style: "Arctic White", units: 3, planCount: 2 }),
      expect.objectContaining({ style: "Graphite", units: 1, planCount: 1 }),
    ]);
    expect(forecast.activity).toEqual([
      { day: "2026-09-01", planCount: 1 },
      { day: "2026-09-03", planCount: 1 },
    ]);
  });

  it("reports unresolved plan selections instead of inventing an SKU", () => {
    const forecast = summarizeSavedPlanDemand(
      [{ id: 1, selectedStyleId: 11, placedCabinets: [{ cabinetId: 999, quantity: 2 }], updatedAt: new Date("2026-09-01T12:00:00.000Z") }],
      [],
      [{ id: 11, ourName: "Snow White", aliasName: null, distributorName: "Snow White" }],
    );

    expect(forecast.projectedCabinetQty).toBe(0);
    expect(forecast.unresolvedCabinetQty).toBe(2);
    expect(forecast.topSkus).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./distributorPortal.ts", import.meta.url), "utf8");

describe("vendor inventory forecast router", () => {
  it("uses only the authorized vendor line and six-month-capped saved-design activity", () => {
    expect(source).toContain("inventoryForecast: distributorProcedure");
    expect(source).toContain("eq(kitchenDesigns.selectedDistributorId, lineId)");
    expect(source).toContain("const sixMonthsAgo = monthOffset(6)");
    expect(source).toContain("const activeSince = requestedSince > sixMonthsAgo ? requestedSince : sixMonthsAgo");
  });

  it("excludes confirmed or paid design sales and keeps seven-month unsold designs outside demand", () => {
    expect(source).toContain('or(eq(orderRequests.status, "confirmed"), isNotNull(orderRequests.paidAt))');
    expect(source).toContain("lte(kitchenDesigns.updatedAt, deadBefore)");
    expect(source).toContain("deadCandidates.filter((design) => !closedDesignIds.has(design.id))");
  });

  it("rolls demand to master nomenclature and returns the vendor ordering SKU", () => {
    expect(source).toContain("masterCode: cabinets.masterCode");
    expect(source).toContain('vendorSku: Array.from(demandRow.vendorSkus).sort().join(" / ")');
    expect(source).toContain("inventoryForecastRow");
  });

  it("leaves the close rate TBD unless an administrator has explicitly supplied it", () => {
    expect(source).toContain("rateConfigured: isForecastRateBps(rates.baseRateBps)");
    expect(source).toContain("updateInventoryForecastRates: distributorProcedure");
    expect(source).toContain('Only an administrator can set the inventory close-rate forecast.');
  });

  it("accepts optional on-hand feed only for a SKU owned by the vendor line", () => {
    expect(source).toContain("updateOnHandInventory: distributorProcedure");
    expect(source).toContain("onHandQty: z.number().int().min(0).nullable()");
    expect(source).toContain("eq(distributorSkus.distributorId, lineId)");
  });
});

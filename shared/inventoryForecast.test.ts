import { describe, expect, it } from "vitest";
import { inventoryForecastRow, normalizeForecastRates } from "./inventoryForecast";

describe("inventory forecast calculations", () => {
  const source = { masterCode: "B15", vendorSku: "V-B15", openDesignQty: 10, openDesignCount: 4, affiliateCount: 2 };

  it("does not invent a close rate when the administrator has left it TBD", () => {
    expect(inventoryForecastRow({ ...source, onHandQty: 12 }, { baseRateBps: null, lowRateBps: null, highRateBps: null })).toMatchObject({
      projectedSellThrough: null,
      suggestedStock: null,
      stockStatus: "rate_tbd",
    });
  });

  it("calculates low, base, high, and suggested inventory from explicit rates", () => {
    expect(inventoryForecastRow({ ...source, onHandQty: 4 }, { baseRateBps: 6000, lowRateBps: 4000, highRateBps: 8000 })).toMatchObject({
      projectedSellThrough: 6,
      lowProjectedSellThrough: 4,
      highProjectedSellThrough: 8,
      suggestedStock: 6,
      stockStatus: "short",
    });
  });

  it("reports demand-only when an on-hand feed has not been provided", () => {
    expect(inventoryForecastRow({ ...source, onHandQty: null }, { baseRateBps: 6000, lowRateBps: null, highRateBps: null }).stockStatus).toBe("demand_only");
  });

  it("normalizes invalid or inconsistent rate bands without using a made-up value", () => {
    expect(normalizeForecastRates({ baseRateBps: 6000, lowRateBps: 7000, highRateBps: 5000 })).toEqual({
      baseRateBps: 6000,
      lowRateBps: 6000,
      highRateBps: 6000,
    });
  });
});

import { describe, expect, it } from "vitest";
import { resolveAffiliateCatalogSale } from "./affiliateCatalogSalePrice";

describe("affiliate catalog sale precedence", () => {
  it("uses a positive per-item fixed price ahead of the category percent and the product price", () => {
    expect(resolveAffiliateCatalogSale({
      fixedPrice: "49.00",
      categoryMarkupBps: 10000,
      cost: 10,
      automaticPrice: 13.8,
    })).toBe(49);
  });

  it("ignores a zero or negative fixed price and uses the category percent on cost", () => {
    expect(resolveAffiliateCatalogSale({
      fixedPrice: 0,
      categoryMarkupBps: 5000,
      cost: "10.00",
      automaticPrice: 13.8,
    })).toBe(15);
    expect(resolveAffiliateCatalogSale({
      fixedPrice: -5,
      categoryMarkupBps: 0,
      cost: 10,
      automaticPrice: 13.8,
    })).toBe(10);
  });

  it("falls back to the automatic product price when the category percent is unset or has no positive cost", () => {
    expect(resolveAffiliateCatalogSale({
      fixedPrice: null,
      categoryMarkupBps: null,
      cost: 10,
      automaticPrice: 13.8,
    })).toBe(13.8);
    expect(resolveAffiliateCatalogSale({
      categoryMarkupBps: 5000,
      cost: null,
      automaticPrice: 12.5,
    })).toBe(12.5);
    expect(resolveAffiliateCatalogSale({
      categoryMarkupBps: 5000,
      cost: 0,
      automaticPrice: 12.5,
    })).toBe(12.5);
  });

  it("returns null when every candidate is missing, zero, or negative", () => {
    expect(resolveAffiliateCatalogSale({
      fixedPrice: 0,
      categoryMarkupBps: null,
      cost: null,
      automaticPrice: 0,
    })).toBeNull();
    expect(resolveAffiliateCatalogSale({
      fixedPrice: -1,
      categoryMarkupBps: -100,
      cost: 10,
      automaticPrice: -4,
    })).toBeNull();
  });
});

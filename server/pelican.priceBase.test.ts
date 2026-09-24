import { describe, expect, it } from "vitest";
import { computeSellPrice, positivePelicanPriceBase } from "./routers/pelican";
import { sellPriceOf } from "./routers/surfaces";

describe("Pelican surface price base", () => {
  const category = "Flooring";
  const markups = { Flooring: 6500 };

  it("uses a positive authorized list price when a legacy cost placeholder is zero", () => {
    const product = { category, yourCost: "0.00", listPrice: "12.50" };
    expect(positivePelicanPriceBase(product)).toBe(12.5);
    expect(computeSellPrice(product, markups)).toBe(20.63);
    expect(sellPriceOf(product, markups)).toBe(20.63);
  });

  it("uses a positive authorized list price when imported cost is null", () => {
    const product = { category, yourCost: null, listPrice: "12.50" };
    expect(positivePelicanPriceBase(product)).toBe(12.5);
    expect(computeSellPrice(product, markups)).toBe(20.63);
    expect(sellPriceOf(product, markups)).toBe(20.63);
  });

  it("uses a positive landed cost ahead of the list price", () => {
    const product = { category, yourCost: "8.00", listPrice: "12.50" };
    expect(positivePelicanPriceBase(product)).toBe(8);
    expect(computeSellPrice(product, markups)).toBe(13.2);
  });

  it("does not produce a sell price without a positive authorized base", () => {
    const product = { category, yourCost: "0.00", listPrice: "0.00" };
    expect(positivePelicanPriceBase(product)).toBeNull();
    expect(computeSellPrice(product, markups)).toBeNull();
  });
});

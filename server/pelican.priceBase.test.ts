import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { computeSellPrice, positivePelicanPriceBase } from "./routers/pelican";
import { sellPriceOf } from "./routers/surfaces";
import { authorizedSurfacePriceBasis } from "../shared/surfacePricing";

const routerSource = readFileSync(new URL("./routers/pelican.ts", import.meta.url), "utf8");

describe("Pelican surface price base", () => {
  const category = "Flooring";
  const markups = { Flooring: 6500 };

  it("uses a positive authorized list price when a legacy cost placeholder is zero", () => {
    const product = { category, yourCost: "0.00", listPrice: "12.50" };
    expect(authorizedSurfacePriceBasis(product)).toEqual({ amount: 12.5, kind: "supplier_list" });
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
    expect(authorizedSurfacePriceBasis(product)).toEqual({ amount: 8, kind: "landed_cost" });
    expect(positivePelicanPriceBase(product)).toBe(8);
    expect(computeSellPrice(product, markups)).toBe(13.2);
  });

  it("does not produce a sell price without a positive authorized base", () => {
    const product = { category, yourCost: "0.00", listPrice: "0.00" };
    expect(positivePelicanPriceBase(product)).toBeNull();
    expect(computeSellPrice(product, markups)).toBeNull();
  });

  it("does not allow zero imported cost placeholders to suppress a positive list price in markup statistics", () => {
    expect(routerSource).toContain("case when ${pelicanProducts.yourCost} > 0 then ${pelicanProducts.yourCost} when ${pelicanProducts.listPrice} > 0 then ${pelicanProducts.listPrice} else null end");
  });
});

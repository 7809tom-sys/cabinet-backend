import { describe, expect, it } from "vitest";
import { affiliateHardwareUnitPrice, affiliatePelicanUnitPrice, pelicanRecordIsOrderable } from "./affiliateNonCabinetPrice";

const sink = {
  category: "Sinks & Faucets",
  listPrice: "20.00",
  yourCost: "10.00",
  retailPrice: null,
  affiliateSalePrice: null,
};

describe("affiliate Pelican and hardware unit prices", () => {
  it("prices a Pelican product from its record when no override is set", () => {
    expect(pelicanRecordIsOrderable({ isActive: true, showInCatalog: true, showInDesigner: false })).toBe(true);
    expect(pelicanRecordIsOrderable({ isActive: false, showInCatalog: true, showInDesigner: true })).toBe(false);
    expect(pelicanRecordIsOrderable({ isActive: true, showInCatalog: false, showInDesigner: false })).toBe(false);
    expect(affiliatePelicanUnitPrice(sink, {}, null)).toBe(13.8);
  });

  it("lets a category affiliate percent replace the Pelican product price, and a fixed price replace both", () => {
    expect(affiliatePelicanUnitPrice(sink, { "Sinks & Faucets": 3800 }, 5000)).toBe(15);
    expect(affiliatePelicanUnitPrice({ ...sink, affiliateSalePrice: "49.00" }, { "Sinks & Faucets": 3800 }, 5000)).toBe(49);
  });

  it("keeps the existing hardware list markup until a category percent or fixed price is set", () => {
    const pull = { listPrice: "10.00", yourCost: "4.00", affiliateSalePrice: null };
    expect(affiliateHardwareUnitPrice(pull, 2500, null)).toBe(12.5);
    expect(affiliateHardwareUnitPrice(pull, 2500, 10000)).toBe(8);
    expect(affiliateHardwareUnitPrice({ ...pull, affiliateSalePrice: "19.95" }, 2500, 10000)).toBe(19.95);
  });

  it("returns null when a hardware line has no positive price from any step", () => {
    expect(affiliateHardwareUnitPrice({ listPrice: null, yourCost: null, affiliateSalePrice: null }, 2500, null)).toBeNull();
    expect(affiliateHardwareUnitPrice({ listPrice: "0", yourCost: "0", affiliateSalePrice: "0" }, 2500, 5000)).toBeNull();
  });
});

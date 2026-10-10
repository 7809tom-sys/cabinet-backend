import { describe, expect, it } from "vitest";
import { freightItemsHash } from "./_core/freightQuoteToken";
import { freightQuoteItemsForOrder } from "./lib/freightQuoteOrderIdentity";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Pelican shipping profiles", () => {
  it("binds a quote to the exact Pelican catalog row, not merely a surface code", () => {
    const first = freightItemsHash([{
      cabinetId: null,
      masterCode: "PL-02146",
      styleId: null,
      distributorId: null,
      pelicanProductId: 101,
      qty: 1,
    }]);
    const second = freightItemsHash([{
      cabinetId: null,
      masterCode: "PL-02146",
      styleId: null,
      distributorId: null,
      pelicanProductId: 102,
      qty: 1,
    }]);
    expect(first).not.toBe(second);
  });

  it("preserves the Pelican SKU ID when an order verifies its signed quote", () => {
    expect(freightQuoteItemsForOrder([{
      cabinetId: null,
      masterCode: "PL-8515",
      productKind: "surface",
      pelicanProductId: 4321,
      qty: 2,
    }])).toEqual([{
      cabinetId: null,
      masterCode: "PL-8515",
      styleId: null,
      distributorId: null,
      pelicanProductId: 4321,
      qty: 2,
    }]);
  });

  it("requires source-backed Pelican origin and package facts before a carrier rate", () => {
    const freightSource = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");
    const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/pelicanSchema.ts"), "utf8");
    expect(schemaSource).toContain("pelicanShippingProfiles");
    expect(schemaSource).toContain("sourceUrl");
    expect(schemaSource).toContain("sourceReference");
    expect(freightSource).toContain("unratedSurfaceItems");
    expect(freightSource).toContain("needsPelicanPackageData");
    expect(freightSource).toContain("No shipping charge is invented");
  });
});

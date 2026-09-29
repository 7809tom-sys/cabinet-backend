import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");

describe("supplier SKU package data in freight resolution", () => {
  it("loads package dimensions and weight for the exact distributor, style, and cabinet", () => {
    expect(source).toContain("supplierPackagesByLineStyleCabinet");
    expect(source).toContain("packageWeight: distributorSkus.pkgWeight");
    expect(source).toContain("l: distributorSkus.pkgLength");
    expect(source).toContain("w: distributorSkus.pkgWidth");
    expect(source).toContain("h: distributorSkus.pkgHeight");
    expect(source).toContain("`${record.distributorId}:${record.styleId}:${record.cabinetId}`");
    expect(source).toContain("`${it.distributorId}:${it.styleId}:${pkg.id}`");
  });

  it("gives exact supplier package data priority over line-wide and master fallbacks", () => {
    expect(source).toContain("supplierPackage?.packageWeight ?? override?.packageWeight ?? pkg?.packageWeight");
    expect(source).toContain("supplierPackage?.l ?? override?.l ?? pkg?.l");
    expect(source).toContain("supplierPackage?.w ?? override?.w ?? pkg?.w");
    expect(source).toContain("supplierPackage?.h ?? override?.h ?? pkg?.h");
    expect(source).toContain("label: supplierPackage?.code ?? pkg?.code");
  });
});

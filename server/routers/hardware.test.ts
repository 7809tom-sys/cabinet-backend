import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./hardware.ts", import.meta.url), "utf8");
const importer = readFileSync(new URL("../../scripts/import-hardware-resources-catalog.ts", import.meta.url), "utf8");

describe("public hardware catalog contract", () => {
  it("requires the dedicated line and every approved public-state predicate", () => {
    expect(source).toContain('const HARDWARE_LINE_CODE = "HRDW"');
    expect(source).toContain("eq(distributors.code, HARDWARE_LINE_CODE)");
    expect(source).toContain('eq(vendorProducts.status, "approved")');
    expect(source).toContain("eq(vendorProducts.isPublished, true)");
    expect(source).toContain("eq(vendorProducts.isAvailable, true)");
  });

  it("returns list price and supplier image without exposing dealer cost or package data", () => {
    const listSelect = source.slice(source.indexOf("db.select({\n        id: vendorProducts.id"), source.indexOf(".from(vendorProducts)", source.indexOf("db.select({\n        id: vendorProducts.id")));
    expect(listSelect).toContain("listPrice: vendorProducts.listPrice");
    expect(listSelect).toContain("imageUrl: vendorProducts.imageUrl");
    expect(listSelect).not.toContain("yourCost:");
    expect(listSelect).not.toContain("pkgWeight:");
    expect(listSelect).not.toContain("pkgLength:");
  });

  it("documents browse-only status until the consolidated shipment profile is configured", () => {
    expect(source).toContain("browse-only until its exact consolidated");
    expect(source).not.toContain("checkout");
  });

  it("removes supplier-only asterisk markers before public names are saved", () => {
    expect(importer).toContain("function publicCopy");
    expect(importer).toContain("[A-Z]{2,16}");
    expect(importer).toContain("row.name = publicCopy");
    expect(importer).toContain("row.description = publicCopy");
  });
});

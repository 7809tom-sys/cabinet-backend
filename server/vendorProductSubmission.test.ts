import { describe, expect, it } from "vitest";
import { buildUnmatchedPlatformSku, hasVendorPrice, matchVendorCabinetBySku } from "./vendorProductSubmission";

describe("vendor product submission rules", () => {
  const rows = [
    { id: 10, masterCode: "B-18", sku: "B18", vendorSku: "BASE18", altSku1: null, altSku2: null, altSku3: null },
    { id: 11, masterCode: "W-18", sku: "W18", vendorSku: null, altSku1: null, altSku2: null, altSku3: null },
  ];

  it("matches a vendor SKU to a master code or alias without requiring a numeric Cabinet ID", () => {
    expect(matchVendorCabinetBySku("b 18", rows)).toEqual({
      kind: "matched",
      cabinetId: 10,
      masterCode: "B-18",
    });
    expect(matchVendorCabinetBySku("BASE18", rows)).toEqual({
      kind: "matched",
      cabinetId: 10,
      masterCode: "B-18",
    });
  });

  it("rejects unknown and ambiguous aliases instead of guessing a cabinet", () => {
    expect(matchVendorCabinetBySku("UNKNOWN", rows)).toEqual({ kind: "not_found" });
    expect(
      matchVendorCabinetBySku("B18", [
        ...rows,
        { id: 12, masterCode: "B-18-ALT", sku: "B18", vendorSku: null, altSku1: null, altSku2: null, altSku3: null },
      ])
    ).toEqual({ kind: "ambiguous" });
  });

  it("accepts either List Price or Your Cost, but not an empty pair", () => {
    expect(hasVendorPrice("12.50", null)).toBe(true);
    expect(hasVendorPrice(null, "8.25")).toBe(true);
    expect(hasVendorPrice("  ", "")).toBe(false);
  });

  it("creates a stable, bounded identity for an unmatched supplier SKU", () => {
    const first = buildUnmatchedPlatformSku(7, 23, "new / supplier sku 01");
    expect(first).toBe(buildUnmatchedPlatformSku(7, 23, "new / supplier sku 01"));
    expect(first).toMatch(/^UNMAPPED-7-23-/);
    expect(first.length).toBeLessThanOrEqual(128);
    expect(buildUnmatchedPlatformSku(7, 23, "new / supplier sku 02")).not.toBe(first);
  });
});

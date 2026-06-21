import { describe, it, expect } from "vitest";
import { buildCatalogCsv, csvEscape, CATALOG_EXPORT_HEADERS } from "./catalogExport";

describe("catalogExport.csvEscape", () => {
  it("passes simple values through", () => {
    expect(csvEscape("B-24")).toBe("B-24");
    expect(csvEscape(12)).toBe("12");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
  it("quotes values containing comma, quote, or newline", () => {
    expect(csvEscape("Base, 24 inch")).toBe('"Base, 24 inch"');
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("catalogExport.buildCatalogCsv", () => {
  it("emits a header row and one row per cabinet", () => {
    const csv = buildCatalogCsv([
      {
        masterCode: "B-24",
        description: "24\" Base Cabinet",
        category: "Base",
        subCategory: "Single Door Base",
        width: "24.00",
        height: "34.50",
        depth: "24.00",
        numberOfDoors: 1,
        numberOfDrawers: 1,
        graphicType: "base_1door",
        linesWithSku: 3,
      },
      {
        masterCode: "DWR-3",
        description: "3\" Dishwasher End Panel",
        category: "Accessory",
        subCategory: "Decorative End Panel",
        width: "3.00",
        height: "34.50",
        depth: "24.00",
        numberOfDoors: 0,
        numberOfDrawers: 0,
        graphicType: "accessory_panel",
        linesWithSku: 1,
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CATALOG_EXPORT_HEADERS.join(","));
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain("B-24");
    expect(lines[1]).toContain("base_1door");
    expect(lines[2]).toContain("DWR-3");
    expect(lines[2]).toContain("Decorative End Panel");
  });

  it("escapes descriptions containing commas/quotes", () => {
    const csv = buildCatalogCsv([
      {
        masterCode: "X-1",
        description: 'Cabinet, 30", glass',
        category: "Wall",
        subCategory: null,
        width: null,
        height: null,
        depth: null,
        numberOfDoors: null,
        numberOfDrawers: null,
        graphicType: null,
      },
    ]);
    const row = csv.trim().split("\n")[1];
    expect(row).toContain('"Cabinet, 30"", glass"');
    // null numeric fields default to 0
    expect(row.endsWith(",0")).toBe(true);
  });

  it("handles empty input (header only)", () => {
    const csv = buildCatalogCsv([]);
    expect(csv.trim()).toBe(CATALOG_EXPORT_HEADERS.join(","));
  });
});

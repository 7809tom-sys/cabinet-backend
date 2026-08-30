import { describe, expect, it } from "vitest";
import { buildMaterialsListRows, materialsListCsv, materialsListPricedTotal, materialsListPrintHtml, materialsListSectionFor } from "./designMaterialsList";

describe("complete Designer materials list", () => {
  const rows = buildMaterialsListRows({
    buildRows: [
      { code: "W-18", description: "18-inch Wall Cabinet", widthIn: 18, heightIn: 42, depthIn: 12, placement: "wall", color: "Aura Cream", qty: 1, unitPrice: 210 },
      { code: "B-24", description: "24-inch Base Cabinet", widthIn: 24, heightIn: 34.5, depthIn: 24, placement: "base", color: "Aura Cream", qty: 2, unitPrice: 300 },
      { code: "DW-24", description: "Dishwasher", widthIn: 24, heightIn: 34.5, depthIn: 24, placement: "appliance", qty: 1, unitPrice: null },
      { code: "BF-3", description: "Base filler cut to 2.5 inches", widthIn: 2.5, heightIn: 34.5, depthIn: 24, placement: "base", color: "Aura Cream", qty: 1, unitPrice: 35 },
      { code: "REP-2496", description: "Refrigerator end panel", widthIn: 0.75, heightIn: 96, depthIn: 24, placement: "tall", color: "Aura Cream", qty: 2, unitPrice: 50 },
    ],
    pricingLines: [
      { masterCode: "B-24", name: "24-inch Base Cabinet", styleId: 7, styleLabel: "Aura Cream", distributorId: 4, tier: "homeowner", unitPrice: 300, qty: 2 },
      { masterCode: "W-18", name: "18-inch Wall Cabinet", styleId: 7, styleLabel: "Aura Cream", distributorId: 4, tier: "homeowner", unitPrice: 210, qty: 1 },
      { masterCode: "PEL-90", name: "White Subway Backsplash", styleId: -90, styleLabel: "3 x 6", distributorId: null, tier: "homeowner", unitPrice: 48, qty: 3, category: "Backsplash", qtyNote: "30 sq ft including overage" },
      { masterCode: "FRIDGE-36", name: "French Door Refrigerator", styleId: -91, styleLabel: "Stainless steel", distributorId: null, tier: "homeowner", unitPrice: 500, qty: 1, category: "Appliances" },
    ],
    selectedSurfaces: [
      { id: 91, slug: "oak-floor", name: "Oak Flooring", category: "Flooring", subCategory: "Natural", size: "20 sq ft carton", imageUrl: null, sellPrice: null },
    ],
    supplements: [
      { code: "HW-PULL", description: "Bar pulls", category: "Hardware", qty: 8, styleColor: "Brushed brass", unitPrice: null },
      { code: "CM-96", description: "Crown molding", category: "Trim & molding", qty: 2, styleColor: "Aura Cream", unitPrice: null },
      { code: "TK-96", description: "Toe kick", category: "Trim & molding", qty: 2, styleColor: "Aura Cream", unitPrice: null },
    ],
    distributorNames: new Map([[4, "Ashford"]]),
    defaultDistributorId: 4,
    defaultStyleName: "Aura Cream",
  });

	  it("numbers cabinets, panels, fillers, and trim by code and alphabetizes every non-cabinet item below them", () => {
	    expect(rows.filter((row) => row.section === "cabinet").map((row) => [row.label, row.code, row.category])).toEqual([
	      ["1", "B-24", "Cabinet"],
	      ["2", "BF-3", "Filler"],
	      ["3", "CM-96", "Cabinet trim"],
	      ["4", "REP-2496", "Panel"],
	      ["5", "TK-96", "Cabinet trim"],
	      ["6", "W-18", "Cabinet"],
	    ]);
	    expect(rows.filter((row) => row.section === "other").map((row) => [row.label, row.description])).toEqual([
	      ["A", "Bar pulls"],
	      ["B", "Dishwasher"],
	      ["C", "French Door Refrigerator"],
	      ["D", "Oak Flooring"],
	      ["E", "White Subway Backsplash"],
	    ]);
	  });

	  it("keeps refrigerator appliances separate while classifying their panels and every cabinet trim family as cabinet parts", () => {
	    expect(materialsListSectionFor({ code: "FRIDGE-36", description: "French Door Refrigerator", category: "Appliances" })).toBe("other");
	    expect(materialsListSectionFor({ code: "REP-2496", description: "Refrigerator end panel", category: "Panel" })).toBe("cabinet");
	    expect(materialsListSectionFor({ code: "RS-24", description: "Roll-out shelf", category: "Accessory" })).toBe("cabinet");
	    expect(materialsListSectionFor({ code: "GD-W24", description: "Glass door upgrade", category: "Accessory" })).toBe("cabinet");
	    expect(materialsListSectionFor({ code: "HW-PULL", description: "Cabinet bar pull", category: "Handles & hardware" })).toBe("other");
	    for (const description of ["Base filler", "Crown molding", "Light rail molding", "Toe kick", "Scribe molding", "Arched valance", "Finished end panel"]) {
	      expect(materialsListSectionFor({ code: description.toUpperCase().replaceAll(" ", "-"), description, category: "Trim & molding" })).toBe("cabinet");
	    }
	  });

  it("preserves supplier, style, dimensions, quantities, and exact authoritative prices", () => {
    const base = rows.find((row) => row.code === "B-24")!;
    expect(base).toMatchObject({ supplier: "Ashford", styleColor: "Aura Cream", dimensions: '24\" W × 34.5\" H × 24\" D', qty: 2, unitPrice: 300, lineTotal: 600 });
    expect(rows.find((row) => row.code === "PEL-90")).toMatchObject({ supplier: "Backsplash", qty: 3, unitPrice: 48, lineTotal: 144, notes: "30 sq ft including overage" });
    expect(rows.find((row) => row.code === "PEL-91")).toMatchObject({ unitPrice: null, lineTotal: null, notes: "Price pending / quote required" });
	    expect(materialsListPricedTotal(rows)).toBe(1589);
  });

  it("exports spreadsheet-friendly columns without inventing pending prices", () => {
    const csv = materialsListCsv(rows);
    expect(csv).toContain("No.,Section,Item Code,Description,Category,Distributor,Color / Style,Dimensions,Qty,Unit Price,Line Total,Notes");
	    expect(csv).toContain('1,Cabinets & cabinet parts,B-24,24-inch Base Cabinet,Cabinet,Ashford,Aura Cream,"24"" W × 34.5"" H × 24"" D",2,300.00,600.00,');
	    expect(csv).toContain('2,Cabinets & cabinet parts,BF-3,Base filler cut to 2.5 inches,Filler');
	    expect(csv).toContain('4,Cabinets & cabinet parts,REP-2496,Refrigerator end panel,Panel');
	    expect(csv).toContain('C,Other materials,FRIDGE-36,French Door Refrigerator,Appliances');
    expect(csv).toContain("D,Other materials,PEL-91,Oak Flooring,Flooring,Flooring,Natural,20 sq ft carton,1,,,Price pending / quote required");
  });

  it("builds a printable landscape table with both sections, exact totals, and escaped text", () => {
    const html = materialsListPrintHtml({ rows, title: "Tom's <Kitchen>", roomLabel: '144\" × 120\"', styleName: "Aura Cream", generatedAt: "August 29, 2026" });
	    expect(html).toContain("Numbered Cabinets &amp; Cabinet Parts");
    expect(html).toContain("Other Materials &amp; Parts — Alphabetical");
	    expect(html).toContain("Priced total: $1589.00");
	    expect(html).toContain("Pending price lines: 5");
    expect(html).toContain("Tom&#039;s &lt;Kitchen&gt;");
    expect(html).toContain("@page{size:letter landscape");
  });
});

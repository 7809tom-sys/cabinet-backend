import { describe, expect, it } from "vitest";
import { catalogFillerForGap, fittedCatalogFillerDescription } from "./catalogFiller";
import { CUSTOM_SIZE_FEE, customSizeFee } from "./design";

const fillers = [
  { id: 1, masterCode: "BF-3", description: '3" x 34.5" Base Filler', category: "Filler", subCategory: "Filler", width: 3, depth: 24, height: 34.5, catalogImageUrl: null },
  { id: 2, masterCode: "BF-6", description: '6" x 34.5" Base Filler', category: "Filler", subCategory: "Filler", width: 6, depth: 24, height: 34.5, catalogImageUrl: null },
  { id: 3, masterCode: "WF342", description: '3" x 30" Wall Filler', category: "Filler", subCategory: "Filler", width: 3, depth: 12, height: 30, catalogImageUrl: null },
] as const;

describe("catalogFillerForGap", () => {
  it("uses the narrowest real catalog filler that can be cut to the measured gap", () => {
    expect(catalogFillerForGap(fillers, 2.25, "base")?.masterCode).toBe("BF-3");
    expect(catalogFillerForGap(fillers, 4.5, "base")?.masterCode).toBe("BF-6");
  });

  it("prefers the matching wall-depth filler and preserves the catalog description with the exact cut size", () => {
    const wallFiller = catalogFillerForGap(fillers, 2.5, "wall");
    expect(wallFiller?.masterCode).toBe("WF342");
    expect(fittedCatalogFillerDescription(wallFiller!, 2.5)).toBe('3" x 30" Wall Filler — cut to 2.5"');
  });

  it("keeps a trimmed catalog filler at its approved SKU price rather than applying a generic cabinet resize fee", () => {
    expect(customSizeFee({ width: 2.5, nominalWidth: 3, depth: 24, nominalDepth: 24, masterCode: "BF-3", subCategory: "Filler" })).toBe(0);
    expect(customSizeFee({ width: 25, nominalWidth: 24, depth: 24, nominalDepth: 24, masterCode: "B24", subCategory: "Base" })).toBe(CUSTOM_SIZE_FEE);
  });
});

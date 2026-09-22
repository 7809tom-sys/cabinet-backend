import { describe, expect, it } from "vitest";
import { catalogFillerForGap, catalogFillerPricingId, catalogFillerSuggestion, fittedCatalogFillerDescription, isCatalogFiller, isCatalogPanel } from "./catalogFiller";
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

	it("never treats refrigerator or other end panels as fillers, even when an imported accessory category is wrong", () => {
	  const refrigeratorEndPanel = {
	    id: 2796,
	    masterCode: "REPV2796",
	    description: "Refrigerator End Panel 27 × 96",
	    category: "Filler",
	    subCategory: "Accessory",
	    width: 27,
	    depth: 0.75,
	    height: 96,
	    catalogImageUrl: null,
	  } as const;
	  const panelNamedAsFiller = { ...refrigeratorEndPanel, id: 2797, masterCode: "PANEL-3", description: '3" Panel Filler', width: 3 } as const;

	  expect(isCatalogPanel(refrigeratorEndPanel)).toBe(true);
	  expect(isCatalogFiller(refrigeratorEndPanel)).toBe(false);
	  expect(isCatalogFiller(panelNamedAsFiller)).toBe(false);
	  expect(catalogFillerForGap([refrigeratorEndPanel, panelNamedAsFiller, ...fillers], 1, "base")?.masterCode).toBe("BF-3");
	  expect(catalogFillerPricingId({ id: 2796, masterCode: "REPV2796", description: refrigeratorEndPanel.description, category: "Filler", subCategory: "Accessory", width: 1, placement: "base" }, [refrigeratorEndPanel, ...fillers])).toBe(2796);
	});

	it("automatically calculates the exact installed cut and retained catalog filler identity", () => {
    expect(catalogFillerSuggestion(fillers, 2.5, "base")).toMatchObject({
      candidate: { id: 1, masterCode: "BF-3" },
      gapWidth: 2.5,
      catalogWidth: 3,
      installedWidth: 2.5,
      trimAmount: 0.5,
      description: '3" x 34.5" Base Filler — cut to 2.5"',
    });
    expect(catalogFillerSuggestion(fillers, 7, "base")).toBeNull();
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

  it("resolves a legacy generic filler to the same active catalog item used for a new fitted gap", () => {
    expect(catalogFillerPricingId({ id: 0, masterCode: "FILL-2.25", description: '2.25" Filler', category: "Accessory", subCategory: "Filler", width: 2.25, placement: "base" }, fillers)).toBe(1);
    expect(catalogFillerPricingId({ id: 24, masterCode: "B24", description: "Base", category: "Base", subCategory: "Base", width: 24, placement: "base" }, fillers)).toBe(24);
  });

  it("rebases a stale positive filler id to the active cuttable catalog filler before pricing", () => {
    expect(catalogFillerPricingId({ id: 9999, cabinetId: 9999, masterCode: "BF-3", description: '3" x 34.5" Base Filler — cut to 2.25"', category: "Filler", subCategory: "Filler", width: 2.25, placement: "base" }, fillers)).toBe(1);
    expect(catalogFillerPricingId({ id: 2, cabinetId: 2, masterCode: "BF-6", description: '6" x 34.5" Base Filler — cut to 4.5"', category: "Filler", subCategory: "Filler", width: 4.5, placement: "base" }, fillers)).toBe(2);
  });
});

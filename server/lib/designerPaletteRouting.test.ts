import { describe, expect, it } from "vitest";
import { isDesignerAccessoryRow } from "./designerPaletteRouting";
import { isPlaceablePanel, panelFamilyFor } from "../../shared/designerPanels";

const row = (over: Partial<Parameters<typeof isDesignerAccessoryRow>[0]> & { masterCode: string }) => ({
  category: "Base",
  subCategory: null,
  placementType: "base",
  description: null,
  numberOfDoors: 2,
  numberOfDrawers: 0,
  ...over,
});

/**
 * Regression cover for the reported defect: BP base/basement panels and the DWR
 * dishwasher return panel were advertised as designer-ready in Cabinet Config
 * but never appeared on the Designer's Panels tab.
 */
describe("Designer palette routing for BP and DWR panels", () => {
  it("returns BP base/basement panels from the panel query instead of the base bucket", () => {
    for (const record of [
      row({ masterCode: "BP", description: "Base Panel 24\" x 34-1/2\"", category: "Panels", subCategory: "Panels", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 }),
      row({ masterCode: "BP2496", description: "Base Panel — 24\" W x 96\" H x 3/4\" D", category: "Panels", subCategory: "Panels", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 }),
      // Loose catalog wording with no helpful category at all.
      row({ masterCode: "BP-3", description: "3\" Base Panel", category: "Base", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 }),
    ]) {
      expect(isDesignerAccessoryRow(record), record.masterCode).toBe(true);
    }
  });

  it("returns the DWR dishwasher return panel and the BEP(DWR)3 master it aliases", () => {
    for (const record of [
      row({ masterCode: "DWR3", description: "Dishwasher Return Panel", category: "Panels", subCategory: "Panels", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 }),
      row({ masterCode: "DWR", description: "Dishwasher Panel", category: "Panels", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 }),
      row({ masterCode: "BEP(DWR)3", description: "Dishwasher Panel", category: "Panels", subCategory: "Panels", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 }),
    ]) {
      expect(isDesignerAccessoryRow(record), record.masterCode).toBe(true);
    }
  });

  it("never turns a Base Peninsula cabinet into an accessory row", () => {
    expect(isDesignerAccessoryRow(row({ masterCode: "BP45L", description: "45\" Base Peninsula 3 Doors/Drawer" }))).toBe(false);
    expect(isDesignerAccessoryRow(row({ masterCode: "BPP9", description: "Base Pantry Pullout", numberOfDoors: 1 }))).toBe(false);
  });

  it("does not treat a genuine drawer front as a dishwasher panel", () => {
    // DWR-3 is a 3-inch drawer front in this line. It stays an accessory BOM
    // line, but it must never be classified as the DWR dishwasher panel.
    const drawerFront = row({
      masterCode: "DWR-3",
      description: "3\" Drawer Front",
      category: "Accessory",
      subCategory: "Drawer Front",
      placementType: "accessory",
      numberOfDoors: 1,
    });
    expect(isPlaceablePanel(drawerFront)).toBe(false);
    expect(panelFamilyFor(drawerFront)).toBeNull();
  });

  it("keeps real cabinet boxes in the Base/Wall/Tall palettes", () => {
    expect(isDesignerAccessoryRow(row({ masterCode: "B24", description: "24\" Base Cabinet" }))).toBe(false);
    expect(isDesignerAccessoryRow(row({ masterCode: "W3030", description: "Wall Cabinet", category: "Wall", placementType: "wall" }))).toBe(false);
    expect(isDesignerAccessoryRow(row({ masterCode: "U188424", description: "Utility Cabinet", category: "Tall", placementType: "tall" }))).toBe(false);
    // A tall oven box filed under Accessories is still a cabinet.
    expect(isDesignerAccessoryRow(row({ masterCode: "UOC3390", description: "33\" x 90\" Oven Pantry Cabinet", category: "Accessory", placementType: "accessory", numberOfDoors: 0 }))).toBe(false);
    // Wine racks are uppers, not trim.
    expect(isDesignerAccessoryRow(row({ masterCode: "WRC2430", description: "Wall Wine Rack", category: "Accessory", subCategory: "Wine Rack", placementType: "wall" }))).toBe(false);
  });

  it("still routes genuine trim and BOM add-ons to the accessory surface", () => {
    for (const record of [
      row({ masterCode: "CM-8", description: "Crown Moulding 8'", category: "Accessory", subCategory: "Trim", placementType: "accessory" }),
      row({ masterCode: "F-3-96", description: "3\" x 96\" Filler", category: "Accessory", subCategory: "Filler", placementType: "accessory" }),
      row({ masterCode: "ROT18", description: "Rollout tray; side panel 21 in", category: "Accessory", subCategory: "Rollout Tray", placementType: "accessory" }),
      row({ masterCode: "TK8", description: "Toe Kick 8' Plywood", category: "Trim", placementType: "trim" }),
    ]) {
      expect(isDesignerAccessoryRow(record), record.masterCode).toBe(true);
    }
  });

  it("still surfaces every previously working end/skin/decorative panel", () => {
    for (const record of [
      row({ masterCode: "BEP2434", description: "Base End Panel — 24 x 34.5", category: "Base", subCategory: "Standard Base", numberOfDoors: 0 }),
      row({ masterCode: "WEP1542", description: "Wall End Panel — 15 x 42", category: "Wall", subCategory: "Standard Wall", placementType: "wall", numberOfDoors: 0 }),
      row({ masterCode: "REP2496", description: "Refrigerator End Panel", category: "Accessory", subCategory: "Refrigerator End Panel", placementType: "accessory", numberOfDoors: 0 }),
      row({ masterCode: "TDEP-24-96", description: "24\" x 96\" Tall Decorative End Panel", category: "Tall", placementType: "tall", numberOfDoors: 0 }),
    ]) {
      expect(isDesignerAccessoryRow(record), record.masterCode).toBe(true);
    }
  });
});

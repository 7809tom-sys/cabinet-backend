import { describe, expect, it } from "vitest";
import {
  designerOfferSlot,
  isDishwasherPanelPart,
  isPlaceablePanel,
  panelFamilyFor,
  panelProductText,
} from "./designerPanels";

describe("panel identity shared by the Panels tab and Cabinet Config", () => {
  it("includes BP base/basement panels and the DWR dishwasher return panel", () => {
    for (const record of [
      { masterCode: "BP", description: "Base Panel 24\" x 34-1/2\"", subCategory: "Panels", numberOfDoors: 0, numberOfDrawers: 0 },
      { masterCode: "BP2496", description: "Base Panel — 24 x 96", subCategory: "Panels" },
      { masterCode: "BP-3", description: "3\" Base Panel", numberOfDoors: 0, numberOfDrawers: 0 },
      { masterCode: "DWR3", description: "Dishwasher Return Panel", subCategory: "Panels", numberOfDoors: 0, numberOfDrawers: 0 },
      // The canonical master that carries DWR3 as its approved alias.
      { masterCode: "BEP(DWR)3", description: "Dishwasher Panel", numberOfDoors: 0, numberOfDrawers: 0 },
    ]) {
      expect(isPlaceablePanel(record), record.masterCode).toBe(true);
    }
  });

  it("never mistakes a Base Peninsula cabinet or a drawer front for a panel", () => {
    for (const record of [
      { masterCode: "BP45L", description: "45\" Base Peninsula 3 Doors/Drawer", category: "Base", numberOfDoors: 2, numberOfDrawers: 1 },
      { masterCode: "BP45R", description: "Base Peninsula 3 FHD", category: "Base", numberOfDoors: 3, numberOfDrawers: 0 },
      { masterCode: "BPP9", description: "Base Pantry Pullout", category: "Base", numberOfDoors: 1, numberOfDrawers: 0 },
      // Real catalog row: DWR-3 in this line is a 3-inch drawer front.
      { masterCode: "DWR-3", description: "3\" Drawer Front", category: "Accessory", subCategory: "Drawer Front", numberOfDoors: 1, numberOfDrawers: 0 },
    ]) {
      expect(isPlaceablePanel(record), record.masterCode).toBe(false);
    }
  });

  it("keeps fillers, moldings, toe kicks, trays and loose hardware off the Panels tab", () => {
    for (const record of [
      { masterCode: "F396", description: "3 x 96 Filler", subCategory: "Filler" },
      { masterCode: "CM", description: "Crown moulding", subCategory: "Trim" },
      { masterCode: "TK8", description: "Toe Kick 8' Plywood", numberOfDoors: 0, numberOfDrawers: 0 },
      { masterCode: "ROT18", description: "Rollout tray; side panel 21 in", subCategory: "Rollout Tray" },
      { masterCode: "VA48", description: "Arched Valance 48\"W", numberOfDoors: 0, numberOfDrawers: 0 },
      { masterCode: "PGWDC42", description: "Glass Door for WDC Cabinet", subCategory: "Glass Door Wall" },
    ]) {
      expect(isPlaceablePanel(record), record.masterCode).toBe(false);
    }
  });

  it("still recognizes every end/skin/decorative panel family that already worked", () => {
    for (const record of [
      { masterCode: "BEP2434", description: "Base End Panel — 24 x 34.5", subCategory: "Standard Base" },
      { masterCode: "WEP1542", description: "Wall End Panel — 15 x 42", subCategory: "Standard Wall" },
      { masterCode: "WS1542", description: "15 x 42 Wall Skin Panel", subCategory: "Standard Wall" },
      { masterCode: "REP2496", description: "Refrigerator End Panel", subCategory: "Refrigerator End Panel" },
      { masterCode: "DWP24", description: "Dishwasher Panel", subCategory: "Decorative End Panel" },
      { masterCode: "TDEP-24-96", description: "24\" x 96\" Tall Decorative End Panel" },
      { masterCode: "FPL-24-96", description: "24\" Full Height Base Panel", subCategory: "Full Height Panel" },
      { masterCode: "PLYEB42", description: "Designer Natural Plywood Edge-Banded Board Looks like: flat finished panel", subCategory: "Plywood Edge-Banded Board" },
    ]) {
      expect(isPlaceablePanel(record), record.masterCode).toBe(true);
    }
  });

  it("does not read a cabinet's own raised-panel door copy as a separate panel", () => {
    expect(isPlaceablePanel({ masterCode: "B24", description: "Base Cabinet — 2 doors Looks like: raised panel doors", category: "Base", numberOfDoors: 2, numberOfDrawers: 0 })).toBe(false);
    expect(isPlaceablePanel({ masterCode: "B24", description: "Base Cabinet with Raised Panel doors", category: "Base", numberOfDoors: 2 })).toBe(false);
    expect(panelProductText({ description: "Base Cabinet Looks like: raised panel doors" })).toBe("base cabinet");
  });
});

describe("panel family routing", () => {
  it("routes BP panels to their base family and DWR to dishwasher", () => {
    expect(panelFamilyFor({ masterCode: "BP2496", description: "Base Panel — 24 x 96" })).toBe("base");
    expect(panelFamilyFor({ masterCode: "DWR3", description: "Dishwasher Return Panel", numberOfDoors: 0, numberOfDrawers: 0 })).toBe("dishwasher");
    expect(panelFamilyFor({ masterCode: "BEP(DWR)3", description: "Dishwasher Panel", numberOfDoors: 0, numberOfDrawers: 0 })).toBe("dishwasher");
    expect(panelFamilyFor({ masterCode: "REP2496", description: "Refrigerator End Panel" })).toBe("refrigerator");
    expect(panelFamilyFor({ masterCode: "WS1542", description: "Wall Skin Panel" })).toBe("skin");
    expect(panelFamilyFor({ masterCode: "B24", description: "Base Cabinet", category: "Base" })).toBeNull();
  });

  it("only calls something a dishwasher panel when the catalog says so", () => {
    expect(isDishwasherPanelPart({ masterCode: "DWR3", description: "Dishwasher Return Panel", numberOfDoors: 0, numberOfDrawers: 0 })).toBe(true);
    expect(isDishwasherPanelPart({ masterCode: "DWR-3", description: "3\" Drawer Front", subCategory: "Drawer Front" })).toBe(false);
    // A refrigerator panel is never a dishwasher panel even though both are panels.
    expect(isDishwasherPanelPart({ masterCode: "REP2496", description: "Refrigerator End Panel" })).toBe(false);
  });

  it("sends panels to the Panels palette and boxes to their own bucket", () => {
    expect(designerOfferSlot({ masterCode: "BP2496", description: "Base Panel — 24 x 96" })).toBe("panels");
    expect(designerOfferSlot({ masterCode: "DWR3", description: "Dishwasher Return Panel", numberOfDoors: 0, numberOfDrawers: 0 })).toBe("panels");
    expect(designerOfferSlot({ masterCode: "B24", placementType: "base", description: "Base Cabinet" })).toBe("base");
    expect(designerOfferSlot({ masterCode: "W3030", placementType: "wall", description: "Wall Cabinet" })).toBe("wall");
    expect(designerOfferSlot({ masterCode: "U188424", placementType: "tall", description: "Utility Cabinet" })).toBe("tall");
    expect(designerOfferSlot({ masterCode: "CM8", placementType: "accessory", description: "Crown Moulding" })).toBe("accessory");
  });
});

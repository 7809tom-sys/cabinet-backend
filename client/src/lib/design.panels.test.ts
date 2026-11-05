import { describe, expect, it } from "vitest";
import { accessoryPlacement, isDishwasherPanel, isPanelItem, isPlaceableAccessory } from "./design";
import { panelFamilyFor } from "@shared/designerPanels";

/**
 * Owner correction: BP and DWR are PANELS, not BOM accessories. DWR is the
 * dishwasher panel, which the Designer seats at floor level in a dishwasher
 * opening. These assertions pin the client behaviour the backend now exposes.
 */
describe("client panel behaviour for BP and DWR", () => {
  it("treats the DWR dishwasher panel as a floor-level, placeable panel", () => {
    const dwr = { masterCode: "DWR3", description: "Dishwasher Return Panel", subCategory: "Panels" };
    expect(isPanelItem(dwr)).toBe(true);
    expect(isPlaceableAccessory(dwr)).toBe(true);
    expect(isDishwasherPanel(dwr)).toBe(true);
    // Dishwasher panels sit on the floor; the Designer refuses to lift them.
    expect(accessoryPlacement(dwr)).toBe("base");
    expect(panelFamilyFor(dwr)).toBe("dishwasher");
  });

  it("treats a BP base/basement panel as a placeable panel", () => {
    for (const record of [
      { masterCode: "BP2496", description: "Base Panel — 24\" W x 96\" H x 3/4\" D", subCategory: "Panels" },
      { masterCode: "BP-3", description: "3\" Base Panel" },
    ]) {
      expect(isPanelItem(record), record.masterCode).toBe(true);
      expect(isPlaceableAccessory(record), record.masterCode).toBe(true);
      expect(panelFamilyFor(record), record.masterCode).toBe("base");
    }
  });

  it("does not seat a DWR drawer front at the dishwasher", () => {
    const drawerFront = { masterCode: "DWR-3", description: "3\" Drawer Front", subCategory: "Drawer Front" };
    expect(isDishwasherPanel(drawerFront)).toBe(false);
    expect(panelFamilyFor(drawerFront)).toBeNull();
  });

  it("keeps a Base Peninsula cabinet out of the panel system", () => {
    const peninsula = { masterCode: "BP45L", description: "45\" Base Peninsula 3 Doors/Drawer" };
    expect(isPanelItem(peninsula)).toBe(false);
    expect(panelFamilyFor(peninsula)).toBeNull();
  });
});

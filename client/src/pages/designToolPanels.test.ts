import { describe, expect, it } from "vitest";
import { isPanelPaletteItem } from "./designToolPanels";
import { STD } from "@/lib/design";

const item = (masterCode: string, description: string, subCategory: string | null = null) => ({ masterCode, description, subCategory });

describe("dedicated Panels palette", () => {
  it("includes real decorative/end panels and wall/base/refrigerator/dishwasher skins", () => {
    for (const record of [
      item("BEP2434", "Base End Panel — 24 x 34.5", "Standard Base"),
      item("WEP1542", "Wall End Panel — 15 x 42", "Standard Wall"),
      item("WS1542", "15 x 42 Wall Skin Panel", "Standard Wall"),
      item("REP2496", "Refrigerator End Panel", "Refrigerator End Panel"),
      item("DWP24", "Dishwasher Panel", "Decorative End Panel"),
      item("PLYEB42", "Designer Natural Plywood Edge-Banded Board Looks like: flat finished panel", "Plywood Edge-Banded Board"),
    ]) expect(isPanelPaletteItem(record)).toBe(true);
  });
  it("does not label trim, fillers, trays or normal cabinet doors as standalone panels", () => {
    for (const record of [
      item("F396", "3 x 96 Filler", "Filler"),
      item("CM", "Crown moulding", "Trim"),
      item("ROT18", "Rollout tray; side panel 21 in", "Rollout Tray"),
      item("B24", "Base Cabinet — 2 doors Looks like: raised panel doors", "Standard Base"),
      item("B24", "Base Cabinet with Raised Panel doors", "Standard Base"),
      item("PGWDC42", "Glass Door for WDC Cabinet", "Glass Door Wall"),
    ]) expect(isPanelPaletteItem(record)).toBe(false);
  });
  it("does not mutate supplier identity/dimensions/prices and keeps the existing 3/4-inch stock rule", () => {
    const panel = Object.freeze({ ...item("WEP1542", "Wall End Panel", "Standard Wall"), id: 9390176, width: "15.00", height: "42.00", depth: "12.00", retailPrice: "83.17" });
    expect(isPanelPaletteItem(panel)).toBe(true);
    expect(panel.depth).toBe("12.00");
    expect(panel.retailPrice).toBe("83.17");
    expect(STD.PANEL_THICKNESS).toBe(0.75);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isDesignerAccessoryRow } from "./lib/designerPaletteRouting";
import { isPanelPaletteItem, panelPaletteFamily } from "@/pages/designToolPanels";
import { isPanelItem } from "@/lib/design";

const design = readFileSync(new URL("./routers/design.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("./routers/catalog.ts", import.meta.url), "utf8");
const cabinetConfigAdmin = readFileSync(
  new URL("../client/src/components/admin/CabinetConfigAdmin.tsx", import.meta.url),
  "utf8",
);

/**
 * The defect was three disagreeing answers about the same row: Cabinet Config
 * said "designer", the Designer palette filed BP/DWR as boxes, and the client
 * Panels tab filtered them back out because its prose test never matched
 * "Base Panel"/"Dishwasher Return Panel". These assertions hold the layers to
 * the one shared classifier.
 */
describe("panel routing is one decision across server and client", () => {
  const panelRows = [
    { masterCode: "BP2496", description: "Base Panel — 24\" W x 96\" H x 3/4\" D", category: "Panels", subCategory: "Panels", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 },
    { masterCode: "DWR3", description: "Dishwasher Return Panel", category: "Panels", subCategory: "Panels", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 },
    { masterCode: "BEP(DWR)3", description: "Dishwasher Panel", category: "Panels", subCategory: "Panels", placementType: null, numberOfDoors: 0, numberOfDrawers: 0 },
    { masterCode: "BEP2434", description: "Base End Panel — 24 x 34.5", category: "Base", subCategory: "Standard Base", placementType: "base", numberOfDoors: 0, numberOfDrawers: 0 },
  ];

  it("agrees on every panel row", () => {
    for (const row of panelRows) {
      expect(isDesignerAccessoryRow(row), `server routing ${row.masterCode}`).toBe(true);
      expect(isPanelPaletteItem(row), `client Panels tab ${row.masterCode}`).toBe(true);
      expect(isPanelItem(row), `client panel geometry ${row.masterCode}`).toBe(true);
      expect(panelPaletteFamily(row), `panel family ${row.masterCode}`).not.toBeNull();
    }
  });

  it("agrees that cabinet boxes and peninsula bases are not panels", () => {
    const notPanels = [
      { masterCode: "B24", description: "24\" Base Cabinet", category: "Base", subCategory: "Standard Base", placementType: "base", numberOfDoors: 2, numberOfDrawers: 0 },
      { masterCode: "BP45L", description: "45\" Base Peninsula 3 Doors/Drawer", category: "Base", subCategory: null, placementType: "base", numberOfDoors: 2, numberOfDrawers: 1 },
      { masterCode: "W3030", description: "Wall Cabinet", category: "Wall", subCategory: "Standard Wall", placementType: "wall", numberOfDoors: 1, numberOfDrawers: 0 },
    ];
    for (const row of notPanels) {
      expect(isPanelPaletteItem(row), `client Panels tab ${row.masterCode}`).toBe(false);
      expect(isPanelItem(row), `client panel geometry ${row.masterCode}`).toBe(false);
    }
  });

  it("routes the accessory query through the shared classifier instead of an inline copy", () => {
    expect(design).toContain("const isAccessory = isDesignerAccessoryRow;");
    expect(design).toContain('import { isDesignerAccessoryRow } from "../lib/designerPaletteRouting";');
    expect(design).toContain("panelFamily: panelFamilyFor(r)");
  });

  it("does not re-categorise a panel as trim on the storefront", () => {
    expect(catalog).toContain("if (isPlaceablePanel(r)) return false;");
    expect(catalog).toContain('import { isPlaceablePanel } from "../../shared/designerPanels";');
  });

  it("surfaces the readiness reason in Cabinet Config so it cannot claim designer while hidden", () => {
    expect(catalog).toContain("designerReadinessForMasterCodes(db, rows.map((row) => row.masterCode))");
    expect(catalog).toContain("designerReadinessReason: readiness?.reason ?? null");
    expect(catalog).toContain("designerReady: readiness?.isCompliant ?? false");
    expect(cabinetConfigAdmin).toContain("<DesignerReadinessNotice row={row} />");
    expect(cabinetConfigAdmin).toContain('data-testid="cabinet-config-designer-hidden"');
  });
});

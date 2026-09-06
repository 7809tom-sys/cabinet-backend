import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const designActionsSource = readFileSync(new URL("../components/design/DesignActions.tsx", import.meta.url), "utf8");

describe("designer toolbar layout", () => {
  it("keeps the More-menu portal state hook inside the Design Tool component", () => {
    const hook = source.indexOf("const [moreToolsPortalElement, setMoreToolsPortalElement] = useState");
    const verifiedGate = source.indexOf("if (!verified)");

    expect(hook).toBeGreaterThan(-1);
    expect(hook).toBeLessThan(verifiedGate);
  });

  it("keeps one AI consultant control and one synchronized 3D toolbar control", () => {
    expect(source.match(/<ConsultantRoomControl/g)).toHaveLength(1);
    expect(source.match(/title="Show the synchronized 3D designer canvas"/g)).toHaveLength(1);
  });

  it("removes the highlighted duplicate Hybrid, Corner, Save, and selected-delete desktop controls", () => {
    expect(source).not.toContain('onClick={() => setViewMode("hybrid")}');
    expect(source).not.toContain('onClick={() => setViewMode("corner")}');
    expect(designActionsSource).not.toContain('title={t("dt_act_save_btn")}');

    const desktopActionsStart = source.indexOf("{/* Desktop action cluster */}");
    const desktopActionsEnd = source.indexOf("{/* Lock Cabs */}", desktopActionsStart);
    const desktopSelectedActions = source.slice(desktopActionsStart, desktopActionsEnd);
    expect(desktopSelectedActions).not.toContain("onClick={deleteSelected}");

    expect(source).toContain('title="Save design"');
    expect(source).toContain("onClick={clearCurrentDesign}");
    expect(source).toContain("onRemoveCabinet={deleteCabinet}");
  });

  it("renders the desktop More menu into the slot beside the distributor selector", () => {
    const distributorRow = source.indexOf("Distributor selector and relocated desktop More menu");
    const slot = source.indexOf('data-testid="catalog-more-tools-slot"');
    const portal = source.indexOf("moreToolsPortalElement && createPortal(");
    const trigger = source.indexOf('title="More tools"');

    expect(distributorRow).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(distributorRow);
    expect(portal).toBeGreaterThan(-1);
    expect(trigger).toBeGreaterThan(portal);
  });

  it("keeps one Wall tab and removes the redundant visible Wall By Ht tab", () => {
    const tabsStart = source.indexOf("{/* Catalog tabs.");
    const tabsEnd = source.indexOf(").map((tab) => (", tabsStart);
    const visibleTabs = source.slice(tabsStart, tabsEnd);

    expect(visibleTabs).toContain('"wall"');
    expect(visibleTabs).not.toContain('"wallht"');
    // Preserve the legacy internal mapping so a hot-reloaded old selection still
    // resolves to the normal Wall catalog rather than issuing an invalid query.
    expect(source).toContain('paletteType === "wallht"');
  });

  it("removes redundant desktop cabinet adjustment controls while preserving the attributes workflow", () => {
    const contextualStart = source.indexOf("{/* Contextual row:");
    const contextualEnd = source.indexOf("{isBlindCorner(selectedCab.masterCode", contextualStart);
    const desktopSelectedStrip = source.slice(contextualStart, contextualEnd);

    expect(desktopSelectedStrip).not.toContain("<WallPicker");
    expect(desktopSelectedStrip).not.toContain("<DimStepper");
    expect(desktopSelectedStrip).not.toContain("adjustMountHeight(");
    expect(source).toContain("<CabinetAttributesDialog");
    expect(source).toContain("onMoveCabinet={cabinetsLocked ? undefined : moveCabinetFrom3D}");
  });

  it("keeps Materials & Parts as direct toolbar actions and removes every More-menu duplicate", () => {
    expect(source.match(/setMaterialsListOpen\(true\)/g)).toHaveLength(3);
    expect(source).toContain("Materials &amp; Parts");
    expect(source).not.toContain("Materials &amp; Parts List");
  });
});

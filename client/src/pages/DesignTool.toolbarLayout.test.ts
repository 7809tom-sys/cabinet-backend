import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const designActionsSource = readFileSync(new URL("../components/design/DesignActions.tsx", import.meta.url), "utf8");
const roomSizeSource = readFileSync(new URL("../components/design/RoomSizeControl.tsx", import.meta.url), "utf8");

describe("designer toolbar layout", () => {
  it("keeps the More-menu portal state hook inside the Design Tool component", () => {
    const hook = source.indexOf("const [moreToolsPortalElement, setMoreToolsPortalElement] = useState");
    const verifiedGate = source.indexOf("if (!verified)");

    expect(hook).toBeGreaterThan(-1);
    expect(hook).toBeLessThan(verifiedGate);
  });

  it("keeps one AI consultant control and one labeled primary 3D switch", () => {
    expect(source.match(/<ConsultantRoomControl/g)).toHaveLength(1);
    expect(source.match(/data-testid="switch-to-3d-view"/g)).toHaveLength(1);
    expect(source).not.toContain('> 3D</Button>');
    expect(source).not.toContain('title="Show the synchronized 3D designer canvas"');
  });

  it("uses the labeled Wall dropdown instead of duplicate wall tabs and an icon-only auto-fill button", () => {
    expect(source.match(/data-testid="compact-workspace-wall-selector"/g)).toHaveLength(1);

    const desktopToolbarStart = source.indexOf("{/* Wall selection lives in the labeled Wall dropdown above. */}");
    const desktopToolbarEnd = source.indexOf("{/* Save Design", desktopToolbarStart);
    const desktopToolbar = source.slice(desktopToolbarStart, desktopToolbarEnd);

    expect(desktopToolbarStart).toBeGreaterThan(-1);
    expect(desktopToolbarEnd).toBeGreaterThan(desktopToolbarStart);
    expect(desktopToolbar).not.toContain("room.customWalls.map");
    expect(desktopToolbar).not.toContain("onClick={autoFillActiveWall}");
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

  it("keeps island placement controls in a collapsed side panel instead of over the canvas", () => {
    expect(source).toContain("const [islandPlacementPanelExpanded, setIslandPlacementPanelExpanded]");
    expect(source).toContain('data-testid="island-placement-panel-toggle"');
    expect(source).toContain('aria-controls="island-placement-side-panel"');
    expect(source).toContain('data-testid="island-placement-side-panel"');
    expect(source).toContain('className="absolute right-3 top-14 z-40 flex flex-col items-end gap-2 sm:top-16"');
    expect(source).not.toContain('sm:left-1/2 sm:right-auto sm:-translate-x-1/2');
  });

  it("keeps Room Size visible in compact desktop workspace and reachable on mobile", () => {
    expect(source).toContain('className={`hidden lg:block ${layoutLocked ? "pointer-events-none opacity-50" : ""}`}');
    expect(roomSizeSource).toContain('aria-label="Open room size"');
    expect(roomSizeSource).toContain("<span>Room size</span>");
    expect(source).toContain("<RoomSizeControl");
  });

	  it("offers one-click whole-drawing rotation only for explicit custom wall rooms", () => {
	    expect(source).toContain('data-testid="rotate-custom-drawing"');
	    expect(source).toContain('data-testid="rotate-custom-drawing-mobile"');
	    expect(source).toContain("onClick={rotateDrawingClockwise}");
	    expect(source).toContain("rotateCustomPlanClockwise({");
	  });

  it("keeps mobile Door & hardware editing direct without a large layout graphic", () => {
    const sheetStart = source.indexOf("{isMobile && selectedCab && !drawMode && !measureMode && (");
    const sheetEnd = source.indexOf("<WallPicker", sheetStart);
    const mobileCabinetSheet = source.slice(sheetStart, sheetEnd);

    expect(sheetStart).toBeGreaterThan(-1);
    expect(sheetEnd).toBeGreaterThan(sheetStart);
    expect(mobileCabinetSheet).toContain('data-testid="mobile-cabinet-door-hardware"');
    expect(mobileCabinetSheet).toContain("Door &amp; hardware");
    expect(mobileCabinetSheet).toContain('aria-label="Remove door"');
    expect(mobileCabinetSheet).toContain("supportsCenteredTopDoorPull(selectedCab)");
    expect(mobileCabinetSheet).toContain("usesRaisedFloorWallDoorPull(selectedCab)");
    expect(mobileCabinetSheet).not.toContain("DoorDrawerDiagram");
  });
});

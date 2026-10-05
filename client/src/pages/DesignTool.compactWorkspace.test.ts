import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Designer Compact Workspace", () => {
  it("automatically converts desktop sidebars into drawers on small laptop widths", () => {
    expect(source).toContain("const isSmallLaptop = useIsMobile(1440)");
    expect(source).toContain("const panelDrawerMode = isMobile || isCompactWorkspace");
    expect(source).toContain("isMobile={panelDrawerMode}");
  });

  it("keeps manual canvas, catalog, and price controls available in compact mode", () => {
    expect(source).toContain("Focus canvas");
    expect(source).toContain("Show panels");
    expect(source).toContain('data-testid="compact-workspace-show-panels-trigger"');
    expect(source).toContain('aria-label={isCompactWorkspace ? "Show Catalog and Price & cart panels beside the canvas"');
    expect(source).toContain('paletteType === "closetparts" ? "Add closet parts" : "Add cabinet"');
    expect(source).toContain(') : "Catalog"}');
    expect(source).toContain('data-testid="tablet-mastertrac-reference-total"');
    expect(source).toContain('masterTracListSubtotal.toFixed(2)');
    expect(source).toContain("Price &amp; cart");
  });

  it("routes positioned Closet drawer/shoe/rod mixes to their own 3D/elevation and List-only reference takeoff", () => {
    expect(source).toContain('board.masterTracStorageItems?.some((item) => item.kind !== "shelf")');
    expect(source).toContain('if (rodTowerBoard) return <MasterTracRod3D');
    expect(source).toContain('rodTowerBoard ? <MasterTracRodElevation');
    expect(source).toContain('towerConceptStorageReferenceItems(placed).map((item)');
    expect(source).toContain('not checkout');
    expect(source).toContain('const total = useMemo(() => calculateCartSubtotal(cartableLines)');
  });

  it("reveals the design after a successful connected Closet tower placement on a phone or tablet", () => {
    const start = source.indexOf("const commitMasterTracTower = useCallback(");
    const end = source.indexOf("const interactive3dOrderSummary", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const commit = source.slice(start, end);
    expect(commit).toContain('if (isMobile) { justPlacedRef.current = true; setCabEditSheetOpen(false); }');
    expect(commit).toContain('setViewMode("threeD");');
    expect(commit).toContain('setTowerDialog(null);\n    if (panelDrawerMode) setMobilePanel(null);');
  });

  it("lets tablet Closet members reveal the brochure and complete historical-List notes without covering the parts list by default", () => {
    expect(source).toContain('data-testid="mastertrac-palette-header"');
    expect(source).toContain('const [masterTracIntroExpanded, setMasterTracIntroExpanded] = useState(false)');
    expect(source).toContain('!isTabletWorkspace && <img src={MASTERTRAC_BROCHURE_PHOTO}');
    expect(source).toContain('data-testid="mastertrac-palette-about" aria-expanded={masterTracIntroExpanded}');
    expect(source).toContain('aria-controls="mastertrac-about-panel"');
    expect(source).toContain('onClick={() => setMasterTracIntroExpanded((expanded) => !expanded)}');
    expect(source).toContain('data-testid="mastertrac-about-panel" aria-hidden={!masterTracIntroExpanded} inert={!masterTracIntroExpanded}');
    expect(source).toContain('motion-safe:transition-[grid-template-rows] motion-safe:duration-[220ms]');
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('March 1, 2022 List reference only · confirm current price and availability');
    expect(source).toContain('(!isTabletWorkspace || paletteType !== "closetparts") && <div className="mt-2 flex items-center gap-1.5">');
    expect(source).toContain('data-testid="catalog-distributor-picker"');
    expect(source).toContain('data-testid={`mastertrac-sku-${product.sku}`}');
  });

  it("keeps the compact desktop toolbar to one scrollable row and preserves direct materials and surfaces access", () => {
    expect(source).toContain('isCompactWorkspace ? "flex-wrap overflow-visible lg:flex-nowrap lg:overflow-x-auto');
    expect(source).toContain('data-testid="compact-workspace-materials-trigger"');
    expect(source).toContain('title="View every cabinet, material, fixture, and part in this design"');
    expect(source).toContain('data-testid="compact-workspace-surfaces-trigger"');
    expect(source).toContain('title="Choose flooring, countertops, backsplash, faucets, and sinks"');
    expect(source).toContain('onClick={() => setMaterialsListOpen(true)}');
    expect(source).toContain('setPaletteType("surfaces");');
    expect(source).toContain('setMobilePanel("catalog");');
  });

  it("keeps the active placement wall and every floor-plan view reachable in compact mode", () => {
    expect(source).toContain('data-testid="compact-workspace-wall-selector"');
    expect(source).toContain('aria-label="Placement wall"');
    expect(source).toContain('data-testid="compact-workspace-view-selector"');
    expect(source).toContain('aria-label="Floor plan view"');
    expect(source).toContain('<option value="plan">Plan</option>');
    expect(source).toContain('<option value="elevation">Elevation</option>');
    expect(source).toContain('<option value="threeD"');
    expect(source).not.toContain('<option value="split">Split</option>');
  });

  it("keeps More and Island Zone visible in the compact toolbar while removing the duplicate 3D shortcut", () => {
    expect(source).toContain('data-testid="compact-workspace-more-trigger"');
    expect(source).toContain('data-testid="compact-workspace-island-zone-trigger"');
    expect(source).toContain("onClick={openOrCreateIsland}");
    expect(source).toContain('onClick={() => setMoreSheetOpen(true)}');
    expect(source).toContain('className={`${isCompactWorkspace ? "hidden" : "hidden lg:inline-flex"} shrink-0`}');
    expect(source).toContain("!isCompactWorkspace && moreToolsPortalElement");
  });

  it("gives a selected movable cabinet an explicit, keyboard-reachable Move entry in compact mode", () => {
    expect(source).toContain('data-testid="compact-workspace-move-trigger"');
    expect(source).toContain('aria-controls="compact-workspace-move-controls"');
    expect(source).toContain('data-testid="compact-workspace-move-controls"');
    expect(source).toContain('aria-label="Move selected cabinet directions"');
    expect(source).toContain("canShowCompactMoveControl && compactMoveControlsOpen");
  });

  it("keeps the complete cabinet Attributes editor directly reachable on every tablet and desktop touch workspace", () => {
    expect(source).toContain('data-testid="desktop-touch-attributes-trigger"');
    expect(source).toContain("!isMobile && !measureMode");
    expect(source).toContain("onClick={() => openAttributes(selectedCab.uid)}");
    expect(source).toContain("Open every property for this cabinet, including exact wall position and corner clearance");
  });

  it("uses a broad tablet overlay and two-column cabinet browsing instead of a narrow catalog panel", () => {
    expect(source).toContain('w-[min(840px,96vw)]');
    expect(source).toContain('className={isCompactWorkspace ? "grid grid-cols-2 gap-2" : undefined}');
    expect(source).toContain("Cabinet catalog — tablet view");
  });
});

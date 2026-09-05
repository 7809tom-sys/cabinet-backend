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
    expect(source).toContain("Compact workspace");
    expect(source).toContain("Full workspace");
    expect(source).toContain("> Catalog");
    expect(source).toContain("Price &amp; cart");
  });

  it("fits the compact toolbar without horizontal scrolling and opens the complete materials palette directly", () => {
    expect(source).toContain('isCompactWorkspace ? "flex-wrap overflow-visible" : "flex-nowrap overflow-x-auto scrollbar-none"');
    expect(source).toContain('data-testid="compact-workspace-materials-trigger"');
    expect(source).toContain('title="Choose flooring, countertops, backsplash, faucets, and sinks"');
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

  it("uses a broad tablet overlay and two-column cabinet browsing instead of a narrow catalog panel", () => {
    expect(source).toContain('w-[min(840px,96vw)]');
    expect(source).toContain('className={isCompactWorkspace ? "grid grid-cols-2 gap-2" : undefined}');
    expect(source).toContain("Cabinet catalog — tablet view");
  });
});

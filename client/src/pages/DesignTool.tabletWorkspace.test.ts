import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const designTool = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const room3d = readFileSync(new URL("../components/design/InteractiveRoom3D.tsx", import.meta.url), "utf8");
const topNav = readFileSync(new URL("../components/TopNav.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../hooks/useTabletWorkspace.ts", import.meta.url), "utf8");

describe("tablet workspace layout (1024–1366px or touch)", () => {
  it("defines the tablet tier as 1024–1366px wide or a coarse-pointer device", () => {
    expect(hook).toContain("TABLET_WORKSPACE_MAX_WIDTH = 1366");
    expect(hook).toContain('window.matchMedia("(pointer: coarse)")');
    expect(hook).toContain("width >= PHONE_WORKSPACE_MAX_WIDTH && (width <= TABLET_WORKSPACE_MAX_WIDTH || touch)");
  });

  it("keeps a single non-scrolling toolbar row with the essentials and folds the rest into More tools", () => {
    expect(designTool).toContain('data-testid="designer-toolbar" data-tablet-workspace={isTabletWorkspace ? "true" : undefined}');
    expect(designTool).toContain("flex-nowrap overflow-visible gap-1.5 px-2 py-1");
    expect(designTool).toContain('data-testid="tablet-add-cabinet"');
    expect(designTool).toContain('data-testid="tablet-undo-redo"');
    expect(designTool).toContain('data-testid="tablet-running-total"');
    expect(designTool).toContain('{isTabletWorkspace ? "More tools" : "More"}');
    expect(designTool).toContain('data-testid="tablet-workspace-more-section"');
    expect(designTool).toContain('data-testid="tablet-more-room-size"');
    expect(designTool).toContain('data-testid="tablet-more-selected-actions"');
    // Desktop-only clusters are hidden on tablets, not just scrolled off-screen.
    expect(designTool).toContain('className={`${isTabletWorkspace ? "hidden" : "hidden lg:flex"} items-center gap-1`}');
    expect(designTool).toContain('className={`${isTabletWorkspace ? "hidden" : "hidden lg:block"}');
  });

  it("docks the toolbar at the bottom in portrait", () => {
    expect(designTool).toContain('isTabletPortrait ? "order-last border-b-0 border-t"');
  });

  it("opens the catalog and cabinet editor as ~40% bottom sheets on tablets", () => {
    expect(designTool).toContain('data-testid={tablet ? "tablet-catalog-bottom-sheet" : undefined}');
    expect(designTool).toContain('h-[42vh] rounded-t-2xl');
    const attributes = readFileSync(new URL("../components/design/CabinetAttributesDialog.tsx", import.meta.url), "utf8");
    expect(attributes).toContain('data-testid={isTablet ? "tablet-cabinet-edit-bottom-sheet" : undefined}');
    expect(attributes).toContain("if (isMobile || isTablet)");
  });

  it("collapses the 3D floating row, fitted fillers, and pan pad on tablets", () => {
    expect(room3d).toContain("const tabletOverlay = embedded && tabletTier.tablet;");
    expect(room3d).toContain('${tabletOverlay ? "hidden" : "hidden sm:flex"}');
    expect(room3d).toContain('data-testid="three-d-fitted-filler-chip"');
    expect(room3d).toContain("Fillers ({fittedFillerLabels.length})");
    expect(room3d).toContain('compact hidePan={tabletTier.touch} testId="three-d-tablet-navigation"');
    expect(room3d).toContain("{!tabletOverlay && <button type=\"button\" data-testid=\"three-d-add-cabinet-mobile\"");
  });

  it("hides the site header behind a CD button in full-screen design mode", () => {
    expect(topNav).toContain('data-testid="designer-immersive-restore"');
    expect(topNav).toContain('data-testid="designer-immersive-hide"');
    expect(topNav).toContain("if (isDesignerTablet && immersive)");
  });
});

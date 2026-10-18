import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");
const dialogSource = readFileSync(resolve(process.cwd(), "client/src/components/design/FourAnchorAutoBuildDialog.tsx"), "utf8");

describe("admin four-anchor Designer wiring", () => {
  it("exposes the action only for admins and disables it on a non-empty plan", () => {
    expect(pageSource).toContain("{isAdmin && (");
    expect(pageSource).toContain('data-testid="admin-four-anchor-auto-build"');
    expect(pageSource).toContain("disabled={placed.length > 0 || layoutLocked}");
    expect(pageSource).toContain("buildFourAnchorAutoLayout");
  });

  it("requires the four measured anchors and explicit layout controls in the popup", () => {
    expect(dialogSource).toContain("layoutType");
    expect(dialogSource).toContain("originCorner");
    expect(dialogSource).toContain("runDirection");
    expect(dialogSource).toContain("sink");
    expect(dialogSource).toContain("stove");
    expect(dialogSource).toContain("dishwasher");
    expect(dialogSource).toContain("refrigerator");
    expect(dialogSource).toContain('data-testid="four-anchor-build-submit"');
  });

  it("makes the wall choice and its measurement datum explicit for every appliance row", () => {
    expect(dialogSource).toContain("Place on wall");
    expect(dialogSource).toContain("Center from selected wall start (in.)");
    expect(dialogSource).toContain("Choose Wall 1–4 for each appliance");
    expect(dialogSource).toContain("Sink base — place on wall");
    expect(dialogSource).toContain("Refrigerator — place on wall");
    expect(dialogSource).not.toContain("RUN / X");
    expect(dialogSource).not.toContain("DEPTH / Y");
  });

  it("offers a left or right sink-adjacent dishwasher choice when no exact center is entered", () => {
    expect(dialogSource).toContain("Dishwasher position");
    expect(dialogSource).toContain("Left of sink");
    expect(dialogSource).toContain("Right of sink");
    expect(dialogSource).toContain("dishwasherSide");
    expect(dialogSource).toContain("Optional exact dishwasher center");
  });

  it("collects a selected sink base and documents the mandatory refrigerator enclosure instead of using generic floor appliances", () => {
    expect(dialogSource).toContain("Sink base size");
    expect(dialogSource).toContain("SB{width}");
    expect(dialogSource).toContain("36″ refrigerator");
    expect(dialogSource).toContain("Two source-priced side panels");
    expect(dialogSource).toContain("Matching source-priced 36″ cabinet above");
    expect(pageSource).toContain("No source-priced SB${sinkBaseWidth} sink base");
    expect(pageSource).toContain("makeDefaultSinkForCabinet(sinkBase");
    expect(pageSource).toContain("buildMandatoryFourAnchorRefrigeratorBay");
  });

  it("collects the requested 30, 36, or 42 inch wall-cabinet height and keeps submit failures visible", () => {
    expect(dialogSource).toContain("Wall-cabinet height");
    expect(dialogSource).toContain("([30, 36, 42] as const)");
    expect(dialogSource).toContain("height}″ wall cabinets");
    expect(dialogSource).toContain("30″, 36″, or 42″");
    expect(dialogSource).toContain("wallCabinetHeightIn");
    expect(dialogSource).toContain('data-testid="four-anchor-build-error"');
  });

  it("resolves the selected SB width only to a straight sink base and never fills a wall gap with a corner SKU", () => {
    expect(pageSource).toContain("const straightBaseCatalog = autoBuildStraightBaseCatalog(pool);");
    expect(pageSource).toContain("isAutoBuildStraightSinkBaseCandidate(item)");
    expect(pageSource).toContain('autoFillSpan(segment.length, "kitchen", stage.straightBaseCatalog, { strategy: "largest-first" })');
    expect(pageSource).not.toContain('autoFillSpan(segment.length, "kitchen", pool)');
  });

  it("uses the existing wall and collision engines for selected-wall fill, never a hard-coded bottom-wall run", () => {
    expect(pageSource).toContain("freeSegmentsOnWall(");
    expect(pageSource).toContain("wallPlacementAt(along, width, depth, wallId, room)");
    expect(pageSource).toContain("appendCollisionFreePlacements(working, [candidate], room)");
    expect(pageSource).toContain("subtractAnchorRunReservations");
    expect(pageSource).toContain("refrigeratorReservation.start");
    expect(pageSource).toContain("refrigeratorReservation.end");
    expect(pageSource).not.toContain("y: room.depth - STD.BASE_DEPTH");
  });

  it("seats the measured appliances before prompting for catalog-backed room corners and filling the remaining runs", () => {
    expect(pageSource).toContain("setFourAnchorCornerStage");
    expect(pageSource).toContain("FourAnchorCornerSelectionDialog");
    expect(pageSource).toContain("fourAnchorCornerSlots(input.layoutType, {");
    expect(pageSource).toContain("wallIds: selectedWalls, room, originCorner: input.originCorner, runDirection: input.runDirection");
    expect(pageSource).toContain("nextAvailableRoomCornerPlacement");
    expect(pageSource).toContain("completeFourAnchorAutoLayout");
    expect(pageSource).toContain("A corner cabinet is required at every Four-anchor L/U corner");
  });

  it("runs aligned source-priced wall cabinets only after required corners and regular base runs", () => {
    const completion = pageSource.slice(pageSource.indexOf("const completeFourAnchorAutoLayout"), pageSource.indexOf("const cancelFourAnchorCornerStage"));
    const corners = completion.indexOf("for (const slot of stage.slots)");
    const bases = completion.indexOf("autoFillSpan(segment.length");
    const walls = completion.indexOf("buildFourAnchorWallCabinets({");
    const commit = completion.indexOf("setPlaced(working)");
    expect(corners).toBeGreaterThanOrEqual(0);
    expect(bases).toBeGreaterThan(corners);
    expect(walls).toBeGreaterThan(bases);
    expect(commit).toBeGreaterThan(walls);
    expect(completion).toContain("catalog: stage.wallPool");
    expect(completion).toContain("wallCabinetHeightIn: stage.input.wallCabinetHeightIn ?? 30");
    expect(completion).toContain("upperResult.skipped");
  });
});

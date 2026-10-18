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

  it("collects selected sink-base and refrigerator enclosure choices instead of using generic floor appliances", () => {
    expect(dialogSource).toContain("Sink base size");
    expect(dialogSource).toContain("SB{width}");
    expect(dialogSource).toContain("Refrigerator width");
    expect(dialogSource).toContain("Side panels");
    expect(dialogSource).toContain("Over-fridge enclosure");
    expect(pageSource).toContain("No source-priced SB${sinkBaseWidth} sink base");
    expect(pageSource).toContain("makeDefaultSinkForCabinet(sinkBase");
    expect(pageSource).toContain("initialChoice:");
  });

  it("uses the existing wall and collision engines for selected-wall fill, never a hard-coded bottom-wall run", () => {
    expect(pageSource).toContain("freeSegmentsOnWall(");
    expect(pageSource).toContain("wallPlacementAt(along, width, depth, wallId, room)");
    expect(pageSource).toContain("appendCollisionFreePlacements(working, [candidate], room)");
    expect(pageSource).toContain("subtractAnchorRunReservations");
    expect(pageSource).not.toContain("y: room.depth - STD.BASE_DEPTH");
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM } from "./design";
import {
  autoBuildCornerCatalog,
  fourAnchorCornerSlots,
  fourAnchorCornerSlotPoint,
} from "./fourAnchorCornerStage";

describe("Four-anchor appliance-first corner stage", () => {
  it("asks for no corner on a single-wall or galley build, one real corner for L, and two for U", () => {
    expect(fourAnchorCornerSlots("single-wall")).toEqual([]);
    expect(fourAnchorCornerSlots("galley")).toEqual([]);
    expect(fourAnchorCornerSlots("l-shape")).toEqual([
      { id: "wall-1-wall-2", label: "Corner between Wall 1 and Wall 2", firstWall: "Wall 1", secondWall: "Wall 2" },
    ]);
    expect(fourAnchorCornerSlots("u-shape")).toEqual([
      { id: "wall-1-wall-2", label: "Corner between Wall 1 and Wall 2", firstWall: "Wall 1", secondWall: "Wall 2" },
      { id: "wall-2-wall-3", label: "Corner between Wall 2 and Wall 3", firstWall: "Wall 2", secondWall: "Wall 3" },
    ]);
  });

  it("maps the L-shape Wall 1/Wall 2 choice to their actual shared engine vertex", () => {
    expect(fourAnchorCornerSlotPoint(
      { id: "wall-1-wall-2", label: "Corner between Wall 1 and Wall 2", firstWall: "Wall 1", secondWall: "Wall 2" },
      DEFAULT_ROOM,
      "left",
      "right",
    )).toEqual({ x: DEFAULT_ROOM.width, y: 0, firstWallId: "top" });
  });

  it("shows only real source-priced base-corner options after appliances, never a straight base, sink base, or base-end return", () => {
    const catalog = [
      { id: 1, masterCode: "B24", description: "24 inch Base Cabinet", placement: "base" as const },
      { id: 2, masterCode: "SB36", description: "36 inch Sink Base", placement: "base" as const },
      { id: 3, masterCode: "BEC24", description: "Base End Corner Cabinet", placement: "base" as const, cornerType: "base-end-corner" },
      { id: 4, masterCode: "LSB36", description: "36 inch Lazy Susan Corner Base", placement: "base" as const, cornerType: "lazy-susan" },
      { id: 5, masterCode: "BBC39", description: "39 inch Blind Corner Base", placement: "base" as const, cornerType: "blind-corner" },
      { id: 6, masterCode: "WDC2430", description: "Diagonal Wall Corner", placement: "wall" as const, cornerType: "diagonal" },
    ];

    expect(autoBuildCornerCatalog(catalog).map((item) => item.masterCode)).toEqual(["LSB36", "BBC39"]);
  });
});

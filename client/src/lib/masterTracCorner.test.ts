import { describe, expect, it } from "vitest";
import { buildDesignCabinetCartLines } from "./designCartLines";
import { removeOverlappingPlacements, type RoomData } from "./design";
import { masterTracProduct } from "./closet";
import {
  CORNER_FOOTPRINT_IN, defaultTowerConfig, isMasterTracCornerBoard,
  masterTracCornerParts, planMasterTracTower, towerConceptReferenceSubtotal,
  towerConfigFromPlacements, towerTotalWidth,
} from "./masterTracTower";

const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };

const variants = [
  { finish: "Glacier White", fixed: "432556", adjustable: "432557", joint: "433172", fixedList: 46, adjustableList: 38 },
  { finish: "Spiced Mahogany", fixed: "432786", adjustable: "432787", joint: "433176", fixedList: 57.5, adjustableList: 47.5 },
  { finish: "Slate Rift", fixed: "430833", adjustable: "430834", joint: "433174", fixedList: 57.5, adjustableList: 47.5 },
] as const;

describe("MasterTrac illustrative curved corner with real 2022 catalog SKUs", () => {
  it.each(variants)("matches sourced fixed and adjustable $finish shelves and prices", ({ finish, fixed, adjustable, joint, fixedList, adjustableList }) => {
    expect(masterTracCornerParts(finish, "fixed")?.shelf.sku).toBe(fixed);
    expect(masterTracCornerParts(finish, "adjustable")?.shelf.sku).toBe(adjustable);
    expect(masterTracCornerParts(finish, "fixed")?.joint?.sku).toBe(joint);
    expect(masterTracCornerParts(finish, "adjustable")?.joint).toBeNull();
    expect(masterTracProduct(fixed)?.listEachUsd).toBe(fixedList);
    expect(masterTracProduct(adjustable)?.listEachUsd).toBe(adjustableList);
  });

  it.each(["start", "end"] as const)("places a fixed corner at the %s room corner adjacent to two shared-upright bays", (side) => {
    const config = { ...defaultTowerConfig(), corner: side };
    const start = side === "start" ? 0 : room.width - towerTotalWidth(config);
    const result = planMasterTracTower(config, room, "top", start, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const corners = result.plan.boards.filter(isMasterTracCornerBoard);
    expect(corners).toHaveLength(1);
    const shelf = corners[0];
    expect(shelf.masterCode).toBe("432556");
    expect(shelf.masterTracCorner).toMatchObject({ side, type: "fixed", illustrative: true, hJointSku: "433172" });
    expect([shelf.width, shelf.height, shelf.depth]).toEqual([29.5, 0.75, 29.5]);
    expect(shelf.wallOffset).toBe(side === "start" ? 0 : 114.5);
    const panels = result.plan.boards.filter((board) => ["left", "center", "right"].includes(board.masterTracTowerRole ?? ""));
    expect(panels).toHaveLength(3);
    expect(panels.filter((board) => board.masterTracTowerRole === "center")).toHaveLength(1);
    expect(side === "start" ? panels[0].wallOffset : shelf.wallOffset).toBe(side === "start" ? 29.5 : panels[2].wallOffset! + 0.75);
    expect(shelf.mountBottom).toBe(config.bays[side === "start" ? 0 : 1].fixedTopIn);
    expect(result.plan.conceptualItems.filter((item) => item.sku === "432608")).toHaveLength(2);
    expect(result.plan.conceptualItems.find((item) => item.sku === "433172")).toMatchObject({ quantity: 1, listEachUsd: 8.5, description: expect.stringContaining("H-Joint") });
    expect(result.plan.listSubtotal).toBe(231 + 46 + 8.5 + 2 * 9);
    expect(towerConceptReferenceSubtotal(result.plan.boards)).toBe(8.5 + 2 * 9);
    const restored = removeOverlappingPlacements(JSON.parse(JSON.stringify(result.plan.boards)), room);
    expect(restored.rejected).toHaveLength(0);
    expect(restored.placed).toHaveLength(result.plan.boards.length);
    expect(towerConfigFromPlacements(restored.placed, "tower-preview")).toMatchObject({ wall: "top", startIn: start, config: { corner: side, cornerShelfType: "fixed" } });
    expect(buildDesignCabinetCartLines({
      placed: restored.placed, styleId: 330011, distributorId: 210001, tier: "homeowner",
      styleNameById: new Map([[330011, "Test style"]]), unitPriceFor: () => 999,
    })).toHaveLength(0);
  });

  it("uses adjustable variant at an independent height, without claiming a fixed-only H-joint", () => {
    const config = { ...defaultTowerConfig("Slate Rift"), corner: "start" as const, cornerShelfType: "adjustable" as const, cornerElevationIn: 44 };
    const result = planMasterTracTower(config, room, "top", 0, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.boards.find(isMasterTracCornerBoard)).toMatchObject({ masterCode: "430834", mountBottom: 44, masterTracCorner: { hJointSku: null } });
    expect(result.plan.conceptualItems.map((item) => item.sku)).toEqual(["431613", "431613"]);
    expect(towerConfigFromPlacements(result.plan.boards, "tower-preview")?.config).toMatchObject({ cornerShelfType: "adjustable", cornerElevationIn: 44 });
  });

  it("rejects noncorner positions, deep bays, conflicting pieces and mismatched fixed shelf heights without partial placement", () => {
    const config = { ...defaultTowerConfig(), corner: "start" as const };
    expect(planMasterTracTower(config, room, "top", 5, []).ok).toBe(false);
    expect(planMasterTracTower({ ...config, depthIn: 23.5 as const }, room, "top", 0, []).ok).toBe(false);
    expect(planMasterTracTower({ ...config, cornerElevationIn: 70 }, room, "top", 0, []).ok).toBe(false);
    const initial = planMasterTracTower(config, room, "top", 0, []);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    expect(planMasterTracTower(config, room, "top", 0, initial.plan.boards, [], "second").ok).toBe(false);
    expect(initial.plan.boards.find(isMasterTracCornerBoard)?.width).toBe(CORNER_FOOTPRINT_IN);
  });
});

import { describe, expect, it } from "vitest";
import { masterTracProduct } from "./closet";
import { removeOverlappingPlacements, type RoomData, type WallOpening } from "./design";
import { defaultTowerConfig, planMasterTracTower, towerConfigFromPlacements, towerTotalWidth, towerWidths } from "./masterTracTower";

const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };
const config = defaultTowerConfig();

describe("MasterTrac connected tower planning", () => {
  it("uses a single shared center-upright SKU, exact bay openings and 2022 List-only boards", () => {
    const result = planMasterTracTower(config, room, "top", 12, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { boards, totalWidthIn, listSubtotal } = result.plan;
    expect(totalWidthIn).toBe(50.25);
    expect(boards).toHaveLength(11);
    expect(boards.filter((b) => b.masterTracTowerRole === "center")).toHaveLength(1);
    expect(boards.filter((b) => b.masterTracTowerRole === "adjustable")).toHaveLength(4);
    expect(boards.filter((b) => b.masterTracTowerRole === "fixed-top")).toHaveLength(2);
    expect(boards.filter((b) => b.masterTracTowerRole === "fixed-bottom")).toHaveLength(2);
    expect(boards.filter((b) => b.masterTracTowerRole === "left")[0].masterCode).toBe("432136");
    expect(boards.filter((b) => b.masterTracTowerRole === "center")[0].masterCode).toBe("432519");
    expect(boards.filter((b) => b.masterTracTowerRole === "right")[0].masterCode).toBe("432525");
    expect(boards.filter((b) => b.masterTracTowerRole === "adjustable")[0].masterCode).toBe("432535");
    expect(boards.filter((b) => b.masterTracTowerRole === "fixed-bottom")[0].masterCode).toBe("432529");
    expect(boards.every((b) => b.category === "MasterTrac Closet" && b.width === b.nominalWidth && b.height === b.nominalHeight && b.depth === b.nominalDepth)).toBe(true);
    const panels = boards.filter((b) => ["left", "center", "right"].includes(b.masterTracTowerRole ?? ""));
    expect(panels.map((b) => b.wallOffset)).toEqual([12, 36.75, 61.5]);
    const shelves = boards.filter((b) => b.masterTracTowerRole === "fixed-bottom");
    expect(shelves.map((b) => b.wallOffset)).toEqual([12.75, 37.5]);
    expect(shelves.every((b) => b.width === 24 && b.depth === 14.5 && b.height === 0.75)).toBe(true);
    expect(listSubtotal).toBe(231);
    expect(listSubtotal).toBe(boards.reduce((sum, b) => sum + masterTracProduct(b.masterCode)!.listEachUsd, 0));
  });

  it("accepts three distinct bays using four panels and survives saved-design collision restoration", () => {
    const triple = { ...config, bays: [24, 30, 18].map((widthIn) => ({ widthIn, fixedBottomIn: 6, fixedTopIn: 86.25, adjustableHeightsIn: [30, 54] })) };
    const result = planMasterTracTower(triple, room, "bottom", 3, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.totalWidthIn).toBe(75);
    expect(result.plan.boards.filter((b) => b.masterTracTowerRole === "center")).toHaveLength(2);
    expect(result.plan.boards.every((b) => b.wallId === "bottom" && b.y === room.depth - 14.5)).toBe(true);
    const restored = removeOverlappingPlacements(JSON.parse(JSON.stringify(result.plan.boards)), room);
    expect(restored.rejected).toHaveLength(0);
    expect(restored.placed).toHaveLength(result.plan.boards.length);
    const parsed = towerConfigFromPlacements(restored.placed, "tower-preview");
    expect(parsed?.config.bays.map((bay) => bay.widthIn)).toEqual([24, 30, 18]);
    expect(parsed?.startIn).toBe(3);
    expect(parsed?.wall).toBe("bottom");
  });

  it("uses the selected finish and deep-board SKUs; nominal 96 is 94 actual", () => {
    const deep = { ...defaultTowerConfig("Spiced Mahogany"), depthIn: 23.5 as const, bays: [24, 30].map((widthIn) => ({ widthIn, fixedBottomIn: 6, fixedTopIn: 86.25, adjustableHeightsIn: [42] })) };
    const result = planMasterTracTower(deep, room, "right", 10, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.boards.filter((b) => b.masterTracTowerRole === "left")[0].masterCode).toBe("432770");
    expect(result.plan.boards.filter((b) => b.masterTracTowerRole === "center")[0].masterCode).toBe("432772");
    expect(result.plan.boards.filter((b) => b.masterTracTowerRole === "right")[0].masterCode).toBe("432774");
    expect(result.plan.boards.every((b) => b.x === room.width - 23.5 && b.rotation === 90)).toBe(true);
    expect(towerWidths(23.5)).toEqual([24, 30]);
    const nominal96 = { ...defaultTowerConfig("Glacier White"), heightIn: 94 as const, bays: [24, 24].map((widthIn) => ({ widthIn, fixedBottomIn: 6, fixedTopIn: 93.25, adjustableHeightsIn: [] })) };
    const tall = planMasterTracTower(nominal96, room, "top", 0, []);
    expect(tall.ok).toBe(true);
    if (tall.ok) expect(tall.plan.boards.find((b) => b.masterTracTowerRole === "left")?.masterCode).toBe("432514");
  });

  it("rejects entire assemblies for unsupported SKU combination, invalid shelf spacing, low ceiling, and short wall", () => {
    const unsupported = { ...config, depthIn: 23.5 as const, bays: [{ ...config.bays[0], widthIn: 12 }, config.bays[1]] };
    expect(planMasterTracTower(unsupported, room, "top", 0, []).ok).toBe(false);
    const missingRole = { ...config, heightIn: 94 as const, depthIn: 23.5 as const };
    expect(planMasterTracTower(missingRole, room, "top", 0, []).ok).toBe(false);
    const overlap = { ...config, bays: [{ ...config.bays[0], adjustableHeightsIn: [6.25, 54] }, ...config.bays.slice(1)] };
    expect(planMasterTracTower(overlap, room, "top", 0, []).ok).toBe(false);
    expect(planMasterTracTower(config, { ...room, ceilingHeight: 84 }, "top", 0, []).ok).toBe(false);
    expect(planMasterTracTower(config, { ...room, width: 48 }, "top", 0, []).ok).toBe(false);
    expect(planMasterTracTower(config, room, "top", -1, []).ok).toBe(false);
    expect(towerTotalWidth(config)).toBe(50.25);
  });

  it("rejects a door/window or existing board without partially adding the tower", () => {
    const opening: WallOpening = { uid: "window", kind: "window", label: "West window", side: "top", offset: 22, width: 24, height: 36, sill: 36 };
    const windowResult = planMasterTracTower(config, room, "top", 12, [], [opening]);
    expect(windowResult).toEqual({ ok: false, reason: expect.stringContaining("West window") });
    const first = planMasterTracTower(config, room, "top", 12, [], [], "original");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const conflict = planMasterTracTower(config, room, "top", 24, first.plan.boards, [], "other");
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.reason).toContain("Nothing was placed");
    expect(first.plan.boards).toHaveLength(11);
  });

  it("reopens a saved group's changed shelf heights rather than reverting them to wizard defaults", () => {
    const initial = planMasterTracTower(config, room, "top", 0, []);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const moved = initial.plan.boards.map((board) => board.masterTracTowerRole === "adjustable" && board.masterTracTowerBayIndex === 0 && board.mountBottom === 54
      ? { ...board, mountBottom: 55 } : board);
    const parsed = towerConfigFromPlacements(moved, "tower-preview");
    expect(parsed?.config.bays[0].adjustableHeightsIn).toEqual([30, 55]);
    expect(parsed?.config.bays[1].adjustableHeightsIn).toEqual([30, 54]);
  });
});

import { describe, expect, it } from "vitest";
import { appendWallBuilderSegment, wallBuilderRoomGeometry, type WallBuilderSegment } from "./polygonRoom";
import {
  appendRefrigeratorEnclosurePlacements,
  clampCabinetToRoom,
  commitRefrigeratorAssemblyCandidate,
  countertopSurfacePlanPolygon,
  countertopSurfaces,
  fitRefrigeratorEnclosurePlacements,
  hasCollision,
  normalizeRefrigeratorBayUppers,
  refrigeratorBayRunMetrics,
  refrigeratorBayVerificationMetrics,
  REFRIGERATOR_UPPER_CLEARANCE_IN,
  wallPlacementAt,
  wallPlacementAtUnbounded,
  wallRunFrame,
  wallRunOffset,
  wallRunSpan,
  type PlacedCabinet,
  type RoomData,
} from "./design";
import { buildDesignCabinetCartLines } from "./designCartLines";

/**
 * ONE-ENGINE GUARD (owner brief 2026-09-30):
 * Build the same refrigerator bay in the 3D Designer's standard room and in a
 * Continuous Wall Builder room — 36×70×30 refrigerator, 36×12×24 cabinet
 * above, Both REP2496 panels, base cabinets on each side — on a 45° run and at
 * a 90° corner. Codes, run positions, panels, fillers, countertop outline and
 * total price must be identical between the two tools. Any difference fails.
 */

const STYLE_ID = 330028;
const PRICES: Record<string, number> = { "FRIDGE-36": 0, WR3612: 210, REP2496: 145, B24: 260, B36: 330, F342: 38 };

function drawnRoom(): RoomData {
  let segments: WallBuilderSegment[] = [];
  segments = appendWallBuilderSegment(segments, 144, "start"); // wall A (reference run)
  segments = appendWallBuilderSegment(segments, 144, "right45"); // wall B (45° run)
  segments = appendWallBuilderSegment(segments, 120, "right90"); // wall C (90° corner with B)
  const result = wallBuilderRoomGeometry(segments);
  if (!result.room) throw new Error(result.error ?? "Expected a measured room path");
  return { ...result.room, ceilingHeight: 96 };
}
const standardRoom: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };

type Recipe = { uid: string; code: string; placement: PlacedCabinet["placement"]; along: number; w: number; d: number; h: number; mountBottom?: number };

function body(r: Recipe, wallId: string, room: RoomData): PlacedCabinet {
  const spot = wallPlacementAt(r.along, r.w, r.d, wallId, room);
  return {
    uid: r.uid, cabinetId: 1, masterCode: r.code, description: r.code, placement: r.placement,
    x: spot.x, y: spot.y, width: r.w, depth: r.d, height: r.h, rotation: spot.rotation,
    wallId: spot.wallId, wallOffset: spot.wallOffset, ...(r.mountBottom != null ? { mountBottom: r.mountBottom } : {}),
  } as PlacedCabinet;
}

/** The popup's choices: 36×70×30 fridge, WR3612 (36×12×24) above, Both REP2496 panels. */
function buildBay(existing: PlacedCabinet[], fridgeAlong: number, wallId: string, room: RoomData, panels: "both" | "left") {
  const fridge = { ...body({ uid: "fridge", code: "FRIDGE-36", placement: "appliance", along: fridgeAlong, w: 36, d: 30, h: 70 }, wallId, room), cabinetId: 0, refrigeratorPanelMode: panels } as PlacedCabinet;
  const bay = refrigeratorBayRunMetrics(fridge, room);
  const cap = {
    ...body({ uid: "cap", code: "WR3612", placement: "wall", along: bay.refrigeratorCenter - 18, w: 36, d: 24, h: 12, mountBottom: 70 + REFRIGERATOR_UPPER_CLEARANCE_IN }, wallId, room),
    refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "bridge",
  } as PlacedCabinet;
  const panel = (side: "left" | "right") => {
    const along = side === "left" ? bay.openingStart - 0.75 : bay.openingEnd;
    const spot = wallPlacementAtUnbounded(along, 0.75, 24, wallId, room);
    return {
      uid: `${side}-panel`, cabinetId: 2, masterCode: "REP2496", description: "Refrigerator End Panel", placement: "tall",
      x: spot.x, y: spot.y, width: 0.75, depth: 24, height: 84, rotation: spot.rotation, wallId: spot.wallId, wallOffset: spot.wallOffset,
      customProfile: "refrigerator-end-panel", subCategory: "Refrigerator End Panel", mountBottom: 0,
      refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: `${side}-panel`,
    } as PlacedCabinet;
  };
  const additions = [cap, panel("left"), ...(panels === "both" ? [panel("right")] : [])];
  const fitted = fitRefrigeratorEnclosurePlacements([...existing, fridge], additions, fridge.uid, room);
  const result = appendRefrigeratorEnclosurePlacements(fitted.existing, fitted.additions, fridge.uid, room);
  expect(result.rejected).toEqual([]);
  return normalizeRefrigeratorBayUppers(result.placed, room);
}

/** Everything the owner asked to compare, expressed in run-relative inches so a 45° wall and a flat wall can be compared 1:1. */
function report(placed: PlacedCabinet[], room: RoomData, wallId: string) {
  const frame = wallRunFrame(wallId, room)!;
  const toRun = (pt: { x: number; y: number }) => {
    const dx = pt.x - frame.start.x, dy = pt.y - frame.start.y;
    return { along: +(dx * frame.tangent.x + dy * frame.tangent.y).toFixed(3), inward: +(dx * frame.inward.x + dy * frame.inward.y).toFixed(3) };
  };
  const onRun = placed.filter((p) => p.wallId === wallId);
  const parts = onRun
    .map((p) => ({
      code: p.masterCode, role: p.refrigeratorAssemblyRole ?? null, placement: p.placement,
      start: +wallRunOffset(p, wallId, room).toFixed(3), span: +wallRunSpan(p, wallId, room).toFixed(3),
      height: p.height, mountBottom: p.mountBottom ?? 0, insideRoom: clampCabinetToRoom(p, room).x === p.x && clampCabinetToRoom(p, room).y === p.y,
      collides: hasCollision(p, placed.filter((o) => o.uid !== p.uid)),
    }))
    .sort((a, b) => a.start - b.start || a.code.localeCompare(b.code));
  const fridge = onRun.find((p) => p.masterCode === "FRIDGE-36")!;
  const bay = refrigeratorBayVerificationMetrics(placed, fridge, room);
  const countertops = countertopSurfaces(placed, room)
    .map((s) => countertopSurfacePlanPolygon(s).map(toRun))
    .filter((poly) => poly.every((pt) => pt.inward > -0.01 && pt.inward < 30.01))
    .map((poly) => poly.map((pt) => ({ along: +pt.along.toFixed(2), inward: Math.abs(pt.inward) < 0.005 ? 0 : +pt.inward.toFixed(2) })))
    .map((poly) => poly.sort((a, b) => a.along - b.along || a.inward - b.inward))
    .sort((a, b) => a[0]!.along - b[0]!.along);
  return { parts, bay, countertops, count: onRun.length };
}

function priceTotal(placed: PlacedCabinet[]) {
  const lines = buildDesignCabinetCartLines({
    placed, styleId: STYLE_ID, distributorId: 210001, tier: "homeowner", styleNameById: new Map([[STYLE_ID, "Proof Shaker"]]),
    unitPriceFor: (c) => PRICES[c.masterCode] ?? null,
  });
  return { total: +lines.reduce((t, l) => t + (l.unitPrice ?? 0) * l.quantity, 0).toFixed(2), lines: lines.map((l) => `${l.masterCode}x${l.quantity}`).sort() };
}

/** Same layout on any run: B24 | [panel] fridge [panel] | B36, base and cap centered. Fridge at `fridgeAlong`. */
function layout(room: RoomData, wallId: string, fridgeAlong: number, panels: "both" | "left" = "both") {
  const left = body({ uid: "b24", code: "B24", placement: "base", along: fridgeAlong - 0.5 - 0.75 - 24, w: 24, d: 24, h: 34.5 }, wallId, room);
  const right = body({ uid: "b36", code: "B36", placement: "base", along: fridgeAlong + 36 + 0.5 + 0.75, w: 36, d: 24, h: 34.5 }, wallId, room);
  return buildBay([left, right], fridgeAlong, wallId, room, panels);
}

describe("one engine: refrigerator bay parity between the 3D Designer and the Continuous Wall Builder", () => {
  const drawn = drawnRoom();
  const [wallA, wallB, wallC] = (drawn.customWalls ?? []).map((w) => w.id) as [string, string, string];

  it("builds the identical bay on a flat Wall Builder run and on the standard back wall", () => {
    const std = report(layout(standardRoom, "top", 40), standardRoom, "top");
    const wb = report(layout(drawn, wallA, 40), drawn, wallA);
    expect(wb).toEqual(std);
    expect(priceTotal(layout(drawn, wallA, 40))).toEqual(priceTotal(layout(standardRoom, "top", 40)));
  });

  it("builds the identical bay on the 45° Wall Builder run (run-relative numbers match the Designer reference)", () => {
    const std = report(layout(standardRoom, "top", 30), standardRoom, "top");
    const wb = report(layout(drawn, wallB, 30), drawn, wallB);
    expect(wb).toEqual(std);
    expect(priceTotal(layout(drawn, wallB, 30))).toEqual(priceTotal(layout(standardRoom, "top", 30)));
    // The owner's acceptance numbers.
    expect(wb.bay).toEqual({ refrigeratorWidth: 36, openingWidth: 37, leftGap: 0.5, rightGap: 0.5, bridgeCenterOffset: 0, hasLeftPanel: true, hasRightPanel: true });
    const cap = wb.parts.find((p) => p.role === "bridge")!;
    expect(cap.mountBottom).toBe(70 + REFRIGERATOR_UPPER_CLEARANCE_IN);
    expect(wb.parts.filter((p) => /panel$/.test(p.role ?? "")).map((p) => p.height)).toEqual([84, 84]);
    // Bases butt tight against the panels (≤ 1/16 in) and the countertop stops at the panels: one slab per side.
    const [b24, leftPanel, rightPanel, b36] = [wb.parts.find((p) => p.code === "B24")!, wb.parts.find((p) => p.role === "left-panel")!, wb.parts.find((p) => p.role === "right-panel")!, wb.parts.find((p) => p.code === "B36")!];
    expect(leftPanel.start - (b24.start + b24.span)).toBeLessThanOrEqual(1 / 16);
    expect(b36.start - (rightPanel.start + rightPanel.span)).toBeLessThanOrEqual(1 / 16);
    expect(wb.countertops).toHaveLength(2);
    expect(Math.max(...wb.countertops[0]!.map((pt) => pt.along))).toBeLessThanOrEqual(leftPanel.start + 0.01);
    expect(Math.min(...wb.countertops[1]!.map((pt) => pt.along))).toBeGreaterThanOrEqual(rightPanel.start + rightPanel.span - 0.01);
    expect(wb.parts.every((p) => p.insideRoom && !p.collides)).toBe(true);
  });

  it("builds the identical bay tight into the 90° corner of both tools", () => {
    // Fridge bay starting at the inside corner (panel at 0), same on the standard right wall and Wall Builder wall C.
    const stdPlaced = buildBay([body({ uid: "b36", code: "B36", placement: "base", along: 0.75 + 37 + 0.75, w: 36, d: 24, h: 34.5 }, "right", standardRoom)], 0.75 + 0.5, "right", standardRoom, "both");
    const wbPlaced = buildBay([body({ uid: "b36", code: "B36", placement: "base", along: 0.75 + 37 + 0.75, w: 36, d: 24, h: 34.5 }, wallC, drawn)], 0.75 + 0.5, wallC, drawn, "both");
    const std = report(stdPlaced, standardRoom, "right");
    const wb = report(wbPlaced, drawn, wallC);
    expect(wb).toEqual(std);
    expect(priceTotal(wbPlaced)).toEqual(priceTotal(stdPlaced));
    expect(wb.parts.find((p) => p.role === "left-panel")!.start).toBe(0);
    expect(wb.countertops).toHaveLength(1);
  });

  it("switching the popup from Both to Left rebuilds the same one-panel bay in both tools, and the bay moves as one unit", () => {
    const std = report(layout(standardRoom, "top", 40, "left"), standardRoom, "top");
    const wb = report(layout(drawn, wallB, 40, "left"), drawn, wallB);
    expect(wb).toEqual(std);
    expect(wb.bay).toMatchObject({ hasLeftPanel: true, hasRightPanel: false });

    for (const [room, wallId] of [[standardRoom, "top"], [drawn, wallB]] as const) {
      const placed = layout(room, wallId, 30).filter((p) => p.placement !== "base");
      const fridge = placed.find((p) => p.masterCode === "FRIDGE-36")!;
      const moved = commitRefrigeratorAssemblyCandidate(placed, fridge.uid, { ...fridge, ...wallPlacementAt(42, 36, 30, wallId, room) }, room)!;
      const starts = Object.fromEntries(moved.map((p) => [p.refrigeratorAssemblyRole ?? p.masterCode, +wallRunOffset(p, wallId, room).toFixed(3)]));
      expect(starts).toEqual({ "FRIDGE-36": 42, bridge: 42, "left-panel": 40.75, "right-panel": 78.5 });
    }
  });
});

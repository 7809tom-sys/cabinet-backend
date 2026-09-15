import { describe, expect, it } from "vitest";
import type { RoomData, PlacedCabinet } from "./design";
import { cabinetCollisionDetail, cabinetPlacementCollisionDetail, cabinetWallRunLength, countertopSurfaces, firstCollisionFreePeninsulaPlacement, freeSegmentsOnWall, normalizeLegacyPeninsulaCabinets, paletteActiveWallPlacement, peninsulaAutomaticStartOffset, peninsulaCountertopSurface, peninsulaRunEndpoints, peninsulaRunHitAtPoint, peninsulaRunMaxLength, peninsulaRunOffsetAtPoint, peninsulaRunStartOffsetAtPoint, removePeninsulaRun, snapWallCabinetToOwningWall, wallLength, wallPlacementAt } from "./design";
import { buildDesignCabinetCartLines } from "./designCartLines";
import { buildMaterialsListRows } from "./designMaterialsList";

const angledRoom: RoomData = {
  width: 240,
  depth: 180,
  ceilingHeight: 96,
  vertices: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 120, y: 120 },
    { id: "c", x: 240, y: 120 },
    { id: "d", x: 240, y: 180 },
    { id: "e", x: 0, y: 180 },
  ],
  customWalls: [
    { id: "diag", startVertexId: "a", endVertexId: "b", label: "Angled wall", lockedAngle: 45 },
  ],
};

const peninsulaRoom: RoomData = {
  width: 144,
  depth: 144,
  ceilingHeight: 96,
  peninsulaRuns: [{
    id: "peninsula-90-right",
    parentWall: "top",
    startOffset: 48,
    turn: 90,
    direction: "right",
    length: 96,
    height: 34.5,
    label: "Peninsula · 90° right",
  }],
};

function peninsulaCabinet(uid: string, offset: number): PlacedCabinet {
  const spot = wallPlacementAt(offset, 30, 24, "peninsula-90-right" as any, peninsulaRoom);
  return {
    uid,
    cabinetId: 2,
    masterCode: "B-30",
    description: "Peninsula base cabinet",
    placement: "base",
    x: spot.x,
    y: spot.y,
    width: 30,
    depth: 24,
    height: 34.5,
    rotation: spot.rotation,
    wallId: spot.wallId,
    wallOffset: spot.wallOffset,
  };
}

function angledCabinet(uid: string, offset: number, placement: "base" | "wall" = "base"): PlacedCabinet {
  const width = 36;
  const depth = placement === "wall" ? 12 : 24;
  const spot = wallPlacementAt(offset, width, depth, "diag" as any, angledRoom);
  return {
    uid,
    cabinetId: 1,
    masterCode: placement === "wall" ? "W-36-30" : "B-36",
    description: "Angled run cabinet",
    placement,
    x: spot.x,
    y: spot.y,
    width,
    depth,
    height: placement === "wall" ? 30 : 34.5,
    rotation: spot.rotation,
    wallId: spot.wallId,
    wallOffset: spot.wallOffset,
  };
}

describe("locked 45-degree cabinet wall placement", () => {
  it("places base and wall cabinets with the exact locked rotation and wall identity", () => {
    const base = angledCabinet("base", 0, "base");
    const wall = angledCabinet("wall", 0, "wall");
    expect(base).toMatchObject({ rotation: 45, wallId: "diag", wallOffset: 0 });
    expect(wall).toMatchObject({ rotation: 45, wallId: "diag", wallOffset: 0 });
  });

  it("allows edge-to-edge angled cabinets and rejects a real along-run overlap", () => {
    const first = angledCabinet("one", 0);
    const butted = angledCabinet("two", 36);
    const overlap = angledCabinet("three", 35);
    expect(cabinetCollisionDetail(butted, [first])).toBeNull();
    expect(cabinetCollisionDetail(overlap, [first])?.penetration).toBeCloseTo(1);
  });

  it("releases an exact void after removal so the same cabinet can be returned", () => {
    const first = angledCabinet("one", 0);
    const second = angledCabinet("two", 36);
    const withRun = freeSegmentsOnWall("diag" as any, angledRoom, [first, second], [], 0.5, 0, "base");
    expect(withRun.some((segment) => segment.start === 36 && segment.length >= 36)).toBe(false);

    const afterRemoval = freeSegmentsOnWall("diag" as any, angledRoom, [first], [], 0.5, 0, "base");
    const releasedVoid = afterRemoval.find((segment) => segment.start <= 36 && segment.start + segment.length >= 72);
    expect(releasedVoid).toBeDefined();
    expect(releasedVoid!.length).toBeGreaterThanOrEqual(36);
  });

  it("keeps an angled cabinet in the same price and materials workflow as a straight cabinet", () => {
    const base = angledCabinet("priced-angle", 0);
    const lines = buildDesignCabinetCartLines({
      placed: [base],
      styleId: 77,
      distributorId: 11,
      tier: "homeowner",
      styleNameById: new Map([[77, "Test finish"]]),
      unitPriceFor: () => 250,
    });
    expect(lines).toEqual([expect.objectContaining({ masterCode: "B-36", qty: 1, unitPrice: 250 })]);
    expect(buildMaterialsListRows({ buildRows: [], pricingLines: lines })).toEqual([
      expect.objectContaining({ code: "B-36", qty: 1, unitPrice: 250, section: "cabinet" }),
    ]);
  });
});

describe("parent-wall termination at a peninsula attachment", () => {
  it("keeps the full room span for attachment editing but ends the top cabinet wall at the primary peninsula start", () => {
    expect(wallLength("top", peninsulaRoom)).toBe(144);
    expect(cabinetWallRunLength("top", peninsulaRoom)).toBe(48);
    expect(freeSegmentsOnWall("top", peninsulaRoom, [], [], 0.5, 0, "base")).toEqual([{ start: 0, length: 48 }]);
  });

  it("clamps new top-wall cabinets inside the retained parent-wall segment instead of placing them in the open continuation", () => {
    const spot = wallPlacementAt(96, 30, 24, "top", peninsulaRoom);
    expect(spot).toMatchObject({ x: 18, y: 0, rotation: 0 });
  });

  it("retains the full parent wall when a primary run explicitly keeps it", () => {
    const retained: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: peninsulaRoom.peninsulaRuns?.map((run) => ({ ...run, terminatesParentWall: false })),
    };
    expect(cabinetWallRunLength("top", retained)).toBe(144);
  });
});

describe("cabinet-supported peninsula runs", () => {
  it("anchors a 90-degree continuation at the measured parent-wall split point", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    expect(peninsulaRunEndpoints(run, peninsulaRoom)).toMatchObject({
      start: { x: 48, y: 0 },
      end: { x: 48, y: 96 },
    });
    expect(wallLength(run.id as any, peninsulaRoom)).toBe(96);
    expect(wallPlacementAt(0, 30, 24, run.id as any, peninsulaRoom)).toMatchObject({
      rotation: 90,
      wallId: run.id,
      wallOffset: 0,
    });
  });

  it("moves a joined peninsula endpoint only along its adjoining parent wall", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    expect(peninsulaRunStartOffsetAtPoint(run, peninsulaRoom, { x: 84.125, y: 36 })).toBe(84.125);
    expect(peninsulaRunStartOffsetAtPoint(run, peninsulaRoom, { x: -20, y: 36 })).toBe(0);
    expect(peninsulaRunStartOffsetAtPoint(run, peninsulaRoom, { x: 200, y: 36 })).toBe(138);
  });

  it("seats a cabinet back against either selected face of a two-sided peninsula", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    const left = wallPlacementAt(0, 30, 24, run.id as any, peninsulaRoom, "left");
    const right = wallPlacementAt(0, 30, 24, run.id as any, peninsulaRoom, "right");
    expect(left).toMatchObject({ x: 24, y: 0, rotation: 90, wallId: run.id, peninsulaSide: "left" });
    expect(right).toMatchObject({ x: 48, y: 0, rotation: 270, wallId: run.id, peninsulaSide: "right" });

    const rightDefaultRoom: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{ ...run, cabinetSide: "right" }],
    };
    expect(wallPlacementAt(0, 30, 24, run.id as any, rightDefaultRoom)).toMatchObject({ rotation: 270, peninsulaSide: "right" });
  });

  it("keeps exact 45-degree left and right continuations inside the room and bounds their pull", () => {
    const parent = { ...peninsulaRoom.peninsulaRuns![0], startOffset: 72, length: 36 };
    const right45 = { id: "right-45-end", parentRunId: parent.id, startOffset: 0, turn: 45 as const, direction: "right" as const, length: 36, height: 34.5 };
    const left45 = { ...right45, id: "left-45-end", direction: "left" as const };
    const rightRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, right45] };
    const leftRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, left45] };
    expect(peninsulaRunEndpoints(right45, rightRoom).end).toEqual({ x: 46.5, y: 61.5 });
    expect(peninsulaRunEndpoints(left45, leftRoom).end).toEqual({ x: 97.5, y: 61.5 });
    expect(peninsulaRunMaxLength(right45, rightRoom)).toBeLessThanOrEqual(102);
    expect(peninsulaRunMaxLength(left45, leftRoom)).toBeLessThanOrEqual(102);
  });

  it("anchors a connected return at its parent peninsula endpoint with a locked turn", () => {
    const parent = peninsulaRoom.peninsulaRuns![0];
    const returnRun = {
      id: "peninsula-return",
      parentRunId: parent.id,
      startOffset: 0,
      turn: 90 as const,
      direction: "right" as const,
      length: 42,
      height: 34.5,
      label: "Peninsula return",
    };
    const connectedRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, returnRun] };
    expect(peninsulaRunEndpoints(returnRun, connectedRoom)).toMatchObject({
      start: { x: 48, y: 96 },
      end: { x: 6, y: 96 },
    });
    expect(wallPlacementAt(0, 30, 24, returnRun.id as any, connectedRoom)).toMatchObject({
      wallId: returnRun.id,
      wallOffset: 0,
      rotation: 180,
    });
    expect(wallPlacementAt(0, 30, 24, returnRun.id as any, connectedRoom, "right")).toMatchObject({
      wallId: returnRun.id,
      peninsulaSide: "right",
      rotation: 0,
    });
    expect(peninsulaRunHitAtPoint(connectedRoom, { x: 20, y: 96 }, 8)).toMatchObject({ run: { id: returnRun.id } });
  });

  it("keeps a straight primary peninsula and its optional 45-degree end on one connected cabinet and countertop path", () => {
    const primary = {
      id: "wizard-straight-primary",
      parentWall: "top" as const,
      startOffset: 48,
      turn: 90 as const,
      direction: "right" as const,
      length: 72,
      height: 34.5,
      cabinetSide: "left" as const,
      countertopSeatingOverhang: 12 as const,
      label: "Peninsula · straight",
    };
    const angledEnd = {
      id: "wizard-angled-end",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 45 as const,
      direction: "right" as const,
      length: 36,
      height: 34.5,
      cabinetSide: "left" as const,
      countertopSeatingOverhang: 12 as const,
      label: "Peninsula end · 45° right",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, angledEnd] };
    expect(peninsulaRunEndpoints(primary, room)).toMatchObject({
      start: { x: 48, y: 0 },
      end: { x: 48, y: 72 },
    });
    expect(peninsulaRunEndpoints(angledEnd, room)).toMatchObject({
      start: { x: 48, y: 72 },
      end: { x: 22.5, y: 97.5 },
    });
    const primarySpot = wallPlacementAt(0, 30, 24, primary.id as any, room, "left");
    const endSpot = wallPlacementAt(0, 24, 24, angledEnd.id as any, room, "left");
    const primaryCabinet = { ...peninsulaCabinet("wizard-primary-cabinet", 0), ...primarySpot, wallId: primary.id, wallOffset: 0 };
    const endCabinet = { ...peninsulaCabinet("wizard-end-cabinet", 0), ...endSpot, wallId: angledEnd.id, wallOffset: 0, width: 24 };
    expect(countertopSurfaces([primaryCabinet, endCabinet], room)).toEqual(expect.arrayContaining([
      expect.objectContaining({ peninsulaRunId: primary.id, linearInches: 72, rotation: 90 }),
      expect.objectContaining({ peninsulaRunId: angledEnd.id, linearInches: 36, rotation: 135 }),
    ]));
  });

  it("treats a legacy direct-45 primary peninsula as a straight first leg instead of a diamond cabinet path", () => {
    const legacyPrimary: PeninsulaRun = {
      id: "legacy-direct-45",
      parentWall: "left",
      startOffset: 48,
      turn: 45,
      direction: "right",
      length: 48,
      height: 34.5,
      label: "Peninsula · 45° right",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [legacyPrimary] };
    expect(peninsulaRunEndpoints(legacyPrimary, room)).toMatchObject({
      start: { x: 0, y: 48 },
      end: { x: 48, y: 48 },
    });
    expect(wallPlacementAt(0, 18, 24, legacyPrimary.id as any, room, "left")).toMatchObject({
      wallId: legacyPrimary.id,
      wallOffset: 0,
      rotation: 0,
    });
    const savedDiamond = {
      ...peninsulaCabinet("legacy-diamond-b18", 0),
      wallId: legacyPrimary.id,
      wallOffset: 0,
      rotation: 45,
      x: 18,
      y: 48,
    };
    const normalized = normalizeLegacyPeninsulaCabinets([savedDiamond], room);
    expect(normalized[0]).toMatchObject({
      wallId: legacyPrimary.id,
      wallOffset: 0,
      rotation: 0,
    });
  });

  it("uses the selected primary-run side rather than a stale cabinet-side value when reseating a legacy cabinet", () => {
    const legacyPrimary: PeninsulaRun = {
      id: "legacy-side-authority",
      parentWall: "left",
      startOffset: 48,
      turn: 45,
      direction: "right",
      length: 48,
      height: 34.5,
      cabinetSide: "left",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [legacyPrimary] };
    const staleRightSide = {
      ...peninsulaCabinet("legacy-right-side-b18", 0),
      wallId: legacyPrimary.id,
      wallOffset: 0,
      peninsulaSide: "right" as const,
      rotation: 45,
    };
    const normalized = normalizeLegacyPeninsulaCabinets([staleRightSide], room);
    expect(normalized[0].peninsulaSide).toBe("left");
    expect(normalized[0]).toMatchObject(wallPlacementAt(0, 18, 24, legacyPrimary.id as any, room, "left"));
  });

  it("keeps an exact-width Wizard filler inside its measured peninsula void instead of searching another run location", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    const spot = firstCollisionFreePeninsulaPlacement(
      run.id as any,
      peninsulaRoom,
      [],
      30,
      24,
      "base",
      { start: 0, end: 0 },
    );
    expect(spot).toMatchObject({ wallId: run.id, wallOffset: 0 });
  });

  it("projects a catalog drop onto the active peninsula run rather than an outside room wall", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    expect(peninsulaRunOffsetAtPoint(run, peninsulaRoom, { x: 48, y: 63 })).toBe(63);
    expect(peninsulaRunOffsetAtPoint(run, peninsulaRoom, { x: 48, y: 220 })).toBe(96);
  });

  it("recovers unambiguous legacy peninsula ownership before measuring the next edge-to-edge opening", () => {
    const legacy = { ...peninsulaCabinet("legacy-ber33", 30), wallId: undefined, wallOffset: undefined };
    const normalized = normalizeLegacyPeninsulaCabinets([legacy], peninsulaRoom);
    expect(normalized[0]).toMatchObject({ wallId: "peninsula-90-right", wallOffset: 30, peninsulaSide: "left", rotation: 90 });
    const next = wallPlacementAt(0, 30, 24, "peninsula-90-right" as any, peninsulaRoom);
    const candidate = { ...peninsulaCabinet("new-b12", 0), ...next, wallId: next.wallId, wallOffset: next.wallOffset };
    expect(cabinetCollisionDetail(candidate, normalized)).toBeNull();
    expect(freeSegmentsOnWall("peninsula-90-right" as any, peninsulaRoom, normalized, [], 0.5, 0, "base")).toContainEqual({ start: 0, length: 30 });
  });

  it("recovers a legacy peninsula cabinet that still carries its original parent-wall owner", () => {
    const staleParentWallOwner = { ...peninsulaCabinet("legacy-parent-wall-ber33", 30), wallId: "top", wallOffset: undefined };
    const normalized = normalizeLegacyPeninsulaCabinets([staleParentWallOwner], peninsulaRoom);
    expect(normalized[0]).toMatchObject({ wallId: "peninsula-90-right", wallOffset: 30, peninsulaSide: "left", rotation: 90 });
    const opening = freeSegmentsOnWall("peninsula-90-right" as any, peninsulaRoom, normalized, [], 0.5, 0, "base");
    expect(opening).toContainEqual({ start: 0, length: 30 });
  });

  it("repairs a parent-wall peninsula cabinet whose saved rotation is still the old perimeter-wall rotation", () => {
    const staleRotation = { ...peninsulaCabinet("legacy-stale-rotation-ber33", 30), wallId: "top", wallOffset: undefined, rotation: 0 };
    const normalized = normalizeLegacyPeninsulaCabinets([staleRotation], peninsulaRoom);
    expect(normalized[0]).toMatchObject({ wallId: "peninsula-90-right", wallOffset: 30, peninsulaSide: "left", rotation: 90 });
    const next = wallPlacementAt(0, 30, 24, "peninsula-90-right" as any, peninsulaRoom);
    const candidate = { ...peninsulaCabinet("new-b12-after-stale-ber33", 0), ...next, wallId: next.wallId, wallOffset: next.wallOffset };
    expect(cabinetCollisionDetail(candidate, normalized)).toBeNull();
    expect(paletteActiveWallPlacement("peninsula-90-right" as any, peninsulaRoom, normalized, [], 30, 24, "base")).toMatchObject({
      wallId: "peninsula-90-right",
      wallOffset: 0,
      rotation: 90,
    });
  });

  it("allows 3-DB15 to begin on a 45-degree peninsula beside BER33 when only the L-corner screen box overlaps", () => {
    const fortyFiveRoom: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{
        id: "peninsula-45-join",
        parentWall: "top",
        startOffset: 36,
        turn: 45,
        direction: "left",
        length: 72,
        height: 34.5,
      }],
    };
    const ber33: PlacedCabinet = {
      uid: "ber33-parent-wall",
      cabinetId: 8,
      masterCode: "BER33",
      description: "Easy Reach Corner Base",
      placement: "base",
      x: 0,
      y: 0,
      width: 33,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "top",
    };
    const drawerBase: PlacedCabinet = {
      uid: "3-db15-peninsula",
      cabinetId: 9,
      masterCode: "3-DB15",
      description: "15 inch 3 Drawer Base",
      placement: "base",
      // The 45° body touches the BER legs at a point, while its axis-aligned
      // screen envelope overlaps the BER's 36-inch bounding square by 12 inches.
      x: 24,
      y: 24,
      width: 15,
      depth: 24,
      height: 34.5,
      rotation: 45,
      wallId: "peninsula-45-join",
      wallOffset: 0,
      peninsulaSide: "left",
    };
    expect(cabinetCollisionDetail(drawerBase, [ber33])).toMatchObject({ cabinet: ber33 });
    expect(cabinetPlacementCollisionDetail(drawerBase, [ber33], fortyFiveRoom)).toBeNull();
    const trulyOverlappingDrawer = { ...drawerBase, x: 20, y: 20 };
    expect(cabinetPlacementCollisionDetail(trulyOverlappingDrawer, [ber33], fortyFiveRoom)).toMatchObject({ cabinet: ber33 });
  });

  it("automatically starts the first 45-degree peninsula cabinet after a parent-wall corner's true body clearance", () => {
    const fortyFiveRoom: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{
        id: "peninsula-45-clearance",
        parentWall: "top",
        startOffset: 36,
        turn: 45,
        direction: "left",
        length: 72,
        height: 34.5,
      }],
    };
    const ber33: PlacedCabinet = {
      uid: "ber33-parent-wall-clearance",
      cabinetId: 8,
      masterCode: "BER33",
      description: "Easy Reach Corner Base",
      placement: "base",
      x: 0,
      y: 0,
      width: 33,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "top",
    };
    const normalized = normalizeLegacyPeninsulaCabinets([ber33], fortyFiveRoom);
    expect(normalized[0]).toMatchObject({ wallId: "top", rotation: 0 });
    const start = peninsulaAutomaticStartOffset("peninsula-45-clearance" as any, fortyFiveRoom, normalized, 15, 24, "base");
    const spot = paletteActiveWallPlacement("peninsula-45-clearance" as any, fortyFiveRoom, normalized, [], 15, 24, "base");
    expect(start).toBeGreaterThan(0);
    expect(spot).toMatchObject({ wallId: "peninsula-45-clearance", wallOffset: start });
    const candidate = {
      ...ber33,
      uid: "3-db15-after-ber33-clearance",
      cabinetId: 9,
      masterCode: "3-DB15",
      description: "15 inch 3 Drawer Base",
      width: 15,
      ...spot,
    };
    expect(cabinetPlacementCollisionDetail(candidate, normalized, fortyFiveRoom)).toBeNull();
  });

  it("uses the first physically clear peninsula location when a parent-wall B-24 blocks the join", () => {
    const fortyFiveRoom: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{
        id: "peninsula-45-b24-clearance",
        parentWall: "top",
        startOffset: 72,
        turn: 45,
        direction: "right",
        length: 72,
        height: 34.5,
      }],
    };
    const joinSpot = wallPlacementAt(0, 24, 24, "peninsula-45-b24-clearance" as any, fortyFiveRoom);
    const b24: PlacedCabinet = {
      uid: "b24-parent-wall-join",
      cabinetId: 10,
      masterCode: "B-24",
      description: "24 inch Base Cabinet",
      placement: "base",
      x: joinSpot.x,
      y: joinSpot.y,
      width: 24,
      depth: 24,
      height: 34.5,
      rotation: joinSpot.rotation,
      wallId: "top",
    };
    const firstClear = firstCollisionFreePeninsulaPlacement("peninsula-45-b24-clearance" as any, fortyFiveRoom, [b24], 15, 24, "base");
    const oneClick = paletteActiveWallPlacement("peninsula-45-b24-clearance" as any, fortyFiveRoom, [b24], [], 15, 24, "base");
    expect(firstClear).toMatchObject({ wallId: "peninsula-45-b24-clearance" });
    expect(firstClear!.wallOffset).toBeGreaterThan(0);
    expect(oneClick).toEqual(firstClear);
    const candidate: PlacedCabinet = {
      ...b24,
      uid: "3-db15-after-b24",
      cabinetId: 11,
      masterCode: "3-DB15",
      description: "15 inch 3 Drawer Base",
      width: 15,
      ...firstClear!,
    };
    expect(cabinetPlacementCollisionDetail(candidate, [b24], fortyFiveRoom)).toBeNull();
  });

  it("uses the visible peninsula line as the direct drop target and never reseats an owned upper on an outer wall", () => {
    const hit = peninsulaRunHitAtPoint(peninsulaRoom, { x: 49, y: 60 }, 12);
    expect(hit).toMatchObject({ run: { id: "peninsula-90-right" }, offset: 60 });
    const spot = wallPlacementAt(hit!.offset, 30, 12, hit!.run.id as any, peninsulaRoom);
    const upper: PlacedCabinet = {
      uid: "peninsula-upper",
      cabinetId: 3,
      masterCode: "W-30-30",
      description: "Peninsula upper",
      placement: "wall",
      x: spot.x,
      y: spot.y,
      width: 30,
      depth: 12,
      height: 30,
      rotation: spot.rotation,
      wallId: spot.wallId,
      wallOffset: spot.wallOffset,
    };
    expect(snapWallCabinetToOwningWall(upper, peninsulaRoom)).toEqual(upper);
  });

  it("keeps a peninsula run empty until cabinets are placed, then reopens an exact removed void", () => {
    const first = peninsulaCabinet("pen-one", 0);
    const second = peninsulaCabinet("pen-two", 30);
    expect(cabinetCollisionDetail(second, [first])).toBeNull();
    const occupied = freeSegmentsOnWall("peninsula-90-right" as any, peninsulaRoom, [first, second], [], 0.5, 0, "base");
    expect(occupied.some((segment) => segment.start <= 30 && segment.start + segment.length >= 60)).toBe(false);
    const released = freeSegmentsOnWall("peninsula-90-right" as any, peninsulaRoom, [first], [], 0.5, 0, "base");
    expect(released.some((segment) => segment.start <= 30 && segment.start + segment.length >= 60)).toBe(true);
  });

  it("keeps peninsula base cabinets in normal counter, price, and materials workflows", () => {
    const base = peninsulaCabinet("pen-priced", 0);
    expect(countertopSurfaces([base], peninsulaRoom)).toEqual([
      expect.objectContaining({ kind: "base", rotation: 90, peninsulaRunId: "peninsula-90-right", linearInches: 96 }),
    ]);
    const lines = buildDesignCabinetCartLines({
      placed: [base],
      styleId: 77,
      distributorId: 11,
      tier: "homeowner",
      styleNameById: new Map([[77, "Test finish"]]),
      unitPriceFor: () => 250,
    });
    expect(lines).toEqual([expect.objectContaining({ masterCode: "B-30", qty: 1, unitPrice: 250 })]);
    expect(buildMaterialsListRows({ buildRows: [], pricingLines: lines })).toEqual([
      expect.objectContaining({ code: "B-30", qty: 1, section: "cabinet" }),
    ]);
  });

  it("bridges a supported peninsula void and extends the selected cabinet face for seating", () => {
    const start = peninsulaCabinet("peninsula-start", 0);
    const end = peninsulaCabinet("peninsula-end", 66);
    const withSeating: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{ ...peninsulaRoom.peninsulaRuns![0], countertopSeatingOverhang: 12, countertopWaterfallEnd: true }],
    };
    const surface = countertopSurfaces([start, end], withSeating).find((item) => item.peninsulaRunId === "peninsula-90-right");
    expect(surface).toMatchObject({ linearInches: 96, areaInches: 96 * 37.5, rotation: 90 });
    expect(surface).toEqual(peninsulaCountertopSurface(withSeating.peninsulaRuns![0], withSeating));
    expect(surface).toMatchObject({ width: 96, depth: 37.5 });
    const placement = wallPlacementAt(0, 96, 37.5, "peninsula-90-right" as any, withSeating, "left");
    const expectedCenter = { x: placement.x + 37.5 / 2, y: placement.y + 96 / 2 };
    expect(surface!.x + surface!.width / 2).toBeCloseTo(expectedCenter.x, 6);
    expect(surface!.y + surface!.depth / 2).toBeCloseTo(expectedCenter.y, 6);
    expect(countertopSurfaces([], withSeating)).toEqual([]);
  });

  it("gives each cabinet-supported connected run its own continuous countertop without inventing one for an empty return", () => {
    const parent = peninsulaRoom.peninsulaRuns![0];
    const child = { id: "return-with-counter", parentRunId: parent.id, startOffset: 0, turn: 90 as const, direction: "right" as const, length: 42, height: 34.5 };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, child] };
    const parentSpot = wallPlacementAt(66, 30, 24, parent.id as any, room);
    const childSpot = wallPlacementAt(0, 30, 24, child.id as any, room);
    const parentCabinet = { ...peninsulaCabinet("parent-joint", 66), ...parentSpot, wallOffset: 66, wallId: parent.id };
    const childCabinet = { ...peninsulaCabinet("child-joint", 0), ...childSpot, wallOffset: 0, wallId: child.id };
    expect(countertopSurfaces([parentCabinet], room)).toEqual([expect.objectContaining({ peninsulaRunId: parent.id })]);
    expect(countertopSurfaces([parentCabinet, childCabinet], room)).toEqual(expect.arrayContaining([
      expect.objectContaining({ peninsulaRunId: parent.id }),
      expect.objectContaining({ peninsulaRunId: child.id }),
    ]));
  });

  it("retains continuous countertop coverage on a straight peninsula with a locked 45-degree end", () => {
    const parent = { ...peninsulaRoom.peninsulaRuns![0], id: "angled-parent", startOffset: 72, length: 36 };
    const child = { id: "angled-return", parentRunId: parent.id, startOffset: 0, turn: 45 as const, direction: "left" as const, length: 30, height: 34.5 };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, child] };
    const parentSpot = wallPlacementAt(6, 30, 24, parent.id as any, room);
    const childSpot = wallPlacementAt(0, 30, 24, child.id as any, room);
    const parentCabinet = { ...peninsulaCabinet("angled-parent-joint", 6), ...parentSpot, wallOffset: 6, wallId: parent.id };
    const childCabinet = { ...peninsulaCabinet("angled-child-joint", 0), ...childSpot, wallOffset: 0, wallId: child.id };
    expect(countertopSurfaces([parentCabinet, childCabinet], room)).toEqual(expect.arrayContaining([
      expect.objectContaining({ peninsulaRunId: parent.id, linearInches: 36, rotation: 90 }),
      expect.objectContaining({ peninsulaRunId: child.id, linearInches: 30, rotation: 45 }),
    ]));
  });

  it("deletes only the selected peninsula and its owned cabinets, clearing derived counter, price, and materials entries", () => {
    const owned = peninsulaCabinet("delete-peninsula", 0);
    const removed = removePeninsulaRun(peninsulaRoom, [owned], "peninsula-90-right");
    expect(removed.room.peninsulaRuns).toEqual([]);
    expect(removed.placed).toEqual([]);
    expect(removed.removedCabinetUids).toEqual(["delete-peninsula"]);
    expect(countertopSurfaces(removed.placed, removed.room)).toEqual([]);
    const lines = buildDesignCabinetCartLines({
      placed: removed.placed,
      styleId: 77,
      distributorId: 11,
      tier: "homeowner",
      styleNameById: new Map([[77, "Test finish"]]),
      unitPriceFor: () => 250,
    });
    expect(lines).toEqual([]);
    expect(buildMaterialsListRows({ buildRows: [], pricingLines: lines })).toEqual([]);
  });

  it("removes a selected return and its descendants without touching its parent run", () => {
    const parent = peninsulaRoom.peninsulaRuns![0];
    const child = { id: "return", parentRunId: parent.id, startOffset: 0, turn: 90 as const, direction: "left" as const, length: 24, height: 34.5 };
    const grandchild = { id: "return-two", parentRunId: child.id, startOffset: 0, turn: 90 as const, direction: "right" as const, length: 24, height: 34.5 };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, child, grandchild] };
    const parentCabinet = peninsulaCabinet("parent-cabinet", 0);
    const childCabinet = { ...peninsulaCabinet("return-cabinet", 0), wallId: child.id };
    const grandchildCabinet = { ...peninsulaCabinet("return-two-cabinet", 0), wallId: grandchild.id };
    const removed = removePeninsulaRun(room, [parentCabinet, childCabinet, grandchildCabinet], child.id);
    expect(removed.room.peninsulaRuns).toEqual([parent]);
    expect(removed.placed.map((cabinet) => cabinet.uid)).toEqual(["parent-cabinet"]);
  });
});

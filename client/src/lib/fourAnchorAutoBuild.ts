import { STD, isCornerCabinet, isSinkBaseCabinet, wallRunFrame, type RoomData, type WallRunFrame } from "./design";
import { baseSubGroup, cabinetDrawingType, type CabinetLike } from "./cabinetGraphics";

export type FourAnchorKind = "sink" | "stove" | "dishwasher" | "refrigerator";
export type FourAnchorLayoutType = "galley" | "l-shape" | "u-shape" | "single-wall";
export type FourAnchorOriginCorner = "left" | "right";
export type FourAnchorRunDirection = "left" | "right";
export type WallLabel = "Wall 1" | "Wall 2" | "Wall 3" | "Wall 4";
export type DishwasherSide = "left" | "right";
export type RefrigeratorPanelChoice = "none" | "left" | "right" | "both";
export type RefrigeratorEnclosureChoice = "none" | "cabinet-above";
export type AnchorRunReservation = { start: number; end: number };

/** Minimal source-catalog data used to constrain generated straight wall runs. */
export type AutoBuildCatalogCandidate = CabinetLike & {
  masterCode: string;
  description?: string | null;
  subCategory?: string | null;
  placement: string;
  isCornerCabinet?: boolean | null;
};

export type FourAnchorMeasurement = {
  wallLabel: WallLabel;
  /** Distance in inches from the selected wall's labeled starting corner to the anchor center. */
  centerOffsetIn: number;
};

export type AutoBuildWallRef = {
  label: WallLabel;
  engineWallId: string;
  frame: WallRunFrame;
  /** Which physical endpoint is the user's measurement datum. */
  startCorner: "start" | "end";
};

export type FourAnchorInputs = {
  layoutType: FourAnchorLayoutType;
  originCorner: FourAnchorOriginCorner;
  runDirection: FourAnchorRunDirection;
  /** Height selected for source-priced wall cabinets in the generated kitchen. */
  wallCabinetHeightIn?: 30 | 36 | 42;
  sink: FourAnchorMeasurement;
  /** Exact source-sized sink base requested by the admin (SB30/SB33/SB36/SB42). */
  sinkBaseWidthIn?: 30 | 33 | 36 | 42;
  stove: FourAnchorMeasurement;
  /** Optional exact dishwasher center. Null means seat it against the sink. */
  dishwasher?: FourAnchorMeasurement | null;
  /** Used only when no exact dishwasher center is entered. */
  dishwasherSide?: DishwasherSide;
  refrigerator: FourAnchorMeasurement;
  refrigeratorWidthIn?: 30 | 33 | 36 | 42;
  refrigeratorPanels?: RefrigeratorPanelChoice;
  refrigeratorEnclosure?: RefrigeratorEnclosureChoice;
  sinkWindowCenter?: FourAnchorMeasurement | null;
};

export type FourAnchorPlacement = FourAnchorMeasurement & {
  kind: FourAnchorKind;
  source: "measured" | "adjacent-to-sink" | "sink-window-centered";
  dishwasherSide?: DishwasherSide;
};

export type FourAnchorBuildPlan = {
  layoutType: FourAnchorLayoutType;
  originCorner: FourAnchorOriginCorner;
  runDirection: FourAnchorRunDirection;
  anchors: FourAnchorPlacement[];
  surroundingRules: readonly ["fillers", "blind corners", "molding", "substitution"];
};

export type FourAnchorBuildResult =
  | { ok: true; plan: FourAnchorBuildPlan }
  | { ok: false; missing: FourAnchorKind[] };

const STANDARD_WALL_ORDER: Record<FourAnchorOriginCorner, Record<FourAnchorRunDirection, string[]>> = {
  left: {
    right: ["top", "right", "bottom", "left"],
    left: ["top", "left", "bottom", "right"],
  },
  right: {
    left: ["top", "left", "bottom", "right"],
    right: ["top", "right", "bottom", "left"],
  },
};

function orderedEngineWallIds(
  room: RoomData,
  originCorner: FourAnchorOriginCorner,
  runDirection: FourAnchorRunDirection,
): string[] {
  const customIds = room.customWalls?.map((wall) => wall.id) ?? [];
  if (customIds.length > 0) {
    const ids = customIds.slice(0, 4);
    return runDirection === "left" ? [...ids].reverse() : ids;
  }
  return STANDARD_WALL_ORDER[originCorner][runDirection];
}

/**
 * Resolves the UI-only Wall 1–4 label to the existing placement engine wall.
 * No placement coordinates are produced here; callers must use the returned
 * frame and wall id with wallPlacementAt().
 */
export function wallLabelToEngineWallId(
  label: WallLabel,
  room: RoomData,
  originCorner: FourAnchorOriginCorner,
  runDirection: FourAnchorRunDirection,
): AutoBuildWallRef | null {
  const index = Number(label.replace("Wall ", "")) - 1;
  if (index < 0 || index > 3) return null;
  const engineWallId = orderedEngineWallIds(room, originCorner, runDirection)[index];
  if (!engineWallId) return null;
  const frame = wallRunFrame(engineWallId, room);
  if (!frame) return null;

  // The standard frame direction is physical start -> end. The label's datum
  // follows the selected traversal, so reverse traversal measures from frame.end.
  const startCorner = runDirection === "right" ? "start" : "end";
  return { label, engineWallId, frame, startCorner };
}

export function buildWallLabelMap(
  room: RoomData,
  originCorner: FourAnchorOriginCorner,
  runDirection: FourAnchorRunDirection,
): Record<WallLabel, AutoBuildWallRef | null> {
  return {
    "Wall 1": wallLabelToEngineWallId("Wall 1", room, originCorner, runDirection),
    "Wall 2": wallLabelToEngineWallId("Wall 2", room, originCorner, runDirection),
    "Wall 3": wallLabelToEngineWallId("Wall 3", room, originCorner, runDirection),
    "Wall 4": wallLabelToEngineWallId("Wall 4", room, originCorner, runDirection),
  };
}

/** Convert a center measurement to the placement engine's along-wall start. */
export function anchorAlongStartIn(measurement: FourAnchorMeasurement, cabinetWidthIn: number, wall: AutoBuildWallRef): number {
  const fromPhysicalStart = wall.startCorner === "start"
    ? measurement.centerOffsetIn
    : wall.frame.length - measurement.centerOffsetIn;
  return fromPhysicalStart - cabinetWidthIn / 2;
}

/**
 * Returns the wall-relative center for a dishwasher that butts the selected
 * side of a sink base. The caller still validates the resulting center against
 * the actual selected wall; this helper never clamps or relocates it.
 */
export function adjacentDishwasherCenterIn(
  sinkCenterIn: number,
  sinkWidthIn: number,
  dishwasherWidthIn: number,
  side: DishwasherSide,
): number {
  const offset = (sinkWidthIn + dishwasherWidthIn) / 2;
  return sinkCenterIn + (side === "right" ? offset : -offset);
}

/**
 * The Sink base selector means a straight SB box on the selected wall—not a
 * CSB/DCSB or any other corner sink SKU that happens to share its nominal width.
 */
export function isAutoBuildStraightSinkBaseCandidate(candidate: AutoBuildCatalogCandidate): boolean {
  return candidate.placement === "base"
    && candidate.isCornerCabinet !== true
    && !isCornerCabinet(candidate.masterCode, candidate.description ?? undefined)
    && isSinkBaseCabinet(candidate);
}

/**
 * Four-anchor surrounding fill is deliberately straight-run only. Corner boxes
 * belong to a physical room vertex and must be selected through the normal
 * corner workflow; an auto-build must never place or substitute one mid-run.
 */
export function autoBuildStraightBaseCatalog<T extends AutoBuildCatalogCandidate>(catalog: readonly T[]): T[] {
  return catalog.filter((candidate) => (
    candidate.placement === "base"
    && candidate.isCornerCabinet !== true
    && !isCornerCabinet(candidate.masterCode, candidate.description ?? undefined)
    && !isSinkBaseCabinet(candidate)
    // A standard door base may have a top drawer. All-drawer, full-height,
    // pull-out, appliance, vanity and other specialty boxes require an explicit
    // design choice and are never a substitute for an ordinary base run.
    && baseSubGroup(candidate) === "base"
    && cabinetDrawingType(candidate) === "standard-door"
  ));
}

/** Remove measured refrigerator openings/panel spans from otherwise free wall segments. */
export function subtractAnchorRunReservations(
  segments: ReadonlyArray<{ start: number; length: number }>,
  reservations: ReadonlyArray<AnchorRunReservation>,
): Array<{ start: number; length: number }> {
  const normalized = reservations
    .filter((reservation) => Number.isFinite(reservation.start) && Number.isFinite(reservation.end) && reservation.end > reservation.start)
    .sort((a, b) => a.start - b.start);
  const result: Array<{ start: number; length: number }> = [];
  for (const segment of segments) {
    const end = segment.start + segment.length;
    let cursor = segment.start;
    for (const reservation of normalized) {
      if (reservation.end <= cursor || reservation.start >= end) continue;
      const beforeEnd = Math.min(end, Math.max(cursor, reservation.start));
      if (beforeEnd > cursor) result.push({ start: cursor, length: beforeEnd - cursor });
      cursor = Math.max(cursor, Math.min(end, reservation.end));
      if (cursor >= end) break;
    }
    if (cursor < end) result.push({ start: cursor, length: end - cursor });
  }
  return result.filter((segment) => segment.length > 0.01);
}

/**
 * A straight base cabinet cannot occupy the inside depth of a room corner when
 * another auto-build anchor owns the adjoining wall. The builder leaves that
 * area open rather than silently choosing a corner SKU or creating a cabinet
 * body behind a sink, range, dishwasher, or refrigerator. A real corner box
 * remains a deliberate catalog selection through the normal placement engine.
 */
export function autoBuildSelectedWallCornerReservations(
  targetWallId: string,
  room: RoomData,
  selectedWallIds: readonly string[],
  depthIn = STD.BASE_DEPTH,
): AnchorRunReservation[] {
  const target = wallRunFrame(targetWallId, room);
  if (!target || depthIn <= 0 || !selectedWallIds.includes(targetWallId)) return [];
  const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y) <= 0.01;
  const reserved: AnchorRunReservation[] = [];
  for (const adjacentWallId of selectedWallIds) {
    if (adjacentWallId === targetWallId) continue;
    const adjacent = wallRunFrame(adjacentWallId, room);
    if (!adjacent) continue;
    if (samePoint(target.start, adjacent.start) || samePoint(target.start, adjacent.end)) {
      reserved.push({ start: target.runStart, end: Math.min(target.runEnd, target.runStart + depthIn) });
    }
    if (samePoint(target.end, adjacent.start) || samePoint(target.end, adjacent.end)) {
      reserved.push({ start: Math.max(target.runStart, target.runEnd - depthIn), end: target.runEnd });
    }
  }
  return reserved;
}

export function planFourAnchorAutoBuild(input: FourAnchorInputs): FourAnchorBuildResult {
  const missing: FourAnchorKind[] = [];
  if (!validMeasurement(input.sink)) missing.push("sink");
  if (!validMeasurement(input.stove)) missing.push("stove");
  if (!validMeasurement(input.refrigerator)) missing.push("refrigerator");

  const dishwasher = validMeasurement(input.dishwasher) ? input.dishwasher : null;
  if (!dishwasher && input.dishwasher !== null && input.dishwasher !== undefined) missing.push("dishwasher");
  if (missing.length) return { ok: false, missing };

  const sink = input.sinkWindowCenter && validMeasurement(input.sinkWindowCenter)
    ? { ...input.sinkWindowCenter, kind: "sink" as const, source: "sink-window-centered" as const }
    : { ...input.sink, kind: "sink" as const, source: "measured" as const };
  const dishwasherPlacement = dishwasher
    ? { ...dishwasher, kind: "dishwasher" as const, source: "measured" as const }
    : {
      wallLabel: sink.wallLabel,
      centerOffsetIn: sink.centerOffsetIn,
      kind: "dishwasher" as const,
      source: "adjacent-to-sink" as const,
      dishwasherSide: input.dishwasherSide ?? "right",
    };

  return {
    ok: true,
    plan: {
      layoutType: input.layoutType,
      originCorner: input.originCorner,
      runDirection: input.runDirection,
      anchors: [
        sink,
        { ...input.stove, kind: "stove", source: "measured" },
        dishwasherPlacement,
        { ...input.refrigerator, kind: "refrigerator", source: "measured" },
      ],
      surroundingRules: ["fillers", "blind corners", "molding", "substitution"],
    },
  };
}

export function canRunFourAnchorAutoBuild(isAdmin: boolean, hasHandPlacedItems: boolean): boolean {
  return isAdmin && !hasHandPlacedItems;
}

function validMeasurement(measurement: FourAnchorMeasurement | null | undefined): measurement is FourAnchorMeasurement {
  if (!measurement) return false;
  return ["Wall 1", "Wall 2", "Wall 3", "Wall 4"].includes(measurement.wallLabel)
    && Number.isFinite(measurement.centerOffsetIn)
    && measurement.centerOffsetIn >= 0;
}

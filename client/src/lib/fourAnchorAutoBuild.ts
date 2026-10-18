import { wallRunFrame, type RoomData, type WallRunFrame } from "./design";

export type FourAnchorKind = "sink" | "stove" | "dishwasher" | "refrigerator";
export type FourAnchorLayoutType = "galley" | "l-shape" | "u-shape" | "single-wall";
export type FourAnchorOriginCorner = "left" | "right";
export type FourAnchorRunDirection = "left" | "right";
export type WallLabel = "Wall 1" | "Wall 2" | "Wall 3" | "Wall 4";

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
  sink: FourAnchorMeasurement;
  stove: FourAnchorMeasurement;
  dishwasher?: FourAnchorMeasurement | null;
  refrigerator: FourAnchorMeasurement;
  sinkWindowCenter?: FourAnchorMeasurement | null;
};

export type FourAnchorPlacement = FourAnchorMeasurement & {
  kind: FourAnchorKind;
  source: "measured" | "adjacent-to-sink" | "sink-window-centered";
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
    : { wallLabel: input.sink.wallLabel, centerOffsetIn: input.sink.centerOffsetIn, kind: "dishwasher" as const, source: "adjacent-to-sink" as const };

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

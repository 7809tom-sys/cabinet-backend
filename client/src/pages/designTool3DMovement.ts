import {
  cabinetWall,
  isCustomRoomWall,
  peninsulaRunById,
  STD,
  wallPlacementAt,
  wallPlacementAtUnbounded,
  wallRunOffset,
  type PlacedCabinet,
  type RoomData,
  type WallSide,
} from "@/lib/design";

export type ThreeDPlanMoveDirection = "left" | "right" | "in" | "out";
export const MAX_CABINET_PLAN_MOVE_IN = 120;

function controlledMoveStep(incrementIn: number) {
  return Math.max(0.125, Math.min(MAX_CABINET_PLAN_MOVE_IN, Number(incrementIn) || 1));
}

function measuredWallSide(cabinet: PlacedCabinet, room: RoomData): WallSide | null {
  const side = (cabinet.wallId ?? cabinetWall(cabinet, room)) as WallSide | undefined;
  if (!side) return null;
  return isCustomRoomWall(room, side) || peninsulaRunById(room, side) ? side : null;
}

/**
 * A continuous-wall or peninsula cabinet has a local wall frame, rather than a
 * cardinal screen edge. Its stored rotation is the cabinet-facing run direction:
 * left/right follow that run and in/out follow its face normal. This keeps the
 * 3D controls consistent with the same wallPlacementAt geometry used by Plan,
 * catalog drops, and the continuous wall builder.
 */
function measuredWallPlanMoveDelta(
  cabinet: PlacedCabinet,
  room: RoomData,
  direction: ThreeDPlanMoveDirection,
  step: number,
): { x: number; y: number } | null {
  if (!measuredWallSide(cabinet, room)) return null;
  const radians = ((Number(cabinet.rotation) || 0) * Math.PI) / 180;
  const run = { x: Math.cos(radians), y: Math.sin(radians) };
  const inward = { x: -Math.sin(radians), y: Math.cos(radians) };
  switch (direction) {
    case "left": return { x: -run.x * step, y: -run.y * step };
    case "right": return { x: run.x * step, y: run.y * step };
    case "in": return { x: inward.x * step, y: inward.y * step };
    case "out": return { x: -inward.x * step, y: -inward.y * step };
  }
}

export interface ThreeDMeasuredWallMoveTarget {
  /** The physically seated cabinet target, with its canonical wall identity. */
  candidate: PlacedCabinet;
  /** In/out is deliberately constrained: a measured wall cabinet remains flush. */
  constrainedToWall: boolean;
}

/**
 * Resolves a 3D move on an explicit continuous-wall or peninsula run through
 * the exact same measured wall resolver used by catalog placement and Plan drag.
 * It prevents a 3D arrow move from losing wallOffset, rotating to a cardinal
 * fallback, or drifting into/out of a continuous wall.
 */
export function threeDMeasuredWallMoveTarget(
  cabinet: PlacedCabinet,
  room: RoomData,
  direction: ThreeDPlanMoveDirection,
  incrementIn: number,
): ThreeDMeasuredWallMoveTarget | null {
  const side = measuredWallSide(cabinet, room);
  if (!side) return null;
  if (direction === "in" || direction === "out") {
    return { candidate: cabinet, constrainedToWall: true };
  }

  const step = controlledMoveStep(incrementIn);
  const offset = wallRunOffset(cabinet, side, room);
  // Compare two unbounded placements to obtain the source wall's true run
  // vector. This remains correct when a right-side peninsula cabinet flips its
  // own rotation to face the opposite direction.
  const origin = wallPlacementAtUnbounded(offset, cabinet.width, cabinet.depth, side, room, cabinet.peninsulaSide);
  const next = wallPlacementAtUnbounded(offset + 1, cabinet.width, cabinet.depth, side, room, cabinet.peninsulaSide);
  const rawRun = { x: next.x - origin.x, y: next.y - origin.y };
  const runLength = Math.hypot(rawRun.x, rawRun.y);
  if (runLength <= 1e-9) return { candidate: cabinet, constrainedToWall: true };
  const run = { x: rawRun.x / runLength, y: rawRun.y / runLength };
  const localDelta = measuredWallPlanMoveDelta(cabinet, room, direction, step);
  if (!localDelta) return null;
  const nextOffset = offset + localDelta.x * run.x + localDelta.y * run.y;
  const spot = wallPlacementAt(nextOffset, cabinet.width, cabinet.depth, side, room, cabinet.peninsulaSide);
  return {
    candidate: {
      ...cabinet,
      ...spot,
      wallId: (spot.wallId ?? side) as WallSide,
      wallOffset: spot.wallOffset ?? offset,
      ...(spot.peninsulaSide ? { peninsulaSide: spot.peninsulaSide } : {}),
    },
    constrainedToWall: false,
  };
}

export function countertopMountedCabinet(
  cabinet: PlacedCabinet,
  countertopTopIn = STD.COUNTERTOP_HEIGHT,
): PlacedCabinet {
  return {
    ...cabinet,
    mountBottom: countertopTopIn,
    mountBottomAdjusted: true,
  };
}

export function commitThreeDCabinetCandidate(
  placed: PlacedCabinet[],
  uid: string,
  candidate: PlacedCabinet,
): PlacedCabinet[] | null {
  if (!placed.some((cabinet) => cabinet.uid === uid) || candidate.uid !== uid) return null;
  return placed.map((cabinet) => cabinet.uid === uid ? candidate : cabinet);
}

/**
 * Converts the screen-relative 3D move controls into inches on the authoritative
 * 2D plan. The result follows the cabinet front that faces into the room.
 */
export function threeDPlanMoveDelta(
  cabinet: PlacedCabinet,
  room: RoomData,
  direction: ThreeDPlanMoveDirection,
  incrementIn: number,
) {
  const step = controlledMoveStep(incrementIn);
  const measuredWallDelta = measuredWallPlanMoveDelta(cabinet, room, direction, step);
  if (measuredWallDelta) return measuredWallDelta;
  const side = cabinetWall(cabinet, room);
  const vectors: Record<ThreeDPlanMoveDirection, { x: number; y: number }> = {
    left: side === "top" ? { x: -step, y: 0 } : side === "bottom" ? { x: step, y: 0 } : side === "left" ? { x: 0, y: step } : { x: 0, y: -step },
    right: side === "top" ? { x: step, y: 0 } : side === "bottom" ? { x: -step, y: 0 } : side === "left" ? { x: 0, y: -step } : { x: 0, y: step },
    in: side === "top" ? { x: 0, y: step } : side === "bottom" ? { x: 0, y: -step } : side === "left" ? { x: step, y: 0 } : { x: -step, y: 0 },
    out: side === "top" ? { x: 0, y: -step } : side === "bottom" ? { x: 0, y: step } : side === "left" ? { x: -step, y: 0 } : { x: step, y: 0 },
  };
  return vectors[direction];
}

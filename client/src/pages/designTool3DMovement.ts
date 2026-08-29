import { cabinetWall, STD, type PlacedCabinet, type RoomData } from "@/lib/design";

export type ThreeDPlanMoveDirection = "left" | "right" | "in" | "out";

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
  const step = Math.max(0.125, Math.min(24, Number(incrementIn) || 1));
  const side = cabinetWall(cabinet, room);
  const vectors: Record<ThreeDPlanMoveDirection, { x: number; y: number }> = {
    left: side === "top" ? { x: -step, y: 0 } : side === "bottom" ? { x: step, y: 0 } : side === "left" ? { x: 0, y: step } : { x: 0, y: -step },
    right: side === "top" ? { x: step, y: 0 } : side === "bottom" ? { x: -step, y: 0 } : side === "left" ? { x: 0, y: -step } : { x: 0, y: step },
    in: side === "top" ? { x: 0, y: step } : side === "bottom" ? { x: 0, y: -step } : side === "left" ? { x: step, y: 0 } : { x: -step, y: 0 },
    out: side === "top" ? { x: 0, y: -step } : side === "bottom" ? { x: 0, y: step } : side === "left" ? { x: -step, y: 0 } : { x: step, y: 0 },
  };
  return vectors[direction];
}

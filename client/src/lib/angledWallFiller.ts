import {
  type PlacedCabinet,
  type RoomData,
  type WallSide,
  cabinetWall,
  elevationBox,
  wallLength,
  wallPlacementAt,
  wallRunOffset,
  wallRunSpan,
} from "@/lib/design";
import { catalogFillerForGap, fittedCatalogFillerDescription, type CatalogFillerCandidate } from "@/lib/catalogFiller";
import { isLocked45Wall } from "@/lib/polygonRoom";

const JOIN_EPSILON_IN = 0.25;

export type AngledWallFillerResolution = {
  filler: PlacedCabinet;
  gapIn: number;
  miterAt: "start" | "end";
  neighborUid: string;
};

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sharedVertexPosition(
  wall: NonNullable<RoomData["customWalls"]>[number],
  neighbor: NonNullable<RoomData["customWalls"]>[number],
): { at: "start" | "end"; neighborAt: "start" | "end" } | null {
  if (wall.startVertexId === neighbor.startVertexId) return { at: "start", neighborAt: "start" };
  if (wall.startVertexId === neighbor.endVertexId) return { at: "start", neighborAt: "end" };
  if (wall.endVertexId === neighbor.startVertexId) return { at: "end", neighborAt: "start" };
  if (wall.endVertexId === neighbor.endVertexId) return { at: "end", neighborAt: "end" };
  return null;
}

/**
 * Resolves a real, priced wall filler at a continuous-wall join containing a
 * 45-degree segment. The filler occupies only the measured free span between a
 * newly seated wall cabinet and an adjacent cabinet at the shared vertex. It is
 * marked for a 45-degree installer miter at that vertex; no synthetic SKU or
 * made-up filler size is ever created.
 */
export function automaticAngledWallFiller(
  cabinet: PlacedCabinet,
  room: RoomData,
  placed: readonly PlacedCabinet[],
  candidates: readonly CatalogFillerCandidate[],
  makeUid: () => string,
  styleId: number | null,
): AngledWallFillerResolution | null {
  if (cabinet.placement !== "wall" || !cabinet.wallId || !room.customWalls?.length) return null;
  const wall = room.customWalls.find((item) => item.id === cabinet.wallId);
  if (!wall) return null;

  const side = cabinet.wallId as WallSide;
  const wallLen = wallLength(side, room);
  const start = wallRunOffset(cabinet, side, room);
  const end = start + wallRunSpan(cabinet, side, room);
  const currentElevation = elevationBox(cabinet, room);

  for (const neighborWall of room.customWalls) {
    if (neighborWall.id === wall.id) continue;
    // A mitered filler is specific to a deliberate diagonal continuous-wall
    // join. Normal 90-degree joins retain their existing corner and collision
    // rules without silently adding trim.
    if (!isLocked45Wall(wall) && !isLocked45Wall(neighborWall)) continue;
    const shared = sharedVertexPosition(wall, neighborWall);
    if (!shared) continue;

    const gapIn = shared.at === "start" ? start : wallLen - end;
    if (gapIn < 0.125 || gapIn > 6 + JOIN_EPSILON_IN) continue;
    const neighborLen = wallLength(neighborWall.id as WallSide, room);
    const neighbor = placed.find((item) => {
      if (item.uid === cabinet.uid || item.placement !== "wall" || item.wallId !== neighborWall.id) return false;
      const itemStart = wallRunOffset(item, neighborWall.id, room);
      const itemEnd = itemStart + wallRunSpan(item, neighborWall.id, room);
      const seatedAtSharedVertex = shared.neighborAt === "start"
        ? itemStart <= JOIN_EPSILON_IN
        : Math.abs(itemEnd - neighborLen) <= JOIN_EPSILON_IN;
      if (!seatedAtSharedVertex) return false;
      const itemElevation = elevationBox(item, room);
      return Math.abs(itemElevation.bottom - currentElevation.bottom) <= JOIN_EPSILON_IN
        && Math.abs(itemElevation.height - currentElevation.height) <= JOIN_EPSILON_IN;
    });
    if (!neighbor) continue;

    const heightCompatibleCandidates = candidates.filter((candidate) => {
      const height = numberValue(candidate.height);
      const depth = numberValue(candidate.depth);
      return Math.abs(height - currentElevation.height) <= JOIN_EPSILON_IN && depth > 0;
    });
    const source = catalogFillerForGap(heightCompatibleCandidates, gapIn, "wall");
    if (!source) continue;

    const depth = numberValue(source.depth);
    const spot = wallPlacementAt(
      shared.at === "start" ? 0 : wallLen - gapIn,
      gapIn,
      depth,
      side,
      room,
    );
    const miterAt = shared.at;
    const roundedGap = Math.round(gapIn * 8) / 8;
    const groupId = `angled-wall-miter-${cabinet.uid}-${neighbor.uid}-${miterAt}`;
    const filler: PlacedCabinet = {
      uid: makeUid(),
      cabinetId: source.id,
      masterCode: source.masterCode,
      description: `${fittedCatalogFillerDescription(source, roundedGap)} — 45° miter at wall ${miterAt}`,
      category: source.category,
      subCategory: source.subCategory,
      placement: "wall",
      x: spot.x,
      y: spot.y,
      width: roundedGap,
      depth,
      height: numberValue(source.height),
      rotation: spot.rotation,
      numberOfDoors: 0,
      numberOfDrawers: 0,
      catalogImageUrl: source.catalogImageUrl ?? null,
      mountBottom: currentElevation.bottom,
      styleId,
      wallId: spot.wallId ?? cabinet.wallId,
      wallOffset: spot.wallOffset ?? (miterAt === "start" ? 0 : wallLen - roundedGap),
      fillerPieceGroupId: groupId,
      fillerBillingRole: "primary",
      fillerTotalWidth: roundedGap,
      fillerPlacementMode: miterAt === "start" ? "left" : "right",
      fillerForCabinetUid: cabinet.uid,
      fillerMiterAngle: 45,
      fillerMiteredEnd: miterAt,
    };
    return { filler, gapIn: roundedGap, miterAt, neighborUid: neighbor.uid };
  }
  return null;
}

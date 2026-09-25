import {
  type PlacedCabinet,
  type RoomData,
  type WallSide,
  elevationBox,
  wallLength,
  wallPlacementAt,
  wallRunOffset,
  wallRunSpan,
} from "@/lib/design";
import { catalogFillerForGap, type CatalogFillerCandidate } from "@/lib/catalogFiller";
import { installedFillerVerticalSpec } from "@/lib/smallGapFiller";
import { isLocked45Wall } from "@/lib/polygonRoom";

const JOIN_EPSILON_IN = 0.25;
const FRONT_FILLER_DEPTH_IN = 0.75;

export type AngledWallTransitionPoint = { x: number; y: number };

type EndpointFace = {
  rear: AngledWallTransitionPoint;
  front: AngledWallTransitionPoint;
};

export type AngledWallTransitionMeasurement = {
  wallId: string;
  neighborWallId: string;
  sharedVertexId: string;
  at: "start" | "end";
  neighborAt: "start" | "end";
  ownerUid: string;
  neighborUid: string;
  /** Exact gap along the owner cabinet's wall run. */
  rearGapIn: number;
  /** Exact gap along the adjoining cabinet's wall run. */
  neighborRearGapIn: number;
  /** Distance between the two visible cabinet-side front corners; diagnostic only. */
  frontGapIn: number;
  /** Measured front-run cut for filler A, from its cabinet edge to the real miter. */
  ownerFrontCutIn: number;
  /** Measured front-run cut for filler B, from its cabinet edge to the real miter. */
  neighborFrontCutIn: number;
  /** Each source filler must cover its own individual measured front-run cut. */
  requiredStockWidthIn: number;
  depthIn: number;
  ownerFace: EndpointFace;
  neighborFace: EndpointFace;
  ownerFrontMiterOffsetIn: number;
  neighborFrontMiterOffsetIn: number;
};

export type AngledWallFillerResolution = {
  /**
   * Two real pieces cut from source-priced stock: one on each cabinet front.
   * Neither piece is a full-depth wedge or an invented transition cabinet.
   */
  fillers: [PlacedCabinet, PlacedCabinet];
  ownerGapIn: number;
  neighborGapIn: number;
  miterAt: "start" | "end";
  neighborUid: string;
};

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function distance(left: AngledWallTransitionPoint, right: AngledWallTransitionPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function roundedEighth(value: number): number {
  return Math.round(value * 8) / 8;
}

function sharedVertexPosition(
  wall: NonNullable<RoomData["customWalls"]>[number],
  neighbor: NonNullable<RoomData["customWalls"]>[number],
): { at: "start" | "end"; neighborAt: "start" | "end"; vertexId: string } | null {
  if (wall.startVertexId === neighbor.startVertexId) return { at: "start", neighborAt: "start", vertexId: wall.startVertexId };
  if (wall.startVertexId === neighbor.endVertexId) return { at: "start", neighborAt: "end", vertexId: wall.startVertexId };
  if (wall.endVertexId === neighbor.startVertexId) return { at: "end", neighborAt: "start", vertexId: wall.endVertexId };
  if (wall.endVertexId === neighbor.endVertexId) return { at: "end", neighborAt: "end", vertexId: wall.endVertexId };
  return null;
}

function wallFrame(
  wall: NonNullable<RoomData["customWalls"]>[number],
  room: RoomData,
): { start: AngledWallTransitionPoint; tangent: AngledWallTransitionPoint; inward: AngledWallTransitionPoint } | null {
  const start = room.vertices?.find((vertex) => vertex.id === wall.startVertexId);
  const end = room.vertices?.find((vertex) => vertex.id === wall.endVertexId);
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) return null;
  const tangent = { x: dx / length, y: dy / length };
  return {
    start: { x: start.x, y: start.y },
    tangent,
    inward: { x: -tangent.y, y: tangent.x },
  };
}

function cabinetSideFaceAtWallEndpoint(
  cabinet: PlacedCabinet,
  wall: NonNullable<RoomData["customWalls"]>[number],
  at: "start" | "end",
  room: RoomData,
): EndpointFace | null {
  const frame = wallFrame(wall, room);
  if (!frame) return null;
  const offset = wallRunOffset(cabinet, wall.id, room);
  const span = wallRunSpan(cabinet, wall.id, room);
  const edgeOffset = at === "start" ? offset : offset + span;
  const rear = {
    x: frame.start.x + frame.tangent.x * edgeOffset,
    y: frame.start.y + frame.tangent.y * edgeOffset,
  };
  const depth = Math.max(0, Number(cabinet.depth) || 0);
  return {
    rear,
    front: {
      x: rear.x + frame.inward.x * depth,
      y: rear.y + frame.inward.y * depth,
    },
  };
}

function frontFillerFootprint(
  wall: NonNullable<RoomData["customWalls"]>[number],
  room: RoomData,
  cabinetFaceOffset: number,
  miterOffset: number,
  depth: number,
): AngledWallTransitionPoint[] | null {
  const frame = wallFrame(wall, room);
  const width = Math.abs(miterOffset - cabinetFaceOffset);
  if (!frame || width <= 0 || depth <= 0) return null;
  const start = Math.min(cabinetFaceOffset, miterOffset);
  const end = Math.max(cabinetFaceOffset, miterOffset);
  const face = depth;
  const back = Math.max(0, depth - Math.min(depth, FRONT_FILLER_DEPTH_IN));
  const cut = Math.min(width, FRONT_FILLER_DEPTH_IN);
  // The miter belongs at the shared wall vertex. The board remains only 3/4 inch
  // deep at the cabinet face; the empty rear pocket is not filled or billed.
  const miterAtEnd = miterOffset >= cabinetFaceOffset;
  const local = miterAtEnd
    ? [[start, face], [end - cut, face], [end, back], [start, back]]
    : [[start + cut, face], [end, face], [end, back], [start, back]];
  return local.map(([along, inward]) => ({
    x: frame.start.x + frame.tangent.x * along + frame.inward.x * inward,
    y: frame.start.y + frame.tangent.y * along + frame.inward.y * inward,
  }));
}

function frontFillerPlacement(
  wallId: string,
  cabinetFaceOffset: number,
  miterOffset: number,
  depth: number,
  room: RoomData,
) {
  const start = Math.min(cabinetFaceOffset, miterOffset);
  return wallPlacementAt(start, Math.abs(miterOffset - cabinetFaceOffset), depth, wallId as WallSide, room);
}

function lineIntersection(
  leftPoint: AngledWallTransitionPoint,
  leftDirection: AngledWallTransitionPoint,
  rightPoint: AngledWallTransitionPoint,
  rightDirection: AngledWallTransitionPoint,
): AngledWallTransitionPoint | null {
  const determinant = leftDirection.x * rightDirection.y - leftDirection.y * rightDirection.x;
  if (Math.abs(determinant) <= 0.0001) return null;
  const delta = { x: rightPoint.x - leftPoint.x, y: rightPoint.y - leftPoint.y };
  const factor = (delta.x * rightDirection.y - delta.y * rightDirection.x) / determinant;
  return {
    x: leftPoint.x + leftDirection.x * factor,
    y: leftPoint.y + leftDirection.y * factor,
  };
}

function wallOffsetAtPoint(
  wall: NonNullable<RoomData["customWalls"]>[number],
  point: AngledWallTransitionPoint,
  room: RoomData,
): number | null {
  const frame = wallFrame(wall, room);
  if (!frame) return null;
  return (point.x - frame.start.x) * frame.tangent.x + (point.y - frame.start.y) * frame.tangent.y;
}

/**
 * Measure one genuine two-piece 45-degree front-filler assembly. A pair exists
 * only when both independently supported cabinet runs leave a real measured gap
 * at the same locked 45-degree vertex. A one-sided opening is left alone rather
 * than being converted into a deep wedge at the back of a cabinet run.
 */
export function measuredAngledWallTransition(
  cabinet: PlacedCabinet,
  room: RoomData,
  placed: readonly PlacedCabinet[],
): AngledWallTransitionMeasurement | null {
  if ((cabinet.placement !== "wall" && cabinet.placement !== "base") || !cabinet.wallId || !room.customWalls?.length) return null;
  const wall = room.customWalls.find((item) => item.id === cabinet.wallId);
  if (!wall) return null;

  const wallLen = wallLength(cabinet.wallId as WallSide, room);
  const start = wallRunOffset(cabinet, cabinet.wallId, room);
  const end = start + wallRunSpan(cabinet, cabinet.wallId, room);
  const currentElevation = elevationBox(cabinet, room);

  for (const neighborWall of room.customWalls) {
    if (neighborWall.id === wall.id) continue;
    if (!isLocked45Wall(wall) && !isLocked45Wall(neighborWall)) continue;
    const shared = sharedVertexPosition(wall, neighborWall);
    if (!shared) continue;

    const ownerGap = shared.at === "start" ? start : wallLen - end;
    if (ownerGap < -JOIN_EPSILON_IN) continue;
    const neighborLen = wallLength(neighborWall.id as WallSide, room);
    const neighbor = placed.find((item) => {
      if (item.uid === cabinet.uid || item.fillerPieceGroupId || item.placement !== cabinet.placement || item.wallId !== neighborWall.id) return false;
      const itemStart = wallRunOffset(item, neighborWall.id, room);
      const itemEnd = itemStart + wallRunSpan(item, neighborWall.id, room);
      const neighborGap = shared.neighborAt === "start" ? itemStart : neighborLen - itemEnd;
      if (neighborGap < -JOIN_EPSILON_IN) return false;
      const itemElevation = elevationBox(item, room);
      return Math.abs(itemElevation.bottom - currentElevation.bottom) <= JOIN_EPSILON_IN
        && Math.abs(itemElevation.height - currentElevation.height) <= JOIN_EPSILON_IN;
    });
    if (!neighbor) continue;

    const neighborStart = wallRunOffset(neighbor, neighborWall.id, room);
    const neighborEnd = neighborStart + wallRunSpan(neighbor, neighborWall.id, room);
    const neighborGap = shared.neighborAt === "start" ? neighborStart : neighborLen - neighborEnd;
    if (ownerGap < 0.125 && neighborGap < 0.125) continue;
    const ownerFace = cabinetSideFaceAtWallEndpoint(cabinet, wall, shared.at, room);
    const neighborFace = cabinetSideFaceAtWallEndpoint(neighbor, neighborWall, shared.neighborAt, room);
    if (!ownerFace || !neighborFace) continue;
    const ownerFrame = wallFrame(wall, room);
    const neighborFrame = wallFrame(neighborWall, room);
    if (!ownerFrame || !neighborFrame) continue;
    const miterPoint = lineIntersection(ownerFace.front, ownerFrame.tangent, neighborFace.front, neighborFrame.tangent);
    if (!miterPoint) continue;
    const ownerFrontMiterOffsetIn = wallOffsetAtPoint(wall, miterPoint, room);
    const neighborFrontMiterOffsetIn = wallOffsetAtPoint(neighborWall, miterPoint, room);
    if (ownerFrontMiterOffsetIn == null || neighborFrontMiterOffsetIn == null) continue;
    const ownerGapIn = roundedEighth(ownerGap);
    const neighborGapIn = roundedEighth(neighborGap);
    const ownerFrontCutIn = roundedEighth(distance(ownerFace.front, miterPoint));
    const neighborFrontCutIn = roundedEighth(distance(neighborFace.front, miterPoint));
    if (ownerFrontCutIn < 0.5 || neighborFrontCutIn < 0.5) continue;
    return {
      wallId: wall.id,
      neighborWallId: neighborWall.id,
      sharedVertexId: shared.vertexId,
      at: shared.at,
      neighborAt: shared.neighborAt,
      ownerUid: cabinet.uid,
      neighborUid: neighbor.uid,
      rearGapIn: ownerGapIn,
      neighborRearGapIn: neighborGapIn,
      frontGapIn: roundedEighth(distance(ownerFace.front, neighborFace.front)),
      ownerFrontCutIn,
      neighborFrontCutIn,
      requiredStockWidthIn: Math.max(ownerFrontCutIn, neighborFrontCutIn),
      depthIn: Math.max(Number(cabinet.depth) || 0, Number(neighbor.depth) || 0),
      ownerFace,
      neighborFace,
      ownerFrontMiterOffsetIn,
      neighborFrontMiterOffsetIn,
    };
  }
  return null;
}

/**
 * Return the persisted physical face-board polygon for the specific member of a
 * two-piece miter pair. Legacy full-depth wedges are kept readable only for old
 * saved plans; new assemblies never use that construction.
 */
export function angledWallTransitionFootprint(
  filler: PlacedCabinet,
  room: RoomData,
  placed: readonly PlacedCabinet[],
): AngledWallTransitionPoint[] | null {
  if (filler.fillerTransitionKind === "front-miter-pair") {
    return filler.fillerTransitionPlanFootprint?.length
      ? filler.fillerTransitionPlanFootprint.map((point) => ({ ...point }))
      : null;
  }
  if (filler.fillerTransitionKind !== "angled-wedge") return null;
  const owner = placed.find((item) => item.uid === filler.fillerForCabinetUid);
  if (!owner) return filler.fillerTransitionPlanFootprint?.length
    ? filler.fillerTransitionPlanFootprint.map((point) => ({ ...point }))
    : null;
  // Existing saved full-depth wedge records retain their persisted footprint so
  // an old design does not change its measured collision body on load.
  return filler.fillerTransitionPlanFootprint?.length
    ? filler.fillerTransitionPlanFootprint.map((point) => ({ ...point }))
    : null;
}

/**
 * Resolves a source-priced two-piece miter pair at the exposed front of the
 * cabinet runs. Both pieces use the same verified selected-line filler stock,
 * each gets its own positive locked price, and neither becomes a deep wedge,
 * panel, or fabricated SKU.
 */
export function automaticAngledWallFiller(
  cabinet: PlacedCabinet,
  room: RoomData,
  placed: readonly PlacedCabinet[],
  candidates: readonly CatalogFillerCandidate[],
  makeUid: () => string,
  styleId: number | null,
): AngledWallFillerResolution | null {
  if (cabinet.placement !== "wall" && cabinet.placement !== "base") return null;
  const measurement = measuredAngledWallTransition(cabinet, room, placed);
  if (!measurement) return null;
  const currentElevation = elevationBox(cabinet, room);
  const heightCompatibleCandidates = candidates.filter((candidate) => {
    const height = numberValue(candidate.height);
    const depth = numberValue(candidate.depth);
    return Math.abs(height - currentElevation.height) <= JOIN_EPSILON_IN && depth > 0;
  });
  const source = catalogFillerForGap(heightCompatibleCandidates, measurement.requiredStockWidthIn, cabinet.placement);
  if (!source) return null;

  const depth = numberValue(source.depth);
  const stockWidth = numberValue(source.width);
  const vertical = installedFillerVerticalSpec(cabinet.placement, numberValue(source.height));
  const groupId = `front-miter-pair-${cabinet.uid}-${measurement.neighborUid}-${measurement.at}`;
  const neighbor = placed.find((item) => item.uid === measurement.neighborUid);
  if (!neighbor) return null;

  const makePiece = (
    owner: PlacedCabinet,
    wallId: string,
    cabinetFaceOffset: number,
    miterOffset: number,
    cutWidth: number,
    counterpartUid: string,
    piece: "owner" | "neighbor",
  ): PlacedCabinet | null => {
    const wall = room.customWalls?.find((item) => item.id === wallId);
    if (!wall) return null;
    const footprint = frontFillerFootprint(wall, room, cabinetFaceOffset, miterOffset, depth);
    if (!footprint) return null;
    const spot = frontFillerPlacement(wallId, cabinetFaceOffset, miterOffset, depth, room);
    // Preserve the real geometry rather than rounding the stored body shorter
    // than its shared miter line. The presented cut is rounded to 1/8 inch by
    // the plan/toast helpers, while stock selection rounds up separately.
    const exactCutWidth = Math.abs(miterOffset - cabinetFaceOffset);
    const miteredEnd = miterOffset >= cabinetFaceOffset ? "end" : "start";
    return {
      uid: makeUid(),
      cabinetId: source.id,
      masterCode: source.masterCode,
      description: `${source.description ?? source.masterCode} — ${piece === "owner" ? "A" : "B"} front filler cut to ${roundedEighth(exactCutWidth)}\" with 45° miter`,
      category: source.category,
      subCategory: source.subCategory,
      placement: cabinet.placement,
      x: spot.x,
      y: spot.y,
      width: exactCutWidth,
      nominalWidth: stockWidth,
      depth,
      nominalDepth: depth,
      height: vertical.storedHeight,
      nominalHeight: numberValue(source.height),
      rotation: spot.rotation,
      numberOfDoors: 0,
      numberOfDrawers: 0,
      catalogImageUrl: source.catalogImageUrl ?? null,
      mountBottom: cabinet.placement === "wall" ? currentElevation.bottom : 0,
      styleId,
      wallId: spot.wallId ?? wallId,
      wallOffset: spot.wallOffset ?? Math.min(cabinetFaceOffset, miterOffset),
      fillerPieceGroupId: groupId,
      // Both physical pieces are purchased stock and each has the selected-line price.
      fillerBillingRole: "primary",
      fillerTotalWidth: measurement.rearGapIn + measurement.neighborRearGapIn,
      fillerPlacementMode: piece === "owner" ? "left" : "right",
      fillerForCabinetUid: owner.uid,
      fillerMiterAngle: 45,
      fillerMiteredEnd: miteredEnd,
      fillerTransitionKind: "front-miter-pair",
      fillerTransitionPiece: piece,
      fillerTransitionNeighborUid: counterpartUid,
      fillerTransitionRearWidthIn: exactCutWidth,
      fillerTransitionFrontWidthIn: exactCutWidth,
      fillerTransitionStockWidthIn: stockWidth,
      fillerTransitionPlanFootprint: footprint.map((point) => ({ ...point })),
      fillerIndependentCabinetSupport: true,
    };
  };

  const ownerFaceOffset = measurement.at === "start"
    ? wallRunOffset(cabinet, measurement.wallId, room)
    : wallRunOffset(cabinet, measurement.wallId, room) + wallRunSpan(cabinet, measurement.wallId, room);
  const neighborFaceOffset = measurement.neighborAt === "start"
    ? wallRunOffset(neighbor, measurement.neighborWallId, room)
    : wallRunOffset(neighbor, measurement.neighborWallId, room) + wallRunSpan(neighbor, measurement.neighborWallId, room);
  const ownerPiece = makePiece(cabinet, measurement.wallId, ownerFaceOffset, measurement.ownerFrontMiterOffsetIn, measurement.ownerFrontCutIn, neighbor.uid, "owner");
  const neighborPiece = makePiece(neighbor, measurement.neighborWallId, neighborFaceOffset, measurement.neighborFrontMiterOffsetIn, measurement.neighborFrontCutIn, cabinet.uid, "neighbor");
  if (!ownerPiece || !neighborPiece) return null;
  return {
    fillers: [ownerPiece, neighborPiece],
    ownerGapIn: measurement.ownerFrontCutIn,
    neighborGapIn: measurement.neighborFrontCutIn,
    miterAt: measurement.at,
    neighborUid: measurement.neighborUid,
  };
}

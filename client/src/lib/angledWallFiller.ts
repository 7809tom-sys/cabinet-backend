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
import { catalogFillerForGap, type CatalogFillerCandidate } from "@/lib/catalogFiller";
import { installedFillerVerticalSpec } from "@/lib/smallGapFiller";
import { isLocked45Wall } from "@/lib/polygonRoom";

const JOIN_EPSILON_IN = 0.25;

export type AngledWallTransitionPoint = { x: number; y: number };

export type AngledWallTransitionMeasurement = {
  wallId: string;
  neighborWallId: string;
  sharedVertexId: string;
  at: "start" | "end";
  neighborAt: "start" | "end";
  ownerUid: string;
  neighborUid: string;
  rearGapIn: number;
  frontGapIn: number;
  requiredStockWidthIn: number;
  depthIn: number;
  footprint: AngledWallTransitionPoint[];
};

export type AngledWallFillerResolution = {
  filler: PlacedCabinet;
  gapIn: number;
  rearGapIn: number;
  frontGapIn: number;
  miterAt: "start" | "end";
  neighborUid: string;
  footprint: AngledWallTransitionPoint[];
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
): { rear: AngledWallTransitionPoint; front: AngledWallTransitionPoint } | null {
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

function convexOrdered(points: AngledWallTransitionPoint[]): AngledWallTransitionPoint[] {
  const unique = points.filter((point, index) => points.findIndex((candidate) => distance(point, candidate) <= 0.001) === index);
  const center = unique.reduce((sum, point) => ({ x: sum.x + point.x / unique.length, y: sum.y + point.y / unique.length }), { x: 0, y: 0 });
  return unique.sort((left, right) => Math.atan2(left.y - center.y, left.x - center.x) - Math.atan2(right.y - center.y, right.x - center.x));
}

function polygonArea(points: readonly AngledWallTransitionPoint[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

/** True only for the measured full-depth transition piece used between two square cabinets at a 45° wall join. */
export function isAngledWallTransitionFiller(cabinet: Pick<PlacedCabinet, "fillerMiterAngle" | "fillerTransitionKind">): boolean {
  return cabinet.fillerMiterAngle === 45 && cabinet.fillerTransitionKind === "angled-wedge";
}

/**
 * Measures the physical transition between the adjacent side faces of two independently
 * supported square cabinets. The returned polygon spans the rear-wall gap and the visible
 * face-frame gap; it is never approximated as a 3/4-inch strip.
 */
export function measuredAngledWallTransition(
  cabinet: PlacedCabinet,
  room: RoomData,
  placed: readonly PlacedCabinet[],
): AngledWallTransitionMeasurement | null {
  if ((cabinet.placement !== "wall" && cabinet.placement !== "base") || !cabinet.wallId || !room.customWalls?.length) return null;
  const wall = room.customWalls.find((item) => item.id === cabinet.wallId);
  if (!wall) return null;

  const side = cabinet.wallId as WallSide;
  const wallLen = wallLength(side, room);
  const start = wallRunOffset(cabinet, side, room);
  const end = start + wallRunSpan(cabinet, side, room);
  const currentElevation = elevationBox(cabinet, room);

  for (const neighborWall of room.customWalls) {
    if (neighborWall.id === wall.id) continue;
    if (!isLocked45Wall(wall) && !isLocked45Wall(neighborWall)) continue;
    const shared = sharedVertexPosition(wall, neighborWall);
    if (!shared) continue;

    const rearGapIn = shared.at === "start" ? start : wallLen - end;
    if (rearGapIn < 0.125) continue;
    const neighborLen = wallLength(neighborWall.id as WallSide, room);
    const neighbor = placed.find((item) => {
      if (item.uid === cabinet.uid || item.fillerPieceGroupId || item.placement !== cabinet.placement || item.wallId !== neighborWall.id) return false;
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

    const ownerFace = cabinetSideFaceAtWallEndpoint(cabinet, wall, shared.at, room);
    const neighborFace = cabinetSideFaceAtWallEndpoint(neighbor, neighborWall, shared.neighborAt, room);
    if (!ownerFace || !neighborFace) continue;
    const footprint = convexOrdered([ownerFace.rear, ownerFace.front, neighborFace.front, neighborFace.rear]);
    if (footprint.length < 3 || polygonArea(footprint) <= 0.01) continue;

    const frontGapIn = distance(ownerFace.front, neighborFace.front);
    const requiredStockWidthIn = Math.max(rearGapIn, frontGapIn);
    return {
      wallId: wall.id,
      neighborWallId: neighborWall.id,
      sharedVertexId: shared.vertexId,
      at: shared.at,
      neighborAt: shared.neighborAt,
      ownerUid: cabinet.uid,
      neighborUid: neighbor.uid,
      rearGapIn: roundedEighth(rearGapIn),
      frontGapIn: roundedEighth(frontGapIn),
      requiredStockWidthIn: roundedEighth(requiredStockWidthIn),
      depthIn: Math.max(Number(cabinet.depth) || 0, Number(neighbor.depth) || 0),
      footprint,
    };
  }
  return null;
}

/** Rebuilds a persisted transition footprint from its two cabinet owners and measured room walls. */
export function angledWallTransitionFootprint(
  filler: PlacedCabinet,
  room: RoomData,
  placed: readonly PlacedCabinet[],
): AngledWallTransitionPoint[] | null {
  if (!isAngledWallTransitionFiller(filler)) return null;
  const owner = placed.find((item) => item.uid === filler.fillerForCabinetUid);
  if (!owner) return null;
  const measurement = measuredAngledWallTransition(owner, room, placed.filter((item) => item.uid !== filler.uid));
  if (!measurement || measurement.neighborUid !== filler.fillerTransitionNeighborUid) return null;
  return measurement.footprint;
}

/**
 * Resolves one real, priced selected-line filler for the measured transition. The
 * catalog stock must cover the larger of the rear-wall and visible face gaps.
 * No panel SKU, synthetic width, or fabricated price can enter this workflow.
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
  const wallLen = wallLength(measurement.wallId as WallSide, room);
  const spot = wallPlacementAt(
    measurement.at === "start" ? 0 : wallLen - measurement.rearGapIn,
    measurement.rearGapIn,
    depth,
    measurement.wallId as WallSide,
    room,
  );
  const vertical = installedFillerVerticalSpec(cabinet.placement, numberValue(source.height));
  const stockWidth = numberValue(source.width);
  const groupId = `angled-wall-transition-${cabinet.uid}-${measurement.neighborUid}-${measurement.at}`;
  const filler: PlacedCabinet = {
    uid: makeUid(),
    cabinetId: source.id,
    masterCode: source.masterCode,
    description: `${source.description ?? source.masterCode} — 45° transition cut to ${measurement.rearGapIn}" rear / ${measurement.frontGapIn}" face`,
    category: source.category,
    subCategory: source.subCategory,
    placement: cabinet.placement,
    x: spot.x,
    y: spot.y,
    width: measurement.rearGapIn,
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
    wallId: spot.wallId ?? cabinet.wallId,
    wallOffset: spot.wallOffset ?? (measurement.at === "start" ? 0 : wallLen - measurement.rearGapIn),
    fillerPieceGroupId: groupId,
    fillerBillingRole: "primary",
    fillerTotalWidth: measurement.requiredStockWidthIn,
    fillerPlacementMode: measurement.at === "start" ? "left" : "right",
    fillerForCabinetUid: cabinet.uid,
    fillerMiterAngle: 45,
    fillerMiteredEnd: measurement.at,
    fillerTransitionKind: "angled-wedge",
    fillerTransitionNeighborUid: measurement.neighborUid,
    fillerTransitionRearWidthIn: measurement.rearGapIn,
    fillerTransitionFrontWidthIn: measurement.frontGapIn,
    fillerTransitionStockWidthIn: stockWidth,
    fillerTransitionPlanFootprint: measurement.footprint.map((point) => ({ ...point })),
    fillerIndependentCabinetSupport: true,
  };
  return {
    filler,
    gapIn: measurement.requiredStockWidthIn,
    rearGapIn: measurement.rearGapIn,
    frontGapIn: measurement.frontGapIn,
    miterAt: measurement.at,
    neighborUid: measurement.neighborUid,
    footprint: measurement.footprint,
  };
}

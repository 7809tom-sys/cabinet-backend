import {
  FURNITURE_CATALOG,
  furnitureFootprint,
  isCustomRoomWall,
  peninsulaRunById,
  placedFootprint,
  wallPlacementAt,
  type IslandFace,
  type IslandZone,
  type PlacedCabinet,
  type PlacedFurniture,
  type PlanAnnotation,
  type PonyWall,
  type RoomData,
  type SinkFixture,
  type WallOpening,
  type WallSide,
} from "./design";
import { closestWall, positionAlongWall } from "./polygonRoom";

export interface RotatablePlanState {
  room: RoomData;
  cabinets: PlacedCabinet[];
  openings: WallOpening[];
  sinks: SinkFixture[];
  island: IslandZone | null;
  furniture: PlacedFurniture[];
  annotations: PlanAnnotation[];
  ponyWalls: PonyWall[];
}

export interface RotatedPlanState extends RotatablePlanState {}

const rounded = (value: number) => Math.round(value * 10_000) / 10_000;
const rotateAngle = (angle: number) => ((Number(angle || 0) + 90) % 360 + 360) % 360;

/** Rotate an axis-aligned plan rectangle 90° clockwise around the room bounds. */
export function rotatePlanRectClockwise(
  rect: { x: number; y: number; width: number; depth: number },
  oldRoomDepth: number,
) {
  return {
    x: rounded(oldRoomDepth - rect.y - rect.depth),
    y: rounded(rect.x),
    width: rounded(rect.depth),
    depth: rounded(rect.width),
  };
}

/** Rotate an arbitrary plan point 90° clockwise around the room bounds. */
export function rotatePlanPointClockwise(point: { x: number; y: number }, oldRoomDepth: number) {
  return { x: rounded(oldRoomDepth - point.y), y: rounded(point.x) };
}

const CARDINAL_ROTATION: Record<"top" | "right" | "bottom" | "left", "top" | "right" | "bottom" | "left"> = {
  top: "right",
  right: "bottom",
  bottom: "left",
  left: "top",
};

const ISLAND_FACE_ROTATION: Record<IslandFace, IslandFace> = {
  back: "right",
  right: "front",
  front: "left",
  left: "back",
};

function rotateWallId(side: string | null | undefined, room: RoomData): string | undefined {
  if (!side) return undefined;
  if (isCustomRoomWall(room, side) || peninsulaRunById(room, side)) return side;
  return CARDINAL_ROTATION[side as keyof typeof CARDINAL_ROTATION] ?? side;
}

function rotateWallCeilings(room: RoomData): RoomData["wallCeilings"] {
  if (!room.wallCeilings) return room.wallCeilings;
  if (room.customWalls?.length) return { ...room.wallCeilings };
  return Object.fromEntries(
    Object.entries(room.wallCeilings).map(([side, ceiling]) => [
      CARDINAL_ROTATION[side as keyof typeof CARDINAL_ROTATION] ?? side,
      ceiling,
    ]),
  ) as RoomData["wallCeilings"];
}

function rotateRoomClockwise(room: RoomData): RoomData {
  const vertices = room.vertices?.map((vertex) => ({
    ...vertex,
    ...rotatePlanPointClockwise(vertex, room.depth),
  }));
  return {
    ...room,
    width: room.depth,
    depth: room.width,
    vertices,
    wallCeilings: rotateWallCeilings(room),
  };
}

function wallOwnedCabinetAfterRotation(cabinet: PlacedCabinet, oldRoom: RoomData, nextRoom: RoomData): PlacedCabinet | null {
  if (cabinet.islandFace) return null;
  const oldFootprint = placedFootprint(cabinet);
  const center = { x: cabinet.x + oldFootprint.w / 2, y: cabinet.y + oldFootprint.d / 2 };
  const explicitWall = isCustomRoomWall(oldRoom, cabinet.wallId) || peninsulaRunById(oldRoom, cabinet.wallId)
    ? cabinet.wallId
    : null;
  const nearest = oldRoom.vertices?.length && oldRoom.customWalls?.length
    ? closestWall(center.x, center.y, oldRoom.vertices, oldRoom.customWalls)
    : null;
  const wallId = (explicitWall ?? nearest?.id) as WallSide | undefined;
  if (!wallId) return null;
  const oldCustomWall = oldRoom.customWalls?.find((wall) => wall.id === wallId);
  const along = Number.isFinite(cabinet.wallOffset)
    ? Number(cabinet.wallOffset)
    : oldCustomWall && oldRoom.vertices
      ? positionAlongWall(center.x, center.y, oldCustomWall, oldRoom.vertices)
      : 0;
  const spot = wallPlacementAt(along, cabinet.width, cabinet.depth, wallId, nextRoom, cabinet.peninsulaSide);
  return {
    ...cabinet,
    ...spot,
    wallId,
    wallOffset: along,
  };
}

/**
 * Rotate the entire saved drawing 90° clockwise. Custom wall ids, measured wall
 * lengths, opening offsets, and cabinet run offsets remain authoritative.
 */
export function rotateCustomPlanClockwise(input: RotatablePlanState): RotatedPlanState {
  const oldRoom = input.room;
  const nextRoom = rotateRoomClockwise(oldRoom);
  const cabinets = input.cabinets.map((cabinet) => {
    const onWall = wallOwnedCabinetAfterRotation(cabinet, oldRoom, nextRoom);
    if (onWall) return onWall;
    const footprint = placedFootprint(cabinet);
    const rotated = rotatePlanRectClockwise(
      { x: cabinet.x, y: cabinet.y, width: footprint.w, depth: footprint.d },
      oldRoom.depth,
    );
    return {
      ...cabinet,
      x: rotated.x,
      y: rotated.y,
      rotation: rotateAngle(cabinet.rotation),
      wallId: rotateWallId(cabinet.wallId, oldRoom),
      islandFace: cabinet.islandFace ? ISLAND_FACE_ROTATION[cabinet.islandFace] : cabinet.islandFace,
    };
  });
  const openings = input.openings.map((opening) => ({
    ...opening,
    side: (rotateWallId(opening.side, oldRoom) ?? opening.side) as WallSide,
  }));
  const sinks = input.sinks.map((sink) => {
    const rotated = rotatePlanRectClockwise(sink, oldRoom.depth);
    return {
      ...sink,
      ...rotated,
      wallSide: rotateWallId(sink.wallSide, oldRoom) as WallSide | undefined,
      planRotation: rotateAngle(sink.planRotation ?? 0),
    };
  });
  const island = input.island
    ? (() => {
        const rotated = rotatePlanRectClockwise(input.island!, oldRoom.depth);
        return {
          ...input.island!,
          ...rotated,
          activeFace: input.island!.activeFace ? ISLAND_FACE_ROTATION[input.island!.activeFace] : input.island!.activeFace,
          countertopWidth: input.island!.countertopDepth ?? input.island!.countertopWidth,
          countertopDepth: input.island!.countertopWidth ?? input.island!.countertopDepth,
          countertopOffsetX: input.island!.countertopOffsetY ?? input.island!.countertopOffsetX,
          countertopOffsetY: input.island!.countertopOffsetX ?? input.island!.countertopOffsetY,
        };
      })()
    : null;
  const furniture = input.furniture.map((item) => {
    const definition = FURNITURE_CATALOG.find((candidate) => candidate.id === item.defId);
    const footprint = definition ? furnitureFootprint(item, definition) : { w: 24, d: 24 };
    const rotated = rotatePlanRectClockwise(
      { x: item.x, y: item.y, width: footprint.w, depth: footprint.d },
      oldRoom.depth,
    );
    return { ...item, x: rotated.x, y: rotated.y, rotation: rotateAngle(item.rotation) };
  });
  const annotations = input.annotations.map((annotation) => ({
    ...annotation,
    ...rotatePlanPointClockwise(annotation, oldRoom.depth),
  }));
  const ponyWalls = input.ponyWalls.map((wall) => ({
    ...wall,
    ...rotatePlanRectClockwise(wall, oldRoom.depth),
  }));
  return { room: nextRoom, cabinets, openings, sinks, island, furniture, annotations, ponyWalls };
}

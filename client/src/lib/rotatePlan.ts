import {
  FURNITURE_CATALOG,
  furnitureFootprint,
  placedFootprint,
  nearestWallRunAtPoint,
  roomWallRunFrames,
  seatedWallRunFrame,
  wallPlacementAt,
  wallRunAlongAtPoint,
  wallRunFrame,
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

/**
 * A wall keeps its id through a quarter turn: a drawn wall or peninsula is a
 * named run whose geometry rotates with the vertices, and a standard side
 * becomes the next clockwise side. Both are the same run afterwards.
 */
function rotateWallId(side: string | null | undefined, room: RoomData): string | undefined {
  if (!side) return undefined;
  const frame = wallRunFrame(side, room);
  if (frame && frame.kind !== "cardinal") return side;
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
  // The run the cabinet sits on (its own wallId, or the run its body is seated
  // against) is the same run after the turn; its along-run offset is invariant.
  const oldFootprint = placedFootprint(cabinet);
  const center = { x: cabinet.x + oldFootprint.w / 2, y: cabinet.y + oldFootprint.d / 2 };
  const roomRuns = roomWallRunFrames(oldRoom);
  const seated = seatedWallRunFrame(cabinet, oldRoom);
  const oldFrame = seated && roomRuns.some((frame) => frame.id === seated.id)
    ? seated
    : nearestWallRunAtPoint(oldRoom, center)?.frame ?? null;
  if (!oldFrame) return null;
  const along = oldFrame === seated && Number.isFinite(cabinet.wallOffset)
    ? Number(cabinet.wallOffset)
    : Math.max(0, wallRunAlongAtPoint(oldFrame, center) - Math.max(0, Number(cabinet.width) || 0) / 2);
  const wallId = (rotateWallId(oldFrame.id, oldRoom) ?? oldFrame.id) as WallSide;
  const spot = wallPlacementAt(along, cabinet.width, cabinet.depth, wallId, nextRoom, cabinet.peninsulaSide);
  return {
    ...cabinet,
    ...spot,
    wallId,
    wallOffset: spot.wallOffset ?? along,
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

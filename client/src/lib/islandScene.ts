import {
  COLLISION_EPSILON_IN,
  STD,
  bearsCountertop,
  clampIslandToRoom,
  hasCollision,
  isOnIsland,
  placedFootprint,
  type IslandFace,
  type IslandZone,
  type PlacedCabinet,
  type RoomData,
} from "./design";

export const ISLAND_COUNTERTOP_OVERHANG_IN = 1.5;

export function islandFaceLength(island: IslandZone, face: IslandFace): number {
  return face === "front" || face === "back" ? island.width : island.depth;
}

export function islandFacePlacement(cabinet: PlacedCabinet, island: IslandZone, face: IslandFace, offset: number): PlacedCabinet {
  const width = Math.max(0, Number(cabinet.width) || 0);
  const depth = Math.max(0, Number(cabinet.depth) || STD.BASE_DEPTH);
  const along = Math.max(0, Math.min(offset, Math.max(0, islandFaceLength(island, face) - width)));
  if (face === "front") return { ...cabinet, x: island.x + along, y: island.y + island.depth - depth, rotation: 0, islandFace: face, islandOffset: along };
  if (face === "back") return { ...cabinet, x: island.x + along, y: island.y, rotation: 180, islandFace: face, islandOffset: along };
  if (face === "left") return { ...cabinet, x: island.x, y: island.y + along, rotation: 90, islandFace: face, islandOffset: along };
  return { ...cabinet, x: island.x + island.width - depth, y: island.y + along, rotation: 270, islandFace: face, islandOffset: along };
}

export function inferredIslandFace(cabinet: PlacedCabinet, island: IslandZone): IslandFace {
  if (cabinet.islandFace) return cabinet.islandFace;
  const footprint = placedFootprint(cabinet);
  const distances: Array<[IslandFace, number]> = [
    ["back", Math.abs(cabinet.y - island.y)],
    ["front", Math.abs(island.y + island.depth - (cabinet.y + footprint.d))],
    ["left", Math.abs(cabinet.x - island.x)],
    ["right", Math.abs(island.x + island.width - (cabinet.x + footprint.w))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0]?.[0] ?? "front";
}

export function islandOffsetForPlaced(cabinet: PlacedCabinet, island: IslandZone, face = inferredIslandFace(cabinet, island)): number {
  if (cabinet.islandFace === face && Number.isFinite(cabinet.islandOffset)) return Math.max(0, Number(cabinet.islandOffset));
  return face === "front" || face === "back" ? cabinet.x - island.x : cabinet.y - island.y;
}

export function nextIslandFacePlacement(cabinet: PlacedCabinet, island: IslandZone, face: IslandFace, placed: PlacedCabinet[]): PlacedCabinet | null {
  const runLength = Math.max(0, Number(cabinet.width) || 0);
  if (runLength <= 0 || runLength > islandFaceLength(island, face) + COLLISION_EPSILON_IN) return null;
  const occupied = placed
    .filter((item) => item.islandFace === face)
    .map((item) => ({ start: islandOffsetForPlaced(item, island, face), end: islandOffsetForPlaced(item, island, face) + Math.max(0, Number(item.width) || 0) }))
    .sort((a, b) => a.start - b.start);
  for (const start of [0, ...occupied.map((span) => span.end)]) {
    if (start + runLength > islandFaceLength(island, face) + COLLISION_EPSILON_IN) continue;
    if (occupied.some((span) => start < span.end - COLLISION_EPSILON_IN && start + runLength > span.start + COLLISION_EPSILON_IN)) continue;
    const candidate = islandFacePlacement(cabinet, island, face, start);
    if (!hasCollision(candidate, placed)) return candidate;
  }
  return null;
}

export type IslandSceneEditResult =
  | { ok: true; island: IslandZone; placed: PlacedCabinet[] }
  | { ok: false; reason: string; island: IslandZone; placed: PlacedCabinet[] };

export function moveIslandScene(island: IslandZone, placed: PlacedCabinet[], room: RoomData, dx: number, dy: number): IslandSceneEditResult {
  const members = placed.filter((item) => isOnIsland(item, island));
  const memberIds = new Set(members.map((item) => item.uid));
  const others = placed.filter((item) => !memberIds.has(item.uid));
  const nextIsland = clampIslandToRoom({ ...island, x: island.x + dx, y: island.y + dy }, room)!;
  if (Math.abs(nextIsland.x - (island.x + dx)) > COLLISION_EPSILON_IN || Math.abs(nextIsland.y - (island.y + dy)) > COLLISION_EPSILON_IN) {
    return { ok: false, reason: "The island assembly would leave the room.", island, placed };
  }
  const moved = members.map((item) => ({ ...item, x: item.x + dx, y: item.y + dy }));
  if (moved.some((item, index) => hasCollision(item, [...others, ...moved.filter((_, otherIndex) => otherIndex !== index)]))) {
    return { ok: false, reason: "The moved island assembly would overlap another object.", island, placed };
  }
  const byId = new Map(moved.map((item) => [item.uid, item]));
  return { ok: true, island: nextIsland, placed: placed.map((item) => byId.get(item.uid) ?? item) };
}

export function resizeIslandScene(island: IslandZone, placed: PlacedCabinet[], room: RoomData, width: number, depth: number): IslandSceneEditResult {
  const nextIsland = clampIslandToRoom({ ...island, width, depth }, room)!;
  if (Math.abs(nextIsland.width - width) > COLLISION_EPSILON_IN || Math.abs(nextIsland.depth - depth) > COLLISION_EPSILON_IN) {
    return { ok: false, reason: "The island size would leave the room.", island, placed };
  }
  const members = placed.filter((item) => isOnIsland(item, island));
  const memberIds = new Set(members.map((item) => item.uid));
  const others = placed.filter((item) => !memberIds.has(item.uid));
  if (members.some((item) => {
    const face = inferredIslandFace(item, island);
    return islandOffsetForPlaced(item, island, face) + Math.max(0, Number(item.width) || 0) > islandFaceLength(nextIsland, face) + COLLISION_EPSILON_IN;
  })) {
    return { ok: false, reason: "The resized island face is too short for its cabinets.", island, placed };
  }
  const rebuilt = members.map((item) => islandFacePlacement(item, nextIsland, inferredIslandFace(item, island), islandOffsetForPlaced(item, island)));
  if (rebuilt.some((item, index) => hasCollision(item, [...others, ...rebuilt.filter((_, otherIndex) => otherIndex !== index)]))) {
    return { ok: false, reason: "The resized island assembly would overlap another object.", island, placed };
  }
  const byId = new Map(rebuilt.map((item) => [item.uid, item]));
  return { ok: true, island: nextIsland, placed: placed.map((item) => byId.get(item.uid) ?? item) };
}

export function rotateIslandScene(island: IslandZone, placed: PlacedCabinet[], room: RoomData): IslandSceneEditResult {
  const centerX = island.x + island.width / 2;
  const centerY = island.y + island.depth / 2;
  const faceMap: Record<IslandFace, IslandFace> = { front: "left", left: "back", back: "right", right: "front" };
  const nextIsland = clampIslandToRoom({
    ...island,
    x: centerX - island.depth / 2,
    y: centerY - island.width / 2,
    width: island.depth,
    depth: island.width,
    activeFace: faceMap[island.activeFace ?? "front"],
    countertopWidth: island.countertopDepth ?? null,
    countertopDepth: island.countertopWidth ?? null,
    countertopOffsetX: -(island.countertopOffsetY ?? 0),
    countertopOffsetY: island.countertopOffsetX ?? 0,
  }, room)!;
  if (Math.abs(nextIsland.x - (centerX - island.depth / 2)) > COLLISION_EPSILON_IN || Math.abs(nextIsland.y - (centerY - island.width / 2)) > COLLISION_EPSILON_IN) {
    return { ok: false, reason: "The rotated island assembly would leave the room.", island, placed };
  }
  const members = placed.filter((item) => isOnIsland(item, island));
  const memberIds = new Set(members.map((item) => item.uid));
  const others = placed.filter((item) => !memberIds.has(item.uid));
  const rotated = members.map((item) => {
    const before = placedFootprint(item);
    const itemCenterX = item.x + before.w / 2;
    const itemCenterY = item.y + before.d / 2;
    const nextRotation = ((item.rotation + 90) % 360 + 360) % 360;
    const rotatedItem = { ...item, rotation: nextRotation };
    const after = placedFootprint(rotatedItem);
    const nextCenterX = centerX - (itemCenterY - centerY);
    const nextCenterY = centerY + (itemCenterX - centerX);
    const face = faceMap[inferredIslandFace(item, island)];
    const positioned = { ...rotatedItem, x: nextCenterX - after.w / 2, y: nextCenterY - after.d / 2, islandFace: face };
    return { ...positioned, islandOffset: face === "front" || face === "back" ? positioned.x - nextIsland.x : positioned.y - nextIsland.y };
  });
  if (rotated.some((item, index) => hasCollision(item, [...others, ...rotated.filter((_, otherIndex) => otherIndex !== index)]))) {
    return { ok: false, reason: "The rotated island assembly would overlap another object.", island, placed };
  }
  const byId = new Map(rotated.map((item) => [item.uid, item]));
  return { ok: true, island: nextIsland, placed: placed.map((item) => byId.get(item.uid) ?? item) };
}

export function islandCountertopRect(island: IslandZone, placed: PlacedCabinet[]): { x: number; y: number; width: number; depth: number } | null {
  const supports = placed.filter((item) => isOnIsland(item, island) && bearsCountertop(item));
  if (supports.length === 0) return null;
  const footprints = supports.map((item) => ({ item, footprint: placedFootprint(item) }));
  const minX = Math.min(...footprints.map(({ item }) => item.x));
  const minY = Math.min(...footprints.map(({ item }) => item.y));
  const maxX = Math.max(...footprints.map(({ item, footprint }) => item.x + footprint.w));
  const maxY = Math.max(...footprints.map(({ item, footprint }) => item.y + footprint.d));
  const autoWidth = maxX - minX + ISLAND_COUNTERTOP_OVERHANG_IN * 2;
  const autoDepth = maxY - minY + ISLAND_COUNTERTOP_OVERHANG_IN * 2;
  const width = island.countertopWidth ?? autoWidth;
  const depth = island.countertopDepth ?? autoDepth;
  const centerX = (minX + maxX) / 2 + Number(island.countertopOffsetX ?? 0);
  const centerY = (minY + maxY) / 2 + Number(island.countertopOffsetY ?? 0);
  return { x: centerX - width / 2, y: centerY - depth / 2, width, depth };
}

import {
  COLLISION_EPSILON_IN,
  STD,
  bearsIslandCountertop,
  bearsCountertop,
  clampIslandToRoom,
  hasCollision,
  isCounterHeightIslandWallCabinet,
  isOnIsland,
  placedFootprint,
  type IslandFace,
  type IslandZone,
  type PlacedCabinet,
  type RoomData,
  type WallCabinetFitMeasure,
} from "./design";

export const ISLAND_COUNTERTOP_OVERHANG_IN = 1.5;

export function islandFaceLength(island: IslandZone, face: IslandFace): number {
  return face === "front" || face === "back" ? island.width : island.depth;
}

export function islandFacePlacement(cabinet: PlacedCabinet, island: IslandZone, face: IslandFace, offset: number): PlacedCabinet {
  const width = Math.max(0, Number(cabinet.width) || 0);
  const depth = Math.max(0, Number(cabinet.depth) || STD.BASE_DEPTH);
  const along = Math.max(0, Math.min(offset, Math.max(0, islandFaceLength(island, face) - width)));
  const isCounterHeightWallFace = cabinet.placement === "wall"
    && depth <= STD.WALL_DEPTH + COLLISION_EPSILON_IN
    && Math.max(0, Number(cabinet.height) || STD.WALL_HEIGHT) <= STD.BASE_HEIGHT + COLLISION_EPSILON_IN;
  const mountBottom = isCounterHeightWallFace
    ? Math.max(0, STD.BASE_HEIGHT - Math.max(0, Number(cabinet.height) || STD.WALL_HEIGHT))
    : cabinet.mountBottomAdjusted === true && typeof cabinet.mountBottom === "number" && cabinet.mountBottom >= 0
    ? cabinet.mountBottom
    : 0;
  const local = { ...cabinet, mountBottom, islandCounterHeightWallCabinet: isCounterHeightWallFace || undefined };
  if (face === "front") return { ...local, x: island.x + along, y: island.y + island.depth - depth, rotation: 0, islandFace: face, islandOffset: along };
  if (face === "back") return { ...local, x: island.x + along, y: island.y, rotation: 180, islandFace: face, islandOffset: along };
  if (face === "left") return { ...local, x: island.x, y: island.y + along, rotation: 90, islandFace: face, islandOffset: along };
  return { ...local, x: island.x + island.width - depth, y: island.y + along, rotation: 270, islandFace: face, islandOffset: along };
}

export function islandFaceFitMeasure(
  moving: PlacedCabinet,
  island: IslandZone,
  placed: PlacedCabinet[],
): WallCabinetFitMeasure | null {
  const face = moving.islandFace ?? null;
  if (!face) return null;
  const wallLen = islandFaceLength(island, face);
  const start = Math.max(0, islandOffsetForPlaced(moving, island, face));
  const requiredSpan = Math.max(0, Number(moving.width) || 0);
  const end = start + requiredSpan;
  const peers = placed
    .filter((item) => item.uid !== moving.uid && item.islandFace === face)
    .map((item) => ({
      item,
      start: Math.max(0, islandOffsetForPlaced(item, island, face)),
      end: Math.max(0, islandOffsetForPlaced(item, island, face)) + Math.max(0, Number(item.width) || 0),
    }))
    .sort((a, b) => a.start - b.start);
  const segments: Array<{ start: number; end: number; beforeBoundary: string; afterBoundary: string }> = [];
  let cursor = 0;
  let beforeBoundary = "island face start";
  for (const peer of peers) {
    if (peer.start > cursor + COLLISION_EPSILON_IN) {
      segments.push({ start: cursor, end: peer.start, beforeBoundary, afterBoundary: peer.item.masterCode });
    }
    if (peer.end > cursor) {
      cursor = peer.end;
      beforeBoundary = peer.item.masterCode;
    }
  }
  if (cursor < wallLen - COLLISION_EPSILON_IN) {
    segments.push({ start: cursor, end: wallLen, beforeBoundary, afterBoundary: "island face end" });
  }
  if (segments.length === 0) {
    segments.push({ start: 0, end: wallLen, beforeBoundary: "island face start", afterBoundary: "island face end" });
  }
  const distanceTo = (segment: { start: number; end: number }) => {
    if (end < segment.start) return segment.start - end;
    if (start > segment.end) return start - segment.end;
    return 0;
  };
  const selected = segments.reduce((best, segment) => distanceTo(segment) < distanceTo(best) ? segment : best, segments[0]);
  const availableStart = selected.start;
  const availableEnd = selected.end;
  const availableSpan = Math.max(0, availableEnd - availableStart);
  let leftOverlap = 0;
  let rightOverlap = 0;
  const center = (start + end) / 2;
  for (const peer of peers) {
    const overlap = Math.min(end, peer.end) - Math.max(start, peer.start);
    if (overlap <= COLLISION_EPSILON_IN) continue;
    if ((peer.start + peer.end) / 2 <= center) leftOverlap = Math.max(leftOverlap, overlap);
    else rightOverlap = Math.max(rightOverlap, overlap);
  }
  const status = leftOverlap > 0 || rightOverlap > 0
    ? "overlap"
    : availableSpan + COLLISION_EPSILON_IN < requiredSpan
      ? "insufficient"
      : "fits";
  const snapStart = availableSpan + COLLISION_EPSILON_IN >= requiredSpan
    ? Math.max(availableStart, Math.min(start, availableEnd - requiredSpan))
    : availableStart;
  const snapEnd = snapStart + requiredSpan;
  const side = face === "front" ? "bottom" : face === "back" ? "top" : face === "left" ? "left" : "right";
  return {
    side,
    layer: moving.placement,
    seated: true,
    requiredSpan,
    start,
    end,
    wallLen,
    availableStart,
    availableEnd,
    availableSpan,
    before: Math.max(0, start - availableStart),
    after: Math.max(0, availableEnd - end),
    leftOverlap,
    rightOverlap,
    shortage: Math.max(0, requiredSpan - availableSpan),
    snapStart,
    snapEnd,
    snapBefore: Math.max(0, snapStart - availableStart),
    snapAfter: Math.max(0, availableEnd - snapEnd),
    beforeBoundary: selected.beforeBoundary,
    afterBoundary: selected.afterBoundary,
    status,
  };
}

export function inferredIslandFace(cabinet: PlacedCabinet, island: IslandZone): IslandFace {
  const footprint = placedFootprint(cabinet);
  const distances: Array<[IslandFace, number]> = [
    ["back", Math.abs(cabinet.y - island.y)],
    ["front", Math.abs(island.y + island.depth - (cabinet.y + footprint.d))],
    ["left", Math.abs(cabinet.x - island.x)],
    ["right", Math.abs(island.x + island.width - (cabinet.x + footprint.w))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  const nearestFace = distances[0]?.[0] ?? "front";
  const nearestDistance = distances[0]?.[1] ?? Number.POSITIVE_INFINITY;
  const declaredFace = cabinet.islandFace ?? null;
  if (!declaredFace) return nearestFace;

  const declaredDistance = distances.find(([face]) => face === declaredFace)?.[1] ?? Number.POSITIVE_INFINITY;
  // Older saved plans can retain an islandFace label after a cabinet was moved
  // onto another physical side of the island. Trust the persisted face only
  // when it still matches that edge; otherwise it must not reserve a run that
  // is visibly empty in the current island layout.
  return declaredDistance <= nearestDistance + 1 ? declaredFace : nearestFace;
}

export function islandOffsetForPlaced(cabinet: PlacedCabinet, island: IslandZone, face = inferredIslandFace(cabinet, island)): number {
  if (cabinet.islandFace === face && Number.isFinite(cabinet.islandOffset)) return Math.max(0, Number(cabinet.islandOffset));
  return face === "front" || face === "back" ? cabinet.x - island.x : cabinet.y - island.y;
}

export function nextIslandFacePlacement(cabinet: PlacedCabinet, island: IslandZone, face: IslandFace, placed: PlacedCabinet[]): PlacedCabinet | null {
  const runLength = Math.max(0, Number(cabinet.width) || 0);
  if (runLength <= 0 || runLength > islandFaceLength(island, face) + COLLISION_EPSILON_IN) return null;
  const occupied = placed
    // Earlier saved island plans did not persist islandFace. Infer those members
    // from their measured island position so a new cabinet (including SB36) can
    // extend the occupied face instead of being tested at a false overlapping start.
    .filter((item) => isOnIsland(item, island) && inferredIslandFace(item, island) === face)
    .map((item) => ({ start: islandOffsetForPlaced(item, island, face), end: islandOffsetForPlaced(item, island, face) + Math.max(0, Number(item.width) || 0) }))
    .sort((a, b) => a.start - b.start);
  // Same-face end points keep a run flush. Only perpendicular members expose
  // physical edges for legitimate L-shaped/end-cap configurations. An opposing
  // face shares the same run axis and must never offset a Back run away from
  // the Front run (or vice versa), which would leave a visible open island gap.
  const crossFaceEdges = placed
    .filter((item) => {
      if (!isOnIsland(item, island)) return false;
      const itemFace = inferredIslandFace(item, island);
      const faceUsesHorizontalRun = face === "front" || face === "back";
      const itemUsesHorizontalRun = itemFace === "front" || itemFace === "back";
      return faceUsesHorizontalRun !== itemUsesHorizontalRun;
    })
    .flatMap((item) => {
      const footprint = placedFootprint(item);
      return face === "front" || face === "back"
        ? [item.x - island.x, item.x + footprint.w - island.x]
        : [item.y - island.y, item.y + footprint.d - island.y];
    });
  const candidateStarts = Array.from(new Set([0, ...occupied.map((span) => span.end), ...crossFaceEdges]
    .map((value) => Math.max(0, Math.round(value * 8) / 8))))
    .sort((a, b) => a - b);
  for (const start of candidateStarts) {
    if (start + runLength > islandFaceLength(island, face) + COLLISION_EPSILON_IN) continue;
    if (occupied.some((span) => start < span.end - COLLISION_EPSILON_IN && start + runLength > span.start + COLLISION_EPSILON_IN)) continue;
    // A shallow wall cabinet selected for an island face must remain flush to
    // that exterior face. Pulling it inward to meet the opposing base run
    // leaves a visible void below the shared countertop.
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
	    countertopWidthAnchoredToZone: island.countertopDepthAnchoredToZone ?? false,
	    countertopDepthAnchoredToZone: island.countertopWidthAnchoredToZone ?? false,
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

export type IslandCountertopRect = { x: number; y: number; width: number; depth: number };
export type IslandSeatingOverhangIn = 10 | 12;

function islandCountertopSupportBounds(supports: PlacedCabinet[]): IslandCountertopRect | null {
  if (supports.length === 0) return null;
  const footprints = supports.map((item) => ({ item, footprint: placedFootprint(item) }));
  const minX = Math.min(...footprints.map(({ item }) => item.x));
  const minY = Math.min(...footprints.map(({ item }) => item.y));
  const maxX = Math.max(...footprints.map(({ item, footprint }) => item.x + footprint.w));
  const maxY = Math.max(...footprints.map(({ item, footprint }) => item.y + footprint.d));
  return { x: minX, y: minY, width: maxX - minX, depth: maxY - minY };
}

function countertopSupportsConnect(first: PlacedCabinet, second: PlacedCabinet): boolean {
  const a = placedFootprint(first);
  const b = placedFootprint(second);
  const gapX = Math.max(first.x - (second.x + b.w), second.x - (first.x + a.w), 0);
  const gapY = Math.max(first.y - (second.y + b.d), second.y - (first.y + a.d), 0);
  return gapX <= COLLISION_EPSILON_IN && gapY <= COLLISION_EPSILON_IN;
}

/**
 * Automatic island slabs follow connected cabinet support groups. This prevents
 * an empty plan-space gap from being hidden by one unsupported counter bridge.
 * A user-entered custom slab remains one intentional physical slab.
 */
export function islandCountertopRects(island: IslandZone, placed: PlacedCabinet[]): IslandCountertopRect[] {
  const supports = placed.filter((item) => isOnIsland(item, island) && bearsIslandCountertop(item));
  const allBounds = islandCountertopSupportBounds(supports);
  if (!allBounds) return [];
  const hasIntentionalSlab = island.countertopWidth != null || island.countertopDepth != null;
  if (hasIntentionalSlab) {
    const autoWidth = allBounds.width + ISLAND_COUNTERTOP_OVERHANG_IN * 2;
    const autoDepth = allBounds.depth + ISLAND_COUNTERTOP_OVERHANG_IN * 2;
    const width = island.countertopWidth ?? autoWidth;
    const depth = island.countertopDepth ?? autoDepth;
    const supportCenterX = allBounds.x + allBounds.width / 2;
    const supportCenterY = allBounds.y + allBounds.depth / 2;
    const centerX = (island.countertopWidthAnchoredToZone ? island.x + island.width / 2 : supportCenterX) + Number(island.countertopOffsetX ?? 0);
    const centerY = (island.countertopDepthAnchoredToZone ? island.y + island.depth / 2 : supportCenterY) + Number(island.countertopOffsetY ?? 0);
    return [{ x: centerX - width / 2, y: centerY - depth / 2, width, depth }];
  }
  const groups: PlacedCabinet[][] = [];
  const remaining = [...supports];
  while (remaining.length > 0) {
    const group = [remaining.shift()!];
    for (let index = 0; index < group.length; index++) {
      for (let candidate = remaining.length - 1; candidate >= 0; candidate--) {
        if (countertopSupportsConnect(group[index], remaining[candidate])) {
          group.push(remaining[candidate]);
          remaining.splice(candidate, 1);
        }
      }
    }
    groups.push(group);
  }
  return groups.flatMap((group) => {
    const bounds = islandCountertopSupportBounds(group);
    return bounds ? [{
      x: bounds.x - ISLAND_COUNTERTOP_OVERHANG_IN,
      y: bounds.y - ISLAND_COUNTERTOP_OVERHANG_IN,
      width: bounds.width + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
      depth: bounds.depth + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
    }] : [];
  });
}

/** Legacy single-slab measurement used by the 2D island attribute interface. */
export function islandCountertopRect(island: IslandZone, placed: PlacedCabinet[]): IslandCountertopRect | null {
  const slabs = islandCountertopRects(island, placed);
  if (slabs.length === 1) return slabs[0];
  const supports = placed.filter((item) => isOnIsland(item, island) && bearsIslandCountertop(item));
  const bounds = islandCountertopSupportBounds(supports);
  return bounds ? {
    x: bounds.x - ISLAND_COUNTERTOP_OVERHANG_IN,
    y: bounds.y - ISLAND_COUNTERTOP_OVERHANG_IN,
    width: bounds.width + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
    depth: bounds.depth + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
  } : null;
}

/**
 * Create one intentional island slab with seating projection on a selected
 * face. The stated 10- or 12-inch value is measured from that cabinet face;
 * the normal 1.5-inch reveal is retained on the other exposed slab edges.
 */
export function islandWithFaceSeatingOverhang(
  island: IslandZone,
  placed: PlacedCabinet[],
  face: IslandFace,
  overhangIn: IslandSeatingOverhangIn,
): IslandZone {
  const supports = placed.filter((item) => isOnIsland(item, island) && bearsIslandCountertop(item));
  const bounds = islandCountertopSupportBounds(supports);
  if (!bounds) return island;
  const extra = overhangIn - ISLAND_COUNTERTOP_OVERHANG_IN;
  if (face === "front") return {
    ...island,
    countertopWidth: bounds.width + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
    countertopDepth: bounds.depth + ISLAND_COUNTERTOP_OVERHANG_IN + overhangIn,
    countertopOffsetX: 0,
    countertopOffsetY: extra / 2,
    countertopWidthAnchoredToZone: false,
    countertopDepthAnchoredToZone: false,
  };
  if (face === "back") return {
    ...island,
    countertopWidth: bounds.width + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
    countertopDepth: bounds.depth + ISLAND_COUNTERTOP_OVERHANG_IN + overhangIn,
    countertopOffsetX: 0,
    countertopOffsetY: -extra / 2,
    countertopWidthAnchoredToZone: false,
    countertopDepthAnchoredToZone: false,
  };
  if (face === "left") return {
    ...island,
    countertopWidth: bounds.width + ISLAND_COUNTERTOP_OVERHANG_IN + overhangIn,
    countertopDepth: bounds.depth + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
    countertopOffsetX: -extra / 2,
    countertopOffsetY: 0,
    countertopWidthAnchoredToZone: false,
    countertopDepthAnchoredToZone: false,
  };
  return {
    ...island,
    countertopWidth: bounds.width + ISLAND_COUNTERTOP_OVERHANG_IN + overhangIn,
    countertopDepth: bounds.depth + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
    countertopOffsetX: extra / 2,
    countertopOffsetY: 0,
    countertopWidthAnchoredToZone: false,
    countertopDepthAnchoredToZone: false,
  };
}

/**
 * Polygon Room Geometry
 *
 * Provides types and helpers for non-rectangular (polygon) room shapes.
 * When a RoomData has `vertices` and `customWalls`, the room is treated as
 * a polygon; otherwise it falls back to the classic rectangle model.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

/** A vertex (corner) of the room polygon, in inches from the top-left origin. */
export interface RoomVertex {
  id: string;
  x: number;
  y: number;
}

/** A wall segment connecting two vertices. */
export interface CustomWall {
  id: string;
  startVertexId: string;
  endVertexId: string;
  /** User-facing label, e.g. "Back wall 1" */
  label?: string;
  /** Deliberate v1 diagonal direction; no free-form angle is persisted. */
  lockedAngle?: 45 | -45;
  /** Optional finished height for this selected wall segment in inches. */
  height?: number;
}

// ─── ID Generation ──────────────────────────────────────────────────────────────

let _counter = 0;
export function genVertexId(): string {
  return `v_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}
export function genWallId(): string {
  return `cw_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

// ─── Rectangle → Polygon Conversion ────────────────────────────────────────────

/**
 * Convert a simple width×depth rectangle into a polygon (4 vertices, 4 walls).
 * Vertex order: clockwise starting from top-left.
 *   v0 (0,0) ─── v1 (width,0)
 *    │                │
 *   v3 (0,depth) ── v2 (width,depth)
 *
 * Wall mapping to classic WallSide:
 *   top    = v0 → v1
 *   right  = v1 → v2
 *   bottom = v2 → v3
 *   left   = v3 → v0
 */
export function rectToPolygon(width: number, depth: number): {
  vertices: RoomVertex[];
  customWalls: CustomWall[];
} {
  const v0: RoomVertex = { id: genVertexId(), x: 0, y: 0 };
  const v1: RoomVertex = { id: genVertexId(), x: width, y: 0 };
  const v2: RoomVertex = { id: genVertexId(), x: width, y: depth };
  const v3: RoomVertex = { id: genVertexId(), x: 0, y: depth };

  const vertices = [v0, v1, v2, v3];
  const customWalls: CustomWall[] = [
    { id: genWallId(), startVertexId: v0.id, endVertexId: v1.id, label: "Back" },
    { id: genWallId(), startVertexId: v1.id, endVertexId: v2.id, label: "Right" },
    { id: genWallId(), startVertexId: v2.id, endVertexId: v3.id, label: "Front" },
    { id: genWallId(), startVertexId: v3.id, endVertexId: v0.id, label: "Left" },
  ];

  return { vertices, customWalls };
}

// ─── Geometry Helpers ───────────────────────────────────────────────────────────

/** Distance between two points. */
export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** Length of a wall segment in inches. */
export function wallSegmentLength(wall: CustomWall, vertices: RoomVertex[]): number {
  const start = vertices.find((v) => v.id === wall.startVertexId);
  const end = vertices.find((v) => v.id === wall.endVertexId);
  if (!start || !end) return 0;
  return dist(start, end);
}

/** Midpoint of a wall segment. */
export function wallMidpoint(wall: CustomWall, vertices: RoomVertex[]): { x: number; y: number } {
  const start = vertices.find((v) => v.id === wall.startVertexId);
  const end = vertices.find((v) => v.id === wall.endVertexId);
  if (!start || !end) return { x: 0, y: 0 };
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

/** Angle of a wall segment in radians (from start to end). */
export function wallAngle(wall: CustomWall, vertices: RoomVertex[]): number {
  const start = vertices.find((v) => v.id === wall.startVertexId);
  const end = vertices.find((v) => v.id === wall.endVertexId);
  if (!start || !end) return 0;
  return Math.atan2(end.y - start.y, end.x - start.x);
}

/** True only for the explicit v1 45-degree controls. */
export function isLocked45Wall(wall: CustomWall | null | undefined): wall is CustomWall & { lockedAngle: 45 | -45 } {
  return wall?.lockedAngle === 45 || wall?.lockedAngle === -45;
}

/**
 * Rotate one selected polygon segment to an exact, persisted 45-degree direction
 * while preserving its measured length. This changes only the segment end vertex.
 */
export function lockWallToAngle(
  wallId: string,
  angle: 45 | -45,
  vertices: RoomVertex[],
  customWalls: CustomWall[],
): { vertices: RoomVertex[]; customWalls: CustomWall[] } | null {
  const wall = customWalls.find((candidate) => candidate.id === wallId);
  const start = wall ? vertices.find((vertex) => vertex.id === wall.startVertexId) : null;
  const end = wall ? vertices.find((vertex) => vertex.id === wall.endVertexId) : null;
  if (!wall || !start || !end) return null;
  const length = Math.max(6, wallSegmentLength(wall, vertices));
  const radians = angle * Math.PI / 180;
  const nextVertices = vertices.map((vertex) => vertex.id === end.id
    ? { ...vertex, x: Math.round((start.x + Math.cos(radians) * length) * 8) / 8, y: Math.round((start.y + Math.sin(radians) * length) * 8) / 8 }
    : vertex,
  );
  const nextWalls = customWalls.map((candidate) => candidate.id === wallId ? { ...candidate, lockedAngle: angle } : candidate);
  return { vertices: nextVertices, customWalls: nextWalls };
}

/**
 * Snaps one endpoint near a diagonal to an exact supported 45-degree direction.
 * Returning null preserves the editor's regular 6-inch grid move for all other angles.
 */
export function snapWallEndpointNear45(
  wall: CustomWall,
  movingVertexId: string,
  target: { x: number; y: number },
  vertices: RoomVertex[],
): { x: number; y: number; lockedAngle: 45 | -45 } | null {
  const anchorId = wall.startVertexId === movingVertexId ? wall.endVertexId : wall.endVertexId === movingVertexId ? wall.startVertexId : null;
  const anchor = anchorId ? vertices.find((vertex) => vertex.id === anchorId) : null;
  if (!anchor) return null;
  const deltaX = target.x - anchor.x;
  const deltaY = target.y - anchor.y;
  if (Math.abs(Math.abs(deltaX) - Math.abs(deltaY)) > 8 || Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 6) return null;
  const run = Math.max(6, Math.round(((Math.abs(deltaX) + Math.abs(deltaY)) / 2) / 6) * 6);
  const x = anchor.x + (deltaX < 0 ? -run : run);
  const y = anchor.y + (deltaY < 0 ? -run : run);
  const directionX = wall.startVertexId === movingVertexId ? anchor.x - x : x - anchor.x;
  const directionY = wall.startVertexId === movingVertexId ? anchor.y - y : y - anchor.y;
  return { x, y, lockedAngle: directionX * directionY >= 0 ? 45 : -45 };
}

export type CompassWallAngle = 90 | 45 | -45;

export type CompassWallEdit = {
  /** Distance from this wall's start corner before the selected angled run begins. */
  angleStartIn: number;
  /** Measured length of the selected run after its angle begins. */
  lengthIn: number;
  /** Limited v1 geometry: existing straight bearing, +45°, or −45°. */
  angle: CompassWallAngle;
  /** Finished selected-wall height in inches, retained separately from room defaults. */
  heightIn: number;
};

/**
 * Edits one selected wall from the Compass dialog. An angled edit splits off a
 * straight approach segment when requested, then keeps the edited run exact at
 * +45° or −45°. A 90° edit retains the wall's current straight bearing.
 */
export function applyCompassWallEdit(
  wallId: string,
  edit: CompassWallEdit,
  vertices: RoomVertex[],
  customWalls: CustomWall[],
): { vertices: RoomVertex[]; customWalls: CustomWall[]; editedWallId: string } | null {
  const index = customWalls.findIndex((wall) => wall.id === wallId);
  const wall = customWalls[index];
  const start = wall ? vertices.find((vertex) => vertex.id === wall.startVertexId) : null;
  const end = wall ? vertices.find((vertex) => vertex.id === wall.endVertexId) : null;
  if (!wall || !start || !end) return null;

  const existingLength = Math.max(6, wallSegmentLength(wall, vertices));
  const startDistance = Math.max(0, Math.min(existingLength - 6, Math.round((Number(edit.angleStartIn) || 0) * 8) / 8));
  const length = Math.max(6, Math.round((Number(edit.lengthIn) || existingLength) * 8) / 8);
  const currentBearing = Math.atan2(end.y - start.y, end.x - start.x);
  const cardinalBearing = Math.round(currentBearing / (Math.PI / 2)) * (Math.PI / 2);
  const bearing = edit.angle === 90 ? cardinalBearing : edit.angle * Math.PI / 180;
  const prefixEnd = {
    x: Math.round((start.x + Math.cos(currentBearing) * startDistance) * 8) / 8,
    y: Math.round((start.y + Math.sin(currentBearing) * startDistance) * 8) / 8,
  };
  const coordinatePrecision = edit.angle === 90 ? 8 : 1000;
  const nextEnd = {
    x: Math.round((prefixEnd.x + Math.cos(bearing) * length) * coordinatePrecision) / coordinatePrecision,
    y: Math.round((prefixEnd.y + Math.sin(bearing) * length) * coordinatePrecision) / coordinatePrecision,
  };
  const editedWallId = startDistance > 0.01 ? genWallId() : wall.id;
  const pivot = startDistance > 0.01 ? { id: genVertexId(), ...prefixEnd } : null;
  const nextVertices = vertices
    .map((vertex) => vertex.id === end.id ? { ...vertex, ...nextEnd } : vertex)
    .flatMap((vertex) => pivot && vertex.id === start.id ? [vertex, pivot] : [vertex]);
  const editedWall: CustomWall = {
    ...wall,
    id: editedWallId,
    startVertexId: pivot?.id ?? wall.startVertexId,
    lockedAngle: edit.angle === 90 ? undefined : edit.angle,
    height: Math.max(34.5, Math.min(144, Math.round((Number(edit.heightIn) || wall.height || 96) * 8) / 8)),
  };
  const nextWalls = customWalls.flatMap((candidate, candidateIndex) => {
    if (candidateIndex !== index) return [candidate];
    if (!pivot) return [editedWall];
    return [
      { id: wall.id, startVertexId: wall.startVertexId, endVertexId: pivot.id, label: `${wall.label ?? "Wall"} approach` },
      { ...editedWall, label: wall.label },
    ];
  });
  return { vertices: nextVertices, customWalls: nextWalls, editedWallId };
}

/** Inward normal of a wall segment (points toward the room interior).
 *  Assumes vertices are ordered clockwise. */
export function wallInwardNormal(wall: CustomWall, vertices: RoomVertex[]): { nx: number; ny: number } {
  const angle = wallAngle(wall, vertices);
  // For clockwise polygon, inward normal is 90° clockwise from the wall direction.
  return { nx: Math.sin(angle), ny: -Math.cos(angle) };
}

/** Compute the bounding box of a set of vertices. */
export function polygonBounds(vertices: RoomVertex[]): {
  minX: number; minY: number; maxX: number; maxY: number; width: number; height: number;
} {
  if (vertices.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Compute the area of the polygon (shoelace formula). Returns positive for CW. */
export function polygonArea(vertices: RoomVertex[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

/** Check if vertices are ordered clockwise (positive signed area = CW for screen coords). */
export function isClockwise(vertices: RoomVertex[]): boolean {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  // In screen coordinates (Y down), positive signed area = clockwise.
  return area > 0;
}

/** Ensure vertices are in clockwise order (for consistent inward normals). */
export function ensureClockwise(vertices: RoomVertex[]): RoomVertex[] {
  if (isClockwise(vertices)) return vertices;
  return [...vertices].reverse();
}

// ─── Split Tool ─────────────────────────────────────────────────────────────────

/**
 * Split a wall segment at its midpoint, creating a new vertex and two new walls.
 * Returns the updated vertices and customWalls arrays.
 */
export function splitWall(
  wallId: string,
  vertices: RoomVertex[],
  customWalls: CustomWall[],
): { vertices: RoomVertex[]; customWalls: CustomWall[]; newVertexId: string } {
  const wallIdx = customWalls.findIndex((w) => w.id === wallId);
  if (wallIdx === -1) return { vertices, customWalls, newVertexId: "" };

  const wall = customWalls[wallIdx];
  const start = vertices.find((v) => v.id === wall.startVertexId);
  const end = vertices.find((v) => v.id === wall.endVertexId);
  if (!start || !end) return { vertices, customWalls, newVertexId: "" };

  // Create new vertex at midpoint.
  const newVertex: RoomVertex = {
    id: genVertexId(),
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };

  // Insert the new vertex into the vertices array (after the start vertex's index).
  const startIdx = vertices.findIndex((v) => v.id === wall.startVertexId);
  const newVertices = [...vertices];
  newVertices.splice(startIdx + 1, 0, newVertex);

  // Replace the original wall with two new walls.
  const wall1: CustomWall = {
    id: genWallId(),
    startVertexId: wall.startVertexId,
    endVertexId: newVertex.id,
    label: wall.label ? `${wall.label} (1)` : undefined,
  };
  const wall2: CustomWall = {
    id: genWallId(),
    startVertexId: newVertex.id,
    endVertexId: wall.endVertexId,
    label: wall.label ? `${wall.label} (2)` : undefined,
  };

  const newWalls = [...customWalls];
  newWalls.splice(wallIdx, 1, wall1, wall2);

  return { vertices: newVertices, customWalls: newWalls, newVertexId: newVertex.id };
}

// ─── Vertex Movement ────────────────────────────────────────────────────────────

/**
 * Move a vertex to a new position and recompute the bounding box.
 * Returns updated vertices and the new bounding box dimensions.
 */
export function moveVertex(
  vertexId: string,
  newX: number,
  newY: number,
  vertices: RoomVertex[],
): { vertices: RoomVertex[]; width: number; depth: number } {
  const updated = vertices.map((v) =>
    v.id === vertexId ? { ...v, x: newX, y: newY } : v,
  );
  const bounds = polygonBounds(updated);
  return { vertices: updated, width: bounds.width, depth: bounds.height };
}

/**
 * Normalize vertices so the minimum x/y is at (0,0).
 * This keeps the polygon anchored to the top-left origin.
 */
export function normalizeVertices(vertices: RoomVertex[]): RoomVertex[] {
  const bounds = polygonBounds(vertices);
  if (bounds.minX === 0 && bounds.minY === 0) return vertices;
  return vertices.map((v) => ({
    ...v,
    x: v.x - bounds.minX,
    y: v.y - bounds.minY,
  }));
}

// ─── Point-in-Polygon ───────────────────────────────────────────────────────────

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(px: number, py: number, vertices: RoomVertex[]): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── SVG Path ───────────────────────────────────────────────────────────────────

/** Generate an SVG path string from the vertices (closed polygon). */
export function verticesToSvgPath(vertices: RoomVertex[], ppi: number): string {
  if (vertices.length < 3) return "";
  const parts = vertices.map((v, i) => {
    const cmd = i === 0 ? "M" : "L";
    return `${cmd} ${v.x * ppi} ${v.y * ppi}`;
  });
  return parts.join(" ") + " Z";
}

/** Generate SVG polygon points attribute from vertices. */
export function verticesToPoints(vertices: RoomVertex[], ppi: number): string {
  return vertices.map((v) => `${v.x * ppi},${v.y * ppi}`).join(" ");
}

// ─── Merge Walls (undo split) ───────────────────────────────────────────────────

/**
 * Merge two adjacent walls back into one by removing the shared vertex.
 * The first wall's start and the second wall's end become the merged wall's endpoints.
 */
export function mergeWalls(
  wallId1: string,
  wallId2: string,
  vertices: RoomVertex[],
  customWalls: CustomWall[],
): { vertices: RoomVertex[]; customWalls: CustomWall[] } | null {
  const w1 = customWalls.find((w) => w.id === wallId1);
  const w2 = customWalls.find((w) => w.id === wallId2);
  if (!w1 || !w2) return null;

  // They must share a vertex: w1.endVertexId === w2.startVertexId
  if (w1.endVertexId !== w2.startVertexId) return null;

  const sharedVertexId = w1.endVertexId;

  // Create merged wall.
  const merged: CustomWall = {
    id: genWallId(),
    startVertexId: w1.startVertexId,
    endVertexId: w2.endVertexId,
    label: w1.label?.replace(/ \(\d+\)$/, "") || w2.label?.replace(/ \(\d+\)$/, ""),
  };

  // Remove the shared vertex (only if it's not used by any other wall).
  const otherWalls = customWalls.filter((w) => w.id !== wallId1 && w.id !== wallId2);
  const vertexUsedElsewhere = otherWalls.some(
    (w) => w.startVertexId === sharedVertexId || w.endVertexId === sharedVertexId,
  );

  const newVertices = vertexUsedElsewhere
    ? vertices
    : vertices.filter((v) => v.id !== sharedVertexId);

  // Replace the two walls with the merged one (at the position of the first).
  const idx1 = customWalls.findIndex((w) => w.id === wallId1);
  const idx2 = customWalls.findIndex((w) => w.id === wallId2);
  const newWalls = [...customWalls];
  // Remove in reverse order to avoid index shift issues.
  if (idx1 < idx2) {
    newWalls.splice(idx2, 1);
    newWalls.splice(idx1, 1, merged);
  } else {
    newWalls.splice(idx1, 1);
    newWalls.splice(idx2, 1, merged);
  }

  return { vertices: newVertices, customWalls: newWalls };
}

// ─── Closest Wall to a Point ────────────────────────────────────────────────────

/** Find the closest wall segment to a given point (for cabinet assignment). */
export function closestWall(
  px: number,
  py: number,
  vertices: RoomVertex[],
  customWalls: CustomWall[],
): CustomWall | null {
  let minDist = Infinity;
  let closest: CustomWall | null = null;

  for (const wall of customWalls) {
    const start = vertices.find((v) => v.id === wall.startVertexId);
    const end = vertices.find((v) => v.id === wall.endVertexId);
    if (!start || !end) continue;

    const d = pointToSegmentDist(px, py, start.x, start.y, end.x, end.y);
    if (d < minDist) {
      minDist = d;
      closest = wall;
    }
  }

  return closest;
}

/** Distance from a point to a line segment. */
function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist({ x: px, y: py }, { x: x1, y: y1 });

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return dist({ x: px, y: py }, { x: projX, y: projY });
}

// ─── Position Along Wall ────────────────────────────────────────────────────────

/**
 * Project a point onto a wall segment and return the distance along the wall
 * from the start vertex (in inches). Used for cabinet placement on polygon walls.
 */
export function positionAlongWall(
  px: number,
  py: number,
  wall: CustomWall,
  vertices: RoomVertex[],
): number {
  const start = vertices.find((v) => v.id === wall.startVertexId);
  const end = vertices.find((v) => v.id === wall.endVertexId);
  if (!start || !end) return 0;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;

  const t = Math.max(0, Math.min(1, ((px - start.x) * dx + (py - start.y) * dy) / lenSq));
  return t * Math.sqrt(lenSq);
}

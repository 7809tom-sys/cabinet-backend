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

// ─── Shape Presets (Bump-Out / Inset) ──────────────────────────────────────────

/**
 * Add an open-square (bay/bump-out) shape to a wall segment.
 *
 * The shape is a rectangular protrusion or recess centered on the wall.
 * - `shapeWidth` (inches): how wide the shape is along the wall (default = wall length / 2)
 * - `shapeDepth` (inches): how deep the protrusion/recess extends from the wall
 * - `direction`: "out" = bump-out (extends outward), "in" = inset (recesses inward)
 *
 * The original wall is replaced with 5 segments:
 *   left-stub → left-corner → back → right-corner → right-stub
 */
export function addOpenSquare(
  wallId: string,
  vertices: RoomVertex[],
  customWalls: CustomWall[],
  shapeWidth: number,
  shapeDepth: number,
  direction: "in" | "out",
): { vertices: RoomVertex[]; customWalls: CustomWall[] } | null {
  const wallIdx = customWalls.findIndex((w) => w.id === wallId);
  if (wallIdx === -1) return null;

  const wall = customWalls[wallIdx];
  const start = vertices.find((v) => v.id === wall.startVertexId);
  const end = vertices.find((v) => v.id === wall.endVertexId);
  if (!start || !end) return null;

  const wallLen = dist(start, end);
  if (shapeWidth >= wallLen) return null; // shape must be narrower than the wall

  // Unit vector along the wall (start → end)
  const ux = (end.x - start.x) / wallLen;
  const uy = (end.y - start.y) / wallLen;

  // Inward normal (for CW polygon, inward is 90° CW from wall direction)
  const inNx = uy;
  const inNy = -ux;

  // Sign: "out" = outward (opposite of inward normal), "in" = inward
  const sign = direction === "out" ? -1 : 1;
  const nx = inNx * sign;
  const ny = inNy * sign;

  // Center offset along the wall
  const leftOffset = (wallLen - shapeWidth) / 2;
  const rightOffset = leftOffset + shapeWidth;

  // 4 new vertices
  const vL1: RoomVertex = { id: genVertexId(), x: start.x + ux * leftOffset, y: start.y + uy * leftOffset };
  const vL2: RoomVertex = { id: genVertexId(), x: vL1.x + nx * shapeDepth, y: vL1.y + ny * shapeDepth };
  const vR2: RoomVertex = { id: genVertexId(), x: start.x + ux * rightOffset + nx * shapeDepth, y: start.y + uy * rightOffset + ny * shapeDepth };
  const vR1: RoomVertex = { id: genVertexId(), x: start.x + ux * rightOffset, y: start.y + uy * rightOffset };

  // Insert new vertices after the start vertex
  const startIdx = vertices.findIndex((v) => v.id === wall.startVertexId);
  const newVertices = [...vertices];
  newVertices.splice(startIdx + 1, 0, vL1, vL2, vR2, vR1);

  // Replace original wall with 5 new walls
  const label = wall.label || "";
  const newWalls: CustomWall[] = [
    { id: genWallId(), startVertexId: wall.startVertexId, endVertexId: vL1.id, label: label ? `${label} (L)` : undefined },
    { id: genWallId(), startVertexId: vL1.id, endVertexId: vL2.id, label: direction === "out" ? "Bay L" : "Recess L" },
    { id: genWallId(), startVertexId: vL2.id, endVertexId: vR2.id, label: direction === "out" ? "Bay Back" : "Recess Back" },
    { id: genWallId(), startVertexId: vR2.id, endVertexId: vR1.id, label: direction === "out" ? "Bay R" : "Recess R" },
    { id: genWallId(), startVertexId: vR1.id, endVertexId: wall.endVertexId, label: label ? `${label} (R)` : undefined },
  ];

  const updatedWalls = [...customWalls];
  updatedWalls.splice(wallIdx, 1, ...newWalls);

  return { vertices: newVertices, customWalls: updatedWalls };
}

/**
 * Add a half-circle (semicircular) bump-out or inset to a wall segment.
 *
 * The arc is approximated with `segments` straight-line segments (default 8).
 * - `shapeWidth` (inches): diameter of the semicircle along the wall
 * - `direction`: "out" = bump-out, "in" = inset
 *
 * The original wall is replaced with (segments + 2) segments:
 *   left-stub → arc segments → right-stub
 */
export function addHalfCircle(
  wallId: string,
  vertices: RoomVertex[],
  customWalls: CustomWall[],
  shapeWidth: number,
  direction: "in" | "out",
  segments = 8,
): { vertices: RoomVertex[]; customWalls: CustomWall[] } | null {
  const wallIdx = customWalls.findIndex((w) => w.id === wallId);
  if (wallIdx === -1) return null;

  const wall = customWalls[wallIdx];
  const start = vertices.find((v) => v.id === wall.startVertexId);
  const end = vertices.find((v) => v.id === wall.endVertexId);
  if (!start || !end) return null;

  const wallLen = dist(start, end);
  if (shapeWidth >= wallLen) return null;

  const radius = shapeWidth / 2;

  // Unit vector along the wall
  const ux = (end.x - start.x) / wallLen;
  const uy = (end.y - start.y) / wallLen;

  // Inward normal
  const inNx = uy;
  const inNy = -ux;

  // Sign: "out" = outward, "in" = inward
  const sign = direction === "out" ? -1 : 1;
  const nx = inNx * sign;
  const ny = inNy * sign;

  // Center of the semicircle on the wall
  const leftOffset = (wallLen - shapeWidth) / 2;
  const cx = start.x + ux * (leftOffset + radius);
  const cy = start.y + uy * (leftOffset + radius);

  // Left stub endpoint
  const vL: RoomVertex = { id: genVertexId(), x: start.x + ux * leftOffset, y: start.y + uy * leftOffset };
  // Right stub endpoint
  const vR: RoomVertex = { id: genVertexId(), x: start.x + ux * (leftOffset + shapeWidth), y: start.y + uy * (leftOffset + shapeWidth) };

  // Generate arc vertices (semicircle from left to right, bulging outward)
  // The arc goes from angle π (left side) to 0 (right side) in local space,
  // but we need to map to world space using the wall's coordinate system.
  const arcVertices: RoomVertex[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 0 → 1
    const angle = Math.PI * (1 - t); // π → 0 (left to right)
    // In local wall space: x along wall, y perpendicular (outward)
    const localX = Math.cos(angle) * radius; // -radius → +radius
    const localY = -Math.sin(angle) * radius; // 0 → -radius → 0 (arc peak at center)

    // Transform to world space
    const wx = cx + ux * localX + nx * (-localY);
    const wy = cy + uy * localX + ny * (-localY);
    arcVertices.push({ id: genVertexId(), x: wx, y: wy });
  }

  // Insert new vertices: vL, arc[0..segments], vR
  const startIdx = vertices.findIndex((v) => v.id === wall.startVertexId);
  const newVertices = [...vertices];
  newVertices.splice(startIdx + 1, 0, vL, ...arcVertices, vR);

  // Build walls: left-stub, arc segments, right-stub
  const label = wall.label || "";
  const newWalls: CustomWall[] = [];

  // Left stub
  newWalls.push({ id: genWallId(), startVertexId: wall.startVertexId, endVertexId: vL.id, label: label ? `${label} (L)` : undefined });

  // Arc segments
  const allArcIds = [vL.id, ...arcVertices.map((v) => v.id), vR.id];
  for (let i = 0; i < allArcIds.length - 1; i++) {
    newWalls.push({
      id: genWallId(),
      startVertexId: allArcIds[i],
      endVertexId: allArcIds[i + 1],
      label: i === Math.floor((allArcIds.length - 1) / 2) ? (direction === "out" ? "Arc" : "Arc (in)") : undefined,
    });
  }

  // Right stub
  newWalls.push({ id: genWallId(), startVertexId: vR.id, endVertexId: wall.endVertexId, label: label ? `${label} (R)` : undefined });

  const updatedWalls = [...customWalls];
  updatedWalls.splice(wallIdx, 1, ...newWalls);

  return { vertices: newVertices, customWalls: updatedWalls };
}

// ─── Kitchen Design geometry & snapping engine ──────────────────────────────
// All real-world units are INCHES. The canvas converts inches → pixels via PPI.

export const STD = {
  BASE_HEIGHT: 34.5,
  BASE_DEPTH: 24,
  COUNTERTOP_THICKNESS: 1.5,
  COUNTERTOP_HEIGHT: 36,
  WALL_HEIGHT: 30,
  WALL_DEPTH: 12,
  WALL_MOUNT_BOTTOM: 54,
  TALL_HEIGHT: 84,
  TALL_DEPTH: 24,
  TOE_KICK: 4.5,
  SNAP_THRESHOLD: 6,
};

export type Placement = "base" | "wall" | "tall";

export interface DesignCabinet {
  id: number;
  masterCode: string;
  description: string;
  category: string | null;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  placement: Placement;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  isCornerCabinet: boolean | null;
}

export interface PlacedCabinet {
  uid: string;
  cabinetId: number;
  masterCode: string;
  description: string;
  placement: Placement;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
}

export interface RoomData {
  width: number;
  depth: number;
}

export const DEFAULT_ROOM: RoomData = { width: 144, depth: 120 };

export function dim(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseFloat(value);
  return isNaN(n) || n <= 0 ? fallback : n;
}

export function footprintDepth(c: DesignCabinet): number {
  if (c.placement === "wall") return dim(c.depth, STD.WALL_DEPTH);
  if (c.placement === "tall") return dim(c.depth, STD.TALL_DEPTH);
  return dim(c.depth, STD.BASE_DEPTH);
}

export function rotatedSize(p: PlacedCabinet): { w: number; d: number } {
  const rot = ((p.rotation % 360) + 360) % 360;
  if (rot === 90 || rot === 270) {
    return { w: p.depth, d: p.width };
  }
  return { w: p.width, d: p.depth };
}

export function snapPosition(
  moving: PlacedCabinet,
  room: RoomData,
  others: PlacedCabinet[]
): { x: number; y: number; snappedWall: boolean } {
  const { w, d } = rotatedSize(moving);
  let x = moving.x;
  let y = moving.y;
  let snappedWall = false;

  const T = STD.SNAP_THRESHOLD;

  if (Math.abs(x - 0) <= T) { x = 0; snappedWall = true; }
  if (Math.abs(x + w - room.width) <= T) { x = room.width - w; snappedWall = true; }
  if (Math.abs(y - 0) <= T) { y = 0; snappedWall = true; }
  if (Math.abs(y + d - room.depth) <= T) { y = room.depth - d; snappedWall = true; }

  for (const o of others) {
    if (o.uid === moving.uid) continue;
    const os = rotatedSize(o);

    const yOverlap = y < o.y + os.d && y + d > o.y;
    if (yOverlap) {
      if (Math.abs(x + w - o.x) <= T) { x = o.x - w; y = o.y; }
      if (Math.abs(x - (o.x + os.w)) <= T) { x = o.x + os.w; y = o.y; }
    }

    const xOverlap = x < o.x + os.w && x + w > o.x;
    if (xOverlap) {
      if (Math.abs(y + d - o.y) <= T) { y = o.y - d; x = o.x; }
      if (Math.abs(y - (o.y + os.d)) <= T) { y = o.y + os.d; x = o.x; }
    }
  }

  x = Math.max(0, Math.min(x, room.width - w));
  y = Math.max(0, Math.min(y, room.depth - d));

  return { x, y, snappedWall };
}

export function hasCollision(moving: PlacedCabinet, others: PlacedCabinet[]): boolean {
  const { w, d } = rotatedSize(moving);
  for (const o of others) {
    if (o.uid === moving.uid) continue;
    if (o.placement !== moving.placement) continue;
    const os = rotatedSize(o);
    const overlap =
      moving.x < o.x + os.w &&
      moving.x + w > o.x &&
      moving.y < o.y + os.d &&
      moving.y + d > o.y;
    if (overlap) return true;
  }
  return false;
}

export function elevationBox(p: PlacedCabinet): { bottom: number; height: number } {
  if (p.placement === "wall") {
    return { bottom: STD.WALL_MOUNT_BOTTOM, height: STD.WALL_HEIGHT };
  }
  if (p.placement === "tall") {
    return { bottom: 0, height: STD.TALL_HEIGHT };
  }
  return { bottom: 0, height: STD.COUNTERTOP_HEIGHT };
}

// Find the next free position along the back wall so newly-added cabinets
// march left-to-right against the wall instead of stacking on the same spot.
export function nextFreeSpot(
  width: number,
  depth: number,
  placement: Placement,
  room: RoomData,
  existing: PlacedCabinet[]
): { x: number; y: number } {
  // Wall cabinets sit on the back wall (y=0). Base/tall also default to back wall.
  const y = 0;
  // Only consider cabinets on the same layer (so a wall cab can sit above a base cab).
  const sameLayer = existing.filter((p) => p.placement === placement);
  // March along x at the back wall, packing flush against the rightmost neighbor.
  let x = 0;
  const rowItems = sameLayer
    .filter((p) => p.y < depth) // anything near the back wall band
    .sort((a, b) => a.x - b.x);
  for (const item of rowItems) {
    const iw = rotatedSize(item).w;
    // If the candidate slot [x, x+width] overlaps this item, push past it.
    if (x < item.x + iw && x + width > item.x) {
      x = item.x + iw;
    }
  }
  // If it runs off the right edge, drop to a second row offset from the wall.
  if (x + width > room.width) {
    x = 0;
    return { x, y: Math.min(depth - height_safe(depth, placement), depth * 0.45) };
  }
  return { x, y };
}

function height_safe(roomDepth: number, _placement: Placement): number {
  return Math.min(roomDepth, 24);
}

let uidCounter = 0;
export function makeUid(): string {
  uidCounter += 1;
  return `c${Date.now().toString(36)}_${uidCounter}`;
}

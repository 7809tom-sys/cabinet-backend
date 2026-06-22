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
  // Finished end panels, decorative door panels, and skins are 3/4" stock.
  PANEL_THICKNESS: 0.75,
};

// True for finished end panels, decorative panels, refrigerator/dishwasher
// skins, and door panels — all of which are 3/4" thick flat stock.
export function isPanelItem(c: { description?: string | null; masterCode?: string | null; subCategory?: string | null }): boolean {
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""}`.toLowerCase();
  // Match "panel"/"skin" but not unrelated words like "panelized".
  return /\bpanel\b|\bskin\b|end panel|dishwasher panel|refrigerator panel|decorative panel/.test(hay);
}

export type Placement = "base" | "wall" | "tall" | "appliance";

// Synthetic appliance catalog. Appliances are not cabinets (no DB row / price),
// so they carry id = 0 and are skipped by the pricing engine. Dimensions are in
// inches; `elevHeight` and `elevBottom` describe how they sit on the wall in the
// front elevation view.
export interface ApplianceDef {
  key: string;
  masterCode: string;
  description: string;
  width: number;
  depth: number;
  elevBottom: number; // inches from floor
  elevHeight: number; // visible height in elevation
}

export const APPLIANCES: ApplianceDef[] = [
  { key: "range", masterCode: "RANGE-30", description: 'Range / Stove 30"', width: 30, depth: 25, elevBottom: 0, elevHeight: 36 },
  { key: "fridge", masterCode: "FRIDGE-36", description: 'Refrigerator 36"', width: 36, depth: 30, elevBottom: 0, elevHeight: 70 },
  { key: "dishwasher", masterCode: "DW-24", description: 'Dishwasher 24"', width: 24, depth: 24, elevBottom: 0, elevHeight: 34.5 },
  { key: "sink", masterCode: "SINK-33", description: 'Sink 33"', width: 33, depth: 22, elevBottom: 30, elevHeight: 6 },
  { key: "hood", masterCode: "HOOD-30", description: 'Range Hood 30"', width: 30, depth: 18, elevBottom: 66, elevHeight: 18 },
  { key: "microwave", masterCode: "MW-30", description: 'Over-Range Microwave 30"', width: 30, depth: 15, elevBottom: 54, elevHeight: 17 },
];

export function isApplianceCode(masterCode: string): boolean {
  return /^(RANGE|FRIDGE|DW|SINK|HOOD|MW)-/.test((masterCode || "").toUpperCase());
}

// Convert an appliance definition into a DesignCabinet-like object so it flows
// through the same add/drag/drop placement pipeline as cabinets.
export function applianceAsDesignCabinet(a: ApplianceDef): DesignCabinet {
  return {
    id: 0,
    masterCode: a.masterCode,
    description: a.description,
    category: "Appliance",
    subCategory: null,
    width: String(a.width),
    height: String(a.elevHeight),
    depth: String(a.depth),
    placement: "appliance",
    numberOfDoors: null,
    numberOfDrawers: null,
    isCornerCabinet: false,
  };
}

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
  // Panels/skins are flat 3/4" stock regardless of placement bucket.
  if (isPanelItem(c)) return dim(c.depth, STD.PANEL_THICKNESS) || STD.PANEL_THICKNESS;
  // Panels/skins are flat 3/4" stock regardless of placement bucket.
  if (isPanelItem(c)) return dim(c.depth, STD.PANEL_THICKNESS) || STD.PANEL_THICKNESS;
  if (c.placement === "wall") return dim(c.depth, STD.WALL_DEPTH);
  if (c.placement === "tall") return dim(c.depth, STD.TALL_DEPTH);
  if (c.placement === "appliance") return dim(c.depth, STD.BASE_DEPTH);
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
  if (p.placement === "appliance") {
    const def = APPLIANCES.find((a) => a.masterCode === p.masterCode);
    if (def) return { bottom: def.elevBottom, height: def.elevHeight };
    return { bottom: 0, height: STD.COUNTERTOP_HEIGHT };
  }
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

// ─── Corner cabinet detection & L-shape rendering ───────────────────────────
// Corner cabinets (Lazy Susan, blind corner, diagonal corner, easy-reach corner)
// occupy an L-shaped footprint in plan view, not a plain square. We detect them
// by masterCode prefix so both placed packages and palette drops render correctly.
export function isCornerCabinet(masterCode: string, description?: string): boolean {
  const code = (masterCode || "").toUpperCase();
  if (/^(BBC|WBC|BLB|LSB|BEC|CSB|WLS|DCW|DCB|ER)/.test(code)) return true;
  if (/-CNR|CORNER/.test(code)) return true;
  const desc = (description || "").toLowerCase();
  return /corner|lazy susan|easy reach|blind/.test(desc);
}

// Returns a CSS clip-path polygon describing an L-shape inscribed in the
// cabinet's bounding box. The "notch" is cut from the corner pointing toward
// the room interior, chosen from the cabinet's rotation so the two legs hug the
// two adjacent walls. `legRatio` is the fraction of each side kept as a leg.
export function cornerClipPath(rotation: number, legRatio = 0.55): string {
  const r = ((rotation % 360) + 360) % 360;
  const k = Math.round(legRatio * 100); // leg length as %
  // Default (rot 0): legs along top + left, notch cut from bottom-right (interior).
  switch (r) {
    case 90: // notch bottom-left
      return `polygon(0 0, 100% 0, 100% 100%, ${k}% 100%, ${k}% ${k}%, 0 ${k}%)`;
    case 180: // notch top-left
      return `polygon(${100 - k}% 0, 100% 0, 100% 100%, 0 100%, 0 ${k}%, ${100 - k}% ${k}%)`;
    case 270: // notch top-right
      return `polygon(0 0, ${k}% 0, ${k}% ${k}%, 100% ${k}%, 100% 100%, 0 100%)`;
    default: // 0 — notch bottom-right
      return `polygon(0 0, 100% 0, 100% ${k}%, ${k}% ${k}%, ${k}% 100%, 0 100%)`;
  }
}

// Center-to-center distance between two placed cabinets, in inches.
export function centerDistance(a: PlacedCabinet, b: PlacedCabinet): number {
  const sa = rotatedSize(a);
  const sb = rotatedSize(b);
  const ax = a.x + sa.w / 2;
  const ay = a.y + sa.d / 2;
  const bx = b.x + sb.w / 2;
  const by = b.y + sb.d / 2;
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

// Format an inch value as feet'inches" for readable callouts.
export function formatInches(inches: number): string {
  const rounded = Math.round(inches);
  const ft = Math.floor(rounded / 12);
  const inch = rounded % 12;
  if (ft <= 0) return `${rounded}"`;
  return inch === 0 ? `${ft}'` : `${ft}' ${inch}"`;
}

// ─── Doors & Windows (wall openings) ────────────────────────────────────────
// A wall opening is anchored to one of the four room walls and positioned by an
// offset (inches from the wall's start corner). Width is along the wall; for
// elevation, sillHeight is inches from floor to the bottom of the opening and
// height is the vertical size. Doors typically sit on the floor (sill 0).
export type WallSide = "top" | "bottom" | "left" | "right";
export type OpeningKind = "door" | "window";

export interface OpeningDef {
  key: string;
  kind: OpeningKind;
  label: string;
  width: number; // along the wall
  height: number; // vertical (elevation)
  sill: number; // inches from floor to bottom of opening
}

export const OPENINGS: OpeningDef[] = [
  { key: "entry-door", kind: "door", label: 'Entry Door 36"', width: 36, height: 80, sill: 0 },
  { key: "interior-door", kind: "door", label: 'Interior Door 30"', width: 30, height: 80, sill: 0 },
  { key: "patio-door", kind: "door", label: 'Patio / Sliding 72"', width: 72, height: 80, sill: 0 },
  { key: "window-std", kind: "window", label: 'Window 36"', width: 36, height: 36, sill: 42 },
  { key: "window-wide", kind: "window", label: 'Window 60"', width: 60, height: 36, sill: 42 },
  { key: "window-over-sink", kind: "window", label: 'Over-Sink Window 30"', width: 30, height: 30, sill: 44 },
];

export interface WallOpening {
  uid: string;
  kind: OpeningKind;
  label: string;
  side: WallSide;
  offset: number; // inches from the wall start (left for top/bottom, top for left/right)
  width: number;
  height: number;
  sill: number;
}

export function wallLength(side: WallSide, room: RoomData): number {
  return side === "top" || side === "bottom" ? room.width : room.depth;
}

// Clamp an opening's offset so it stays within its wall.
export function clampOpening(o: WallOpening, room: RoomData): WallOpening {
  const len = wallLength(o.side, room);
  const width = Math.max(6, Math.min(o.width, len));
  const offset = Math.max(0, Math.min(o.offset, len - width));
  return { ...o, width, offset };
}

export function makeOpening(def: OpeningDef, side: WallSide, room: RoomData): WallOpening {
  const len = wallLength(side, room);
  const offset = Math.max(0, (len - def.width) / 2);
  return clampOpening(
    {
      uid: makeUid(),
      kind: def.kind,
      label: def.label,
      side,
      offset,
      width: def.width,
      height: def.height,
      sill: def.sill,
    },
    room
  );
}

let uidCounter = 0;
export function makeUid(): string {
  uidCounter += 1;
  return `c${Date.now().toString(36)}_${uidCounter}`;
}

// ─── Finish / trim color mapping ────────────────────────────────────────────
// When a user picks a door style ("trim"), placed cabinets re-skin to that
// finish on the canvas + elevation. We derive a representative fill color from
// the style code/name so the design updates instantly without per-style image
// assets. Falls back to a warm wood tone.
export interface FinishColors {
  face: string; // cabinet door/face fill
  edge: string; // darker edge/shadow line
  label: string; // text color that stays legible on the face
}

const FINISH_BY_KEYWORD: { match: RegExp; face: string; edge: string; label: string }[] = [
  { match: /white|snow|arctic|alpine|pearl|dove/, face: "#f3f1ec", edge: "#cfc9bf", label: "#3a3a3a" },
  { match: /grey|gray|stone|pewter|graphite|slate|fog/, face: "#9aa0a6", edge: "#6f747a", label: "#1f2937" },
  { match: /navy|blue|indigo|ocean/, face: "#3b4d63", edge: "#26354a", label: "#f8fafc" },
  { match: /green|sage|forest|hunter/, face: "#566f5a", edge: "#3c4f40", label: "#f8fafc" },
  { match: /black|onyx|carbon|espresso|java/, face: "#2b2b2e", edge: "#161618", label: "#f5f5f5" },
  { match: /cherry|mahogany|chestnut|cinnamon|spice/, face: "#7a4a32", edge: "#5a3422", label: "#fbeee6" },
  { match: /honey|oak|natural|maple|wheat|amber|toffee/, face: "#c08a4e", edge: "#9a6a36", label: "#3a2410" },
  { match: /walnut|mocha|coffee|chocolate|brown/, face: "#6b4a32", edge: "#4c3422", label: "#fbeee6" },
  { match: /cream|almond|biscuit|linen|sand|beige|tan/, face: "#e6dcc6", edge: "#c7b79a", label: "#3a3526" },
];

const DEFAULT_FINISH: FinishColors = { face: "#c79a63", edge: "#a07a45", label: "#3a2410" };
export const DEFAULT_FINISH_COLORS = DEFAULT_FINISH;

// Door-panel treatment derived from the door-style family name. Used to render
// the correct front detail (recessed Shaker frame, raised center, flat slab,
// beaded boards, stacked double-shaker) on door swatches AND on placed cabinets
// in the elevation view, so picking a style visibly changes the door look.
export type DoorPanelKind = "shaker" | "raised" | "slab" | "beaded" | "inset" | "double-shaker";
export function doorPanelKind(doorStyle?: string | null): DoorPanelKind {
  const s = (doorStyle ?? "").toLowerCase();
  if (/double/.test(s)) return "double-shaker";
  if (/raised|cathedral|arch/.test(s)) return "raised";
  if (/slab|flat|contemporary|euro|modern/.test(s)) return "slab";
  if (/bead/.test(s)) return "beaded";
  if (/inset/.test(s)) return "inset";
  return "shaker";
}

export function finishColors(styleCodeOrName?: string | null): FinishColors {
  const s = (styleCodeOrName || "").toLowerCase();
  for (const f of FINISH_BY_KEYWORD) {
    if (f.match.test(s)) return { face: f.face, edge: f.edge, label: f.label };
  }
  return DEFAULT_FINISH;
}

// ─── Crown molding & toe kick (design trim, rendered in elevation) ──────────
// These are toggleable trim layers in the Design Tool. Crown runs along the top
// of every wall cabinet; toe kick is the recessed strip under base/tall cabinets.
// Linear footage for the BOM is derived from the combined widths of the relevant
// cabinets (wall widths for crown, base+tall widths for toe kick).
export const CROWN_HEIGHT_IN = 3;     // visual crown band height in elevation
export const TOE_KICK_HEIGHT_IN = STD.TOE_KICK; // 4.5"
// Any mitered trim (crown, light rail, decorative molding) loses length at the
// 45° corner cuts, so each continuous wall run needs extra material. Trade rule
// of thumb: add 3" to each wall's run (e.g. a 12" wall needs a 15" cut). The
// allowance is applied once per WALL the trim runs along — not per cabinet —
// because trim runs continuously and is only mitered where walls meet.
export const MITER_ALLOWANCE_IN = 3;
// Back-compat alias.
export const CROWN_MITER_ALLOWANCE_IN = MITER_ALLOWANCE_IN;

// Which of the four walls is this cabinet sitting against? Falls back to the
// nearest wall by orientation when it's not flush within tolerance.
export function cabinetWall(p: PlacedCabinet, room: RoomData): WallSide {
  const sides: WallSide[] = ["top", "bottom", "left", "right"];
  for (const s of sides) {
    if (isAgainstWall(p, s, room)) return s;
  }
  // Not flush: pick by rotation orientation, then nearest edge.
  const horizontal = ((Math.round(p.rotation) % 180) + 180) % 180 === 0;
  const { w, d } = rotatedSize(p);
  if (horizontal) {
    return p.y + d / 2 < room.depth / 2 ? "top" : "bottom";
  }
  return p.x + w / 2 < room.width / 2 ? "left" : "right";
}

// Sum a mitered trim run grouped by wall, adding the miter allowance once per
// wall that actually has trim on it. `cabs` are the cabinets the trim runs over.
export function miteredTrimInches(cabs: PlacedCabinet[], room: RoomData): number {
  if (cabs.length === 0) return 0;
  const perWall: Record<WallSide, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const p of cabs) {
    perWall[cabinetWall(p, room)] += rotatedSize(p).w;
  }
  let total = 0;
  (Object.keys(perWall) as WallSide[]).forEach((side) => {
    if (perWall[side] > 0) total += perWall[side] + MITER_ALLOWANCE_IN;
  });
  return total;
}

// Crown runs along the top of wall cabinets, grouped per wall with miter
// allowance. Requires the room to know which wall each cabinet is on.
export function crownLinearInches(placed: PlacedCabinet[], room?: RoomData): number {
  // Crown caps the top of upper (wall) cabinets and tall pantry/oven cabinets.
  const wallCabs = placed.filter((p) => p.placement === "wall" || p.placement === "tall");
  if (wallCabs.length === 0) return 0;
  if (!room) {
    // No room context: fall back to a single continuous run + one allowance.
    const run = wallCabs.reduce((s, p) => s + rotatedSize(p).w, 0);
    return run + MITER_ALLOWANCE_IN;
  }
  return miteredTrimInches(wallCabs, room);
}

export function toeKickLinearInches(placed: PlacedCabinet[]): number {
  return placed
    .filter((p) => p.placement === "base" || p.placement === "tall")
    .reduce((sum, p) => sum + rotatedSize(p).w, 0);
}

export function inchesToLinearFeet(inches: number): number {
  return Math.ceil((inches / 12) * 10) / 10; // 1 decimal, rounded up
}

// Trim (crown molding, toe kick) is sold in fixed stick lengths, not arbitrary
// fractional runs. Real ordering: measure the run, add a cut/waste allowance,
// then round UP to a whole number of standard sticks. Default stick = 96" (8 ft),
// default waste = 10%.
export const TRIM_STICK_INCHES = 96; // standard 8 ft trim stick
export const TRIM_WASTE = 0.1;       // 10% cut/waste allowance

export interface TrimOrder {
  pieces: number;      // whole sticks to order
  stickFeet: number;   // length of each stick, in feet (e.g. 8)
  orderedFeet: number; // total feet ordered (pieces * stickFeet)
  measuredFeet: number; // the raw measured run, in feet (1 decimal)
}

/**
 * Convert a measured trim run (in inches) into a sensible order: whole sticks
 * of `stickInches` length, including a `waste` allowance, rounded up.
 */
export function trimPiecesNeeded(
  runInches: number,
  stickInches: number = TRIM_STICK_INCHES,
  waste: number = TRIM_WASTE
): TrimOrder {
  const stickFeet = stickInches / 12;
  if (runInches <= 0) {
    return { pieces: 0, stickFeet, orderedFeet: 0, measuredFeet: 0 };
  }
  const withWaste = runInches * (1 + waste);
  const pieces = Math.max(1, Math.ceil(withWaste / stickInches));
  return {
    pieces,
    stickFeet,
    orderedFeet: pieces * stickFeet,
    measuredFeet: Math.round((runInches / 12) * 10) / 10,
  };
}

// ─── Countertops ────────────────────────────────────────────────────────────
// Countertops aren't auto-priced (material/edge/fabrication is supplier-quoted),
// so the design tool measures the run and the contractor requests a quote.
// Standard countertop depth is 25.5" (24" base box + ~1.5" front overhang).
// Island tops use the island footprint directly.
export const COUNTERTOP_DEPTH_IN = 25.5;

export interface CountertopMeasurement {
  linearFeet: number; // total run of base cabinets that take a top, in feet
  squareFeet: number; // run x countertop depth (+ island), in sq ft
  runInches: number;  // raw base run, inches
  hasIsland: boolean;
}

/**
 * Measure the countertop needed for a layout: base-cabinet run x standard depth,
 * plus the island footprint if present. Wall/tall cabinets don't take a top.
 */
export function countertopArea(
  placed: PlacedCabinet[],
  island?: { width: number; depth: number } | null
): CountertopMeasurement {
  const runInches = placed
    .filter((p) => p.placement === "base")
    .reduce((sum, p) => sum + rotatedSize(p).w, 0);
  let squareIn = runInches * COUNTERTOP_DEPTH_IN;
  const hasIsland = !!(island && island.width > 0 && island.depth > 0);
  if (hasIsland && island) {
    squareIn += island.width * island.depth;
  }
  return {
    runInches,
    linearFeet: Math.round((runInches / 12) * 10) / 10,
    squareFeet: Math.ceil((squareIn / 144) * 10) / 10, // round up to 0.1 sq ft
    hasIsland,
  };
}

// ─── Blind corner fillers ───────────────────────────────────────────────────
// Every BLIND corner cabinet (base BBC / wall WBC) must ship with a corner
// filler strip so the adjacent door/drawer has clearance to open past the blind
// section. We detect blind corners specifically (a subset of corner cabinets)
// and auto-add one filler per blind corner to the BOM. Standard blind-corner
// filler is 3" wide.
export const BLIND_CORNER_FILLER_WIDTH_IN = 3;

export function isBlindCorner(masterCode: string, description?: string): boolean {
  const code = (masterCode || "").toUpperCase();
  if (/^(BBC|WBC|BBL|BBR|WBL|WBR)/.test(code)) return true;
  if (/-BLIND|BLIND/.test(code)) return true;
  const desc = (description || "").toLowerCase();
  return /blind\s*corner/.test(desc);
}

export interface FillerLine {
  kind: "base" | "wall";
  count: number;
  width: number; // inches each
}

// Count blind corners in a layout and return the required filler lines, split
// by base vs wall so the BOM can label them correctly. One filler per blind
// corner cabinet.
export function blindCornerFillers(placed: PlacedCabinet[]): FillerLine[] {
  let base = 0;
  let wall = 0;
  for (const p of placed) {
    if (!isBlindCorner(p.masterCode, p.description)) continue;
    if (p.placement === "wall") wall += 1;
    else base += 1;
  }
  const out: FillerLine[] = [];
  if (base > 0) out.push({ kind: "base", count: base, width: BLIND_CORNER_FILLER_WIDTH_IN });
  if (wall > 0) out.push({ kind: "wall", count: wall, width: BLIND_CORNER_FILLER_WIDTH_IN });
  return out;
}

// ─── Explicit wall placement ────────────────────────────────────────────────
// Snap a placed cabinet flush to a chosen wall, keeping it inside the room and
// preserving its position along that wall (clamped). Used by the wall-selector
// UI so a user can place a cabinet on the wall they actually want instead of
// relying on drag-proximity guessing.
export function snapToWall(p: PlacedCabinet, side: WallSide, room: RoomData): { x: number; y: number } {
  const { w, d } = rotatedSize(p);
  // Keep the position along the wall but clamp it inside the room.
  let x = Math.max(0, Math.min(p.x, Math.max(0, room.width - w)));
  let y = Math.max(0, Math.min(p.y, Math.max(0, room.depth - d)));
  switch (side) {
    case "top":
      y = 0;
      break;
    case "bottom":
      y = Math.max(0, room.depth - d);
      break;
    case "left":
      x = 0;
      break;
    case "right":
      x = Math.max(0, room.width - w);
      break;
  }
  return { x, y };
}

// ─── Room dimension parsing / formatting ────────────────────────────────────
// Room dimensions are stored in inches. The editable UI lets users type feet +
// inches, so we convert between the two. Clamp to a sane kitchen range.
export const ROOM_MIN_IN = 36;   // 3 ft
export const ROOM_MAX_IN = 480;  // 40 ft

export function feetInchesToInches(feet: number, inches: number): number {
  const total = (Number.isFinite(feet) ? feet : 0) * 12 + (Number.isFinite(inches) ? inches : 0);
  return clampRoomInches(total);
}

export function inchesToFeetInches(totalInches: number): { feet: number; inches: number } {
  const t = Math.round(totalInches);
  return { feet: Math.floor(t / 12), inches: t % 12 };
}

export function clampRoomInches(inches: number): number {
  if (!Number.isFinite(inches)) return ROOM_MIN_IN;
  return Math.max(ROOM_MIN_IN, Math.min(ROOM_MAX_IN, Math.round(inches)));
}


// ─── Active-wall placement ──────────────────────────────────────────────────
// The Design Tool has a persistent "active wall" the user selects. Newly added
// cabinets/appliances are placed flush against that wall and march along it,
// packing next to the existing items already on that wall. This makes adding a
// run of cabinets to a specific wall predictable instead of guessing.

export const WALL_LABELS: Record<WallSide, string> = {
  top: "Back",
  bottom: "Front",
  left: "Left",
  right: "Right",
};

// Is the placed item sitting against `side` (within a tolerance)?
function isAgainstWall(p: PlacedCabinet, side: WallSide, room: RoomData): boolean {
  const { w, d } = rotatedSize(p);
  const T = 2; // inches tolerance
  switch (side) {
    case "top":
      return Math.abs(p.y - 0) <= T;
    case "bottom":
      return Math.abs(p.y + d - room.depth) <= T;
    case "left":
      return Math.abs(p.x - 0) <= T;
    case "right":
      return Math.abs(p.x + w - room.width) <= T;
  }
}

// Find the next free position for a `width`×`depth` item placed flush against
// `side`, marching along that wall and packing past items already on it.
// Returns inches. Falls back to the wall's start corner if the wall is full.
export function nextFreeSpotOnWall(
  width: number,
  depth: number,
  placement: Placement,
  side: WallSide,
  room: RoomData,
  existing: PlacedCabinet[]
): { x: number; y: number; rotation: number } {
  const horizontal = side === "top" || side === "bottom";
  // The cabinet is authored as width(along front) × depth(into room) at
  // rotation 0. On the back/front (horizontal) walls it keeps that orientation.
  // On the left/right (vertical) walls we rotate it 90°, so its ORIGINAL depth
  // now runs along the wall and its ORIGINAL width faces into the room.
  const alongSpan = horizontal ? width : depth;
  const intoRoom = horizontal ? depth : depth;

  // Fixed coordinate pinned to the wall.
  let x = 0;
  let y = 0;
  if (side === "top") y = 0;
  if (side === "bottom") y = Math.max(0, room.depth - intoRoom);
  if (side === "left") x = 0;
  if (side === "right") x = Math.max(0, room.width - intoRoom);

  // Items already on the same wall + layer, sorted along the wall axis.
  const onWall = existing
    .filter((p) => p.placement === placement && isAgainstWall(p, side, room))
    .map((p) => {
      const s = rotatedSize(p);
      const along = horizontal ? p.x : p.y;
      const span = horizontal ? s.w : s.d;
      return { along, span };
    })
    .sort((a, b) => a.along - b.along);

  // March a cursor along the wall, pushing past any overlapping neighbor.
  let cursor = 0;
  for (const item of onWall) {
    if (cursor < item.along + item.span && cursor + alongSpan > item.along) {
      cursor = item.along + item.span;
    }
  }

  const wallLen = horizontal ? room.width : room.depth;
  // If it runs off the end, just clamp to the wall start (will overlap-flag in UI).
  if (cursor + alongSpan > wallLen) cursor = Math.max(0, wallLen - alongSpan);

  if (horizontal) x = cursor;
  else y = cursor;

  // Rotation needed so the cabinet's depth faces into the room from this wall.
  // Base footprint is width(along) × depth(into) at rotation 0 (top/bottom wall).
  // Left/right walls need a 90° turn so depth runs horizontally into the room.
  const rotation = horizontal ? 0 : 90;

  return { x, y, rotation };
}

// ─── In-bounds clamping after a room resize ─────────────────────────────────
// When the room shrinks (typed or drawn), anything that now sticks out past a
// wall must be pulled back inside. Keeps the design valid instead of leaving
// cabinets floating outside the room rectangle.
export function clampCabinetToRoom(p: PlacedCabinet, room: RoomData): PlacedCabinet {
  const { w, d } = rotatedSize(p);
  const x = Math.max(0, Math.min(p.x, Math.max(0, room.width - w)));
  const y = Math.max(0, Math.min(p.y, Math.max(0, room.depth - d)));
  return p.x === x && p.y === y ? p : { ...p, x, y };
}

export function clampCabinetsToRoom(placed: PlacedCabinet[], room: RoomData): PlacedCabinet[] {
  return placed.map((p) => clampCabinetToRoom(p, room));
}

export function clampOpeningsToRoom(openings: WallOpening[], room: RoomData): WallOpening[] {
  return openings.map((o) => clampOpening(o, room));
}

export interface IslandZone {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export function clampIslandToRoom(island: IslandZone | null, room: RoomData): IslandZone | null {
  if (!island) return null;
  const width = Math.max(12, Math.min(island.width, room.width));
  const depth = Math.max(12, Math.min(island.depth, room.depth));
  const x = Math.max(0, Math.min(island.x, room.width - width));
  const y = Math.max(0, Math.min(island.y, room.depth - depth));
  return { x, y, width, depth };
}


// ─── Resize the room by dragging one wall ───────────────────────────────────
// The user can click a wall to highlight it, then drag it in/out. Dragging the
// back/front wall changes the room DEPTH; dragging the left/right wall changes
// the WIDTH. We move only the dragged wall: the top/left walls are pinned at the
// origin in our coordinate system, so growing them shifts all content; to keep
// behavior intuitive we instead always resize from the dragged edge and re-pin
// content to the origin, then clamp everything in-bounds at the call site.
//
// `deltaIn` is the signed drag distance in inches in screen space (right/down
// positive). The returned room is clamped to the sane kitchen range.
export function resizeRoomByWall(room: RoomData, side: WallSide, deltaIn: number): RoomData {
  switch (side) {
    case "right":
      return { ...room, width: clampRoomInches(room.width + deltaIn) };
    case "left":
      // Dragging the left wall left (negative delta) grows the room.
      return { ...room, width: clampRoomInches(room.width - deltaIn) };
    case "bottom":
      return { ...room, depth: clampRoomInches(room.depth + deltaIn) };
    case "top":
      // Dragging the top wall up (negative delta) grows the room.
      return { ...room, depth: clampRoomInches(room.depth - deltaIn) };
  }
}


// ─── Design add-on recommendations ──────────────────────────────────────────
// "Don't forget this" recommendations surfaced as the customer finishes a
// design. Two rules today:
//   1. Touch-up kit is ALWAYS recommended (every finished design needs one).
//   2. Roll-out trays are recommended when the design contains base cabinets
//      ("Want to add roll-out trays to any of these base cabinets?").
// These are pure data so they can be unit-tested and reused by the UI.
export type AddOnKind = "touch-up-kit" | "roll-out-tray";

export interface AddOnRecommendation {
  kind: AddOnKind;
  /** i18n key for the headline shown to the customer. */
  titleKey: string;
  /** i18n key for the supporting line. */
  bodyKey: string;
  /** masterCode to add to the cart/quote when accepted (matched at add time). */
  suggestCode: string;
  /** When true the recommendation is always shown regardless of placement. */
  always: boolean;
}

/** How many base cabinets are in the current design (drives roll-out trays). */
export function baseCabinetCount(placed: PlacedCabinet[]): number {
  return placed.filter((p) => p.placement === "base").length;
}

/**
 * Build the ordered list of add-on recommendations for a design. The touch-up
 * kit is always first (always-recommended); roll-out trays follow only when the
 * design has base cabinets. Returned in display order.
 */
export function addOnRecommendations(
  placed: PlacedCabinet[]
): AddOnRecommendation[] {
  const recs: AddOnRecommendation[] = [
    {
      kind: "touch-up-kit",
      titleKey: "addon_touchup_title",
      bodyKey: "addon_touchup_body",
      suggestCode: "TUK",
      always: true,
    },
  ];
  if (baseCabinetCount(placed) > 0) {
    recs.push({
      kind: "roll-out-tray",
      titleKey: "addon_rollout_title",
      bodyKey: "addon_rollout_body",
      // Generic roll-out tray; the actual sized RS-* is picked when added.
      suggestCode: "RS-24",
      always: false,
    });
  }
  return recs;
}

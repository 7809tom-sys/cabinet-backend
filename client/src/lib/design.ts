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

// Loose trim/molding/hardware sold by the linear foot or by the each that is
// NOT a physical box on the floor plan — crown, light rail, toe-kick molding,
// scribe, batten/filler strips, roll-out trays, hinges, knobs/pulls. These stay
// as quantity BOM lines and are not drawn on the canvas.
export function isLooseTrimItem(c: {
  description?: string | null;
  masterCode?: string | null;
  subCategory?: string | null;
}): boolean {
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""}`.toLowerCase();
  return /crown|light rail|\btoe ?kick\b|\bscribe\b|\bbatten\b|\bfiller\b|roll[- ]?out|pull[- ]?out tray|\bhinge\b|\bknob\b|\bpull\b|\bhardware\b|molding|moulding|\btrim\b/.test(
    hay
  );
}

// True for accessory-tab items that are physical objects which should be PLACED
// on the drawing (a box/panel the shop sets in the run): decorative end panels,
// base/dishwasher/refrigerator end panels, skins/wallskins, and appliance
// garages. Excludes the loose by-the-foot trim/hardware above. This drives
// whether an accessory drops onto the canvas vs. only adds a BOM line.
export function isPlaceableAccessory(c: {
  description?: string | null;
  masterCode?: string | null;
  subCategory?: string | null;
}): boolean {
  if (isLooseTrimItem(c)) return false;
  if (isPanelItem(c)) return true; // end panels / skins / decorative panels
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""}`.toLowerCase();
  // Appliance garages sit on the counter as a real box.
  if (/appliance garage|\bag-?\d/.test(hay)) return true;
  return false;
}

// Which placement a placeable accessory should take when dropped. Panels/skins
// and appliance garages mounted high read as wall items; everything else sits
// on the floor as a base-zone object.
export function accessoryPlacement(c: {
  description?: string | null;
  masterCode?: string | null;
  subCategory?: string | null;
}): Placement {
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""}`.toLowerCase();
  if (/appliance garage|\bag-?\d/.test(hay)) return "wall";
  if (/wall ?skin|\bws\b|wall panel|refrigerator panel/.test(hay)) return "wall";
  return "base";
}

export type Placement = "base" | "wall" | "tall" | "appliance";

// Synthetic appliance catalog. Appliances are not cabinets (no DB row / price),
// so they carry id = 0 and are skipped by the pricing engine. Dimensions are in
// inches; `elevHeight` and `elevBottom` describe how they sit on the wall in the
// front elevation view.
// A design room type. Each drives a room-specific palette of cabinets +
// fixtures. "closet" keeps its modular-parts behavior; "other" is a generic
// catch-all that shows the full cabinet set.
export type RoomType = "kitchen" | "bathroom" | "laundry" | "closet" | "other";

export const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "laundry", label: "Laundry" },
  { value: "closet", label: "Closet" },
  { value: "other", label: "Other" },
];

export interface ApplianceDef {
  key: string;
  masterCode: string;
  description: string;
  width: number;
  depth: number;
  elevBottom: number; // inches from floor
  elevHeight: number; // visible height in elevation
  // Which room types this fixture/appliance shows up in. Kitchen items default
  // to ["kitchen"]; shared items (e.g. a sink) can list multiple rooms.
  rooms: RoomType[];
}

export const APPLIANCES: ApplianceDef[] = [
  // ── Kitchen ──────────────────────────────────────────────────────────────
  { key: "range", masterCode: "RANGE-30", description: 'Range / Stove 30"', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, rooms: ["kitchen"] },
  { key: "fridge30", masterCode: "FRIDGE-30", description: 'Refrigerator 30"', width: 30, depth: 30, elevBottom: 0, elevHeight: 70, rooms: ["kitchen"] },
  { key: "fridge", masterCode: "FRIDGE-36", description: 'Refrigerator 36"', width: 36, depth: 30, elevBottom: 0, elevHeight: 70, rooms: ["kitchen"] },
  { key: "dishwasher", masterCode: "DW-24", description: 'Dishwasher 24"', width: 24, depth: 24, elevBottom: 0, elevHeight: 34.5, rooms: ["kitchen"] },
  { key: "winecooler", masterCode: "WINE-24", description: 'Wine Cooler 24"', width: 24, depth: 24, elevBottom: 0, elevHeight: 34.5, rooms: ["kitchen"] },
  { key: "sink", masterCode: "SINK-33", description: 'Sink 33"', width: 33, depth: 22, elevBottom: 30, elevHeight: 6, rooms: ["kitchen"] },
  { key: "hood", masterCode: "HOOD-30", description: 'Range Hood 30"', width: 30, depth: 18, elevBottom: 66, elevHeight: 18, rooms: ["kitchen"] },
  { key: "microwave", masterCode: "MW-30", description: 'Over-Range Microwave 30"', width: 30, depth: 15, elevBottom: 54, elevHeight: 17, rooms: ["kitchen"] },
  // ── Bathroom fixtures (layout-only props, quoted separately) ──────────────
  { key: "shower", masterCode: "FIX-SHOWER-36", description: 'Shower 36"', width: 36, depth: 36, elevBottom: 0, elevHeight: 78, rooms: ["bathroom"] },
  { key: "tub", masterCode: "FIX-TUB-60", description: 'Bathtub 60"', width: 60, depth: 30, elevBottom: 0, elevHeight: 20, rooms: ["bathroom"] },
  { key: "toilet", masterCode: "FIX-TOILET", description: "Toilet", width: 20, depth: 28, elevBottom: 0, elevHeight: 30, rooms: ["bathroom"] },
  { key: "bathsink", masterCode: "FIX-BATHSINK-24", description: 'Bathroom Sink 24"', width: 24, depth: 21, elevBottom: 30, elevHeight: 6, rooms: ["bathroom"] },
  // ── Laundry fixtures (layout-only props, quoted separately) ───────────────
  { key: "washer", masterCode: "FIX-WASHER-27", description: 'Washer 27"', width: 27, depth: 30, elevBottom: 0, elevHeight: 38, rooms: ["laundry"] },
  { key: "dryer", masterCode: "FIX-DRYER-27", description: 'Dryer 27"', width: 27, depth: 30, elevBottom: 0, elevHeight: 38, rooms: ["laundry"] },
  { key: "laundrytub", masterCode: "FIX-LAUNDRYTUB-25", description: 'Laundry Tub 25"', width: 25, depth: 22, elevBottom: 0, elevHeight: 34.5, rooms: ["laundry"] },
];

export function isApplianceCode(masterCode: string): boolean {
  return /^(RANGE|FRIDGE|DW|SINK|HOOD|MW|WINE|FIX)-/.test((masterCode || "").toUpperCase());
}

// Appliances/fixtures available for a given room type. Kitchen shows the kitchen
// appliance set; bathroom/laundry show their fixtures. Closet/other show none
// (closet uses modular parts; other relies on cabinets only).
export function appliancesForRoom(roomType: RoomType): ApplianceDef[] {
  return APPLIANCES.filter((a) => a.rooms.includes(roomType));
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
    catalogImageUrl: null,
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
  catalogImageUrl?: string | null;
  // Manufacturer blind-corner pull range (inches across the corner). Optional;
  // when absent for a blind corner, the design flags a conflict so the admin
  // can enter the spec.
  pullMin?: number | null;
  pullMax?: number | null;
}

// Door hinge side as seen from the front of the cabinet. "none" is used for
// items without a hinged door (drawer bases, open shelves, panels, appliances).
export type DoorSwing = "left" | "right" | "double" | "none";

export interface PlacedCabinet {
  uid: string;
  cabinetId: number;
  masterCode: string;
  description: string;
  // Catalog category / sub-category, carried from the source cabinet so the
  // canvas drawing + accessibility label classify the PLACED cabinet the same
  // way the palette does. Without these, cabinetDrawingType() can't tell a real
  // base/wall/tall box from an accessory strip and a normal base cabinet whose
  // description mentions "shelf"/"panel" gets mislabeled "accessory / trim".
  // Optional for backward-compat with older saved designs.
  category?: string | null;
  subCategory?: string | null;
  placement: Placement;
  x: number;
  y: number;
  width: number;
  depth: number;
  // Real vertical height in inches. Optional for backward-compat with older
  // saved designs that never stored a height; elevationBox falls back to the
  // standard height for the placement bucket when this is missing.
  height?: number;
  // Hinge side (Left/Right) of the door, so the shop knows how to hinge it.
  // Optional for backward-compat; resolve with resolveSwing() which falls back
  // to a sensible default based on the cabinet's door count.
  swing?: DoorSwing;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  rotation: number;
  // Official 20/20 catalog line-art for this cabinet code, if available.
  // Optional for backward-compat with older saved designs; the canvas falls
  // back to the to-scale code-drawn shape when absent.
  catalogImageUrl?: string | null;
  // User override for a WALL cabinet's mount height (inches from floor to the
  // BOTTOM of the box). When set, the elevation uses this exactly; when absent,
  // elevationBox derives the bottom from the default rule (stacker stacks on
  // top at 84"; a standalone short wall cabinet hangs from the 84" top line).
  mountBottom?: number | null;
  // Blind corner cabinets install ACROSS the corner with a manufacturer pull
  // range: the cabinet can be pulled away from the corner between pullMin and
  // pullMax inches (e.g. a 36" blind base that pulls out to 39"). These come
  // from the manufacturer spec and are carried onto the placed item. When a
  // blind corner cabinet has NO pull spec, the design is flagged as a conflict
  // so the administrator can enter the manufacturer's min/max pull.
  pullMin?: number | null;
  pullMax?: number | null;
  // Per-cabinet finish/door-style override for TWO-TONE designs. When set, this
  // cabinet uses this styleId instead of the design's default finish — e.g. a
  // white perimeter with a contrasting island/uppers. Must belong to the same
  // locked distributor family as the design. When null/undefined the cabinet
  // inherits the design's default styleId (see effectiveStyleId).
  styleId?: number | null;
  // Original catalog width (inches) captured when the cabinet was placed. The
  // live `width` is what the customer sees/edits; when it differs from
  // nominalWidth the cabinet is a CUSTOM size and is flagged on the build sheet
  // and order. Optional for backward-compat with older saved designs.
  nominalWidth?: number | null;
  // Original catalog HEIGHT and DEPTH (inches) captured when placed. Live
  // height/depth are what the customer edits; when they differ from these the
  // cabinet is flagged CUSTOM. Optional for backward-compat with older designs.
  nominalHeight?: number | null;
  nominalDepth?: number | null;
  // Per-cabinet door/hardware attributes (set from the right-click attributes
  // dialog). All optional for backward-compat with older saved designs.
  // noDoor: order this cabinet as an OPEN unit (no door/front) — e.g. open
  // shelving or a glass-ready box; the shop omits the door.
  noDoor?: boolean;
  // handleSide: where the pull/knob mounts on the door, independent of the
  // hinge side. "left" | "right" for a door; "top"|"bottom" reserved for drawers.
  handleSide?: "left" | "right" | "top" | "bottom" | null;
  // rolloutQty: number of roll-out (pull-out) trays to add inside this base
  // cabinet. Priced as an add-on line per tray.
  rolloutQty?: number | null;
}

// Generic "is this live dimension custom?" check: true when a captured nominal
// value exists and the live value differs by more than a rounding margin.
export function isCustomDim(live: number, nominal?: number | null): boolean {
  if (typeof nominal !== "number" || nominal <= 0) return false;
  return Math.abs(live - nominal) >= 0.25;
}

// True when the placed cabinet has been resized to a custom width (its live
// width differs from the catalog nominal width by more than a rounding margin).
// Falls back to false when no nominal width was captured (older designs).
export function isCustomWidth(p: { width: number; nominalWidth?: number | null }): boolean {
  return isCustomDim(p.width, p.nominalWidth);
}

export function isCustomHeight(p: { height?: number; nominalHeight?: number | null }): boolean {
  return typeof p.height === "number" && isCustomDim(p.height, p.nominalHeight);
}

export function isCustomDepth(p: { depth: number; nominalDepth?: number | null }): boolean {
  return isCustomDim(p.depth, p.nominalDepth);
}

// True when ANY of width/height/depth has been customized.
export function isCustomSize(p: {
  width: number; depth: number; height?: number;
  nominalWidth?: number | null; nominalHeight?: number | null; nominalDepth?: number | null;
}): boolean {
  return isCustomWidth(p) || isCustomHeight(p) || isCustomDepth(p);
}

// Flat surcharge applied ONCE to any cabinet that has been custom-resized in
// any dimension. Covers the shop's manual size-adjustment labor.
export const CUSTOM_SIZE_FEE = 100;

// $100 if this cabinet is custom-sized, else 0.
export function customSizeFee(p: {
  width: number; depth: number; height?: number;
  nominalWidth?: number | null; nominalHeight?: number | null; nominalDepth?: number | null;
}): number {
  return isCustomSize(p) ? CUSTOM_SIZE_FEE : 0;
}

// Compact note of the custom dims, e.g. "CUSTOM 27\"W × 36\"H" (only the changed
// dims), for build-sheet descriptions. Returns "" when nothing is custom.
export function customSizeNote(p: PlacedCabinet): string {
  const parts: string[] = [];
  if (isCustomWidth(p)) parts.push(`${fmtIn(Math.round(p.width * 10) / 10)}\"W`);
  if (isCustomHeight(p)) parts.push(`${fmtIn(Math.round(placedHeight(p) * 10) / 10)}\"H`);
  if (isCustomDepth(p)) parts.push(`${fmtIn(Math.round(p.depth * 10) / 10)}\"D`);
  return parts.length ? `CUSTOM ${parts.join(" × ")}` : "";
}

// Build-sheet note for the per-cabinet door/hardware attributes set in the
// right-click attributes dialog. "No door" wins (an open unit has no handle);
// otherwise an explicit handle side is noted. Returns "" when nothing applies.
export function cabinetAttrNote(p: {
  noDoor?: boolean;
  handleSide?: "left" | "right" | null;
}): string {
  if (p.noDoor) return "No door (open unit)";
  if (p.handleSide === "left" || p.handleSide === "right")
    return `Handle ${p.handleSide}`;
  return "";
}

// Resolve which door-style/finish a placed cabinet should actually use:
// its own per-cabinet override when present, otherwise the design's default
// finish. This is the single source of truth for both pricing and rendering so
// two-tone designs price and draw each cabinet by its real finish.
export function effectiveStyleId(
  cab: { styleId?: number | null },
  defaultStyleId: number | null
): number | null {
  return cab.styleId != null ? cab.styleId : defaultStyleId;
}

// The set of distinct EFFECTIVE finish styleIds used across a design, in first-
// seen order. The design default (if set) is always first so the primary finish
// leads the summary; per-cabinet overrides that differ follow. Returns [] when
// there is no default and no cabinet carries a style. Used to drive the
// "Finish applied to design" summary so two-tone designs list every finish.
export function distinctStyleIds(
  cabs: Array<{ styleId?: number | null }>,
  defaultStyleId: number | null
): number[] {
  const seen: number[] = [];
  const add = (id: number | null) => {
    if (id != null && !seen.includes(id)) seen.push(id);
  };
  add(defaultStyleId);
  for (const c of cabs) add(effectiveStyleId(c, defaultStyleId));
  return seen;
}

// True when a design uses more than one finish (i.e. at least one per-cabinet
// override resolves to a styleId different from the others) — a two-tone design.
export function isMixedFinish(
  cabs: Array<{ styleId?: number | null }>,
  defaultStyleId: number | null
): boolean {
  return distinctStyleIds(cabs, defaultStyleId).length > 1;
}

// True when a cabinet has a hinged door whose swing side is meaningful. A
// drawer-only base, an appliance, an open cabinet, or a panel has no swing.
export function hasDoorSwing(p: { placement: Placement; numberOfDoors?: number | null; numberOfDrawers?: number | null; description?: string | null; masterCode?: string | null; subCategory?: string | null }): boolean {
  if (p.placement === "appliance") return false;
  if (isPanelItem(p)) return false;
  // If we know the door count, trust it.
  if (typeof p.numberOfDoors === "number") return p.numberOfDoors > 0;
  // Drawer-only bases (no doors) typically have a drawer count and no doors.
  const hay = `${p.description ?? ""} ${p.masterCode ?? ""}`.toLowerCase();
  if (/\bdrawer base\b|^db|drawer\b/.test(hay) && !/door/.test(hay)) return false;
  // Default: assume it has a door.
  return true;
}

// Resolve a placed cabinet's swing, defaulting double-door cabinets to "double"
// and single-door cabinets to "left" (most common), and "none" for no-door items.
export function resolveSwing(p: PlacedCabinet): DoorSwing {
  if (!hasDoorSwing(p)) return "none";
  if (p.swing && p.swing !== "none") return p.swing;
  if (typeof p.numberOfDoors === "number" && p.numberOfDoors >= 2) return "double";
  return p.swing ?? "left";
}

// Cycle a single-door swing Left -> Right -> Left. Double doors stay double.
export function cycleSwing(current: DoorSwing): DoorSwing {
  if (current === "double" || current === "none") return current;
  return current === "left" ? "right" : "left";
}

// Short label for the swing, e.g. "L", "R", "LR".
export function swingLabel(s: DoorSwing): string {
  if (s === "left") return "L";
  if (s === "right") return "R";
  if (s === "double") return "LR";
  return "";
}

// Full-word swing label for build sheets, e.g. "Left hinge".
export function swingText(s: DoorSwing): string {
  if (s === "left") return "Left hinge";
  if (s === "right") return "Right hinge";
  if (s === "double") return "Double door";
  return "";
}

// Standard height (inches) for a placement bucket, used as a fallback when a
// placed cabinet has no explicit height (legacy saved designs).
export function standardHeight(placement: Placement): number {
  if (placement === "wall") return STD.WALL_HEIGHT;
  if (placement === "tall") return STD.TALL_HEIGHT;
  if (placement === "appliance") return STD.COUNTERTOP_HEIGHT;
  return STD.BASE_HEIGHT;
}

// Resolve a placed cabinet's real height, falling back to the bucket standard.
export function placedHeight(p: PlacedCabinet): number {
  if (typeof p.height === "number" && p.height > 0) return p.height;
  return standardHeight(p.placement);
}

// The standard top line (inches from floor) used for stackers and short bridge
// cabinets that hang from the ceiling/soffit line. A standard 30" wall cabinet
// bottomed at 54" also tops out here (84").
export const WALL_CABINET_TOP = STD.WALL_MOUNT_BOTTOM + STD.WALL_HEIGHT; // 84"

// On taller ceilings the upper run hangs higher so its top finishes near the
// ceiling instead of leaving a big dead gap. We leave a small reveal so crown
// has room and the boxes don't jam into the ceiling. On a standard 8ft ceiling
// this resolves to the classic 84" line, so existing layouts are unchanged.
export const CEILING_SOFFIT_REVEAL_IN = 12; // gap from ceiling to top of uppers on tall ceilings
export function wallCabinetTopLine(room?: { ceilingHeight?: number } | null): number {
  const ceil = roomCeiling(room);
  // Standard 8ft (96"): keep the historical 84" line exactly.
  if (ceil <= DEFAULT_CEILING_HEIGHT) return WALL_CABINET_TOP;
  // Taller ceilings: hang the run so its top sits one reveal below the ceiling,
  // but never below the historical 84" line (uppers only move UP, never down).
  return Math.max(WALL_CABINET_TOP, ceil - CEILING_SOFFIT_REVEAL_IN);
}
// Returns the uids of placed cabinets that do not fit under the room's ceiling.
// A tall cabinet (pantry/oven cabinet) is measured from the floor; a wall
// cabinet is measured at its hung top line. Anything whose top exceeds the
// ceiling is flagged so the user can pick a shorter box or raise the ceiling.
export function ceilingFitViolations(
  placed: PlacedCabinet[],
  room?: RoomData | { ceilingHeight?: number } | null,
): Set<string> {
  const globalCeil = roomCeiling(room ?? undefined);
  const bad = new Set<string>();
  for (const p of placed) {
    // Use the ceiling of the wall this cabinet sits on (its LOW point when the
    // ceiling slopes), so a tall/wall box under a low slope is flagged. Falls
    // back to the global ceiling when we can't resolve a wall.
    const ceil = room && "width" in room
      ? wallCeilingMin(room as RoomData, cabinetWall(p, room as RoomData))
      : globalCeil;
    if (p.placement === "wall") {
      // Wall boxes are bottom-anchored at the mount line; their top is mount + height.
      const top = WALL_MOUNT_BOTTOM + placedHeight(p);
      if (top > ceil + 0.5) bad.add(p.uid);
    } else if (p.placement === "tall") {
      // Tall boxes stand on the floor; their height is the top line.
      if (placedHeight(p) > ceil + 0.5) bad.add(p.uid);
    }
    // base/appliance always fit under any valid ceiling (>= 84").
  }
  return bad;
}

// Standard mount line: the BOTTOM of a wall cabinet sits 54" above the floor
// (18" above a 36" counter). Standard wall cabinets are bottom-anchored here,
// so 30"/36"/42" boxes all start at 54" and rise higher as they get taller.
export const WALL_MOUNT_BOTTOM = STD.WALL_MOUNT_BOTTOM; // 54"

/** A single wall's ceiling. Either a flat height, or a slope between a high end
 *  and a low end (for vaulted / knee-wall / angled ceilings). Heights are in
 *  inches from the floor. `slopeFrom` indicates which END of the wall the HIGH
 *  side is on, as you look at that wall in the Front View (left-to-right along
 *  the wall's plan span). */
export interface WallCeiling {
  /** High-side height in inches (or the flat height when not sloped). */
  high: number;
  /** Low-side height in inches. Equal to `high` for a flat ceiling. */
  low: number;
  /** Which end of the wall the HIGH side sits on. Only meaningful when high !== low. */
  slopeFrom?: "start" | "end";
}

export interface RoomData {
  width: number;
  depth: number;
  /** Floor-to-ceiling height in inches. Optional for back-compat; falls back to
   *  DEFAULT_CEILING_HEIGHT when absent. Drives how much wall shows above the
   *  upper cabinets in the elevation/Front View. Acts as the GLOBAL/default
   *  ceiling for any wall that has no explicit per-wall override. */
  ceilingHeight?: number;
  /** Optional per-wall ceiling overrides, keyed by plan wall side
   *  (top/bottom/left/right). A wall absent here uses `ceilingHeight`. Lets a
   *  room have a different (or sloped) ceiling on each wall. */
  wallCeilings?: Partial<Record<WallSide, WallCeiling>>;
}

// Standard US ceiling height. Common alternatives: 108" (9ft), 120" (10ft).
export const DEFAULT_CEILING_HEIGHT = 96;
export const CEILING_HEIGHT_PRESETS = [96, 108, 120] as const;
export const MIN_CEILING_HEIGHT = 84;
export const MAX_CEILING_HEIGHT = 144;
export function roomCeiling(room: { ceilingHeight?: number } | null | undefined): number {
  const h = room?.ceilingHeight;
  return typeof h === "number" && h >= MIN_CEILING_HEIGHT && h <= MAX_CEILING_HEIGHT
    ? h
    : DEFAULT_CEILING_HEIGHT;
}

// Clamp a raw ceiling-height value into the allowed range. Out-of-range or
// non-finite inputs fall back to the standard ceiling height.
export function clampCeilingHeight(h: number | null | undefined): number {
  if (typeof h !== "number" || !Number.isFinite(h)) return DEFAULT_CEILING_HEIGHT;
  return Math.max(MIN_CEILING_HEIGHT, Math.min(MAX_CEILING_HEIGHT, Math.round(h)));
}

// Resolve the ceiling definition for a specific wall. Falls back to the room's
// global flat ceiling when the wall has no override, so legacy designs and
// untouched walls behave exactly as before.
export function wallCeiling(
  room: { ceilingHeight?: number; wallCeilings?: Partial<Record<WallSide, WallCeiling>> } | null | undefined,
  side: WallSide,
): WallCeiling {
  const override = room?.wallCeilings?.[side];
  if (override && Number.isFinite(override.high) && Number.isFinite(override.low)) {
    const high = clampCeilingHeight(override.high);
    const low = clampCeilingHeight(override.low);
    return { high: Math.max(high, low), low: Math.min(high, low), slopeFrom: override.slopeFrom ?? "start" };
  }
  const flat = roomCeiling(room ?? undefined);
  return { high: flat, low: flat };
}

// True when the given wall has a sloped (angled) ceiling rather than a flat one.
export function wallCeilingIsSloped(
  room: { ceilingHeight?: number; wallCeilings?: Partial<Record<WallSide, WallCeiling>> } | null | undefined,
  side: WallSide,
): boolean {
  const c = wallCeiling(room, side);
  return Math.abs(c.high - c.low) > 0.5;
}

// The LOWEST ceiling height anywhere on a wall (the binding constraint for what
// can fit under it). For a flat wall this equals its height; for a slope it is
// the low end.
export function wallCeilingMin(
  room: { ceilingHeight?: number; wallCeilings?: Partial<Record<WallSide, WallCeiling>> } | null | undefined,
  side: WallSide,
): number {
  const c = wallCeiling(room, side);
  return Math.min(c.high, c.low);
}

// Ceiling height at a fractional position (0..1) along a wall's plan span,
// measured left-to-right as drawn in the Front View. Interpolates linearly for
// sloped walls; returns the flat height otherwise. `slopeFrom: "start"` means
// the HIGH side is at fraction 0 (left), `"end"` means the high side is at
// fraction 1 (right).
export function wallCeilingAt(
  room: { ceilingHeight?: number; wallCeilings?: Partial<Record<WallSide, WallCeiling>> } | null | undefined,
  side: WallSide,
  frac: number,
): number {
  const c = wallCeiling(room, side);
  if (Math.abs(c.high - c.low) <= 0.5) return c.high;
  const f = Math.max(0, Math.min(1, frac));
  // At the high end the value is c.high; at the low end it is c.low.
  const highAtStart = (c.slopeFrom ?? "start") === "start";
  const startVal = highAtStart ? c.high : c.low;
  const endVal = highAtStart ? c.low : c.high;
  return startVal + (endVal - startVal) * f;
}

export const DEFAULT_ROOM: RoomData = { width: 144, depth: 120, ceilingHeight: DEFAULT_CEILING_HEIGHT };

export function dim(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseFloat(value);
  return isNaN(n) || n <= 0 ? fallback : n;
}

export function footprintDepth(c: DesignCabinet): number {
  // Panels/skins are flat 3/4" stock regardless of placement bucket.
  if (isPanelItem(c)) return dim(c.depth, STD.PANEL_THICKNESS) || STD.PANEL_THICKNESS;
  // A diagonal corner cabinet occupies the same span on BOTH walls, so its
  // plan footprint is a square bounding box (e.g. 24" wide => 24" deep), not the
  // standard shallow wall/base depth.
  if (isDiagonalCorner(c.masterCode || "", c.description || undefined)) {
    const w = dim(c.width, 24);
    return w > 0 ? w : 24;
  }
  // An L-shaped corner cabinet (lazy-Susan / blind / easy-reach corner) runs the
  // SAME length along both walls (e.g. a 36" lazy-Susan is 36" on each wall),
  // so its plan bounding box is a square = width, with a notch cut at the inner
  // corner. The actual leg depth (how far it projects from each wall) is the
  // cabinet's stored depth (~24") and is handled by cornerLegDepth().
  if (isLCornerCabinet(c.masterCode || "", c.description || undefined)) {
    const w = dim(c.width, 24);
    return w > 0 ? w : 24;
  }
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

// Rotation-aware RENDER footprint for a placed cabinet. This is what the canvas
// should draw. For an L-shaped corner cabinet the plan bounding box is ALWAYS a
// square (side = the cabinet's nominal width), with the corner notch cut by the
// clip-path. Older saved placements may carry a stale shallow depth (e.g. a 36"
// lazy-Susan stored as 36x24); squaring here makes both old and new placements
// render correctly without a data migration. Non-corner cabinets fall back to
// the plain rotated size.
// Standard square box side for an L-corner cabinet, by placement. Every L-corner
// cabinet (easy-reach, lazy-Susan, blind) is rendered with the SAME footprint as
// the Corner Drawer Base (CDB-36): a 36" square for base/tall, 24" for wall —
// regardless of the unit's nominal width (a 33" ERB still draws as a 36" box).
export function lCornerBoxSide(placement: Placement): number {
  return placement === "wall" ? 24 : 36;
}

export function placedFootprint(p: PlacedCabinet): { w: number; d: number } {
  if (isLCornerCabinet(p.masterCode, p.description)) {
    const side = lCornerBoxSide(p.placement);
    return { w: side, d: side };
  }
  const sz = rotatedSize(p);
  // Defensive floor: a real cabinet box must never render as an invisible sliver
  // because of bad/missing catalog data (e.g. depth 0/0.75/NULL). We do NOT
  // normalize to the standard 24"/12" depth here — legitimately shallow boxes
  // (12" spice pull-outs, 21" vanities, etc.) must keep their real depth. We only
  // enforce a small absolute minimum so nothing can vanish. Flat stock
  // (panels/skins/fillers) is intentionally thin and is exempt.
  const isFlatStock = isPanelItem(p) || isLooseTrimItem(p);
  if (isFlatStock) return sz;
  const MIN_VISIBLE = 6; // inches — smallest a real cabinet box may render
  return { w: Math.max(sz.w, MIN_VISIBLE), d: Math.max(sz.d, MIN_VISIBLE) };
}

// One-time normalization for placed cabinets coming from a saved design / restore.
// Older saves stored L-shaped corner cabinets with a shallow depth (e.g. a 36"
// lazy-Susan as 36x24). The current model treats their plan footprint as a
// SQUARE (depth == width) with the leg notch cut by the clip-path. Rewriting the
// stored depth here means every downstream consumer (snapping, collision,
// front view, BOM) sees the correct square footprint without a DB migration.
export function normalizeLCornerDepths(placed: PlacedCabinet[]): PlacedCabinet[] {
  let changed = false;
  const next = placed.map((p) => {
    if (!isLCornerCabinet(p.masterCode, p.description)) return p;
    const side = lCornerBoxSide(p.placement);
    if (p.depth === side && p.width === side) return p;
    changed = true;
    return { ...p, width: side, depth: side };
  });
  return changed ? next : placed;
}

// Format an inch value without trailing zeros (34.5 -> "34.5", 24 -> "24").
export function fmtIn(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// Full 3-dimensional size label for a placed item: W x H x D in inches.
// Width/depth are rotation-aware (a turned cabinet swaps its footprint), while
// height comes from the placed height (with a sensible bucket fallback).
export function dimLabel(p: PlacedCabinet): string {
  const { w, d } = rotatedSize(p);
  const h = placedHeight(p);
  const base = `${fmtIn(w)}\"W \u00d7 ${fmtIn(h)}\"H \u00d7 ${fmtIn(d)}\"D`;
  return isCustomSize(p) ? `${base} \u00b7 Custom` : base;
}

export function snapPosition(
  moving: PlacedCabinet,
  room: RoomData,
  others: PlacedCabinet[]
): { x: number; y: number; snappedWall: boolean } {
  // Use the PLAN footprint (not the raw rotated size) so L-corner cabinets
  // (lazy-Susan / corner base) snap by their true SQUARE box. Their stored depth
  // can be the shallow ~24" leg depth, which would leave the box short of the
  // right/bottom walls and break corner-notch rotation in 3 of the 4 corners.
  const { w, d } = placedFootprint(moving);
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
    const os = placedFootprint(o);

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

  // Overlap prevention: even after edge-snapping, a fast drag can still land the
  // cabinet ON TOP of a neighbor. Push it back out so it BUTTS flush against the
  // cabinet it overlaps, along whichever axis needs the smallest correction.
  // Iterated a few times so a cabinet dragged into a tight run settles between
  // its neighbors instead of stacking on one of them.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const o of others) {
      if (o.uid === moving.uid) continue;
      const os = placedFootprint(o);
      const overlapX = Math.min(x + w, o.x + os.w) - Math.max(x, o.x);
      const overlapY = Math.min(y + d, o.y + os.d) - Math.max(y, o.y);
      if (overlapX > 0.01 && overlapY > 0.01) {
        // Resolve along the axis of least penetration (the natural "butt" edge).
        if (overlapX <= overlapY) {
          // Push left or right to the nearer side of the neighbor.
          const center = x + w / 2;
          const oCenter = o.x + os.w / 2;
          x = center < oCenter ? o.x - w : o.x + os.w;
        } else {
          const center = y + d / 2;
          const oCenter = o.y + os.d / 2;
          y = center < oCenter ? o.y - d : o.y + os.d;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  x = Math.max(0, Math.min(x, room.width - w));
  y = Math.max(0, Math.min(y, room.depth - d));

  return { x, y, snappedWall };
}

// Auto-orientation: when a cabinet is dragged near a wall, it should turn so its
// BACK is to that wall and it faces into the room. Back/front (horizontal) walls
// want rotation 0; left/right (vertical) walls want rotation 90. We pick the
// SINGLE nearest wall within the snap threshold (so a corner does not flip-flop)
// and only suggest a turn when the cabinet's current orientation does not already
// match that wall. Returns the target rotation, or null when no wall is close
// enough (e.g. the cabinet is out in the middle / on an island) so the caller
// can leave the user's chosen rotation alone.
export function orientToWall(
  moving: PlacedCabinet,
  room: RoomData
): number | null {
  // Note: island cabinets sit out in the middle of the room, so they never fall
  // within the wall snap threshold below and are left untouched automatically.
  const { w, d } = rotatedSize(moving);
  const T = STD.SNAP_THRESHOLD;
  // Distance from each wall (negative/positive both count via abs).
  const dist: Record<WallSide, number> = {
    top: Math.abs(moving.y - 0),
    bottom: Math.abs(moving.y + d - room.depth),
    left: Math.abs(moving.x - 0),
    right: Math.abs(moving.x + w - room.width),
  };
  // Nearest wall within threshold.
  let best: WallSide | null = null;
  let bestDist = T;
  (Object.keys(dist) as WallSide[]).forEach((side) => {
    if (dist[side] <= bestDist) { bestDist = dist[side]; best = side; }
  });
  if (!best) return null;
  const horizontal = best === "top" || best === "bottom";
  const targetRot = horizontal ? 0 : 90;
  const cur = ((Math.round(moving.rotation) % 180) + 180) % 180;
  // Already correctly oriented for this wall axis -> no change needed.
  if (cur === targetRot) return null;
  return targetRot;
}

export function hasCollision(moving: PlacedCabinet, others: PlacedCabinet[]): boolean {
  const { w, d } = rotatedSize(moving);
  for (const o of others) {
    if (o.uid === moving.uid) continue;
    const samePlacement = o.placement === moving.placement;
    const oneAppliance = moving.placement === "appliance" || o.placement === "appliance";
    const bothAppliance = moving.placement === "appliance" && o.placement === "appliance";
    if (!samePlacement) {
      // Cross-placement: only flag when exactly one is an appliance in the same vertical zone.
      if (!oneAppliance || bothAppliance) continue;
      if (occupiesUpperZone(moving) !== occupiesUpperZone(o)) continue;
      // Sink appliance over a sink-base cabinet is the intended layout — not a collision.
      if (
        (isSinkAppliance(moving) && isSinkBaseCabinet(o)) ||
        (isSinkAppliance(o) && isSinkBaseCabinet(moving))
      ) continue;
      // A bridge (short) wall cabinet over an over-range microwave/hood is the
      // intended layout — not a collision.
      if (isBridgeOverRange(moving, o)) continue;
    }
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

// Footprint rectangle (rotation-aware) for a placed item.
function footprintRect(p: PlacedCabinet): { x1: number; y1: number; x2: number; y2: number } {
  const { w, d } = rotatedSize(p);
  return { x1: p.x, y1: p.y, x2: p.x + w, y2: p.y + d };
}

// Do two placed items overlap in plan? Uses a small tolerance so cabinets that
// merely touch edge-to-edge (a normal, valid run) are NOT treated as overlapping.
function footprintsOverlap(a: PlacedCabinet, b: PlacedCabinet, tol = 0.5): boolean {
  const ra = footprintRect(a);
  const rb = footprintRect(b);
  return (
    ra.x1 < rb.x2 - tol &&
    ra.x2 > rb.x1 + tol &&
    ra.y1 < rb.y2 - tol &&
    ra.y2 > rb.y1 + tol
  );
}

// Conflict detection: an APPLIANCE physically running into a CABINET.
// Appliances (range, fridge, dishwasher, sink, hood, microwave) must sit in
// their own opening; if an appliance footprint overlaps a real cabinet box the
// design is not buildable, so both items are flagged as a conflict.
//
// Wall-mounted items (wall cabinets, hood, over-range microwave) only conflict
// with other wall/over-counter items, and floor items only with floor items, so
// an upper cabinet sitting "above" a base appliance in plan is not a conflict.
function occupiesUpperZone(p: PlacedCabinet): boolean {
  if (p.placement === "wall") return true;
  // Hoods and over-range microwaves hang above the counter.
  return /^(HOOD|MW)-/.test((p.masterCode || "").toUpperCase());
}

// A cabinet is "on the island" when its footprint center sits inside the island
// rectangle. Used so dragging the island carries its cabinets along.
export function isOnIsland(
  p: PlacedCabinet,
  island: { x: number; y: number; width: number; depth: number }
): boolean {
  const { w, d } = rotatedSize(p);
  const cx = p.x + w / 2;
  const cy = p.y + d / 2;
  return (
    cx >= island.x &&
    cx <= island.x + island.width &&
    cy >= island.y &&
    cy <= island.y + island.depth
  );
}

// A sink BASE cabinet (e.g. SB-36, "Sink Base 36"). Detected from
// subCategory / description / masterCode so it works for placed items and
// catalog rows alike.
export function isSinkBaseCabinet(c: {
  description?: string | null;
  masterCode?: string | null;
  subCategory?: string | null;
}): boolean {
  // The DESCRIPTION is the reliable signal across distributors. Code prefixes
  // are deliberately conservative because several families collide with
  // non-sink cabinets (verified against the live catalog):
  //   - LSB = "Base Easy Reach with Lazy Susan" (NOT a sink)
  //   - VA-30 = "Vanity Sink Base" (IS) but VA-48 = "Arched Valance" (NOT)
  //   - BFH-30 = "Vanity Sink Cabinet" (IS) but BFH-18 = "Full Height Base" (NOT)
  // So we only trust unambiguous code stems and otherwise defer to the text.
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""}`.toLowerCase();
  const descIsSink =
    /\bsink\s*base\b/.test(hay) ||                      // "Sink Base", "Corner Sink Base"
    /\bvanity\s*sink\b/.test(hay) ||                    // "Vanity Sink Base"
    /\bsink\s*(?:floor|front)\b/.test(hay) ||           // "Diagonal Sink Floor"
    /\b(?:farm(?:house)?|apron)\b[^.]*\bsink\b/.test(hay) ||
    /\bsink\b[^.]*\b(?:base|cabinet|floor|front)\b/.test(hay);
  if (descIsSink) return true;
  // Unambiguous sink-base code stems only (each requires a following size digit
  // or end, and none collide with the non-sink families above):
  //   SB-36, FSB-30, CSB-36, SBF-42-42, VSD-36, ADA-SB-33R, ADA-VS-30, ADA-VSD-48
  const code = (c.masterCode ?? "").toUpperCase();
  return (
    /^(?:ADA-)?F?SB[-_ ]?\d/.test(code) || // SB / FSB + size
    /^CSB[-_ ]?\d/.test(code) ||           // corner sink base
    /^(?:UV-)?SBF[-_ ]?\d/.test(code) ||   // sink base front / sink floor
    /^(?:ADA-)?VSD?[-_ ]?\d/.test(code) || // vanity sink (drawer) base
    /^ADA-SB[-_ ]?\d/.test(code)           // ADA sink base
  );
}

// A sink FIXTURE placed as an appliance (the SINK-33 palette entry). The kitchen
// sink naturally sits INSIDE the sink-base cabinet, so a sink appliance over a
// sink base is expected — never a conflict.
export function isSinkAppliance(c: {
  description?: string | null;
  masterCode?: string | null;
}): boolean {
  const code = (c.masterCode ?? "").toUpperCase();
  if (code.startsWith("SINK")) return true;
  return /\bsink\b/.test((c.description ?? "").toLowerCase());
}

// An over-range microwave (MW-*) or range hood (HOOD-*) that hangs above the
// counter in the upper zone. A short "bridge" wall cabinet is intentionally
// mounted directly above one of these, so that pairing must never be flagged.
export function isOverRangeAppliance(p: {
  masterCode?: string | null;
  placement?: Placement;
}): boolean {
  if (p.placement !== "appliance") return false;
  return /^(MW|HOOD)-/.test((p.masterCode || "").toUpperCase());
}

// True when `a` and `b` form the intended "bridge cabinet over an over-range
// microwave/hood" pairing: one is a wall cabinet, the other is an over-range
// appliance. The bridge cabinet top-aligns with the neighboring uppers (handled
// in verticalBounds) and the two must not raise a collision alarm.
export function isBridgeOverRange(a: PlacedCabinet, b: PlacedCabinet): boolean {
  const wallBridge = (x: PlacedCabinet) => x.placement === "wall";
  return (
    (wallBridge(a) && isOverRangeAppliance(b)) ||
    (wallBridge(b) && isOverRangeAppliance(a))
  );
}

export function conflictingUids(placed: PlacedCabinet[]): Set<string> {
  const conflicts = new Set<string>();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      // At least one must be an appliance for an appliance-in-cabinet conflict.
      const oneAppliance = a.placement === "appliance" || b.placement === "appliance";
      if (!oneAppliance) continue;
      // Don't flag two appliances against each other (e.g. hood over range).
      if (a.placement === "appliance" && b.placement === "appliance") continue;
      // EXEMPTION: a sink appliance sitting over a sink-base cabinet is the
      // intended layout (the sink drops INTO the sink base), so it must never be
      // flagged as a conflict.
      const sinkOverSinkBase =
        (isSinkAppliance(a) && isSinkBaseCabinet(b)) ||
        (isSinkAppliance(b) && isSinkBaseCabinet(a));
      if (sinkOverSinkBase) continue;
      // EXEMPTION: a bridge (short) wall cabinet mounted over an over-range
      // microwave/hood is the intended layout, so it must never be flagged.
      if (isBridgeOverRange(a, b)) continue;
      // Only items sharing the same vertical zone can truly collide.
      if (occupiesUpperZone(a) !== occupiesUpperZone(b)) continue;
      if (footprintsOverlap(a, b)) {
        conflicts.add(a.uid);
        conflicts.add(b.uid);
      }
    }
  }
  return conflicts;
}

// Blind corner rule: a blind corner cabinet needs a 3" filler on its blind side,
// which means the ADJACENT cabinet on the perpendicular run must be pulled at
// least 3" off the corner so the blind cabinet's door can clear. If a neighbor
// butts up against the blind cabinet's blind edge closer than 3", the layout is
// not buildable. Returns the uids of blind corner cabinets whose required pull
// is violated (so they can be flagged). Detection of "blind corner" is driven by
// the product description / code via isBlindCorner.
export function blindCornerViolations(
  placed: PlacedCabinet[],
  fillerIn = BLIND_CORNER_FILLER_WIDTH_IN
): Set<string> {
  const bad = new Set<string>();
  const blinds = placed.filter((p) => isBlindCorner(p.masterCode, p.description));
  for (const blind of blinds) {
    const rb = footprintRect(blind);
    for (const o of placed) {
      if (o.uid === blind.uid) continue;
      if (isBlindCorner(o.masterCode, o.description)) continue;
      // Only same vertical zone neighbors matter (base-vs-base, wall-vs-wall).
      if (occupiesUpperZone(o) !== occupiesUpperZone(blind)) continue;
      const ro = footprintRect(o);
      // Perpendicular neighbor whose run approaches the blind cabinet's corner.
      // Vertical adjacency: neighbor sits beside the blind cab along x, with
      // overlapping y-extent — the gap between their facing edges must be >= filler.
      const yOverlap = rb.y1 < ro.y2 && rb.y2 > ro.y1;
      const xOverlap = rb.x1 < ro.x2 && rb.x2 > ro.x1;
      if (yOverlap && !xOverlap) {
        const gap = ro.x1 >= rb.x2 ? ro.x1 - rb.x2 : rb.x1 - ro.x2;
        if (gap >= -0.5 && gap < fillerIn - 0.01) bad.add(blind.uid);
      } else if (xOverlap && !yOverlap) {
        const gap = ro.y1 >= rb.y2 ? ro.y1 - rb.y2 : rb.y1 - ro.y2;
        if (gap >= -0.5 && gap < fillerIn - 0.01) bad.add(blind.uid);
      }
    }
  }
  return bad;
}

// A glass STACKER is a short wall cabinet designed to sit ON TOP of the main
// wall cabinet below it (common in Skyline lines), growing UP toward the
// ceiling — unlike a standalone short/bridge wall cabinet, which hangs from the
// 84" top line. Detected from the description/code ("stacker").
export function isStacker(p: { description?: string | null; masterCode?: string | null; subCategory?: string | null }): boolean {
  const hay = `${p.subCategory ?? ""} ${p.description ?? ""} ${p.masterCode ?? ""}`.toLowerCase();
  // Text signals: "stacker", "glass stacker", "stacking"/"stacked".
  if (/\bstacker\b|\bstack(?:ing|ed)?\b|glass\s*stack/.test(hay)) return true;
  // Code signals: GS-* / GDS-* stacker families used across lines (e.g. GS-3012,
  // GDS-3015). Require a following size digit so we never match unrelated codes.
  const code = (p.masterCode ?? "").toUpperCase();
  return /^GD?S[-_ ]?\d/.test(code);
}

export function elevationBox(
  p: PlacedCabinet,
  room?: { ceilingHeight?: number } | null
): { bottom: number; height: number } {
  // The top line the upper run finishes at. On a standard 8ft ceiling this is
  // the historical 84" line; on taller ceilings the run hangs higher so it
  // finishes near the ceiling (see wallCabinetTopLine).
  const topLine = wallCabinetTopLine(room);
  if (p.placement === "appliance") {
    const def = APPLIANCES.find((a) => a.masterCode === p.masterCode);
    if (def) return { bottom: def.elevBottom, height: def.elevHeight };
    return { bottom: 0, height: STD.COUNTERTOP_HEIGHT };
  }
  if (p.placement === "wall") {
    const h = placedHeight(p);
    // 1) Explicit user override always wins (drag/adjust up or down).
    if (typeof p.mountBottom === "number" && p.mountBottom >= 0) {
      return { bottom: p.mountBottom, height: h };
    }
    // 2) Glass stackers sit ON TOP of the wall cabinet below them: their bottom
    //    rests on the upper-run top line and they grow up toward the ceiling.
    //    On a taller ceiling the top line rises, so the stacker hangs higher.
    if (isStacker(p)) {
      return { bottom: topLine, height: h };
    }
    // 3) SHORT wall cabinets (under 30" tall — e.g. 12"/15"/18"/24" bridges and
    //    over-appliance boxes) ride HIGH: they stay TOP-anchored at the upper-run
    //    top line so their TOP finishes flush with the standard uppers and their
    //    bottom moves UP the wall accordingly (a 12" bottoms at 72" on an 8ft
    //    ceiling, higher on a taller one). Clamped at 0 so an oversized box never
    //    goes below the floor.
    if (h < 30) {
      return { bottom: Math.max(0, topLine - h), height: h };
    }
    // 4) Standard/tall wall cabinets (30"+) are BOTTOM-anchored at the standard
    //    54" mount line (18" above a 36" counter), so 30", 36" and 42" boxes all
    //    start their bottom at 54" and simply rise higher toward the ceiling as
    //    they get taller (a 30" tops at 84", a 42" tops at 96"). Users who want a
    //    different position set an explicit mountBottom (branch #1), which wins.
    return { bottom: WALL_MOUNT_BOTTOM, height: h };
  }
  // Base, tall, vanity: the box normally sits on the floor (bottom = 0). One
  // exception: a wall (upper) cabinet that was "dropped to the floor" is stood
  // on a standard 4.5" toe kick — it carries an explicit mountBottom so it reads
  // like a real cabinet on a toe-kick base rather than sitting flat on the slab.
  if (typeof p.mountBottom === "number" && p.mountBottom > 0) {
    return { bottom: p.mountBottom, height: placedHeight(p) };
  }
  if (p.placement === "tall") {
    return { bottom: 0, height: placedHeight(p) };
  }
  return { bottom: 0, height: placedHeight(p) };
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
  // ERB/BER are the easy-reach corner base codes (BER is the Skyline naming;
  // ERB is how the catalog stores the same cabinet). WER is the wall easy-reach.
  if (/^(BBC|WBC|BLB|LSB|CSB|WLS|DCW|DCB|ER|ERB|BER|WER|AW-|AW\d|WDC|KWD|AG-|AG\d|CAG)/.test(code)) return true;
  if (/-CNR|CORNER/.test(code)) return true;
  const desc = (description || "").toLowerCase();
  return /corner|lazy susan|easy reach|blind|diagonal|angled (wall|corner)/.test(desc);
}

// An ANGLED WALL cabinet (AW-*) has a 45° face that transitions between two
// wall runs, but it is a regular wall-tab cabinet — NOT a corner cabinet. Use
// this to keep AW units OUT of the Corner palette tab. (Its diagonal canvas
// footprint is still handled by isDiagonalCorner below, which is intentional.)
export function isAngledWallCabinet(masterCode: string, description?: string): boolean {
  const code = (masterCode || "").toUpperCase();
  const desc = (description || "").toLowerCase();
  // A genuine corner unit (e.g. "corner" in the text) is never an angled wall.
  if (/corner/.test(desc)) return false;
  return /^AW[-\d]/.test(code) || /\bangled wall\b/.test(desc);
}

// A diagonal corner cabinet has a single 45-degree angled front face spanning
// the corner (NOT an L-shaped notch like a blind/lazy-susan corner). Codes like
// DCW (Diagonal Corner Wall), WDC, KWD and descriptions containing "diagonal".
export function isDiagonalCorner(masterCode: string, description?: string): boolean {
  const code = (masterCode || "").toUpperCase();
  // Diagonal corner wall/base, angled wall (AW), and corner appliance garages
  // (AG) all sit across the corner at 45 degrees and share the same footprint.
  if (/^(DCW|WDC|KWD|DCB|DCFF|AW-|AW\d|AG-|AG\d|CAG)/.test(code)) return true;
  const desc = (description || "").toLowerCase();
  if (/diagonal|angled (wall|corner)|appliance garage/.test(desc)) return true;
  return false;
}

// Returns a CSS clip-path describing the plan footprint of a diagonal corner
// cabinet. The cabinet comes out a fixed depth (~12") along EACH wall, then the
// front cuts back at a 45-degree diagonal across the inside corner. Within a
// square bounding box this is a pentagon: two short legs (the wall-facing backs)
// plus the angled front face. `legRatio` is the leg depth as a fraction of the
// box (12" of a 24" box = 0.5). Rotation selects which corner is the wall corner
// (rot 0 = wall corner at top-left; the diagonal face points to bottom-right).
export function diagonalCornerClipPath(rotation: number, legRatio = 0.5): string {
  const r = ((rotation % 360) + 360) % 360;
  const k = Math.round(legRatio * 100); // leg depth as %
  switch (r) {
    case 90: // wall corner top-right; face toward bottom-left
      return `polygon(100% 0, 100% 100%, ${100 - k}% 100%, 0 ${k}%, 0 0)`;
    case 180: // wall corner bottom-right; face toward top-left
      return `polygon(100% 100%, 0 100%, 0 ${100 - k}%, ${100 - k}% 0, 100% 0)`;
    case 270: // wall corner bottom-left; face toward top-right
      return `polygon(0 100%, 0 0, ${k}% 0, 100% ${100 - k}%, 100% 100%)`;
    default: // 0 — wall corner top-left; face toward bottom-right
      return `polygon(0 0, 100% 0, 100% ${k}%, ${k}% 100%, 0 100%)`;
  }
}

// True for L-shaped corner cabinets (lazy-Susan, blind corner, easy-reach
// corner). These are corner cabinets that are NOT diagonal — they form a square
// footprint with an L-notch cut at the interior corner. We reuse isCornerCabinet
// for detection and exclude the diagonal family.
export function isLCornerCabinet(masterCode: string, description?: string): boolean {
  if (isDiagonalCorner(masterCode, description)) return false;
  return isCornerCabinet(masterCode, description);
}

// How far an L-shaped corner cabinet projects from each wall (its leg depth, in
// inches). This is the cabinet's real stored depth (~24" base / ~12" wall),
// NOT the square bounding-box side. Falls back to a standard depth by placement.
export function cornerLegDepth(c: DesignCabinet): number {
  const fallback = c.placement === "wall" ? STD.WALL_DEPTH : STD.BASE_DEPTH;
  const d = dim(c.depth, fallback);
  const w = dim(c.width, 24);
  // The leg can never be deeper than the square box side; clamp for safety.
  return Math.min(d > 0 ? d : fallback, w);
}

// The leg-keep ratio for the L clip-path of a corner cabinet: the fraction of
// the square box side occupied by each leg (legDepth / boxWidth). For a 36"
// lazy-Susan with 24" legs this is 24/36 = 0.667 (notch is the inner 12x12).
export function cornerLegRatio(c: DesignCabinet): number {
  const w = dim(c.width, 24);
  if (w <= 0) return 0.667;
  const leg = cornerLegDepth(c);
  const ratio = leg / w;
  // Keep within sane bounds so the polygon is always a valid L.
  return Math.max(0.3, Math.min(0.95, ratio));
}

// Leg-keep ratio for a PLACED corner cabinet. After footprintDepth() squares the
// bounding box (depth == width), the real leg depth is the standard run depth for
// the placement bucket (24" base/tall, 12" wall). The notch = boxWidth - legDepth
// on each side, so a 36" lazy-Susan with 24" legs keeps 24/36 = 0.667 and notches
// the inner 12x12; a 33" unit keeps 24/33 = 0.727 (9x9 notch).
export function cornerLegRatioForPlaced(p: {
  width: number;
  placement: Placement;
}): number {
  // Use the SAME standard square box as the footprint (36" base / 24" wall) so the
  // notch matches the Corner Drawer Base exactly: 24/36 = 0.667 for every base
  // L-corner cabinet regardless of nominal width, 12/24 = 0.5 for wall.
  const box = lCornerBoxSide(p.placement);
  const legDepth = p.placement === "wall" ? STD.WALL_DEPTH : STD.BASE_DEPTH;
  const ratio = legDepth / box;
  return Math.max(0.3, Math.min(0.95, ratio));
}

// Returns a CSS clip-path polygon describing an L-shape inscribed in the
// cabinet's bounding box. The "notch" is cut from the corner pointing toward
// the room interior, chosen from the cabinet's rotation so the two legs hug the
// two adjacent walls. `legRatio` is the fraction of each side kept as a leg.
export function cornerClipPath(rotation: number, legRatio = 0.667): string {
  const r = ((rotation % 360) + 360) % 360;
  const k = Math.round(legRatio * 100); // leg length as %
  const j = 100 - k; // complementary point used by the mirrored corners
  // Each corner is an exact geometric mirror of the confirmed-correct rot 0
  // (top-left) shape. rot 0 keeps a full-width strip along the TOP and a
  // full-height strip along the LEFT, cutting the notch from the bottom-right
  // so both legs hug the top + left walls and the L opens into the room.
  //   rot 90  = horizontal mirror  → legs hug top + RIGHT   (notch bottom-left)
  //   rot 180 = 180° rotation      → legs hug bottom + RIGHT (notch top-left)
  //   rot 270 = vertical mirror    → legs hug bottom + LEFT   (notch top-right)
  switch (r) {
    case 90: // top-right: legs hug top + right, notch bottom-left
      return `polygon(0 0, 100% 0, 100% 100%, ${j}% 100%, ${j}% ${k}%, 0 ${k}%)`;
    case 180: // bottom-right: legs hug bottom + right, notch top-left
      return `polygon(${j}% 0, 100% 0, 100% 100%, 0 100%, 0 ${j}%, ${j}% ${j}%)`;
    case 270: // bottom-left: legs hug bottom + left, notch top-right
      return `polygon(0 0, ${k}% 0, ${k}% ${j}%, 100% ${j}%, 100% 100%, 0 100%)`;
    default: // 0 — top-left: legs hug top + left, notch bottom-right
      return `polygon(0 0, 100% 0, 100% ${k}%, ${k}% ${k}%, ${k}% 100%, 0 100%)`;
  }
}

// Which wall corner a placed L-corner cabinet sits in, derived from its position
// in the room. The interior notch of the L must point AWAY from both walls
// (toward the room interior), so the corner determines the clip-path rotation.
//   back-left  (x≈0, y≈0)            → walls top+left   → notch bottom-right → rot 0
//   back-right (x+w≈room.w, y≈0)       → walls top+right  → notch bottom-left  → rot 90
//   front-right(x+w≈room.w, y+d≈room.d)→ walls bot+right  → notch top-left     → rot 180
//   front-left (x≈0, y+d≈room.d)        → walls bot+left   → notch top-right    → rot 270
// Falls back to the cabinet's own rotation when it is not seated in a corner.
export function cornerRotationForPlaced(
  p: PlacedCabinet,
  room: RoomData,
  tol = 2
): number {
  const { w, d } = placedFootprint(p);
  // Prefer a tight snap: if the box is within `tol` of two perpendicular walls,
  // that corner is unambiguous.
  const nearLeft = p.x <= tol;
  const nearRight = Math.abs(p.x + w - room.width) <= tol;
  const nearTop = p.y <= tol;
  const nearBottom = Math.abs(p.y + d - room.depth) <= tol;
  if (nearTop && nearLeft) return 0;
  if (nearTop && nearRight) return 90;
  if (nearBottom && nearRight) return 180;
  if (nearBottom && nearLeft) return 270;
  // Otherwise (the cabinet was dragged near a corner but not snapped tight to
  // BOTH walls), fall back to the NEAREST room corner by the box center. This
  // keeps the L-notch pointing into the room interior for every corner instead
  // of defaulting to rot 0 (notch bottom-right), which only looked right in the
  // top-left corner. This is what previously made ERB cabinets in the top-right
  // and bottom-right corners render as a near-solid box.
  const cx = p.x + w / 2;
  const cy = p.y + d / 2;
  const left = cx <= room.width / 2;
  const top = cy <= room.depth / 2;
  if (top && left) return 0; // top-left  → notch bottom-right
  if (top && !left) return 90; // top-right → notch bottom-left
  if (!top && !left) return 180; // bottom-right → notch top-left
  return 270; // bottom-left → notch top-right
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
// "opening" = a cased opening / pass-through (a doorway WITH NO DOOR). Like a
// door it breaks the floor run (no base cabinet can cross it) and renders as a
// full-height open gap in the elevation; unlike a window it sits on the floor.
export type OpeningKind = "door" | "window" | "opening";

// Openings that break the BASE (floor) run: a person/traffic passes through, so
// no base cabinet may sit across them. Windows do NOT (a base cabinet can sit
// under a window). Used by base-overlap detection.
export function blocksFloorRun(kind: OpeningKind): boolean {
  return kind === "door" || kind === "opening";
}

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
  // Cased openings / pass-throughs (no door). Width is fully adjustable after
  // placing — measure with a tape and type the exact inches.
  { key: "cased-opening", kind: "opening", label: 'Cased Opening 36"', width: 36, height: 80, sill: 0 },
  { key: "cased-opening-wide", kind: "opening", label: 'Wide Opening 60"', width: 60, height: 84, sill: 0 },
  { key: "pass-through", kind: "opening", label: 'Pass-Through 48"', width: 48, height: 36, sill: 40 },
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

// Keyword table. Order matters — the FIRST regex that matches the combined
// style text wins. We match against the brand name AND the underlying paint
// color / finish / wood species, so e.g. "Aero Obsidian (SW 6258 Tricorn Black)"
// resolves to the black finish even though the brand word isn't "black".
const FINISH_BY_KEYWORD: { match: RegExp; face: string; edge: string; label: string }[] = [
  // WHITES
  { match: /white|snow|arctic|alpine|pearl|dove(?!tail)|blanc|alba|marshmallow|extra white|snowbound|chantilly|frost(?!ed gray)|ivory|cotton|dawn/, face: "#f3f1ec", edge: "#cfc9bf", label: "#3a3a3a" },
  // GREYS (incl. repose/dovetail/agreeable/mindful greige-leaning grays)
  { match: /grey|gray|stone|pewter|graphite|slate|fog|cinder|relic|repose|dovetail|grizzle|greige|ash|smoke|nickel|harbor|mist|pebble|amberg/, face: "#9aa0a6", edge: "#6f747a", label: "#1f2937" },
  // BLUES
  { match: /navy|blue|indigo|ocean|naval|cobalt|abyss|cobblestone|denim|sapphire|marine|teal|peacock/, face: "#3b4d63", edge: "#26354a", label: "#f8fafc" },
  // GREENS
  { match: /green|sage|forest|hunter|olive|fern|moss|evergreen|basil|juniper/, face: "#566f5a", edge: "#3c4f40", label: "#f8fafc" },
  // BLACKS / NEAR-BLACK
  { match: /black|onyx|carbon|tricorn|obsidian|jet|raven|charcoal|iron ore|peppercorn|caviar/, face: "#2b2b2e", edge: "#161618", label: "#f5f5f5" },
  // DARK BROWNS (espresso/walnut/mocha)
  { match: /walnut|mocha|coffee|chocolate|brown|espresso|umbra|shadow|java|truffle|cocoa|bourbon/, face: "#6b4a32", edge: "#4c3422", label: "#fbeee6" },
  // REDDISH WOODS
  { match: /cherry|mahogany|chestnut|cinnamon|spice|sienna|russet|brick|garnet/, face: "#7a4a32", edge: "#5a3422", label: "#fbeee6" },
  // MID WARM WOODS (oak/maple/honey/saddle/autumn)
  { match: /honey|oak|natural|maple|wheat|amber|toffee|saddle|autumn|caramel|pecan|harvest|golden|butterscotch|solar/, face: "#c08a4e", edge: "#9a6a36", label: "#3a2410" },
  // CREAMS / WARM NEUTRALS
  { match: /cream|almond|biscuit|linen|sand|beige|tan|creamy|manila|wicker|navajo|buttermilk|antique white|aged|saddle/, face: "#e6dcc6", edge: "#c7b79a", label: "#3a3526" },
];

// Deterministic distinct-color palette for styles whose text doesn't match any
// keyword. A stable hash of the style name picks one of these, so two different
// unmatched styles still look different (instead of all collapsing to one wood
// tone) and the SAME style always renders the same color across renders.
const FALLBACK_FINISHES: FinishColors[] = [
  { face: "#c79a63", edge: "#a07a45", label: "#3a2410" }, // warm oak
  { face: "#b78c64", edge: "#8f6a45", label: "#2e1c0e" }, // tan wood
  { face: "#8a9a8e", edge: "#65756a", label: "#1f2a23" }, // muted sage
  { face: "#7e8a99", edge: "#5a6675", label: "#f4f6fa" }, // blue-grey
  { face: "#a98f7a", edge: "#806656", label: "#2c1d12" }, // taupe
  { face: "#cdbfa6", edge: "#a99a7e", label: "#33301f" }, // greige
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const DEFAULT_FINISH: FinishColors = FALLBACK_FINISHES[0];
export const DEFAULT_FINISH_COLORS = DEFAULT_FINISH;

// Door-panel treatment derived from the door-style family name. Used to render
// the correct front detail (recessed Shaker frame, raised center, flat slab,
// beaded boards, stacked double-shaker) on door swatches AND on placed cabinets
// in the elevation view, so picking a style visibly changes the door look.
export type DoorPanelKind = "shaker" | "slim-shaker" | "raised" | "slab" | "beaded" | "inset" | "double-shaker";
export function doorPanelKind(doorStyle?: string | null): DoorPanelKind {
  const s = (doorStyle ?? "").toLowerCase();
  if (/double/.test(s)) return "double-shaker";
  // Slim / narrow Shaker: a Shaker door built with a narrow ~1/2" rail & stile
  // instead of the standard ~2.25". Detect it before the generic shaker so the
  // swatch can draw the thin frame.
  if (/slim|narrow|thin[ -]?frame|skinny/.test(s) && /shaker/.test(s)) return "slim-shaker";
  if (/slim shaker|narrow shaker/.test(s)) return "slim-shaker";
  if (/raised|cathedral|arch/.test(s)) return "raised";
  if (/slab|flat|contemporary|euro|modern/.test(s)) return "slab";
  if (/bead/.test(s)) return "beaded";
  if (/inset/.test(s)) return "inset";
  return "shaker";
}

// Accepts any combination of the style's brand name, paint color, finish text,
// and wood species — all are scanned together so the most specific signal wins.
// Falls back to a deterministic per-name color (never the same tone for every
// style) when nothing matches.
export function finishColors(...parts: (string | null | undefined)[]): FinishColors {
  const s = parts.filter(Boolean).join(" ").toLowerCase();
  for (const f of FINISH_BY_KEYWORD) {
    if (f.match.test(s)) return { face: f.face, edge: f.edge, label: f.label };
  }
  if (!s.trim()) return DEFAULT_FINISH;
  return FALLBACK_FINISHES[hashString(s) % FALLBACK_FINISHES.length];
}

// ─── Crown molding & toe kick (design trim, rendered in elevation) ──────────
// These are toggleable trim layers in the Design Tool. Crown runs along the top
// of every wall cabinet; toe kick is the recessed strip under base/tall cabinets.
// Linear footage for the BOM is derived from the combined widths of the relevant
// cabinets (wall widths for crown, base+tall widths for toe kick).
export const CROWN_HEIGHT_IN = 3;     // visual crown band height in elevation
export const TOE_KICK_HEIGHT_IN = STD.TOE_KICK; // 4.5"
export const LIGHT_RAIL_HEIGHT_IN = 1.5; // light rail valance under wall cabinets
// Any mitered trim (crown, light rail, decorative molding) loses length at the
// 45° corner cuts, so each continuous wall run needs extra material. Trade rule
// of thumb: add 3" to each wall's run (e.g. a 12" wall needs a 15" cut). The
// allowance is applied once per WALL the trim runs along — not per cabinet —
// because trim runs continuously and is only mitered where walls meet.
export const MITER_ALLOWANCE_IN = 3;
// Back-compat alias.
export const CROWN_MITER_ALLOWANCE_IN = MITER_ALLOWANCE_IN;

// Which of the four walls is this cabinet sitting against?
//
// ORIENTATION-FIRST: a cabinet's rotation tells us which PAIR of walls it can
// belong to — horizontal (rot 0/180) faces off the top/bottom walls, vertical
// (rot 90/270) faces off the left/right walls. We must decide the pair before
// proximity, because a cabinet parked in a CORNER is flush against two walls at
// once (e.g. a range in the bottom-left corner touches BOTH the bottom and the
// left wall). A naive "first flush wall wins" check would mis-assign such a
// cabinet to the wrong elevation (it would show a left-wall range on the Front
// view). Using orientation first keeps a vertical corner cabinet on Left/Right
// and a horizontal one on Top/Bottom; proximity only breaks the tie WITHIN the
// oriented pair.
export function cabinetWall(p: PlacedCabinet, room: RoomData): WallSide {
  const horizontal = ((Math.round(p.rotation) % 180) + 180) % 180 === 0;
  const { w, d } = rotatedSize(p);
  if (horizontal) {
    // Belongs to top or bottom. Prefer the flush edge; else nearest by center.
    if (isAgainstWall(p, "top", room)) return "top";
    if (isAgainstWall(p, "bottom", room)) return "bottom";
    return p.y + d / 2 < room.depth / 2 ? "top" : "bottom";
  }
  // Vertical: belongs to left or right. Prefer the flush edge; else nearest.
  if (isAgainstWall(p, "left", room)) return "left";
  if (isAgainstWall(p, "right", room)) return "right";
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

// Light rail runs along the BOTTOM edge of UPPER (wall) cabinets only (hides
// under-cabinet lighting). Like crown it's mitered per wall, so it carries the
// same corner allowance, but it never applies to tall/base cabinets.
export function lightRailLinearInches(placed: PlacedCabinet[], room?: RoomData): number {
  const wallCabs = placed.filter((p) => p.placement === "wall");
  if (wallCabs.length === 0) return 0;
  if (!room) {
    const run = wallCabs.reduce((s, p) => s + rotatedSize(p).w, 0);
    return run + MITER_ALLOWANCE_IN;
  }
  return miteredTrimInches(wallCabs, room);
}

// ─── Batten molding (BAM) ─────────────────────────────────────────────────────
// Batten Molding is a slim 3/4" x 3/16" strip used to cover the VERTICAL seams
// where two cabinets (or a cabinet and a finished end panel) meet, giving a
// clean built-in look. Unlike crown/toe-kick (which run horizontally over
// cabinet widths), batten runs vertically, so the run is derived from the
// number of cabinet-to-cabinet seams x the seam height, not from cabinet width.
export const BATTEN_WIDTH_IN = 0.75;   // 3/4" face width
export const BATTEN_THICKNESS_IN = 0.1875; // 3/16" thickness

// Count adjacent cabinet seams on each wall: cabinets sitting flush edge-to-edge
// share a vertical seam that a batten can cover. We approximate the batten run
// as (number of seams) x (representative seam height). Wall cabinets use ~30",
// base/tall use their own height.
export function battenLinearInches(placed: PlacedCabinet[], room?: RoomData): number {
  if (placed.length < 2) return 0;
  // Group by wall so we only count seams between neighbours on the same wall.
  const groups = new Map<WallSide, PlacedCabinet[]>();
  for (const p of placed) {
    if (p.cabinetId === 0) continue;
    const wall: WallSide = room ? cabinetWall(p, room) : "top";
    const arr = groups.get(wall) ?? [];
    arr.push(p);
    groups.set(wall, arr);
  }
  let totalInches = 0;
  const TOL = 1.5; // inches of gap tolerance to still count as a shared seam
  for (const cabs of Array.from(groups.values())) {
    if (cabs.length < 2) continue;
    // Sort along the run axis (x). Walls are already grouped, so a simple x-sort
    // is sufficient to find edge-to-edge neighbours.
    const sorted = [...cabs].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const aEnd = a.x + rotatedSize(a).w;
      const bStart = b.x;
      if (Math.abs(bStart - aEnd) <= TOL) {
        // Shared seam: batten covers the taller of the two cabinet faces.
        const seamHeight = Math.max(placedHeight(a), placedHeight(b));
        totalInches += seamHeight;
      }
    }
  }
  return totalInches;
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

// Resolve a blind corner cabinet's manufacturer pull range. Prefer the explicit
// pullMin/pullMax carried on the placed item (entered by the administrator). If
// those are missing, return null so the caller can flag a conflict — we never
// guess a manufacturer spec.
export function blindPullRange(
  p: { pullMin?: number | null; pullMax?: number | null }
): { min: number; max: number } | null {
  const min = typeof p.pullMin === "number" ? p.pullMin : null;
  const max = typeof p.pullMax === "number" ? p.pullMax : null;
  if (min == null || max == null) return null;
  if (max < min) return { min: max, max: min };
  return { min, max };
}

// The reason a blind corner cabinet is flagged, so the UI can show a tailored
// message. "missing-spec" -> administrator must enter the manufacturer pull;
// "out-of-range" -> the installed pull is outside [min,max].
export type BlindSpecIssue = "missing-spec" | "out-of-range";

// Validate blind corner cabinets against their manufacturer pull spec. For each
// blind corner cabinet:
//  - If it carries NO pullMin/pullMax spec -> "missing-spec" (conflict: the
//    administrator must enter the manufacturer's min/max pull before ordering).
//  - If it has a spec but its installed width-across-the-corner is outside
//    [pullMin, pullMax] -> "out-of-range".
// Returns a map of uid -> issue so the UI can flag and explain each one.
export function blindCornerSpecViolations(
  placed: PlacedCabinet[]
): Map<string, BlindSpecIssue> {
  const out = new Map<string, BlindSpecIssue>();
  for (const p of placed) {
    if (!isBlindCorner(p.masterCode, p.description)) continue;
    const range = blindPullRange(p);
    if (!range) {
      out.set(p.uid, "missing-spec");
      continue;
    }
    // The installed pull is the cabinet's width across the corner. Allow a
    // small tolerance so exact min/max values pass.
    const installed = p.width;
    if (installed < range.min - 0.01 || installed > range.max + 0.01) {
      out.set(p.uid, "out-of-range");
    }
  }
  return out;
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

// Result of attempting to auto-place a blind corner's opposite-side filler.
// `filler` is a ready-to-place 3" filler when we can confidently determine the
// corner and the pull side. `ambiguous` is true when we cannot — per the trade
// rule "if in doubt, put it in conflict", the caller should NOT guess and should
// leave the blind corner flagged so the user resolves it manually.
export interface BlindAutoFillerResult {
  filler: PlacedCabinet | null;
  ambiguous: boolean;
  reason?: string;
}

// When a blind corner base/wall cabinet is seated in a room corner, the trade
// rule is: the cabinet projects its full corner return (its real depth) into
// the corner, and a filler ALWAYS goes on the side OPPOSITE the pull (the open
// run side) so the adjacent run clears the corner. This computes that filler as
// a placed item flush against the same wall, butting the blind cabinet's far
// (run-side) end. If the blind cabinet is not clearly in a corner, we return
// `ambiguous: true` and place nothing — the design stays in conflict.
export function blindCornerAutoFiller(
  blind: PlacedCabinet,
  room: RoomData,
  makeUidFn: () => string = makeUid
): BlindAutoFillerResult {
  if (!isBlindCorner(blind.masterCode, blind.description)) {
    return { filler: null, ambiguous: false, reason: "not-blind" };
  }
  const wall = cabinetWall(blind, room);
  const horizontal = wall === "top" || wall === "bottom";
  const { w, d } = rotatedSize(blind);
  const W = BLIND_CORNER_FILLER_WIDTH_IN;

  // Run-axis extent of the blind cabinet along its wall.
  const runStart = horizontal ? blind.x : blind.y;
  const runEnd = runStart + (horizontal ? w : d);
  const runMax = horizontal ? room.width : room.depth;

  // Which end sits in the room corner? A corner end is within tolerance of 0 or
  // the wall's far end. If NEITHER end is in a corner, the placement is
  // ambiguous — we can't tell which side the pull/return faces.
  const T = 2;
  const atStart = Math.abs(runStart - 0) <= T;
  const atEnd = Math.abs(runEnd - runMax) <= T;
  if (atStart === atEnd) {
    // Both in a corner (cabinet spans the whole wall) or neither -> ambiguous.
    return { filler: null, ambiguous: true, reason: "corner-undetermined" };
  }

  // The filler goes on the side OPPOSITE the corner (the open run side).
  // If the corner is at the start, the open side is the far end (runEnd); the
  // filler sits just past the cabinet. If the corner is at the end, the filler
  // sits just before the cabinet's near end (runStart - W).
  const fillerAlong = atStart ? runEnd : runStart - W;
  if (fillerAlong < -0.01 || fillerAlong + W > runMax + 0.01) {
    return { filler: null, ambiguous: true, reason: "no-room-for-filler" };
  }

  // Build the filler flush against the same wall as the blind cabinet.
  const fillerPlacement: Placement = blind.placement === "wall" ? "wall" : "base";
  const fillerDepth = fillerPlacement === "wall" ? STD.WALL_DEPTH : STD.BASE_DEPTH;
  const fillerHeight = fillerPlacement === "wall" ? STD.WALL_HEIGHT : STD.BASE_HEIGHT;
  let fx: number, fy: number, fw: number, fd: number;
  if (horizontal) {
    fx = fillerAlong;
    fy = wall === "top" ? 0 : Math.max(0, room.depth - fillerDepth);
    fw = W;
    fd = fillerDepth;
  } else {
    fy = fillerAlong;
    fx = wall === "left" ? 0 : Math.max(0, room.width - fillerDepth);
    fw = fillerDepth;
    fd = W;
  }
  const filler: PlacedCabinet = {
    uid: makeUidFn(),
    cabinetId: 0,
    masterCode: `FILL-${W}`,
    description: `${W}" Blind Corner Filler (opposite pull)`,
    placement: fillerPlacement,
    x: fx,
    y: fy,
    width: fw,
    depth: fd,
    height: fillerHeight,
    rotation: horizontal ? 0 : 90,
  };
  return { filler, ambiguous: false };
}

// ─── Explicit wall placement ────────────────────────────────────────────────
// Snap a placed cabinet flush to a chosen wall, keeping it inside the room and
// preserving its position along that wall (clamped). Used by the wall-selector
// UI so a user can place a cabinet on the wall they actually want instead of
// relying on drag-proximity guessing.
export function snapToWall(p: PlacedCabinet, side: WallSide, room: RoomData): { x: number; y: number } {
  // Use the square plan footprint so L-corner cabinets seat flush to the wall
  // (their stored depth may be the shallow leg depth, which would leave a gap on
  // the bottom/right walls and break corner-notch rotation).
  const { w, d } = placedFootprint(p);
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

/**
 * Parse a free-form tape-measure length into inches (unclamped).
 * Accepts: 10' 6", 10ft 6in, 126", 126, 120 1/2, 10' 6 1/2", 8.5', 102.5
 * Returns null when the string can't be understood.
 */
export function parseLengthToInches(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  // normalize unit words/symbols to ' (feet) and " (inches)
  s = s
    .replace(/feet|foot|ft/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/inches|inch|in\b/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/''/g, '"');
  s = s.replace(/\s+/g, " ").trim();

  // turn a numeric token (with optional fraction) into a number
  const toNum = (tok: string): number | null => {
    tok = tok.trim();
    if (!tok) return null;
    const mixed = tok.match(/^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const den = parseInt(mixed[3], 10);
      if (den === 0) return null;
      return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / den;
    }
    const frac = tok.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (frac) {
      const den = parseInt(frac[2], 10);
      if (den === 0) return null;
      return parseInt(frac[1], 10) / den;
    }
    if (/^\d+(\.\d+)?$/.test(tok)) return parseFloat(tok);
    return null;
  };

  let feet = 0;
  let inches = 0;
  let matched = false;

  const footMatch = s.match(/^([\d./\- ]+?)'/);
  if (footMatch) {
    const f = toNum(footMatch[1]);
    if (f != null) { feet = f; matched = true; }
    s = s.slice(footMatch[0].length).trim();
  }

  const inchStr = s.replace(/"/g, "").trim();
  if (inchStr) {
    const i = toNum(inchStr);
    if (i != null) { inches = i; matched = true; }
    else if (!matched) return null;
  }

  if (!matched) return null;
  const total = feet * 12 + inches;
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
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

// ─── Range / oven corner clearance rule ─────────────────────────────────────
// Trade rule: when a range or oven sits at a wall CORNER directly adjacent to a
// cabinet, a filler must separate the appliance from that cabinet so the range
// handle (and the cabinet door/drawer handle) have clearance and don't collide.
// Standard clearance filler is 3" (same width as a blind-corner filler).
//
// We flag a range/oven when:
//   (1) it is a range or oven appliance/cabinet (masterCode RANGE-* / OVEN, or
//       description mentions range/oven), AND
//   (2) one of its run-axis ends is AT a wall corner (the appliance touches the
//       start or end of the wall it sits on), AND
//   (3) a real cabinet butts up against that SAME end closer than the required
//       clearance filler width.
// Returns the uids of the offending range/oven items so the UI can warn and
// offer a one-click "Add clearance filler".
export const RANGE_CLEARANCE_FILLER_IN = 3;

export function isRangeOrOven(masterCode?: string | null, description?: string | null): boolean {
  const code = (masterCode || "").toUpperCase();
  if (/^(RANGE|OVEN|RNG|OV)[-\d]/.test(code) || code === "RANGE" || code === "OVEN") return true;
  const desc = (description || "").toLowerCase();
  return /\brange\b|\boven\b|\bstove\b|\bcooktop\b/.test(desc);
}

export function rangeOvenClearanceViolations(
  placed: PlacedCabinet[],
  room: RoomData,
  fillerIn = RANGE_CLEARANCE_FILLER_IN
): Set<string> {
  const bad = new Set<string>();
  const ranges = placed.filter((p) => isRangeOrOven(p.masterCode, p.description));
  for (const range of ranges) {
    const side = cabinetWall(range, room);
    const horizontal = side === "top" || side === "bottom";
    const wallLen = horizontal ? room.width : room.depth;
    const rs = rotatedSize(range);
    const start = horizontal ? range.x : range.y;
    const end = start + (horizontal ? rs.w : rs.d);
    const atStartCorner = Math.abs(start - 0) <= 1.0;
    const atEndCorner = Math.abs(end - wallLen) <= 1.0;
    if (!atStartCorner && !atEndCorner) continue;

    // Look for a real cabinet butting the INTERIOR end of the range (the end
    // that faces into the run, away from the corner).
    for (const o of placed) {
      if (o.uid === range.uid) continue;
      if (o.placement !== "base" && o.placement !== "tall") continue;
      if (isRangeOrOven(o.masterCode, o.description)) continue;
      // Skip a filler/scribe that is already doing its job.
      if (/\bfiller\b|\bscribe\b/i.test(`${o.masterCode} ${o.description}`)) continue;
      if (cabinetWall(o, room) !== side) continue;
      const os = rotatedSize(o);
      const oStart = horizontal ? o.x : o.y;
      const oEnd = oStart + (horizontal ? os.w : os.d);
      // The neighbor must overlap the appliance's depth-band (same run) — since
      // both are on the same wall that's already true; check run-axis gap.
      let gap: number | null = null;
      if (atStartCorner) {
        // Interior end is `end`; neighbor should be to the right of it.
        if (oStart >= end - 1.0) gap = oStart - end;
      } else {
        // atEndCorner: interior end is `start`; neighbor to the left of it.
        if (oEnd <= start + 1.0) gap = start - oEnd;
      }
      if (gap != null && gap >= -0.5 && gap < fillerIn - 0.01) {
        bad.add(range.uid);
      }
    }
  }
  return bad;
}

// Result of an auto-filler pass: the (possibly extended) placed array plus the
// uids of the fillers that were inserted, so the UI can report how many were
// added and the caller can decide whether anything changed.
export interface RangeFillerResult {
  placed: PlacedCabinet[];
  added: PlacedCabinet[];
}

// Auto-place the required clearance filler(s) next to any range/oven that sits
// at a wall corner directly against a cabinet (the violations reported by
// rangeOvenClearanceViolations). For each violating appliance we insert a
// `fillerIn`-wide (default 3") filler on the INTERIOR side of the appliance —
// the side that faces away from the corner and toward the adjacent cabinet —
// and shift that neighboring cabinet (and any cabinets further down the run on
// the same wall, on the appliance's interior side) outward by the filler width
// so the filler has room. This gives the range handle and the cabinet door/
// drawer handle clearance to operate without colliding.
export function autoPlaceRangeFillers(
  placed: PlacedCabinet[],
  room: RoomData,
  fillerIn = RANGE_CLEARANCE_FILLER_IN,
  makeUidFn: () => string = makeUid
): RangeFillerResult {
  const violations = rangeOvenClearanceViolations(placed, room, fillerIn);
  if (violations.size === 0) return { placed, added: [] };

  // Work on a shallow copy so callers get a new array only when something
  // changed; individual cabinets we shift are replaced with new objects.
  const next = placed.slice();
  const added: PlacedCabinet[] = [];

  for (const uid of Array.from(violations)) {
    const idx = next.findIndex((p) => p.uid === uid);
    if (idx < 0) continue;
    const range = next[idx];
    const side = cabinetWall(range, room);
    const horizontal = side === "top" || side === "bottom";
    const wallLen = horizontal ? room.width : room.depth;
    const rs = rotatedSize(range);
    const start = horizontal ? range.x : range.y;
    const end = start + (horizontal ? rs.w : rs.d);
    const atStartCorner = Math.abs(start - 0) <= 1.0;

    // The interior end is the end facing away from the corner. The filler sits
    // just past that interior end; everything on the run beyond it gets nudged.
    // atStartCorner  -> corner at `start`, interior end is `end`, filler to the
    //                   right/down; shift cabinets with run-start >= end.
    // atEndCorner    -> corner at `end`, interior end is `start`, filler to the
    //                   left/up; shift cabinets with run-end <= start.
    const fillerAlong = atStartCorner ? end : start - fillerIn;

    const fillerDepth = STD.BASE_DEPTH;
    const fillerHeight = STD.BASE_HEIGHT;
    let fx: number, fy: number, fw: number, fd: number;
    if (horizontal) {
      fx = fillerAlong;
      fy = side === "top" ? 0 : Math.max(0, room.depth - fillerDepth);
      fw = fillerIn;
      fd = fillerDepth;
    } else {
      fy = fillerAlong;
      fx = side === "left" ? 0 : Math.max(0, room.width - fillerDepth);
      fw = fillerDepth;
      fd = fillerIn;
    }

    // Shift neighbor cabinets on the interior side outward by fillerIn so the
    // new filler has room. Only same-wall base/tall cabinets are moved.
    for (let i = 0; i < next.length; i++) {
      const o = next[i];
      if (o.uid === range.uid) continue;
      if (o.placement !== "base" && o.placement !== "tall") continue;
      if (cabinetWall(o, room) !== side) continue;
      const os = rotatedSize(o);
      const oStart = horizontal ? o.x : o.y;
      const oEnd = oStart + (horizontal ? os.w : os.d);
      const onInterior = atStartCorner ? oStart >= end - 1.0 : oEnd <= start + 1.0;
      if (!onInterior) continue;
      const delta = atStartCorner ? fillerIn : -fillerIn;
      next[i] = horizontal
        ? { ...o, x: clampInRoom(o.x + delta, 0, wallLen - os.w) }
        : { ...o, y: clampInRoom(o.y + delta, 0, wallLen - os.d) };
    }

    const filler: PlacedCabinet = {
      uid: makeUidFn(),
      cabinetId: 0,
      masterCode: `FILL-${fillerIn}`,
      description: `${fillerIn}" Range/Oven Clearance Filler`,
      placement: "base",
      x: fx,
      y: fy,
      width: fw,
      depth: fd,
      height: fillerHeight,
      rotation: horizontal ? 0 : 90,
    };
    next.push(filler);
    added.push(filler);
  }

  return { placed: next, added };
}

// Clamp a run-axis position into [lo, hi], tolerating hi < lo (returns lo).
function clampInRoom(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(v, hi));
}

// Wall cabinets must keep at least this clearance (inches) from doors and
// windows on both sides of the opening. Base cabinets are exempt (counters/
// fillers can run beneath a window), so this buffer is only applied when
// filling the WALL layer.
export const WALL_OPENING_CLEARANCE_IN = 3;

// Wall cabinets must keep a minimum clearance (default 3") from door/window
// openings. Returns the uids of WALL cabinets whose run-axis extent comes within
// `clearance` inches of any opening on the SAME wall (including overlap). Used
// for the design-check warning. Pure + deterministic.
export function wallOpeningClearanceViolations(
  placed: PlacedCabinet[],
  openings: WallOpening[],
  room: RoomData,
  clearance = WALL_OPENING_CLEARANCE_IN
): Set<string> {
  const bad = new Set<string>();
  if (openings.length === 0) return bad;
  for (const p of placed) {
    if (p.placement !== "wall") continue;
    const side = cabinetWall(p, room);
    const horizontal = side === "top" || side === "bottom";
    const ps = rotatedSize(p);
    const cStart = horizontal ? p.x : p.y;
    const cEnd = cStart + (horizontal ? ps.w : ps.d);
    for (const o of openings) {
      if (o.side !== side) continue;
      const oStart = o.offset;
      const oEnd = o.offset + o.width;
      // Gap between the cabinet span and the opening span along the run axis.
      // Negative gap means they overlap; positive means a clear distance.
      const gap = Math.max(oStart - cEnd, cStart - oEnd);
      if (gap < clearance - 0.01) {
        bad.add(p.uid);
        break;
      }
    }
  }
  return bad;
}

// Base (and tall/appliance) cabinets must not sit ACROSS a floor-blocking
// opening (a door or a cased pass-through). Returns the uids of floor-layer
// cabinets whose run-axis extent overlaps any door/opening on the SAME wall.
// Windows are ignored (a base cabinet can sit under a window). Pure +
// deterministic so it can be unit-tested.
export function baseOpeningOverlaps(
  placed: PlacedCabinet[],
  openings: WallOpening[],
  room: RoomData
): Set<string> {
  const bad = new Set<string>();
  const floorOpenings = openings.filter((o) => blocksFloorRun(o.kind));
  if (floorOpenings.length === 0) return bad;
  for (const p of placed) {
    // Floor layer = base + appliance; tall spans the floor too.
    if (p.placement === "wall") continue;
    const side = cabinetWall(p, room);
    const horizontal = side === "top" || side === "bottom";
    const ps = rotatedSize(p);
    const cStart = horizontal ? p.x : p.y;
    const cEnd = cStart + (horizontal ? ps.w : ps.d);
    for (const o of floorOpenings) {
      if (o.side !== side) continue;
      const oStart = o.offset;
      const oEnd = o.offset + o.width;
      // Any positive overlap along the run axis is a conflict.
      const overlap = Math.min(cEnd, oEnd) - Math.max(cStart, oStart);
      if (overlap > 0.01) {
        bad.add(p.uid);
        break;
      }
    }
  }
  return bad;
}

// ─── Free wall segments (break the run around openings) ─────────────────────
// Compute the OPEN gaps along a wall's run axis, after removing the run-axis
// extents of (a) base cabinets already on that wall and (b) door/window
// openings on that wall. Auto-Fill then tiles each returned segment separately
// so cabinets break cleanly around a doorway instead of running under it.
//
// Returns segments as { start, length } in inches along the wall's run axis
// (X for top/bottom walls, Y for left/right). Only segments >= `minLen` are
// returned. Pure + deterministic so it can be unit-tested.
export interface WallSegment {
  start: number;
  length: number;
}

export function freeSegmentsOnWall(
  side: WallSide,
  room: RoomData,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  minLen = 9,
  // Extra clearance padded onto EACH side of every opening before computing
  // free segments. Pass WALL_OPENING_CLEARANCE_IN when tiling wall cabinets.
  openingClearance = 0,
  // Which placement LAYER we're tiling. Items only block their own layer: wall
  // cabinets hang ABOVE base cabinets, so a wall cabinet must tile against other
  // wall cabinets only (and vice-versa). Defaults to "base" for back-compat.
  layer: Placement = "base"
): WallSegment[] {
  const horizontal = side === "top" || side === "bottom";
  const wallLen = horizontal ? room.width : room.depth;

  // Collect blocked [start, end] intervals along the run axis.
  const blocked: { s: number; e: number }[] = [];

  // Only items on the SAME layer (wall vs floor) block this run. Tall cabinets
  // span floor-to-ceiling, so they block BOTH the base and wall layers.
  const blocksThisLayer = (pl: Placement): boolean => {
    if (pl === "tall") return true;
    if (layer === "wall") return pl === "wall";
    // base/appliance share the floor layer
    return pl === "base" || pl === "appliance";
  };
  for (const p of placed) {
    if (!blocksThisLayer(p.placement)) continue;
    if (!isAgainstWall(p, side, room)) continue;
    const s = rotatedSize(p);
    const start = horizontal ? p.x : p.y;
    const span = horizontal ? s.w : s.d;
    blocked.push({ s: start, e: start + span });
  }

  // Openings on this wall (a door/window interrupts the run at its position).
  // Pad by openingClearance on both sides so wall cabinets keep their distance.
  for (const o of openings) {
    if (o.side !== side) continue;
    blocked.push({
      s: Math.max(0, o.offset - openingClearance),
      e: Math.min(wallLen, o.offset + o.width + openingClearance),
    });
  }

  // Merge overlapping/touching blocked intervals.
  blocked.sort((a, b) => a.s - b.s);
  const merged: { s: number; e: number }[] = [];
  for (const b of blocked) {
    const last = merged[merged.length - 1];
    if (last && b.s <= last.e + 0.01) {
      last.e = Math.max(last.e, b.e);
    } else {
      merged.push({ ...b });
    }
  }

  // The free segments are the gaps between merged blocks (and the ends).
  const segments: WallSegment[] = [];
  let cursor = 0;
  for (const b of merged) {
    const gap = b.s - cursor;
    if (gap >= minLen) segments.push({ start: cursor, length: Math.round(gap * 100) / 100 });
    cursor = Math.max(cursor, b.e);
  }
  const tail = wallLen - cursor;
  if (tail >= minLen) segments.push({ start: cursor, length: Math.round(tail * 100) / 100 });

  return segments;
}


// Convert a run-axis coordinate on a wall into the {x, y, rotation} a placed
// cabinet needs. `along` is the run-axis start (X for top/bottom, Y for left/
// right); the perpendicular coordinate is pinned to the wall.
export function wallPlacementAt(
  along: number,
  width: number,
  depth: number,
  side: WallSide,
  room: RoomData
): { x: number; y: number; rotation: number } {
  const horizontal = side === "top" || side === "bottom";
  const rotation = horizontal ? 0 : 90;
  // depth runs into the room from the wall.
  let x = 0;
  let y = 0;
  if (side === "top") { y = 0; x = along; }
  else if (side === "bottom") { y = Math.max(0, room.depth - depth); x = along; }
  else if (side === "left") { x = 0; y = along; }
  else { x = Math.max(0, room.width - depth); y = along; }
  return { x, y, rotation };
}

// ─── In-bounds clamping after a room resize ─────────────────────────────────
// When the room shrinks (typed or drawn), anything that now sticks out past a
// wall must be pulled back inside. Keeps the design valid instead of leaving
// cabinets floating outside the room rectangle.
export function clampCabinetToRoom(p: PlacedCabinet, room: RoomData): PlacedCabinet {
  // Square footprint for L-corner cabinets so a resize keeps them flush in the
  // corner instead of pulling them in by the shallow stored leg depth.
  const { w, d } = placedFootprint(p);
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
export type AddOnKind =
  | "touch-up-kit"
  | "roll-out-tray"
  | "end-panel"
  | "crown-molding";

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

/** How many wall (upper) cabinets are in the design (drives crown molding). */
export function wallCabinetCount(placed: PlacedCabinet[]): number {
  return placed.filter((p) => p.placement === "wall").length;
}

/** Any cabinet that can have an exposed finished side (base/wall/tall). */
export function exposedSideCount(placed: PlacedCabinet[]): number {
  return placed.filter(
    (p) => p.placement === "base" || p.placement === "wall" || p.placement === "tall",
  ).length;
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
  // Exposed cabinet sides (islands, end-of-run) need a decorative end panel to
  // match the door style. Suggested once any base/wall/tall cabinet is placed.
  if (exposedSideCount(placed) > 0) {
    recs.push({
      kind: "end-panel",
      titleKey: "addon_endpanel_title",
      bodyKey: "addon_endpanel_body",
      // Base decorative end panel; the resolver picks the buyable panel in line.
      suggestCode: "BDEP",
      always: false,
    });
  }
  // Wall cabinets get a finished look with crown molding across the top.
  if (wallCabinetCount(placed) > 0) {
    recs.push({
      kind: "crown-molding",
      titleKey: "addon_crown_title",
      bodyKey: "addon_crown_body",
      suggestCode: "CM-8",
      always: false,
    });
  }
  return recs;
}


// ─── Live drag tape-measure (20/20-style) ───────────────────────────────────
// While dragging a cabinet we show the clearance on BOTH sides of it along the
// wall it sits against: from its near edge back to the previous obstacle
// (a neighbor cabinet edge, otherwise the wall start) and from its far edge to
// the next obstacle (a neighbor, otherwise the wall end). This mirrors how the
// 20/20 tape reads, e.g. "59" from the left wall" on one side and the remaining
// gap on the other. All math is in inches along the wall's run axis so it can be
// unit-tested independently of the canvas.
export interface WallSpanMeasure {
  side: WallSide;
  /** Inches from the moving item's start edge to the previous obstacle. */
  before: number;
  /** Inches from the moving item's end edge to the next obstacle. */
  after: number;
  /** Run-axis start coordinate (inches) of the moving item along the wall. */
  start: number;
  /** Run-axis end coordinate (inches) of the moving item along the wall. */
  end: number;
  /** Total wall length (inches) on the run axis. */
  wallLen: number;
  /** Whether the previous obstacle is a neighbor cabinet (vs the wall). */
  beforeIsCabinet: boolean;
  /** Whether the next obstacle is a neighbor cabinet (vs the wall). */
  afterIsCabinet: boolean;
}

// Project a placed item onto the run axis of a wall, returning [start, end] in
// inches. For top/bottom walls the run axis is X; for left/right it is Y.
function runSpan(p: PlacedCabinet, side: WallSide): { start: number; end: number } {
  const { w, d } = rotatedSize(p);
  const horizontal = side === "top" || side === "bottom";
  const start = horizontal ? p.x : p.y;
  const span = horizontal ? w : d;
  return { start, end: start + span };
}

// Does an item sit on the same depth-band as the wall (i.e. is it part of this
// wall's run)? We reuse the loose wall-adjacency test for the moving item's wall
// and only consider neighbors that share the same placement layer.
export function wallSpanMeasure(
  moving: PlacedCabinet,
  room: RoomData,
  others: PlacedCabinet[],
  side: WallSide
): WallSpanMeasure {
  const horizontal = side === "top" || side === "bottom";
  const wallLen = horizontal ? room.width : room.depth;
  const me = runSpan(moving, side);

  // Neighbors on the same wall + same layer, excluding the moving item itself.
  const neighbors = others
    .filter((o) => o.uid !== moving.uid)
    .filter((o) => o.placement === moving.placement)
    .filter((o) => isAgainstWall(o, side, room))
    .map((o) => runSpan(o, side));

  // Previous obstacle: the closest neighbor that ends at/below our start.
  let beforeEdge = 0;
  let beforeIsCabinet = false;
  for (const n of neighbors) {
    if (n.end <= me.start + 0.001 && n.end > beforeEdge) {
      beforeEdge = n.end;
      beforeIsCabinet = true;
    }
  }

  // Next obstacle: the closest neighbor that starts at/above our end.
  let afterEdge = wallLen;
  let afterIsCabinet = false;
  for (const n of neighbors) {
    if (n.start >= me.end - 0.001 && n.start < afterEdge) {
      afterEdge = n.start;
      afterIsCabinet = true;
    }
  }

  const before = Math.max(0, me.start - beforeEdge);
  const after = Math.max(0, afterEdge - me.end);

  return {
    side,
    before,
    after,
    start: me.start,
    end: me.end,
    wallLen,
    beforeIsCabinet,
    afterIsCabinet,
  };
}

// ─── Countertop materials & surfaces ─────────────────────────────────────────
// A small, curated material palette. Each material carries a plan-view fill,
// a darker edge for the front lip/seam, and a label for legends/BOM. Colors are
// indicative renders only — actual material/edge/fabrication is supplier-quoted.
export interface CountertopMaterial {
  id: string;
  name: string;
  fill: string;   // plan/front slab fill
  edge: string;   // front lip / outline
  speckle?: string; // optional accent dots for stone look
}

export const COUNTERTOP_MATERIALS: CountertopMaterial[] = [
  { id: "white-quartz",   name: "White Quartz",   fill: "#eef0f2", edge: "#c4c9cf", speckle: "#cfd4d9" },
  { id: "carrara-marble", name: "Carrara Marble", fill: "#e9ecef", edge: "#b7bec6", speckle: "#aeb6bf" },
  { id: "black-granite",  name: "Black Granite",  fill: "#2c2f33", edge: "#15171a", speckle: "#5b6068" },
  { id: "butcher-block",  name: "Butcher Block",  fill: "#b9824a", edge: "#8a5d30", speckle: "#a06f3c" },
  { id: "concrete-gray",  name: "Concrete Gray",  fill: "#8b9097", edge: "#666b72", speckle: "#7c818a" },
  { id: "sand-quartz",    name: "Sand Quartz",    fill: "#ddd2bb", edge: "#bcae90", speckle: "#c9bc9f" },
];

export const DEFAULT_COUNTERTOP_MATERIAL_ID = "white-quartz";

export function countertopMaterial(id: string | null | undefined): CountertopMaterial {
  return (
    COUNTERTOP_MATERIALS.find((m) => m.id === id) ??
    COUNTERTOP_MATERIALS[0]
  );
}

// A rectangular countertop surface in room (inch) coordinates, used by the plan
// renderer to draw a visible slab over base cabinets and the island.
export interface CountertopSurface {
  x: number;
  y: number;
  width: number;
  depth: number;
  kind: "base" | "island";
}

/**
 * Compute the visible countertop surfaces for a layout. Every base cabinet gets
 * a slab the width of the cabinet and the standard countertop depth, pinned to
 * the wall the cabinet sits on (so the overhang projects into the room). The
 * island (if any) gets a slab matching its footprint.
 *
 * Pure + deterministic so it can be unit-tested independently of rendering.
 */
// True when a placed item is a real, countertop-BEARING base cabinet: it must
// sit in the base zone AND be a solid box that a slab can rest on. This covers
// standard bases, drawer bases, sink bases (incl. vanity-sink / ADA-sink), and
// blind/corner bases. It deliberately EXCLUDES anything in the base zone that
// does NOT carry a counter:
//   - decorative end panels / refrigerator + dishwasher panels / skins
//     (isPanelItem — 3/4" flat stock, not a box)
//   - filler / scribe strips (FILL-* — a sliver, not a cabinet)
// Tall cabinets and appliances are already excluded by the placement check.
export function bearsCountertop(p: {
  placement: Placement;
  masterCode?: string | null;
  description?: string | null;
  subCategory?: string | null;
}): boolean {
  if (p.placement !== "base") return false;
  // Sink bases ARE counter-bearing even though their tops are cut for the sink.
  if (isSinkBaseCabinet(p)) return true;
  // Flat panels / skins carry no counter.
  if (isPanelItem(p)) return false;
  // Filler / scribe strips (FILL-* or a "Filler" sub-category) are non-bearing.
  const code = (p.masterCode ?? "").toUpperCase();
  if (/^FILL[-_ ]?\d/.test(code)) return false;
  const hay = `${p.subCategory ?? ""} ${p.description ?? ""}`.toLowerCase();
  if (/\bfiller\b|\bscribe\b/.test(hay)) return false;
  return true;
}

export function countertopSurfaces(
  placed: PlacedCabinet[],
  room: RoomData,
  island?: { x: number; y: number; width: number; depth: number } | null
): CountertopSurface[] {
  const out: CountertopSurface[] = [];
  const D = COUNTERTOP_DEPTH_IN;
  for (const p of placed) {
    // Only true countertop-bearing base cabinets get a slab (base/sink-base/
    // island bases) — never tall cabinets, appliances, panels, or fillers.
    if (!bearsCountertop(p)) continue;
    const { w } = rotatedSize(p);
    const side = cabinetWall(p, room);
    // Blind corner bases install pulled away from the corner (by the filler /
    // pull gap). Even though the cabinet is pulled off the wall, the countertop
    // still runs ALL THE WAY to the wall to cover the dead corner. We widen the
    // slab by the pull gap on the side that faces the corner. The gap defaults
    // to the standard 3" blind-corner filler; if a pull spec exists, use the
    // extra travel (pullMax - cabinet width) when larger.
    let cornerGap = 0;
    if (isBlindCorner(p.masterCode, p.description)) {
      cornerGap = BLIND_CORNER_FILLER_WIDTH_IN;
      const range = blindPullRange(p);
      if (range) cornerGap = Math.max(cornerGap, range.max - w);
      if (cornerGap < 0) cornerGap = 0;
    }
    if (side === "top") {
      // Extend toward whichever horizontal end is nearer the corner (the wall).
      const nearLeft = p.x <= room.width - (p.x + w);
      const x = nearLeft ? p.x - cornerGap : p.x;
      out.push({ x: Math.max(0, x), y: 0, width: w + cornerGap, depth: D, kind: "base" });
    } else if (side === "bottom") {
      const nearLeft = p.x <= room.width - (p.x + w);
      const x = nearLeft ? p.x - cornerGap : p.x;
      out.push({ x: Math.max(0, x), y: room.depth - D, width: w + cornerGap, depth: D, kind: "base" });
    } else if (side === "left") {
      // Vertical run: slab is D wide (into room) and w tall along the wall.
      const nearTop = p.y <= room.depth - (p.y + w);
      const y = nearTop ? p.y - cornerGap : p.y;
      out.push({ x: 0, y: Math.max(0, y), width: D, depth: w + cornerGap, kind: "base" });
    } else {
      const nearTop = p.y <= room.depth - (p.y + w);
      const y = nearTop ? p.y - cornerGap : p.y;
      out.push({ x: room.width - D, y: Math.max(0, y), width: D, depth: w + cornerGap, kind: "base" });
    }
  }
  if (island && island.width > 0 && island.depth > 0) {
    out.push({
      x: island.x,
      y: island.y,
      width: island.width,
      depth: island.depth,
      kind: "island",
    });
  }
  return out;
}

// ─── Sink & faucet fixtures ───────────────────────────────────────────────────
// Fixtures live on the countertop. We keep them simple: a sink basin (with a
// type) and a faucet point. Positions are room (inch) coordinates of the basin's
// top-left. Stored on the design draft so they persist.
export type SinkType = "single" | "double" | "farmhouse" | "bar";

export interface SinkFixture {
  uid: string;
  type: SinkType;
  x: number;
  y: number;
  width: number;
  depth: number;
  faucet: boolean;
}

export const SINK_PRESETS: Record<SinkType, { name: string; width: number; depth: number }> = {
  single:    { name: "Single Bowl Sink", width: 25, depth: 18 },
  double:    { name: "Double Bowl Sink", width: 33, depth: 20 },
  farmhouse: { name: "Farmhouse Sink",   width: 30, depth: 20 },
  bar:       { name: "Bar / Prep Sink",  width: 15, depth: 15 },
};

export function makeSink(type: SinkType, x: number, y: number): SinkFixture {
  const preset = SINK_PRESETS[type];
  return {
    uid: `sink-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    type,
    x,
    y,
    width: preset.width,
    depth: preset.depth,
    faucet: true,
  };
}

// ─── Corner-base conflict detection ──────────────────────────────────────────
// A standard base cabinet placed at a room corner (touching two walls) is only a
// layout problem when a DOOR / cased OPENING sits at that same corner — then the
// cabinet would block the door swing/access and a corner-specific cabinet
// (Blind Corner Base, Easy Reach, Lazy Susan, Corner Sink Base) or clearance is
// needed instead. When the corner is just solid WALL on both sides, a standard
// base in the corner is perfectly valid and must NOT be flagged.
//
// Detection: a base cabinet is "at a corner" when its footprint simultaneously
// touches two perpendicular room walls (within a 2" snap tolerance) AND at least
// one door/opening on either of those two walls reaches that corner.
//
// Exemptions:
//  - Cabinets that ARE corner types (BBC, CSB, ERB, LSB, UV-SBF, diagonal)
//  - Fillers, panels, accessories, appliances, wall/tall cabinets
//  - Island cabinets (they don't sit against room walls)
//  - Corners with no door/opening reaching them (solid wall = OK)
//
// `openingReach` is how close (inches) a door/opening edge must come to the
// corner to count as "at the corner".
//
// Returns the set of UIDs that should be flagged.
export function missingCornerBaseViolations(
  placed: PlacedCabinet[],
  room: RoomData,
  island?: { x: number; y: number; width: number; depth: number } | null,
  openings: WallOpening[] = [],
  tol = 2,
  openingReach = 2
): Set<string> {
  const violations = new Set<string>();

  // Does a door/cased opening reach the given end ("near" = wall start, "far" =
  // wall end) of the wall on `side`? Windows never block floor access, so only
  // doors and cased openings count.
  const openingAtWallEnd = (side: WallSide, end: "near" | "far"): boolean => {
    const len = wallLength(side, room);
    for (const o of openings) {
      if (o.side !== side) continue;
      if (o.kind !== "door" && o.kind !== "opening") continue;
      const start = o.offset;
      const finish = o.offset + o.width;
      if (end === "near" && start <= openingReach) return true;
      if (end === "far" && finish >= len - openingReach) return true;
    }
    return false;
  };

  for (const p of placed) {
    // Only base-placement cabinets can have this violation.
    if (p.placement !== "base") continue;
    // Skip island cabinets.
    if (island && isOnIsland(p, island)) continue;
    // Skip fillers, panels, accessories.
    if (!bearsCountertop(p)) continue;
    // Skip cabinets that ARE corner types — they are the correct solution.
    const code = (p.masterCode ?? "").toUpperCase();
    if (isCornerCabinet(code, p.description ?? undefined)) continue;
    if (isAngledWallCabinet(code, p.description ?? undefined)) continue;
    // UV-SBF (corner sink base filler) and similar specialty corner items.
    if (/^(UV-SBF|CSB|ERB|LSB|BBC)/.test(code)) continue;

    // Check if this cabinet touches two perpendicular walls simultaneously.
    const { w, d } = rotatedSize(p);
    const nearLeft   = p.x <= tol;
    const nearRight  = Math.abs(p.x + w - room.width) <= tol;
    const nearTop    = p.y <= tol;
    const nearBottom = Math.abs(p.y + d - room.depth) <= tol;

    // For each corner the cabinet occupies, only flag it when a door/opening
    // actually reaches that corner on either of the two forming walls. The
    // wall-start/end mapping: top/bottom run left→right (near=left corner),
    // left/right run top→bottom (near=top corner).
    let flag = false;
    if (nearTop && nearLeft) {
      if (openingAtWallEnd("top", "near") || openingAtWallEnd("left", "near")) flag = true;
    }
    if (nearTop && nearRight) {
      if (openingAtWallEnd("top", "far") || openingAtWallEnd("right", "near")) flag = true;
    }
    if (nearBottom && nearLeft) {
      if (openingAtWallEnd("bottom", "near") || openingAtWallEnd("left", "far")) flag = true;
    }
    if (nearBottom && nearRight) {
      if (openingAtWallEnd("bottom", "far") || openingAtWallEnd("right", "far")) flag = true;
    }

    if (flag) {
      violations.add(p.uid);
    }
  }

  return violations;
}

// ─── Gap Intelligence ────────────────────────────────────────────────────────
// Compute all gaps on every wall for a given placement layer, returning each
// gap with its run-axis start, length, center position, and wall side so the
// canvas can render a measurement label and fill-suggestion popover.
export type WallGap = {
  side: WallSide;
  layer: "base" | "wall";
  /** Run-axis start of the gap (inches from the wall's near corner). */
  start: number;
  /** Gap length in inches. */
  length: number;
  /** Run-axis center of the gap (for label placement). */
  center: number;
  /** True if the gap is exactly a standard cabinet width (9"–48" in 3" steps). */
  isStandardSize: boolean;
  /** True if the gap is small enough to be filled with a filler (≤ 6"). */
  isFillerSize: boolean;
};

const STANDARD_WIDTHS_GAP = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48];

export function wallGaps(
  room: RoomData,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  /** Minimum gap size to report (default 1" — show every gap). */
  minLen = 1
): WallGap[] {
  const sides: WallSide[] = ["top", "bottom", "left", "right"];
  const layers: Array<"base" | "wall"> = ["base", "wall"];
  const gaps: WallGap[] = [];
  for (const side of sides) {
    for (const layer of layers) {
      const segs = freeSegmentsOnWall(side, room, placed, openings, minLen, 0, layer);
      for (const seg of segs) {
        const len = seg.length;
        gaps.push({
          side,
          layer,
          start: seg.start,
          length: len,
          center: seg.start + len / 2,
          isStandardSize: STANDARD_WIDTHS_GAP.some((w) => Math.abs(w - len) < 0.5),
          isFillerSize: len <= 6,
        });
      }
    }
  }
  return gaps;
}

// ─── Dining Furniture ─────────────────────────────────────────────────────────
// Floor-plan-only space planning items (no pricing, no SKU, no elevation view).

export type FurnitureShape = "rect" | "round";

export interface FurnitureDef {
  id: string;
  name: string;
  category: "table" | "chair" | "stool" | "bench" | "other";
  shape: FurnitureShape;
  /** Width in inches (diameter for round items) */
  w: number;
  /** Depth in inches (same as w for round items) */
  d: number;
  /** Recommended clearance around the item in inches */
  clearance: number;
  color: string;
}

export const FURNITURE_CATALOG: FurnitureDef[] = [
  { id: "tbl-round-42",  name: "Round Table (4-person)",  category: "table", shape: "round", w: 42, d: 42, clearance: 36, color: "#d4a96a" },
  { id: "tbl-round-54",  name: "Round Table (6-person)",  category: "table", shape: "round", w: 54, d: 54, clearance: 36, color: "#d4a96a" },
  { id: "tbl-rect-4",    name: "Rect Table (4-person)",   category: "table", shape: "rect",  w: 60, d: 36, clearance: 36, color: "#d4a96a" },
  { id: "tbl-rect-6",    name: "Rect Table (6-person)",   category: "table", shape: "rect",  w: 72, d: 36, clearance: 36, color: "#d4a96a" },
  { id: "tbl-rect-8",    name: "Rect Table (8-person)",   category: "table", shape: "rect",  w: 84, d: 42, clearance: 36, color: "#d4a96a" },
  { id: "tbl-square-4",  name: "Square Table (4-person)", category: "table", shape: "rect",  w: 42, d: 42, clearance: 36, color: "#d4a96a" },
  { id: "chair-dining",  name: "Dining Chair",            category: "chair", shape: "rect",  w: 18, d: 20, clearance: 0,  color: "#8b7355" },
  { id: "chair-arm",     name: "Arm Chair",               category: "chair", shape: "rect",  w: 24, d: 24, clearance: 0,  color: "#8b7355" },
  { id: "stool-bar",     name: "Bar Stool",               category: "stool", shape: "round", w: 14, d: 14, clearance: 0,  color: "#6b5b45" },
  { id: "stool-counter", name: "Counter Stool",           category: "stool", shape: "round", w: 16, d: 16, clearance: 0,  color: "#6b5b45" },
  { id: "bench-48",      name: 'Bench 48"',               category: "bench", shape: "rect",  w: 48, d: 14, clearance: 0,  color: "#7a6a50" },
  { id: "bench-60",      name: 'Bench 60"',               category: "bench", shape: "rect",  w: 60, d: 14, clearance: 0,  color: "#7a6a50" },
];

export interface PlacedFurniture {
  uid: string;
  defId: string;
  x: number;
  y: number;
  rotation: number;
}

export function makeFurniture(defId: string, x: number, y: number): PlacedFurniture {
  return {
    uid: `furn-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    defId,
    x,
    y,
    rotation: 0,
  };
}

export function furnitureFootprint(f: PlacedFurniture, def: FurnitureDef): { w: number; d: number } {
  if (def.shape === "round") return { w: def.w, d: def.d };
  if (f.rotation === 90 || f.rotation === 270) return { w: def.d, d: def.w };
  return { w: def.w, d: def.d };
}

// ─── Backsplash Materials ─────────────────────────────────────────────────────
export interface BacksplashMaterial {
  id: string;
  name: string;
  /** CSS background for the backsplash area in elevation view */
  fill: string;
  /** Grout/outline color */
  grout: string;
  /** Tile pattern type for rendering hints */
  pattern: "solid" | "subway" | "hexagon" | "mosaic" | "large-format" | "herringbone";
}

export const BACKSPLASH_MATERIALS: BacksplashMaterial[] = [
  { id: "white-subway",     name: "White Subway Tile",    fill: "#f5f5f5", grout: "#c8c8c8", pattern: "subway" },
  { id: "gray-subway",      name: "Gray Subway Tile",     fill: "#b0b8c1", grout: "#8a9099", pattern: "subway" },
  { id: "marble-hex",       name: "Marble Hexagon",       fill: "#e8e8e8", grout: "#d0d0d0", pattern: "hexagon" },
  { id: "white-hex",        name: "White Hexagon",        fill: "#f0f0f0", grout: "#cccccc", pattern: "hexagon" },
  { id: "black-mosaic",     name: "Black Mosaic",         fill: "#2a2a2a", grout: "#444444", pattern: "mosaic" },
  { id: "blue-zellige",     name: "Blue Zellige",         fill: "#4a7fa5", grout: "#2d5f80", pattern: "mosaic" },
  { id: "terracotta",       name: "Terracotta",           fill: "#c0714a", grout: "#8a4e30", pattern: "large-format" },
  { id: "white-large",      name: "White Large Format",   fill: "#f8f8f8", grout: "#e0e0e0", pattern: "large-format" },
  { id: "herringbone-wood", name: "Wood Herringbone",     fill: "#b08050", grout: "#8a6038", pattern: "herringbone" },
  { id: "stainless",        name: "Stainless Steel",      fill: "#c0c4c8", grout: "#a0a4a8", pattern: "solid" },
  { id: "none",             name: "None (Painted Wall)",  fill: "#f0ece4", grout: "#f0ece4", pattern: "solid" },
];

export function backsplashMaterial(id: string | null | undefined): BacksplashMaterial {
  return BACKSPLASH_MATERIALS.find((m) => m.id === id) ?? BACKSPLASH_MATERIALS[0];
}

// ─── Flooring Materials ───────────────────────────────────────────────────────
export interface FlooringMaterial {
  id: string;
  name: string;
  /** Primary fill color for plan view */
  fill: string;
  /** Grout/joint color */
  grout: string;
  /** Pattern type for plan-view rendering */
  pattern: "hardwood" | "tile-grid" | "tile-diagonal" | "herringbone" | "chevron" | "solid" | "plank";
  /** Plank/tile width in inches (for scale rendering) */
  tileW: number;
  /** Plank/tile height in inches */
  tileH: number;
}

export const FLOORING_MATERIALS: FlooringMaterial[] = [
  { id: "oak-hardwood",      name: "Oak Hardwood",         fill: "#c8a060", grout: "#a07840", pattern: "hardwood",     tileW: 3,  tileH: 36 },
  { id: "walnut-hardwood",   name: "Walnut Hardwood",      fill: "#7a5030", grout: "#5a3820", pattern: "hardwood",     tileW: 4,  tileH: 48 },
  { id: "white-oak",         name: "White Oak",            fill: "#d8c090", grout: "#b09060", pattern: "hardwood",     tileW: 5,  tileH: 48 },
  { id: "white-tile",        name: "White Ceramic Tile",   fill: "#f2f2f2", grout: "#d0d0d0", pattern: "tile-grid",    tileW: 12, tileH: 12 },
  { id: "gray-tile",         name: "Gray Porcelain Tile",  fill: "#b8bec4", grout: "#8a9099", pattern: "tile-grid",    tileW: 24, tileH: 24 },
  { id: "black-tile",        name: "Black Slate Tile",     fill: "#2a2e32", grout: "#444850", pattern: "tile-grid",    tileW: 12, tileH: 12 },
  { id: "herringbone-tile",  name: "Herringbone Tile",     fill: "#e0d8cc", grout: "#c0b8a8", pattern: "herringbone",  tileW: 4,  tileH: 12 },
  { id: "chevron-wood",      name: "Chevron Wood",         fill: "#b89060", grout: "#907040", pattern: "chevron",      tileW: 3,  tileH: 18 },
  { id: "luxury-vinyl",      name: "Luxury Vinyl Plank",   fill: "#c0a870", grout: "#a08050", pattern: "plank",        tileW: 7,  tileH: 48 },
  { id: "concrete",          name: "Polished Concrete",    fill: "#9a9ea2", grout: "#9a9ea2", pattern: "solid",        tileW: 24, tileH: 24 },
  { id: "none",              name: "No Flooring",          fill: "#f5f3ef", grout: "#f5f3ef", pattern: "solid",        tileW: 12, tileH: 12 },
];

export function flooringMaterial(id: string | null | undefined): FlooringMaterial {
  return FLOORING_MATERIALS.find((m) => m.id === id) ?? FLOORING_MATERIALS[10];
}

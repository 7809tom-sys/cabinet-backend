// ─── Kitchen Design geometry & snapping engine ──────────────────────────────
// All real-world units are INCHES. The canvas converts inches → pixels via PPI.
import {
  closestWall as closestPolygonWall,
  positionAlongWall,
  wallAngle as polygonWallAngle,
  wallSegmentLength as polygonWallSegmentLength,
} from "./polygonRoom";
export { isGlassPolicyNomenclature } from "./glassPolicy";

export const STD = {
  BASE_HEIGHT: 34.5,
  // A freestanding range replaces the 1½-inch countertop slab in its opening,
  // so its burner surface must align with the finished counter top—not the
  // lower 34½-inch base-box top. This keeps a neighboring slab from visually
  // crossing over the stove in every Designer view.
  RANGE_COOKING_SURFACE_HEIGHT: 36,
  // Freestanding range backguards rise above the cooktop to this finished-floor top line.
  RANGE_BACKGUARD_TOP: 47,
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

/** Full-height refrigerator enclosure panels are architectural skins, never cabinet fronts. */
export function isRefrigeratorEndPanel(c: {
  description?: string | null;
  masterCode?: string | null;
  subCategory?: string | null;
  customProfile?: string | null;
}): boolean {
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""} ${c.customProfile ?? ""}`.toLowerCase();
  return /refrigerator[-\s]?end[-\s]?panel|refrigerator panel|refrigerator[-\s]?panel|refrigerator-end-panel|\brepv\b/.test(hay);
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
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""}`.toLowerCase();
  // Fillers and floating shelves are physical pieces that belong on the plan.
  // They must be considered before the loose-trim exclusion because some vendor
  // catalogs file them under a broad Trim & Molding category.
  if (/\bf(?:ill)?[-_]?\d|\bfiller\b/.test(hay)) return true;
  if (/floating shelf|\bopen shelf\b/.test(hay)) return true;
  if (isLooseTrimItem(c)) return false;
  if (isPanelItem(c)) return true; // end panels / skins / decorative panels
  // Appliance garages sit on the counter as a real box.
  if (/appliance garage|\bag-?\d/.test(hay)) return true;
  // A knee drawer is a real shallow cabinet box that fits in a seated work
  // area. It must appear in the plan rather than becoming a loose BOM line.
  if (isKneeDrawerItem(c)) return true;
  return false;
}

/** A catalog shelf mounted independently on a wall. These pieces may share a
 * plan span only when their real elevation bands remain separate. */
export function isFloatingShelfItem(c: {
  description?: string | null;
  masterCode?: string | null;
  subCategory?: string | null;
}): boolean {
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""}`.toLowerCase();
  return /floating shelf|\bopen shelf\b/.test(hay);
}

export const KNEE_DRAWER_MIN_MOUNT_BOTTOM_IN = 24;
export const KNEE_DRAWER_DEFAULT_MOUNT_BOTTOM_IN = 30;
export const KNEE_DRAWER_MAX_MOUNT_BOTTOM_IN = 30;

/** A shallow pull-out drawer mounted in a seated knee-space opening. */
export function isKneeDrawerItem(c: {
  description?: string | null;
  masterCode?: string | null;
  subCategory?: string | null;
  category?: string | null;
}): boolean {
  const code = (c.masterCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const hay = `${c.category ?? ""} ${c.subCategory ?? ""} ${c.description ?? ""}`.toLowerCase();
  return /\bknee\s*drawer\b|\bknee\b/.test(hay) || /^(?:VKD|DKD|KD)\d/.test(code);
}

/**
 * Repairs legacy FS catalog rows that were imported with a base-cabinet body.
 * The source shelf series is consistently a 12-inch-deep, 2.06-inch-thick wall
 * shelf; its code supplies the authoritative nominal width. This normalizer is
 * deliberately limited to FS-width shelf codes so no other accessory changes.
 */
export function normalizeFloatingShelfPlacement(cabinet: PlacedCabinet): PlacedCabinet {
  if (!isFloatingShelfItem(cabinet)) return cabinet;
  const widthMatch = /^FS[-_ ]?(\d+(?:\.\d+)?)$/i.exec(cabinet.masterCode ?? "");
  const width = Number(widthMatch?.[1]);
  if (!Number.isFinite(width) || width <= 0) return cabinet;
  return {
    ...cabinet,
    placement: "wall",
    width,
    nominalWidth: width,
    depth: STD.WALL_DEPTH,
    nominalDepth: STD.WALL_DEPTH,
    height: 2.06,
    nominalHeight: 2.06,
    numberOfDoors: 0,
    numberOfDrawers: 0,
  };
}

/** True for physical filler strips, including compact catalog codes such as F342. */
export function isFillerItem(c: {
  masterCode?: string | null;
  description?: string | null;
  subCategory?: string | null;
}) {
  const code = `${c.masterCode ?? ""}`.trim().toUpperCase();
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""}`.toLowerCase();
  return /^F(?:ILL)?[-_]?\d/.test(code) || /\bfiller\b/.test(hay);
}

export const FILLER_MIN_WIDTH_IN = 0.125;

/** A filler may trim down to 1/8in, but never grows beyond its own catalog width. */
export function fillerWidthRange(c: {
  masterCode?: string | null;
  description?: string | null;
  subCategory?: string | null;
  width?: number | null;
  nominalWidth?: number | null;
}) {
  if (!isFillerItem(c)) return null;
  const catalogWidth = Number(c.nominalWidth ?? c.width);
  return {
    min: FILLER_MIN_WIDTH_IN,
    max: Number.isFinite(catalogWidth) && catalogWidth > 0 ? catalogWidth : 3,
  };
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
  if (isKneeDrawerItem(c)) return "baseTop";
  if (/appliance garage|\bag-?\d/.test(hay)) return "wall";
  if (/floating shelf|\bopen shelf\b/.test(hay)) return "wall";
  if (/wall ?skin|\bws\b|wall panel|refrigerator panel/.test(hay)) return "wall";
  return "base";
}

export type Placement = "base" | "wall" | "tall" | "appliance" | "baseTop" | "underCabinet";

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
  /** Product visual selected in the designer palette; geometry remains catalog-owned. */
  catalogImageUrl?: string | null;
  // Which room types this fixture/appliance shows up in. Kitchen items default
  // to ["kitchen"]; shared items (e.g. a sink) can list multiple rooms.
  rooms: RoomType[];
}

export const APPLIANCES: ApplianceDef[] = [
  // ── Kitchen ──────────────────────────────────────────────────────────────
  { key: "range-black-gas", masterCode: "RANGE-30", description: '30" Black Gas Range', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, catalogImageUrl: "/manus-storage/30inchWideBlackGasRange-silhouette_0a25e71c.webp", rooms: ["kitchen"] },
  { key: "range-black-stainless-front-control", masterCode: "RANGE-30", description: '30" Black Stainless Front-Control Range', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, catalogImageUrl: "/manus-storage/30InchWideBlackStainlessSteelFrontControlRange-cropped_96100940.webp", rooms: ["kitchen"] },
  { key: "range-white-electric-front-control", masterCode: "RANGE-30", description: '30" White Electric Front-Control Range', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, catalogImageUrl: "/manus-storage/30InchZlineFrontControlWhiteElectricRange-cropped_e5144787.webp", rooms: ["kitchen"] },
  { key: "range-stainless-electric", masterCode: "RANGE-30", description: '30" Stainless Electric Range', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, catalogImageUrl: "/manus-storage/30inchWideStainlessSteelElectricRange-cropped_c6f3d3e6.webp", rooms: ["kitchen"] },
  { key: "range-stainless-front-control", masterCode: "RANGE-30", description: '30" Stainless Front-Control Range', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, catalogImageUrl: "/manus-storage/30InchWideStainlessSteelFrontControlRange-cropped_da918204.webp", rooms: ["kitchen"] },
  { key: "range-stainless-gas", masterCode: "RANGE-30", description: '30" Stainless Gas Range', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, catalogImageUrl: "/manus-storage/30inchWideStainlessSteelGasRange.webp-cropped_fa82008a.webp", rooms: ["kitchen"] },
  { key: "range-white-electric", masterCode: "RANGE-30", description: '30" White Electric Range', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, catalogImageUrl: "/manus-storage/30inchWideWhiteElectricrange-cropped_e64ebed4.webp", rooms: ["kitchen"] },
  { key: "range-white-gas", masterCode: "RANGE-30", description: '30" White Gas Range', width: 30, depth: 25, elevBottom: 0, elevHeight: 36, catalogImageUrl: "/manus-storage/30inchWideWhiteGasRange-cropped_df211ef6.webp", rooms: ["kitchen"] },
  { key: "fridge30", masterCode: "FRIDGE-30", description: 'Refrigerator 30"', width: 30, depth: 30, elevBottom: 0, elevHeight: 70, rooms: ["kitchen"] },
  { key: "fridge", masterCode: "FRIDGE-36", description: 'Refrigerator 36"', width: 36, depth: 30, elevBottom: 0, elevHeight: 70, catalogImageUrl: "/manus-storage/lg_french_door_refrigerator_front_b498406f.webp", rooms: ["kitchen"] },
  { key: "dishwasher", masterCode: "DW-24", description: 'Dishwasher 24"', width: 24, depth: 24, elevBottom: 0, elevHeight: 34.5, catalogImageUrl: "/manus-storage/whirlpool_dishwasher_front_5c695d52.webp", rooms: ["kitchen"] },
  { key: "winecooler", masterCode: "WINE-24", description: 'Wine Cooler 24"', width: 24, depth: 24, elevBottom: 0, elevHeight: 34.5, rooms: ["kitchen"] },
  { key: "sink", masterCode: "SINK-33", description: 'Sink 33"', width: 33, depth: 22, elevBottom: 30, elevHeight: 6, rooms: ["kitchen"] },
  { key: "hood-glass-stainless", masterCode: "HOOD-30", description: '30" Glass Stainless Range Hood', width: 30, depth: 18, elevBottom: 66, elevHeight: 18, catalogImageUrl: "/manus-storage/30InchGlassStainlessRangeHood-cropped_4a695aa8.webp", rooms: ["kitchen"] },
  { key: "hood-stainless-30", masterCode: "HOOD-30", description: '30" Stainless Range Hood', width: 30, depth: 18, elevBottom: 66, elevHeight: 18, catalogImageUrl: "/manus-storage/30InchWideStainlessRangeHood-cropped_b83ef9d3.webp", rooms: ["kitchen"] },
  { key: "hood-stainless-36", masterCode: "HOOD-36", description: '36" Stainless Range Hood', width: 36, depth: 18, elevBottom: 66, elevHeight: 18, catalogImageUrl: "/manus-storage/36InchStainlessRangeHood-cropped_275ed94d.webp", rooms: ["kitchen"] },
  { key: "microwave", masterCode: "MW-30", description: 'Over-Range Microwave 30"', width: 30, depth: 15, elevBottom: 54, elevHeight: 17, catalogImageUrl: "/manus-storage/zline_over_range_microwave_front_4976b7ab.webp", rooms: ["kitchen"] },
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
    catalogImageUrl: a.catalogImageUrl ?? null,
    isCornerCabinet: false,
    mountBottom: a.elevBottom,
  };
}

/**
 * Keeps an explicitly selected appliance visual on a saved placement. Older
 * placements did not persist visual choices, so a deterministic first supplied
 * appearance is used for the matching appliance family instead of falling back
 * to a generic drawing.
 */
export function applianceAppearanceImage(masterCode: string | null | undefined, selectedUrl?: string | null): string | null {
  const explicit = selectedUrl?.trim();
  if (explicit) return explicit;
  const normalized = `${masterCode ?? ""}`.toUpperCase();
  return APPLIANCES.find((item) => item.masterCode === normalized && Boolean(item.catalogImageUrl))?.catalogImageUrl ?? null;
}

export type RangeVisualAppearance = {
  finish: "stainless" | "black-stainless" | "white" | "black";
  fuel: "gas" | "electric";
  controlPosition: "front" | "rear";
  cooktopStyle: "gas-grate" | "electric-glass";
  backPanel: "raised" | "none";
  controlCount: number;
  ovenConfiguration: "single" | "double";
  bodyColor: string;
  controlColor: string;
};

/** Resolve the selected catalog range variant into deterministic 2D/3D finish data. */
export function rangeVisualAppearance(input: { description?: string | null; catalogImageUrl?: string | null }): RangeVisualAppearance {
  const source = `${input.description ?? ""} ${input.catalogImageUrl ?? ""}`.toLowerCase();
  const finish = /black[\s-]*stainless/.test(source)
    ? "black-stainless"
    : /\bwhite\b/.test(source)
      ? "white"
      : /\bblack\b/.test(source)
        ? "black"
        : "stainless";
  const fuel = /\bgas\b/.test(source) ? "gas" : "electric";
  const controlPosition = /front[\s-]*control/.test(source) ? "front" : "rear";
  const cooktopStyle = fuel === "gas" ? "gas-grate" : "electric-glass";
  const backPanel = controlPosition === "rear" ? "raised" : "none";
  const controlCount = fuel === "gas" ? 5 : 4;
  const ovenConfiguration = /double[\s-]*oven/.test(source) ? "double" : "single";
  const colors: Record<RangeVisualAppearance["finish"], Pick<RangeVisualAppearance, "bodyColor" | "controlColor">> = {
    stainless: { bodyColor: "#c7cbd0", controlColor: "#3b4147" },
    "black-stainless": { bodyColor: "#343a40", controlColor: "#12161b" },
    white: { bodyColor: "#f1f3f5", controlColor: "#aeb6c0" },
    black: { bodyColor: "#15191e", controlColor: "#070a0e" },
  };
  return { finish, fuel, controlPosition, cooktopStyle, backPanel, controlCount, ovenConfiguration, ...colors[finish] };
}

export function applianceElevationPresentation(masterCode: string | null | undefined): "vector" | "photo" {
  // A microwave is a front-facing wall appliance, so an approved catalog front
  // image reads correctly in elevation. Ranges remain measured vectors because
  // their catalog photography often exposes a perspective cooktop.
  return /^MW[-_]?/i.test(masterCode ?? "") ? "photo" : "vector";
}

export interface DesignCabinet {
  id: number;
  masterCode: string;
  /** Palette-only label for a composed catalog choice; never persisted or priced as a SKU. */
  displayMasterCode?: string | null;
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
  /** Floor height for an appliance or configured wall-mounted item. */
  mountBottom?: number | null;
  catalogImageUrl?: string | null;
  // Live Cabinet Config drawing rules. These are refreshed into older placed
  // designs so a catalog correction applies without re-placing the cabinet.
  specImageUrl?: string | null;
  graphicType?: string | null;
  // Manufacturer blind-corner pull range (inches across the corner). Optional;
  // when absent for a blind corner, the design flags a conflict so the admin
  // can enter the spec.
  pullMin?: number | null;
  pullMax?: number | null;
  // Corner cabinet type from the catalog config (lazy-susan, blind-corner,
  // diagonal, pie-cut, l-shape, triangle). Optional for backward-compat.
  cornerType?: string | null;
  openingType?: "top" | "middle" | "bottom" | null;
  doorHeight?: number | null;
  drawerHeight?: number | null;
  doorOrientation?: "side-by-side" | "stacked" | null;
  layoutSpec?: string | null;
  drawerLayout?: string | null;
	  customProfile?: string | null;
	  facePattern?: "slats" | "criss-cross" | "lattice" | "open" | null;
	  /** Catalog choice represents a glass-front cabinet configuration. */
	  glassDoor?: boolean | null;
	  glassDoorAddonCode?: string | null;
	  /** Selected distributor includes the glass insert in this glass SKU's price. */
	  glassIncluded?: boolean | null;
}

// Door hinge side as seen from the front of the cabinet. "none" is used for
// items without a hinged door (drawer bases, open shelves, panels, appliances).
export type DoorSwing = "left" | "right" | "double" | "none";
export type DecorativeEndTreatment = "none" | "left" | "right" | "both";
/** Horizontal position of the visible pull or knob on a placed cabinet front. */
export type CabinetHardwarePosition = "auto" | "left" | "center" | "right" | "paired" | "top-center";

export type RefrigeratorAssemblyRole = "bridge" | "left-panel" | "right-panel";
export type RefrigeratorPanelMode = "left" | "right" | "both" | "none";
export type IslandFace = "front" | "back" | "left" | "right";
/** Floor treatment for a shallow wall cabinet intentionally used as an island face. */
export type IslandWallCabinetBaseTreatment = "toe-kick" | "base-molding";

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
  /** Current master corner classification, refreshed into older saved designs. */
  isCornerCabinet?: boolean | null;
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
  // Set after an intentional 3D Move In/Move Out action. Legacy placements
  // without this flag are seated against their nearest physical wall in 3D.
  depthPositionAdjusted?: boolean;
  // Set after an intentional left/right move of a mounted range hood. Hoods
  // without this flag remain auto-centered above their matching range.
  rangeHoodPositionAdjusted?: boolean;
  // Official 20/20 catalog line-art for this cabinet code, if available.
  // Optional for backward-compat with older saved designs; the canvas falls
  // back to the to-scale code-drawn shape when absent.
  catalogImageUrl?: string | null;
  // Optional Custom Cabinet Rule profile and generic line drawing. These come
  // from Cabinet Config and preserve non-standard cabinet rendering in designs.
  customProfile?: string | null;
  genericDrawingUrl?: string | null;
  fixedShelfCount?: number | null;
  adjustableShelfCount?: number | null;
  // User override for a WALL cabinet's mount height (inches from floor to the
  // BOTTOM of the box). When set, the elevation uses this exactly; when absent,
  // elevationBox derives the bottom from the default rule (stacker stacks on
  // top at 84"; a standalone short wall cabinet hangs from the 84" top line).
  mountBottom?: number | null;
  /** True after a user intentionally changes mountBottom; automatic over-sink cleanup must preserve it. */
  mountBottomAdjusted?: boolean;
  /** Wall cabinet whose top physically supports this glass stacker. */
  stackedOnCabinetUid?: string | null;
  /** Refrigerator UID that owns this over-fridge cabinet or enclosure panel. */
  refrigeratorAssemblyId?: string | null;
  /** Durable role inside a refrigerator enclosure so movement/rebuild cannot orphan a member. */
  refrigeratorAssemblyRole?: RefrigeratorAssemblyRole | null;
  /** Requested enclosure-panel mode persisted on the refrigerator appliance. */
  refrigeratorPanelMode?: RefrigeratorPanelMode | null;
  /** Explicit run on a wall-free island scene; retained through save/restore. */
  islandFace?: IslandFace | null;
  /** A shallow wall cabinet intentionally used as a counter-height island face. */
  islandCounterHeightWallCabinet?: boolean;
  /** Island-only floor finish: recessed kick or a full-depth furniture plinth. */
  islandWallCabinetBaseTreatment?: IslandWallCabinetBaseTreatment | null;
  /** Left-to-right position in inches along the selected island face. */
  islandOffset?: number | null;
  // Blind corner cabinets install ACROSS the corner with a manufacturer pull
  // range: the cabinet can be pulled away from the corner between pullMin and
  // pullMax inches (e.g. a 36" blind base that pulls out to 39"). These come
  // from the manufacturer spec and are carried onto the placed item. When a
  // blind corner cabinet has NO pull spec, the design is flagged as a conflict
  // so the administrator can enter the manufacturer's min/max pull.
  pullMin?: number | null;
  pullMax?: number | null;
  /**
   * User intentionally detached this cabinet from its automatic corner vertex.
   * The cabinet remains fully collision-protected but does not re-acquire the
   * green locked-corner state or force a corner target during a subsequent drag.
   */
  cornerSnapUnlocked?: boolean;
  // Per-cabinet finish/door-style override for TWO-TONE designs. When set, this
  // cabinet uses this styleId instead of the design's default finish — e.g. a
  // white perimeter with a contrasting island/uppers. Must belong to the same
  // locked distributor family as the design. When null/undefined the cabinet
  // inherits the design's default styleId (see effectiveStyleId).
  styleId?: number | null;
  /** Shared identifier for physical pieces cut from one purchased catalog filler. */
  fillerPieceGroupId?: string | null;
  /** Only the primary piece contributes a catalog/cart/invoice quantity. */
  fillerBillingRole?: "primary" | "secondary" | null;
  /** Total installed filler width represented by every piece in the group. */
  fillerTotalWidth?: number | null;
  /** Installation choice retained in saved designs for build-sheet clarity. */
  fillerPlacementMode?: "left" | "right" | "split" | null;
  /** Cabinet whose measured opening owns this editable filler group. */
  fillerForCabinetUid?: string | null;
  /**
   * A WBC's required F342 is integrated into the cabinet face rather than being
   * a second cabinet footprint. The priced line remains persisted for the cart,
   * materials list, and grouped removal, while the owning WBC renders the strip.
   */
  integratedWallBlindFiller?: boolean | null;
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
  // Legacy left/right pull position. Retained so older saved designs restore
  // unchanged; new individual hardware choices use `hardwarePosition` below.
  handleSide?: "left" | "right" | "top" | "bottom" | null;
  // Individual cabinet hardware placement chosen in Attributes. `auto` (or no
  // value) retains the cabinet's hinge-aware supplier/default pull position.
  // `paired` places one pull at the meeting edge of each leaf on paired doors.
  hardwarePosition?: CabinetHardwarePosition | null;
  // rolloutQty: number of roll-out (pull-out) trays to add inside this base
  // cabinet. Priced as an add-on line per tray.
  rolloutQty?: number | null;
  // Per-item discount (negative) or surcharge (positive) as a percentage.
  // e.g. -10 means 10% off, +5 means 5% surcharge. Applied to the unit price
  // before computing the line total. Null/undefined means no adjustment.
  discountPct?: number | null;
  // Glass door upgrade: when true, the cabinet is ordered as its GD variant
  // (e.g. W-30-30 → W-30-30GD). Only valid for wall cabinets that have a
  // matching GD code in the catalog.
  glassDoor?: boolean;
  /** Distributor policy captured with a glass cabinet/door line. False = buy glass separately. */
  glassIncluded?: boolean | null;
  // Optional decorative door-style panel on one or both exposed cabinet ends.
  // Ordinary cabinet sides remain plain selected-finish skins by default.
  decorativeEnd?: DecorativeEndTreatment;
  // Blind corner pull distance (inches): how far the blind portion extends
  // past the perpendicular wall into the corner. Editable by the user within
  // [pullMin, pullMax] (defaults 3-6"). When set, the cabinet is positioned
  // so that exactly this many inches are the "blind" section. When absent,
  // defaults to pullMax (6") for auto-placed BBCs.
  blindPull?: number | null;
  // Waterfall countertop edge: when true, the countertop material cascades
  // down the left and/or right side of this cabinet to the floor. Typically
  // used on island ends or end-of-run bases. Adds extra material to the BOM.
  waterfallLeft?: boolean;
  waterfallRight?: boolean;
  // Oven type for tall oven cabinets (O-code). 'single' = 1 oven + 3 drawers;
  // 'double' = 2 stacked ovens + 1 drawer. Drives the elevation renderer.
  ovenType?: "single" | "double" | null;
  // Appliance opening position: 'top' | 'middle' | 'bottom'. Drives elevation layout.
  openingType?: "top" | "middle" | "bottom" | null;
  // Maximum interior appliance opening envelope from Cabinet Config, in inches.
  openingWidth?: number | null;
  openingHeight?: number | null;
  // Door height in inches (for cabinets with appliance openings). Used to
  // calculate exact opening size: opening = totalHeight - doorHeight - drawerHeight.
  doorHeight?: number | null;
  // Drawer height in inches (height of each drawer front)
  drawerHeight?: number | null;
  // Door orientation: 'side-by-side' or 'stacked'. Drives elevation layout.
  doorOrientation?: "side-by-side" | "stacked" | null;
  // Sink base top type: what sits on top of this sink base cabinet.
  // 'sink' = a sink fixture (default); 'gas' | 'electric' | 'smooth-top' = range top type.
  // When a range top is chosen, no sink fixture is added and the elevation
  // renders the range top burners/coils instead of a faucet.
  sinkTopType?: "sink" | "gas" | "electric" | "smooth-top" | null;
  // Pelican product id of the chosen sink or range top (for cart/BOM).
  sinkTopProductId?: number | null;
  // Pelican product id of the chosen faucet (for cart/BOM and elevation rendering).
  faucetProductId?: number | null;
  // Image URL of the chosen faucet product (for elevation rendering).
  faucetImageUrl?: string | null;
  // Image URL of the chosen sink product (for elevation rendering).
  sinkImageUrl?: string | null;
  // Image URL of the chosen range top product (for elevation rendering).
  rangeTopImageUrl?: string | null;
  // Range top finish for the elevation face panel: 'stainless' (default) or 'black-glass'.
  // Independent of sinkTopType (gas/electric/smooth-top) — any burner type can have either finish.
  rangeTopFinish?: "stainless" | "black-glass" | null;
  /** Polygon room: which custom wall segment this cabinet is placed on.
   *  Only used when the room has customWalls. */
  wallId?: string | null;
  /** Inches from the selected custom-wall start vertex. Preserves exact angled-run gaps. */
  wallOffset?: number | null;
  /** Which face of a two-sided peninsula run owns this cabinet. */
  peninsulaSide?: PeninsulaCabinetSide | null;
  // Visual layout spec JSON: {baseType, sections:[{type,count,height}]}
  // When present, the elevation renderer uses this exact spec instead of the
  // legacy auto-detect logic. Sections are ordered top-to-bottom in the array
  // and rendered bottom-up in the elevation view.
  layoutSpec?: string | null;
  // Drawer row layout JSON: [{count:N, height?:H}, ...]
  // Each entry is a row of N side-by-side drawers. When present, the elevation
  // renderer uses this to render drawers side-by-side instead of stacked.
  drawerLayout?: string | null;
  // Corner cabinet type from the catalog: null = standard, or one of the
  // corner types. Carried from the catalog so the plan canvas and elevation
  // can render the correct footprint/shape without relying solely on code-
  // pattern matching. Optional for backward-compat with older saved designs.
  cornerType?: string | null;
  // Face pattern for specialty open-front cabinets (wine racks, plate racks, etc.)
  // When set, the elevation renderer replaces door/drawer panels with this pattern.
  facePattern?: "slats" | "criss-cross" | "lattice" | "open" | null;
  // Glass door add-on: masterCode of the separate glass door SKU (same distributor).
  // When set, the designer shows an "Add Glass Door" button.
  glassDoorAddonCode?: string | null;
}

/** The master fields editable from Designer Edit Config that affect 2D drawing. */
export type MasterCabinetDrawingRefresh = {
  cabinetId: number;
  masterCode?: string | null;
  description?: string | null;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
  category?: string | null;
  subCategory?: string | null;
  isCornerCabinet?: boolean | null;
  cornerType?: string | null;
  pullMin?: number | null;
  pullMax?: number | null;
  mountBottom?: number | null;
  graphicType?: string | null;
  specImageUrl?: string | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  openingType?: "top" | "middle" | "bottom" | null;
  openingWidth?: number | null;
  openingHeight?: number | null;
  doorHeight?: number | null;
  drawerHeight?: number | null;
  doorOrientation?: "side-by-side" | "stacked" | null;
  layoutSpec?: string | null;
  drawerLayout?: string | null;
  customProfile?: string | null;
  facePattern?: "slats" | "criss-cross" | "lattice" | "open" | null;
  glassIncluded?: boolean | null;
};

/**
 * Applies a persisted master drawing change to all matching cabinets already
 * placed in the open design. This makes the selected elevation/plan refresh
 * instantly instead of waiting for the cabinet palette to be reopened.
 */
export function refreshPlacedCabinetsFromMasterConfig(
  placed: PlacedCabinet[],
  master: MasterCabinetDrawingRefresh,
): PlacedCabinet[] {
  return placed.map((cabinet) => {
    if (cabinet.cabinetId !== master.cabinetId) return cabinet;
    const blind = isBlindCorner(master.masterCode ?? cabinet.masterCode, master.description ?? cabinet.description);
    const blindWidth = blind
      ? blindCornerNominalWidth({ masterCode: master.masterCode ?? cabinet.masterCode, width: master.width ?? cabinet.width })
      : null;
    return {
      ...cabinet,
	      ...(blindWidth != null ? { width: blindWidth, nominalWidth: blindWidth } : {}),
	      ...(blind && master.depth != null ? { depth: Number(master.depth), nominalDepth: Number(master.depth) } : {}),
	      ...(blind && master.height != null ? { height: Number(master.height), nominalHeight: Number(master.height) } : {}),
      ...(master.category !== undefined ? { category: master.category } : {}),
      ...(master.subCategory !== undefined ? { subCategory: master.subCategory } : {}),
      ...(master.isCornerCabinet !== undefined ? { isCornerCabinet: master.isCornerCabinet } : {}),
      ...(master.cornerType !== undefined ? { cornerType: master.cornerType } : {}),
      ...(master.pullMin !== undefined ? { pullMin: master.pullMin } : {}),
      ...(master.pullMax !== undefined ? { pullMax: master.pullMax } : {}),
      ...(master.mountBottom !== undefined ? { mountBottom: master.mountBottom } : {}),
      ...(master.graphicType !== undefined
        ? { customProfile: master.graphicType && master.graphicType !== "standard" ? master.graphicType : null }
        : {}),
      ...(master.specImageUrl !== undefined ? { genericDrawingUrl: master.specImageUrl } : {}),
      ...(master.numberOfDoors !== undefined ? { numberOfDoors: master.numberOfDoors } : {}),
      ...(master.numberOfDrawers !== undefined ? { numberOfDrawers: master.numberOfDrawers } : {}),
      ...(master.openingType !== undefined ? { openingType: master.openingType } : {}),
      ...(master.openingWidth !== undefined ? { openingWidth: master.openingWidth } : {}),
      ...(master.openingHeight !== undefined ? { openingHeight: master.openingHeight } : {}),
      ...(master.doorHeight !== undefined ? { doorHeight: master.doorHeight } : {}),
      ...(master.drawerHeight !== undefined ? { drawerHeight: master.drawerHeight } : {}),
      ...(master.doorOrientation !== undefined ? { doorOrientation: master.doorOrientation } : {}),
      ...(master.layoutSpec !== undefined ? { layoutSpec: master.layoutSpec } : {}),
      ...(master.drawerLayout !== undefined ? { drawerLayout: master.drawerLayout } : {}),
      ...(master.customProfile !== undefined ? { customProfile: master.customProfile } : {}),
      ...(master.facePattern !== undefined ? { facePattern: master.facePattern } : {}),
      ...(master.glassIncluded !== undefined ? { glassIncluded: master.glassIncluded } : {}),
    };
  });
}

/**
 * Reapplies every currently available Cabinet Config drawing rule to an open
 * design. Saved designs intentionally retain their placement and dimensions,
 * but their drawing metadata must never become a stale source of truth after
 * the catalog configuration changes.
 */
export function refreshPlacedCabinetsFromMasterRules(
  placed: PlacedCabinet[],
  masters: MasterCabinetDrawingRefresh[],
): PlacedCabinet[] {
  const byCabinetId = new Map(masters.map((master) => [master.cabinetId, master]));
  let changed = false;
  const refreshed = placed.map((cabinet) => {
    const master = byCabinetId.get(cabinet.cabinetId);
    if (!master) return cabinet;
    const next = refreshPlacedCabinetsFromMasterConfig([cabinet], master)[0]!;
    if (
	      next.category !== cabinet.category ||
	      next.width !== cabinet.width ||
	      next.depth !== cabinet.depth ||
	      next.height !== cabinet.height ||
      next.subCategory !== cabinet.subCategory ||
      next.isCornerCabinet !== cabinet.isCornerCabinet ||
      next.cornerType !== cabinet.cornerType ||
      next.pullMin !== cabinet.pullMin ||
      next.pullMax !== cabinet.pullMax ||
      next.mountBottom !== cabinet.mountBottom ||
      next.customProfile !== cabinet.customProfile ||
      next.genericDrawingUrl !== cabinet.genericDrawingUrl ||
      next.numberOfDoors !== cabinet.numberOfDoors ||
      next.numberOfDrawers !== cabinet.numberOfDrawers ||
	      next.openingType !== cabinet.openingType ||
	      next.openingWidth !== cabinet.openingWidth ||
      next.doorHeight !== cabinet.doorHeight ||
      next.drawerHeight !== cabinet.drawerHeight ||
      next.doorOrientation !== cabinet.doorOrientation ||
      next.layoutSpec !== cabinet.layoutSpec ||
	      next.drawerLayout !== cabinet.drawerLayout ||
	      next.facePattern !== cabinet.facePattern ||
	      next.glassIncluded !== cabinet.glassIncluded
    ) {
      changed = true;
      return next;
    }
    return cabinet;
  });
  return changed ? refreshed : placed;
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
  masterCode?: string | null; description?: string | null; category?: string | null; subCategory?: string | null;
}): number {
  // Fillers and scribes are catalog trim pieces intentionally cut to the field
  // measurement. Their approved SKU price is the source of truth; applying the
  // generic cabinet-resize fee would manufacture a second, unsupported charge.
  const identity = `${p.masterCode ?? ""} ${p.description ?? ""} ${p.category ?? ""} ${p.subCategory ?? ""}`.toLowerCase();
  if (/\bfiller\b|\bscribe\b/.test(identity)) return 0;
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

/** True when a wall cabinet is used as floor casework rather than as an upper.
 * Its door pull stays on the same hinge-aware side rail but moves upward for
 * comfortable access. Island ownership remains authoritative for older saves
 * whose mountBottom still contains the former room-wall value. */
export function usesRaisedFloorWallDoorPull(p: {
  placement?: Placement | string | null;
  mountBottom?: number | null;
  islandFace?: IslandFace | null;
  islandCounterHeightWallCabinet?: boolean | null;
}): boolean {
  if (p.placement !== "wall") return false;
  if (p.islandFace || p.islandCounterHeightWallCabinet === true) return true;
  return typeof p.mountBottom === "number"
    && Math.abs(p.mountBottom - STD.TOE_KICK) <= COLLISION_EPSILON_IN;
}

export function resolveCabinetHardwarePosition(p: {
  hardwarePosition?: CabinetHardwarePosition | null;
  handleSide?: "left" | "right" | "top" | "bottom" | null;
  placement?: Placement | string | null;
  mountBottom?: number | null;
  islandFace?: IslandFace | null;
  islandCounterHeightWallCabinet?: boolean | null;
}): CabinetHardwarePosition {
  // The raised position is a construction rule for floor-seated wall cabinets,
  // not an editable hardware style. Retire any saved top-center override while
  // preserving an explicit left/right rail choice.
  if (usesRaisedFloorWallDoorPull(p) && p.hardwarePosition === "top-center") return "auto";
  // A door pull cannot sit in the center panel. Older plans may have saved the
  // retired Center option; treat it as Automatic so every hinged door returns
  // to the applicable opening-edge stile without mutating the saved cabinet.
  if (p.hardwarePosition === "center") return "auto";
  if (
    p.hardwarePosition === "auto" ||
    p.hardwarePosition === "left" ||
    p.hardwarePosition === "right" ||
    p.hardwarePosition === "paired" ||
    p.hardwarePosition === "top-center"
  ) {
    return p.hardwarePosition;
  }
  if (p.handleSide === "left" || p.handleSide === "right") return p.handleSide;
  return "auto";
}

/** Persist one door-hardware choice using both the current field and the legacy
 * left/right alias needed by older saved-design consumers. */
export function cabinetHardwarePositionPatch(
  side: CabinetHardwarePosition,
): Pick<PlacedCabinet, "hardwarePosition" | "handleSide"> {
  const normalizedSide = side === "center" ? "auto" : side;
  return {
    hardwarePosition: normalizedSide === "auto" ? null : normalizedSide,
    handleSide: normalizedSide === "left" || normalizedSide === "right" ? normalizedSide : null,
  };
}

/** The centered horizontal pull on the top rail is available for B15/B18 bases.
 * Floor-seated wall cabinets use an automatic raised vertical pull instead. */
export function supportsCenteredTopDoorPull(p: {
  masterCode?: string | null;
  placement?: Placement | null;
  islandFace?: IslandFace | null;
  islandCounterHeightWallCabinet?: boolean | null;
}): boolean {
  const code = `${p.masterCode ?? ""}`.trim().toUpperCase();
  return p.placement === "base" && /^B[-_ ]?(?:15|18)(?:\D|$)/.test(code);
}

/** True when a placed record has a real door front eligible for the requested
 * bulk hardware choice. Drawers, appliances, panels, and open units are never
 * changed. Paired hardware applies only to two-door cabinet fronts. */
export function isCabinetDoorHardwareEligible(
  p: PlacedCabinet,
  side: CabinetHardwarePosition,
): boolean {
  if (p.noDoor || p.placement === "appliance" || !hasDoorSwing(p)) return false;
  if (side === "top-center") return supportsCenteredTopDoorPull(p);
  if (side !== "paired") return true;
  return resolveSwing(p) === "double" || (p.numberOfDoors ?? 0) >= 2;
}

/** Copy a door-hardware choice to every eligible cabinet without touching any
 * unrelated cabinet attribute. Drawer pulls remain centered by renderer rule. */
export function applyCabinetDoorHardwareToAll(
  placed: PlacedCabinet[],
  side: CabinetHardwarePosition,
): PlacedCabinet[] {
  const patch = cabinetHardwarePositionPatch(side);
  let changed = false;
  const next = placed.map((cabinet) => {
    if (!isCabinetDoorHardwareEligible(cabinet, side)) return cabinet;
    if (cabinet.hardwarePosition === patch.hardwarePosition && cabinet.handleSide === patch.handleSide) return cabinet;
    changed = true;
    return { ...cabinet, ...patch };
  });
  return changed ? next : placed;
}

export function cabinetAttrNote(p: {
  noDoor?: boolean;
  handleSide?: "left" | "right" | "top" | "bottom" | null;
  hardwarePosition?: CabinetHardwarePosition | null;
}): string {
  if (p.noDoor) return "No door (open unit)";
  const hardwarePosition = resolveCabinetHardwarePosition(p);
  if (hardwarePosition !== "auto") return `Hardware ${hardwarePosition}`;
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

/**
 * When Color 1 changes in a single-finish design (no Color 2), ALL per-cabinet
 * style overrides must be cleared so every cabinet inherits the new active style.
 * This handles the case where cabinets were placed under different styles during
 * browsing — switching the design style must update the entire kitchen uniformly.
 * Explicit two-tone overrides are preserved whenever a second style is active.
 */
export function rebaseFormerDefaultStyleOverrides<T extends { styleId?: number | null }>(
  cabinets: T[],
  formerDefaultStyleId: number | null,
  nextDefaultStyleId: number,
  preserveTwoToneOverrides: boolean,
): T[] {
  if (formerDefaultStyleId == null || formerDefaultStyleId === nextDefaultStyleId || preserveTwoToneOverrides) return cabinets;
  // In single-finish mode, clear ALL per-cabinet overrides so every cabinet
  // follows the new design default. This prevents stale overrides from previous
  // style selections from showing different finishes in the list and cart.
  return cabinets.map((cabinet) =>
    cabinet.styleId != null ? { ...cabinet, styleId: null } as T : cabinet
  );
}

/**
 * Saved plans may contain an obsolete per-cabinet finish from a different
 * supplier line. It cannot be priced against the plan's locked distributor, so
 * clear only that foreign override and let the cabinet inherit the plan finish.
 * Same-distributor two-tone overrides remain untouched.
 */
export function clearForeignSavedStyleOverrides<T extends { styleId?: number | null }>(
  cabinets: T[],
  selectedDistributorId: number | null | undefined,
  distributorByStyleId: ReadonlyMap<number, number>,
): T[] {
  if (selectedDistributorId == null) return cabinets;
  return cabinets.map((cabinet) => {
    const overrideDistributorId = cabinet.styleId == null ? undefined : distributorByStyleId.get(cabinet.styleId);
    return overrideDistributorId != null && overrideDistributorId !== selectedDistributorId
      ? { ...cabinet, styleId: null } as T
      : cabinet;
  });
}

/**
 * Resolve the finish used for price lookups. A saved cabinet can retain a
 * legacy per-cabinet style from another distributor until client state has
 * normalized. That foreign finish must never create a cross-distributor price
 * lookup: price it at the plan's active finish instead. Explicit same-line
 * two-tone overrides remain intact, and an unknown historic style is retained
 * rather than guessed.
 */
export function pricingStyleId(
  cab: { styleId?: number | null },
  defaultStyleId: number | null,
  selectedDistributorId: number | null | undefined,
  distributorByStyleId: ReadonlyMap<number, number>,
): number | null {
  const overrideStyleId = cab.styleId;
  const overrideDistributorId = overrideStyleId == null
    ? undefined
    : distributorByStyleId.get(overrideStyleId);
  if (
    defaultStyleId != null &&
    selectedDistributorId != null &&
    overrideDistributorId != null &&
    overrideDistributorId !== selectedDistributorId
  ) {
    return defaultStyleId;
  }
  return effectiveStyleId(cab, defaultStyleId);
}

/**
 * Rendering follows the active selected sample for a normal one-finish design.
 * Per-cabinet style IDs are honored only after the user has explicitly selected
 * a distinct second two-tone style; this prevents stale placement metadata from
 * repainting a single-finish elevation in several unrelated colors.
 */
export function displayedStyleId(
  cab: { styleId?: number | null },
  activeStyleId: number | null,
  twoToneEnabled: boolean,
): number | null {
  if (activeStyleId == null) return null;
  return twoToneEnabled ? effectiveStyleId(cab, activeStyleId) : activeStyleId;
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
  // Lazy Susan and Easy Reach base cabinets need a user-selectable opening side
  // even when a legacy catalog row records their two physical face panels.
  const code = (p.masterCode ?? "").toUpperCase();
  const hay = `${p.description ?? ""} ${p.masterCode ?? ""}`.toLowerCase();
  if (/^(?:LSB?|ERB|BER)[-_]?\d/.test(code) || /lazy\s*susan|easy\s*reach/.test(hay)) return true;
  // Prefer an explicit positive count. Some legacy placed designs copied a
  // master-default zero even though the source-backed description explicitly
  // identifies a single-door cabinet (for example B-15). Preserve hinge editing
  // for that unambiguous case without turning drawer-only products into doors.
  if (typeof p.numberOfDoors === "number") {
    if (p.numberOfDoors > 0) return true;
    if (/\b(?:single|one|1)[- ]door\b/.test(hay)) return true;
    return false;
  }
  // Drawer-only bases (no doors) typically have a drawer count and no doors.
  if (/\bdrawer base\b|^db|drawer\b/.test(hay) && !/door/.test(hay)) return false;
  // Default: assume it has a door.
  return true;
}

// Resolve a placed cabinet's swing, defaulting double-door cabinets to "double"
// and single-door cabinets to "left" (most common), and "none" for no-door items.
export function resolveSwing(p: PlacedCabinet): DoorSwing {
  if (!hasDoorSwing(p)) return "none";
  if (p.swing && p.swing !== "none") return p.swing;
  const code = (p.masterCode ?? "").toUpperCase();
  const hay = `${p.description ?? ""} ${p.masterCode ?? ""}`.toLowerCase();
  if (/^(?:LSB?|ERB|BER)[-_]?\d/.test(code) || /lazy\s*susan|easy\s*reach/.test(hay)) return "left";
  if (typeof p.numberOfDoors === "number" && p.numberOfDoors >= 2) return "double";
  // `none` on a legacy one-door placement means the swing was never authored,
  // not that the physical door disappeared. Once hasDoorSwing has established
  // a real hinged door, use the standard left default until the user selects a
  // side in Cabinet Attributes.
  return "left";
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
  if (placement === "baseTop") return 10; // knee drawers, spice racks: typically 10-12" tall
  if (placement === "underCabinet") return 8; // stem glass holders: typically 8-10" tall
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
/** Standard finished-floor bottom for a short cabinet directly above a sink. */
export const OVER_SINK_WALL_MOUNT_BOTTOM = 70;

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

/** A single painted finish applied uniformly to the room's perimeter or custom walls. */
export interface RoomWallAppearance {
  color?: string;
  texture?: DrywallPonyWallTexture;
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
  /** Optional painted finish shared by every physical perimeter/custom room wall. */
  wallAppearance?: RoomWallAppearance;
  /** Polygon room: ordered vertices defining the room shape. When present,
   *  the room is a polygon; when absent, it's the classic rectangle. */
  vertices?: import("@/lib/polygonRoom").RoomVertex[];
  /** Polygon room: wall segments connecting vertices. */
  customWalls?: import("@/lib/polygonRoom").CustomWall[];
  /** True when customWalls form an intentional connected path rather than a closed perimeter. */
  openWallPath?: boolean;
  /** Free-standing cabinet-supported runs that leave a room wall as a peninsula. */
  peninsulaRuns?: PeninsulaRun[];
  /**
   * Complete saved 2D entities that sit alongside the room shell. Persisting
   * them with the room makes a reloaded 3D scene a deterministic conversion of
   * the same source plan rather than a partial reconstruction.
   */
  persistedEntities?: PersistedDesignEntities;
}

export type PeninsulaTurn = 45 | 90;
export type PeninsulaDirection = "left" | "right";
/** The side of a peninsula center line where a cabinet is seated. */
export type PeninsulaCabinetSide = "left" | "right";

export interface PeninsulaRun {
  id: string;
  /** Cardinal room wall where a primary peninsula begins. */
  parentWall?: WallSide;
  /** Optional connected peninsula run whose far endpoint anchors this return. */
  parentRunId?: string;
  /** Exact distance in inches from a primary parent wall's start corner. */
  startOffset: number;
  /**
   * A primary peninsula turns the parent wall into an open connection at its
   * attachment. The longer original wall section remains available for cabinets
   * and the shorter section becomes the open connection. Kept optional so
   * already-saved peninsula runs follow this default rule.
   */
  terminatesParentWall?: boolean;
  /** Locked continuation turn relative to the parent wall. */
  turn: PeninsulaTurn;
  direction: PeninsulaDirection;
  /** Measured pulled length in inches. */
  length: number;
  /** Finished peninsula wall/rail height; base cabinets remain floor-supported. */
  height: number;
  /** Default face for new cabinets placed on this two-sided peninsula run. */
  cabinetSide?: PeninsulaCabinetSide;
  /** Extra seating projection past the cabinet front on the selected cabinet side. */
  countertopSeatingOverhang?: 0 | 10 | 12;
  /** Bar projection that carries the slab across a drywall pony wall and past its back face. */
  countertopPonyWallBarOverhang?: 0 | 10 | 12;
  /** A full-height counter panel at this run's exposed far end. */
  countertopWaterfallEnd?: boolean;
  /**
   * Freezes the whole connected peninsula assembly at its current measured
   * attachment and return geometry. Stored on the root run; children resolve
   * the same protection through peninsulaRunAssemblyLocked().
   */
  locked?: boolean;
  label?: string;
}

/** Finds the root of a connected peninsula assembly without trusting run order. */
export function peninsulaRootRunId(run: PeninsulaRun, room: Pick<RoomData, "peninsulaRuns">): string {
  const runs = room.peninsulaRuns ?? [];
  const visited = new Set<string>();
  let current = run;
  while (current.parentRunId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = runs.find((candidate) => candidate.id === current.parentRunId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

/** A lock on any selected peninsula segment protects its root and every return. */
export function peninsulaRunAssemblyLocked(run: PeninsulaRun, room: Pick<RoomData, "peninsulaRuns">): boolean {
  const rootId = peninsulaRootRunId(run, room);
  return Boolean((room.peninsulaRuns ?? []).find((candidate) => candidate.id === rootId)?.locked);
}

/**
 * The installer clearance belongs only to an acute 45-degree inside turn.
 * A square 90-degree return is served by normal cabinet footprint collision
 * and must allow a cabinet to seat directly at its available corner.
 */
export function peninsulaRunHas45StartInsideCornerClearance(run: PeninsulaRun): boolean {
  return Boolean(run.parentRunId && run.turn === 45);
}

export function peninsulaRunHas45EndInsideCornerClearance(run: PeninsulaRun, room: RoomData): boolean {
  return Boolean(room.peninsulaRuns?.some((candidate) => candidate.parentRunId === run.id && candidate.turn === 45));
}

/** Exact room-space line geometry for a persisted peninsula run. */
export function peninsulaRunEndpoints(run: PeninsulaRun, room: Pick<RoomData, "width" | "depth">): {
  start: { x: number; y: number };
  end: { x: number; y: number };
  radians: number;
} {
  const parentRun = run.parentRunId
    ? (room as RoomData).peninsulaRuns?.find((candidate) => candidate.id === run.parentRunId)
    : undefined;
  const parentWall = run.parentWall ?? "top";
  const span = parentWall === "top" || parentWall === "bottom" ? room.width : room.depth;
  const offset = Math.max(0, Math.min(span, Number(run.startOffset) || 0));
  const rootStart = parentWall === "top"
    ? { x: offset, y: 0 }
    : parentWall === "bottom"
      ? { x: offset, y: room.depth }
      : parentWall === "left"
        ? { x: 0, y: offset }
        : { x: room.width, y: offset };
  const parentRadians: Record<WallSide, number> = {
    top: 0,
    right: Math.PI / 2,
    bottom: Math.PI,
    left: -Math.PI / 2,
  };
  // A primary peninsula always leaves its parent wall through the interior on
  // one straight cabinet-ready axis. 45° is valid only for a child run from
  // that primary's free end. Treating an old primary 45° record as straight
  // preserves saved layouts while preventing its cabinet footprint from
  // becoming the diamond-shaped pseudo-corner shown in older plans.
  const parentGeometry = parentRun ? peninsulaRunEndpoints(parentRun, room) : null;
  const start = parentGeometry?.end ?? rootStart;
  const parentHeading = parentGeometry?.radians ?? parentRadians[parentWall];
  // A primary run leaves its room wall through the room interior. A connected
  // return leaves the prior run's far endpoint and turns relative to that run.
  const radians = parentGeometry
    ? parentHeading + (run.turn === 90
      ? (run.direction === "right" ? Math.PI / 2 : -Math.PI / 2)
      : (run.direction === "right" ? Math.PI / 4 : -Math.PI / 4))
    : parentHeading + Math.PI / 2;
  const length = Math.max(6, Number(run.length) || 6);
  return {
    start,
    end: {
      x: Math.round((start.x + Math.cos(radians) * length) * 8) / 8,
      y: Math.round((start.y + Math.sin(radians) * length) * 8) / 8,
    },
    radians,
  };
}

/** Maximum interior pull length before a peninsula continuation reaches a room boundary. */
export function peninsulaRunMaxLength(run: Omit<PeninsulaRun, "length"> & { length?: number }, room: Pick<RoomData, "width" | "depth">): number {
  const { start, radians } = peninsulaRunEndpoints({ ...run, length: 6 }, room);
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const candidates: number[] = [];
  if (dx > 1e-9) candidates.push((room.width - start.x) / dx);
  if (dx < -1e-9) candidates.push(-start.x / dx);
  if (dy > 1e-9) candidates.push((room.depth - start.y) / dy);
  if (dy < -1e-9) candidates.push(-start.y / dy);
  const maximum = Math.min(...candidates.filter((candidate) => Number.isFinite(candidate) && candidate >= 0));
  return Math.max(6, Math.floor(maximum * 8) / 8);
}

/** Projects a room point to the parent wall and clamps a moved peninsula attachment to that adjoining wall. */
export function peninsulaRunStartOffsetAtPoint(
  run: PeninsulaRun,
  room: Pick<RoomData, "width" | "depth">,
  point: { x: number; y: number },
): number {
  // Returns are anchored to their parent run's far endpoint; only a primary
  // run may slide its joined attachment along a cardinal room wall.
  if (run.parentRunId || !run.parentWall) return 0;
  const parentLength = run.parentWall === "top" || run.parentWall === "bottom" ? room.width : room.depth;
  const rawOffset = run.parentWall === "top" || run.parentWall === "bottom" ? point.x : point.y;
  return Math.max(0, Math.min(Math.max(0, parentLength - 6), Math.round(rawOffset * 8) / 8));
}

/** Measures a room point along a locked peninsula run, clamped to its usable length. */
export function peninsulaRunOffsetAtPoint(run: PeninsulaRun, room: Pick<RoomData, "width" | "depth">, point: { x: number; y: number }): number {
  const { start, radians } = peninsulaRunEndpoints(run, room);
  const projected = (point.x - start.x) * Math.cos(radians) + (point.y - start.y) * Math.sin(radians);
  return Math.max(0, Math.min(run.length, Math.round(projected * 8) / 8));
}

/**
 * Resolves the closest committed peninsula segment at a plan point. This keeps
 * catalog drag/drop independent of the rectangle-wall fallback: a cabinet that
 * is dropped on the visible peninsula must belong to that exact run.
 */
export function peninsulaRunHitAtPoint(
  room: RoomData,
  point: { x: number; y: number },
  maximumDistance = Number.POSITIVE_INFINITY,
): { run: PeninsulaRun; offset: number; distance: number } | null {
  let nearest: { run: PeninsulaRun; offset: number; distance: number } | null = null;
  for (const run of room.peninsulaRuns ?? []) {
    const { start, radians } = peninsulaRunEndpoints(run, room);
    const tangent = { x: Math.cos(radians), y: Math.sin(radians) };
    const rawOffset = (point.x - start.x) * tangent.x + (point.y - start.y) * tangent.y;
    const offset = Math.max(0, Math.min(run.length, Math.round(rawOffset * 8) / 8));
    const nearestPoint = {
      x: start.x + tangent.x * offset,
      y: start.y + tangent.y * offset,
    };
    const distance = Math.hypot(point.x - nearestPoint.x, point.y - nearestPoint.y);
    if (distance <= maximumDistance && (!nearest || distance < nearest.distance)) {
      nearest = { run, offset, distance };
    }
  }
  return nearest;
}

export function peninsulaRunById(room: RoomData, wallId?: string | null): PeninsulaRun | null {
  if (!wallId) return null;
  return room.peninsulaRuns?.find((run) => run.id === wallId) ?? null;
}

/**
 * A connected peninsula is one countertop path. Its root run owns the seating
 * projection so a legacy child saved with zero cannot narrow the slab and leave
 * an uncovered triangular cabinet corner at a 45-degree joint.
 */
export function peninsulaCountertopSeatingOverhang(
  run: PeninsulaRun,
  room: Pick<RoomData, "peninsulaRuns">,
): 0 | 10 | 12 {
  const lineage: PeninsulaRun[] = [];
  const visited = new Set<string>();
  let current: PeninsulaRun | undefined = run;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    lineage.push(current);
    current = current.parentRunId
      ? room.peninsulaRuns?.find((candidate) => candidate.id === current!.parentRunId)
      : undefined;
  }
  const root = lineage[lineage.length - 1];
  const rootValue = root?.countertopSeatingOverhang;
  if (rootValue === 0 || rootValue === 10 || rootValue === 12) return rootValue;
  for (let index = lineage.length - 2; index >= 0; index -= 1) {
    const value = lineage[index]?.countertopSeatingOverhang;
    if (value === 10 || value === 12) return value;
  }
  return 0;
}

/**
 * A connected peninsula shares one bar treatment. The root run owns the
 * across-pony-wall projection so a return cannot leave an uncovered notch at
 * the shared bend.
 */
export function peninsulaCountertopPonyWallBarOverhang(
  run: PeninsulaRun,
  room: Pick<RoomData, "peninsulaRuns">,
): 0 | 10 | 12 {
  const lineage: PeninsulaRun[] = [];
  const visited = new Set<string>();
  let current: PeninsulaRun | undefined = run;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    lineage.push(current);
    current = current.parentRunId ? room.peninsulaRuns?.find((candidate) => candidate.id === current!.parentRunId) : undefined;
  }
  const root = lineage[lineage.length - 1];
  const rootValue = root?.countertopPonyWallBarOverhang;
  if (rootValue === 0 || rootValue === 10 || rootValue === 12) return rootValue;
  for (let index = lineage.length - 2; index >= 0; index -= 1) {
    const value = lineage[index]?.countertopPonyWallBarOverhang;
    if (value === 10 || value === 12) return value;
  }
  return 0;
}

/** Standard framed/drywall pony-wall thickness used when a bar top crosses it. */
export const DRYWALL_PONY_WALL_COUNTERTOP_SUPPORT_DEPTH_IN = 4.5;

/**
 * The selected bar top must first cross the finished pony wall, then project
 * beyond it. A zero setting preserves the existing cabinet-front-only top.
 */
export function peninsulaCountertopPonyWallBackExtensionIn(
  run: PeninsulaRun,
  room: Pick<RoomData, "peninsulaRuns">,
): number {
  const barOverhang = peninsulaCountertopPonyWallBarOverhang(run, room);
  return barOverhang > 0 ? DRYWALL_PONY_WALL_COUNTERTOP_SUPPORT_DEPTH_IN + barOverhang : 0;
}

/** A connected countertop has one exposed far end; move a legacy root flag to the terminal run. */
export function peninsulaCountertopWaterfallEnd(
  run: PeninsulaRun,
  room: Pick<RoomData, "peninsulaRuns">,
): boolean {
  const runs = room.peninsulaRuns ?? [];
  if (runs.some((candidate) => candidate.parentRunId === run.id)) return false;
  const visited = new Set<string>();
  let current: PeninsulaRun | undefined = run;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.countertopWaterfallEnd === true) return true;
    current = current.parentRunId
      ? runs.find((candidate) => candidate.id === current!.parentRunId)
      : undefined;
  }
  return false;
}

/**
 * Older saved plans can contain cabinets visibly seated on a peninsula without
 * the explicit `wallId` / `wallOffset` metadata added for connected runs. Those
 * legacy records otherwise look like perimeter cabinets to the free-span and
 * collision routines: a new cabinet is placed into their occupied space and is
 * then rejected as an overlap. Recover the unambiguous run ownership from the
 * existing saved geometry, preserving its actual width, face side, and position.
 * Cabinets already assigned to a room wall, island, custom wall, or peninsula
 * are deliberately left untouched.
 */
export function normalizeLegacyPeninsulaCabinets(placed: PlacedCabinet[], room: RoomData): PlacedCabinet[] {
  if (!room.peninsulaRuns?.length) return placed;
  let changed = false;
  const normalized = placed.map((cabinet) => {
    if (cabinet.islandFace || !["base", "wall", "tall", "appliance"].includes(cabinet.placement)) return cabinet;
    const width = Math.max(0, Number(cabinet.width) || 0);
    const depth = Math.max(0, Number(cabinet.depth) || 0);
    if (width <= 0 || depth <= 0) return cabinet;
    const ownedRun = peninsulaRunById(room, cabinet.wallId);
    // Explicit run metadata is authoritative after a saved plan reload. Rebuild
    // the plan position from the run ID, saved along-run offset, and selected
    // cabinet side for both primary and connected segments. This clears stale
    // diagonal rotations/coordinates that otherwise survive refresh as a large
    // diamond even though the cabinet belongs to the highlighted straight run.
    if (ownedRun) {
      const currentFootprint = placedFootprint(cabinet);
      const currentCenter = { x: cabinet.x + currentFootprint.w / 2, y: cabinet.y + currentFootprint.d / 2 };
      const projectedOffset = peninsulaRunOffsetAtPoint(ownedRun, room, currentCenter) - width / 2;
      const rawOffset = Number.isFinite(Number(cabinet.wallOffset))
        ? Number(cabinet.wallOffset)
        : Math.max(0, projectedOffset);
      const offset = Math.max(0, Math.min(Math.max(0, ownedRun.length - width), rawOffset));
      // The selected run side is authoritative. Legacy cabinet-level side
      // values can describe the pre-migration diagonal and would otherwise
      // keep a corrected cabinet visibly on the opposite side of its wall.
      const peninsulaSide = ownedRun.cabinetSide ?? cabinet.peninsulaSide ?? "left";
      const spot = wallPlacementAt(offset, width, depth, ownedRun.id as WallSide, room, peninsulaSide);
      const alreadyCanonical = (
        Math.abs(cabinet.x - spot.x) <= 0.01 &&
        Math.abs(cabinet.y - spot.y) <= 0.01 &&
        Math.abs((((cabinet.rotation - spot.rotation + 540) % 360) - 180)) <= 0.01 &&
        cabinet.wallId === ownedRun.id &&
        Math.abs((Number(cabinet.wallOffset) || 0) - (spot.wallOffset ?? 0)) <= 0.01 &&
        cabinet.peninsulaSide === (spot.peninsulaSide ?? peninsulaSide)
      );
      if (alreadyCanonical) return cabinet;
      changed = true;
      return { ...cabinet, ...spot, wallId: ownedRun.id, wallOffset: spot.wallOffset ?? 0, peninsulaSide: spot.peninsulaSide ?? peninsulaSide };
    }
    // A legacy peninsula cabinet can still carry its original parent-wall ID;
    // that stale perimeter owner must be recoverable from its seated geometry.
    let footprint = placedFootprint(cabinet);
    let center = { x: cabinet.x + footprint.w / 2, y: cabinet.y + footprint.d / 2 };
    let hit = peninsulaRunHitAtPoint(room, center, depth / 2 + 1);
    // A record saved before the run existed can preserve the parent-wall
    // rotation. Re-evaluate its center using the matching connected-run axis so
    // the old rotation cannot shift the recovered span by a cabinet depth.
    const parentOwnedRun = !hit && cabinet.wallId
      ? (room.peninsulaRuns ?? []).find((run) => run.parentWall === cabinet.wallId)
      : hit && cabinet.wallId === hit.run.parentWall
        ? hit.run
        : null;
    if (parentOwnedRun) {
      const { radians } = peninsulaRunEndpoints(parentOwnedRun, room);
      const intendedRotation = ((radians * 180) / Math.PI + 360) % 360;
      const rotationDistance = (left: number, right: number) => Math.abs((((left - right + 540) % 360) - 180));
      const matchesIntendedAxis = rotationDistance(cabinet.rotation, intendedRotation) <= 0.51
        || rotationDistance(cabinet.rotation, intendedRotation + 180) <= 0.51;
      if (!matchesIntendedAxis) {
        footprint = placedFootprint({ ...cabinet, rotation: intendedRotation });
        center = { x: cabinet.x + footprint.w / 2, y: cabinet.y + footprint.d / 2 };
        const recoveredHit = peninsulaRunHitAtPoint(room, center, depth / 2 + 1);
        if (recoveredHit?.run.id === parentOwnedRun.id) hit = recoveredHit;
      }
    }
    if (!hit || (cabinet.wallId && cabinet.wallId !== hit.run.parentWall)) return cabinet;
    // A real parent-wall corner unit can sit at the peninsula attachment and
    // naturally fall within the run hit-test tolerance. It is not a legacy
    // peninsula cabinet: retaining its parent-wall ownership lets the automatic
    // peninsula start offset clear its actual body before the first cabinet is
    // added. Reassigning it to the peninsula instead blocks the full run span.
    const isParentWallCorner = cabinet.wallId === hit.run.parentWall && (
      placedCornerGeometryKind(cabinet) === "l-shape" ||
      placedCornerGeometryKind(cabinet) === "diagonal" ||
      placedCornerGeometryKind(cabinet) === "corner-drawer" ||
      placedCornerGeometryKind(cabinet) === "blind-corner"
    );
    if (isParentWallCorner) return cabinet;
    const { radians } = peninsulaRunEndpoints(hit.run, room);
    const tangentRotation = ((radians * 180) / Math.PI + 360) % 360;
    const rotationDistance = (left: number, right: number) => Math.abs((((left - right + 540) % 360) - 180));
    const matchesRunAxis = rotationDistance(cabinet.rotation, tangentRotation) <= 0.51
      || rotationDistance(cabinet.rotation, tangentRotation + 180) <= 0.51;
    // A persisted cabinet can retain the perimeter wall's old rotation even
    // when its center is visibly seated in the run that splits from that wall.
    // The parent-wall identity plus the geometric hit is more authoritative
    // than this stale rotation; retain the rotation guard for unowned records.
    const hasLegacyParentWallOwner = cabinet.wallId === hit.run.parentWall;
    if (!matchesRunAxis && !hasLegacyParentWallOwner) return cabinet;
    const start = peninsulaRunEndpoints(hit.run, room).start;
    const leftNormal = { x: -Math.sin(radians), y: Math.cos(radians) };
    const lateral = (center.x - start.x) * leftNormal.x + (center.y - start.y) * leftNormal.y;
    const peninsulaSide: PeninsulaCabinetSide = lateral >= 0 ? "left" : "right";
    const spot = wallPlacementAt(hit.offset - width / 2, width, depth, hit.run.id as WallSide, room, peninsulaSide);
    changed = true;
    return { ...cabinet, ...spot, wallId: hit.run.id, wallOffset: spot.wallOffset ?? 0, peninsulaSide: spot.peninsulaSide ?? peninsulaSide };
  });
  return changed ? normalized : placed;
}

/**
 * Removes one free-standing peninsula run and only the cabinets that explicitly
 * belong to it. Perimeter/custom room walls and cabinets on every other wall
 * are intentionally preserved. Countertop, price, and materials collections are
 * derived from placed cabinets, so callers receive the matching retained list.
 */
export function removePeninsulaRun(room: RoomData, placed: PlacedCabinet[], runId: string): {
  room: RoomData;
  placed: PlacedCabinet[];
  removedCabinetUids: string[];
} {
  const run = peninsulaRunById(room, runId);
  if (!run) return { room, placed, removedCabinetUids: [] };
  const removedRunIds = new Set<string>([run.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of room.peninsulaRuns ?? []) {
      if (candidate.parentRunId && removedRunIds.has(candidate.parentRunId) && !removedRunIds.has(candidate.id)) {
        removedRunIds.add(candidate.id);
        changed = true;
      }
    }
  }
  const removedCabinetUids = placed
    .filter((cabinet) => removedRunIds.has(cabinetWall(cabinet, room)))
    .map((cabinet) => cabinet.uid);
  return {
    room: {
      ...room,
      peninsulaRuns: (room.peninsulaRuns ?? []).filter((candidate) => !removedRunIds.has(candidate.id)),
    },
    placed: placed.filter((cabinet) => !removedRunIds.has(cabinetWall(cabinet, room))),
    removedCabinetUids,
  };
}

export interface PersistedDesignEntities {
  openings: WallOpening[];
  sinks: SinkFixture[];
  island: IslandZone | null;
  furniture: PlacedFurniture[];
  ponyWalls: PonyWall[];
}

export function roomWithPersistedEntities(room: RoomData, entities: PersistedDesignEntities): RoomData {
  return { ...room, persistedEntities: entities };
}

/**
 * Database rows use selectedStyleId/selectedDistributorId while some legacy
 * client snapshots use styleId/distributorId. Resolve both without losing the
 * saved design's active finish during a reload.
 */
export function restoredSavedDesignStyle(input: {
  styleId?: number | null;
  selectedStyleId?: number | null;
  distributorId?: number | null;
  selectedDistributorId?: number | null;
}) {
  return {
    styleId: input.styleId ?? input.selectedStyleId ?? null,
    distributorId: input.distributorId ?? input.selectedDistributorId ?? null,
  };
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

/**
 * Highest legal mount bottom for a wall cabinet at its current plan position.
 * Uses the selected wall's real flat or sloped ceiling across the cabinet's
 * complete run span instead of the legacy global room ceiling.
 */
export function wallCabinetVerticalMoveLimit(cabinet: PlacedCabinet, room: RoomData) {
	const side = cabinetWall(cabinet, room);
	const horizontal = side === "top" || side === "bottom";
	const footprint = placedFootprint(cabinet);
	const wallLength = horizontal ? room.width : room.depth;
	const runStart = horizontal ? cabinet.x : cabinet.y;
	const runEnd = runStart + (horizontal ? footprint.w : footprint.d);
	const startFraction = wallLength > 0 ? Math.max(0, Math.min(1, runStart / wallLength)) : 0;
	const endFraction = wallLength > 0 ? Math.max(0, Math.min(1, runEnd / wallLength)) : 1;
	const ceiling = Math.min(
		wallCeilingAt(room, side, startFraction),
		wallCeilingAt(room, side, endFraction),
	);
	const height = elevationBox(cabinet, room).height;
	return {
		side,
		ceiling: Math.round(ceiling * 1000) / 1000,
		maxBottom: Math.max(0, Math.round((ceiling - height) * 1000) / 1000),
	};
}

/**
 * A vertical move can expose a legacy horizontal seam overlap that was hidden
 * while two wall cabinets occupied different elevation bands. Repair only a
 * pointer-near wall-run error (the same three-inch attraction used by dragging)
 * to exact edge contact; never approve or preserve positive overlap.
 */
export function repairWallCabinetPlanSeamForVerticalMove(
	candidate: PlacedCabinet,
	room: RoomData,
	peers: PlacedCabinet[],
	openings: WallOpening[],
	maxRepairIn = 3,
): PlacedCabinet | null {
	if (candidate.placement !== "wall" || !hasCollision(candidate, peers)) return candidate;
	const side = cabinetWall(candidate, room);
	if (!isAgainstWall(candidate, side, room)) return null;
	const horizontal = side === "top" || side === "bottom";
	const footprint = placedFootprint(candidate);
	const runSpan = horizontal ? footprint.w : footprint.d;
	const wallDepth = horizontal ? footprint.d : footprint.w;
	const currentStart = horizontal ? candidate.x : candidate.y;
	const available = freeSegmentsOnWall(
		side,
		room,
		peers,
		openings,
		Math.min(runSpan, 9),
		WALL_OPENING_CLEARANCE_IN,
		"wall",
		false,
		candidate,
	);
	const repairedStart = nearestAvailableWallStart(available, currentStart, runSpan);
	if (repairedStart == null || Math.abs(repairedStart - currentStart) > maxRepairIn + COLLISION_EPSILON_IN) return null;
	const repaired = { ...candidate, ...wallPlacementAt(repairedStart, runSpan, wallDepth, side, room) };
	return hasCollision(repaired, peers) ? null : repaired;
}

export const DEFAULT_ROOM: RoomData = { width: 144, depth: 120, ceilingHeight: DEFAULT_CEILING_HEIGHT };

export function dim(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const raw = String(value).trim().replace(/[″"]/g, "");
  // Supplier exports commonly store a 3/4-inch panel as "3/4". parseFloat
  // reads that as 3, which turns a 36-inch refrigerator with two skins into a
  // visibly incorrect 42-inch enclosure. Honor ordinary and mixed fractions
  // before accepting a decimal/whole-number prefix.
  const mixedFraction = raw.match(/^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)(?:\D|$)/);
  if (mixedFraction) {
    const whole = Number(mixedFraction[1]);
    const numerator = Number(mixedFraction[2]);
    const denominator = Number(mixedFraction[3]);
    const measured = whole + numerator / denominator;
    return Number.isFinite(measured) && measured > 0 ? measured : fallback;
  }
  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)(?:\D|$)/);
  if (fraction) {
    const measured = Number(fraction[1]) / Number(fraction[2]);
    return Number.isFinite(measured) && measured > 0 ? measured : fallback;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Refrigerator end panels are thin finish skins. Supplier CSVs can express
 * their thickness as "3/4", "0.75", or a nominal 1.5-inch double panel.
 * Keep that structural thickness distinct from a panel's 24-inch depth so the
 * finished enclosure never inflates a 36-inch refrigerator to 42 inches.
 */
export function refrigeratorEndPanelThickness(
  value: string | null | undefined,
  fallback = 0.75,
): number {
  const parsed = dim(value, fallback);
  return parsed > 0 && parsed <= 3 ? parsed : fallback;
}

export type CabinetDimensionsIn = { width: number; height: number; depth: number };

/**
 * Authoritative dimension formats used by active wall-cabinet catalog lines.
 * A style/distributor prefix may precede the SKU; the dimensional code must be
 * the final token. W-36-24 therefore always resolves to 36W × 24H × 12D even
 * when a stale catalog column incorrectly contains 12 for width.
 */
export function wallCabinetSkuDimensions(masterCode: string | null | undefined): CabinetDimensionsIn | null {
  const code = (masterCode ?? "").trim().toUpperCase();
  const match = (pattern: RegExp) => code.match(pattern);
  let parsed = match(/(?:^|[^A-Z0-9])W-(\d{2})-(\d{2})$/);
  if (parsed) return { width: Number(parsed[1]), height: Number(parsed[2]), depth: 12 };
  parsed = match(/(?:^|[^A-Z0-9])WR(\d{2})(\d{2})$/);
  if (parsed) return { width: Number(parsed[1]), height: Number(parsed[2]), depth: 24 };
  parsed = match(/(?:^|[^A-Z0-9])W(\d{2})(\d{2})GD$/);
  if (parsed) return { width: Number(parsed[1]), height: Number(parsed[2]), depth: 12 };
  parsed = match(/(?:^|[^A-Z0-9])W(\d{2})(\d{2})(\d{2})$/);
  if (parsed) return { width: Number(parsed[1]), height: Number(parsed[2]), depth: Number(parsed[3]) };
  parsed = match(/(?:^|[^A-Z0-9])W(\d{2})(\d{2})$/);
  if (parsed) return { width: Number(parsed[1]), height: Number(parsed[2]), depth: 12 };
  return null;
}

export type GlassDoorCabinetLike = {
  masterCode?: string | null;
  description?: string | null;
  subCategory?: string | null;
  customProfile?: string | null;
  glassDoor?: boolean | null;
  fixedShelfCount?: number | null;
	adjustableShelfCount?: number | null;
};

/**
 * Distributor glass policy is nomenclature-driven. Every cabinet, stacker, or
 * replacement door whose normalized code ends in PG, GD, or G follows the
 * selected supplier's one policy setting. Keep this broader than the visual
 * glass-door classifier: a PG replacement part may not render as a cabinet,
 * but it still needs the correct purchase disclosure.
 */
/**
 * Catalog GD products are glass-door cabinets by definition. Saved layouts may
 * predate the explicit `glassDoor` flag, so normalized SKU, description,
 * subcategory, and configured graphic type all remain authoritative signals.
 */
export function isGlassDoorCabinet(cabinet: GlassDoorCabinetLike): boolean {
  if (cabinet.glassDoor === true) return true;
  const code = (cabinet.masterCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const text = `${cabinet.description ?? ""} ${cabinet.subCategory ?? ""} ${cabinet.customProfile ?? ""}`.toLowerCase();
  return /GD$/.test(code) || /glass[ -]?door/.test(text) || /(?:^|_)glass(?:_|$)/.test(text);
}

/**
 * Keep authored shelf fields primary. Some imported GD records describe their
 * shelves only in catalog prose (for example W2442GD: "3 Adjustable Shelves").
 */
export function glassDoorShelfCount(cabinet: GlassDoorCabinetLike): number {
  const configured = Math.max(0, Math.round(Number(cabinet.fixedShelfCount ?? 0)))
    + Math.max(0, Math.round(Number(cabinet.adjustableShelfCount ?? 0)));
  if (configured > 0) return Math.min(8, configured);
  const described = `${cabinet.description ?? ""}`.match(/(\d+)\s+(?:adjustable\s+|fixed\s+)?shel(?:f|ves)\b/i);
  return described ? Math.min(8, Math.max(0, Number(described[1]))) : 0;
}

export function resolvedDesignCabinetDimensions(cabinet: DesignCabinet): CabinetDimensionsIn {
  const sku = cabinet.placement === "wall" ? wallCabinetSkuDimensions(cabinet.masterCode) : null;
  return {
    width: isBlindCorner(cabinet.masterCode, cabinet.description)
      ? blindCornerNominalWidth(cabinet)
      : sku?.width ?? dim(cabinet.width, 24),
    height: sku?.height ?? dim(cabinet.height, standardHeight(cabinet.placement)),
    depth: sku?.depth ?? footprintDepth(cabinet),
  };
}

/**
 * A Base End Corner (BEC) is a 24x24 end return with two 12-inch faces. It is
 * deliberately not a lazy-Susan, diagonal, blind, or room-corner cabinet.
 */
export function isBaseEndCornerCabinet(c: Pick<DesignCabinet, "masterCode" | "description" | "cornerType"> | Pick<PlacedCabinet, "masterCode" | "description" | "cornerType">): boolean {
  const code = (c.masterCode ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const description = (c.description ?? "").toLowerCase();
  return c.cornerType === "base-end-corner" || /^bec\d/.test(code) || /base end (corner|angle|cabinet)/.test(description);
}

export function footprintDepth(c: DesignCabinet): number {
  // Panels/skins are flat 3/4" stock regardless of placement bucket.
  if (isPanelItem(c)) return dim(c.depth, STD.PANEL_THICKNESS) || STD.PANEL_THICKNESS;
  const wallSku = c.placement === "wall" ? wallCabinetSkuDimensions(c.masterCode) : null;
  if (wallSku) return wallSku.depth;
  // BEC end returns occupy a true 24x24 box, even if historical supplier data
  // stored a shallow depth. They do not use room-corner snapping or fillers.
  if (isBaseEndCornerCabinet(c)) return STD.BASE_DEPTH;
  // A diagonal corner cabinet occupies the same span on BOTH walls, so its
  // plan footprint is a square bounding box (e.g. 24" wide => 24" deep), not the
  // standard shallow wall/base depth.
  // cornerType="base-end-corner" is the admin override for BEC cabinets.
  if (c.cornerType === "base-end-corner" || isDiagonalCorner(c.masterCode || "", c.description || undefined)) {
    const w = dim(c.width, 24);
    return w > 0 ? w : 24;
  }
  // Blind corner cabinets (BBC/WBC) are standard rectangular boxes: their
  // width is the nominal size (e.g. 42") and depth is always the standard
  // base/wall depth (24" for base, 12" for wall). The catalog depth field
  // sometimes stores the pull dimension instead, so we force standard depth.
  if (isBlindCorner(c.masterCode || "", c.description || undefined)) {
    if (c.placement === "wall") return STD.WALL_DEPTH;
    return STD.BASE_DEPTH;
  }
  // An L-shaped corner cabinet (lazy-Susan / easy-reach corner) runs the
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
  const blind = isBlindCorner(p.masterCode, p.description);
  const width = blind ? blindCornerNominalWidth(p) : p.width;
  const depth = blind ? (p.placement === "wall" ? STD.WALL_DEPTH : STD.BASE_DEPTH) : p.depth;
  if (rot === 90 || rot === 270) {
    return { w: depth, d: width };
  }
  // Locked 45° cabinets retain their nominal body but reserve the smallest
  // axis-aligned screen envelope for general room bounds/cross-run checks.
  // Right-side seating flips the cabinet by 180° (45→225 or 315→135), so all
  // four diagonal quadrants must use the same expanded envelope. Treating only
  // 45/315 as diagonal shifts the rendered 135/225 body across its wall.
  if (rot === 45 || rot === 135 || rot === 225 || rot === 315) {
    const diagonal = Math.SQRT1_2;
    return { w: Math.abs(width * diagonal) + Math.abs(depth * diagonal), d: Math.abs(width * diagonal) + Math.abs(depth * diagonal) };
  }
  return { w: width, d: depth };
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

/**
 * The single saved-placement corner classification shared by the 2D plan and
 * the deterministic 3D renderer.  A renderer must never infer a different
 * shape from its own SKU heuristics: this exact result decides whether a saved
 * placement is a diagonal clipped corner, a right triangle, a blind box, an
 * L-corner, or an ordinary cabinet.
 */
export type PlacedCornerGeometryKind = "standard" | "diagonal" | "triangle" | "blind-corner" | "l-shape" | "corner-drawer" | "base-end";

export function placedCornerGeometryKind(p: PlacedCabinet): PlacedCornerGeometryKind {
  if (isBaseEndCornerCabinet(p)) return "base-end";
  if (/^cdb[-_]?\d/i.test(p.masterCode) || /corner drawer base/i.test(p.description ?? "")) return "corner-drawer";
  if (isTriangleCorner(p.masterCode, p.cornerType)) return "triangle";
  if (p.cornerType === "diagonal" || isDiagonalCorner(p.masterCode, p.description)) return "diagonal";
  if (p.cornerType === "blind-corner" || isBlindCorner(p.masterCode, p.description)) return "blind-corner";
  if (
    p.cornerType === "lazy-susan" ||
    p.cornerType === "pie-cut" ||
    p.cornerType === "l-shape" ||
    isLCornerCabinet(p.masterCode, p.description)
  ) return "l-shape";
  return "standard";
}

export function placedFootprint(p: PlacedCabinet): { w: number; d: number } {
  // A required WBC face filler is a commerce/build-sheet attachment to its owner,
  // not a second physical cabinet. Its visible 3-inch strip is rendered on the
  // WBC face, so it must reserve zero additional plan area and cannot overlap or
  // displace an adjoining cabinet run.
  if (p.integratedWallBlindFiller) return { w: 0, d: 0 };
  const cornerKind = placedCornerGeometryKind(p);
  // BEC-24 is a square 24x24 end-return box with a distinct two-face graphic.
  // Its footprint must remain stable through rotation, snapping, and collision
  // handling without putting it on any L-corner or filler path.
  if (cornerKind === "base-end") {
    return { w: STD.BASE_DEPTH, d: STD.BASE_DEPTH };
  }
  // AW1230-style angled wall cabinets use a true 12-by-12 triangular envelope:
  // each 12-inch side is against a wall and the single door spans the 45-degree
  // outer face. They share corner rotation with WDC cabinets but must never be
  // inflated to WDC's 24-by-24 wall-corner envelope.
  if (cornerKind === "diagonal" && isAngledWallCabinet(p.masterCode, p.description)) {
    return {
      w: Math.max(6, p.width || STD.WALL_DEPTH),
      d: Math.max(6, p.depth || STD.WALL_DEPTH),
    };
  }
  // Diagonal and L-corner records share a square plan envelope. The shared
  // classifier above is deliberately the only source of this decision for both
  // PlanCanvas and the deterministic 3D renderer.
  if (cornerKind === "diagonal" || cornerKind === "l-shape" || cornerKind === "corner-drawer") {
    const side = lCornerBoxSide(p.placement);
    return { w: side, d: side };
  }
  if (cornerKind === "blind-corner") {
    const stdDepth = p.placement === "wall" ? 12 : 24;
    const nominalWidth = blindCornerNominalWidth(p);
    const rot = ((p.rotation % 360) + 360) % 360;
    return rot === 90 || rot === 270 ? { w: stdDepth, d: nominalWidth } : { w: nominalWidth, d: stdDepth };
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
  let { w, d } = rotatedSize(p);
  const h = placedHeight(p);
  // Fillers (FILL-3, FILL-6): the plan width/depth may be swapped when placed on
  // a vertical wall (rotation 90/270). The TRUE filler width is encoded in the
  // masterCode suffix. Use the nominal width for display.
  const fillMatch = /^FILL-(\d+(?:\.\d+)?)$/i.exec(p.masterCode);
  if (fillMatch) {
    const nomW = parseFloat(fillMatch[1]);
    if (Number.isFinite(nomW) && nomW > 0) {
      // Depth is the cabinet run depth (24" base, 12" wall); width is the filler strip.
      const runDepth = Math.max(w, d);
      w = nomW;
      d = runDepth;
    }
  }
  const base = `${fmtIn(w)}"W \u00d7 ${fmtIn(h)}"H \u00d7 ${fmtIn(d)}"D`;
  return isCustomSize(p) ? `${base} \u00b7 Custom` : base;
}

export function snapPosition(
  moving: PlacedCabinet,
  room: RoomData,
  others: PlacedCabinet[],
  island?: { x: number; y: number; width: number; depth: number } | null
): { x: number; y: number; snappedWall: boolean; snappedIsland: boolean; snappedCabinet: boolean } {
  // Use the PLAN footprint (not the raw rotated size) so L-corner cabinets
  // (lazy-Susan / corner base) snap by their true SQUARE box. Their stored depth
  // can be the shallow ~24" leg depth, which would leave the box short of the
  // right/bottom walls and break corner-notch rotation in 3 of the 4 corners.
  const { w, d } = placedFootprint(moving);
  let x = moving.x;
  let y = moving.y;
  let snappedWall = false;
  let snappedIsland = false;
  let snappedCabinet = false;

  const T = STD.SNAP_THRESHOLD;

  // ── Island edge snapping ───────────────────────────────────────────────────
  // When a cabinet is dragged within SNAP_THRESHOLD of any island edge, snap it
  // flush to that edge. Left/right edges snap the X axis; top/bottom snap Y.
  if (island) {
    const iRight = island.x + island.width;
    const iBottom = island.y + island.depth;
    // Vertical overlap check (cabinet Y range overlaps island Y range)
    const yOverlapIsland = y < iBottom + T && y + d > island.y - T;
    if (yOverlapIsland) {
      // Snap right edge of cabinet to left edge of island
      if (Math.abs(x + w - island.x) <= T) { x = island.x - w; snappedIsland = true; }
      // Snap left edge of cabinet to right edge of island
      if (Math.abs(x - iRight) <= T) { x = iRight; snappedIsland = true; }
    }
    // Horizontal overlap check (cabinet X range overlaps island X range)
    const xOverlapIsland = x < iRight + T && x + w > island.x - T;
    if (xOverlapIsland) {
      // Snap bottom edge of cabinet to top edge of island
      if (Math.abs(y + d - island.y) <= T) { y = island.y - d; snappedIsland = true; }
      // Snap top edge of cabinet to bottom edge of island
      if (Math.abs(y - iBottom) <= T) { y = iBottom; snappedIsland = true; }
    }
  }

	  // Collect every nearby edge before moving the candidate. Applying edges in
	  // iteration order can snap toward a farther unit merely because it occurs
	  // first in saved-plan order. Per axis, the closest valid edge wins.
	  type SnapCandidate = { value: number; distance: number; source: "wall" | "cabinet" };
	  const nearest = (candidates: SnapCandidate[]): SnapCandidate | null => candidates
	    .filter((candidate) => candidate.distance <= T + COLLISION_EPSILON_IN)
	    .sort((left, right) => left.distance - right.distance || left.value - right.value)[0] ?? null;

	  const xCandidates: SnapCandidate[] = [
	    { value: 0, distance: Math.abs(x), source: "wall" },
	    { value: room.width - w, distance: Math.abs(x + w - room.width), source: "wall" },
	  ];
	  const yCandidates: SnapCandidate[] = [
	    { value: 0, distance: Math.abs(y), source: "wall" },
	    { value: room.depth - d, distance: Math.abs(y + d - room.depth), source: "wall" },
	  ];

	  for (const o of others) {
	    if (o.uid === moving.uid) continue;
	    if (!sharesPlanCollisionZone(moving, o)) continue;
	    const os = placedFootprint(o);
	    const yOverlap = y < o.y + os.d && y + d > o.y;
	    if (yOverlap) {
	      xCandidates.push(
	        { value: o.x - w, distance: Math.abs(x + w - o.x), source: "cabinet" },
	        { value: o.x + os.w, distance: Math.abs(x - (o.x + os.w)), source: "cabinet" },
	      );
	    }
	    const xOverlap = x < o.x + os.w && x + w > o.x;
	    if (xOverlap) {
	      yCandidates.push(
	        { value: o.y - d, distance: Math.abs(y + d - o.y), source: "cabinet" },
	        { value: o.y + os.d, distance: Math.abs(y - (o.y + os.d)), source: "cabinet" },
	      );
	    }
	  }

	  const xSnap = nearest(xCandidates);
	  if (xSnap) {
	    x = xSnap.value;
	    snappedWall ||= xSnap.source === "wall";
	    snappedCabinet ||= xSnap.source === "cabinet";
	  }
	  const ySnap = nearest(yCandidates);
	  if (ySnap) {
	    y = ySnap.value;
	    snappedWall ||= ySnap.source === "wall";
	    snappedCabinet ||= ySnap.source === "cabinet";
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
      if (!sharesPlanCollisionZone(moving, o)) continue;
      const os = placedFootprint(o);
      const overlapX = Math.min(x + w, o.x + os.w) - Math.max(x, o.x);
      const overlapY = Math.min(y + d, o.y + os.d) - Math.max(y, o.y);
      if (overlapX > COLLISION_EPSILON_IN && overlapY > COLLISION_EPSILON_IN) {
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

  return { x, y, snappedWall, snappedIsland, snappedCabinet };
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
  room: RoomData,
  island?: { x: number; y: number; width: number; depth: number } | null
): number | null {
  const { w, d } = rotatedSize(moving);
  const T = STD.SNAP_THRESHOLD;

  // ── Island-wall orientation ────────────────────────────────────────────────
  // When a cabinet is dragged within SNAP_THRESHOLD of any island edge, rotate
  // it so its back faces that island wall (same logic as room-wall orientation).
  if (island) {
    const iRight = island.x + island.width;
    const iBottom = island.y + island.depth;
    const yOverlap = moving.y < iBottom + T && moving.y + d > island.y - T;
    const xOverlap = moving.x < iRight + T && moving.x + w > island.x - T;
    const distIsland: { side: "top" | "bottom" | "left" | "right"; dist: number }[] = [];
    if (yOverlap) {
      distIsland.push({ side: "right", dist: Math.abs(moving.x + w - island.x) }); // cab right → island left
      distIsland.push({ side: "left",  dist: Math.abs(moving.x - iRight) });         // cab left → island right
    }
    if (xOverlap) {
      distIsland.push({ side: "bottom", dist: Math.abs(moving.y + d - island.y) }); // cab bottom → island top
      distIsland.push({ side: "top",    dist: Math.abs(moving.y - iBottom) });       // cab top → island bottom
    }
    let bestIsland: { side: "top" | "bottom" | "left" | "right" } | null = null;
    let bestIslandDist = T;
    for (const e of distIsland) {
      if (e.dist <= bestIslandDist) { bestIslandDist = e.dist; bestIsland = e; }
    }
    if (bestIsland) {
      const horizontal = bestIsland.side === "top" || bestIsland.side === "bottom";
      const targetRot = horizontal ? 0 : 90;
      const cur = ((Math.round(moving.rotation) % 180) + 180) % 180;
      if (cur !== targetRot) return targetRot;
      return null;
    }
  }

  // ── Room-wall orientation ──────────────────────────────────────────────────
  // Note: island cabinets sit out in the middle of the room, so they never fall
  // within the wall snap threshold below and are left untouched automatically.
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

/** User-approved near-seam snap range; accepted placements are normalized to exact zero gap and zero overlap. */
export const CABINET_SEAM_SNAP_IN = 1 / 16;
/** A deliberate magnetic cabinet drop may be corrected to an exact seam within one inch. */
export const CABINET_CONFLICT_LOCK_IN = 1;
/** Floating-point dust only. Any real positive overlap remains invalid. */
export const COLLISION_EPSILON_IN = 1e-9;
/** Required cabinet setback on each adjoining peninsula leg at an inside turn. */
export const PENINSULA_INSIDE_CORNER_CLEARANCE_IN = 11;

export type CabinetCollisionDetail = {
  cabinet: PlacedCabinet;
  overlapX: number;
  overlapY: number;
  /** Smallest penetration axis, which is the amount the cabinet must move to clear the collision. */
  penetration: number;
};

export function cabinetCollisionDetail(moving: PlacedCabinet, others: PlacedCabinet[]): CabinetCollisionDetail | null {
  const { w, d } = placedFootprint(moving);
  for (const o of others) {
    if (o.uid === moving.uid) continue;
    if (!sharesPlanCollisionZone(moving, o)) continue;
    const sameExplicitRun = Boolean(
      moving.wallId && moving.wallId === o.wallId &&
      moving.wallOffset != null && o.wallOffset != null,
    );
    if (sameExplicitRun) {
      const start = Number(moving.wallOffset);
      const end = start + Math.max(0, Number(moving.width) || 0);
      const otherStart = Number(o.wallOffset);
      const otherEnd = otherStart + Math.max(0, Number(o.width) || 0);
      const overlap = Math.min(end, otherEnd) - Math.max(start, otherStart);
      if (overlap > COLLISION_EPSILON_IN) {
        return { cabinet: o, overlapX: overlap, overlapY: Math.min(moving.depth, o.depth), penetration: overlap };
      }
      // Their axis-aligned visual boxes may overlap even when two angled cabinets
      // are correctly butted along their shared 45° run.
      continue;
    }
    const os = placedFootprint(o);
    const overlapX = Math.min(moving.x + w, o.x + os.w) - Math.max(moving.x, o.x);
    const overlapY = Math.min(moving.y + d, o.y + os.d) - Math.max(moving.y, o.y);
    if (overlapX > COLLISION_EPSILON_IN && overlapY > COLLISION_EPSILON_IN) {
      const movingAxis = (((moving.rotation % 180) + 180) % 180) === 90 ? "vertical" : "horizontal";
      const otherAxis = (((o.rotation % 180) + 180) % 180) === 90 ? "vertical" : "horizontal";
      const penetration = moving.placement === o.placement && movingAxis === otherAxis
        ? movingAxis === "horizontal" ? overlapX : overlapY
        : Math.min(overlapX, overlapY);
      return { cabinet: o, overlapX, overlapY, penetration };
    }
  }
  return null;
}

type PlanFootprintPoint = { x: number; y: number };

function planRectanglePolygon(x: number, y: number, width: number, depth: number): PlanFootprintPoint[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

/** Returns a cabinet's actual rotated body instead of its screen-space bounding box. */
function rotatedCabinetBodyPolygon(cabinet: PlacedCabinet): PlanFootprintPoint[] {
  const bounds = placedFootprint(cabinet);
  const center = { x: cabinet.x + bounds.w / 2, y: cabinet.y + bounds.d / 2 };
  const radians = (((cabinet.rotation % 360) + 360) % 360) * Math.PI / 180;
  const tangent = { x: Math.cos(radians), y: Math.sin(radians) };
  const normal = { x: -Math.sin(radians), y: Math.cos(radians) };
  const halfWidth = Math.max(0, Number(cabinet.width) || 0) / 2;
  const halfDepth = Math.max(0, Number(cabinet.depth) || 0) / 2;
  return [
    { x: center.x - tangent.x * halfWidth - normal.x * halfDepth, y: center.y - tangent.y * halfWidth - normal.y * halfDepth },
    { x: center.x + tangent.x * halfWidth - normal.x * halfDepth, y: center.y + tangent.y * halfWidth - normal.y * halfDepth },
    { x: center.x + tangent.x * halfWidth + normal.x * halfDepth, y: center.y + tangent.y * halfWidth + normal.y * halfDepth },
    { x: center.x - tangent.x * halfWidth + normal.x * halfDepth, y: center.y - tangent.y * halfWidth + normal.y * halfDepth },
  ];
}

/** The two solid legs of an L-corner; its interior notch is intentionally empty. */
function lCornerBodyPolygons(cabinet: PlacedCabinet): PlanFootprintPoint[][] {
  const bounds = placedFootprint(cabinet);
  const leg = Math.min(bounds.w, bounds.d) * cornerLegRatioForPlaced(cabinet);
  const right = cabinet.x + bounds.w;
  const bottom = cabinet.y + bounds.d;
  switch ((((cabinet.rotation % 360) + 360) % 360)) {
    case 90:
      return [planRectanglePolygon(cabinet.x, cabinet.y, bounds.w, leg), planRectanglePolygon(right - leg, cabinet.y + leg, leg, bounds.d - leg)];
    case 180:
      return [planRectanglePolygon(cabinet.x, bottom - leg, bounds.w, leg), planRectanglePolygon(right - leg, cabinet.y, leg, bounds.d - leg)];
    case 270:
      return [planRectanglePolygon(cabinet.x, bottom - leg, bounds.w, leg), planRectanglePolygon(cabinet.x, cabinet.y, leg, bounds.d - leg)];
    default:
      return [planRectanglePolygon(cabinet.x, cabinet.y, bounds.w, leg), planRectanglePolygon(cabinet.x, cabinet.y + leg, leg, bounds.d - leg)];
  }
}

function cabinetPlanBodyPolygons(cabinet: PlacedCabinet): PlanFootprintPoint[][] {
  return placedCornerGeometryKind(cabinet) === "l-shape"
    ? lCornerBodyPolygons(cabinet)
    : [rotatedCabinetBodyPolygon(cabinet)];
}

/** Convex separating-axis test where flush edge contact remains valid. */
function convexPlanPolygonsIntersect(left: PlanFootprintPoint[], right: PlanFootprintPoint[]): boolean {
  for (const polygon of [left, right]) {
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const axis = { x: -(end.y - start.y), y: end.x - start.x };
      const project = (points: PlanFootprintPoint[]) => points.reduce(
        (range, point) => {
          const value = point.x * axis.x + point.y * axis.y;
          return { min: Math.min(range.min, value), max: Math.max(range.max, value) };
        },
        { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
      );
      const leftRange = project(left);
      const rightRange = project(right);
      if (leftRange.max <= rightRange.min + COLLISION_EPSILON_IN || rightRange.max <= leftRange.min + COLLISION_EPSILON_IN) return false;
    }
  }
  return true;
}

function cabinetPlanBodiesIntersect(left: PlacedCabinet, right: PlacedCabinet): boolean {
  return cabinetPlanBodyPolygons(left).some((leftPolygon) =>
    cabinetPlanBodyPolygons(right).some((rightPolygon) => convexPlanPolygonsIntersect(leftPolygon, rightPolygon)),
  );
}

function usesPeninsulaCornerJoinBodyCheck(moving: PlacedCabinet, other: PlacedCabinet, room: RoomData): boolean {
  if (moving.placement !== "base" || other.placement !== "base") return false;
  const run = peninsulaRunById(room, moving.wallId);
  return Boolean(
    (run?.turn === 45 || run?.turn === 90) &&
    run.parentWall &&
    cabinetWall(other, room) === run.parentWall &&
    placedCornerGeometryKind(other) === "l-shape",
  );
}

/**
 * A true corner cabinet seated at a shared measured-wall vertex consumes a leg
 * of the adjoining wall even when the two rotated screen bounding boxes do not
 * intersect. This covers an ERB36 at a diagonal 90-degree vertex: a B12 at
 * offset 0 on the adjoining diagonal must not occupy the ERB's cabinet leg.
 */
function customWallCornerReservationCollision(
  corner: PlacedCabinet,
  neighbor: PlacedCabinet,
  blockedBy: PlacedCabinet,
  room: RoomData,
): CabinetCollisionDetail | null {
  const kind = placedCornerGeometryKind(corner);
  if (kind !== "l-shape" && kind !== "diagonal" && kind !== "corner-drawer") return null;
  if (!room.vertices?.length || !room.customWalls?.length) return null;
  if (!corner.wallId || !neighbor.wallId || corner.wallId === neighbor.wallId) return null;
  if (!isCustomRoomWall(room, corner.wallId) || !isCustomRoomWall(room, neighbor.wallId)) return null;

  const cornerWall = room.customWalls.find((wall) => wall.id === corner.wallId);
  const neighborWall = room.customWalls.find((wall) => wall.id === neighbor.wallId);
  if (!cornerWall || !neighborWall) return null;
  const sharedVertex = [cornerWall.startVertexId, cornerWall.endVertexId].find((vertexId) => (
    vertexId === neighborWall.startVertexId || vertexId === neighborWall.endVertexId
  ));
  if (!sharedVertex) return null;

  const cornerLength = wallLength(corner.wallId as WallSide, room);
  const cornerStart = wallRunOffset(corner, corner.wallId, room);
  const cornerEnd = cornerStart + wallRunSpan(corner, corner.wallId, room);
  const seatedAtSharedVertex = sharedVertex === cornerWall.startVertexId
    ? cornerStart <= COLLISION_EPSILON_IN
    : cornerEnd >= cornerLength - COLLISION_EPSILON_IN;
  if (!seatedAtSharedVertex) return null;

  const footprint = placedFootprint(corner);
  // Keep final collision in agreement with freeSegmentsOnWall. The continuous
  // outer edge of a seated L-corner reaches the full 36-inch corner envelope on
  // its adjoining wall; the interior notch is not an exposed cabinet-run edge.
  // A straight base or dishwasher must therefore seat at that outer edge.
  const adjacentLeg = kind === "l-shape"
    ? Math.max(0, footprint.w)
    : Math.min(footprint.w, footprint.d);
  const neighborStartsAtSharedVertex = sharedVertex === neighborWall.startVertexId;
  const neighborLength = wallLength(neighbor.wallId as WallSide, room);
  const reservedStart = neighborStartsAtSharedVertex ? 0 : Math.max(0, neighborLength - adjacentLeg);
  const reservedEnd = neighborStartsAtSharedVertex ? Math.min(neighborLength, adjacentLeg) : neighborLength;
  const neighborStart = wallRunOffset(neighbor, neighbor.wallId, room);
  const neighborEnd = neighborStart + wallRunSpan(neighbor, neighbor.wallId, room);
  const overlap = Math.min(neighborEnd, reservedEnd) - Math.max(neighborStart, reservedStart);
  if (overlap <= COLLISION_EPSILON_IN) return null;
  return {
    cabinet: blockedBy,
    overlapX: overlap,
    overlapY: Math.min(Math.max(0, Number(corner.depth) || 0), Math.max(0, Number(neighbor.depth) || 0)),
    penetration: overlap,
  };
}

/**
 * A diagonal continuous-wall corner is encoded as two separate wall frames.
 * Their axis-aligned render envelopes can overlap even after a straight cabinet
 * has seated exactly at the L-corner's exposed outer edge. The measured run
 * reservation above is authoritative for that pair; this identifies when its
 * zero-overlap result can safely replace the screen-envelope fallback.
 */
function hasSeatedCustomWallCornerPair(
  left: PlacedCabinet,
  right: PlacedCabinet,
  room: RoomData,
): boolean {
  if (!room.vertices?.length || !room.customWalls?.length) return false;
  const pair = [left, right] as const;
  for (const corner of pair) {
    const neighbor = corner.uid === left.uid ? right : left;
    const kind = placedCornerGeometryKind(corner);
    if (kind !== "l-shape" && kind !== "diagonal" && kind !== "corner-drawer") continue;
    if (!corner.wallId || !neighbor.wallId || corner.wallId === neighbor.wallId) continue;
    if (!isCustomRoomWall(room, corner.wallId) || !isCustomRoomWall(room, neighbor.wallId)) continue;
    const cornerWall = room.customWalls.find((wall) => wall.id === corner.wallId);
    const neighborWall = room.customWalls.find((wall) => wall.id === neighbor.wallId);
    if (!cornerWall || !neighborWall) continue;
    const sharedVertex = [cornerWall.startVertexId, cornerWall.endVertexId].find((vertexId) => (
      vertexId === neighborWall.startVertexId || vertexId === neighborWall.endVertexId
    ));
    if (!sharedVertex) continue;
    const cornerStart = wallRunOffset(corner, corner.wallId, room);
    const cornerEnd = cornerStart + wallRunSpan(corner, corner.wallId, room);
    const cornerLength = wallLength(corner.wallId as WallSide, room);
    const seated = sharedVertex === cornerWall.startVertexId
      ? cornerStart <= COLLISION_EPSILON_IN
      : cornerEnd >= cornerLength - COLLISION_EPSILON_IN;
    if (seated) return true;
  }
  return false;
}

/**
 * Placement-time collision calculation uses physical plan bodies when a
 * peninsula joins an L-corner on its parent wall. This prevents either a 45°
 * diagonal envelope or a square 90° envelope from creating a false setback;
 * all other cabinet pairs retain generic collision behavior.
 */
export function cabinetPlacementCollisionDetail(
  moving: PlacedCabinet,
  others: PlacedCabinet[],
  room?: RoomData,
): CabinetCollisionDetail | null {
  if (!room) return cabinetCollisionDetail(moving, others);
  for (const other of others) {
    // Test both directions so a shared-corner reservation is enforced whether
    // the straight cabinet or the ERB/L/diagonal cabinet is moving.
    const movingCornerReservation = customWallCornerReservationCollision(moving, other, other, room);
    if (movingCornerReservation) return movingCornerReservation;
    const otherCornerReservation = customWallCornerReservationCollision(other, moving, other, room);
    if (otherCornerReservation) return otherCornerReservation;
    const detail = cabinetCollisionDetail(moving, [other]);
    if (!detail) continue;
    // For a real diagonal continuous-wall vertex the two cabinets live in
    // different local wall frames. If the exact corner-run reservation says
    // their spans only touch, do not let the overlapping rectangular render
    // envelopes reject a valid DB24/dishwasher seam.
    if (hasSeatedCustomWallCornerPair(moving, other, room)) continue;
    if (usesPeninsulaCornerJoinBodyCheck(moving, other, room) && !cabinetPlanBodiesIntersect(moving, other)) continue;
    return detail;
  }
  return null;
}

/**
 * Finds the earliest usable start of a primary peninsula when an adjoining
 * parent-wall corner unit occupies the physical join. The measurement uses the
 * exact same placement collision rule as the final catalog add, so the first
 * cabinet is seated immediately after true clearance rather than created at
 * offset zero and then rejected. It deliberately applies only to base/tall/
 * appliance floor items on a 45° or 90° primary peninsula; later cabinets are
 * already handled by the normal explicit-run free-span calculation.
 */
export function peninsulaAutomaticStartOffset(
  side: WallSide,
  room: RoomData,
  placed: PlacedCabinet[],
  width: number,
  depth: number,
  placement: Placement,
  requestedPeninsulaSide?: PeninsulaCabinetSide | null,
): number {
  const run = peninsulaRunById(room, side);
  if (!run?.parentWall || run.parentRunId || !["base", "tall", "appliance"].includes(placement) || width <= 0 || depth <= 0) return 0;
  const joinCorners = placed.filter((cabinet) => {
    const kind = placedCornerGeometryKind(cabinet);
    return (
      cabinetWall(cabinet, room) === run.parentWall &&
      (kind === "l-shape" || kind === "diagonal" || kind === "corner-drawer" || kind === "blind-corner")
    );
  });
  if (!joinCorners.length) return 0;

  const maximumOffset = Math.max(0, Number(run.length) - width);
  const steps = Math.round(maximumOffset * 8);
  for (let step = 0; step <= steps; step++) {
    const offset = step / 8;
    const spot = wallPlacementAt(offset, width, depth, side, room, requestedPeninsulaSide);
    const candidate: PlacedCabinet = {
      uid: "peninsula-start-clearance-probe",
      cabinetId: -1,
      masterCode: "PENINSULA-START-PROBE",
      description: "Peninsula start clearance probe",
      placement,
      x: spot.x,
      y: spot.y,
      width,
      depth,
      rotation: spot.rotation,
      wallId: spot.wallId,
      wallOffset: spot.wallOffset,
      peninsulaSide: spot.peninsulaSide,
    };
    if (!cabinetPlacementCollisionDetail(candidate, joinCorners, room)) return offset;
  }
  return 0;
}

/**
 * Returns the first physical location where a standard catalog cabinet can sit
 * on the selected peninsula. Unlike the older corner-only offset, this checks
 * every existing cabinet body with the same placement-time collision rule used
 * by the final add operation. A catalog click therefore needs no manual
 * nudging around a parent-wall base, corner, or a prior peninsula cabinet.
 */
export function firstCollisionFreePeninsulaPlacement(
  side: WallSide,
  room: RoomData,
  placed: PlacedCabinet[],
  width: number,
  depth: number,
  placement: Placement,
  bounds?: { start: number; end: number },
): { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number; peninsulaSide?: PeninsulaCabinetSide } | null {
  const run = peninsulaRunById(room, side);
  if (!run || width <= 0 || depth <= 0) return null;
  const floorSupported = ["base", "tall", "appliance"].includes(placement);
  const has45StartInsideCorner = peninsulaRunHas45StartInsideCornerClearance(run);
  const has45EndInsideCorner = peninsulaRunHas45EndInsideCornerClearance(run, room);
  const farInsideCornerClearance = floorSupported && has45EndInsideCorner ? PENINSULA_INSIDE_CORNER_CLEARANCE_IN : 0;
  const availableRunLength = Math.max(0, Number(run.length) - farInsideCornerClearance);
  if (availableRunLength + COLLISION_EPSILON_IN < width) return null;
  const maximumOffset = Math.max(0, availableRunLength - width);
  const requestedMinimum = Number(bounds?.start);
  const requestedMaximum = Number(bounds?.end);
  // Only an acute 45-degree return needs the installer clearance. A 90-degree
  // corner uses its exact product footprint and stays available for a corner
  // cabinet or a flush straight-cabinet run.
  const insideCornerClearance = floorSupported && has45StartInsideCorner
    ? PENINSULA_INSIDE_CORNER_CLEARANCE_IN
    : 0;
  const minimumOffset = Math.max(
    insideCornerClearance,
    Number.isFinite(requestedMinimum) ? Math.max(0, requestedMinimum) : 0,
  );
  const boundedMaximum = Number.isFinite(requestedMaximum)
    ? Math.max(0, Math.min(maximumOffset, requestedMaximum))
    : maximumOffset;
  if (boundedMaximum + COLLISION_EPSILON_IN < minimumOffset) return null;
  const earliest = Math.max(
    minimumOffset,
    peninsulaAutomaticStartOffset(side, room, placed, width, depth, placement),
  );
  const firstStep = Math.max(0, Math.ceil(earliest * 8 - 0.001));
  const lastStep = Math.floor(boundedMaximum * 8 + 0.001);
  for (let step = firstStep; step <= lastStep; step++) {
    const spot = wallPlacementAt(step / 8, width, depth, side, room);
    const candidate: PlacedCabinet = {
      uid: "peninsula-first-clear-probe",
      cabinetId: -1,
      masterCode: "PENINSULA-FIRST-CLEAR-PROBE",
      description: "Peninsula first clear placement probe",
      placement,
      x: spot.x,
      y: spot.y,
      width,
      depth,
      rotation: spot.rotation,
      wallId: spot.wallId,
      wallOffset: spot.wallOffset,
      peninsulaSide: spot.peninsulaSide,
    };
    if (!cabinetPlacementCollisionDetail(candidate, placed, room)) return spot;
  }
  return null;
}

export function hasCollision(moving: PlacedCabinet, others: PlacedCabinet[]): boolean {
  return cabinetCollisionDetail(moving, others) != null;
}

/**
 * Finds the nearest 1/8-inch mounting height that clears every existing item.
 * The caller supplies a unique preview item, so its source shelf remains a real
 * peer and prevents a duplicate from snapping into the original shelf.
 */
export function nearestCollisionFreeMountBottom(moving: PlacedCabinet, others: PlacedCabinet[], desiredBottom: number, maximumBottom: number): number | null {
  const maxStep = Math.max(0, Math.round(maximumBottom * 8));
  const desiredStep = Math.max(0, Math.min(maxStep, Math.round(desiredBottom * 8)));
  const atStep = (step: number): PlacedCabinet => ({ ...moving, mountBottom: step / 8, mountBottomAdjusted: true });
  if (!hasCollision(atStep(desiredStep), others)) return desiredStep / 8;

  for (let distance = 1; distance <= maxStep; distance++) {
    const lower = desiredStep - distance;
    const upper = desiredStep + distance;
    if (lower >= 0 && !hasCollision(atStep(lower), others)) return lower / 8;
    if (upper <= maxStep && !hasCollision(atStep(upper), others)) return upper / 8;
  }
  return null;
}

/**
 * Resolve a near seam (gap or penetration within the supplied tolerance) to exact edge
 * contact for every same-category base/base and wall/wall pair. This never
 * approves an overlap: it returns coordinates whose saved gap and penetration
 * are both zero. Larger overlaps remain untouched for normal rejection.
 */
export function snapCabinetSeamOverlap(
  moving: PlacedCabinet,
  others: PlacedCabinet[],
  toleranceIn = CABINET_SEAM_SNAP_IN,
): PlacedCabinet {
  let next = moving;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const other of others) {
      if (other.uid === next.uid || other.placement !== next.placement) continue;
      if (next.placement !== "base" && next.placement !== "wall") continue;
      const size = placedFootprint(next);
      const otherSize = placedFootprint(other);
      const overlapX = Math.min(next.x + size.w, other.x + otherSize.w) - Math.max(next.x, other.x);
      const overlapY = Math.min(next.y + size.d, other.y + otherSize.d) - Math.max(next.y, other.y);
      const axis = (((next.rotation % 180) + 180) % 180) === 90 ? "vertical" : "horizontal";
      const otherAxis = (((other.rotation % 180) + 180) % 180) === 90 ? "vertical" : "horizontal";
      if (axis !== otherAxis) continue;
      const crossOverlap = axis === "horizontal" ? overlapY : overlapX;
      if (crossOverlap <= COLLISION_EPSILON_IN) continue;
      if (axis === "horizontal") {
        const nextCenter = next.x + size.w / 2;
        const otherCenter = other.x + otherSize.w / 2;
        const seamDelta = nextCenter <= otherCenter
          ? other.x - (next.x + size.w)
          : other.x + otherSize.w - next.x;
        if (Math.abs(seamDelta) > toleranceIn + COLLISION_EPSILON_IN || Math.abs(seamDelta) <= COLLISION_EPSILON_IN) continue;
        next = { ...next, x: next.x + seamDelta };
      } else {
        const nextCenter = next.y + size.d / 2;
        const otherCenter = other.y + otherSize.d / 2;
        const seamDelta = nextCenter <= otherCenter
          ? other.y - (next.y + size.d)
          : other.y + otherSize.d - next.y;
        if (Math.abs(seamDelta) > toleranceIn + COLLISION_EPSILON_IN || Math.abs(seamDelta) <= COLLISION_EPSILON_IN) continue;
        next = { ...next, y: next.y + seamDelta };
      }
      changed = true;
    }
    if (!changed) break;
  }
  return next;
}

/** Returns an actionable explanation when a placement is rejected for a true collision. */
export function collisionReason(moving: PlacedCabinet, others: PlacedCabinet[], room?: RoomData): string | null {
  const detail = cabinetPlacementCollisionDetail(moving, others, room);
  if (!detail) return null;
  const conflicting = detail.cabinet;
  const category = conflicting.placement === "wall" ? "wall cabinet" : conflicting.placement === "base" ? "base cabinet" : "item";
  const overlap = formatEighthInches(detail.penetration);
  const normalizedCode = conflicting.masterCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const seatedFlushCorner = room ? cabinetCornerPlacementInfo(conflicting, room)?.placement === "flush" : false;
  const seatedBlindCorner = room ? blindCornerSnapInfo(conflicting, room)?.placement === "flush" : false;
  if (normalizedCode === "ERB36" && seatedFlushCorner) {
    return `Corner protected: ${conflicting.masterCode} is snapped into this corner. ${moving.masterCode} would overlap its reserved adjoining leg by ${overlap}. Move it to the next clear wall span; edge-to-edge contact is allowed, but physical overlap must be 0".`;
  }
  if (isBlindCorner(conflicting.masterCode, conflicting.description) && seatedBlindCorner) {
    return `Corner protected: ${conflicting.masterCode} is snapped into this blind corner. ${moving.masterCode} would overlap its cabinet body or required filler by ${overlap}. Move it to the next clear wall span; edge-to-edge contact is allowed, but physical overlap must be 0".`;
  }
  return `Cannot place ${moving.masterCode} here: it overlaps ${conflicting.masterCode}, another ${category}, by ${overlap}. Edge-to-edge contact is allowed; physical overlap must be 0".`;
}

/** Custom placement cannot bypass same-category base/base or wall/wall physical overlap. */
export function shouldBlockPlacementCollision(
  moving: PlacedCabinet,
  others: PlacedCabinet[],
  customPlacement = false,
  room?: RoomData,
): boolean {
  const detail = cabinetPlacementCollisionDetail(moving, others, room);
  if (!detail) return false;
  if (detail.cabinet.placement === moving.placement && (moving.placement === "base" || moving.placement === "wall")) return true;
  return !customPlacement;
}

/**
 * Items reserve the same plan run only when their placement category matches or
 * their physical elevation envelopes intersect. This allows a wall cabinet to
 * occupy the plan space above a base cabinet while retaining wall-to-wall and
 * base-to-base collision prevention.
 */
export function sharesPlanCollisionZone(a: PlacedCabinet, b: PlacedCabinet): boolean {
  // Refrigerator end panels are thin finish skins at the appliance opening.
  // They intentionally share the seam projection with the refrigerator and its
  // neighboring cabinet, so they must never cause either side to be discarded
  // by batch placement or legacy-layout cleanup.
  if (isRefrigeratorEndPanel(a) || isRefrigeratorEndPanel(b)) return false;
  if (isHoodOverRangePair(a, b)) return false;
  // An over-range microwave snaps to the center of a range but lives in the
  // upper elevation band (normally 54–71 inches). It can therefore share the
  // plan projection with the floor range without either item physically
  // occupying the other. Keep ordinary appliance overlaps blocked below.
  if (isMicrowaveOverRangePair(a, b)) return false;
  // Wall cabinets can share a plan projection when their elevation bands do
  // not intersect (for example, a short bridge mounted above a window).
  // Same-height wall cabinets remain true collisions.
  if (a.placement === b.placement) {
    return a.placement === "wall" ? verticalEnvelopesOverlap(a, b) : true;
  }
  if (!verticalEnvelopesOverlap(a, b)) return false;
  if (
    (isSinkAppliance(a) && isSinkBaseCabinet(b)) ||
    (isSinkAppliance(b) && isSinkBaseCabinet(a))
  ) return false;
  return !isBridgeOverRange(a, b);
}

/** A wall-mounted range hood intentionally occupies the same plan projection as the range below it. */
export function isHoodOverRangePair(a: PlacedCabinet, b: PlacedCabinet): boolean {
  const isHood = (item: PlacedCabinet) => /^HOOD-/.test((item.masterCode || "").toUpperCase());
  const isRange = (item: PlacedCabinet) => isRangeOrOven(item.masterCode, item.description);
  return (isHood(a) && isRange(b)) || (isHood(b) && isRange(a));
}

/**
 * An MW-* appliance is a valid over-range companion only when its elevation
 * envelope clears a compatible range. The placement flow centers it on the
 * range; this helper deliberately does not turn any same-height appliance
 * overlap into a valid layout.
 */
export function isMicrowaveOverRangePair(a: PlacedCabinet, b: PlacedCabinet): boolean {
  const isMicrowave = (item: PlacedCabinet) =>
    item.placement === "appliance" && /^MW-/.test((item.masterCode || "").toUpperCase());
  const isRange = (item: PlacedCabinet) =>
    item.placement === "appliance" && !isMicrowave(item) && isRangeOrOven(item.masterCode, item.description);
  const microwave = isMicrowave(a) ? a : isMicrowave(b) ? b : null;
  const range = isRange(a) ? a : isRange(b) ? b : null;
  if (!microwave || !range || verticalEnvelopesOverlap(microwave, range)) return false;

  // A real OTR installation centers the microwave on the range across the
  // cabinet run. The perpendicular plan coordinate differs because the range
  // is 25 inches deep and the microwave is 15 inches deep, so only compare the
  // run axis. Matching rotation keeps the two appliance backs on the same wall.
  const rangeRotation = ((Math.round(range.rotation ?? 0) % 360) + 360) % 360;
  const microwaveRotation = ((Math.round(microwave.rotation ?? 0) % 360) + 360) % 360;
  if (rangeRotation !== microwaveRotation) return false;
  const rangeSize = placedFootprint(range);
  const microwaveSize = placedFootprint(microwave);
  const runAxisIsX = rangeRotation === 0 || rangeRotation === 180;
  const rangeCenter = runAxisIsX ? range.x + rangeSize.w / 2 : range.y + rangeSize.d / 2;
  const microwaveCenter = runAxisIsX ? microwave.x + microwaveSize.w / 2 : microwave.y + microwaveSize.d / 2;
  return Math.abs(rangeCenter - microwaveCenter) <= 0.5;
}

export type CollisionResolution = {
  placed: PlacedCabinet[];
  rejected: PlacedCabinet[];
};

/**
 * Repairs stale saved wall-cabinet envelopes from the dimensional SKU. A user
 * custom size is preserved when the installed value differs from its recorded
 * nominal catalog value; otherwise the SKU remains authoritative.
 */
export function normalizePlacedWallCabinetSkuDimensions(cabinet: PlacedCabinet): PlacedCabinet {
  if (cabinet.placement !== "wall") return cabinet;
  const sku = wallCabinetSkuDimensions(cabinet.masterCode);
  if (!sku) return cabinet;
  const intentionallyCustom = (value: number, nominal: number | null | undefined) =>
    Number.isFinite(nominal) && Math.abs(value - Number(nominal)) > COLLISION_EPSILON_IN;
  const customWidth = intentionallyCustom(cabinet.width, cabinet.nominalWidth);
  const customHeight = intentionallyCustom(cabinet.height ?? sku.height, cabinet.nominalHeight);
  const customDepth = intentionallyCustom(cabinet.depth, cabinet.nominalDepth);
  const width = customWidth ? cabinet.width : sku.width;
  const height = customHeight ? cabinet.height : sku.height;
  const depth = customDepth ? cabinet.depth : sku.depth;
  const nominalWidth = customWidth ? cabinet.nominalWidth : sku.width;
  const nominalHeight = customHeight ? cabinet.nominalHeight : sku.height;
  const nominalDepth = customDepth ? cabinet.nominalDepth : sku.depth;
  if (
    cabinet.width === width && cabinet.height === height && cabinet.depth === depth &&
    cabinet.nominalWidth === nominalWidth && cabinet.nominalHeight === nominalHeight && cabinet.nominalDepth === nominalDepth
  ) return cabinet;
  return { ...cabinet, width, height, depth, nominalWidth, nominalHeight, nominalDepth };
}

/** Adds a batch only when every new placement clears all accepted footprints. */
export function appendCollisionFreePlacements(
  existing: PlacedCabinet[],
  additions: PlacedCabinet[],
  room?: RoomData,
): CollisionResolution {
  const placed = [...existing];
  const rejected: PlacedCabinet[] = [];
  for (const candidate of additions) {
    // A custom-wall placement carries its exact measured wall offset. The generic
    // rectangular seam snap is only a screen-space convenience and can shift an
    // otherwise valid 45° ERB/DB24 seam before cleanup examines it. Preserve that
    // authoritative geometry and use the room-aware collision rule below.
    const preserveMeasuredWallGeometry = Boolean(room && candidate.wallId && isCustomRoomWall(room, candidate.wallId));
    const snappedCandidate = preserveMeasuredWallGeometry ? candidate : snapCabinetSeamOverlap(candidate, placed);
    const collision = room
      ? cabinetPlacementCollisionDetail(snappedCandidate, placed, room)
      : hasCollision(snappedCandidate, placed);
    if (collision) {
      rejected.push(candidate);
      continue;
    }
    placed.push(snappedCandidate);
  }
  return { placed, rejected };
}

/**
 * Upgrades required fillers that older builds attached to WBC cabinets through
 * the BBC perpendicular-run path. The real catalog line and pricing identity
 * remain untouched, but its saved geometry becomes a zero-volume face attachment
 * owned by the WBC; the WBC renderer draws the three-inch strip left of the door.
 */
export function normalizeWallBlindCornerRequiredFillers(placements: PlacedCabinet[]): PlacedCabinet[] {
  const byUid = new Map(placements.map((item) => [item.uid, item]));
  let changed = false;
  const next = placements.map((item) => {
    const groupId = item.fillerPieceGroupId ?? "";
    const ownerUid = item.fillerForCabinetUid
      ?? groupId.match(/^(?:bbc|wbc)-required-filler-(.+)$/)?.[1]
      ?? null;
    if (!ownerUid) return item;
    const owner = byUid.get(ownerUid);
    const ownerCode = String(owner?.masterCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const ownerDescription = String(owner?.description ?? "").toLowerCase();
    const ownerIsWbc = /^WBC\d/.test(ownerCode) || /(?:wall.*blind corner|blind corner.*wall)/.test(ownerDescription);
    if (!owner || !ownerIsWbc) return item;
    const nextGroupId = `wbc-required-filler-${owner.uid}`;
    const alreadyNormalized = item.integratedWallBlindFiller === true
      && groupId === nextGroupId
      && item.fillerForCabinetUid === owner.uid
      && item.placement === "wall"
      && item.x === owner.x
      && item.y === owner.y
      && item.rotation === owner.rotation
      && item.depth === 0
      && item.fillerPlacementMode === "left";
    if (alreadyNormalized) return item;
    changed = true;
    return {
      ...item,
      description: `${item.description.replace(/\s+—\s+(?:required BBC clearance|integrated left of WBC door)$/i, "")} — integrated left of WBC door`,
      placement: "wall" as const,
      x: owner.x,
      y: owner.y,
      rotation: owner.rotation,
      depth: 0,
      height: owner.height ?? item.height ?? STD.WALL_HEIGHT,
      mountBottom: owner.mountBottom ?? item.mountBottom ?? null,
      fillerPieceGroupId: nextGroupId,
      fillerPlacementMode: "left" as const,
      fillerForCabinetUid: owner.uid,
      integratedWallBlindFiller: true,
    };
  });
  return changed ? next : placements;
}

/**
 * Repairs legacy/imported layouts before they render while preserving saved
 * order. Earlier accepted cabinets remain authoritative; a later overlapping
 * refrigerator or other item is rejected instead of replacing its neighbor.
 */
export function removeOverlappingPlacements(placements: PlacedCabinet[], room?: RoomData): CollisionResolution {
  const normalizedPlacements = normalizeWallBlindCornerRequiredFillers(placements).map(normalizePlacedWallCabinetSkuDimensions);
  const resolution: CollisionResolution = { placed: [], rejected: [] };
  for (const candidate of normalizedPlacements) {
    if (isRefrigeratorEndPanel(candidate) && refrigeratorEndPanelConflictDetail(candidate, resolution.placed)) {
      resolution.rejected.push(candidate);
      continue;
    }
    const appended = appendCollisionFreePlacements(resolution.placed, [candidate], room);
    resolution.placed = appended.placed;
    resolution.rejected.push(...appended.rejected);
  }
  const accepted = new Map(resolution.placed.map((placement) => [placement.uid, placement]));
  return {
    placed: placements.flatMap((placement) => {
      const normalized = accepted.get(placement.uid);
      return normalized ? [normalized] : [];
    }),
    rejected: placements.filter((placement) => !accepted.has(placement.uid)),
  };
}

/**
 * Refrigerator end panels are architectural finish pieces and intentionally do
 * not participate in normal cabinet collision cleanup. They still may not cover
 * an existing cabinet. Return the first physical footprint conflict so the UI
 * can skip that panel while preserving the already placed neighbor.
 */
export interface RefrigeratorEndPanelConflictDetail {
  panel: PlacedCabinet;
  cabinet: PlacedCabinet;
  overlapIn: number;
}

export function refrigeratorEndPanelConflictDetail(
  panel: PlacedCabinet,
  existing: PlacedCabinet[],
  refrigeratorUid?: string | null,
): RefrigeratorEndPanelConflictDetail | null {
  if (!isRefrigeratorEndPanel(panel)) return null;
  const panelSize = placedFootprint(panel);
  for (const item of existing) {
    if (item.uid === refrigeratorUid || item.uid === panel.uid || isRefrigeratorEndPanel(item)) continue;
    const itemSize = placedFootprint(item);
    const overlapX = Math.min(panel.x + panelSize.w, item.x + itemSize.w) - Math.max(panel.x, item.x);
    const overlapY = Math.min(panel.y + panelSize.d, item.y + itemSize.d) - Math.max(panel.y, item.y);
    if (overlapX > COLLISION_EPSILON_IN && overlapY > COLLISION_EPSILON_IN) {
      return { panel, cabinet: item, overlapIn: Math.min(overlapX, overlapY) };
    }
  }
  return null;
}

export function refrigeratorEndPanelConflict(
  panel: PlacedCabinet,
  existing: PlacedCabinet[],
  refrigeratorUid?: string | null,
): PlacedCabinet | null {
  return refrigeratorEndPanelConflictDetail(panel, existing, refrigeratorUid)?.cabinet ?? null;
}

export interface RefrigeratorEnclosurePlacementResult extends CollisionResolution {
  panelConflicts: RefrigeratorEndPanelConflictDetail[];
}

export interface RefrigeratorEnclosureFitResult {
  existing: PlacedCabinet[];
  additions: PlacedCabinet[];
  shiftIn: number;
}

/**
 * When a requested refrigerator end panel would overlap an earlier cabinet,
 * move the newly configured refrigerator enclosure as one assembly into the
 * available wall space. Existing cabinets remain immutable. If neither wall-run
 * direction can retain both panels without a real collision or leaving the room,
 * return the original coordinates so the normal measured rejection still applies.
 */
export function fitRefrigeratorEnclosurePlacements(
  existing: PlacedCabinet[],
  additions: PlacedCabinet[],
  refrigeratorUid: string,
  room: RoomData,
): RefrigeratorEnclosureFitResult {
  const refrigerator = existing.find((item) => item.uid === refrigeratorUid);
  if (!refrigerator) return { existing, additions, shiftIn: 0 };
  const panels = additions.filter(isRefrigeratorEndPanel);
  const conflicts = panels.flatMap((panel) => {
    const detail = refrigeratorEndPanelConflictDetail(panel, existing, refrigeratorUid);
    return detail ? [detail] : [];
  });

  const side = cabinetWall(refrigerator, room);
  const fridgeAlong = wallRunOffset(refrigerator, side, room);
  const wallRunLength = wallLength(side, room);
  const enclosureItems = [refrigerator, ...additions];
  // Newly authored start-side panels may deliberately carry a negative explicit
  // offset. Preserve that one temporary value here so the boundary fitter moves
  // the *whole* enclosure inward. `wallRunOffset` correctly clamps saved items
  // to zero, but using it at this point hid the off-run panel and left it either
  // clipped or visually absent on diagonal continuous walls.
  const alongStart = (item: PlacedCabinet) => (
    (isCustomRoomWall(room, side) || peninsulaRunById(room, side)) && item.wallId === side && Number.isFinite(Number(item.wallOffset))
      ? Number(item.wallOffset)
      : wallRunOffset(item, side, room)
  );
  const alongLength = (item: PlacedCabinet) => wallRunSpan(item, side, room);
  const enclosureStart = Math.min(...enclosureItems.map(alongStart));
  const enclosureEnd = Math.max(...enclosureItems.map((item) => alongStart(item) + alongLength(item)));
  const positiveBoundaryShift = Math.max(0, -enclosureStart);
  const negativeBoundaryShift = Math.min(0, wallRunLength - enclosureEnd);
  const positiveShift = Math.max(0, ...conflicts
    .filter(({ panel }) => alongStart(panel) < fridgeAlong)
    .map(({ overlapIn }) => overlapIn));
  const negativeShift = -Math.max(0, ...conflicts
    .filter(({ panel }) => alongStart(panel) >= fridgeAlong)
    .map(({ overlapIn }) => overlapIn));
  const candidateShifts = [positiveBoundaryShift, negativeBoundaryShift, positiveShift, negativeShift]
    .filter((shift, index, all) => Math.abs(shift) > COLLISION_EPSILON_IN && all.indexOf(shift) === index);
  if (candidateShifts.length === 0) return { existing, additions, shiftIn: 0 };
  const peers = existing.filter((item) => item.uid !== refrigeratorUid && !isRefrigeratorEndPanel(item));

  const shifted = (item: PlacedCabinet, shiftIn: number): PlacedCabinet => {
    const spot = wallPlacementAt(
      alongStart(item) + shiftIn,
      Math.max(0, Number(item.width) || 0),
      Math.max(0, Number(item.depth) || 0),
      side,
      room,
      item.peninsulaSide,
    );
    return { ...item, ...spot, wallId: spot.wallId ?? item.wallId, wallOffset: spot.wallOffset ?? item.wallOffset };
  };
  const withinRoom = (item: PlacedCabinet): boolean => {
    const offset = wallRunOffset(item, side, room);
    const span = wallRunSpan(item, side, room);
    if (offset < -COLLISION_EPSILON_IN || offset + span > wallRunLength + COLLISION_EPSILON_IN) return false;
    if (isCustomRoomWall(room, side) || peninsulaRunById(room, side)) return true;
    const size = placedFootprint(item);
    return item.x >= -COLLISION_EPSILON_IN
      && item.y >= -COLLISION_EPSILON_IN
      && item.x + size.w <= room.width + COLLISION_EPSILON_IN
      && item.y + size.d <= room.depth + COLLISION_EPSILON_IN;
  };

  for (const shiftIn of candidateShifts) {
    const shiftedFridge = shifted(refrigerator, shiftIn);
    const shiftedAdditions = additions.map((addition) => shifted(addition, shiftIn));
    if (!withinRoom(shiftedFridge) || shiftedAdditions.some((addition) => !withinRoom(addition))) continue;
    if (hasCollision(shiftedFridge, peers)) continue;
    if (shiftedAdditions.filter(isRefrigeratorEndPanel).some((panel) => refrigeratorEndPanelConflictDetail(panel, peers, refrigeratorUid))) continue;
    return {
      existing: existing.map((item) => item.uid === refrigeratorUid ? shiftedFridge : item),
      additions: shiftedAdditions,
      shiftIn,
    };
  }

  return { existing, additions, shiftIn: 0 };
}

/**
 * Adds refrigerator uppers/panels against the latest authoritative plan. Earlier
 * cabinets are immutable: a newly conflicting end panel is rejected, and the
 * normal collision resolver handles any other invalid enclosure component.
 */
export function appendRefrigeratorEnclosurePlacements(
  existing: PlacedCabinet[],
  additions: PlacedCabinet[],
  refrigeratorUid?: string | null,
): RefrigeratorEnclosurePlacementResult {
  const panelConflicts = additions.flatMap((panel) => {
    const detail = refrigeratorEndPanelConflictDetail(panel, existing, refrigeratorUid);
    return detail ? [detail] : [];
  });
  const blockedPanelUids = new Set(panelConflicts.map(({ panel }) => panel.uid));
  const allowedAdditions = additions.filter((addition) => !blockedPanelUids.has(addition.uid));
  const appended = appendCollisionFreePlacements(existing, allowedAdditions);
  const blockedPanels = additions.filter((addition) => blockedPanelUids.has(addition.uid));
  return {
    placed: appended.placed,
    rejected: [...blockedPanels, ...appended.rejected],
    panelConflicts,
  };
}

function verticalEnvelopesOverlap(a: PlacedCabinet, b: PlacedCabinet): boolean {
  const aBox = elevationBox(a);
  const bBox = elevationBox(b);
  const tolerance = 0.01;
  return (
    aBox.bottom < bBox.bottom + bBox.height - tolerance &&
    aBox.bottom + aBox.height > bBox.bottom + tolerance
  );
}

/**
 * Finds the mount height for a short bridge spanning a window, when that bridge
 * can clear the opening by the required clearance and remain below the ceiling.
 */
export function bridgeMountBottomAboveWindow(
  cabinet: PlacedCabinet,
  openings: WallOpening[],
  room: RoomData,
  clearance = WALL_OPENING_CLEARANCE_IN,
): number | null {
  if (cabinet.placement !== "wall" || placedHeight(cabinet) >= 30) return null;
  const side = cabinetWall(cabinet, room);
  const horizontal = side === "top" || side === "bottom";
  const size = rotatedSize(cabinet);
  const start = horizontal ? cabinet.x : cabinet.y;
  const end = start + (horizontal ? size.w : size.d);
  const windows = openings.filter((opening) => {
    if (opening.kind !== "window" || opening.side !== side) return false;
    return start < opening.offset + opening.width - 0.01 && end > opening.offset + 0.01;
  });
  if (windows.length === 0) return null;
  const bottom = Math.max(...windows.map((opening) => opening.sill + opening.height + clearance));
  const ceiling = room.ceilingHeight ?? 96;
  return bottom + placedHeight(cabinet) <= ceiling + 0.01 ? bottom : null;
}

/**
 * Returns the run-axis start that centers a short wall cabinet over a sink
 * base. A matching window is not required: an over-sink cabinet must remain
 * centered above the sink whether the wall has a window or not.
 */
export function overSinkWindowStart(
  cabinet: PlacedCabinet,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  room: RoomData,
): number | null {
  if (cabinet.placement !== "wall" || placedHeight(cabinet) >= 30) return null;
  const side = cabinetWall(cabinet, room);
  const horizontal = side === "top" || side === "bottom";
  const cabinetSize = rotatedSize(cabinet);
  const cabinetSpan = horizontal ? cabinetSize.w : cabinetSize.d;
  const wallLength = horizontal ? room.width : room.depth;
  const shortCabinetCenter = (horizontal ? cabinet.x + cabinetSize.w / 2 : cabinet.y + cabinetSize.d / 2);
  const matchingSinks = placed.filter((item) => isSinkBaseCabinet(item) && cabinetWall(item, room) === side);
  if (matchingSinks.length === 0) return null;
  const sinkBase = matchingSinks.reduce((nearest, item) => {
    const itemSize = rotatedSize(item);
    const itemCenter = horizontal ? item.x + itemSize.w / 2 : item.y + itemSize.d / 2;
    const nearestSize = rotatedSize(nearest);
    const nearestCenter = horizontal ? nearest.x + nearestSize.w / 2 : nearest.y + nearestSize.d / 2;
    return Math.abs(itemCenter - shortCabinetCenter) < Math.abs(nearestCenter - shortCabinetCenter) ? item : nearest;
  });
  const sinkSize = rotatedSize(sinkBase);
  const sinkCenter = horizontal ? sinkBase.x + sinkSize.w / 2 : sinkBase.y + sinkSize.d / 2;
  const centeredStart = sinkCenter - cabinetSpan / 2;
  return Math.max(0, Math.min(centeredStart, Math.max(0, wallLength - cabinetSpan)));
}

/**
 * An explicitly selected sink base is a deliberate target. A short wall
 * cabinet chosen next is centered over that sink on the sink's own wall instead
 * of entering the generic selected-wall sequence. When no eligible sink is
 * selected, callers fall back to the normal left-to-right placement rule.
 */
export function selectedSinkBaseWallPlacement(
  selected: PlacedCabinet | null | undefined,
  room: RoomData,
  width: number,
  depth: number,
  height: number,
  placed: PlacedCabinet[] = [],
  openings: WallOpening[] = [],
): { x: number; y: number; rotation: number } | null {
  if (!selected || !isSinkBaseCabinet(selected) || selected.placement !== "base") return null;
  const side = cabinetWall(selected, room);
  const horizontal = side === "top" || side === "bottom";
  const sinkFootprint = placedFootprint(selected);
  const sinkStart = horizontal ? selected.x : selected.y;
  const sinkSpan = horizontal ? sinkFootprint.w : sinkFootprint.d;
  const wallLength = horizontal ? room.width : room.depth;
  const centeredStart = Math.max(0, Math.min(sinkStart + sinkSpan / 2 - width / 2, Math.max(0, wallLength - width)));
  const centeredSpot = wallPlacementAt(centeredStart, width, depth, side, room);
  const candidate: PlacedCabinet = {
    ...selected,
    uid: "__selected-sink-wall-target__",
    masterCode: "SELECTED-SINK-WALL-TARGET",
    placement: "wall",
    ...centeredSpot,
    width,
    depth,
    height,
    mountBottom: height < 30 ? OVER_SINK_WALL_MOUNT_BOTTOM : WALL_MOUNT_BOTTOM,
  };
  const samePlanWithoutSink = placed.filter((cabinet) => cabinet.uid !== selected.uid);
  const available = freeSegmentsOnWall(
    side,
    room,
    samePlanWithoutSink,
    openings,
    width,
    WALL_OPENING_CLEARANCE_IN,
    "wall",
    false,
    candidate,
  );
	  const fittedStart = nearestAvailableWallStart(available, centeredStart, width);
	  if (fittedStart == null) return null;
	  const fittedEnd = fittedStart + width;
	  const sinkEnd = sinkStart + sinkSpan;
	  const alignedSpan = Math.max(0, Math.min(fittedEnd, sinkEnd) - Math.max(fittedStart, sinkStart));
	  const minimumAlignedSpan = Math.min(width, sinkSpan) / 2;
	  if (alignedSpan + COLLISION_EPSILON_IN < minimumAlignedSpan) return null;
	  const fittedSpot = wallPlacementAt(fittedStart, width, depth, side, room);
	  const fittedCandidate = { ...candidate, ...fittedSpot };
  if (hasCollision(fittedCandidate, placed)) return null;
  return fittedSpot;
}

/**
 * Centers a new sink base below an existing window on the active wall.  The
 * window owns the design intent: the cabinet's run center is made identical to
 * the window center, while the usual collision rules retain the real cabinet
 * body and all adjoining corner reservations.  A manual drag remains manual;
 * callers use this only for a normal catalog placement with no explicit point.
 */
export function sinkBaseWindowPlacement(
  side: WallSide,
  room: RoomData,
  width: number,
  depth: number,
  height: number,
  placed: PlacedCabinet[] = [],
  openings: WallOpening[] = [],
): {
  openingUid: string;
  spot: { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number };
} | null {
  if (width <= 0 || depth <= 0) return null;
  const runLength = wallLength(side, room);
  if (runLength + COLLISION_EPSILON_IN < width) return null;
  const windows = openings
    .filter((opening) => opening.kind === "window" && opening.side === side)
    .sort((left, right) => left.offset - right.offset);
  for (const window of windows) {
    const centeredStart = Math.max(
      0,
      Math.min(window.offset + window.width / 2 - width / 2, Math.max(0, runLength - width)),
    );
    const spot = wallPlacementAt(centeredStart, width, depth, side, room);
    const candidate: PlacedCabinet = {
      uid: "__sink-base-window-target__",
      cabinetId: -1,
      masterCode: "SINK-BASE-WINDOW-TARGET",
      description: "Sink base centered under window",
      placement: "base",
      ...spot,
      width,
      depth,
      height,
      wallId: spot.wallId,
      wallOffset: spot.wallOffset,
    };
    if (!cabinetPlacementCollisionDetail(candidate, placed, room)) {
      return { openingUid: window.uid, spot };
    }
  }
  return null;
}

/**
 * Aligns a wall cabinet to the exact projection of an intentionally selected
 * lower cabinet or floor appliance. Unlike the sink-specific helper above, this
 * target never slides to a different upper opening: it returns null when the
 * selected lower run is too narrow, belongs to a corner, is a refrigerator, or
 * already has an upper occupying the same elevation band. This lets a user aim
 * W-36-24 at a clear 36-inch lower run without the earlier 24-inch upper gap
 * taking precedence.
 */
export function selectedLowerCabinetWallPlacement(
  selected: PlacedCabinet | null | undefined,
  room: RoomData,
  width: number,
  depth: number,
  height: number,
  placed: PlacedCabinet[] = [],
  openings: WallOpening[] = [],
): { x: number; y: number; rotation: number } | null {
  if (!selected || (selected.placement !== "base" && selected.placement !== "appliance")) return null;
  if (selected.placement === "appliance" && (isRefrigerator(selected) || isRangeOrOven(selected.masterCode, selected.description) || elevationBox(selected, room).bottom > COLLISION_EPSILON_IN)) return null;
  if (placedCornerGeometryKind(selected) !== "standard") return null;
  const side = cabinetWall(selected, room);
  const horizontal = side === "top" || side === "bottom";
  const lowerFootprint = placedFootprint(selected);
  const lowerStart = horizontal ? selected.x : selected.y;
  const lowerSpan = horizontal ? lowerFootprint.w : lowerFootprint.d;
  if (width > lowerSpan + COLLISION_EPSILON_IN) return null;
  const wallLength = horizontal ? room.width : room.depth;
  const centeredStart = Math.max(0, Math.min(lowerStart + lowerSpan / 2 - width / 2, Math.max(0, wallLength - width)));
  const centeredSpot = wallPlacementAt(centeredStart, width, depth, side, room);
  const candidate: PlacedCabinet = {
    ...selected,
    uid: "__selected-lower-wall-target__",
    masterCode: "SELECTED-LOWER-WALL-TARGET",
    placement: "wall",
    ...centeredSpot,
    width,
    depth,
    height,
  };
  const available = freeSegmentsOnWall(
    side,
    room,
    placed,
    openings,
    width,
    WALL_OPENING_CLEARANCE_IN,
    "wall",
    false,
    candidate,
  );
  const exactProjectionIsClear = available.some((segment) => (
    centeredStart >= segment.start - COLLISION_EPSILON_IN
    && centeredStart + width <= segment.start + segment.length + COLLISION_EPSILON_IN
  ));
  if (!exactProjectionIsClear || hasCollision(candidate, placed)) return null;
  return centeredSpot;
}

/**
 * Seats a wall cabinet directly above a selected true corner base. The upper
 * shares the actual corner endpoint—not merely the base's screen bounding box—
 * so ERB36/diagonal corners stay aligned on custom, cardinal, and diagonal
 * continuous walls. A regular upper keeps its 12-inch depth while its outer
 * edge remains flush with the same vertex as the floor corner cabinet.
 */
export function selectedCornerBaseWallPlacement(
  selected: PlacedCabinet | null | undefined,
  room: RoomData,
  width: number,
  depth: number,
  height: number,
  placed: PlacedCabinet[] = [],
  openings: WallOpening[] = [],
): { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number } | null {
  if (!selected || selected.placement !== "base") return null;
  if (!isCornerCabinet(selected.masterCode, selected.description) || isBlindCorner(selected.masterCode, selected.description)) return null;

  const side = cabinetWall(selected, room);
  const runLength = wallLength(side, room);
  const selectedStart = wallRunOffset(selected, side, room);
  const selectedEnd = selectedStart + wallRunSpan(selected, side, room);
  const cornerAtRunEnd = selectedEnd >= runLength - COLLISION_EPSILON_IN;
  const alignedStart = cornerAtRunEnd ? Math.max(0, runLength - width) : 0;
  const spot = wallPlacementAt(alignedStart, width, depth, side, room);
  const candidate: PlacedCabinet = {
    ...selected,
    uid: "__selected-corner-base-wall-target__",
    masterCode: "SELECTED-CORNER-BASE-WALL-TARGET",
    placement: "wall",
    ...spot,
    width,
    depth,
    height,
    wallId: spot.wallId ?? selected.wallId,
    wallOffset: spot.wallOffset ?? alignedStart,
  };
  const available = freeSegmentsOnWall(
    side,
    room,
    placed,
    openings,
    width,
    WALL_OPENING_CLEARANCE_IN,
    "wall",
    false,
    candidate,
  );
  const exactCornerProjectionIsClear = available.some((segment) => (
    alignedStart >= segment.start - COLLISION_EPSILON_IN
    && alignedStart + width <= segment.start + segment.length + COLLISION_EPSILON_IN
  ));
  if (!exactCornerProjectionIsClear || cabinetPlacementCollisionDetail(candidate, placed, room)) return null;
  return spot;
}

/**
 * Finds the first clear lower run whose physical span matches the requested
 * upper width. This is the deterministic click-to-add counterpart to an
 * explicit 2D/3D drop on a lower cabinet: occupied projections are skipped,
 * and no unrelated lower width is guessed or centered automatically.
 */
export function matchingLowerCabinetWallPlacement(
  side: WallSide,
  room: RoomData,
  width: number,
  depth: number,
  height: number,
  placed: PlacedCabinet[] = [],
  openings: WallOpening[] = [],
): { targetUid: string; spot: { x: number; y: number; rotation: number } } | null {
  const horizontal = side === "top" || side === "bottom";
  const candidates = placed
    .filter((cabinet) => (cabinet.placement === "base" || cabinet.placement === "appliance") && cabinetWall(cabinet, room) === side)
    .filter((cabinet) => {
      if (cabinet.placement === "appliance" && (isRefrigerator(cabinet) || isRangeOrOven(cabinet.masterCode, cabinet.description) || elevationBox(cabinet, room).bottom > COLLISION_EPSILON_IN)) return false;
      if (placedCornerGeometryKind(cabinet) !== "standard") return false;
      const footprint = placedFootprint(cabinet);
      const span = horizontal ? footprint.w : footprint.d;
      return Math.abs(span - width) <= 0.5;
    })
    .sort((left, right) => (horizontal ? left.x - right.x : left.y - right.y));
  for (const candidate of candidates) {
    const spot = selectedLowerCabinetWallPlacement(candidate, room, width, depth, height, placed, openings);
    if (spot) return { targetUid: candidate.uid, spot };
  }
  return null;
}

/**
 * A short cabinet directly above a sink is bottom-mounted at 70 inches from
 * the finished floor. It is raised only when a window on that same wall/run
 * requires the minimum three-inch opening clearance.
 */
export function overSinkWallMountBottom(
  cabinet: PlacedCabinet,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  room: RoomData,
): number | null {
  if (cabinet.placement !== "wall" || placedHeight(cabinet) >= 30) return null;
  const centeredStart = overSinkWindowStart(cabinet, placed, openings, room);
  if (centeredStart == null) return null;
  const side = cabinetWall(cabinet, room);
  const horizontal = side === "top" || side === "bottom";
  const currentStart = horizontal ? cabinet.x : cabinet.y;
  if (Math.abs(currentStart - centeredStart) > 0.5) return null;
  return Math.max(OVER_SINK_WALL_MOUNT_BOTTOM, bridgeMountBottomAboveWindow(cabinet, openings, room) ?? 0);
}

export type OverSinkWindowClearanceMeasure = {
  side: WallSide;
  openingLabel: string;
  openingTop: number;
  clearance: number;
  requiredBottom: number;
  cabinetHeight: number;
  requiredTop: number;
  ceiling: number;
  shortage: number;
};

export function overSinkWindowClearanceMeasure(
  cabinet: PlacedCabinet,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  room: RoomData,
  clearance = WALL_OPENING_CLEARANCE_IN,
): OverSinkWindowClearanceMeasure | null {
  if (cabinet.placement !== "wall" || placedHeight(cabinet) >= 30) return null;
  const centeredStart = overSinkWindowStart(cabinet, placed, openings, room);
  if (centeredStart == null) return null;
  const side = cabinetWall(cabinet, room);
  const horizontal = side === "top" || side === "bottom";
  const currentStart = horizontal ? cabinet.x : cabinet.y;
  if (Math.abs(currentStart - centeredStart) > 0.5) return null;
  const size = rotatedSize(cabinet);
  const span = horizontal ? size.w : size.d;
  const crossedWindows = openings.filter((opening) =>
    opening.kind === "window" &&
    opening.side === side &&
    currentStart < opening.offset + opening.width - 0.01 &&
    currentStart + span > opening.offset + 0.01,
  );
  if (crossedWindows.length === 0) return null;
  const limitingWindow = crossedWindows.reduce((highest, opening) => opening.sill + opening.height > highest.sill + highest.height ? opening : highest);
  const openingTop = limitingWindow.sill + limitingWindow.height;
  const requiredBottom = Math.max(OVER_SINK_WALL_MOUNT_BOTTOM, openingTop + clearance);
  const cabinetHeight = placedHeight(cabinet);
  const requiredTop = requiredBottom + cabinetHeight;
  const ceiling = room.ceilingHeight ?? 96;
  return { side, openingLabel: limitingWindow.label || "window", openingTop, clearance, requiredBottom, cabinetHeight, requiredTop, ceiling, shortage: Math.max(0, requiredTop - ceiling) };
}

/** Whether a short over-sink cabinet crosses a window that cannot clear below the ceiling. */
export function overSinkWindowClearanceBlocked(cabinet: PlacedCabinet, placed: PlacedCabinet[], openings: WallOpening[], room: RoomData): boolean {
  return (overSinkWindowClearanceMeasure(cabinet, placed, openings, room)?.shortage ?? 0) > 0.01;
}

/**
 * Repairs saved drafts after a window or sink base changes. A prior automatic
 * over-window mount must not leave the same short cabinet hovering at its old
 * ceiling-adjacent height once the window is removed.
 */
export function normalizeOverSinkWallMounts(
  placed: PlacedCabinet[],
  openings: WallOpening[],
  room: RoomData,
): PlacedCabinet[] {
  let changed = false;
  const normalized = placed.map((cabinet) => {
    if (cabinet.mountBottomAdjusted) return cabinet;
    const mountBottom = overSinkWallMountBottom(cabinet, placed, openings, room);
    if (mountBottom == null || cabinet.mountBottom === mountBottom) return cabinet;
    changed = true;
    return { ...cabinet, mountBottom };
  });
  return changed ? normalized : placed;
}

/** Repair old WD18 placements that inherited the generic 54-inch wall mount. */
export function normalizeWd18CountertopMounts(placed: PlacedCabinet[]): PlacedCabinet[] {
  let changed = false;
  const normalized = placed.map((cabinet) => {
    if (!isWd18CountertopDrawerCabinet(cabinet)) return cabinet;
    const storedBottom = typeof cabinet.mountBottom === "number" && cabinet.mountBottom >= 0
      ? cabinet.mountBottom
      : null;
    if (storedBottom != null && Math.abs(storedBottom - WALL_MOUNT_BOTTOM) > 0.01) return cabinet;
    if (storedBottom === STD.COUNTERTOP_HEIGHT) return cabinet;
    changed = true;
    return { ...cabinet, mountBottom: STD.COUNTERTOP_HEIGHT };
  });
  return changed ? normalized : placed;
}

/** Whether a wall cabinet crosses a window only after clearing it vertically. */
export function wallCabinetClearsWindow(
  cabinet: PlacedCabinet,
  opening: WallOpening,
  room: RoomData,
  clearance = WALL_OPENING_CLEARANCE_IN,
): boolean {
  if (cabinet.placement !== "wall" || opening.kind !== "window") return false;
  const side = cabinetWall(cabinet, room);
  if (opening.side !== side) return false;
  const start = wallRunOffset(cabinet, side, room);
  const end = start + wallRunSpan(cabinet, side, room);
  const crossesWindow = start < opening.offset + opening.width - 0.01 && end > opening.offset + 0.01;
  return crossesWindow && elevationBox(cabinet, room).bottom >= opening.sill + opening.height + clearance - 0.01;
}

// Footprint rectangle (rotation-aware) for a placed item.
function footprintRect(p: PlacedCabinet): { x1: number; y1: number; x2: number; y2: number } {
  const { w, d } = placedFootprint(p);
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
  if (p.islandFace) return true;
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

/** True for farm/farmhouse sink bases that must resolve through the active-wall palette path. */
export function isFarmSinkBasePaletteItem(c: {
  masterCode?: string | null;
  description?: string | null;
  subCategory?: string | null;
}): boolean {
  if (!isSinkBaseCabinet(c)) return false;
  const code = `${c.masterCode ?? ""}`.toLowerCase();
  const hay = `${c.description ?? ""} ${c.subCategory ?? ""}`.toLowerCase();
  return /^fsb[-_]?\d/.test(code) || /farm(?:house)?\s+sink/.test(hay);
}

/** A sink fixture belongs to a sink base when its center lies inside that cabinet's true footprint. */
export function fixtureIsOnCabinetFootprint(
  fixture: { x: number; y: number; width: number; depth: number },
  cabinet: PlacedCabinet,
): boolean {
  const footprint = placedFootprint(cabinet);
  const centerX = fixture.x + fixture.width / 2;
  const centerY = fixture.y + fixture.depth / 2;
  return (
    centerX >= cabinet.x && centerX <= cabinet.x + footprint.w &&
    centerY >= cabinet.y && centerY <= cabinet.y + footprint.d
  );
}

/** Exact sink-base ownership is authoritative; footprint matching preserves legacy saved fixtures. */
export function fixtureBelongsToCabinet(fixture: SinkFixture, cabinet: PlacedCabinet): boolean {
  return fixture.cabinetUid === cabinet.uid || fixtureIsOnCabinetFootprint(fixture, cabinet);
}

/**
 * Returns true if the cabinet is a farmer's / apron-front sink base (FSB-*).
 * These have an exposed apron face below the countertop and no bottom rail.
 */
export function isFarmerSinkBase(c: {
  description?: string | null;
  masterCode?: string | null;
  subCategory?: string | null;
}): boolean {
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""}`.toLowerCase();
  const descMatch =
    /\b(?:farm(?:house)?|apron)\b[^.]*\bsink\b/.test(hay) ||
    /\bsink\b[^.]*\b(?:farm(?:house)?|apron)\b/.test(hay);
  if (descMatch) return true;
  const code = (c.masterCode ?? "").toUpperCase();
  // FSB-30, FSB-33, FSB-36, ADA-FSB-30, etc.
  return /^(?:ADA-)?FSB[-_ ]?\d/.test(code);
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

// An over-range microwave (MW-*) hangs above the counter in the upper zone. A
// short bridge may intentionally sit above that microwave. A wall-mounted hood
// is different: its complete plan/elevation span remains reserved and must not
// be shared by a cabinet or cabinet part.
export function isOverRangeAppliance(p: {
  masterCode?: string | null;
  placement?: Placement;
}): boolean {
  if (p.placement !== "appliance") return false;
  return /^MW-/.test((p.masterCode || "").toUpperCase());
}

// True when `a` and `b` form the intended bridge-over-microwave pairing. Range
// hoods are deliberately excluded because their complete wall span is occupied.
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
      // A floor refrigerator is tall enough to occupy the wall-cabinet band;
      // standard base appliances remain below it.
      if (!verticalEnvelopesOverlap(a, b)) continue;
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

const GLASS_STACKER_HEIGHTS = new Set([12, 15, 18, 21, 24]);

function glassStackerHeight(p: { height?: number | string | null; masterCode?: string | null }): number | null {
  const explicit = Number(p.height);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const pairs = ((p.masterCode ?? "").toUpperCase().match(/\d{2}/g) ?? []).map(Number);
  const inferred = pairs[pairs.length - 1];
  return Number.isFinite(inferred) ? inferred : null;
}

/**
 * Structural family identity for a short glass wall stacker and the wall
 * cabinet it can sit above. This is deliberately narrower than a width match:
 * a DCW/WDC diagonal corner stacker must never be used above a straight wall
 * cabinet just because both products are 24 inches wide.
 */
export function glassStackerFamily(p: { masterCode?: string | null }): "WDC" | "W" | null {
  const code = (p.masterCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Supplier catalogs use both WDC-2412GD and DCW2412GD for the same diagonal
  // wall-corner stacker family. Keep those identities together, but never let
  // either one stack above a conventional straight W24 wall cabinet.
  if (code.includes("WDC") || code.includes("DCW")) return "WDC";
  if (code.startsWith("W") || /^GD?S\d/.test(code)) return "W";
  return null;
}

// Every 12", 15", 18", 21", or 24" glass wall cabinet is a stacker: it sits
// directly ON TOP of a same-width cabinet from its respective wall family. This
// includes both conventional W3012GD/W3012PG identities and distributor formats
// such as 2412WDCGD. Taller glass wall cabinets remain normal wall cabinets.
export function isStacker(p: { description?: string | null; masterCode?: string | null; subCategory?: string | null; height?: number | string | null }): boolean {
  const hay = `${p.subCategory ?? ""} ${p.description ?? ""} ${p.masterCode ?? ""}`.toLowerCase();
  const height = glassStackerHeight(p);
  const supportedHeight = height == null || GLASS_STACKER_HEIGHTS.has(height);
  // Text signals: "stacker", "glass stacker", "stacking"/"stacked".
  if (/\bstacker\b|\bstack(?:ing|ed)?\b|glass\s*stack/.test(hay)) return supportedHeight;
  // Code signals: GS-* / GDS-* stacker families used across lines (e.g. GS-3012,
  // GDS-3015). Require a following size digit so we never match unrelated codes.
  const code = (p.masterCode ?? "").toUpperCase();
  if (/^GD?S[-_ ]?\d/.test(code)) return supportedHeight;
  const normalized = code.replace(/[^A-Z0-9]/g, "");
  const glassIdentity = normalized.endsWith("GD") || normalized.endsWith("PG") || /\bglass\b/.test(hay);
  return glassIdentity && height != null && GLASS_STACKER_HEIGHTS.has(height);
}

export type GlassStackerParentPlacementResult =
  | { ok: true; x: number; y: number; rotation: number; mountBottom: number; parentUid: string; parentCode: string }
  | { ok: false; reason: "not-stacker" | "no-matching-parent" | "ceiling"; parentCode?: string; requiredTop?: number; ceiling?: number };

/**
 * Resolve the physical cabinet that a glass stacker belongs on. Matching is
 * strict by room wall, installed width, and cabinet family; a WDC glass stacker
 * cannot silently land on a standard W cabinet. The currently selected matching
 * parent wins, otherwise the nearest matching run position is used.
 */
export function glassStackerParentPlacement(
  stacker: PlacedCabinet,
  placed: readonly PlacedCabinet[],
  room: RoomData,
  preferredParentUid?: string | null,
): GlassStackerParentPlacementResult {
  if (stacker.placement !== "wall" || !isStacker(stacker)) return { ok: false, reason: "not-stacker" };
  const side = cabinetWall(stacker, room);
  const horizontal = side === "top" || side === "bottom";
  const wallLengthIn = Math.max(1, horizontal ? room.width : room.depth);
  const stackerFamily = glassStackerFamily(stacker);
  const stackerWidth = Number(stacker.width);
  const stackerStart = horizontal ? stacker.x : stacker.y;
  const stackerCenter = stackerStart + stackerWidth / 2;
  const candidates = placed.filter((parent) => {
    if (parent.uid === stacker.uid || parent.placement !== "wall" || parent.islandFace || isStacker(parent)) return false;
    if (cabinetWall(parent, room) !== side || !isAgainstWall(parent, side, room)) return false;
    if (Math.abs(Number(parent.width) - stackerWidth) > 0.5) return false;
    const parentFamily = glassStackerFamily(parent);
    return stackerFamily == null || parentFamily === stackerFamily;
  }).sort((left, right) => {
    const leftPreferred = left.uid === preferredParentUid ? 0 : 1;
    const rightPreferred = right.uid === preferredParentUid ? 0 : 1;
    if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
    const leftStart = horizontal ? left.x : left.y;
    const rightStart = horizontal ? right.x : right.y;
    return Math.abs(leftStart + Number(left.width) / 2 - stackerCenter) - Math.abs(rightStart + Number(right.width) / 2 - stackerCenter);
  });
  if (candidates.length === 0) return { ok: false, reason: "no-matching-parent" };

  let firstCeilingBlock: Extract<GlassStackerParentPlacementResult, { ok: false }> | null = null;
  for (const parent of candidates) {
    const parentBox = elevationBox(parent, room);
    const mountBottom = parentBox.bottom + parentBox.height;
    const footprint = placedFootprint(parent);
    const start = horizontal ? parent.x : parent.y;
    const span = horizontal ? footprint.w : footprint.d;
    const ceiling = Math.min(
      wallCeilingAt(room, side, start / wallLengthIn),
      wallCeilingAt(room, side, (start + span) / wallLengthIn),
    );
    const requiredTop = mountBottom + placedHeight(stacker);
    if (requiredTop <= ceiling + COLLISION_EPSILON_IN) {
      return {
        ok: true,
        x: parent.x,
        y: parent.y,
        rotation: parent.rotation,
        mountBottom,
        parentUid: parent.uid,
        parentCode: parent.masterCode,
      };
    }
    firstCeilingBlock ??= { ok: false, reason: "ceiling", parentCode: parent.masterCode, requiredTop, ceiling };
  }
  return firstCeilingBlock ?? { ok: false, reason: "no-matching-parent" };
}

/**
 * WD1848 / WD1854 / WD1860 are the single-door countertop cabinet family:
 * an 18-inch-wide upper box with one tall door above two bottom drawers. The
 * no-dash identity intentionally excludes ordinary WD-18-xx double-door wall
 * cabinets, which remain standard 54-inch-mounted uppers.
 */
export function isWd18CountertopDrawerCabinet(p: {
  masterCode?: string | null;
  placement?: string | null;
}): boolean {
  if (p.placement != null && p.placement !== "wall") return false;
  return /^WD18(?:48|54|60)$/i.test((p.masterCode ?? "").trim());
}

export type Wd18CountertopFaceLayout = {
  doorHeight: number;
  drawerHeights: number[];
};

/** Physical WD18 face sections in inches, ordered top-to-bottom. */
export function wd18CountertopFaceLayout(
  p: { masterCode?: string | null; placement?: string | null; numberOfDrawers?: number | null },
  cabinetHeight: number,
): Wd18CountertopFaceLayout | null {
  if (!isWd18CountertopDrawerCabinet(p)) return null;
  const height = Math.max(1, cabinetHeight);
  const drawerCount = Math.max(1, Math.round(p.numberOfDrawers ?? 2));
  // The supplied product drawing shows two shallow lower drawers below the tall
  // door. Use a six-inch face for each drawer while retaining a usable door on
  // every 48-, 54-, and 60-inch family member.
  const drawerArea = Math.min(height * 0.45, drawerCount * 6);
  return {
    doorHeight: height - drawerArea,
    drawerHeights: Array.from({ length: drawerCount }, () => drawerArea / drawerCount),
  };
}

export function elevationBox(
  p: PlacedCabinet,
  room?: { ceilingHeight?: number } | null
): { bottom: number; height: number } {
  // Refrigerator enclosure panels are full architectural skins. They must never
  // inherit a neighboring base cabinet's mount height from a legacy surround or
  // catalogue import: both sides run from finished floor to the room ceiling.
  if (isRefrigeratorEndPanel(p)) {
    return { bottom: 0, height: room?.ceilingHeight ?? 96 };
  }
  // A shallow wall cabinet used on an island is a counter-height opposing face,
  // not a room-wall upper. Its top aligns with the adjoining base cabinet box.
  if (isCounterHeightIslandWallCabinet(p)) {
    const height = placedHeight(p);
    return { bottom: Math.max(0, STD.BASE_HEIGHT - height), height };
  }
  // Island cabinets and compatible parts build from the finished floor rather
  // than inheriting room-wall hanging defaults. A deliberate elevation edit is
  // retained through mountBottomAdjusted, including after save and restore.
  if (p.islandFace && p.mountBottomAdjusted !== true) {
    return { bottom: 0, height: placedHeight(p) };
  }
  // The top line the upper run finishes at. On a standard 8ft ceiling this is
  // the historical 84" line; on taller ceilings the run hangs higher so it
  // finishes near the ceiling (see wallCabinetTopLine).
  const topLine = wallCabinetTopLine(room);
  if (p.placement === "appliance") {
    const def = APPLIANCES.find((a) => a.masterCode === p.masterCode);
    // Use the stored height when the user has resized the appliance (e.g. fridge height set to 72").
    // Fall back to the catalog elevHeight when no custom height is stored.
    const storedH = typeof p.height === "number" && p.height > 0 ? p.height : null;
    if (def) {
      // Catalog mount height is the safe default, but the placement flow may
      // persist an intentional appliance mount (notably an MW-30 over a range).
      // Respect that value so collision detection and elevation use the same
      // physical vertical envelope as the designer.
      const storedBottom = typeof p.mountBottom === "number" && p.mountBottom >= 0
        ? p.mountBottom
        : def.elevBottom;
      return { bottom: storedBottom, height: storedH ?? def.elevHeight };
    }
    // Unknown appliance code (e.g. FRIDGE-33 after resize): use stored height if available,
    // otherwise fall back to countertop height as a safe default.
    if (storedH) return { bottom: 0, height: storedH };
    return { bottom: 0, height: STD.COUNTERTOP_HEIGHT };
  }
  // A deliberate 3D attributes adjustment may vertically offset a base or tall
  // cabinet. Persist the exact 2D elevation rather than allowing the 3D scene
  // to drift away from its plan record. Wall/appliance records are handled in
  // their specialized branches below so their catalog defaults remain intact.
  if ((p.placement === "base" || p.placement === "tall") && typeof p.mountBottom === "number" && p.mountBottom >= 0) {
    return { bottom: p.mountBottom, height: placedHeight(p) };
  }
  if (p.placement === "wall") {
    const h = placedHeight(p);
    // WD18 countertop cabinets default to the 36-inch finished countertop line.
    // A stale standard-wall 54-inch mount is treated as the former incorrect
    // default; any other explicit user-adjusted mount remains intentional.
    if (isWd18CountertopDrawerCabinet(p)) {
      const storedBottom = typeof p.mountBottom === "number" && p.mountBottom >= 0 ? p.mountBottom : null;
      return {
        bottom: storedBottom == null || Math.abs(storedBottom - WALL_MOUNT_BOTTOM) <= 0.01
          ? STD.COUNTERTOP_HEIGHT
          : storedBottom,
        height: h,
      };
    }
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
    // 2b) Appliance garages (AG-*) mount ON the countertop surface (36") and
    //     rise up to 54" (36" + 18"). They are NOT top-anchored like wall
    //     cabinets — they sit between the countertop and the wall cabinets above.
    {
      const agHay = `${p.subCategory ?? ""} ${p.description ?? ""} ${p.masterCode ?? ""}`.toLowerCase();
      if (/appliance garage|\bag-?\d/.test(agHay)) {
        return { bottom: STD.COUNTERTOP_HEIGHT, height: h };
      }
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
  // baseTop: specialty items (knee drawers, spice racks) that sit in the
  // counter-height zone. A knee drawer may be installed from 24–30 inches off
  // the finished floor; 30 inches is the default just below the countertop.
  if (p.placement === "baseTop") {
    const requested = typeof p.mountBottom === "number" ? p.mountBottom : KNEE_DRAWER_DEFAULT_MOUNT_BOTTOM_IN;
    const bottom = isKneeDrawerItem(p)
      ? Math.min(KNEE_DRAWER_MAX_MOUNT_BOTTOM_IN, Math.max(KNEE_DRAWER_MIN_MOUNT_BOTTOM_IN, requested))
      : requested;
    return { bottom, height: placedHeight(p) };
  }
  // underCabinet: specialty items (stem glass holders) that hang under wall cabinets
  // They mount at the wall cabinet's bottom line (54") and hang down
  if (p.placement === "underCabinet") {
    const h = placedHeight(p);
    return { bottom: WALL_MOUNT_BOTTOM - h, height: h }; // bottom of item is at 54", grows downward
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
  // LS## = Lazy Susan (e.g. LS3612, LS3312); LSB## = Lazy Susan Base (older naming)
  // BER## = Easy-Reach corner base (Skyline naming, e.g. BER33, BER36)
  if (/^(BBC|WBC|BLB|LSB?|CSB|WLS|DCW|DCB|ER|ERB|BER|WER|AW-|AW\d|WDC|KWD|AG-|AG\d|CAG)/.test(code)) return true;
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
  const normalizedCode = code.replace(/[^A-Z0-9]/g, "");
  // Diagonal corner wall/base, angled wall (AW), and corner appliance garages
  // (AG) all sit across the corner at 45 degrees and share the same footprint.
  // BEC = Base End Cabinet: an end-of-run angle cabinet, never a room-corner
  // cabinet. It is handled by the independent end-angle drawing profile.
  if (/^(DCW|WDC|KWD|DCB|DCFF|AW-|AW\d|AG-|AG\d|CAG)/.test(code) || normalizedCode.includes("DCW") || normalizedCode.includes("WDC")) return true;
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

// Returns a CSS clip-path for a triangle corner cabinet (WTC/BTC). The cabinet
// body is a right-triangle: two legs along the back walls, hypotenuse is the
// angled door face. The bounding box is square (width × width). Rotation selects
// which corner is the wall corner (rot 0 = wall corner top-left, face bottom-right).
export function triangleCornerClipPath(rotation: number): string {
  const r = ((rotation % 360) + 360) % 360;
  switch (r) {
    case 90:  // wall corner top-right; face toward bottom-left
      return `polygon(0 0, 100% 0, 0 100%)`;
    case 180: // wall corner bottom-right; face toward top-left
      return `polygon(100% 0, 100% 100%, 0 100%)`;
    case 270: // wall corner bottom-left; face toward top-right
      return `polygon(0 0, 100% 100%, 0 100%)`;
    default:  // 0 — wall corner top-left; face toward bottom-right
      return `polygon(0 0, 100% 0, 100% 100%)`;
  }
}

// True for triangle corner cabinets (WTC/BTC). Detected by cornerType field or
// by code prefix WTC/BTC.
export function isTriangleCorner(masterCode: string, cornerType?: string | null): boolean {
  if (cornerType === "triangle") return true;
  const code = (masterCode || "").toUpperCase();
  return /^(WTC|BTC)/.test(code);
}

// True for L-shaped corner cabinets (lazy-Susan, blind corner, easy-reach
// corner). These are corner cabinets that are NOT diagonal — they form a square
// footprint with an L-notch cut at the interior corner. We reuse isCornerCabinet
// for detection and exclude the diagonal family.
export function isLCornerCabinet(masterCode: string, description?: string): boolean {
  if (isDiagonalCorner(masterCode, description)) return false;
  // Blind corner cabinets (BBC/WBC) are NOT L-shaped — they are standard
  // rectangular cabinets that sit in a corner with a blind (hidden) portion.
  // Their footprint is width x standard-depth (e.g. BBC-36 = 36" x 24"),
  // NOT a square like lazy-Susan or easy-reach corners.
  if (isBlindCorner(masterCode, description)) return false;
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

/** Format a measured span to the nearest 1/8 inch for installation-oriented UI. */
export function formatEighthInches(inches: number): string {
  const measured = Math.max(0, Number.isFinite(inches) ? inches : 0);
  const eighths = Math.round(measured * 8);
  if (measured > COLLISION_EPSILON_IN && eighths === 0) return `<⅛"`;
  const whole = Math.floor(eighths / 8);
  const fraction = eighths % 8;
  const glyph = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"][fraction];
  return `${whole || !glyph ? whole : ""}${glyph}"`;
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
  const peninsula = peninsulaRunById(room, side);
  if (peninsula) return Math.max(6, peninsula.length);
  // If the side is actually a custom wall ID in a polygon room, compute from vertices.
  if (room.vertices && room.customWalls) {
    const wall = room.customWalls.find((w) => w.id === side);
    if (wall) {
      return polygonWallSegmentLength(wall, room.vertices);
    }
  }
  return side === "top" || side === "bottom" ? room.width : room.depth;
}

/** Prospective longer-side wall segment shown before a Compass split commits. */
export function retainedWallSegmentForSplit(side: WallSide, room: RoomData, splitIn: number): { start: number; length: number } {
  const fullLength = side === "top" || side === "bottom" ? room.width : room.depth;
  const split = Math.max(0, Math.min(fullLength, Number(splitIn) || 0));
  const suffixLength = fullLength - split;
  return split >= suffixLength
    ? { start: 0, length: split }
    : { start: split, length: suffixLength };
}

/**
 * The usable segment of a cardinal room wall for cabinet placement and plan
 * rendering. A primary peninsula opens the shorter side of its parent wall at
 * the attachment point and preserves the longer side for continued cabinet
 * placement. This intentionally does not change `wallLength`: the full room
 * span is still required when moving the attachment and measuring the shell.
 */
export function cabinetWallRunSegment(side: WallSide, room: RoomData): { start: number; length: number } {
  const fullLength = side === "top" || side === "bottom" ? room.width : room.depth;
  const terminatingOffsets = (room.peninsulaRuns ?? [])
    .filter((run) => !run.parentRunId && run.parentWall === side && run.terminatesParentWall !== false)
    .map((run) => Math.max(0, Math.min(fullLength, Number(run.startOffset) || 0)));
  if (terminatingOffsets.length === 0) return { start: 0, length: fullLength };
  const split = terminatingOffsets.reduce((best, offset) => {
    const retained = Math.max(offset, fullLength - offset);
    const bestRetained = Math.max(best, fullLength - best);
    return retained > bestRetained ? offset : best;
  });
  return retainedWallSegmentForSplit(side, room, split);
}

export function cabinetWallRunLength(side: WallSide, room: RoomData): number {
  return cabinetWallRunSegment(side, room).length;
}

// Clamp an opening to its owning wall in both run and elevation directions.
export function clampOpening(o: WallOpening, room: RoomData): WallOpening {
  const len = wallLength(o.side, room);
  const width = Math.max(6, Math.min(o.width, len));
  const offset = Math.max(0, Math.min(o.offset, len - width));
  const ceiling = wallCeilingMin(room, o.side);
  const height = Math.max(6, Math.min(o.height, ceiling));
  const sill = Math.max(0, Math.min(o.sill, ceiling - height));
  return { ...o, width, offset, height, sill };
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
//
// Hex values are sourced directly from the official Sherwin-Williams color chart
// (images.sherwin-williams.com/content_images/sw-pdf-sherwin-williams-colorc.pdf)
// for the most common cabinet paint colors, giving precise color accuracy.
const FINISH_BY_KEYWORD: { match: RegExp; face: string; edge: string; label: string; swName?: string }[] = [
  // ── SPECIFIC SW CABINET COLORS (matched before generic families) ──────────
  // SW 7006 Extra White — LRV 86, crisp cool white
  { match: /extra white|sw\s*7006|sw7006/, face: "#eeefea", edge: "#d0d1cc", label: "#2a2a2a", swName: "Extra White SW 7006" },
  // SW 7008 Alabaster — warm white, most popular cabinet white
  { match: /alabaster|sw\s*7008|sw7008/, face: "#edeae0", edge: "#cfc9b8", label: "#2a2a2a", swName: "Alabaster SW 7008" },
  // SW 7012 Creamy — soft yellow-cream
  { match: /creamy|sw\s*7012|sw7012/, face: "#efe9d4", edge: "#d4c9a8", label: "#2e2a1e", swName: "Creamy SW 7012" },
  // SW 7005 Pure White
  { match: /pure white|sw\s*7005|sw7005/, face: "#f4f1e8", edge: "#d8d4c6", label: "#2a2a2a", swName: "Pure White SW 7005" },
  // SW 7004 Snowbound
  { match: /snowbound|sw\s*7004|sw7004/, face: "#eef0ec", edge: "#d0d2ce", label: "#2a2a2a", swName: "Snowbound SW 7004" },
  // SW 7029 Agreeable Gray — warm gray, very popular
  { match: /agreeable gray|agreeable grey|sw\s*7029|sw7029/, face: "#d1cbc1", edge: "#b0a99e", label: "#1f1e1c", swName: "Agreeable Gray SW 7029" },
  // SW 7015 Repose Gray — true neutral greige
  { match: /repose gray|repose grey|sw\s*7015|sw7015/, face: "#ccc9c0", edge: "#a8a59c", label: "#1f1e1c", swName: "Repose Gray SW 7015" },
  // SW 7016 Mindful Gray — warm neutral gray
  { match: /mindful gray|mindful grey|sw\s*7016|sw7016/, face: "#bbb6ad", edge: "#96918a", label: "#1a1917", swName: "Mindful Gray SW 7016" },
  // SW 6244 Naval — deep navy blue
  { match: /naval(?!\s*gray)|sw\s*6244|sw6244/, face: "#3d5166", edge: "#26354a", label: "#f0f4f8", swName: "Naval SW 6244" },
  // SW 6258 Tricorn Black — true black
  { match: /tricorn black|sw\s*6258|sw6258/, face: "#2f2f2f", edge: "#161616", label: "#f5f5f5", swName: "Tricorn Black SW 6258" },
  // SW 6990 Caviar — near-black warm
  { match: /caviar|sw\s*6990|sw6990/, face: "#3b3635", edge: "#1e1b1a", label: "#f5f5f5", swName: "Caviar SW 6990" },
  // SW 7069 Iron Ore — dark charcoal
  { match: /iron ore|sw\s*7069|sw7069/, face: "#4b4d4e", edge: "#2c2e2f", label: "#f5f5f5", swName: "Iron Ore SW 7069" },
  // SW 7048 Urbane Bronze — dark warm brown-gray
  { match: /urbane bronze|sw\s*7048|sw7048/, face: "#645c54", edge: "#433e38", label: "#f5efe8", swName: "Urbane Bronze SW 7048" },
  // SW 6119 Antique White — warm cream with beige undertone
  { match: /antique white|sw\s*6119|sw6119/, face: "#ede0c8", edge: "#ccc0a0", label: "#2e2a1e", swName: "Antique White SW 6119" },
  // SW 6385 Accessible Beige
  { match: /accessible beige|sw\s*6385|sw6385/, face: "#d4c9b6", edge: "#b0a590", label: "#2a2520", swName: "Accessible Beige SW 6385" },
  // SW 9166 Evergreen Fog — muted sage green
  { match: /evergreen fog|sw\s*9166|sw9166/, face: "#7a8c7e", edge: "#5a6a5e", label: "#f0f4f0", swName: "Evergreen Fog SW 9166" },
  // SW 6177 Pewter Green
  { match: /pewter green|sw\s*6177|sw6177/, face: "#6b7d6a", edge: "#4e5e4d", label: "#f0f4f0", swName: "Pewter Green SW 6177" },
  // ── GENERIC COLOR FAMILIES (fallback when no specific SW name matches) ────
  // WHITES (broad)
  { match: /white|snow|arctic|alpine|pearl|dove(?!tail)|blanc|alba|marshmallow|chantilly|frost(?!ed gray)|ivory|cotton|dawn/, face: "#f3f1ec", edge: "#cfc9bf", label: "#3a3a3a" },
  // GREYS (incl. repose/dovetail/agreeable/mindful greige-leaning grays)
  { match: /grey|gray|stone|pewter|graphite|slate|fog|cinder|relic|repose|dovetail|grizzle|greige|ash|smoke|nickel|harbor|mist|pebble|amberg/, face: "#9aa0a6", edge: "#6f747a", label: "#1f2937" },
  // BLUES
  { match: /navy|blue|indigo|ocean|naval|cobalt|abyss|cobblestone|denim|sapphire|marine|teal|peacock/, face: "#3b4d63", edge: "#26354a", label: "#f8fafc" },
  // GREENS (incl. Aston Green, sage breeze)
  { match: /green|sage|forest|hunter|olive|fern|moss|evergreen|basil|juniper|aston/, face: "#566f5a", edge: "#3c4f40", label: "#f8fafc" },
  // BLACKS / NEAR-BLACK (incl. Iron Black, Midnight Glass/Black, Charcoal)
  { match: /black|onyx|carbon|tricorn|obsidian|jet|raven|charcoal|iron ore|peppercorn|caviar|midnight|iron black/, face: "#2b2b2e", edge: "#161618", label: "#f5f5f5" },
  // DARK BROWNS (espresso/walnut/mocha/treasure chest)
  { match: /walnut|mocha|coffee|chocolate|brown|espresso|umbra|shadow|java|truffle|cocoa|bourbon|treasure/, face: "#6b4a32", edge: "#4c3422", label: "#fbeee6" },
  // REDDISH WOODS
  { match: /cherry|mahogany|chestnut|cinnamon|spice|sienna|russet|brick|garnet/, face: "#7a4a32", edge: "#5a3422", label: "#fbeee6" },
  // MID WARM WOODS (oak/maple/honey/saddle/autumn/rustic wood/blonde oak)
  { match: /honey|oak|natural|maple|wheat|amber|toffee|saddle|autumn|caramel|pecan|harvest|golden|butterscotch|solar|rustic wood|blonde/, face: "#c08a4e", edge: "#9a6a36", label: "#3a2410" },
  // CREAMS / WARM NEUTRALS
  { match: /cream|almond|biscuit|linen|sand|beige|tan|creamy|manila|wicker|navajo|buttermilk|antique white|aged/, face: "#e6dcc6", edge: "#c7b79a", label: "#3a3526" },
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

// Returns the matched SW color entry including swName when available.
// Used by the product detail hero to display the SW color name as attribution.
export function finishColorsWithName(...parts: (string | null | undefined)[]): FinishColors & { swName?: string } {
  // If any part is a valid 6-digit hex color, use it directly.
  for (const p of parts) {
    if (p && /^#[0-9a-fA-F]{6}$/.test(p.trim())) {
      return colorsFromHex(p.trim().toLowerCase());
    }
  }
  const s = parts.filter(Boolean).join(" ").toLowerCase();
  for (const f of FINISH_BY_KEYWORD) {
    if (f.match.test(s)) return { face: f.face, edge: f.edge, label: f.label, swName: f.swName };
  }
  if (!s.trim()) return DEFAULT_FINISH;
  return FALLBACK_FINISHES[hashString(s) % FALLBACK_FINISHES.length];
}

// Derive edge and label colors from a hex face color.
// Edge is darkened ~15%, label is white for dark faces and dark for light faces.
function colorsFromHex(hex: string): FinishColors {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Darken by ~18% for edge
  const dr = Math.round(r * 0.82);
  const dg = Math.round(g * 0.82);
  const db = Math.round(b * 0.82);
  const edge = `#${dr.toString(16).padStart(2,'0')}${dg.toString(16).padStart(2,'0')}${db.toString(16).padStart(2,'0')}`;
  // Luminance check for label contrast
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const label = lum > 160 ? '#2a2520' : '#f5f0eb';
  return { face: hex, edge, label };
}

// Accepts any combination of the style's brand name, paint color, finish text,
// and wood species — all are scanned together so the most specific signal wins.
// When a hex color code is present in the parts, it is used directly so every
// door style renders with its exact brand color regardless of keyword matching.
// Falls back to a deterministic per-name color (never the same tone for every
// style) when nothing matches.
export function finishColors(...parts: (string | null | undefined)[]): FinishColors {
  // First pass: if any part is a valid 6-digit hex color, use it directly.
  for (const p of parts) {
    if (p && /^#[0-9a-fA-F]{6}$/.test(p.trim())) {
      return colorsFromHex(p.trim().toLowerCase());
    }
  }
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
// Other simple wall-run trim retains the existing 3" per-run allowance. Crown
// has a separate exact takeoff because its exposed perimeter can include returns,
// depth steps, and 45° cuts around outside cabinet corners.
export const MITER_ALLOWANCE_IN = 3;
// Each end of an exposed crown miter cut receives four inches. An outside
// corner joins two cut ends, so it contributes eight inches to the takeoff.
export const CROWN_MITER_ALLOWANCE_IN = 4;
// Light rail is installed below upper cabinets. Add four inches once for each
// continuous exposed rail assembly to provide the owner's installation buffer.
export const LIGHT_RAIL_INSTALLATION_ALLOWANCE_IN = 4;

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
  // Polygon room: if the cabinet has an explicit wallId, return it directly.
  if (p.wallId && (room.customWalls?.some((wall) => wall.id === p.wallId) || peninsulaRunById(room, p.wallId))) {
    return p.wallId as WallSide;
  }
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

/**
 * Returns the wall-flush spot for a microwave centered on a compatible range.
 * The microwave's shallow plan depth is preserved while only its run-axis
 * center follows the range, which supports top/bottom and left/right walls.
 */
export function mountedMicrowaveOverRangeSpot(
  microwave: Pick<PlacedCabinet, "width" | "depth">,
  range: PlacedCabinet,
  room: RoomData,
): { x: number; y: number; rotation: number } {
  const side = cabinetWall(range, room);
  const rangeSize = rotatedSize(range);
  const horizontal = side === "top" || side === "bottom";
  const rangeStart = horizontal ? range.x : range.y;
  const rangeSpan = horizontal ? rangeSize.w : rangeSize.d;
  // The microwave's catalog width follows the cabinet run on every wall. Its
  // shallow depth only projects into the room, including after a 90° turn on a
  // left/right wall. Using depth here offset a right-wall MW-30 by 7½ inches,
  // which made the final mounted-pair collision exemption fail.
  const microwaveSpan = microwave.width;
  return wallPlacementAt(
    rangeStart + rangeSpan / 2 - microwaveSpan / 2,
    microwave.width,
    microwave.depth,
    side,
    room,
  );
}

/**
 * Select the range that an over-range microwave should mount above. A selected
 * range takes precedence, then ranges on the active wall, then the nearest
 * range in the current design. This keeps palette adds from inheriting an
 * arbitrary free canvas position in the center of the room.
 */
export function preferredRangeForOverRangeMicrowave(
  placed: PlacedCabinet[],
  room: RoomData,
  activeWall: WallSide | null | undefined,
  selectedUid: string | null | undefined,
  target: Pick<PlacedCabinet, "x" | "y">,
): PlacedCabinet | undefined {
  const isRange = (cabinet: PlacedCabinet) => isRangeOrOven(cabinet.masterCode, cabinet.description);
  const selectedRange = placed.find((cabinet) => cabinet.uid === selectedUid && isRange(cabinet));
  if (selectedRange) return selectedRange;
  const activeWallRanges = activeWall
    ? placed.filter((cabinet) => isRange(cabinet) && cabinetWall(cabinet, room) === activeWall)
    : [];
  const candidates = activeWallRanges.length > 0 ? activeWallRanges : placed.filter(isRange);
  return [...candidates].sort(
    (a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
  )[0];
}

/** Returns the mounted range and exact wall spot for a palette or drag MW-30 add. */
export function overRangeMicrowaveAttachment(
  placed: PlacedCabinet[],
  room: RoomData,
  activeWall: WallSide | null | undefined,
  selectedUid: string | null | undefined,
  target: Pick<PlacedCabinet, "x" | "y">,
  microwave: Pick<PlacedCabinet, "width" | "depth">,
): { range: PlacedCabinet; spot: { x: number; y: number; rotation: number } } | null {
  const range = preferredRangeForOverRangeMicrowave(placed, room, activeWall, selectedUid, target);
  return range ? { range, spot: mountedMicrowaveOverRangeSpot(microwave, range, room) } : null;
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

// Legacy width-only crown estimate for non-render callers. The live Designer
// order uses the final exposed 3D crown perimeter, including every return and
// the four-inch allowance at both cut ends of each outside corner.
export function isCrownEligibleCabinet(p: PlacedCabinet, room?: RoomData): boolean {
  if (p.placement === "tall") return true;
  if (p.placement !== "wall") return false;
  // Island wall cabinets are floor/counter-height casework, never upper runs.
  // The explicit island marker remains authoritative for older saves whose
  // mountBottom may still contain a room-wall value.
  if (usesRaisedFloorWallDoorPull(p)) return false;
  // A wall cabinet deliberately dropped to a 4½-inch toe kick is floor-seated
  // casework. Use the rendered elevation bottom so restored plans, counter-height
  // variants, and explicit mountBottom values all follow the same physical rule.
  const bottom = elevationBox(p, room).bottom;
  return bottom > STD.TOE_KICK + COLLISION_EPSILON_IN;
}

/**
 * Crown belongs only on exposed cabinet tops. A short glass wall cabinet that
 * is physically stacked on a wall cabinet replaces the lower cabinet's exposed
 * top, so crown moves to the glass stacker's top rather than running between
 * the two boxes. This resolves the same parent with the existing glass-stacker
 * placement contract, avoiding false suppression for nearby or mismatched runs.
 */
export function crownEligibleCabinets(placed: readonly PlacedCabinet[], room?: RoomData): PlacedCabinet[] {
  const eligible = placed.filter((cabinet) => isCrownEligibleCabinet(cabinet, room));
  if (!room) return eligible;

  const coveredLowerCabinetUids = new Set<string>();
  for (const stacker of placed) {
    if (stacker.placement !== "wall" || !isStacker(stacker) || !isGlassDoorCabinet(stacker)) continue;
    const parentPlacement = glassStackerParentPlacement(stacker, placed, room, stacker.stackedOnCabinetUid);
    if (!parentPlacement.ok) continue;
    const parent = eligible.find((cabinet) => cabinet.uid === parentPlacement.parentUid);
    if (!parent) continue;
    const parentBox = elevationBox(parent, room);
    const stackerBox = elevationBox(stacker, room);
    const parentTop = parentBox.bottom + parentBox.height;
    if (Math.abs(stackerBox.bottom - parentTop) <= COLLISION_EPSILON_IN) {
      coveredLowerCabinetUids.add(parent.uid);
    }
  }

  return eligible.filter((cabinet) => !coveredLowerCabinetUids.has(cabinet.uid));
}

export function crownLinearInches(placed: PlacedCabinet[], room?: RoomData): number {
  // Crown caps the top of upper (wall) cabinets and tall pantry/oven cabinets.
  const wallCabs = crownEligibleCabinets(placed, room);
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

export interface LightRailTakeoff {
  exposedLinearInches: number;
  installationAllowanceInches: number;
  totalLinearInches: number;
  assemblies: number;
}

export function isLightRailEligibleCabinet(p: PlacedCabinet, room?: RoomData): boolean {
  if (p.placement !== "wall") return false;
  if (usesRaisedFloorWallDoorPull(p)) return false;
  return !room || elevationBox(p, room).bottom > STD.TOE_KICK + COLLISION_EPSILON_IN;
}

type LightRailFootprint = { cabinet: PlacedCabinet; x: number; y: number; width: number; depth: number; wall: WallSide };

function lightRailFootprint(p: PlacedCabinet, room?: RoomData): LightRailFootprint {
  const size = rotatedSize(p);
  // The Designer always supplies room context. This deterministic fallback is
  // retained for legacy pure callers that only provide a placed cabinet list.
  const wall = room ? cabinetWall(p, room) : ((Math.round(p.rotation) % 180 + 180) % 180 === 0 ? "top" : "left");
  return { cabinet: p, x: p.x, y: p.y, width: size.w, depth: size.d, wall };
}

function overlappingLength(startA: number, endA: number, startB: number, endB: number): number {
  return Math.min(endA, endB) - Math.max(startA, startB);
}

function lightRailAssemblies(footprints: LightRailFootprint[]): LightRailFootprint[][] {
  const remaining = [...footprints];
  const groups: LightRailFootprint[][] = [];
  while (remaining.length > 0) {
    const group = [remaining.shift()!];
    for (let index = 0; index < group.length; index++) {
      for (let candidate = remaining.length - 1; candidate >= 0; candidate--) {
        const a = group[index];
        const b = remaining[candidate];
        const gapX = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
        const gapY = Math.max(a.y - (b.y + b.depth), b.y - (a.y + a.depth), 0);
        if (gapX <= COLLISION_EPSILON_IN && gapY <= COLLISION_EPSILON_IN) {
          group.push(b);
          remaining.splice(candidate, 1);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function lightRailExposedEdgeInches(footprint: LightRailFootprint, all: LightRailFootprint[]): number {
  const shares = (edge: "top" | "bottom" | "left" | "right") => all.some((other) => {
    if (other.cabinet.uid === footprint.cabinet.uid) return false;
    if (edge === "top") return Math.abs(other.y + other.depth - footprint.y) <= COLLISION_EPSILON_IN && overlappingLength(footprint.x, footprint.x + footprint.width, other.x, other.x + other.width) > COLLISION_EPSILON_IN;
    if (edge === "bottom") return Math.abs(footprint.y + footprint.depth - other.y) <= COLLISION_EPSILON_IN && overlappingLength(footprint.x, footprint.x + footprint.width, other.x, other.x + other.width) > COLLISION_EPSILON_IN;
    if (edge === "left") return Math.abs(other.x + other.width - footprint.x) <= COLLISION_EPSILON_IN && overlappingLength(footprint.y, footprint.y + footprint.depth, other.y, other.y + other.depth) > COLLISION_EPSILON_IN;
    return Math.abs(footprint.x + footprint.width - other.x) <= COLLISION_EPSILON_IN && overlappingLength(footprint.y, footprint.y + footprint.depth, other.y, other.y + other.depth) > COLLISION_EPSILON_IN;
  });

  const edges: Array<["top" | "bottom" | "left" | "right", number]> = [
    ["top", footprint.width],
    ["bottom", footprint.width],
    ["left", footprint.depth],
    ["right", footprint.depth],
  ];
  const backEdge: Record<WallSide, "top" | "bottom" | "left" | "right"> = { top: "top", bottom: "bottom", left: "left", right: "right" };
  return edges.reduce((total, [edge, length]) => (
    edge === backEdge[footprint.wall] || shares(edge) ? total : total + length
  ), 0);
}

/**
 * Light rail follows the visible underside perimeter of upper cabinets: front
 * widths plus exposed depth returns, never hidden shared sides or wall backs.
 * Each connected installed assembly receives one four-inch cut/installation
 * allowance, so a standalone W1230 takes off at 12 + 12 + 12 + 4 = 40 inches.
 */
export function lightRailTakeoff(placed: PlacedCabinet[], room?: RoomData): LightRailTakeoff {
  const footprints = placed.filter((p) => isLightRailEligibleCabinet(p, room)).map((p) => lightRailFootprint(p, room));
  if (footprints.length === 0) return { exposedLinearInches: 0, installationAllowanceInches: 0, totalLinearInches: 0, assemblies: 0 };
  const assemblies = lightRailAssemblies(footprints);
  const exposedLinearInches = footprints.reduce((total, footprint) => total + lightRailExposedEdgeInches(footprint, footprints), 0);
  const installationAllowanceInches = assemblies.length * LIGHT_RAIL_INSTALLATION_ALLOWANCE_IN;
  return {
    exposedLinearInches,
    installationAllowanceInches,
    totalLinearInches: exposedLinearInches + installationAllowanceInches,
    assemblies: assemblies.length,
  };
}

// Light rail runs along the exposed underside of true upper cabinets only. It
// excludes wall backs, shared cabinet sides, island/floor wall casework, tall,
// base, and appliance cabinets.
export function lightRailLinearInches(placed: PlacedCabinet[], room?: RoomData): number {
  return lightRailTakeoff(placed, room).totalLinearInches;
}

// ─── Valance (VA) ────────────────────────────────────────────────────────────
// Arched valance is a decorative trim piece that spans above a window opening
// between wall cabinet runs. Only VA-48 exists in the catalog (48"W x 6"H,
// field-trimmed to fit the window width). One VA-48 piece is ordered per window
// on a wall that has wall cabinets.

export interface ValancePiece {
  code: string;   // always "VA-48" (the only catalog SKU)
  width: number;  // window width it covers (for display); piece is 48" trimmed on site
  wall: WallSide;
}

/**
 * Determine which valance pieces are needed for windows in the design.
 * A valance is suggested when a window sits on a wall that also has wall cabinets
 * (i.e., the window is between or adjacent to wall cabinet runs).
 * Each window gets one VA-48 piece (trimmed on site to fit).
 */
export function valancePiecesNeeded(
  openings: WallOpening[],
  placed: PlacedCabinet[],
  room?: RoomData,
): ValancePiece[] {
  const windows = openings.filter((o) => o.kind === "window");
  if (windows.length === 0) return [];
  // Walls that have at least one wall cabinet
  const wallsWithUppers = new Set<WallSide>();
  for (const p of placed) {
    if (p.placement === "wall" && p.cabinetId !== 0) {
      if (room) {
        wallsWithUppers.add(cabinetWall(p, room));
      } else {
        // Fallback: assume all walls have uppers
        wallsWithUppers.add("top");
        wallsWithUppers.add("bottom");
        wallsWithUppers.add("left");
        wallsWithUppers.add("right");
      }
    }
  }
  const pieces: ValancePiece[] = [];
  for (const win of windows) {
    // Only suggest valance if there are wall cabinets on the same wall
    if (!wallsWithUppers.has(win.side)) continue;
    // One VA-48 per window (trimmed to fit on site)
    pieces.push({ code: "VA-48", width: win.width, wall: win.side });
  }
  return pieces;
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
// The Designer measures exact countertop area for material quantity and quoting.
// Selected whole slabs may carry a catalog price; edge work and fabrication remain quoted.
// Standard countertop depth is 25.5" (24" base box + ~1.5" front overhang).
// Island tops use the island footprint directly.
export const COUNTERTOP_DEPTH_IN = 25.5;

export interface CountertopMeasurement {
  linearFeet: number; // total run of base cabinets that take a top, in feet
  squareFeet: number; // run x countertop depth (+ island + waterfall), in sq ft
  perimeterSquareFeet: number; // wall-run bases plus their existing waterfall panels
  islandSquareFeet: number; // exact rendered island slab area
  runInches: number;  // raw base run, inches
  hasIsland: boolean;
  waterfallSqFt: number; // extra sq ft from waterfall panels (height × depth per side)
}

export interface CountertopSlabMeasurement {
  width: number;
  depth: number;
}

/**
 * Measure the countertop needed for a layout: base-cabinet run x standard depth,
 * plus the island footprint if present. Wall/tall cabinets don't take a top.
 */
export function countertopArea(
  placed: PlacedCabinet[],
  island?: IslandZone | null,
  islandSlabs?: readonly CountertopSlabMeasurement[] | null,
  room?: RoomData | null,
): CountertopMeasurement {
  const hasExplicitIslandFaces = island ? placed.some((item) => item.islandFace != null) : false;
  const isIslandMember = (item: PlacedCabinet) => island != null && (
    hasExplicitIslandFaces ? item.islandFace != null : isOnIsland(item, island)
  );
  const perimeterPlaced = island ? placed.filter((item) => !isIslandMember(item)) : placed;
  const peninsulaRunIds = new Set((room?.peninsulaRuns ?? []).map((run) => run.id));
  const straightRunInches = perimeterPlaced
    .filter((p) => p.placement === "base" && !peninsulaRunIds.has(cabinetWall(p, room ?? DEFAULT_ROOM)))
    .reduce((sum, p) => sum + rotatedSize(p).w, 0);
  const peninsulaSurfaces = room
    ? countertopSurfaces(perimeterPlaced, room).filter((surface) => Boolean(surface.peninsulaRunId))
    : [];
  const peninsulaRunInches = peninsulaSurfaces.reduce((sum, surface) => sum + (surface.runLinearInches ?? surface.linearInches ?? 0), 0);
  const peninsulaSquareIn = peninsulaSurfaces.reduce((sum, surface) => sum + (surface.areaInches ?? 0), 0);
  const runInches = straightRunInches + peninsulaRunInches;
  let squareIn = straightRunInches * COUNTERTOP_DEPTH_IN + peninsulaSquareIn;
  let islandSquareIn = 0;
  const islandSupports = island ? placed.filter((item) => isIslandMember(item) && bearsIslandCountertop(item)) : [];
  const measuredIslandSquareIn = island && islandSlabs != null
    ? islandSlabs.reduce((sum, slab) => {
        const width = Number(slab.width);
        const depth = Number(slab.depth);
        return Number.isFinite(width) && Number.isFinite(depth) && width > 0 && depth > 0
          ? sum + width * depth
          : sum;
      }, 0)
    : null;
  const hasIsland = measuredIslandSquareIn == null ? islandSupports.length > 0 : measuredIslandSquareIn > 0;
  if (measuredIslandSquareIn != null) {
    squareIn += measuredIslandSquareIn;
    islandSquareIn = measuredIslandSquareIn;
  } else if (hasIsland && island) {
    const footprints = islandSupports.map((item) => ({ item, footprint: placedFootprint(item) }));
    const minX = Math.min(...footprints.map(({ item }) => item.x));
    const minY = Math.min(...footprints.map(({ item }) => item.y));
    const maxX = Math.max(...footprints.map(({ item, footprint }) => item.x + footprint.w));
    const maxY = Math.max(...footprints.map(({ item, footprint }) => item.y + footprint.d));
    const configuredOverhang = Number(island.countertopOverhang);
    const overhang = island.countertopOverhang == null || !Number.isFinite(configuredOverhang)
      ? 1.5
      : Math.max(0, Math.min(24, configuredOverhang));
    const slabWidth = island.countertopWidth ?? maxX - minX + overhang * 2;
    const slabDepth = island.countertopDepth ?? maxY - minY + overhang * 2;
    islandSquareIn = slabWidth * slabDepth;
    squareIn += islandSquareIn;
  }
  // Waterfall panels: each side adds height × depth (the panel is as tall as
  // the countertop height from floor and as deep as the cabinet depth).
  let waterfallSqIn = 0;
  for (const p of perimeterPlaced) {
    if (p.placement !== "base" || peninsulaRunIds.has(cabinetWall(p, room ?? DEFAULT_ROOM))) continue;
    const sides = (p.waterfallLeft ? 1 : 0) + (p.waterfallRight ? 1 : 0);
    if (sides === 0) continue;
    const h = placedHeight(p); // cabinet box height (typically 34.5")
    const d = p.depth;         // cabinet depth (typically 24")
    waterfallSqIn += sides * h * d;
  }
  for (const surface of peninsulaSurfaces) {
    const rootRun = room?.peninsulaRuns?.find((candidate) => candidate.id === surface.peninsulaRunId);
    const terminalRun = surface.peninsulaTerminalRunId
      ? room?.peninsulaRuns?.find((candidate) => candidate.id === surface.peninsulaTerminalRunId) ?? rootRun
      : rootRun;
    const reachesFarEnd = Boolean(surface.peninsulaTerminalRunId)
      || (surface.runStartIn ?? 0) + (surface.linearInches ?? surface.width) >= (terminalRun?.length ?? Number.POSITIVE_INFINITY) - COLLISION_EPSILON_IN;
    if (terminalRun && peninsulaCountertopWaterfallEnd(terminalRun, room ?? { peninsulaRuns: [] }) && reachesFarEnd) {
      const terminalDepth = COUNTERTOP_DEPTH_IN
        + peninsulaCountertopSeatingOverhang(terminalRun, room ?? { peninsulaRuns: [] })
        + peninsulaCountertopPonyWallBackExtensionIn(terminalRun, room ?? { peninsulaRuns: [] });
      waterfallSqIn += STD.BASE_HEIGHT * terminalDepth;
    }
  }
  squareIn += waterfallSqIn;
  const waterfallSqFt = Math.ceil((waterfallSqIn / 144) * 10) / 10;
  const perimeterSquareFeet = Math.ceil(((straightRunInches * COUNTERTOP_DEPTH_IN + peninsulaSquareIn + waterfallSqIn) / 144) * 10) / 10;
  const islandSquareFeet = Math.ceil((islandSquareIn / 144) * 10) / 10;
  return {
    runInches,
    linearFeet: Math.round((runInches / 12) * 10) / 10,
    squareFeet: Math.ceil((squareIn / 144) * 10) / 10, // round up to 0.1 sq ft
    perimeterSquareFeet,
    islandSquareFeet,
    hasIsland,
    waterfallSqFt,
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

/**
 * Blind-corner master codes name their full physical run length. Supplier rows
 * sometimes store only the reduced box/opening width (BBC-36 was stored as 33),
 * which made placement, collision, fillers, and 3D disagree with the SKU.
 */
export function blindCornerNominalWidth(
  cabinet: { masterCode?: string | null; description?: string | null; width?: string | number | null; nominalWidth?: string | number | null },
): number {
  const code = `${cabinet.masterCode ?? ""}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const codedWidth = code.match(/^(?:BBC|WBC|BBL|BBR|WBL|WBR)(\d{2})/)?.[1];
  const parsedWidth = codedWidth == null ? Number.NaN : Number(codedWidth);
  if (Number.isFinite(parsedWidth) && parsedWidth >= 12 && parsedWidth <= 96) return parsedWidth;
  const nominal = Number(cabinet.nominalWidth);
  if (Number.isFinite(nominal) && nominal > 0) return nominal;
  const stored = Number(cabinet.width);
  return Number.isFinite(stored) && stored > 0 ? stored : 24;
}

export interface FillerLine {
  kind: "base" | "wall";
  count: number;
  width: number; // inches each
}

// Resolve the fixed trade-standard blind-corner pull range. A BBC's hidden
// portion must stay between 3" and 6"; older imports could carry width-derived
// or otherwise invalid values such as 9", which must never enlarge a cabinet,
// filler, countertop, or collision reservation. Existing values are retained
// as metadata for audit, but the physical design rule is always clamped here.
export function blindPullRange(
  p: { pullMin?: number | null; pullMax?: number | null; width?: number | null; nominalWidth?: number | null }
): { min: number; max: number } | null {
  const TRADE_MIN_PULL_IN = 3;
  const TRADE_MAX_PULL_IN = 6;
  const requestedMin = typeof p.pullMin === "number" ? p.pullMin : TRADE_MIN_PULL_IN;
  const requestedMax = typeof p.pullMax === "number" ? p.pullMax : TRADE_MAX_PULL_IN;
  const min = Math.max(TRADE_MIN_PULL_IN, Math.min(TRADE_MAX_PULL_IN, requestedMin));
  const max = Math.max(TRADE_MIN_PULL_IN, Math.min(TRADE_MAX_PULL_IN, requestedMax));
  return max < min ? { min: max, max: min } : { min, max };
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
      // Only flag missing-spec if the cabinet has explicit pullMin/pullMax
      // that are invalid. Since we now default to 3-6", this won't fire.
      out.set(p.uid, "missing-spec");
      continue;
    }
    // The "pull" is the blind portion (how many inches are hidden behind the
    // perpendicular wall). We can't reliably measure this from the placed
    // cabinet alone without room context, so we skip range validation here.
    // The auto-stop logic in DesignTool already enforces correct positioning.
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

// When a blind corner is seated in a room corner, the mandatory 3-inch filler
// belongs on the PERPENDICULAR adjoining run at the BBC's exposed front edge.
// That clearance keeps the next cabinet's door, drawer, and handles from
// striking the blind-corner front. The filler follows a 3-6 inch perpendicular
// BBC pull so it continues to butt the cabinet after a depth-position move.
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
  const footprint = placedFootprint(blind);
  const W = BLIND_CORNER_FILLER_WIDTH_IN;

  // Resolve which end of the owning wall is the room corner.
  const runStart = horizontal ? blind.x : blind.y;
  const runSpan = horizontal ? footprint.w : footprint.d;
  const runEnd = runStart + runSpan;
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

  const adjacentWall: WallSide = horizontal
    ? (atStart ? "left" : "right")
    : (atStart ? "top" : "bottom");
  const rearGap = blindCornerRearCountertopExtensionIn(blind, room);
  const ownerWallDepth = horizontal ? footprint.d : footprint.w;
  const frontDistanceFromCorner = rearGap + ownerWallDepth;
  const adjacentWallLength = adjacentWall === "top" || adjacentWall === "bottom" ? room.width : room.depth;
  const adjacentCornerAtStart = adjacentWall === "left" || adjacentWall === "right"
    ? wall === "top"
    : wall === "left";
  const fillerAlong = adjacentCornerAtStart
    ? frontDistanceFromCorner
    : adjacentWallLength - frontDistanceFromCorner - W;
  if (fillerAlong < -0.01 || fillerAlong + W > adjacentWallLength + 0.01) {
    return { filler: null, ambiguous: true, reason: "no-room-for-filler" };
  }

  // Build a confirmed installed filler on the perpendicular adjoining wall.
  const fillerPlacement: Placement = blind.placement === "wall" ? "wall" : "base";
  const fillerDepth = fillerPlacement === "wall" ? STD.WALL_DEPTH : STD.BASE_DEPTH;
  const fillerHeight = fillerPlacement === "wall" ? STD.WALL_HEIGHT : STD.BASE_HEIGHT;
  const spot = wallPlacementAt(fillerAlong, W, fillerDepth, adjacentWall, room);
  const fillerGroupId = `blind-filler-${blind.uid}`;
  const filler: PlacedCabinet = {
    uid: makeUidFn(),
    cabinetId: 0,
    masterCode: `FILL-${W}`,
    description: `${W}" Blind Corner Filler (opposite pull)`,
    category: "Filler",
    subCategory: "Filler",
    placement: fillerPlacement,
    x: spot.x,
    y: spot.y,
    width: W,
    nominalWidth: W,
    depth: fillerDepth,
    nominalDepth: fillerDepth,
    height: fillerHeight,
    nominalHeight: fillerHeight,
    rotation: spot.rotation,
    numberOfDoors: 0,
    numberOfDrawers: 0,
    fillerPieceGroupId: fillerGroupId,
    fillerBillingRole: "primary",
    fillerTotalWidth: W,
    fillerPlacementMode: adjacentCornerAtStart ? "left" : "right",
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

/**
 * Wall cabinets are mounted products, not free-standing room objects. Preserve
 * their along-wall position and mount height, but always reseat their shallow
 * depth against the wall they already belong to.
 */
export function snapWallCabinetToOwningWall(p: PlacedCabinet, room: RoomData): PlacedCabinet {
  if (p.placement !== "wall" || p.islandFace) return p;
  const side = cabinetWall(p, room);
  if (isCustomRoomWall(room, side) || peninsulaRunById(room, side)) return p;
  const { x, y } = snapToWall(p, side, room);
  return { ...p, x, y, depthPositionAdjusted: false };
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
	  const rotated = rotatedSize(p);
	  const cornerKind = placedCornerGeometryKind(p);
	  const trueRoomCorner = cornerKind === "l-shape" || cornerKind === "diagonal" || cornerKind === "corner-drawer" || cornerKind === "triangle";
	  const footprint = trueRoomCorner ? placedFootprint(p) : rotated;
	  const T = 2; // inches tolerance
	  switch (side) {
	    case "top":
	      return Math.abs(p.y - 0) <= T;
	    case "bottom":
	      return trueRoomCorner
	        ? p.y <= room.depth + T && p.y + footprint.d >= room.depth - T
	        : Math.abs(p.y + rotated.d - room.depth) <= T;
	    case "left":
	      return Math.abs(p.x - 0) <= T;
	    case "right":
	      return trueRoomCorner
	        ? p.x <= room.width + T && p.x + footprint.w >= room.width - T
	        : Math.abs(p.x + rotated.w - room.width) <= T;
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
  if (/^(RANGE|OVEN|RNG|OV|STOVE|STV|COOKTOP|CT)[\s_-]*\d/.test(code) || /^(RANGE|OVEN|RNG|OV|STOVE|STV|COOKTOP|CT)$/.test(code)) return true;
  const desc = (description || "").toLowerCase();
  return /\brange\b|\boven\b|\bstove\b|\bcooktop\b/.test(desc);
}

// An OVER-THE-RANGE microwave specifically (MW-*), as opposed to a range hood.
// This is the appliance that auto-mounts over the cooktop/range and pairs with a
// short "bridge" wall cabinet above it. Hoods (HOOD-*) are excluded because they
// vent rather than hang a cabinet above.
export function isOverRangeMicrowave(p: {
  masterCode?: string | null;
  placement?: Placement;
}): boolean {
  if (p.placement !== "appliance") return false;
  return /^MW-/.test((p.masterCode || "").toUpperCase());
}

// The standard short "bridge" wall cabinet SKU that mounts directly above an
// over-range microwave of a given width. Bridge cabinets fill the gap between
// the OTR microwave top and the wall cabinet top line. The bridge height depends
// on the chosen wall cabinet height:
//   30" walls → 12" bridge (classic)
//   36" walls → 18" bridge
//   42" walls → 24" bridge
// Widths that are not a stock bridge width snap to the nearest available stock
// width (30, 33, or 36) so we always suggest a real, orderable SKU.
export const BRIDGE_STOCK_WIDTHS = [30, 33, 36] as const;
export const BRIDGE_STOCK_HEIGHTS = [12, 15, 18, 24] as const;

/** Map wall cabinet height to the appropriate bridge height. */
export function bridgeHeightForWallHeight(wallCabH: number): number {
  if (wallCabH >= 42) return 24;
  if (wallCabH >= 36) return 18;
  return 12;
}

export function bridgeCabinetCodeForWidth(width: number, wallCabHeight?: number): string {
  const w = Number.isFinite(width) ? width : 30;
  // Snap to the nearest stock bridge width.
  const nearest = BRIDGE_STOCK_WIDTHS.reduce((best, cand) =>
    Math.abs(cand - w) < Math.abs(best - w) ? cand : best
  , BRIDGE_STOCK_WIDTHS[0]);
  const bh = bridgeHeightForWallHeight(wallCabHeight ?? 30);
  return `W-${nearest}-${bh}`;
}

// True for a refrigerator appliance (FRIDGE-*). Refrigerators trigger the
// Refrigerator Options flow (cabinet above + end panels + smooth panel) when
// dropped, and the surround pieces mounted above/beside them are exempt from
// the appliance-vs-cabinet collision check because they live in a different
// vertical zone (upper) or are thin flat panels flush to the fridge side.
export function isRefrigerator(p: {
  masterCode?: string | null;
  placement?: Placement;
}): boolean {
  if (p.placement !== "appliance") return false;
  return /^FRIDGE-/.test((p.masterCode || "").toUpperCase());
}

/** A dedicated refrigerator-wall/bridge cabinet, not an ordinary upper. */
export function isRefrigeratorWallCabinet(p: Pick<PlacedCabinet, "masterCode" | "description" | "placement">): boolean {
  if (p.placement !== "wall") return false;
  const code = (p.masterCode ?? "").toUpperCase();
  const description = (p.description ?? "").toLowerCase();
  return /^WR\d{4}$/.test(code) || /^RW[-\d]/.test(code) || /refrigerator\s*(wall|bridge|cabinet|upper)/.test(description);
}

export function refrigeratorAssemblyMemberRole(
  member: PlacedCabinet,
  refrigerator: PlacedCabinet,
  room: RoomData,
): RefrigeratorAssemblyRole | null {
  if (member.refrigeratorAssemblyId === refrigerator.uid && member.refrigeratorAssemblyRole) {
    return member.refrigeratorAssemblyRole;
  }
  if (cabinetWall(member, room) !== cabinetWall(refrigerator, room)) return null;
  const side = cabinetWall(refrigerator, room);
  const refrigeratorStart = wallRunOffset(refrigerator, side, room);
  const refrigeratorEnd = refrigeratorStart + wallRunSpan(refrigerator, side, room);
  const memberStart = wallRunOffset(member, side, room);
  const memberEnd = memberStart + wallRunSpan(member, side, room);
  if (isRefrigeratorWallCabinet(member) && footprintsOverlap(member, refrigerator)) return "bridge";
  if (!isRefrigeratorEndPanel(member)) return null;
  if (Math.abs(memberEnd - refrigeratorStart) <= 3) return "left-panel";
  if (Math.abs(memberStart - refrigeratorEnd) <= 3) return "right-panel";
  return null;
}

export function refrigeratorAssemblyMembers(
  placed: PlacedCabinet[],
  refrigerator: PlacedCabinet,
  room?: RoomData | null,
) {
  const enclosure = room ?? DEFAULT_ROOM;
  return placed.flatMap((member) => {
    if (member.uid === refrigerator.uid) return [];
    const role = refrigeratorAssemblyMemberRole(member, refrigerator, enclosure);
    return role ? [{ member, role }] : [];
  });
}

/** Replaces a moved refrigerator and reconciles its linked bridge and panels as one unit. */
export function commitRefrigeratorAssemblyCandidate(
  placed: PlacedCabinet[],
  refrigeratorUid: string,
  candidate: PlacedCabinet,
  room?: RoomData | null,
): PlacedCabinet[] | null {
  const source = placed.find((item) => item.uid === refrigeratorUid);
  if (!source || !isRefrigerator(source)) return null;
  const members = refrigeratorAssemblyMembers(placed, source, room);
  const memberUids = new Set(members.map(({ member }) => member.uid));
  const peers = placed.filter((item) => item.uid !== refrigeratorUid && !memberUids.has(item.uid));
  return normalizeRefrigeratorBayUppers([...peers, candidate, ...members.map(({ member }) => member)], room);
}

/**
 * Keeps a refrigerator, its over-fridge cabinet, and its requested enclosure
 * panels as one persisted assembly. Legacy members are recognized by physical
 * adjacency and upgraded with durable ownership metadata. The bridge is centered
 * over the exact appliance span; panels sit immediately outside each edge; and
 * the complete assembly shifts together if a neighbor would otherwise hide one.
 */
export function reconcileRefrigeratorAssemblies(
  placed: PlacedCabinet[],
  room?: RoomData | null,
): PlacedCabinet[] {
  const enclosure = room ?? DEFAULT_ROOM;
  let reconciled = [...placed];
  for (const refrigeratorUid of reconciled.filter(isRefrigerator).map((item) => item.uid)) {
    const refrigerator = reconciled.find((item) => item.uid === refrigeratorUid);
    if (!refrigerator) continue;
    const side = cabinetWall(refrigerator, enclosure);
    const refrigeratorStart = wallRunOffset(refrigerator, side, enclosure);
    const refrigeratorSpan = wallRunSpan(refrigerator, side, enclosure);
    const members = reconciled.flatMap((member) => {
      if (member.uid === refrigerator.uid) return [];
      const role = refrigeratorAssemblyMemberRole(member, refrigerator, enclosure);
      return role ? [{ member, role }] : [];
    });
    const bridge = members.find(({ role }) => role === "bridge")?.member;
    const panels = members.filter(({ role }) => role === "left-panel" || role === "right-panel");
    const repairLegacyBoth = refrigerator.refrigeratorPanelMode == null && Boolean(bridge) && panels.length === 1;
    const requestedMode: RefrigeratorPanelMode = repairLegacyBoth
      ? "both"
      : refrigerator.refrigeratorPanelMode
        ?? (panels.length >= 2
          ? "both"
          : panels[0]?.role === "left-panel"
            ? "left"
            : panels[0]?.role === "right-panel"
              ? "right"
              : "none");
    const desiredRoles = new Set<RefrigeratorAssemblyRole>([
      ...(bridge ? ["bridge" as const] : []),
      ...(requestedMode === "left" || requestedMode === "both" ? ["left-panel" as const] : []),
      ...(requestedMode === "right" || requestedMode === "both" ? ["right-panel" as const] : []),
    ]);
    const sourcePanel = panels[0]?.member;
    const refrigeratorTop = elevationBox(refrigerator, enclosure).bottom + elevationBox(refrigerator, enclosure).height;
    const bridgeHeight = bridge?.height ?? 24;
    const surround = refrigeratorSurroundElevation(enclosure, refrigeratorTop, bridgeHeight);
    const bridgeMountBottom = bridge
      ? refrigeratorUpperMountBottom(bridge, reconciled, enclosure, refrigeratorTop, bridgeHeight)
      : surround.mountBottom;
    const assemblyTop = bridgeMountBottom + bridgeHeight;
    const assemblyMembers: PlacedCabinet[] = [];
    for (const role of Array.from(desiredRoles)) {
      let member = members.find((candidate) => candidate.role === role)?.member;
      if (!member && sourcePanel && (role === "left-panel" || role === "right-panel")) {
        member = { ...sourcePanel, uid: `refrigerator-${refrigerator.uid}-${role}` };
      }
      if (!member) continue;
      const memberSpan = wallRunSpan(member, side, enclosure);
      const memberDepth = isCustomRoomWall(enclosure, side) || peninsulaRunById(enclosure, side)
        ? Math.max(0, Number(member.depth) || 0)
        : (() => {
            const memberSize = placedFootprint(member);
            return side === "top" || side === "bottom" ? memberSize.d : memberSize.w;
          })();
      const along = role === "bridge"
        ? refrigeratorStart + (refrigeratorSpan - memberSpan) / 2
        : role === "left-panel"
          ? refrigeratorStart - memberSpan
          : refrigeratorStart + refrigeratorSpan;
      const spot = wallPlacementAt(along, memberSpan, memberDepth, side, enclosure);
      assemblyMembers.push({
        ...member,
        ...spot,
        refrigeratorAssemblyId: refrigerator.uid,
        refrigeratorAssemblyRole: role,
        ...(role === "bridge" ? { mountBottom: bridgeMountBottom } : { mountBottom: 0, height: assemblyTop }),
      });
    }
    const assemblyUids = new Set(members.map(({ member }) => member.uid));
    const peers = reconciled.filter((item) => item.uid !== refrigerator.uid && !assemblyUids.has(item.uid));
    const refrigeratorWithMode = refrigerator.refrigeratorPanelMode === requestedMode
      ? refrigerator
      : { ...refrigerator, refrigeratorPanelMode: requestedMode };
    const fitted = fitRefrigeratorEnclosurePlacements(
      [...peers, refrigeratorWithMode],
      assemblyMembers,
      refrigerator.uid,
      enclosure,
    );
    reconciled = appendRefrigeratorEnclosurePlacements(
      fitted.existing,
      fitted.additions,
      refrigerator.uid,
    ).placed;
  }
  return reconciled;
}

/**
 * The cabinet above a refrigerator starts two inches above the appliance, while
 * both it and the finished side panels terminate on one enclosure cap. Returning
 * the shared top lets the designer size every refrigerator surround piece from
 * the exact same physical elevation.
 */
export function refrigeratorSurroundElevation(room: RoomData | null | undefined, fridgeTop: number, upperHeight: number) {
  const enclosure = room ?? DEFAULT_ROOM;
  const mountBottom = Math.max(fridgeTop + 2, wallCabinetTopLine(enclosure) - upperHeight);
  return { mountBottom, top: mountBottom + upperHeight };
}

function adjoiningWallCabinetTop(
  cabinet: PlacedCabinet,
  placed: PlacedCabinet[],
  room: RoomData,
): number | null {
  const side = cabinetWall(cabinet, room);
  const cabinetStart = wallRunOffset(cabinet, side, room);
  const cabinetEnd = cabinetStart + wallRunSpan(cabinet, side, room);
  let closestGap = Number.POSITIVE_INFINITY;
  let adjoiningTop: number | null = null;
  for (const neighbor of placed) {
    if (neighbor.uid === cabinet.uid || neighbor.placement !== "wall" || isStacker(neighbor)) continue;
    if (cabinetWall(neighbor, room) !== side || !isAgainstWall(neighbor, side, room)) continue;
    const start = wallRunOffset(neighbor, side, room);
    const end = start + wallRunSpan(neighbor, side, room);
    const gap = Math.min(Math.abs(end - cabinetStart), Math.abs(start - cabinetEnd));
    if (gap > CABINET_SEAM_SNAP_IN + COLLISION_EPSILON_IN) continue;
    const box = elevationBox(neighbor, room);
    const top = box.bottom + box.height;
    if (gap < closestGap - COLLISION_EPSILON_IN || (Math.abs(gap - closestGap) <= COLLISION_EPSILON_IN && top > (adjoiningTop ?? 0))) {
      closestGap = gap;
      adjoiningTop = top;
    }
  }
  return adjoiningTop;
}

function refrigeratorUpperMountBottom(
  cabinet: PlacedCabinet,
  placed: PlacedCabinet[],
  room: RoomData,
  fridgeTop: number,
  upperHeight: number,
): number {
  const surroundMount = refrigeratorSurroundElevation(room, fridgeTop, upperHeight).mountBottom;
  const adjoiningTop = adjoiningWallCabinetTop(cabinet, placed, room);
  return Math.max(surroundMount, adjoiningTop == null ? surroundMount : adjoiningTop - upperHeight);
}

/**
 * Re-seat a dedicated refrigerator wall cabinet on top of its matching
 * refrigerator. This repairs legacy plans that stored WR3624 as a normal upper
 * at the standard 54-inch wall mount, where it visibly ran into a 70-inch
 * refrigerator. A dedicated refrigerator cabinet starts two inches above the
 * appliance (72 inches for the confirmed 70-inch refrigerator) and then tops
 * out at the surrounding tall-cabinet cap. Ordinary wall cabinets deliberately
 * remain unchanged and are still rejected by the refrigerator collision rule.
 */
export function normalizeRefrigeratorBayUppers(placed: PlacedCabinet[], room?: RoomData | null): PlacedCabinet[] {
  const refrigerators = placed.filter(isRefrigerator);
  if (refrigerators.length === 0) return placed;

  const normalized = placed.map((cabinet) => {
    const enclosure = room ?? DEFAULT_ROOM;
    const sameWall = (candidate: PlacedCabinet) =>
      cabinetWall(candidate, enclosure) === cabinetWall(cabinet, enclosure);
    const fridge = refrigerators.find((candidate) => sameWall(candidate) && footprintsOverlap(candidate, cabinet));

    if (isRefrigeratorWallCabinet(cabinet) && fridge) {
      const fridgeBox = elevationBox(fridge, room);
      const fridgeTop = fridgeBox.bottom + fridgeBox.height;
      const cabinetHeight = cabinet.height ?? elevationBox(cabinet, room).height;
      const mountBottom = refrigeratorUpperMountBottom(cabinet, placed, enclosure, fridgeTop, cabinetHeight);
      return cabinet.mountBottom === mountBottom ? cabinet : { ...cabinet, mountBottom };
    }

    // Legacy end panels sit immediately outside a refrigerator, so their thin
    // plan footprint does not overlap the appliance. Match the two touching run
    // edges instead, then raise the panel's top to the companion refrigerator
    // cabinet cap. This makes existing panels finish with the upper enclosure.
    if (!isPanelItem(cabinet) || (cabinet.placement !== "tall" && cabinet.placement !== "wall")) return cabinet;
    const side = cabinetWall(cabinet, enclosure);
    const panelStart = wallRunOffset(cabinet, side, enclosure);
    const panelEnd = panelStart + wallRunSpan(cabinet, side, enclosure);
    const matchingFridge = refrigerators.find((candidate) => {
      if (cabinetWall(candidate, enclosure) !== side) return false;
      const fridgeStart = wallRunOffset(candidate, side, enclosure);
      const fridgeEnd = fridgeStart + wallRunSpan(candidate, side, enclosure);
      return Math.abs(panelEnd - fridgeStart) <= 2 || Math.abs(panelStart - fridgeEnd) <= 2;
    });
    if (!matchingFridge) return cabinet;

    const matchingUpper = placed.find((candidate) =>
      isRefrigeratorWallCabinet(candidate) &&
      cabinetWall(candidate, enclosure) === side &&
      footprintsOverlap(candidate, matchingFridge)
    );
    const fridgeBox = elevationBox(matchingFridge, room);
    const fridgeTop = fridgeBox.bottom + fridgeBox.height;
    const upperHeight = matchingUpper?.height ?? 24;
    // `placed` still contains the pre-normalization WR mount while this map is
    // running, so recompute the same deterministic adjoining-run mount instead
    // of reading a stale saved mount from the refrigerator upper.
    const upperMount = matchingUpper
      ? refrigeratorUpperMountBottom(matchingUpper, placed, enclosure, fridgeTop, upperHeight)
      : refrigeratorSurroundElevation(room, fridgeTop, upperHeight).mountBottom;
    const cap = upperMount + upperHeight;
    return cabinet.height === cap && cabinet.mountBottom === 0
      ? cabinet
      : { ...cabinet, height: cap, mountBottom: 0 };
  });
  return normalizeRefrigeratorPanelSeams(reconcileRefrigeratorAssemblies(normalized, room), room);
}

/**
 * Legacy compatibility hook. Earlier builds moved neighboring cabinets away
 * from refrigerator panel seams during restore, which silently changed a user's
 * saved run. Earlier cabinets are now authoritative; invalid newer panels are
 * rejected when the enclosure is added or when collision cleanup restores the
 * saved order. Never move an accepted cabinet here.
 */
export function normalizeRefrigeratorPanelSeams(placed: PlacedCabinet[], _room?: RoomData | null): PlacedCabinet[] {
  return placed;
}

// ── Staggered built-in look ────────────────────────────────────────────────
// A custom "stepped" upper run reads richer than a flat wall of identical
// cabinets: the ends and the refrigerator/corner cabinet step UP (taller) and
// the fridge/corner box steps OUT (deeper), and crown wraps the stagger. These
// constants + helpers capture the shop rules the owner uses:
//   - End cabinets on BOTH ends of an upper run are +6" TALLER than the
//     standard wall cabinet (finished taller bookends).
//   - The refrigerator / corner deep upper projects to 27" DEEP (proud of the
//     24" fridge box / 12" standard uppers) and is also +6" TALLER.
//   - A furred-out corner packs a corner wall cabinet out ~3" (a 2x4 behind it)
//     so its FACE steps proud of the neighbors for the same stepped look.
export const STAGGER_TALLER_IN = 6; // ends + fridge/corner upper are 6" taller
export const FRIDGE_CORNER_UPPER_DEPTH_IN = 27; // deep proud projection
export const FURRED_OUT_CORNER_IN = 3; // 2x4 pack-out behind a corner cabinet

// The finished height of a standard wall cabinet (before any stagger bump).
export function standardWallCabinetHeight(): number {
  return STD.WALL_HEIGHT;
}

// The height of a "stepped-up" cabinet (an end cabinet or the fridge/corner
// upper): the standard wall height plus the stagger bump.
export function staggeredWallCabinetHeight(baseHeight: number = STD.WALL_HEIGHT): number {
  const h = Number.isFinite(baseHeight) && baseHeight > 0 ? baseHeight : STD.WALL_HEIGHT;
  return h + STAGGER_TALLER_IN;
}

// Mount bottom for a stepped-up cabinet so its TOP finishes at the same top
// line as the rest of the run (the run caps flush; only the step is taller, so
// a taller box hangs LOWER at the bottom while sharing the top line). Given the
// run's top line and the stepped height, bottom = topLine - height.
export function staggeredMountBottom(topLine: number, height: number): number {
  return topLine - height;
}

// Depth of the refrigerator/corner deep upper for the proud stagger look.
export function fridgeCornerUpperDepth(): number {
  return FRIDGE_CORNER_UPPER_DEPTH_IN;
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

export type CabinetPlacementHoverDetail = {
  title: string;
  dimensions: CabinetDimensionsIn;
  clearance: string;
};

/**
 * Returns a concise, physically accurate hover explanation for the two
 * frequently positioned 24-inch items. A drawer base and dishwasher are both
 * allowed to meet a neighboring base at the exact shared edge: their required
 * cabinet-run clearance is zero, while positive overlap remains blocked.
 *
 * Dimensions always come from the current catalog record rather than a
 * hard-coded nominal value so an approved shallow/deep supplier variant is
 * described truthfully in the palette and floor plan.
 */
export function cabinetPlacementHoverDetail(
  cabinet: Pick<DesignCabinet, "masterCode" | "placement" | "description"> & {
    width?: string | number | null;
    height?: string | number | null;
    depth?: string | number | null;
  },
): CabinetPlacementHoverDetail | null {
  const normalizedCode = (cabinet.masterCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isDishwasher = /^DW\d*$/.test(normalizedCode) || /^DISHWASHER\d*$/.test(normalizedCode);
  const isDb24 = /^(?:\d+)?DB24(?:[A-Z0-9]*)$/.test(normalizedCode);
  if (!isDishwasher && !isDb24) return null;

  const dimensions = resolvedDesignCabinetDimensions({
    id: 0,
    masterCode: cabinet.masterCode,
    description: cabinet.description,
    category: null,
    subCategory: null,
    width: cabinet.width == null ? null : String(cabinet.width),
    height: cabinet.height == null ? null : String(cabinet.height),
    depth: cabinet.depth == null ? null : String(cabinet.depth),
    placement: cabinet.placement,
    numberOfDoors: null,
    numberOfDrawers: null,
    isCornerCabinet: null,
  });
  const label = isDishwasher ? "Dishwasher" : "DB24 drawer base";
  return {
    title: label,
    dimensions,
    clearance: "0 in. at either adjoining cabinet seam — flush edge contact is allowed; physical overlap is not.",
  };
}

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
	    const cStart = wallRunOffset(p, side, room);
	    const cEnd = cStart + wallRunSpan(p, side, room);
    for (const o of openings) {
      if (o.side !== side) continue;
      if (wallCabinetClearsWindow(p, o, room, clearance)) continue;
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
	    const cStart = wallRunOffset(p, side, room);
	    const cEnd = cStart + wallRunSpan(p, side, room);
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

/**
 * Finds the nearest collision-free start coordinate for a cabinet span on one
 * wall run. Candidate starts are clamped inside every segment that can contain
 * the span; distance ties intentionally resolve toward the left/start edge.
 */
export function nearestAvailableWallStart(
  segments: WallSegment[],
  requestedStart: number,
  span: number,
): number | null {
  if (!Number.isFinite(span) || span <= 0) return null;
  const candidates = segments
    .filter((segment) => segment.length + 0.001 >= span)
    .map((segment) => Math.max(segment.start, Math.min(requestedStart, segment.start + segment.length - span)));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate - requestedStart);
    const bestDistance = Math.abs(best - requestedStart);
    return candidateDistance < bestDistance || (candidateDistance === bestDistance && candidate < best)
      ? candidate
      : best;
  });
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
  layer: Placement = "base",
  // Full-height floor appliances (refrigerators) reserve the upper wall band
  // in addition to their normal appliance/base span.
  reserveUpperZone = false,
  // A short bridge may cross a window only when its explicit mount height
  // clears the opening vertically.
  candidate?: PlacedCabinet,
): WallSegment[] {
  const customRoomWall = isCustomRoomWall(room, side);
  const peninsulaRun = peninsulaRunById(room, side);
  const explicitRun = customRoomWall || Boolean(peninsulaRun);
  const horizontal = side === "top" || side === "bottom";
  const retainedWall = explicitRun
    ? { start: 0, length: wallLength(side, room) }
    : cabinetWallRunSegment(side, room);
  const wallStart = retainedWall.start;
  const wallEnd = retainedWall.start + retainedWall.length;
  const wallLen = wallEnd;

  // Collect blocked [start, end] intervals along the run axis.
  const blocked: { s: number; e: number }[] = [];
  if (peninsulaRun && ["base", "tall", "appliance"].includes(layer)) {
    // A child 45-degree run owns the near-end reservation. Its parent reserves
    // the matching far end. No 11-inch rule applies to a 90-degree return.
    if (peninsulaRun.parentRunId && peninsulaRun.turn === 45) {
      blocked.push({ s: 0, e: Math.min(PENINSULA_INSIDE_CORNER_CLEARANCE_IN, wallLen) });
    }
    if (peninsulaRunHas45EndInsideCornerClearance(peninsulaRun, room)) {
      blocked.push({ s: Math.max(0, wallLen - PENINSULA_INSIDE_CORNER_CLEARANCE_IN), e: wallLen });
    }
  }

  // Only items on the SAME layer (wall vs floor) block this run. Tall cabinets
  // span floor-to-ceiling, so they block BOTH the base and wall layers.
  const blocksThisLayer = (item: PlacedCabinet): boolean => {
    const pl = item.placement;
    if (pl === "tall") return true;
    if (reserveUpperZone && pl === "wall") return true;
    if (layer === "tall") return pl === "base" || pl === "appliance" || pl === "wall";
    // A refrigerator occupies the standard upper-cabinet elevation band. Normal
    // wall-run sequencing must reserve that span, while a dedicated refrigerator
    // wall cabinet may deliberately share it above the appliance.
    if (layer === "wall") return pl === "wall" || isRangeHoodPlacement(item) || (reserveUpperZone && isRefrigerator(item));
    // base/appliance share the floor layer
    return pl === "base" || pl === "appliance";
  };
  for (const p of placed) {
    // Island-face cabinets are attached to the island's own perimeter. Their
    // plan footprint can be nearer to a room wall than the island's outline,
    // but they are never members of a room-wall run and must not shorten a
    // Wall mode opening or its remaining-clearance display.
    if (p.islandFace) continue;
    if (!blocksThisLayer(p)) continue;
    // Ordinary cabinets belong only to their oriented wall. A true room-corner
    // footprint (lazy Susan/easy reach, diagonal corner, or corner drawer)
    // physically reserves both wall legs, however. Include that footprint on
    // the adjoining wall so a catalog click/drop starts at the corner's actual
    // edge instead of being created inside it and rejected as a full overlap.
    const assignedWall = cabinetWall(p, room);
    const cornerKind = placedCornerGeometryKind(p);
    const assignedCustomWall = room.customWalls?.find((wall) => wall.id === assignedWall);
    const targetCustomWall = customRoomWall
      ? room.customWalls?.find((wall) => wall.id === side)
      : undefined;
    const sharedCustomVertex = assignedCustomWall && targetCustomWall
      ? [assignedCustomWall.startVertexId, assignedCustomWall.endVertexId].find((vertexId) => (
        vertexId === targetCustomWall.startVertexId || vertexId === targetCustomWall.endVertexId
      ))
      : undefined;
    const seatedAtSharedCustomVertex = (() => {
      if (!sharedCustomVertex || !assignedCustomWall) return false;
      const sourceLength = wallLength(assignedWall, room);
      const sourceStart = wallRunOffset(p, assignedWall, room);
      const sourceEnd = sourceStart + wallRunSpan(p, assignedWall, room);
      return sharedCustomVertex === assignedCustomWall.startVertexId
        ? sourceStart <= 2
        : sourceEnd >= sourceLength - 2;
    })();
    const reservesAdjoiningWall = (
      cornerKind === "l-shape" ||
      cornerKind === "diagonal" ||
      cornerKind === "corner-drawer"
    ) && (isAgainstWall(p, side, room) || seatedAtSharedCustomVertex);
    // Explicit custom runs normally contain only their own cabinets. A true
    // corner cabinet is the intentional exception: it physically consumes both
    // adjoining wall legs, including two continuous-wall segments.
    if (explicitRun && assignedWall !== side && !reservesAdjoiningWall) continue;
    if (assignedWall !== side && !reservesAdjoiningWall) continue;
    if (assignedWall !== side && reservesAdjoiningWall && targetCustomWall && sharedCustomVertex) {
      const footprint = placedFootprint(p);
      // The next unit must butt the corner's exposed outer edge. The apparent
      // 12-inch L notch is interior access space, not a valid parallel cabinet
      // run. Reserve the full 36-inch LSB36/ERB36 outer envelope, matching the
      // physical-body collision test below.
      const adjacentLeg = cornerKind === "l-shape"
        ? Math.max(0, footprint.w)
        : Math.min(footprint.w, footprint.d);
      const targetStartsAtSharedVertex = sharedCustomVertex === targetCustomWall.startVertexId;
      if (targetStartsAtSharedVertex) {
        blocked.push({ s: 0, e: Math.min(wallLen, adjacentLeg) });
      } else {
        blocked.push({ s: Math.max(0, wallLen - adjacentLeg), e: wallLen });
      }
      continue;
    }
    // A raised short bridge above a sink/window can share the plan projection
    // with a neighboring upper only when its elevation band is genuinely
    // separate. Same-height uppers still reserve their run as before.
    if (layer === "wall" && candidate && p.placement === "wall") {
      const candidateBox = elevationBox(candidate, room);
      const placedBox = elevationBox(p, room);
      const verticallySeparate =
        candidateBox.bottom >= placedBox.bottom + placedBox.height - 0.01 ||
        placedBox.bottom >= candidateBox.bottom + candidateBox.height - 0.01;
      if (verticallySeparate) continue;
    }
    const s = assignedWall !== side && reservesAdjoiningWall ? placedFootprint(p) : rotatedSize(p);
    const start = explicitRun ? wallRunOffset(p, side, room) : horizontal ? p.x : p.y;
    const span = explicitRun ? wallRunSpan(p, side, room) : horizontal ? s.w : s.d;
    blocked.push({ s: start, e: start + span });
  }

  // Openings on this wall (a door/window interrupts the run at its position).
  // Pad by openingClearance on both sides so wall cabinets keep their distance.
  for (const o of openings) {
    if (o.side !== side) continue;
    if (candidate && wallCabinetClearsWindow(candidate, o, room, openingClearance)) continue;
    blocked.push({
      s: Math.max(wallStart, o.offset - openingClearance),
      e: Math.min(wallEnd, o.offset + o.width + openingClearance),
    });
  }

  // Merge overlapping/touching blocked intervals.
  blocked.sort((a, b) => a.s - b.s);
  const merged: { s: number; e: number }[] = [];
  for (const rawBlock of blocked) {
    const b = { s: Math.max(wallStart, rawBlock.s), e: Math.min(wallEnd, rawBlock.e) };
    if (b.e <= b.s + COLLISION_EPSILON_IN) continue;
    const last = merged[merged.length - 1];
    if (last && b.s <= last.e + 0.01) {
      last.e = Math.max(last.e, b.e);
    } else {
      merged.push({ ...b });
    }
  }

  // The free segments are the gaps between merged blocks (and the ends).
  const segments: WallSegment[] = [];
  let cursor = wallStart;
  for (const b of merged) {
    const gap = b.s - cursor;
    if (gap >= minLen) segments.push({ start: cursor, length: Math.round(gap * 100) / 100 });
    cursor = Math.max(cursor, b.e);
  }
  const tail = wallEnd - cursor;
  if (tail >= minLen) segments.push({ start: cursor, length: Math.round(tail * 100) / 100 });

  return segments;
}

/**
 * Resolves a palette-added cabinet to the next position in its selected-wall
 * run. Floor items (base/appliance/tall) and wall items keep independent
 * left-to-right cursors, while tall cabinets reserve both layers. We never
 * back-fill an earlier gap after a run has started: the newly chosen cabinet
 * belongs immediately after the rightmost item in its layer, advancing past a
 * door/window only when the required opening clearance interrupts that run.
 * Returning null is intentional; the caller must preserve the existing plan.
 */
export function paletteActiveWallPlacement(
  side: WallSide,
  room: RoomData,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  width: number,
  depth: number,
  placement: Placement,
  reserveFullHeightAppliances = false,
): { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number } | null {
  // A selected peninsula is a compact work run, not a wall users should have
  // to manually nudge around. Find the first genuinely clear physical location
  // across every nearby cabinet body, then return the exact saved run metadata.
  if (peninsulaRunById(room, side)) {
    return firstCollisionFreePeninsulaPlacement(side, room, placed, width, depth, placement);
  }
  const segments = freeSegmentsOnWall(
    side,
    room,
    placed,
    openings,
    Math.min(width, 9),
    placement === "wall" ? WALL_OPENING_CLEARANCE_IN : 0,
    placement,
    reserveFullHeightAppliances,
  );
  // Work from the selected wall's visible left edge toward its right edge. A
  // later tall cabinet or prior intentional gap must not push the next cabinet
  // beyond a perfectly valid earlier opening. Narrow segments are skipped, but
  // the first segment that can contain the requested cabinet is authoritative.
  const segment = segments.find((candidate) => candidate.length + 0.001 >= width);
  if (segment) return wallPlacementAt(segment.start, width, depth, side, room);
  return null;
}

/**
 * Resolves a seated-work knee drawer only into a real clear base-cabinet void.
 * Its shallow box is wall-flush, but it must never be auto-placed over a base
 * cabinet that occupies the same physical knee-space elevation.
 */
export function kneeDrawerWallPlacement(
  side: WallSide,
  room: RoomData,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  width: number,
  depth: number,
): { x: number; y: number; rotation: number } | null {
  const segments = freeSegmentsOnWall(side, room, placed, openings, Math.min(width, 9), 0, "base");
  const segment = segments.find((candidate) => candidate.length + COLLISION_EPSILON_IN >= width);
  return segment ? wallPlacementAt(segment.start, width, depth, side, room) : null;
}

export type AlternateWallPlacementRecommendation = {
  side: WallSide;
  spot: { x: number; y: number; rotation: number };
  availableLength: number;
};

/**
 * When the active wall is full, find the most economical clear opening on a
 * different room wall. It reuses the authoritative layer, opening-clearance,
 * full-height-appliance, and exact wall-placement rules; it does not move any
 * existing cabinet or create a candidate that overlaps the plan.
 */
export function alternateWallPlacementRecommendation(
  activeWall: WallSide,
  room: RoomData,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  width: number,
  depth: number,
  placement: Placement,
  reserveFullHeightAppliances = false,
): AlternateWallPlacementRecommendation | null {
  // A Continuous Wall Builder room uses its explicit connected segments as the
  // only real room walls. The rectangular width/depth bounds exist only to size
  // the canvas; recommending one of those invisible graph edges can place a
  // cabinet completely outside the user's drawn room.
  const orderedWalls: WallSide[] = room.customWalls?.length
    ? [
        ...room.customWalls.map((wall) => wall.id as WallSide),
        ...(room.peninsulaRuns ?? []).map((run) => run.id as WallSide),
      ]
    : ["top", "bottom", "left", "right"];
  const options = orderedWalls.flatMap((side, order) => {
    if (side === activeWall) return [];
    const spot = paletteActiveWallPlacement(
      side,
      room,
      placed,
      openings,
      width,
      depth,
      placement,
      reserveFullHeightAppliances,
    );
    if (!spot) return [];
    const availableLength = freeSegmentsOnWall(
      side,
      room,
      placed,
      openings,
      Math.min(width, 9),
      placement === "wall" ? WALL_OPENING_CLEARANCE_IN : 0,
      placement,
      reserveFullHeightAppliances,
    ).find((segment) => segment.length + 0.001 >= width)?.length;
    if (availableLength == null) return [];
    return [{ side, spot, availableLength, order }];
  });
  options.sort((left, right) => {
    const leftRemainder = left.availableLength - width;
    const rightRemainder = right.availableLength - width;
    return leftRemainder - rightRemainder || left.order - right.order;
  });
  const best = options[0];
  return best ? { side: best.side, spot: best.spot, availableLength: best.availableLength } : null;
}

/**
 * Resolves a floor/tall cabinet into an open run immediately beside an existing
 * refrigerator enclosure.  Refrigerator end panels extend the protected bay,
 * so an adjacent cabinet never overlaps the appliance or a selected panel.
 * The nearest exact opening is preferred; any final remainder is intentionally
 * left to the existing measured small-gap filler flow after placement.
 */
export function refrigeratorAdjacentOpeningPlacement(
  side: WallSide,
  room: RoomData,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  width: number,
  depth: number,
  placement: Placement,
): { x: number; y: number; rotation: number } | null {
  if (placement !== "base" && placement !== "tall") return null;
  const horizontal = side === "top" || side === "bottom";
  const segments = freeSegmentsOnWall(side, room, placed, openings, width, 0, placement);
  const choices: Array<{ start: number; remainder: number }> = [];
  for (const refrigerator of placed.filter((item) => isRefrigerator(item) && cabinetWall(item, room) === side)) {
    const assembly = [refrigerator, ...placed.filter((item) => refrigeratorAssemblyMemberRole(item, refrigerator, room) !== null)];
    const bounds = assembly.reduce(
      (current, item) => {
        const footprint = placedFootprint(item);
        const itemStart = horizontal ? item.x : item.y;
        const itemSpan = horizontal ? footprint.w : footprint.d;
        return { start: Math.min(current.start, itemStart), end: Math.max(current.end, itemStart + itemSpan) };
      },
      { start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY },
    );
    for (const segment of segments) {
      if (segment.length + COLLISION_EPSILON_IN < width) continue;
      const segmentEnd = segment.start + segment.length;
      if (Math.abs(segmentEnd - bounds.start) <= COLLISION_EPSILON_IN) {
        choices.push({ start: segmentEnd - width, remainder: segment.length - width });
      }
      if (Math.abs(segment.start - bounds.end) <= COLLISION_EPSILON_IN) {
        choices.push({ start: segment.start, remainder: segment.length - width });
      }
    }
  }
  if (choices.length === 0) return null;
  choices.sort((left, right) => left.remainder - right.remainder || left.start - right.start);
  return wallPlacementAt(choices[0].start, width, depth, side, room);
}

/**
 * Catalog-added true corner cabinets belong at a real room corner, not at the
 * first open point in a straight wall run. Starting from the active wall, test
 * all four corners in clockwise room order and return the first exact physical
 * footprint that has zero overlap with every existing item (including hoods).
 */
/**
 * Seats a square-corner body at an explicit measured vertex.  A corner cabinet
 * has two back legs, so its angle cannot be taken from whichever incident wall
 * happened to be selected: that can align one leg while turning the other into
 * the room.  Instead, derive its local +X/+Y axes from both rays leaving the
 * shared vertex.  The returned coordinates remain the axis-aligned bounding-box
 * origin used by saved plan placements and the 3D renderer.
 */
export function customWallTrueCornerPlacement(
  moving: PlacedCabinet,
  firstWall: NonNullable<RoomData["customWalls"]>[number],
  secondWall: NonNullable<RoomData["customWalls"]>[number],
  vertexId: string,
  room: RoomData,
): { x: number; y: number; rotation: number; wallId: string; wallOffset: number } | null {
  if (!room.vertices?.length) return null;
  const vertex = room.vertices.find((candidate) => candidate.id === vertexId);
  if (!vertex) return null;
  const rayFor = (wall: typeof firstWall) => {
    const otherId = wall.startVertexId === vertexId
      ? wall.endVertexId
      : wall.endVertexId === vertexId
        ? wall.startVertexId
        : null;
    const other = otherId ? room.vertices!.find((candidate) => candidate.id === otherId) : null;
    if (!other) return null;
    const dx = other.x - vertex.x;
    const dy = other.y - vertex.y;
    const length = Math.hypot(dx, dy);
    return length > COLLISION_EPSILON_IN ? { x: dx / length, y: dy / length } : null;
  };
  const firstRay = rayFor(firstWall);
  const secondRay = rayFor(secondWall);
  if (!firstRay || !secondRay) return null;

  // `firstRay × secondRay` determines which wall can be local +X without
  // mirroring the physical L/diagonal cabinet body.  Swap the incident walls
  // when necessary; both are the same true corner, but this keeps the second
  // leg on its actual wall for V-shaped/diagonal room layouts.
  const cross = firstRay.x * secondRay.y - firstRay.y * secondRay.x;
  if (Math.abs(Math.abs(cross) - 1) > 1e-5) return null;
  const primaryWall = cross > 0 ? firstWall : secondWall;
  const primaryRay = cross > 0 ? firstRay : secondRay;
  const secondaryRay = cross > 0 ? secondRay : firstRay;
  const physical = placedFootprint(moving);
  const bodyWidth = Math.max(0, physical.w);
  const bodyDepth = Math.max(0, physical.d);
  if (bodyWidth <= COLLISION_EPSILON_IN || bodyDepth <= COLLISION_EPSILON_IN) return null;

  // A local top-left corner is the cabinet's shared wall vertex.  Its two local
  // positive axes are the two real incident wall rays; translate the resulting
  // rotated body back to the persisted AABB origin.
  const center = {
    x: vertex.x + primaryRay.x * bodyWidth / 2 + secondaryRay.x * bodyDepth / 2,
    y: vertex.y + primaryRay.y * bodyWidth / 2 + secondaryRay.y * bodyDepth / 2,
  };
  const boundWidth = Math.abs(primaryRay.x * bodyWidth) + Math.abs(secondaryRay.x * bodyDepth);
  const boundDepth = Math.abs(primaryRay.y * bodyWidth) + Math.abs(secondaryRay.y * bodyDepth);
  const primaryLength = polygonWallSegmentLength(primaryWall, room.vertices);
  const wallOffset = primaryWall.startVertexId === vertexId
    ? 0
    : Math.max(0, primaryLength - bodyWidth);
  const rotation = ((Math.round(Math.atan2(primaryRay.y, primaryRay.x) * 180 / Math.PI) % 360) + 360) % 360;
  return {
    x: center.x - boundWidth / 2,
    y: center.y - boundDepth / 2,
    rotation,
    wallId: primaryWall.id,
    wallOffset,
  };
}

export function nextAvailableRoomCornerPlacement(
  moving: PlacedCabinet,
  activeWall: WallSide,
  room: RoomData,
  placed: readonly PlacedCabinet[],
  nearPoint?: { x: number; y: number },
): { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number } | null {
  // A direct drag can nominate a nearby corner. Limit that gesture to the
  // cabinet's own footprint plus a forgiving 24-inch target halo so dropping
  // near one corner never relocates a cabinet to an unrelated open corner.
  const nearPointTolerance = nearPoint
    ? Math.max(24, Math.max(Number(moving.width) || 0, Number(moving.depth) || 0) + 24)
    : Number.POSITIVE_INFINITY;
  // An explicit wall graph is authoritative.  Older saved Continuous Wall
  // Builder plans can predate both `openWallPath` and a persisted wall height;
  // treating those plans as a rectangular room makes a corner cabinet snap to
  // an invisible canvas edge instead of to two real measured walls. Beginner
  // Room Shapes remain on the rectangle path because they do not carry explicit
  // vertices/customWalls at all.
  const hasExplicitMeasuredWallPath = Boolean(room.vertices?.length && room.customWalls?.length);
  // ERB/L/diagonal corner products are physically square corner envelopes even
  // when a catalog line stores a shallow straight-run depth. Resolve a real
  // custom-wall vertex using that physical footprint so its corner reaches the
  // shared measured-wall point rather than visibly floating alongside it.
  const physicalFootprint = placedFootprint(moving);
  // Seat a true
  // corner cabinet on an open *real* right-angle vertex rather than dropping it
  // into a graph-square corner. This must not be limited to cardinal walls:
  // users can draw a 90° corner with two diagonals, and it is still a normal
  // flush 90° cabinet corner (not an 11-inch 45° peninsula clearance).
  if (hasExplicitMeasuredWallPath && room.vertices?.length && room.customWalls?.length) {
    const orderedWalls = [
      ...room.customWalls.filter((wall) => wall.id === activeWall),
      ...room.customWalls.filter((wall) => wall.id !== activeWall),
    ];
    for (const wall of orderedWalls) {
      const angle = polygonWallAngle(wall, room.vertices);
      const endpoints = [...(["start", "end"] as const)].sort((left, right) => {
        if (!nearPoint) return 0;
        const leftVertexId = left === "start" ? wall.startVertexId : wall.endVertexId;
        const rightVertexId = right === "start" ? wall.startVertexId : wall.endVertexId;
        const leftVertex = room.vertices!.find((vertex) => vertex.id === leftVertexId);
        const rightVertex = room.vertices!.find((vertex) => vertex.id === rightVertexId);
        const leftDistance = leftVertex ? Math.hypot(leftVertex.x - nearPoint.x, leftVertex.y - nearPoint.y) : Number.POSITIVE_INFINITY;
        const rightDistance = rightVertex ? Math.hypot(rightVertex.x - nearPoint.x, rightVertex.y - nearPoint.y) : Number.POSITIVE_INFINITY;
        return leftDistance - rightDistance;
      });
      for (const endpoint of endpoints) {
        const vertexId = endpoint === "start" ? wall.startVertexId : wall.endVertexId;
        const vertex = room.vertices.find((candidate) => candidate.id === vertexId);
        if (nearPoint && (!vertex || Math.hypot(vertex.x - nearPoint.x, vertex.y - nearPoint.y) > nearPointTolerance)) continue;
        // A wall can have more than one neighbor after an edit/split. Select an
        // actual perpendicular neighbor, rather than accepting the first
        // collinear segment and incorrectly abandoning an otherwise valid 90°
        // corner.
        const adjoining = room.customWalls.find((candidate) => candidate.id !== wall.id
          && (candidate.startVertexId === vertexId || candidate.endVertexId === vertexId)
          && Math.abs(Math.cos(angle - polygonWallAngle(candidate, room.vertices!))) <= 1e-6);
        if (!adjoining) continue;
        const spot = customWallTrueCornerPlacement(moving, wall, adjoining, vertexId, room);
        if (!spot) continue;
        const candidate = { ...moving, ...spot };
        // Include the custom-wall corner reservation, so a B12 cannot occupy
        // the adjoining ERB leg merely because their plan AABBs meet cleanly.
        if (!cabinetPlacementCollisionDetail(candidate, [...placed], room)) return spot;
      }
    }
    // Continuous-wall rooms have no invisible graph-square corners. If no
    // measured right-angle vertex is open, report no corner rather than falling
    // through to a fake rectangular boundary.
    return null;
  }
  const footprint = physicalFootprint;
  const corners = [
    { x: 0, y: 0 },
    { x: Math.max(0, room.width - footprint.w), y: 0 },
    { x: Math.max(0, room.width - footprint.w), y: Math.max(0, room.depth - footprint.d) },
    { x: 0, y: Math.max(0, room.depth - footprint.d) },
  ];
  const orderByWall: Record<WallSide, number[]> = {
    top: [0, 1, 2, 3],
    right: [1, 2, 3, 0],
    bottom: [3, 2, 1, 0],
    left: [0, 3, 2, 1],
  };
  // A legacy polygon may expose a custom wall id before it is classified as a
  // continuous-wall room. Keep its old rectangular fallback safe rather than
  // indexing the cardinal-wall order with that id.
  const standardActiveWall = activeWall === "top" || activeWall === "right" || activeWall === "bottom" || activeWall === "left"
    ? activeWall
    : "top";
  const orderedCornerIndexes = nearPoint
    ? [...orderByWall[standardActiveWall]].sort((left, right) => {
        const leftCorner = corners[left];
        const rightCorner = corners[right];
        return Math.hypot(leftCorner.x - nearPoint.x, leftCorner.y - nearPoint.y)
          - Math.hypot(rightCorner.x - nearPoint.x, rightCorner.y - nearPoint.y);
      })
    : orderByWall[standardActiveWall];
  for (const index of orderedCornerIndexes) {
    const corner = corners[index];
    if (nearPoint && Math.hypot(corner.x - nearPoint.x, corner.y - nearPoint.y) > nearPointTolerance) continue;
    const unrotated = { ...moving, ...corner };
    const candidate = { ...unrotated, rotation: cornerRotationForPlaced(unrotated, room) };
    if (!hasCollision(candidate, [...placed])) return { x: candidate.x, y: candidate.y, rotation: candidate.rotation };
  }
  return null;
}

/**
 * Finds an unoccupied true 90-degree corner on the selected peninsula path.
 * A primary peninsula leaves its parent wall at a square corner; a connected
 * 90-degree return creates another square corner at its start. These are real
 * cabinet corners, not generic room-edge guesses. Acute 45-degree joins stay
 * excluded because their installer clearance is not an ERB/LS/diagonal-cabinet
 * envelope.
 */
export function nextAvailablePeninsulaCornerPlacement(
  moving: PlacedCabinet,
  activeRunId: WallSide,
  room: RoomData,
  placed: readonly PlacedCabinet[],
  nearPoint?: { x: number; y: number },
): { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number; peninsulaSide?: PeninsulaCabinetSide } | null {
  const activeRun = peninsulaRunById(room, activeRunId);
  if (!activeRun) return null;
  const footprint = placedFootprint(moving);
  const requiredLeg = Math.max(footprint.w, footprint.d);
  const tolerance = nearPoint
    ? Math.max(24, requiredLeg + 24)
    : Number.POSITIVE_INFINITY;
  const allRuns = room.peninsulaRuns ?? [];
  const candidateRuns = [
    // A primary run always meets its parent wall at a true 90-degree corner.
    ...(!activeRun.parentRunId || activeRun.turn === 90 ? [activeRun] : []),
    // A selected parent run may also expose its direct 90-degree return.
    ...allRuns.filter((candidate) => candidate.parentRunId === activeRun.id && candidate.turn === 90),
  ].filter((candidate, index, candidates) => candidates.findIndex((other) => other.id === candidate.id) === index);

  const ordered = [...candidateRuns].sort((left, right) => {
    if (!nearPoint) return 0;
    const leftPoint = peninsulaRunEndpoints(left, room).start;
    const rightPoint = peninsulaRunEndpoints(right, room).start;
    return Math.hypot(leftPoint.x - nearPoint.x, leftPoint.y - nearPoint.y)
      - Math.hypot(rightPoint.x - nearPoint.x, rightPoint.y - nearPoint.y);
  });
  for (const run of ordered) {
    const joint = peninsulaRunEndpoints(run, room).start;
    if (nearPoint && Math.hypot(joint.x - nearPoint.x, joint.y - nearPoint.y) > tolerance) continue;
    // Use the real L-corner box—not the supplier's sometimes-shallow ERB depth—
    // so both legs seat flush at the shared peninsula joint.
    const spot = wallPlacementAt(0, requiredLeg, requiredLeg, run.id as WallSide, room, run.cabinetSide);
    const candidate: PlacedCabinet = { ...moving, ...spot };
    if (!cabinetPlacementCollisionDetail(candidate, [...placed], room)) return spot;
  }
  return null;
}

export type CabinetCornerPlacementInfo = {
  angle: 45 | 90;
  placement: "flush" | "clearance";
  clearanceIn: number;
};

/**
 * Describes a cabinet seated at a measured corner endpoint. Both the placement
 * confirmation and plan badge use this helper so a flush 90° corner can never
 * be described as an 11-inch clearance placement.
 */
export function cabinetCornerPlacementInfo(
  cabinet: PlacedCabinet,
  room: RoomData,
): CabinetCornerPlacementInfo | null {
  const side = cabinet.wallId ?? cabinetWall(cabinet, room);
  const run = peninsulaRunById(room, side as WallSide);
  if (run) {
    const length = Math.max(0, Number(run.length) || 0);
    const offset = Math.max(0, Number(cabinet.wallOffset) || 0);
    const startClearance = peninsulaRunHas45StartInsideCornerClearance(run)
      ? PENINSULA_INSIDE_CORNER_CLEARANCE_IN
      : 0;
    const endClearance = peninsulaRunHas45EndInsideCornerClearance(run, room)
      ? PENINSULA_INSIDE_CORNER_CLEARANCE_IN
      : 0;
    const nearStart = offset <= startClearance + COLLISION_EPSILON_IN;
    const nearEnd = offset + Math.max(0, Number(cabinet.width) || 0) >= length - endClearance - COLLISION_EPSILON_IN;
    if (!nearStart && !nearEnd) return null;
    const has45Clearance = (nearStart && peninsulaRunHas45StartInsideCornerClearance(run))
      || (nearEnd && peninsulaRunHas45EndInsideCornerClearance(run, room));
    return has45Clearance
      ? { angle: 45, placement: "clearance", clearanceIn: PENINSULA_INSIDE_CORNER_CLEARANCE_IN }
      : { angle: 90, placement: "flush", clearanceIn: 0 };
  }

  const customWalls = room.customWalls;
  const wall = customWalls?.find((candidate) => candidate.id === side);
  if (!wall || !customWalls || !room.vertices || cabinet.wallOffset == null) return null;
  const length = polygonWallSegmentLength(wall, room.vertices);
  const offset = Math.max(0, Number(cabinet.wallOffset) || 0);
  const endpoint = offset <= COLLISION_EPSILON_IN
    ? wall.startVertexId
    : offset + Math.max(0, Number(cabinet.width) || 0) >= length - COLLISION_EPSILON_IN
      ? wall.endVertexId
      : null;
  if (!endpoint) return null;
  const adjoining = customWalls.find((candidate) => candidate.id !== wall.id && (
    candidate.startVertexId === endpoint || candidate.endVertexId === endpoint
  ));
  if (!adjoining) return null;
  const wallAngle = polygonWallAngle(wall, room.vertices);
  const adjoiningAngle = polygonWallAngle(adjoining, room.vertices);
  const dotMagnitude = Math.abs(Math.cos(wallAngle - adjoiningAngle));
  if (dotMagnitude <= 1e-6) return { angle: 90, placement: "flush", clearanceIn: 0 };
  const diagonal = Math.abs(dotMagnitude - Math.SQRT1_2) <= 1e-6;
  return diagonal ? { angle: 45, placement: "flush", clearanceIn: 0 } : null;
}

/**
 * Identifies a blind corner cabinet that is locked to a real corner endpoint.
 * Blind bases are rectangular—not L-shaped—but their physical body and required
 * filler reserve the adjoining run. Keep this separate from true-corner geometry
 * so BBC42 receives confirmation feedback without changing its 42 by 24 footprint.
 */
export function blindCornerSnapInfo(
  cabinet: PlacedCabinet,
  room: RoomData,
): CabinetCornerPlacementInfo | null {
  if (!isBlindCorner(cabinet.masterCode, cabinet.description)) return null;
  const side = (cabinet.wallId ?? cabinetWall(cabinet, room)) as WallSide;
  const length = wallLength(side, room);
  if (length <= COLLISION_EPSILON_IN) return null;
  const offset = cabinet.wallOffset != null
    ? Math.max(0, Number(cabinet.wallOffset) || 0)
    : wallRunOffset(cabinet, side, room);
  const span = wallRunSpan(cabinet, side, room);
  const atStart = offset <= COLLISION_EPSILON_IN;
  const atEnd = offset + span >= length - COLLISION_EPSILON_IN;
  if (!atStart && !atEnd) return null;

  const wall = room.customWalls?.find((candidate) => candidate.id === side);
  if (wall && room.vertices) {
    const endpoint = atStart ? wall.startVertexId : wall.endVertexId;
    const hasAdjoiningWall = room.customWalls?.some((candidate) => candidate.id !== wall.id && (
      candidate.startVertexId === endpoint || candidate.endVertexId === endpoint
    ));
    if (!hasAdjoiningWall) return null;
  }
  return { angle: 90, placement: "flush", clearanceIn: 0 };
}

/**
 * Resolve the exposed BBC/WBC door side from its physical corner. Blind bases
 * may be stored flush to the wall endpoint or pulled 3–6 inches off it, so a
 * saved `swing` alone is not authoritative. The door must always face away from
 * the blind side: a start-side/left corner exposes the right door and an
 * end-side/right corner exposes the left door.
 */
export function blindCornerDoorSide(
  cabinet: PlacedCabinet,
  room: RoomData,
): "left" | "right" | null {
  if (!isBlindCorner(cabinet.masterCode, cabinet.description)) return null;
  const side = (cabinet.wallId ?? cabinetWall(cabinet, room)) as WallSide;
  const length = wallLength(side, room);
  if (length <= COLLISION_EPSILON_IN) return null;
  const offset = cabinet.wallOffset != null
    ? Math.max(0, Number(cabinet.wallOffset) || 0)
    : wallRunOffset(cabinet, side, room);
  const span = wallRunSpan(cabinet, side, room);
  const pullAllowance = blindPullRange(cabinet)?.max ?? 6;
  const atStart = offset <= pullAllowance + COLLISION_EPSILON_IN;
  const atEnd = offset + span >= length - pullAllowance - COLLISION_EPSILON_IN;
  if (atStart === atEnd) return null;
  return atStart ? "right" : "left";
}

/** Apply the physical BBC/WBC door side to restored placements. */
export function normalizeBlindCornerDoorSides(
  placed: PlacedCabinet[],
  room: RoomData,
): PlacedCabinet[] {
  let changed = false;
  const next = placed.map((cabinet) => {
    const swing = blindCornerDoorSide(cabinet, room);
    if (!swing || cabinet.swing === swing) return cabinet;
    changed = true;
    return { ...cabinet, swing };
  });
  return changed ? next : placed;
}

/**
 * Keeps a newly sequenced wall cabinet on the finished top line of the cabinet
 * it directly touches. This is essential for short uppers such as W-30-24:
 * their bottom changes with height, but the visible run top remains continuous.
 */
export function adjoiningWallRunMountBottom(
  cabinet: PlacedCabinet,
  room: RoomData,
  placed: PlacedCabinet[],
): number | null {
  if (cabinet.placement !== "wall" || isStacker(cabinet)) return null;
  const side = cabinetWall(cabinet, room);
  const horizontal = side === "top" || side === "bottom";
  const footprint = placedFootprint(cabinet);
  const start = horizontal ? cabinet.x : cabinet.y;
  const end = start + (horizontal ? footprint.w : footprint.d);
  const peers = placed.filter((peer) => peer.placement === "wall" && !isStacker(peer) && cabinetWall(peer, room) === side);
  const previous = peers
    .map((peer) => {
      const peerFootprint = placedFootprint(peer);
      const peerStart = horizontal ? peer.x : peer.y;
      const peerEnd = peerStart + (horizontal ? peerFootprint.w : peerFootprint.d);
      return { peer, edgeDistance: Math.abs(start - peerEnd) };
    })
    .filter(({ edgeDistance }) => edgeDistance <= CABINET_SEAM_SNAP_IN + 1e-9)
    .sort((a, b) => a.edgeDistance - b.edgeDistance)[0]?.peer;
  const next = previous ? null : peers
    .map((peer) => {
      const peerStart = horizontal ? peer.x : peer.y;
      return { peer, edgeDistance: Math.abs(peerStart - end) };
    })
    .filter(({ edgeDistance }) => edgeDistance <= CABINET_SEAM_SNAP_IN + 1e-9)
    .sort((a, b) => a.edgeDistance - b.edgeDistance)[0]?.peer;
  const neighbor = previous ?? next;
  if (!neighbor) return null;
  const neighborBox = elevationBox(neighbor, room);
  return Math.max(0, neighborBox.bottom + neighborBox.height - placedHeight(cabinet));
}


// ─── Auto-dimensioning ─────────────────────────────────────────────────────────
// Returns an array of dimension segments for a wall: each cabinet’s width and
// each gap between cabinets (or between cabinet and wall end). Used to render
// a full chain of dimension lines along the wall in the plan view.
export interface DimensionSeg {
  start: number; // run-axis start (inches)
  length: number; // segment length (inches)
  kind: "cabinet" | "gap"; // whether this is a cabinet span or empty gap
  label: string; // display label (e.g. "B15" or gap width)
}

export function wallDimensions(
  side: WallSide,
  room: RoomData,
  placed: PlacedCabinet[],
  layer: "base" | "wall" = "base"
): DimensionSeg[] {
  const horizontal = side === "top" || side === "bottom";
  const retainedWall = cabinetWallRunSegment(side, room);
  const wallStart = retainedWall.start;
  const wallEnd = retainedWall.start + retainedWall.length;
  // Collect cabinets on this wall + layer, sorted by run-axis start.
  const onWall = placed
    .filter((p) => {
      if (layer === "wall") { if (p.placement !== "wall" && p.placement !== "tall") return false; }
      else { if (p.placement !== "base" && p.placement !== "appliance" && p.placement !== "tall") return false; }
      return isAgainstWall(p, side, room);
    })
    .map((p) => {
      const { w, d } = rotatedSize(p);
      const start = horizontal ? p.x : p.y;
      const span = horizontal ? w : d;
      return { start, span, code: p.masterCode ?? "" };
    })
    .filter((item) => item.start + item.span > wallStart + COLLISION_EPSILON_IN && item.start < wallEnd - COLLISION_EPSILON_IN)
    .sort((a, b) => a.start - b.start);

  const segs: DimensionSeg[] = [];
  let cursor = wallStart;
  for (const c of onWall) {
    const gapLen = c.start - cursor;
    if (gapLen > 0.25) {
      segs.push({ start: cursor, length: gapLen, kind: "gap", label: formatInches(gapLen) });
    }
    segs.push({ start: c.start, length: c.span, kind: "cabinet", label: c.code ? `${c.code} (${formatInches(c.span)})` : formatInches(c.span) });
    cursor = c.start + c.span;
  }
  const tail = wallEnd - cursor;
  if (tail > 0.25) {
    segs.push({ start: cursor, length: tail, kind: "gap", label: formatInches(tail) });
  }
  return segs;
}

// Convert a run-axis coordinate on a wall into the {x, y, rotation} a placed
// cabinet needs. `along` is the run-axis start (X for top/bottom, Y for left/
// right); the perpendicular coordinate is pinned to the wall.
export function wallPlacementAt(
  along: number,
  width: number,
  depth: number,
  side: WallSide,
  room: RoomData,
  requestedPeninsulaSide?: PeninsulaCabinetSide | null,
  clampToRun = true,
): { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number; peninsulaSide?: PeninsulaCabinetSide } {
  const peninsula = peninsulaRunById(room, side);
  if (peninsula) {
    const { start, radians } = peninsulaRunEndpoints(peninsula, room);
    const length = Math.max(6, peninsula.length);
    const offset = clampToRun
      ? Math.max(0, Math.min(Math.max(0, length - width), along))
      : along;
    const tangent = { x: Math.cos(radians), y: Math.sin(radians) };
    const leftNormal = { x: -Math.sin(radians), y: Math.cos(radians) };
    const peninsulaSide = requestedPeninsulaSide ?? peninsula.cabinetSide ?? "left";
    const faceNormal = peninsulaSide === "left"
      ? leftNormal
      : { x: -leftNormal.x, y: -leftNormal.y };
    const center = {
      x: start.x + tangent.x * (offset + width / 2) + faceNormal.x * (depth / 2),
      y: start.y + tangent.y * (offset + width / 2) + faceNormal.y * (depth / 2),
    };
    const boundWidth = Math.abs(width * tangent.x) + Math.abs(depth * faceNormal.x);
    const boundDepth = Math.abs(width * tangent.y) + Math.abs(depth * faceNormal.y);
    return {
      x: center.x - boundWidth / 2,
      y: center.y - boundDepth / 2,
      // A cabinet's back must meet the selected face of the line. Flipping the
      // right face by 180° keeps its front facing away from the peninsula wall.
      rotation: ((Math.round(((radians + (peninsulaSide === "right" ? Math.PI : 0)) * 180) / Math.PI) % 360) + 360) % 360,
      wallId: peninsula.id,
      wallOffset: offset,
      peninsulaSide,
    };
  }
  const customWall = room.customWalls?.find((wall) => wall.id === side);
  if (customWall && room.vertices) {
    const start = room.vertices.find((vertex) => vertex.id === customWall.startVertexId);
    if (start) {
      const length = polygonWallSegmentLength(customWall, room.vertices);
      const offset = clampToRun
        ? Math.max(0, Math.min(Math.max(0, length - width), along))
        : along;
      const radians = polygonWallAngle(customWall, room.vertices);
      const tangent = { x: Math.cos(radians), y: Math.sin(radians) };
      const inward = { x: -Math.sin(radians), y: Math.cos(radians) };
      const center = {
        x: start.x + tangent.x * (offset + width / 2) + inward.x * (depth / 2),
        y: start.y + tangent.y * (offset + width / 2) + inward.y * (depth / 2),
      };
      const boundWidth = Math.abs(width * tangent.x) + Math.abs(depth * inward.x);
      const boundDepth = Math.abs(width * tangent.y) + Math.abs(depth * inward.y);
      const rotation = ((Math.round(radians * 180 / Math.PI) % 360) + 360) % 360;
      return { x: center.x - boundWidth / 2, y: center.y - boundDepth / 2, rotation, wallId: customWall.id, wallOffset: offset };
    }
  }
  const horizontal = side === "top" || side === "bottom";
  const rotation = horizontal ? 0 : 90;
  const retainedWall = cabinetWallRunSegment(side, room);
  const runEnd = retainedWall.start + retainedWall.length;
  const clampedAlong = clampToRun
    ? Math.max(retainedWall.start, Math.min(Math.max(retainedWall.start, runEnd - width), along))
    : along;
  // depth runs into the room from the wall.
  let x = 0;
  let y = 0;
  if (side === "top") { y = 0; x = clampedAlong; }
  else if (side === "bottom") { y = Math.max(0, room.depth - depth); x = clampedAlong; }
  else if (side === "left") { x = 0; y = clampedAlong; }
  else { x = Math.max(0, room.width - depth); y = clampedAlong; }
  return { x, y, rotation };
}

/**
 * Returns the exact measured wall frame even when an architectural member starts
 * just beyond a wall endpoint. Refrigerator fitting uses this for end panels so
 * it can shift the *entire* refrigerator enclosure into the run. Calling the
 * normal clamped helper first silently folded a start-side panel into the
 * refrigerator footprint, leaving it missing after the collision pass.
 */
export function wallPlacementAtUnbounded(
  along: number,
  width: number,
  depth: number,
  side: WallSide,
  room: RoomData,
  requestedPeninsulaSide?: PeninsulaCabinetSide | null,
): { x: number; y: number; rotation: number; wallId?: string; wallOffset?: number; peninsulaSide?: PeninsulaCabinetSide } {
  return wallPlacementAt(along, width, depth, side, room, requestedPeninsulaSide, false);
}

export const CABINET_WALL_AUTO_SNAP_IN = STD.SNAP_THRESHOLD;

/**
 * Seats a cabinet whose back edge is within the magnetic threshold of a room,
 * locked 45-degree, or peninsula wall. The result carries exact wall ownership
 * and rotation and is returned only when the whole run span is clear.
 */
export function autoSnapCabinetToNearbyWall(
  moving: PlacedCabinet,
  room: RoomData,
  others: PlacedCabinet[],
  openings: WallOpening[],
  maximumDistance = CABINET_WALL_AUTO_SNAP_IN,
): PlacedCabinet | null {
  if (moving.islandFace || maximumDistance < 0) return null;
  if (!["base", "wall", "tall", "appliance"].includes(moving.placement)) return null;
  const width = Math.max(0, Number(moving.width) || 0);
  const depth = Math.max(0, Number(moving.depth) || 0);
  if (width <= 0 || depth <= 0) return null;
  const footprint = placedFootprint(moving);
  const center = { x: moving.x + footprint.w / 2, y: moving.y + footprint.d / 2 };
  const candidates: Array<{ side: WallSide; distance: number; alongCenter: number }> = [];

  const addSegment = (
    side: WallSide,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= COLLISION_EPSILON_IN) return;
    const tangent = { x: dx / length, y: dy / length };
    const rawAlong = (center.x - start.x) * tangent.x + (center.y - start.y) * tangent.y;
    const alongCenter = Math.max(0, Math.min(length, rawAlong));
    const nearest = { x: start.x + tangent.x * alongCenter, y: start.y + tangent.y * alongCenter };
    const centerlineDistance = Math.hypot(center.x - nearest.x, center.y - nearest.y);
    const backEdgeDistance = Math.abs(centerlineDistance - depth / 2);
    if (backEdgeDistance <= maximumDistance + COLLISION_EPSILON_IN) {
      candidates.push({ side, distance: backEdgeDistance, alongCenter });
    }
  };

  if (room.vertices && (room.customWalls?.length ?? 0) > 0) {
    for (const wall of room.customWalls ?? []) {
      const start = room.vertices.find((vertex) => vertex.id === wall.startVertexId);
      const end = room.vertices.find((vertex) => vertex.id === wall.endVertexId);
      if (start && end) addSegment(wall.id as WallSide, start, end);
    }
  } else {
    const topWall = cabinetWallRunSegment("top", room);
    const bottomWall = cabinetWallRunSegment("bottom", room);
    const leftWall = cabinetWallRunSegment("left", room);
    const rightWall = cabinetWallRunSegment("right", room);
    addSegment("top", { x: topWall.start, y: 0 }, { x: topWall.start + topWall.length, y: 0 });
    addSegment("bottom", { x: bottomWall.start, y: room.depth }, { x: bottomWall.start + bottomWall.length, y: room.depth });
    addSegment("left", { x: 0, y: leftWall.start }, { x: 0, y: leftWall.start + leftWall.length });
    addSegment("right", { x: room.width, y: rightWall.start }, { x: room.width, y: rightWall.start + rightWall.length });
  }
  for (const run of room.peninsulaRuns ?? []) {
    const endpoints = peninsulaRunEndpoints(run, room);
    addSegment(run.id as WallSide, endpoints.start, endpoints.end);
  }

  for (const candidate of candidates.sort((left, right) => left.distance - right.distance)) {
    const runStart = Math.round((candidate.alongCenter - width / 2) * 8) / 8;
    const spot = wallPlacementAt(
      runStart,
      width,
      depth,
      candidate.side,
      room,
      peninsulaRunById(room, candidate.side)?.cabinetSide,
    );
    const snapped: PlacedCabinet = {
      ...moving,
      ...spot,
      ...(spot.wallId
        ? { wallId: spot.wallId, wallOffset: spot.wallOffset, peninsulaSide: spot.peninsulaSide }
        : { wallId: undefined, wallOffset: undefined, peninsulaSide: undefined }),
    };
    const start = wallRunOffset(snapped, candidate.side, room);
    const clearSpan = freeSegmentsOnWall(candidate.side, room, others, openings, 0, 0, moving.placement, false, snapped)
      .some((segment) => start >= segment.start - COLLISION_EPSILON_IN && start + width <= segment.start + segment.length + COLLISION_EPSILON_IN);
    if (!clearSpan || cabinetPlacementCollisionDetail(snapped, others, room)) continue;
    return snapped;
  }
  return null;
}

/** True when a custom wall has been explicitly locked to one of the v1 diagonals. */
export function isLockedAngledCustomWall(room: RoomData, wallId?: string | null): boolean {
  return Boolean(wallId && room.customWalls?.some((wall) => wall.id === wallId && (wall.lockedAngle === 45 || wall.lockedAngle === -45)));
}

/** True for any explicit wall in a polygon room, including cardinal builder walls. */
export function isCustomRoomWall(room: RoomData, wallId?: string | null): boolean {
  return Boolean(wallId && room.vertices && room.customWalls?.some((wall) => wall.id === wallId));
}

/** Exact run offset, retaining a released cabinet void on every explicit custom run. */
export function wallRunOffset(p: PlacedCabinet, side: string, room: RoomData): number {
  if ((isCustomRoomWall(room, side) || peninsulaRunById(room, side)) && p.wallId === side) return Math.max(0, Number(p.wallOffset) || 0);
  return side === "top" || side === "bottom" ? p.x : p.y;
}

/** Along-run cabinet span. Explicit runs use the true catalog width, not a screen bounding box. */
export function wallRunSpan(p: PlacedCabinet, side: string, room: RoomData): number {
  if ((isCustomRoomWall(room, side) || peninsulaRunById(room, side)) && p.wallId === side) return Math.max(0, Number(p.width) || 0);
  const size = rotatedSize(p);
  return side === "top" || side === "bottom" ? size.w : size.d;
}

/**
 * Continuous Wall Builder rooms use only their explicit measured segments.
 * Re-seat stale graph-bound or far-dragged cabinets on the closest real wall,
 * and let wallPlacementAt clamp the cabinet's full width inside that wall run.
 */
export function containCabinetOnDrawnWalls(p: PlacedCabinet, room: RoomData): PlacedCabinet {
  if (p.islandFace || !room.vertices?.length || !room.customWalls?.length) return p;
  const footprint = placedFootprint(p);
  const center = { x: p.x + footprint.w / 2, y: p.y + footprint.d / 2 };
  const ownedWall = room.customWalls.find((wall) => wall.id === p.wallId);
  const wall = ownedWall ?? closestPolygonWall(center.x, center.y, room.vertices, room.customWalls);
  if (!wall) return p;
  const alongCenter = ownedWall && Number.isFinite(p.wallOffset)
    ? Number(p.wallOffset) + p.width / 2
    : positionAlongWall(center.x, center.y, wall, room.vertices);
  const spot = wallPlacementAt(alongCenter - p.width / 2, p.width, p.depth, wall.id as WallSide, room, p.peninsulaSide);
  if (
    p.x === spot.x
    && p.y === spot.y
    && p.rotation === spot.rotation
    && p.wallId === spot.wallId
    && p.wallOffset === spot.wallOffset
  ) return p;
  return {
    ...p,
    ...spot,
    wallId: spot.wallId,
    wallOffset: spot.wallOffset,
  };
}

// ─── In-bounds clamping after a room resize ─────────────────────────────────
// When the room shrinks (typed or drawn), anything that now sticks out past a
// wall must be pulled back inside. Keeps the design valid instead of leaving
// cabinets floating outside the room rectangle.
export function clampCabinetToRoom(p: PlacedCabinet, room: RoomData): PlacedCabinet {
  if (!p.islandFace && room.vertices?.length && room.customWalls?.length) {
    return containCabinetOnDrawnWalls(p, room);
  }
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
  /** Clockwise plan rotation of the complete island assembly, in degrees. */
  rotation?: number;
  activeFace?: IslandFace;
  /** Optional door-style override shared by island cabinets; null/undefined follows the perimeter design finish. */
  cabinetStyleId?: number | null;
	/** Optional visual countertop material override; null/undefined follows the perimeter countertop. */
	countertopMaterialId?: string | null;
	/** Exact selected countertop product for the island; null/undefined follows the perimeter product. */
	countertopProductId?: number | null;
	  /** When enabled, a Back-face cabinet may grow the work zone toward the room Back wall to accommodate its depth. */
	  autoAdjustDepthForBackFace?: boolean;
	  /** Optional continuous countertop panel at the physical left or right island end. */
	  waterfallEnd?: "none" | "left" | "right" | "both";
  /** One required continuous slab. Values are initialized from the cabinet assembly. */
  countertopWidth?: number | null;
  countertopDepth?: number | null;
  countertopOffsetX?: number | null;
  countertopOffsetY?: number | null;
  /** Exact reveal around automatic slab edges. Null/undefined uses the standard 1.5-inch reveal. */
  countertopOverhang?: number | null;
  /** When true, the explicit slab width remains centered on the island work zone instead of the current cabinet envelope. */
  countertopWidthAnchoredToZone?: boolean | null;
  /** When true, the explicit slab depth remains centered on the island work zone instead of the current cabinet envelope. */
  countertopDepthAnchoredToZone?: boolean | null;
}

export function clampIslandToRoom(island: IslandZone | null, room: RoomData): IslandZone | null {
  if (!island) return null;
  const width = Math.max(12, Math.min(island.width, room.width));
  const depth = Math.max(12, Math.min(island.depth, room.depth));
  const x = Math.max(0, Math.min(island.x, room.width - width));
  const y = Math.max(0, Math.min(island.y, room.depth - depth));
  const countertopWidth = island.countertopWidth == null ? null : Math.max(1, Math.min(island.countertopWidth, room.width));
  const countertopDepth = island.countertopDepth == null ? null : Math.max(1, Math.min(island.countertopDepth, room.depth));
  const countertopOverhang = island.countertopOverhang == null ? null : Math.max(0, Math.min(island.countertopOverhang, 24));
  return {
    ...island,
    x,
    y,
    width,
    depth,
    countertopWidth,
    countertopDepth,
    countertopOverhang,
    activeFace: island.activeFace ?? "front",
  };
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
// inches. Peninsula and custom-wall placements carry an explicit along-run
// offset; using their rotated screen-space AABB would inflate or redirect the
// measured gap and suppress a valid post-placement filler prompt.
function runSpan(p: PlacedCabinet, side: WallSide, room?: RoomData): { start: number; end: number } {
	const explicitOffset = Number(p.wallOffset);
	const linearWidth = Math.max(0, Number(p.width) || 0);
	const explicitRun = room && (
		Boolean(peninsulaRunById(room, side))
		|| Boolean(room.customWalls?.some((wall) => wall.id === side))
	);
	if (explicitRun && p.wallId === side && Number.isFinite(explicitOffset)) {
		const start = Math.max(0, Math.min(wallLength(side, room), explicitOffset));
		return { start, end: start + linearWidth };
	}
  const { w, d } = placedFootprint(p);
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
  const wallLen = wallLength(side, room);
  const me = runSpan(moving, side, room);

  // Neighbors on the same wall + same layer, excluding the moving item itself.
  const neighbors = others
    .filter((o) => o.uid !== moving.uid)
    .filter((o) => o.placement === moving.placement)
    .filter((o) => isAgainstWall(o, side, room))
    .map((o) => runSpan(o, side, room));

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

export type WallCabinetFitStatus = "fits" | "overlap" | "insufficient";

export interface WallCabinetFitMeasure {
  side: WallSide;
  layer: PlacedCabinet["placement"];
  /** Whether the cabinet is currently seated against the measured wall. */
  seated: boolean;
  requiredSpan: number;
  start: number;
  end: number;
  wallLen: number;
  availableStart: number;
  availableEnd: number;
  availableSpan: number;
  before: number;
  after: number;
  leftOverlap: number;
  rightOverlap: number;
  shortage: number;
  snapStart: number;
  snapEnd: number;
  snapBefore: number;
  snapAfter: number;
  beforeBoundary: string;
  afterBoundary: string;
  status: WallCabinetFitStatus;
}

/**
 * Measures the selected cabinet against the exact free segment on its active
 * wall. The selected item is removed from the blockers first, so the result can
 * distinguish a cabinet that fits edge-to-edge from a cabinet that is truly
 * wider than the available run. Door and window clearances use the same
 * authoritative three-inch rule as wall auto-placement.
 */
export function wallCabinetFitMeasure(
  moving: PlacedCabinet,
  room: RoomData,
  others: PlacedCabinet[],
  openings: WallOpening[],
  side: WallSide = cabinetWall(moving, room),
  openingClearance = WALL_OPENING_CLEARANCE_IN,
): WallCabinetFitMeasure {
  const wallLen = wallLength(side, room);
  const me = runSpan(moving, side, room);
  const requiredSpan = Math.max(0, me.end - me.start);
	  const peers = others
	    .filter((other) => other.uid !== moving.uid)
	    // A room-wall fit must not infer a wall run from a cabinet on an island
	    // face, even if its island position happens to be closest to this wall.
	    .filter((other) => !other.islandFace)
	    .filter((other) => sharesPlanCollisionZone(moving, other))
	    // Ordinary perpendicular cabinets belong to only one selected-wall run.
	    // A genuine diagonal/L/corner-drawer cabinet physically reserves both wall
	    // legs, including legacy WDC records whose saved rotation still points at
	    // the first wall. Count that square adjoining footprint in measurement and
	    // snapping so the next cabinet starts at the true corner edge.
	    .filter((other) => {
	      if (cabinetWall(other, room) === side) return true;
	      const cornerKind = placedCornerGeometryKind(other);
	      const trueRoomCorner = cornerKind === "l-shape" || cornerKind === "diagonal" || cornerKind === "corner-drawer";
	      return trueRoomCorner && isAgainstWall(other, side, room);
	    });
  const segments = freeSegmentsOnWall(
    side,
    room,
    peers,
    openings,
    0,
    moving.placement === "wall" ? openingClearance : 0,
    moving.placement,
    // A normal wall cabinet beside a refrigerator must measure against the
    // refrigerator's true edge, not an inset over-fridge bridge. Dedicated
    // refrigerator bridge cabinets remain allowed to share the appliance span.
    moving.placement === "wall" && !isRefrigeratorWallCabinet(moving),
    moving,
  );
  const distanceToSegment = (segment: WallSegment) => {
    const segmentEnd = segment.start + segment.length;
    if (me.end < segment.start) return segment.start - me.end;
    if (me.start > segmentEnd) return me.start - segmentEnd;
    return 0;
  };
  const selectedSegment = segments.reduce<WallSegment | null>((best, segment) => {
    if (!best) return segment;
    const distance = distanceToSegment(segment);
    const bestDistance = distanceToSegment(best);
    if (distance !== bestDistance) return distance < bestDistance ? segment : best;
    const center = segment.start + segment.length / 2;
    const bestCenter = best.start + best.length / 2;
    const movingCenter = (me.start + me.end) / 2;
    return Math.abs(center - movingCenter) < Math.abs(bestCenter - movingCenter) ? segment : best;
  }, null);
  const availableStart = selectedSegment?.start ?? Math.max(0, Math.min(wallLen, me.start));
  const availableEnd = selectedSegment ? selectedSegment.start + selectedSegment.length : availableStart;
  const availableSpan = Math.max(0, availableEnd - availableStart);

  let leftOverlap = 0;
  let rightOverlap = 0;
  const movingCenter = (me.start + me.end) / 2;
  for (const peer of peers) {
    const span = runSpan(peer, side, room);
    const overlap = Math.min(me.end, span.end) - Math.max(me.start, span.start);
    if (overlap <= COLLISION_EPSILON_IN) continue;
    const peerCenter = (span.start + span.end) / 2;
    if (peerCenter <= movingCenter) leftOverlap = Math.max(leftOverlap, overlap);
    else rightOverlap = Math.max(rightOverlap, overlap);
  }

  const status: WallCabinetFitStatus = leftOverlap > 0 || rightOverlap > 0
    ? "overlap"
    : availableSpan + COLLISION_EPSILON_IN < requiredSpan
      ? "insufficient"
      : "fits";
  const shortage = Math.max(0, requiredSpan - availableSpan);
  const snapStart = availableSpan + COLLISION_EPSILON_IN >= requiredSpan
    ? Math.max(availableStart, Math.min(me.start, availableEnd - requiredSpan))
    : availableStart;
  const snapEnd = snapStart + requiredSpan;
  const boundaryLabel = (coordinate: number, edge: "before" | "after"): string => {
    if (coordinate <= COLLISION_EPSILON_IN) return "wall start";
    if (coordinate >= wallLen - COLLISION_EPSILON_IN) return "wall end";
    const peer = peers.find((candidate) => {
      const span = runSpan(candidate, side, room);
      const boundary = edge === "before" ? span.end : span.start;
      return Math.abs(boundary - coordinate) <= CABINET_SEAM_SNAP_IN + COLLISION_EPSILON_IN;
    });
    if (peer) return peer.masterCode;
    const opening = openings.find((candidate) => {
      if (candidate.side !== side) return false;
      const clearance = moving.placement === "wall" ? openingClearance : 0;
      const near = candidate.offset - clearance;
      const far = candidate.offset + candidate.width + clearance;
      return Math.abs(near - coordinate) <= 0.13 || Math.abs(far - coordinate) <= 0.13;
    });
    if (opening) return `${opening.label || opening.kind} clearance`;
    return "corner/opening boundary";
  };

  return {
    side,
    layer: moving.placement,
    seated: isAgainstWall(moving, side, room),
    requiredSpan,
    start: me.start,
    end: me.end,
    wallLen,
    availableStart,
    availableEnd,
    availableSpan,
    before: Math.max(0, me.start - availableStart),
    after: Math.max(0, availableEnd - me.end),
    leftOverlap,
    rightOverlap,
    shortage,
    snapStart,
    snapEnd,
    snapBefore: Math.max(0, snapStart - availableStart),
    snapAfter: Math.max(0, availableEnd - snapEnd),
    beforeBoundary: boundaryLabel(availableStart, "before"),
    afterBoundary: boundaryLabel(availableEnd, "after"),
    status,
  };
}

/**
 * Explains whether a rejected wall placement merely needs to snap into an
 * otherwise adequate opening or whether no opening is wide enough. This keeps
 * true collision details distinct from insufficient-space guidance.
 */
export function wallCabinetPlacementReason(
  moving: PlacedCabinet,
  room: RoomData,
  others: PlacedCabinet[],
  openings: WallOpening[],
): string | null {
  const collision = cabinetCollisionDetail(moving, others);
  if (moving.placement !== "wall" && moving.placement !== "base") return collisionReason(moving, others);
  const fit = wallCabinetFitMeasure(moving, room, others, openings);
  if (!fit.seated) return collisionReason(moving, others);
  const required = formatEighthInches(fit.requiredSpan);
  const available = formatEighthInches(fit.availableSpan);
  const sideName = ({ top: "back/top", bottom: "front/bottom", left: "left", right: "right" } as const)[fit.side];
  const layerName = moving.placement === "wall" ? "wall-cabinet layer" : "base-cabinet layer";
  const boundaries = `${fit.beforeBoundary} and ${fit.afterBoundary}`;
  if (fit.availableSpan + COLLISION_EPSILON_IN < fit.requiredSpan) {
    const shortage = formatEighthInches(fit.shortage);
    const overlapText = collision ? ` It also overlaps ${collision.cabinet.masterCode} by ${formatEighthInches(collision.penetration)}.` : "";
    return `Cannot place ${moving.masterCode} on the ${sideName} wall ${layerName}: the cabinet uses ${required}, but only ${available} is clear between ${boundaries}. The opening is ${shortage} too small.${overlapText} Choose a smaller matching cabinet or adjust the run.`;
  }
  if (collision) {
    const overlap = formatEighthInches(collision.penetration);
    return `Cannot place ${moving.masterCode} at this exact position on the ${sideName} wall ${layerName}: it overlaps ${collision.cabinet.masterCode} by ${overlap}. A ${available} clear opening exists between ${boundaries}; snap the cabinet to ${formatEighthInches(fit.snapStart)}–${formatEighthInches(fit.snapEnd)}. Edge-to-edge contact is allowed and physical overlap must be 0".`;
  }
  return null;
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

// ─── Countertop Edge Profiles ────────────────────────────────────────────────
// Common edge profiles offered by fabricators. The profile is a visual/quote
// attribute only — it doesn't change geometry in the 2D plan. It appears on the
// build sheet and BOM so the fabricator knows what to cut.
export interface EdgeProfile {
  id: string;
  name: string;
  /** SVG path for a small cross-section icon (viewBox 0 0 24 16) */
  svgPath: string;
}

export const EDGE_PROFILES: EdgeProfile[] = [
  { id: "eased",       name: "Eased",         svgPath: "M2 14 L2 4 Q2 2 4 2 L22 2 L22 14" },
  { id: "bullnose",    name: "Full Bullnose", svgPath: "M2 14 L2 8 Q2 2 8 2 L22 2 L22 14" },
  { id: "half-bull",   name: "Half Bullnose", svgPath: "M2 14 L2 6 Q2 2 6 2 L22 2 L22 14" },
  { id: "bevel",       name: "Bevel",         svgPath: "M2 14 L2 6 L6 2 L22 2 L22 14" },
  { id: "ogee",        name: "Ogee",          svgPath: "M2 14 L2 8 Q2 5 4 4 Q6 2 8 2 L22 2 L22 14" },
  { id: "dupont",      name: "DuPont",        svgPath: "M2 14 L2 6 Q2 2 6 2 L6 4 Q6 6 8 6 L8 2 L22 2 L22 14" },
  { id: "waterfall",   name: "Waterfall",     svgPath: "M2 14 L2 2 L22 2 L22 14" },
  { id: "mitered",     name: "Mitered",       svgPath: "M2 14 L2 2 L22 2 L22 14 L18 14 L18 6 L6 6 L6 14" },
];

export const DEFAULT_EDGE_PROFILE_ID = "eased";

export function edgeProfile(id: string | null | undefined): EdgeProfile {
  return EDGE_PROFILES.find((p) => p.id === id) ?? EDGE_PROFILES[0];
}

// A rectangular countertop surface in room (inch) coordinates, used by the plan
// renderer to draw a visible slab over base cabinets and the island.
export interface CountertopSurface {
  x: number;
  y: number;
  width: number;
  depth: number;
  kind: "base" | "island";
  /** Optional locked plan rotation for a cabinet-supported peninsula slab. */
  rotation?: number;
  /** Explicit-run identity for a continuous cabinet-supported peninsula slab. */
  peninsulaRunId?: string;
  /** Every connected run represented by one unified peninsula countertop outline. */
  peninsulaRunIds?: string[];
  /** The exposed end run used for any waterfall at the end of a unified slab. */
  peninsulaTerminalRunId?: string;
  /** Along-run start for a segmented peninsula slab, measured from the run attachment. */
  runStartIn?: number;
  /** Local slab outline in inches when a connected run edge is miter-clipped. */
  polygon?: CountertopPlanPoint[];
  /** Marks the connected slab edge that participates in the shared miter. */
  miteredStart?: boolean;
  miteredEnd?: boolean;
  /** Physical slab length used for takeoff when the plan rectangle is rotated. */
  linearInches?: number;
  /** Actual connected cabinet-run length for takeoff when one polygon spans turns. */
  runLinearInches?: number;
  /** Physical slab area used for takeoff when the plan rectangle is rotated. */
  areaInches?: number;
  /** Bar projection beyond the cabinet-back drywall pony wall. */
  ponyWallBarOverhangIn?: number;
  /** Drywall thickness plus bar projection carried behind the cabinet backs. */
  ponyWallBackExtensionIn?: number;
}

export interface CountertopPlanPoint {
  x: number;
  y: number;
}

function countertopSurfaceLocalPolygon(surface: CountertopSurface): CountertopPlanPoint[] {
  return surface.polygon?.map((point) => ({ ...point })) ?? [
    { x: 0, y: 0 },
    { x: surface.width, y: 0 },
    { x: surface.width, y: surface.depth },
    { x: 0, y: surface.depth },
  ];
}

export function countertopSurfacePlanPolygon(surface: CountertopSurface): CountertopPlanPoint[] {
  const radians = (surface.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = surface.x + surface.width / 2;
  const centerY = surface.y + surface.depth / 2;
  return countertopSurfaceLocalPolygon(surface).map((point) => {
    const localX = point.x - surface.width / 2;
    const localY = point.y - surface.depth / 2;
    return {
      x: centerX + localX * cos - localY * sin,
      y: centerY + localX * sin + localY * cos,
    };
  });
}

function countertopPolygonArea(points: CountertopPlanPoint[]): number {
  if (points.length < 3) return 0;
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function countertopSurfaceLocalPointFromWorld(
  surface: CountertopSurface,
  point: CountertopPlanPoint,
): CountertopPlanPoint {
  const radians = (surface.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = surface.x + surface.width / 2;
  const centerY = surface.y + surface.depth / 2;
  const worldX = point.x - centerX;
  const worldY = point.y - centerY;
  return {
    x: worldX * cos + worldY * sin + surface.width / 2,
    y: -worldX * sin + worldY * cos + surface.depth / 2,
  };
}

function countertopRunFaceNormal(radians: number, side: PeninsulaCabinetSide): CountertopPlanPoint {
  const leftNormal = { x: -Math.sin(radians), y: Math.cos(radians) };
  return side === "left" ? leftNormal : { x: -leftNormal.x, y: -leftNormal.y };
}

function countertopOffsetEdgeMiterPoint(
  joint: CountertopPlanPoint,
  parentRadians: number,
  parentNormal: CountertopPlanPoint,
  parentDepth: number,
  childRadians: number,
  childNormal: CountertopPlanPoint,
  childDepth: number,
): CountertopPlanPoint {
  const parentOuter = { x: joint.x + parentNormal.x * parentDepth, y: joint.y + parentNormal.y * parentDepth };
  const childOuter = { x: joint.x + childNormal.x * childDepth, y: joint.y + childNormal.y * childDepth };
  const parentTangent = { x: Math.cos(parentRadians), y: Math.sin(parentRadians) };
  const childTangent = { x: Math.cos(childRadians), y: Math.sin(childRadians) };
  const determinant = parentTangent.x * childTangent.y - parentTangent.y * childTangent.x;
  const fallback = { x: (parentOuter.x + childOuter.x) / 2, y: (parentOuter.y + childOuter.y) / 2 };
  if (Math.abs(determinant) <= 1e-9) return fallback;
  const delta = { x: childOuter.x - parentOuter.x, y: childOuter.y - parentOuter.y };
  const amount = (delta.x * childTangent.y - delta.y * childTangent.x) / determinant;
  const intersection = {
    x: parentOuter.x + parentTangent.x * amount,
    y: parentOuter.y + parentTangent.y * amount,
  };
  const maximumProjection = Math.max(parentDepth, childDepth) * 2;
  return Math.hypot(intersection.x - joint.x, intersection.y - joint.y) <= maximumProjection
    ? intersection
    : fallback;
}

function countertopSurfaceWithMiterPoint(
  surface: CountertopSurface,
  run: PeninsulaRun,
  room: RoomData,
  atStart: boolean,
  miterPoint: CountertopPlanPoint,
): CountertopSurface {
  const local = countertopSurfaceLocalPolygon(surface);
  const world = countertopSurfacePlanPolygon(surface);
  const geometry = peninsulaRunEndpoints(run, room);
  const tangent = { x: Math.cos(geometry.radians), y: Math.sin(geometry.radians) };
  const normal = countertopRunFaceNormal(geometry.radians, run.cabinetSide ?? "left");
  const targetAlong = atStart ? (surface.runStartIn ?? 0) : (surface.runStartIn ?? 0) + (surface.linearInches ?? surface.width);
  let outerIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  world.forEach((point, index) => {
    const along = (point.x - geometry.start.x) * tangent.x + (point.y - geometry.start.y) * tangent.y;
    const outward = (point.x - geometry.start.x) * normal.x + (point.y - geometry.start.y) * normal.y;
    const score = Math.abs(along - targetAlong) + Math.abs(outward - surface.depth);
    if (score < bestScore) {
      bestScore = score;
      outerIndex = index;
    }
  });
  local[outerIndex] = countertopSurfaceLocalPointFromWorld(surface, miterPoint);
  return {
    ...surface,
    polygon: local,
    areaInches: countertopPolygonArea(local),
    ...(atStart ? { miteredStart: true } : { miteredEnd: true }),
  };
}

type CountertopRunEndEdge = {
  innerIndex: number;
  outerIndex: number;
  innerPoint: CountertopPlanPoint;
  outerPoint: CountertopPlanPoint;
};

/**
 * Returns the two slab vertices at a run endpoint. The local polygon may
 * already contain a miter at its opposite endpoint, so identify this edge from
 * the measured run axis rather than assuming a four-vertex rectangle.
 */
function countertopSurfaceRunEndEdge(
  surface: CountertopSurface,
  run: PeninsulaRun,
  room: RoomData,
  atStart: boolean,
): CountertopRunEndEdge | null {
  const world = countertopSurfacePlanPolygon(surface);
  if (world.length < 3) return null;
  const geometry = peninsulaRunEndpoints(run, room);
  const tangent = { x: Math.cos(geometry.radians), y: Math.sin(geometry.radians) };
  const normal = countertopRunFaceNormal(geometry.radians, run.cabinetSide ?? "left");
  const targetAlong = atStart
    ? surface.runStartIn ?? 0
    : (surface.runStartIn ?? 0) + (surface.linearInches ?? surface.width);
  const endpoints = world
    .map((point, index) => ({
      index,
      point,
      along: (point.x - geometry.start.x) * tangent.x + (point.y - geometry.start.y) * tangent.y,
      outward: (point.x - geometry.start.x) * normal.x + (point.y - geometry.start.y) * normal.y,
    }))
    .sort((left, right) => Math.abs(left.along - targetAlong) - Math.abs(right.along - targetAlong))
    .slice(0, 2)
    .sort((left, right) => left.outward - right.outward);
  if (endpoints.length !== 2) return null;
  return {
    innerIndex: endpoints[0]!.index,
    outerIndex: endpoints[1]!.index,
    innerPoint: endpoints[0]!.point,
    outerPoint: endpoints[1]!.point,
  };
}

function countertopLineIntersection(
  firstPoint: CountertopPlanPoint,
  firstDirection: CountertopPlanPoint,
  secondPoint: CountertopPlanPoint,
  secondDirection: CountertopPlanPoint,
): CountertopPlanPoint | null {
  const determinant = firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x;
  if (Math.abs(determinant) <= 1e-9) return null;
  const delta = { x: secondPoint.x - firstPoint.x, y: secondPoint.y - firstPoint.y };
  const amount = (delta.x * secondDirection.y - delta.y * secondDirection.x) / determinant;
  return {
    x: firstPoint.x + firstDirection.x * amount,
    y: firstPoint.y + firstDirection.y * amount,
  };
}

/**
 * At a square peninsula bend raw rectangular slabs overlap in one quadrant.
 * Trim each physical outer edge back to its real intersection, then bridge the
 * measured bend itself. This creates one continuous L-shaped slab without the
 * triangular 3D hole caused by cutting both rectangles to one shared point.
 */
function countertopSurfaceWithSquareCornerMiter(
  surface: CountertopSurface,
  edge: CountertopRunEndEdge,
  outerCorner: CountertopPlanPoint,
  atStart: boolean,
  bridgePoint?: CountertopPlanPoint,
): CountertopSurface {
  const local = countertopSurfaceLocalPolygon(surface);
  // The inner endpoint is already the measured bend. Re-inserting that same
  // point created a zero-length polygon edge. Three.js can triangulate that
  // degenerate edge into the detached triangular top seen in 3D. Keep the
  // original bend vertex and replace only the physical outer endpoint so both
  // slabs share one clean, square seam from bend to outside intersection.
  local[edge.outerIndex] = countertopSurfaceLocalPointFromWorld(surface, outerCorner);

  // A seating/bar projection can make the far run's original inside corner sit
  // beyond the adjoining run's physical end. In that case the two slabs need a
  // short second seam vertex as well. Without it the new outer-corner trim is
  // mathematically valid but leaves a triangular hole between the two countertop
  // faces. Add it only when it is distinct from the endpoint already present.
  if (bridgePoint) {
    const bridgeLocal = countertopSurfaceLocalPointFromWorld(surface, bridgePoint);
    const innerLocal = local[edge.innerIndex]!;
    const outerLocal = local[edge.outerIndex]!;
    const isDistinct = Math.hypot(bridgeLocal.x - innerLocal.x, bridgeLocal.y - innerLocal.y) > 1e-6
      && Math.hypot(bridgeLocal.x - outerLocal.x, bridgeLocal.y - outerLocal.y) > 1e-6;
    if (isDistinct) {
      const insertAt = (edge.outerIndex + 1) % local.length === edge.innerIndex
        ? edge.innerIndex
        : edge.outerIndex + 1;
      local.splice(insertAt, 0, bridgeLocal);
    }
  }
  return {
    ...surface,
    polygon: local,
    areaInches: countertopPolygonArea(local),
    ...(atStart ? { miteredStart: true } : { miteredEnd: true }),
  };
}

/**
 * Joins the outer cabinet-side edges at one bounded shared point. Unlike an
 * infinite outside-line intersection, this miter cannot project beyond both
 * physical countertop edges at an acute 45-degree turn.
 */
export function miteredPeninsulaCountertopSurfaces(
  surfaces: CountertopSurface[],
  room: RoomData,
): CountertopSurface[] {
  const resolved: CountertopSurface[] = surfaces.map((surface) => ({ ...surface, polygon: surface.polygon?.map((point) => ({ ...point })) }));
  for (const child of room.peninsulaRuns ?? []) {
    if (!child.parentRunId) continue;
    const parent = room.peninsulaRuns?.find((candidate) => candidate.id === child.parentRunId);
    if (!parent || (parent.cabinetSide ?? "left") !== (child.cabinetSide ?? "left")) continue;
    const parentIndices = resolved
      .map((surface, index) => ({ surface, index }))
      .filter(({ surface }) => surface.peninsulaRunId === parent.id && (surface.runStartIn ?? 0) + (surface.linearInches ?? surface.width) >= parent.length - COLLISION_EPSILON_IN);
    const childIndices = resolved
      .map((surface, index) => ({ surface, index }))
      .filter(({ surface }) => surface.peninsulaRunId === child.id && (surface.runStartIn ?? 0) <= COLLISION_EPSILON_IN);
    if (parentIndices.length === 0 || childIndices.length === 0) continue;
    const parentGeometry = peninsulaRunEndpoints(parent, room);
    const childGeometry = peninsulaRunEndpoints(child, room);
    const side = parent.cabinetSide ?? "left";
	    for (const { index: parentIndex } of parentIndices) {
	      for (const { index: childIndex } of childIndices) {
	        const parentSurface = resolved[parentIndex]!;
	        const childSurface = resolved[childIndex]!;
	        const parentNormal = countertopRunFaceNormal(parentGeometry.radians, side);
	        const childNormal = countertopRunFaceNormal(childGeometry.radians, side);
	        const rightAngle = Math.abs(Math.cos(parentGeometry.radians - childGeometry.radians)) <= 1e-6;
	        if (rightAngle) {
	          const parentEdge = countertopSurfaceRunEndEdge(parentSurface, parent, room, false);
	          const childEdge = countertopSurfaceRunEndEdge(childSurface, child, room, true);
	          const parentTangent = { x: Math.cos(parentGeometry.radians), y: Math.sin(parentGeometry.radians) };
	          const childTangent = { x: Math.cos(childGeometry.radians), y: Math.sin(childGeometry.radians) };
	          const outerCorner = parentEdge && childEdge
	            ? countertopLineIntersection(parentEdge.outerPoint, parentTangent, childEdge.outerPoint, childTangent)
	            : null;
	          if (parentEdge && childEdge && outerCorner) {
	            resolved[parentIndex] = countertopSurfaceWithSquareCornerMiter(parentSurface, parentEdge, outerCorner, false);
	            resolved[childIndex] = countertopSurfaceWithSquareCornerMiter(childSurface, childEdge, outerCorner, true, parentEdge.innerPoint);
	            continue;
	          }
	        }
	        const miterPoint = countertopOffsetEdgeMiterPoint(
	          parentGeometry.end,
	          parentGeometry.radians,
          parentNormal,
          parentSurface.depth,
          childGeometry.radians,
          childNormal,
          childSurface.depth,
        );
        resolved[parentIndex] = countertopSurfaceWithMiterPoint(parentSurface, parent, room, false, miterPoint);
        resolved[childIndex] = countertopSurfaceWithMiterPoint(childSurface, child, room, true, miterPoint);
      }
    }
  }
  return resolved;
}

function sameCountertopPlanPoint(left: CountertopPlanPoint, right: CountertopPlanPoint, tolerance = 0.001): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= tolerance;
}

function countertopBoundaryPath(points: CountertopPlanPoint[], startIndex: number, endIndex: number): CountertopPlanPoint[] {
  const result: CountertopPlanPoint[] = [];
  for (let index = startIndex; ; index = (index + 1) % points.length) {
    result.push(points[index]!);
    if (index === endIndex) return result;
  }
}

function removeConsecutiveCountertopPlanDuplicates(points: CountertopPlanPoint[]): CountertopPlanPoint[] {
  const resolved = points.filter((point, index) => index === 0 || !sameCountertopPlanPoint(point, points[index - 1]!));
  return resolved.length > 1 && sameCountertopPlanPoint(resolved[0]!, resolved[resolved.length - 1]!)
    ? resolved.slice(0, -1)
    : resolved;
}

/**
 * Produces the outside boundary of two same-sided slabs that share an entire
 * reversed edge. This is deliberately an exact shared-boundary union, not an
 * AABB merge: it keeps a 45° return's physical countertop path and never fills
 * a range opening or invents a surface across a non-touching gap.
 */
function unionCountertopSurfacesAtSharedBoundary(
  left: CountertopSurface,
  right: CountertopSurface,
  rootRunId: string,
): CountertopSurface | null {
  const leftPolygon = countertopSurfacePlanPolygon(left);
  const rightPolygon = countertopSurfacePlanPolygon(right);
  if (leftPolygon.length < 3 || rightPolygon.length < 3) return null;

  for (let leftIndex = 0; leftIndex < leftPolygon.length; leftIndex += 1) {
    const leftNext = (leftIndex + 1) % leftPolygon.length;
    for (let rightIndex = 0; rightIndex < rightPolygon.length; rightIndex += 1) {
      const rightNext = (rightIndex + 1) % rightPolygon.length;
      if (!sameCountertopPlanPoint(leftPolygon[leftIndex]!, rightPolygon[rightNext]!, 0.125)) continue;
      if (!sameCountertopPlanPoint(leftPolygon[leftNext]!, rightPolygon[rightIndex]!, 0.125)) continue;

      const outline = removeConsecutiveCountertopPlanDuplicates([
        ...countertopBoundaryPath(leftPolygon, leftNext, leftIndex),
        ...countertopBoundaryPath(rightPolygon, (rightIndex + 2) % rightPolygon.length, rightIndex),
      ]);
      if (outline.length < 3) return null;
      const minX = Math.min(...outline.map((point) => point.x));
      const maxX = Math.max(...outline.map((point) => point.x));
      const minY = Math.min(...outline.map((point) => point.y));
      const maxY = Math.max(...outline.map((point) => point.y));
      const terminalRunIds = [left.peninsulaTerminalRunId, right.peninsulaTerminalRunId]
        .filter((id): id is string => Boolean(id));
      const runIds = Array.from(new Set([
        ...(left.peninsulaRunIds ?? (left.peninsulaRunId ? [left.peninsulaRunId] : [])),
        ...(right.peninsulaRunIds ?? (right.peninsulaRunId ? [right.peninsulaRunId] : [])),
      ]));
      return {
        x: minX,
        y: minY,
        width: Math.max(0.1, maxX - minX),
        depth: Math.max(0.1, maxY - minY),
        kind: "base",
        rotation: 0,
        peninsulaRunId: rootRunId,
        peninsulaRunIds: runIds,
        ...(terminalRunIds.length === 1 ? { peninsulaTerminalRunId: terminalRunIds[0] } : {}),
        runStartIn: 0,
        polygon: outline.map((point) => ({ x: point.x - minX, y: point.y - minY })),
        miteredStart: left.miteredStart || right.miteredStart,
        miteredEnd: left.miteredEnd || right.miteredEnd,
        linearInches: Math.max(0.1, maxX - minX),
        runLinearInches: (left.runLinearInches ?? left.linearInches ?? 0) + (right.runLinearInches ?? right.linearInches ?? 0),
        areaInches: countertopPolygonArea(outline),
        ponyWallBarOverhangIn: Math.max(left.ponyWallBarOverhangIn ?? 0, right.ponyWallBarOverhangIn ?? 0) || undefined,
        ponyWallBackExtensionIn: Math.max(left.ponyWallBackExtensionIn ?? 0, right.ponyWallBackExtensionIn ?? 0) || undefined,
      };
    }
  }
  return null;
}

/**
 * A 45° peninsula return is one fabricated countertop path, not a second
 * floating countertop. Miter first, then fold every touching segment of each
 * 45° assembly into one concave Plan polygon. A 90° return stays as its two
 * cleanly mitered fabricated pieces, matching the existing trade convention.
 */
export function unifiedFortyFivePeninsulaCountertopSurfaces(
  surfaces: CountertopSurface[],
  room: RoomData,
): CountertopSurface[] {
  const resolved: CountertopSurface[] = surfaces.map((surface) => ({
    ...surface,
    polygon: surface.polygon?.map((point) => ({ ...point })),
  }));
  const rootsWithFortyFiveReturns = new Set<string>();
  for (const run of room.peninsulaRuns ?? []) {
    if (!run.parentRunId || run.turn !== 45) continue;
    rootsWithFortyFiveReturns.add(peninsulaRootRunId(run, room));
  }

  for (const rootRunId of Array.from(rootsWithFortyFiveReturns)) {
    let merged = true;
    while (merged) {
      merged = false;
      for (let leftIndex = 0; leftIndex < resolved.length && !merged; leftIndex += 1) {
        const left = resolved[leftIndex]!;
        const leftRuns = left.peninsulaRunIds ?? (left.peninsulaRunId ? [left.peninsulaRunId] : []);
        if (!leftRuns.some((id) => {
          const run = room.peninsulaRuns?.find((candidate) => candidate.id === id);
          return run && peninsulaRootRunId(run, room) === rootRunId;
        })) continue;
        for (let rightIndex = leftIndex + 1; rightIndex < resolved.length; rightIndex += 1) {
          const right = resolved[rightIndex]!;
          const rightRuns = right.peninsulaRunIds ?? (right.peninsulaRunId ? [right.peninsulaRunId] : []);
          if (!rightRuns.some((id) => {
            const run = room.peninsulaRuns?.find((candidate) => candidate.id === id);
            return run && peninsulaRootRunId(run, room) === rootRunId;
          })) continue;
          const union = unionCountertopSurfacesAtSharedBoundary(left, right, rootRunId);
          if (!union) continue;
          resolved.splice(rightIndex, 1);
          resolved[leftIndex] = union;
          merged = true;
          break;
        }
      }
    }
  }
  return resolved.map((surface) => {
    const runIds = surface.peninsulaRunIds ?? (surface.peninsulaRunId ? [surface.peninsulaRunId] : []);
    if (runIds.length < 2) return surface;
    const firstRun = runIds
      .map((id) => room.peninsulaRuns?.find((candidate) => candidate.id === id))
      .find((run): run is PeninsulaRun => Boolean(run));
    const rootRunId = firstRun ? peninsulaRootRunId(firstRun, room) : undefined;
    if (!rootRunId || !rootsWithFortyFiveReturns.has(rootRunId)) return surface;
    const terminal = (room.peninsulaRuns ?? []).find((run) => (
      peninsulaRootRunId(run, room) === rootRunId
      && !(room.peninsulaRuns ?? []).some((candidate) => candidate.parentRunId === run.id)
    ));
    return terminal ? { ...surface, peninsulaTerminalRunId: terminal.id } : surface;
  });
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
//   - loose/manual filler or scribe strips (FILL-* — a sliver, not a cabinet)
// Small-gap fillers installed as part of a confirmed base run are the exception:
// their saved group metadata means the adjacent countertop must continue over
// the installed width even though the filler itself is not a cabinet box.
// Tall cabinets and appliances are already excluded by the placement check.
export function bearsCountertop(p: {
  placement: Placement;
  masterCode?: string | null;
  description?: string | null;
  subCategory?: string | null;
  fillerPieceGroupId?: string | null;
  fillerTotalWidth?: number | null;
  fillerPlacementMode?: "left" | "right" | "split" | null;
}): boolean {
  if (p.placement !== "base") return false;
  // Some legacy plans stored a freestanding stove in the base layer. A stove
  // remains an appliance opening regardless of that stale layer value, so it
  // must never receive a countertop slab.
  if (isRangeOrOven(p.masterCode, p.description)) return false;
  const installedFillerWidth = Number(p.fillerTotalWidth);
  const isInstalledBaseFiller = Boolean(
    p.fillerPieceGroupId &&
    p.fillerPlacementMode &&
    Number.isFinite(installedFillerWidth) &&
    installedFillerWidth > 0,
  );
  if (isInstalledBaseFiller) return true;
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

/**
 * A real base corner cabinet can be centered at a peninsula's 90°/45° bend
 * while retaining ownership of the adjoining run. Its footprint still supports
 * the connected slab at either run endpoint, so do not leave the corner
 * uncovered merely because `wallId` names the other leg.
 */
export function peninsulaCornerCabinetSupportsCountertop(
  cabinet: PlacedCabinet,
  run: PeninsulaRun,
  room: RoomData,
): boolean {
  const isBendSupport = isCornerCabinet(cabinet.masterCode, cabinet.description)
    || isBaseEndCornerCabinet(cabinet)
    || /(?:angle|angled)\s+drawer base/i.test(cabinet.description ?? "");
  if (!bearsCountertop(cabinet) || !isBendSupport) return false;
  const footprint = placedFootprint(cabinet);
  const geometry = peninsulaRunEndpoints(run, room);
  const tolerance = COLLISION_EPSILON_IN + 0.25;
  return [geometry.start, geometry.end].some((point) => (
    point.x >= cabinet.x - tolerance
    && point.x <= cabinet.x + footprint.w + tolerance
    && point.y >= cabinet.y - tolerance
    && point.y <= cabinet.y + footprint.d + tolerance
  ));
}

/**
 * A peninsula slab is one continuous, cabinet-supported run. It deliberately
 * spans released cabinet voids on that run, but an entirely empty peninsula
 * receives no invented countertop. The seating projection follows the selected
 * cabinet face so it always extends beyond cabinet fronts rather than through
 * the peninsula wall.
 */
export function peninsulaCountertopSurface(
  run: PeninsulaRun,
  room: RoomData,
  requestedStartIn = 0,
  requestedLengthIn = run.length,
): CountertopSurface {
  const seating = peninsulaCountertopSeatingOverhang(run, room);
  const ponyWallBarOverhang = peninsulaCountertopPonyWallBarOverhang(run, room);
  const ponyWallBackExtension = peninsulaCountertopPonyWallBackExtensionIn(run, room);
  const slabDepth = COUNTERTOP_DEPTH_IN + seating + ponyWallBackExtension;
  const runLength = Math.max(0, Number(run.length) || 0);
  const startIn = Math.max(0, Math.min(runLength, Number(requestedStartIn) || 0));
  const lengthIn = Math.max(0, Math.min(runLength - startIn, Number(requestedLengthIn) || 0));
  const spot = wallPlacementAt(startIn, lengthIn, slabDepth, run.id as WallSide, room, run.cabinetSide ?? "left");
  const footprint = placedFootprint({
    uid: `peninsula-countertop-${run.id}-${startIn}`,
    cabinetId: 0,
    masterCode: "PENINSULA-COUNTERTOP",
    description: "Peninsula countertop",
    placement: "base",
    x: spot.x,
    y: spot.y,
    width: lengthIn,
    depth: slabDepth,
    height: STD.COUNTERTOP_THICKNESS,
    rotation: spot.rotation,
  });
  // `wallPlacementAt` correctly returns the screen-space AABB of a rotated
  // object. Surface consumers rotate their own local rectangle, however, so
  // returning that AABB as width/depth makes a 45° slab inflate and rotate a
  // second time. Keep its true local dimensions and preserve the identical
  // world center used by cabinet placement and the 3D slab mesh.
  const faceNormal = countertopRunFaceNormal(
    peninsulaRunEndpoints(run, room).radians,
    run.cabinetSide ?? "left",
  );
  const centerX = spot.x + footprint.w / 2 - faceNormal.x * ponyWallBackExtension;
  const centerY = spot.y + footprint.d / 2 - faceNormal.y * ponyWallBackExtension;
  return {
    x: centerX - lengthIn / 2,
    y: centerY - slabDepth / 2,
    width: lengthIn,
    depth: slabDepth,
    kind: "base",
    rotation: spot.rotation,
    peninsulaRunId: run.id,
    runStartIn: startIn,
    linearInches: lengthIn,
    runLinearInches: lengthIn,
    areaInches: lengthIn * slabDepth,
    ponyWallBarOverhangIn: ponyWallBarOverhang,
    ponyWallBackExtensionIn: ponyWallBackExtension,
  };
}

/**
 * Island-only exception for a shallow wall cabinet such as W-24-30. The marker
 * is set exclusively by Island-mode placement, leaving ordinary wall cabinets
 * and Wall mode countertop behavior unchanged.
 */
export function isCounterHeightIslandWallCabinet(p: {
  placement?: Placement | null;
  islandFace?: IslandFace | null;
  islandCounterHeightWallCabinet?: boolean | null;
}): boolean {
  return p.placement === "wall" && Boolean(p.islandFace) && p.islandCounterHeightWallCabinet === true;
}

/** Older island plans did not store a treatment; retain the familiar recessed
 * toe kick as their backwards-compatible default. */
export function islandWallCabinetBaseTreatment(p: {
  islandWallCabinetBaseTreatment?: IslandWallCabinetBaseTreatment | null;
}): IslandWallCabinetBaseTreatment {
  return p.islandWallCabinetBaseTreatment === "base-molding" ? "base-molding" : "toe-kick";
}

/** Counter-bearing island members include genuine bases and marked shallow opposing wall faces. */
export function bearsIslandCountertop(p: {
  placement: Placement;
  masterCode?: string | null;
  description?: string | null;
  subCategory?: string | null;
  fillerPieceGroupId?: string | null;
  fillerTotalWidth?: number | null;
  fillerPlacementMode?: "left" | "right" | "split" | null;
  islandFace?: IslandFace | null;
  islandCounterHeightWallCabinet?: boolean | null;
}): boolean {
  return bearsCountertop(p) || isCounterHeightIslandWallCabinet(p);
}

/**
 * A BBC may be deliberately moved perpendicular to its owning wall by the
 * Cabinet Attributes depth control. The cabinet body remains pulled forward,
 * but the countertop must bridge the exact rear void back to the wall.
 */
export function blindCornerRearCountertopExtensionIn(
  p: PlacedCabinet,
  room: RoomData,
): number {
  if (!isBlindCorner(p.masterCode, p.description) || p.placement !== "base") return 0;
  const side = cabinetWall(p, room);
  const footprint = placedFootprint(p);
  const rawGap = side === "top"
    ? p.y
    : side === "bottom"
      ? room.depth - (p.y + footprint.d)
      : side === "left"
        ? p.x
        : room.width - (p.x + footprint.w);
  if (!Number.isFinite(rawGap) || rawGap <= COLLISION_EPSILON_IN) return 0;
  const pullMax = blindPullRange(p)?.max ?? BLIND_CORNER_FILLER_WIDTH_IN * 2;
  return Math.round(Math.min(Math.max(0, rawGap), pullMax) * 8) / 8;
}

export function countertopSurfaces(
  placed: PlacedCabinet[],
  room: RoomData,
  island?: IslandZone | null
): CountertopSurface[] {
  const out: CountertopSurface[] = [];
  const D = COUNTERTOP_DEPTH_IN;
  for (const p of placed) {
    // Countertop-bearing bases and confirmed installed filler pieces get a slab.
    // Loose fillers, tall cabinets, appliances, and panels remain excluded.
    if (!bearsCountertop(p)) continue;
    if (island && isOnIsland(p, island)) continue;
    const side = cabinetWall(p, room);
    const footprint = placedFootprint(p);
    const peninsula = peninsulaRunById(room, side);
    // Explicit peninsula runs are collected below into a single continuous
    // cabinet-supported slab. That avoids seams and maintains coverage over an
    // intentional void between two cabinets.
    if (peninsula) continue;
    const horizontalWall = side === "top" || side === "bottom";
    const runSpan = horizontalWall ? footprint.w : footprint.d;
    const rearExtension = blindCornerRearCountertopExtensionIn(p, room);
    // A blind corner may also carry an along-run pull from the room corner.
    // Cover that exact dead-corner distance, rather than blindly adding the
    // manufacturer's maximum pull when the cabinet already touches the corner.
    let cornerGap = 0;
    if (isBlindCorner(p.masterCode, p.description)) {
      const runStart = horizontalWall ? p.x : p.y;
      const runMax = horizontalWall ? room.width : room.depth;
      const nearStart = runStart <= runMax - (runStart + runSpan);
      const actualCornerGap = nearStart ? runStart : runMax - (runStart + runSpan);
      const pullMax = blindPullRange(p)?.max ?? BLIND_CORNER_FILLER_WIDTH_IN * 2;
      if (actualCornerGap > COLLISION_EPSILON_IN && actualCornerGap <= pullMax + COLLISION_EPSILON_IN) {
        cornerGap = Math.round(actualCornerGap * 8) / 8;
      }
    }
    if (side === "top") {
      // Extend toward whichever horizontal end is nearer the corner (the wall).
      const nearLeft = p.x <= room.width - (p.x + runSpan);
      const x = nearLeft ? p.x - cornerGap : p.x;
      out.push({ x: Math.max(0, x), y: 0, width: runSpan + cornerGap, depth: D + rearExtension, kind: "base" });
    } else if (side === "bottom") {
      const nearLeft = p.x <= room.width - (p.x + runSpan);
      const x = nearLeft ? p.x - cornerGap : p.x;
      out.push({ x: Math.max(0, x), y: room.depth - D - rearExtension, width: runSpan + cornerGap, depth: D + rearExtension, kind: "base" });
    } else if (side === "left") {
      // Vertical run: slab is D wide into the room and uses the rotated
      // footprint depth as its full along-wall span.
      const nearTop = p.y <= room.depth - (p.y + runSpan);
      const y = nearTop ? p.y - cornerGap : p.y;
      out.push({ x: 0, y: Math.max(0, y), width: D + rearExtension, depth: runSpan + cornerGap, kind: "base" });
    } else {
      const nearTop = p.y <= room.depth - (p.y + runSpan);
      const y = nearTop ? p.y - cornerGap : p.y;
      out.push({ x: room.width - D - rearExtension, y: Math.max(0, y), width: D + rearExtension, depth: runSpan + cornerGap, kind: "base" });
    }
  }
  // Every cabinet-supported peninsula receives continuous countertop across
  // ordinary cabinet voids, but a freestanding range/stove/cooktop remains a
  // true opening. Split only at those appliance footprints so Plan, 3D, price,
  // and materials all share the same physical slab geometry.
  for (const run of room.peninsulaRuns ?? []) {
    const hasCountertopSupport = placed.some((cabinet) =>
      bearsCountertop(cabinet) &&
      cabinetWall(cabinet, room) === run.id &&
      Number(cabinet.width) > 0,
    ) || placed.some((cabinet) => peninsulaCornerCabinetSupportsCountertop(cabinet, run, room));
    if (!hasCountertopSupport) continue;
    const applianceOpenings = placed
      .filter((cabinet) => isRangeOrOven(cabinet.masterCode, cabinet.description) && cabinetWall(cabinet, room) === run.id)
      .map((cabinet) => {
        const width = Math.max(0, Number(cabinet.width) || 0);
        const footprint = placedFootprint(cabinet);
        const projectedCenter = peninsulaRunOffsetAtPoint(run, room, {
          x: cabinet.x + footprint.w / 2,
          y: cabinet.y + footprint.d / 2,
        });
        const savedStart = typeof cabinet.wallOffset === "number" ? cabinet.wallOffset : Number.NaN;
        const start = Number.isFinite(savedStart) ? savedStart : projectedCenter - width / 2;
        return {
          start: Math.max(0, Math.min(run.length, start)),
          end: Math.max(0, Math.min(run.length, start + width)),
        };
      })
      .filter((opening) => opening.end - opening.start > COLLISION_EPSILON_IN)
      .sort((a, b) => a.start - b.start)
      .reduce<Array<{ start: number; end: number }>>((merged, opening) => {
        const previous = merged[merged.length - 1];
        if (previous && opening.start <= previous.end + COLLISION_EPSILON_IN) {
          previous.end = Math.max(previous.end, opening.end);
        } else {
          merged.push({ ...opening });
        }
        return merged;
      }, []);
    let cursor = 0;
    for (const opening of applianceOpenings) {
      if (opening.start - cursor > COLLISION_EPSILON_IN) {
        out.push(peninsulaCountertopSurface(run, room, cursor, opening.start - cursor));
      }
      cursor = Math.max(cursor, opening.end);
    }
    if (run.length - cursor > COLLISION_EPSILON_IN) {
      out.push(peninsulaCountertopSurface(run, room, cursor, run.length - cursor));
    }
  }
  const mitered = miteredPeninsulaCountertopSurfaces(out, room);
  out.splice(0, out.length, ...unifiedFortyFivePeninsulaCountertopSurfaces(mitered, room));
  if (island) {
    const supports = placed.filter((item) => isOnIsland(item, island) && bearsCountertop(item));
    if (supports.length > 0) {
      const footprints = supports.map((item) => ({ item, footprint: placedFootprint(item) }));
      const minX = Math.min(...footprints.map(({ item }) => item.x));
      const minY = Math.min(...footprints.map(({ item }) => item.y));
      const maxX = Math.max(...footprints.map(({ item, footprint }) => item.x + footprint.w));
      const maxY = Math.max(...footprints.map(({ item, footprint }) => item.y + footprint.d));
      const width = island.countertopWidth ?? maxX - minX + 3;
      const depth = island.countertopDepth ?? maxY - minY + 3;
      const centerX = (minX + maxX) / 2 + Number(island.countertopOffsetX ?? 0);
      const centerY = (minY + maxY) / 2 + Number(island.countertopOffsetY ?? 0);
      out.push({ x: centerX - width / 2, y: centerY - depth / 2, width, depth, kind: "island" });
    }
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
  /** Wall that the fixture faces, used to orient the basin and faucet in plan/3D. */
  wallSide?: WallSide;
  /** Exact clockwise Plan rotation inherited from the owning cabinet. */
  planRotation?: number;
  /** Owning sink-base placement when the fixture is installed in a cabinet. */
  cabinetUid?: string;
  /** Physical product dimensions before the plan footprint is rotated. */
  sourceWidth?: number;
  sourceDepth?: number;
  /** Pelican product ID (when selected from real inventory) */
  pelicanProductId?: number;
  /** Pelican product name for display */
  pelicanProductName?: string;
  /** Pelican product image URL */
  pelicanProductImage?: string;
  /** Source-verified parametric profile identifier, when a real Pelican fixture has one. */
  pelicanProfileId?: string;
  /** Verified bowl dimensions in inches for the selected Pelican sink profile. */
  bowlWidth?: number;
  bowlDepth?: number;
  bowlHeight?: number;
  /** Source-verified count for a multi-bowl Pelican sink profile. */
  bowlCount?: 1 | 2;
  /** Individually measured bowl widths for asymmetric two-bowl fixture profiles. */
  bowlWidths?: readonly [number, number];
  /** Individually measured bowl depths for asymmetric two-bowl fixture profiles. */
  bowlDepths?: readonly [number, number];
  /** Individually measured bowl heights for stepped two-bowl fixture profiles. */
  bowlHeights?: readonly [number, number];
  /** Source-documented inset from the bowl's right edge to its drain center. */
  drainInsetRight?: number;
  /** Source-documented inset from the bowl's rear edge to its drain center. */
  drainInsetBack?: number;
  /** Verified outer sink height in inches, used by an apron-front sink face. */
  exteriorHeight?: number;
  /** A farmhouse/apron-front sink exposes a measured front below the countertop. */
  apronFront?: boolean;
  /** Source-documented sink surface finish for deterministic physical fixture rendering. */
  surfaceFinish?: "stainless-steel" | "gunmetal-black";
  /** Selected Pelican faucet identity and source-verified parametric profile, when present. */
  pelicanFaucetProductId?: number;
  pelicanFaucetProductName?: string;
  pelicanFaucetProductImage?: string;
  pelicanFaucetProfileId?: string;
  /** Published faucet dimensions in inches; only source-verified values are stored here. */
  faucetOverallHeight?: number;
  faucetSpoutLength?: number;
  faucetSpoutHeight?: number;
  faucetFinish?: "brushed-nickel" | "matte-black" | "brushed-gold" | "chrome" | "oil-rubbed-bronze";
  faucetForm?: "pull-down" | "standard-arc" | "pull-out" | "articulated-swing";
}

export const SINK_PRESETS: Record<SinkType, { name: string; width: number; depth: number }> = {
  single:    { name: "Single Bowl Sink", width: 25, depth: 18 },
  double:    { name: "Double Bowl Sink", width: 33, depth: 20 },
  farmhouse: { name: "Farmhouse Sink",   width: 30, depth: 20 },
  bar:       { name: "Bar / Prep Sink",  width: 15, depth: 15 },
};

export function sinkPlanDimensions(
  width: number,
  depth: number,
  wallSide?: WallSide,
): { width: number; depth: number } {
  return wallSide === "left" || wallSide === "right"
    ? { width: depth, depth: width }
    : { width, depth };
}

export function makeSink(
  type: SinkType,
  x: number,
  y: number,
  wallSide?: WallSide,
  dimensions?: { width: number; depth: number },
): SinkFixture {
  const preset = SINK_PRESETS[type];
  const sourceWidth = dimensions?.width ?? preset.width;
  const sourceDepth = dimensions?.depth ?? preset.depth;
  const plan = sinkPlanDimensions(sourceWidth, sourceDepth, wallSide);
  return {
    uid: `sink-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    type,
    x,
    y,
    width: plan.width,
    depth: plan.depth,
    faucet: true,
    wallSide,
    sourceWidth,
    sourceDepth,
  };
}

/** Centers a sink fixture within a sink-base footprint and faces it toward the room. */
export function makeSinkForCabinet(
	  type: SinkType,
	  cabinet: PlacedCabinet,
	  room: RoomData,
	  dimensions?: { width: number; depth: number },
): SinkFixture {
	  const side = cabinet.islandFace
	    ? ({ front: "top", back: "bottom", left: "right", right: "left" } as const)[cabinet.islandFace]
	    : cabinetWall(cabinet, room);
  const rawWidth = dimensions?.width ?? SINK_PRESETS[type].width;
  const rawDepth = dimensions?.depth ?? SINK_PRESETS[type].depth;
  const plan = sinkPlanDimensions(rawWidth, rawDepth, side);
  const footprint = placedFootprint(cabinet);
  const centeredX = Math.max(cabinet.x, Math.min(cabinet.x + footprint.w - plan.width, cabinet.x + footprint.w / 2 - plan.width / 2));
  const centeredY = Math.max(cabinet.y, Math.min(cabinet.y + footprint.d - plan.depth, cabinet.y + footprint.d / 2 - plan.depth / 2));
  // Farmhouse sinks are countertop-mounted but their apron is flush with the
  // room-facing cabinet front. Keep the run axis centered while moving only the
  // wall-normal axis to that front edge.
  const x = type === "farmhouse"
    ? side === "left"
      ? cabinet.x + footprint.w - plan.width
      : side === "right"
        ? cabinet.x
        : centeredX
    : centeredX;
  const y = type === "farmhouse"
    ? side === "top"
      ? cabinet.y + footprint.d - plan.depth
      : side === "bottom"
        ? cabinet.y
        : centeredY
    : centeredY;
	  const cardinalWall = side === "top" || side === "bottom" || side === "left" || side === "right";
	  const planRotation = cardinalWall ? 0 : ((Number(cabinet.rotation) % 360) + 360) % 360;
	  return { ...makeSink(type, x, y, side, { width: rawWidth, depth: rawDepth }), cabinetUid: cabinet.uid, planRotation };
}

/** Repairs legacy sink fixtures so their plan footprint matches the owning sink-base wall. */
export function normalizeSinkFixturesToBases(
  sinks: SinkFixture[],
  placed: PlacedCabinet[],
  room: RoomData,
): SinkFixture[] {
  let changed = false;
  const normalized = sinks.map((sink) => {
    const owner = placed.find((cabinet) => cabinet.uid === sink.cabinetUid && isSinkBaseCabinet(cabinet))
      ?? placed.find((cabinet) => isSinkBaseCabinet(cabinet) && fixtureIsOnCabinetFootprint(sink, cabinet));
    if (!owner) return sink;
    const sourceWidth = sink.sourceWidth ?? sink.width;
    const sourceDepth = sink.sourceDepth ?? sink.depth;
    const next = makeSinkForCabinet(sink.type, owner, room, { width: sourceWidth, depth: sourceDepth });
    const same = sink.x === next.x && sink.y === next.y && sink.width === next.width && sink.depth === next.depth && sink.wallSide === next.wallSide && sink.planRotation === next.planRotation && sink.sourceWidth === next.sourceWidth && sink.sourceDepth === next.sourceDepth && sink.cabinetUid === next.cabinetUid;
    if (same) return sink;
    changed = true;
    return {
      ...next,
      uid: sink.uid,
      faucet: sink.faucet,
      pelicanProductId: sink.pelicanProductId,
      pelicanProductName: sink.pelicanProductName,
      pelicanProductImage: sink.pelicanProductImage,
      pelicanProfileId: sink.pelicanProfileId,
      bowlWidth: sink.bowlWidth,
      bowlDepth: sink.bowlDepth,
      bowlHeight: sink.bowlHeight,
      bowlCount: sink.bowlCount,
      bowlWidths: sink.bowlWidths,
      bowlDepths: sink.bowlDepths,
      bowlHeights: sink.bowlHeights,
      drainInsetRight: sink.drainInsetRight,
      drainInsetBack: sink.drainInsetBack,
      exteriorHeight: sink.exteriorHeight,
      apronFront: sink.apronFront,
      surfaceFinish: sink.surfaceFinish,
      pelicanFaucetProductId: sink.pelicanFaucetProductId,
      pelicanFaucetProductName: sink.pelicanFaucetProductName,
      pelicanFaucetProductImage: sink.pelicanFaucetProductImage,
      pelicanFaucetProfileId: sink.pelicanFaucetProfileId,
      faucetOverallHeight: sink.faucetOverallHeight,
      faucetSpoutLength: sink.faucetSpoutLength,
      faucetSpoutHeight: sink.faucetSpoutHeight,
      faucetFinish: sink.faucetFinish,
      faucetForm: sink.faucetForm,
    };
  });
  return changed ? normalized : sinks;
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

export type WallGapFitPreview = {
  gap: WallGap;
  containsTarget: boolean;
  requiredSpan: number;
  availableSpan: number;
  shortage: number;
  snapStart: number;
  snapEnd: number;
  before: number;
  after: number;
  status: "valid" | "invalid";
};

export function nearestRectRoomWallAtPoint(room: Pick<RoomData, "width" | "depth" | "peninsulaRuns">, point: { x: number; y: number }): WallSide {
  const x = Math.max(0, Math.min(room.width, point.x));
  const y = Math.max(0, Math.min(room.depth, point.y));
  const terminatedRoom = room as RoomData;
  const topWall = cabinetWallRunSegment("top", terminatedRoom);
  const bottomWall = cabinetWallRunSegment("bottom", terminatedRoom);
  const leftWall = cabinetWallRunSegment("left", terminatedRoom);
  const rightWall = cabinetWallRunSegment("right", terminatedRoom);
  const topOpen = x < topWall.start - COLLISION_EPSILON_IN || x > topWall.start + topWall.length + COLLISION_EPSILON_IN;
  const bottomOpen = x < bottomWall.start - COLLISION_EPSILON_IN || x > bottomWall.start + bottomWall.length + COLLISION_EPSILON_IN;
  const leftOpen = y < leftWall.start - COLLISION_EPSILON_IN || y > leftWall.start + leftWall.length + COLLISION_EPSILON_IN;
  const rightOpen = y < rightWall.start - COLLISION_EPSILON_IN || y > rightWall.start + rightWall.length + COLLISION_EPSILON_IN;
  const distances: Array<{ side: WallSide; distance: number }> = [
    { side: "top", distance: topOpen ? Number.POSITIVE_INFINITY : y },
    { side: "bottom", distance: bottomOpen ? Number.POSITIVE_INFINITY : room.depth - y },
    { side: "left", distance: leftOpen ? Number.POSITIVE_INFINITY : x },
    { side: "right", distance: rightOpen ? Number.POSITIVE_INFINITY : room.width - x },
  ];
  return distances.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best).side;
}

export function wallGapFitPreview(gaps: readonly WallGap[], targetAlong: number, requiredSpan: number): WallGapFitPreview | null {
  const width = Math.max(0, requiredSpan);
  if (gaps.length === 0 || width <= 0) return null;
  const distance = (gap: WallGap) => targetAlong < gap.start ? gap.start - targetAlong : targetAlong > gap.start + gap.length ? targetAlong - gap.start - gap.length : 0;
  const gap = gaps.reduce((best, candidate) => {
    const currentDistance = distance(candidate);
    const bestDistance = distance(best);
    if (currentDistance !== bestDistance) return currentDistance < bestDistance ? candidate : best;
    return Math.abs(candidate.center - targetAlong) < Math.abs(best.center - targetAlong) ? candidate : best;
  });
  const containsTarget = targetAlong >= gap.start - COLLISION_EPSILON_IN && targetAlong <= gap.start + gap.length + COLLISION_EPSILON_IN;
  const valid = containsTarget && gap.length + COLLISION_EPSILON_IN >= width;
  const snapStart = valid ? Math.max(gap.start, Math.min(targetAlong - width / 2, gap.start + gap.length - width)) : gap.start;
  const snapEnd = snapStart + width;
  return { gap, containsTarget, requiredSpan: width, availableSpan: gap.length, shortage: Math.max(0, width - gap.length), snapStart, snapEnd, before: Math.max(0, snapStart - gap.start), after: Math.max(0, gap.start + gap.length - snapEnd), status: valid ? "valid" : "invalid" };
}

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

export interface CabinetWallDragPreview {
  wall: WallSide;
  fit: WallGapFitPreview;
  candidate: PlacedCabinet | null;
  /** True only when the pointer-near position was adjusted to an edge within 3 inches. */
  snapped: boolean;
  /** Proposed snap footprint used by the 3D ghost, including invalid targets. */
  ghostCandidate?: PlacedCabinet | null;
  /** Shift-held mode: exact pointer placement with edge attraction disabled. */
  freehand?: boolean;
}

export interface CabinetWallDragOptions {
  disableSnapping?: boolean;
}

export const RIGHT_DRAG_SNAP_THRESHOLD_IN = 3;

export function isRangeHoodPlacement(moving: Pick<PlacedCabinet, "placement" | "masterCode" | "description">): boolean {
  return moving.placement === "appliance"
    && (/^HOOD[-_]?/i.test(moving.masterCode ?? "") || /range\s+hood/i.test(moving.description ?? ""));
}

/**
 * Right-drag is available to cabinets, floor-seated appliances, and mounted
 * range hoods that occupy a wall run. Other raised appliances (OTR microwaves,
 * sinks, etc.) keep their specialized attachment rules and remain excluded.
 */
export function isWallRunDraggable(
  moving: PlacedCabinet,
  room: RoomData,
): boolean {
  if (moving.placement === "base" || moving.placement === "wall" || moving.placement === "tall") return true;
  if (isRangeHoodPlacement(moving)) return true;
  return moving.placement === "appliance"
    && elevationBox(moving, room).bottom <= COLLISION_EPSILON_IN;
}

/**
 * Resolve a right-button 3D drag along the item's existing wall. The object
 * follows the pointer at 1/8-inch precision while it remains inside a valid free
 * segment. Only an edge within three inches may pull the object into exact
 * contact. This prevents distant occupied-corner jumps while retaining exact
 * zero-overlap seams and bounded-opening placement.
 */
export function cabinetWallDragPreview(
  moving: PlacedCabinet,
  room: RoomData,
  others: PlacedCabinet[],
  openings: WallOpening[],
  targetAlong: number,
  options: CabinetWallDragOptions = {},
): CabinetWallDragPreview | null {
  if (!isWallRunDraggable(moving, room)) return null;
  const wall = cabinetWall(moving, room);
  const footprint = placedFootprint(moving);
  const horizontal = wall === "top" || wall === "bottom";
  const requiredSpan = horizontal ? footprint.w : footprint.d;
  const dragLayer: "base" | "wall" = moving.placement === "wall" || isRangeHoodPlacement(moving) ? "wall" : "base";
  const peers = others.filter((item) => item.uid !== moving.uid);
  const gaps = wallGaps(room, peers, openings, 0)
    .filter((gap) => gap.side === wall && gap.layer === dragLayer);
  const cornerKind = placedCornerGeometryKind(moving);
  const trueRoomCorner = cornerKind === "l-shape" || cornerKind === "diagonal" || cornerKind === "corner-drawer" || cornerKind === "triangle";
  if (trueRoomCorner) {
    const wallSpan = horizontal ? room.width : room.depth;
    const roundedPointerStart = Math.round((targetAlong - requiredSpan / 2) * 8) / 8;
    const pointerStart = Math.max(0, Math.min(Math.max(0, wallSpan - requiredSpan), roundedPointerStart));
    const cornerStarts = [0, Math.max(0, wallSpan - requiredSpan)];
    const nearestCornerStart = cornerStarts.reduce((nearest, start) => (
      Math.abs(pointerStart - start) < Math.abs(pointerStart - nearest) ? start : nearest
    ));
	    const cornerDistance = Math.abs(pointerStart - nearestCornerStart);
	    const withinSnapRange = options.disableSnapping
	      ? cornerDistance <= COLLISION_EPSILON_IN
	      : cornerDistance <= RIGHT_DRAG_SNAP_THRESHOLD_IN + COLLISION_EPSILON_IN;
    const cornerSpot = wallPlacementAt(nearestCornerStart, requiredSpan, Number(moving.depth) || requiredSpan, wall, room);
    const unrotatedCornerCandidate = { ...moving, ...cornerSpot };
    const cornerCandidate = {
      ...unrotatedCornerCandidate,
      rotation: cornerRotationForPlaced(unrotatedCornerCandidate, room),
    };
    const fittingCornerGap = gaps.find((gap) => (
      nearestCornerStart >= gap.start - COLLISION_EPSILON_IN
      && nearestCornerStart + requiredSpan <= gap.start + gap.length + COLLISION_EPSILON_IN
    ));
    const cornerIsClear = Boolean(fittingCornerGap) && !hasCollision(cornerCandidate, peers);
    const gap: WallGap = fittingCornerGap ?? {
      side: wall,
      layer: dragLayer,
      start: nearestCornerStart,
      length: 0,
      center: nearestCornerStart,
      isStandardSize: false,
      isFillerSize: false,
    };
    const fit: WallGapFitPreview = {
      gap,
      containsTarget: withinSnapRange,
      requiredSpan,
      availableSpan: gap.length,
      shortage: Math.max(0, requiredSpan - gap.length),
      snapStart: nearestCornerStart,
      snapEnd: nearestCornerStart + requiredSpan,
      before: Math.max(0, nearestCornerStart - gap.start),
      after: Math.max(0, gap.start + gap.length - nearestCornerStart - requiredSpan),
      status: withinSnapRange && cornerIsClear ? "valid" : "invalid",
    };
    return {
      wall,
      fit,
	      candidate: withinSnapRange && cornerIsClear ? cornerCandidate : null,
	      snapped: !options.disableSnapping && withinSnapRange,
	      ghostCandidate: cornerCandidate,
	      freehand: options.disableSnapping === true,
	    };
  }
  const initialFit = wallGapFitPreview(gaps, targetAlong, requiredSpan);
  if (!initialFit) return null;
  const wallSpan = horizontal ? room.width : room.depth;
  const depth = Number(moving.depth) || (moving.placement === "wall" ? STD.WALL_DEPTH : STD.BASE_DEPTH);
  const candidateAtStart = (start: number): PlacedCabinet => {
    const spot = wallPlacementAt(start, requiredSpan, depth, wall, room);
    return { ...moving, x: spot.x, y: spot.y };
  };
  const roundedPointerStart = Math.round((targetAlong - requiredSpan / 2) * 8) / 8;
  const pointerStart = Math.max(0, Math.min(Math.max(0, wallSpan - requiredSpan), roundedPointerStart));
  const fittingGaps = gaps.filter((gap) => gap.length + COLLISION_EPSILON_IN >= requiredSpan);
  const pointerGap = fittingGaps.find((gap) => (
    pointerStart >= gap.start - COLLISION_EPSILON_IN
    && pointerStart + requiredSpan <= gap.start + gap.length + COLLISION_EPSILON_IN
  ));
  const gapEdgeCandidates = fittingGaps.flatMap((gap) => {
    const trailingStart = gap.start + gap.length - requiredSpan;
    return [gap.start, trailingStart].map((start) => ({ gap, start, distance: Math.abs(pointerStart - start) }));
  });
  // A corner item can be oriented to the perpendicular wall and therefore be
  // absent from this wall's free-segment list even though its physical footprint
  // occupies the corner. Its actual plan edges remain valid seam targets.
  const physicalEdgeCandidates = peers.flatMap((peer) => {
    if (!sharesPlanCollisionZone(moving, peer)) return [];
    const candidateCross = candidateAtStart(pointerStart);
    const candidateSize = placedFootprint(candidateCross);
    const peerSize = placedFootprint(peer);
    const crossOverlap = horizontal
      ? Math.min(candidateCross.y + candidateSize.d, peer.y + peerSize.d) - Math.max(candidateCross.y, peer.y)
      : Math.min(candidateCross.x + candidateSize.w, peer.x + peerSize.w) - Math.max(candidateCross.x, peer.x);
    if (crossOverlap <= COLLISION_EPSILON_IN) return [];
    const peerStart = horizontal ? peer.x : peer.y;
    const peerSpan = horizontal ? peerSize.w : peerSize.d;
    const peerEnd = peerStart + peerSpan;
    const currentGapEnd = initialFit.gap.start + initialFit.gap.length;
    const beforeGapEnd = Math.min(currentGapEnd, peerStart);
    const afterGapStart = Math.max(initialFit.gap.start, peerEnd);
    return [
      {
        gap: { ...initialFit.gap, length: Math.max(0, beforeGapEnd - initialFit.gap.start), center: initialFit.gap.start + Math.max(0, beforeGapEnd - initialFit.gap.start) / 2 },
        start: peerStart - requiredSpan,
      },
      {
        gap: { ...initialFit.gap, start: afterGapStart, length: Math.max(0, currentGapEnd - afterGapStart), center: afterGapStart + Math.max(0, currentGapEnd - afterGapStart) / 2 },
        start: peerEnd,
      },
    ].map((entry) => ({ ...entry, distance: Math.abs(pointerStart - entry.start) }));
  });
	  const edgeCandidates = (options.disableSnapping ? [] : [...gapEdgeCandidates, ...physicalEdgeCandidates])
    .filter((entry) => entry.start >= -COLLISION_EPSILON_IN && entry.start + requiredSpan <= wallSpan + COLLISION_EPSILON_IN)
    .filter((entry) => entry.distance <= RIGHT_DRAG_SNAP_THRESHOLD_IN + COLLISION_EPSILON_IN)
    .filter((entry) => !hasCollision(snapCabinetSeamOverlap(candidateAtStart(entry.start), peers), peers))
    .sort((left, right) => left.distance - right.distance || left.start - right.start);
  const edgeSnap = edgeCandidates[0] ?? null;
  const snapStart = edgeSnap ? edgeSnap.start : pointerGap ? pointerStart : null;
  const ghostStart = snapStart ?? pointerStart;
  const snapEnd = ghostStart + requiredSpan;
  const ghostCandidate = candidateAtStart(ghostStart);
  const ghostSize = placedFootprint(ghostCandidate);
  const baseGap = edgeSnap?.gap ?? pointerGap ?? initialFit.gap;
  let boundedStart = baseGap.start;
  let boundedEnd = baseGap.start + baseGap.length;
  for (const peer of peers) {
    if (!sharesPlanCollisionZone(moving, peer)) continue;
    const peerSize = placedFootprint(peer);
    const crossOverlap = horizontal
      ? Math.min(ghostCandidate.y + ghostSize.d, peer.y + peerSize.d) - Math.max(ghostCandidate.y, peer.y)
      : Math.min(ghostCandidate.x + ghostSize.w, peer.x + peerSize.w) - Math.max(ghostCandidate.x, peer.x);
    if (crossOverlap <= COLLISION_EPSILON_IN) continue;
    const peerStart = horizontal ? peer.x : peer.y;
    const peerSpan = horizontal ? peerSize.w : peerSize.d;
    const peerEnd = peerStart + peerSpan;
    if (peerEnd <= ghostStart + COLLISION_EPSILON_IN) boundedStart = Math.max(boundedStart, peerEnd);
    if (peerStart >= snapEnd - COLLISION_EPSILON_IN) boundedEnd = Math.min(boundedEnd, peerStart);
  }
  const chosenGap: WallGap = {
    ...baseGap,
    start: boundedStart,
    length: Math.max(0, boundedEnd - boundedStart),
    center: boundedStart + Math.max(0, boundedEnd - boundedStart) / 2,
  };
  const fit: WallGapFitPreview = {
    ...initialFit,
    gap: chosenGap,
    containsTarget: pointerGap != null || edgeSnap != null,
    availableSpan: chosenGap.length,
    shortage: Math.max(0, requiredSpan - chosenGap.length),
    snapStart: ghostStart,
    snapEnd,
    before: Math.max(0, ghostStart - chosenGap.start),
    after: Math.max(0, chosenGap.start + chosenGap.length - snapEnd),
    status: snapStart == null ? "invalid" : "valid",
  };
  if (snapStart == null) return { wall, fit, candidate: null, snapped: false, ghostCandidate };
	  const candidate = options.disableSnapping ? ghostCandidate : snapCabinetSeamOverlap(ghostCandidate, peers);
	  const validCandidate = hasCollision(candidate, peers) ? null : candidate;
	  return { wall, fit, candidate: validCandidate, snapped: edgeSnap != null, ghostCandidate: candidate, freehand: options.disableSnapping === true };
}

/**
 * Catalog-drop fit at the exact pointer center. Unlike wallGapFitPreview this
 * never pulls to a gap edge. It remains valid only when the entire object fits
 * inside one measured opening, preserving the same zero-overlap blockers.
 */
export function wallGapFreehandPreview(
  gaps: WallGap[],
  targetAlong: number,
  requiredSpan: number,
): WallGapFitPreview | null {
  if (!Number.isFinite(targetAlong) || !Number.isFinite(requiredSpan) || requiredSpan <= 0 || gaps.length === 0) return null;
  const pointerStart = Math.round((targetAlong - requiredSpan / 2) * 8) / 8;
  const containing = gaps.find((gap) => pointerStart >= gap.start - COLLISION_EPSILON_IN && pointerStart + requiredSpan <= gap.start + gap.length + COLLISION_EPSILON_IN);
  const nearest = wallGapFitPreview(gaps, targetAlong, requiredSpan);
  const gap = containing ?? nearest?.gap;
  if (!gap) return null;
  const end = pointerStart + requiredSpan;
  return {
    gap,
    containsTarget: containing != null,
    requiredSpan,
    availableSpan: gap.length,
    shortage: Math.max(0, requiredSpan - gap.length),
    snapStart: pointerStart,
    snapEnd: end,
    before: Math.max(0, pointerStart - gap.start),
    after: Math.max(0, gap.start + gap.length - end),
    status: containing ? "valid" : "invalid",
  };
}

// Build a map of one representative REAL base cabinet per standard width from a
// palette pool. Prefers a plain base box over sink/specialty/corner units so a
// gap suggestion reads like a clean filler-run cabinet. Only widths in the
// [9, 48] standard range are considered. Pure + unit-testable; the Design Tool
// feeds this to the click-to-place gap popover.
export function gapFillCandidatesByWidth(
  pool: Pick<DesignCabinet, "masterCode" | "subCategory" | "width" | "isCornerCabinet">[]
): Map<number, (typeof pool)[number]> {
  const byWidth = new Map<number, (typeof pool)[number]>();
  const rank = (c: (typeof pool)[number]): number => {
    const code = (c.masterCode || "").toUpperCase();
    const sub = (c.subCategory || "").toLowerCase();
    if (c.isCornerCabinet === true || /corner|lazy susan|easy reach/.test(sub)) return 4;
    if (/vanity/.test(sub)) return 4;
    if (/sink/.test(sub) || code.startsWith("SB")) return 2;
    if (/specialty|blind|lazy|susan|trash|waste/.test(sub)) return 3;
    if (code.startsWith("B") || code.startsWith("DB") || sub.includes("base")) return 0;
    return 1;
  };
  for (const c of pool) {
    const w = Math.round(Number(c.width) || 0);
    if (w < 9 || w > 48) continue;
    const existing = byWidth.get(w);
    if (!existing || rank(c) < rank(existing)) byWidth.set(w, c);
  }
  return byWidth;
}

export type SmartGapRecommendation<T> =
  | { kind: "filler"; remaining: number }
  | { kind: "cabinet"; cabinet: T; remaining: number }
  | { kind: "cabinet-with-filler"; cabinet: T; remaining: number };

/**
 * Deterministic, catalog-scoped advice for a short active-wall run. The caller
 * supplies only available cabinets in the selected line/style, so the helper
 * cannot recommend a generic or unsellable cabinet. It intentionally produces
 * advice only; the user must click a suggested action to place anything.
 */
export function smartGapRecommendation<T extends Pick<DesignCabinet, "width">>(
  gap: Pick<WallGap, "length">,
  candidates: Map<number, T>,
  threshold = Number.POSITIVE_INFINITY,
): SmartGapRecommendation<T> | null {
  const length = Math.round(gap.length * 100) / 100;
  if (length <= 0 || length >= threshold) return null;
  if (length <= 6) return { kind: "filler", remaining: length };
  const widths = Array.from(candidates.keys()).filter((width) => width <= length + 0.01).sort((a, b) => b - a);
  const selectedWidth = widths[0];
  if (selectedWidth == null) return null;
  const cabinet = candidates.get(selectedWidth)!;
  const remaining = Math.round((length - selectedWidth) * 100) / 100;
  if (remaining > 0.01 && remaining <= 6) return { kind: "cabinet-with-filler", cabinet, remaining };
  return { kind: "cabinet", cabinet, remaining };
}

export type SmartGapCatalogOption<T> = { cabinet: T; remaining: number; needsFiller: boolean };

/** All fitting catalog choices for a selected active-wall gap, before filtering or ordering. */
export function smartGapCatalogOptions<T extends Pick<DesignCabinet, "masterCode" | "width">>(
  gap: Pick<WallGap, "length">,
  candidates: readonly T[],
  threshold = Number.POSITIVE_INFINITY,
): SmartGapCatalogOption<T>[] {
  const length = Math.round(gap.length * 100) / 100;
  if (length <= 6 || length >= threshold) return [];
  return candidates
    .map((cabinet) => ({ cabinet, width: Number(cabinet.width) || 0 }))
    .filter(({ width }) => width >= 9 && width <= length + 0.01)
    .map(({ cabinet, width }) => {
      const remaining = Math.round((length - width) * 100) / 100;
      return { cabinet, remaining, needsFiller: remaining > 0.01 && remaining <= 6 };
    })
    .sort((a, b) => Number(b.cabinet.width) - Number(a.cabinet.width) || a.cabinet.masterCode.localeCompare(b.cabinet.masterCode));
}

/** The one-action best fit for any selected empty space; never invents a SKU. */
export function bestFitCatalogOption<T extends Pick<DesignCabinet, "masterCode" | "width">>(gap: Pick<WallGap, "length">, candidates: readonly T[]): SmartGapCatalogOption<T> | null {
  return smartGapCatalogOptions(gap, candidates)[0] ?? null;
}

function cabinetFamilyPrefix(masterCode: string): string {
  return (masterCode.toUpperCase().match(/^[A-Z]+/)?.[0] ?? "").trim();
}

/**
 * Catalog-only smaller wall alternatives for a failed placement. Matching the
 * master-code family, height, and depth prevents a deep WR refrigerator upper
 * from being replaced with an unrelated standard-depth W cabinet. Every result
 * either fills the opening exactly or leaves at most one catalog-filler span.
 */
export function compatibleWallCabinetAlternatives<T extends Pick<DesignCabinet, "masterCode" | "width" | "height" | "depth" | "placement">>(
  requested: Pick<PlacedCabinet, "masterCode" | "width" | "height" | "depth" | "placement">,
  availableSpan: number,
  candidates: readonly T[],
): SmartGapCatalogOption<T>[] {
  if (requested.placement !== "wall" || availableSpan <= 0) return [];
  const family = cabinetFamilyPrefix(requested.masterCode);
  const requestedHeight = Number(requested.height) || 0;
  const requestedDepth = Number(requested.depth) || 0;
  const matching: T[] = candidates.flatMap<T>((candidate) => {
    if (candidate.placement !== "wall" || cabinetFamilyPrefix(candidate.masterCode) !== family) return [];
    const skuDimensions = wallCabinetSkuDimensions(candidate.masterCode);
    const width = skuDimensions?.width ?? (Number(candidate.width) || 0);
    const height = skuDimensions?.height ?? (Number(candidate.height) || 0);
    const depth = skuDimensions?.depth ?? (Number(candidate.depth) || 0);
    const compatible = width > 0 && width < requested.width - COLLISION_EPSILON_IN &&
      Math.abs(height - requestedHeight) <= COLLISION_EPSILON_IN &&
      Math.abs(depth - requestedDepth) <= COLLISION_EPSILON_IN;
    return compatible ? [{ ...candidate, width: String(width), height: String(height), depth: String(depth) } as T] : [];
  });
  return smartGapCatalogOptions({ length: availableSpan }, matching, Number.POSITIVE_INFINITY).filter((option) => option.remaining <= 0.01 || option.remaining <= 6);
}

/** Preview layers are derived for rendering only and never mutate saved placements. */
export function withTemporarySmartGapPreview<T>(placed: readonly T[], preview: readonly T[]): T[] {
  return preview.length > 0 ? [...placed, ...preview] : [...placed];
}

/** Wrap-safe navigation for temporary Smart Gap previews. */
export function nextSmartGapPreviewIndex(currentIndex: number, optionCount: number, direction: -1 | 1): number {
  if (optionCount <= 1) return 0;
  return (currentIndex + direction + optionCount) % optionCount;
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

// ─── Plan Annotations (text notes) ──────────────────────────────────────────
// User-placed text labels on the floor plan. They carry position (inches from
// room origin) and a short text string. Persisted in the draft.
export interface PlanAnnotation {
  uid: string;
  x: number; // inches from left edge of room
  y: number; // inches from top edge of room
  text: string;
}

export function makeAnnotation(x: number, y: number, text: string): PlanAnnotation {
  return { uid: crypto.randomUUID(), x, y, text };
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
  pattern: "hardwood" | "tile-grid" | "tile-diagonal" | "tile-stagger" | "herringbone" | "chevron" | "solid" | "plank";
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
  { id: "brick-lay-tile",    name: "Brick-Lay Porcelain",  fill: "#e8e0d8", grout: "#c0b8a8", pattern: "tile-stagger", tileW: 24, tileH: 12 },
  { id: "chevron-wood",      name: "Chevron Wood",         fill: "#b89060", grout: "#907040", pattern: "chevron",      tileW: 3,  tileH: 18 },
  { id: "luxury-vinyl",      name: "Luxury Vinyl Plank",   fill: "#c0a870", grout: "#a08050", pattern: "plank",        tileW: 7,  tileH: 48 },
  { id: "concrete",          name: "Polished Concrete",    fill: "#9a9ea2", grout: "#9a9ea2", pattern: "solid",        tileW: 24, tileH: 24 },
  { id: "none",              name: "No Flooring",          fill: "#f5f3ef", grout: "#f5f3ef", pattern: "solid",        tileW: 12, tileH: 12 },
];

export function flooringMaterial(id: string | null | undefined): FlooringMaterial {
  return FLOORING_MATERIALS.find((m) => m.id === id) ?? FLOORING_MATERIALS[10];
}

// ─── LVP Flooring Layout Patterns ─────────────────────────────────────────────
// When the user selects a plank/hardwood-type flooring, they can also choose
// how the planks are laid out. This affects the plan-view SVG tile rendering.
export type FlooringLayoutPattern = "random-stagger" | "third-offset" | "diagonal" | "herringbone";

export const FLOORING_LAYOUT_PATTERNS: { id: FlooringLayoutPattern; name: string; description: string }[] = [
  { id: "random-stagger", name: "Random Stagger", description: "Natural look, minimal waste" },
  { id: "third-offset", name: "1/3 Offset", description: "Clean geometric flow" },
  { id: "diagonal", name: "Diagonal", description: "45° angle, makes rooms feel larger" },
  { id: "herringbone", name: "Herringbone", description: "Classic V-shape zigzag" },
];

// ─── Pony Wall ────────────────────────────────────────────────────────────────
// A half-wall / peninsula divider placed freely on the floor plan.
// Height defaults to 34.5" (counter height) so base cabinets sit flush on top.
export type DrywallPonyWallTexture = "smooth" | "orange-peel" | "light-plaster";

export const DEFAULT_DRYWALL_PONY_WALL_COLOR = "#e7e1d5";

export const DRYWALL_PONY_WALL_TEXTURE_OPTIONS: Array<{
  id: DrywallPonyWallTexture;
  label: string;
  description: string;
  roughness: number;
}> = [
  { id: "smooth", label: "Smooth drywall", description: "Clean painted-wall finish", roughness: 0.78 },
  { id: "orange-peel", label: "Orange peel", description: "Fine sprayed wall texture", roughness: 0.9 },
  { id: "light-plaster", label: "Light plaster", description: "Subtle hand-troweled texture", roughness: 0.96 },
];

function validDrywallColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Resolves legacy drywall walls safely and supplies a single Plan/3D appearance contract. */
export function drywallPonyWallAppearance(ponyWall: Pick<PonyWall, "drywallColor" | "drywallTexture">): {
  color: string;
  texture: DrywallPonyWallTexture;
  roughness: number;
} {
  const texture = DRYWALL_PONY_WALL_TEXTURE_OPTIONS.some((option) => option.id === ponyWall.drywallTexture)
    ? ponyWall.drywallTexture as DrywallPonyWallTexture
    : "smooth";
  const option = DRYWALL_PONY_WALL_TEXTURE_OPTIONS.find((candidate) => candidate.id === texture)!;
  return {
    color: validDrywallColor(ponyWall.drywallColor) ? ponyWall.drywallColor : DEFAULT_DRYWALL_PONY_WALL_COLOR,
    texture,
    roughness: option.roughness,
  };
}

/**
 * Reusable CSS paint-and-texture swatch for the edit dialog and Plan. This is
 * deliberately procedural rather than an image asset: the thumbnail updates
 * immediately for any chosen paint color and uses the same texture cue that
 * appears on the measured 2D pony wall.
 */
export function drywallPonyWallPreviewBackground(ponyWall: Pick<PonyWall, "drywallColor" | "drywallTexture">): string {
  const appearance = drywallPonyWallAppearance(ponyWall);
  if (appearance.texture === "orange-peel") {
    return `radial-gradient(circle at 2px 2px, rgba(78,70,59,0.15) 0 1px, transparent 1.4px), ${appearance.color}`;
  }
  if (appearance.texture === "light-plaster") {
    return `repeating-linear-gradient(135deg, rgba(78,70,59,0.12) 0 1px, transparent 1px 5px), ${appearance.color}`;
  }
  return appearance.color;
}

/**
 * Resolves the single paint finish shared by the physical room shell. Reusing
 * the pony-wall appearance contract guarantees the Apply to all walls action
 * cannot make Plan and 3D disagree about color or texture defaults.
 */
export function roomWallAppearance(room: Pick<RoomData, "wallAppearance"> | null | undefined): {
  color: string;
  texture: DrywallPonyWallTexture;
  roughness: number;
} {
  return drywallPonyWallAppearance({
    drywallColor: room?.wallAppearance?.color,
    drywallTexture: room?.wallAppearance?.texture,
  });
}

export interface PonyWall {
  uid: string;
  x: number;      // inches from room left
  y: number;      // inches from room top
  width: number;  // inches (horizontal span)
  depth: number;  // inches (wall thickness)
  height: number; // inches tall — default 34.5 (counter height)
  label?: string;
  /**
   * Optional live attachment to a peninsula endpoint. Attached pony walls are
   * evaluated from the peninsula's measured geometry on every render, so moving
   * the peninsula attachment or changing its length keeps the half wall snapped.
   */
  peninsulaRunId?: string;
  peninsulaEnd?: "start" | "end";
  /** A pony wall can continue straight or take the same locked 45° turn selected in the peninsula builder. */
  peninsulaTurn?: 0 | 45;
  peninsulaDirection?: PeninsulaDirection;
  /** A full-length drywall pony wall centered immediately behind the cabinet face of its peninsula run. */
  peninsulaPlacement?: "endpoint" | "behind-cabinets";
  /** Finish note used by the plan and 3D renderer; structural geometry remains a true pony wall. */
  finish?: "drywall";
  /** Customer-selected painted drywall color for a behind-cabinet peninsula wall. */
  drywallColor?: string;
  /** Customer-selected wall surface texture for a behind-cabinet peninsula wall. */
  drywallTexture?: DrywallPonyWallTexture;
  /** Legacy/free-standing pony walls may keep an explicit plan rotation. */
  rotation?: number;
}

export interface PonyWallPlanFrame {
  start: { x: number; y: number };
  end: { x: number; y: number };
  radians: number;
  width: number;
  depth: number;
  height: number;
  attachedToPeninsula: boolean;
}

/**
 * Resolve the actual plan frame for both free-standing and peninsula-attached
 * pony walls. The persisted x/y fallback keeps older plans intact, while a
 * peninsula owner always wins for a new builder-created pony wall.
 */
export function ponyWallPlanFrame(
  ponyWall: PonyWall,
  room: Pick<RoomData, "width" | "depth" | "peninsulaRuns">,
): PonyWallPlanFrame {
  const run = ponyWall.peninsulaRunId
    ? room.peninsulaRuns?.find((candidate) => candidate.id === ponyWall.peninsulaRunId)
    : undefined;
  const width = Math.max(6, Number(ponyWall.width) || 6);
  const depth = Math.max(1, Number(ponyWall.depth) || 6);
  const height = Math.max(1, Number(ponyWall.height) || 34.5);
  if (!run) {
    const radians = ((Number(ponyWall.rotation) || 0) * Math.PI) / 180;
    const start = { x: Number(ponyWall.x) || 0, y: Number(ponyWall.y) || 0 };
    return {
      start,
      end: { x: start.x + Math.cos(radians) * width, y: start.y + Math.sin(radians) * width },
      radians,
      width,
      depth,
      height,
      attachedToPeninsula: false,
    };
  }
  const geometry = peninsulaRunEndpoints(run, room);
  const behindCabinets = ponyWall.peninsulaPlacement === "behind-cabinets";
  const leftNormal = { x: -Math.sin(geometry.radians), y: Math.cos(geometry.radians) };
  const cabinetFaceNormal = run.cabinetSide === "right"
    ? { x: -leftNormal.x, y: -leftNormal.y }
    : leftNormal;
  // The wall's cabinet-side edge meets the peninsula centerline exactly. This
  // keeps the drywall pony wall physically behind the selected cabinet face
  // instead of running through cabinet boxes on both sides of the line.
  const rawStart = behindCabinets
    ? geometry.start
    : ponyWall.peninsulaEnd === "start" ? geometry.start : geometry.end;
  const start = behindCabinets
    ? {
        x: rawStart.x - cabinetFaceNormal.x * depth / 2,
        y: rawStart.y - cabinetFaceNormal.y * depth / 2,
      }
    : rawStart;
  const turn = ponyWall.peninsulaTurn === 45 ? Math.PI / 4 : 0;
  const radians = geometry.radians + (turn === 0 ? 0 : ponyWall.peninsulaDirection === "left" ? -turn : turn);
  const resolvedWidth = behindCabinets ? Math.max(6, Number(run.length) || 6) : width;
  return {
    start,
    end: { x: start.x + Math.cos(radians) * resolvedWidth, y: start.y + Math.sin(radians) * resolvedWidth },
    radians,
    width: resolvedWidth,
    depth,
    height,
    attachedToPeninsula: true,
  };
}

/** Creates a measured pony-wall continuation that stays snapped to a peninsula endpoint. */
export function makePeninsulaPonyWall(
  run: PeninsulaRun,
  room: Pick<RoomData, "width" | "depth" | "peninsulaRuns">,
  options: {
    width?: number;
    depth?: number;
    height?: number;
    turn?: 0 | 45;
    direction?: PeninsulaDirection;
    label?: string;
  } = {},
): PonyWall {
  const turn = options.turn === 45 ? 45 : 0;
  const direction = options.direction ?? "right";
  const anchor = peninsulaRunEndpoints(run, room).end;
  return {
    uid: `pw-peninsula-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: anchor.x,
    y: anchor.y,
    width: Math.max(6, Math.round((options.width ?? 36) * 8) / 8),
    depth: Math.max(1, Math.round((options.depth ?? 6) * 8) / 8),
    height: Math.max(1, Math.round((options.height ?? run.height) * 8) / 8),
    label: options.label ?? (turn === 45 ? `Pony wall · 45° ${direction} follow` : "Pony wall · peninsula follow"),
    peninsulaRunId: run.id,
    peninsulaEnd: "end",
    peninsulaTurn: turn,
    peninsulaDirection: direction,
  };
}

/**
 * Creates the optional half-height, drywall-finished pony wall directly behind
 * a peninsula cabinet run. Its visible length always resolves from the run, so
 * editing that run cannot leave a loose or mismatched divider in the room.
 */
export function makePeninsulaDrywallBackPonyWall(
  run: PeninsulaRun,
  room: Pick<RoomData, "width" | "depth" | "peninsulaRuns">,
  options: { depth?: number; height?: number; color?: string; texture?: DrywallPonyWallTexture } = {},
): PonyWall {
  const anchor = peninsulaRunEndpoints(run, room).start;
  const appearance = drywallPonyWallAppearance({ drywallColor: options.color, drywallTexture: options.texture });
  return {
    uid: `pw-peninsula-back-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: anchor.x,
    y: anchor.y,
    width: Math.max(6, Math.round((Number(run.length) || 6) * 8) / 8),
    depth: Math.max(1, Math.round((options.depth ?? 4.5) * 8) / 8),
    height: Math.max(1, Math.round((options.height ?? run.height) * 8) / 8),
    label: "Drywall pony wall · behind peninsula",
    peninsulaRunId: run.id,
    peninsulaEnd: "start",
    peninsulaTurn: 0,
    peninsulaDirection: run.direction,
    peninsulaPlacement: "behind-cabinets",
    finish: "drywall",
    drywallColor: appearance.color,
    drywallTexture: appearance.texture,
  };
}

/** A rotated/attached pony wall must remain inside the measured room outline. */
export function ponyWallFitsRoom(ponyWall: PonyWall, room: Pick<RoomData, "width" | "depth" | "peninsulaRuns">): boolean {
  const frame = ponyWallPlanFrame(ponyWall, room);
  const tangent = { x: Math.cos(frame.radians), y: Math.sin(frame.radians) };
  const normal = { x: -tangent.y, y: tangent.x };
  const halfDepth = frame.depth / 2;
  const corners = [
    { along: 0, side: -halfDepth },
    { along: 0, side: halfDepth },
    { along: frame.width, side: -halfDepth },
    { along: frame.width, side: halfDepth },
  ];
  return corners.every(({ along, side }) => {
    const x = frame.start.x + tangent.x * along + normal.x * side;
    const y = frame.start.y + tangent.y * along + normal.y * side;
    return x >= -COLLISION_EPSILON_IN && x <= room.width + COLLISION_EPSILON_IN && y >= -COLLISION_EPSILON_IN && y <= room.depth + COLLISION_EPSILON_IN;
  });
}

export function makePonyWall(room: RoomData): PonyWall {
  return {
    uid: `pw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: Math.max(6, room.width / 2 - 24),
    y: Math.max(6, room.depth / 2 - 3),
    width: Math.min(48, room.width - 12),
    depth: 6,
    height: 34.5,
  };
}

/** Clamp a pony wall so it stays inside the room bounds. */
export function clampPonyWall(pw: PonyWall, room: RoomData): PonyWall {
  const x = Math.max(0, Math.min(pw.x, room.width - pw.width));
  const y = Math.max(0, Math.min(pw.y, room.depth - pw.depth));
  return { ...pw, x, y };
}

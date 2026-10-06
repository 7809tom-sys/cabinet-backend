import { CLOSET_PARTS, masterTracProduct, type MasterTracProduct } from "./closet";
import { towerStorageSkuReferences } from "./masterTracTower";

export type StudioMode = "closet" | "pantry" | "mudroom";
export type StudioMount = "floor" | "hanging";
export type StudioWall = "back" | "left" | "right" | "front";
export type StudioKind = "shelf" | "rod" | "drawer" | "shoe";
export type StudioReferenceKind = StudioKind | "fixedShelf";
export type StudioItem = { id: string; kind: StudioKind; bottomIn: number };
export type StudioCornerId = "back-left" | "back-right" | "front-left" | "front-right";
export type StudioCornerShelfMount = "fixed" | "adjustable";
/** A planning-only record: the source does not yet provide the board profile, support layout, or installation connection details. */
export type StudioCornerShelf = {
  id: string;
  sku: string;
  finish: StudioDesign["finish"];
  mount: StudioCornerShelfMount;
  profile: "curved-illustrative";
  cornerId: StudioCornerId;
  wallIds: [StudioWall, StudioWall];
  elevationIn: number;
  nominalFootprintIn: number;
  geometryRevision: string;
  geometrySource: "MasterTrac Spec Book NP 2026 p. 13";
  capability: "visualPlanning";
};
/** A saved product-reference selection only: no bay, elevation, decorative mesh, collision envelope, material line, or installation claim is created. */
export type StudioBasketReference = {
  id: string;
  sku: string;
  finish: "Chrome";
  nominalHeightIn: 6 | 11 | 17;
  nominalWidthIn: 18 | 24 | 30;
  sourceRevision: "floor-579554-p13-historical-reference-v1";
  capability: "referenceOnly";
};
/** `widthIn` is the measured installed clear width; `stockWidthIn` retains the purchased shelf SKU width when field-cut. */
export type StudioBay = { id: string; widthIn: number; stockWidthIn?: 18 | 24 | 30; items: StudioItem[] };
export type StudioDesign = {
  version: 1;
  mode: StudioMode;
  mount: StudioMount;
  finish: "Glacier White" | "Slate Rift" | "Spiced Mahogany";
  wall: StudioWall;
  wallWidthIn: number;
  roomDepthIn: number;
  bays: StudioBay[];
  cornerShelves?: StudioCornerShelf[];
  basketReferences?: StudioBasketReference[];
};
export type StudioShelfCut = { stockWidthIn: 18 | 24 | 30; installedWidthIn: number; offcutIn: number };
export type ReferenceLine = { sku: string; label: string; qty: number; unitUsd: number; section: "cleat" | "panel" | "shelf" | "accessory" | "hardware"; packNote?: string; stockWidthIn?: number; installedWidthIn?: number; offcutIn?: number };
export type StudioTakeoff = { lines: ReferenceLine[]; subtotalUsd: number; missing: string[] };

const THICKNESS = 0.75;
const WIDTHS = [18, 24, 30] as const;
const CUT_PLANNING_MIN_IN = 12;
const EPS = 0.000001;
const STUDIO_SHOE_SHELF_DEPTH_IN = 14.5;
const STUDIO_SHOE_FENCE_HEIGHT_IN = 0.16;
export const STUDIO_CORNER_SHELF_NOMINAL_FOOTPRINT_IN = 29.5;
export const STUDIO_CORNER_SHELF_THICKNESS_IN = 0.75;
/** 2026 nominal envelope only. The 2022 floor manual lists 29¼ in actual but does not publish the curved profile. */
export const STUDIO_CORNER_SHELF_GEOMETRY_REVISION = "mastertrac-np-2026-p13-nominal-envelope-v1";
export type StudioFitCapabilityStatus = "referenceOnly" | "visualPlanning" | "fitVerified";
export type StudioFitCapability = { sku: string; family: "cornerShelf" | "basket"; status: StudioFitCapabilityStatus; source: string; reason: string };
export type StudioBasketReferenceOption = { sku: string; nominalHeightIn: 6 | 11 | 17; nominalWidthIn: 18 | 24 | 30; finish: "Chrome"; sourceRevision: StudioBasketReference["sourceRevision"] };
/** Source version, geometry status, and missing-fit boundary. This is not a sales or installation registry. */
export const STUDIO_FIT_CAPABILITY_REGISTRY: readonly StudioFitCapability[] = [
  { sku: "432556", family: "cornerShelf", status: "visualPlanning", source: "MasterTrac Spec Book NP 2026 p. 13", reason: "29.5 in nominal envelope accepted for visual planning; curved profile, supports, and connections remain unverified." },
  { sku: "432557", family: "cornerShelf", status: "visualPlanning", source: "MasterTrac Spec Book NP 2026 p. 13", reason: "29.5 in nominal envelope accepted for visual planning; curved profile, supports, and connections remain unverified." },
  ...["432897", "432898", "432899", "432900", "432901", "432902", "432903", "432904", "432905"].map((sku) => ({ sku, family: "basket" as const, status: "referenceOnly" as const, source: "Floor Mount 579554 p. 13 / MasterTrac Spec Book NP 2026 p. 46", reason: "Outer envelope, rails, mounting offsets, travel, and clearances are not source-verified." })),
];
/** Historical 2022 basket identification only. The 2026 446807–446815 family is deliberately not substituted here. */
export const STUDIO_BASKET_REFERENCE_OPTIONS: readonly StudioBasketReferenceOption[] = [
  { sku: "432897", nominalHeightIn: 6, nominalWidthIn: 18, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
  { sku: "432900", nominalHeightIn: 6, nominalWidthIn: 24, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
  { sku: "432903", nominalHeightIn: 6, nominalWidthIn: 30, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
  { sku: "432898", nominalHeightIn: 11, nominalWidthIn: 18, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
  { sku: "432901", nominalHeightIn: 11, nominalWidthIn: 24, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
  { sku: "432904", nominalHeightIn: 11, nominalWidthIn: 30, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
  { sku: "432899", nominalHeightIn: 17, nominalWidthIn: 18, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
  { sku: "432902", nominalHeightIn: 17, nominalWidthIn: 24, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
  { sku: "432905", nominalHeightIn: 17, nominalWidthIn: 30, finish: "Chrome", sourceRevision: "floor-579554-p13-historical-reference-v1" },
];
export const STUDIO_MODES: StudioMode[] = ["closet", "pantry", "mudroom"];
export const STUDIO_PART_KINDS: StudioKind[] = ["shelf", "rod", "drawer", "shoe"];
export const STUDIO_WALLS: StudioWall[] = ["back", "left", "right", "front"];
export const STUDIO_CORNER_IDS: StudioCornerId[] = ["back-left", "back-right", "front-left", "front-right"];
export const STUDIO_FINISHES: StudioDesign["finish"][] = ["Glacier White", "Slate Rift", "Spiced Mahogany"];
/** Owner-approved visual presentation only; the supplied catalog does not certify this pitch, attachment, or clearances. */
export const STUDIO_ILLUSTRATIVE_SHOE_PITCH_DEG = 45;
const STUDIO_ILLUSTRATIVE_SHOE_PITCH_RAD = STUDIO_ILLUSTRATIVE_SHOE_PITCH_DEG * Math.PI / 180;
/** Conservative rise for the 14.5-inch shoe board plus its illustrative fence, used only to keep the visual clear of adjacent parts. */
const STUDIO_ILLUSTRATIVE_SHOE_ENVELOPE_HEIGHT_IN = STUDIO_SHOE_SHELF_DEPTH_IN * Math.sin(STUDIO_ILLUSTRATIVE_SHOE_PITCH_RAD)
  + (THICKNESS + STUDIO_SHOE_FENCE_HEIGHT_IN) * Math.cos(STUDIO_ILLUSTRATIVE_SHOE_PITCH_RAD);
export const MODE_RECOMMENDATIONS: Record<StudioMode, StudioKind[]> = {
  closet: ["shelf", "rod", "shoe"], pantry: ["shelf", "drawer"], mudroom: ["shoe", "rod", "shelf"],
};

export function createStudioDesign(): StudioDesign {
  return { version: 1, mode: "closet", mount: "floor", finish: "Glacier White", wall: "back", wallWidthIn: 120, roomDepthIn: 96,
    bays: [{ id: "bay-1", widthIn: 24, items: [{ id: "shelf-1", kind: "shelf", bottomIn: 38 }] }] };
}
export const studioPanelHeight = (design: StudioDesign) => design.mount === "hanging" ? 80 : 87;
export const studioFixedBottom = (design: StudioDesign) => design.mount === "hanging" ? 1.5 : 6;
export const studioFixedTop = (design: StudioDesign) => studioPanelHeight(design) - THICKNESS;
export const studioWidth = (design: StudioDesign) => design.bays.reduce((sum, bay) => sum + bay.widthIn, 0) + THICKNESS * (design.bays.length + 1);
export const studioWallLength = (design: StudioDesign) => design.wall === "left" || design.wall === "right" ? design.roomDepthIn : design.wallWidthIn;
export const studioCornerShelves = (design: StudioDesign) => design.cornerShelves ?? [];
const CORNER_WALL_IDS: Record<StudioCornerId, [StudioWall, StudioWall]> = {
  "back-left": ["back", "left"], "back-right": ["back", "right"], "front-left": ["front", "left"], "front-right": ["front", "right"],
};
type StudioFootprint = { xMin: number; xMax: number; zMin: number; zMax: number };
const studioTowerFootprint = (design: StudioDesign): StudioFootprint => ({ xMin: 0, xMax: studioWidth(design), zMin: 0, zMax: 14.5 });
const intervalsOverlap = (aMin: number, aMax: number, bMin: number, bMax: number) => aMin < bMax - EPS && bMin < aMax - EPS;
const footprintsOverlap = (a: StudioFootprint, b: StudioFootprint) => intervalsOverlap(a.xMin, a.xMax, b.xMin, b.xMax) && intervalsOverlap(a.zMin, a.zMax, b.zMin, b.zMax);

/** Conservative 29.5-inch occupancy, not the unprovided curved board outline, radius, edge profile, or connector layout. */
export function studioCornerPlanningFootprint(design: StudioDesign, shelf: Pick<StudioCornerShelf, "cornerId" | "nominalFootprintIn">): StudioFootprint {
  const span = shelf.nominalFootprintIn;
  switch (shelf.cornerId) {
    case "back-left": return { xMin: 0, xMax: span, zMin: 0, zMax: span };
    case "back-right": return { xMin: design.wallWidthIn - span, xMax: design.wallWidthIn, zMin: 0, zMax: span };
    case "front-left": return { xMin: 0, xMax: span, zMin: design.roomDepthIn - span, zMax: design.roomDepthIn };
    case "front-right": return { xMin: design.wallWidthIn - span, xMax: design.wallWidthIn, zMin: design.roomDepthIn - span, zMax: design.roomDepthIn };
  }
}

/** Measured rectangular planning gap to the straight Studio tower envelope; it is not an installation clearance. */
export function studioCornerMeasuredGap(design: StudioDesign, shelf: Pick<StudioCornerShelf, "cornerId" | "nominalFootprintIn">): { towerGapIn: number; footprint: StudioFootprint } {
  const footprint = studioCornerPlanningFootprint(design, shelf);
  const tower = studioTowerFootprint(design);
  const xGap = Math.max(footprint.xMin - tower.xMax, tower.xMin - footprint.xMax, 0);
  const zGap = Math.max(footprint.zMin - tower.zMax, tower.zMin - footprint.zMax, 0);
  return { towerGapIn: Math.round((xGap && zGap ? Math.hypot(xGap, zGap) : xGap || zGap) * 100) / 100, footprint };
}

const studioCornerProduct = (design: StudioDesign, mount: StudioCornerShelfMount) => {
  const sku = mount === "fixed" ? "432556" : "432557";
  const product = masterTracProduct(sku);
  return product?.finish === design.finish && product.category === "Shelves" && /Corner Shelf/i.test(product.description) ? product : undefined;
};

function studioCornerPlacementError(design: StudioDesign, candidate: StudioCornerShelf, excludeId?: string): string | null {
  if (design.mount !== "floor") return "Corner planning is limited to the floor-mounted visual-planning envelope; hanging support is not verified.";
  if (candidate.nominalFootprintIn !== STUDIO_CORNER_SHELF_NOMINAL_FOOTPRINT_IN || candidate.profile !== "curved-illustrative") return "Use the saved 2026 29.5 in curved-shelf planning envelope; the precise profile is not source-verified.";
  if (candidate.geometryRevision !== STUDIO_CORNER_SHELF_GEOMETRY_REVISION || candidate.geometrySource !== "MasterTrac Spec Book NP 2026 p. 13") return "This corner shelf geometry source is not supported by the Studio planning registry.";
  if (candidate.wallIds[0] !== CORNER_WALL_IDS[candidate.cornerId][0] || candidate.wallIds[1] !== CORNER_WALL_IDS[candidate.cornerId][1]) return "Choose the two incident walls of a 90° room corner.";
  if (design.wallWidthIn < candidate.nominalFootprintIn || design.roomDepthIn < candidate.nominalFootprintIn) return "The room is too small for the conservative 29.5 in corner planning envelope.";
  if (!Number.isFinite(candidate.elevationIn) || candidate.elevationIn < studioFixedBottom(design) + THICKNESS || candidate.elevationIn + STUDIO_CORNER_SHELF_THICKNESS_IN > studioFixedTop(design)) return `Corner shelf elevation must fit between the fixed shelves (${studioFixedBottom(design) + THICKNESS}–${studioFixedTop(design)} in within the panel).`;
  const product = studioCornerProduct(design, candidate.mount);
  if (!product || product.sku !== candidate.sku) return "No matching historical corner shelf SKU is available for the selected finish and fixed/adjustable choice.";
  const footprint = studioCornerPlanningFootprint(design, candidate);
  if (footprintsOverlap(footprint, studioTowerFootprint(design))) return "This 29.5 in corner planning envelope intersects the straight tower. Move the tower or choose a free room corner; shared support is not verified.";
  for (const existing of studioCornerShelves(design)) {
    if (existing.id === excludeId) continue;
    if (footprintsOverlap(footprint, studioCornerPlanningFootprint(design, existing))
      && intervalsOverlap(candidate.elevationIn, candidate.elevationIn + STUDIO_CORNER_SHELF_THICKNESS_IN, existing.elevationIn, existing.elevationIn + STUDIO_CORNER_SHELF_THICKNESS_IN)) return `Corner shelf at ${candidate.elevationIn} in intersects ${existing.mount} corner shelf at ${existing.elevationIn} in.`;
  }
  return null;
}

export function studioCornerDesignError(design: StudioDesign): string | null {
  for (const shelf of studioCornerShelves(design)) {
    const error = studioCornerPlacementError(design, shelf, shelf.id);
    if (error) return error;
  }
  return null;
}

export function addStudioCornerShelf(design: StudioDesign, cornerId: StudioCornerId, mount: StudioCornerShelfMount, elevationIn: number, id = `corner-${Date.now()}`):
  { ok: true; design: StudioDesign; shelf: StudioCornerShelf } | { ok: false; reason: string } {
  const shelf: StudioCornerShelf = { id, sku: mount === "fixed" ? "432556" : "432557", finish: design.finish, mount, profile: "curved-illustrative", cornerId, wallIds: CORNER_WALL_IDS[cornerId], elevationIn: Math.round(elevationIn), nominalFootprintIn: STUDIO_CORNER_SHELF_NOMINAL_FOOTPRINT_IN, geometryRevision: STUDIO_CORNER_SHELF_GEOMETRY_REVISION, geometrySource: "MasterTrac Spec Book NP 2026 p. 13", capability: "visualPlanning" };
  const error = studioCornerPlacementError(design, shelf);
  if (error) return { ok: false, reason: error };
  return { ok: true, shelf, design: { ...design, cornerShelves: [...studioCornerShelves(design), shelf] } };
}

export function moveStudioCornerShelf(design: StudioDesign, id: string, elevationIn: number): { ok: true; design: StudioDesign } | { ok: false; reason: string } {
  const existing = studioCornerShelves(design).find((shelf) => shelf.id === id);
  if (!existing) return { ok: false, reason: "Choose a placed corner shelf first." };
  const candidate = { ...existing, elevationIn: Math.round(elevationIn) };
  const error = studioCornerPlacementError(design, candidate, id);
  if (error) return { ok: false, reason: error };
  return { ok: true, design: { ...design, cornerShelves: studioCornerShelves(design).map((shelf) => shelf.id === id ? candidate : shelf) } };
}

export function removeStudioCornerShelf(design: StudioDesign, id: string): StudioDesign {
  return { ...design, cornerShelves: studioCornerShelves(design).filter((shelf) => shelf.id !== id) };
}

export const studioBasketReferences = (design: StudioDesign) => design.basketReferences ?? [];

export function studioFitCapability(sku: string): StudioFitCapability | undefined {
  return STUDIO_FIT_CAPABILITY_REGISTRY.find((entry) => entry.sku === sku);
}

export function addStudioBasketReference(design: StudioDesign, sku: string, id = `basket-reference-${Date.now()}`):
  { ok: true; design: StudioDesign; reference: StudioBasketReference } | { ok: false; reason: string } {
  const option = STUDIO_BASKET_REFERENCE_OPTIONS.find((entry) => entry.sku === sku);
  const product = masterTracProduct(sku);
  const capability = studioFitCapability(sku);
  if (!option || !product || product.finish !== option.finish || product.category !== "Accessories" || product.placeable || product.packQty !== 1 || capability?.status !== "referenceOnly")
    return { ok: false, reason: "This historical basket reference is not available from the approved source registry." };
  const reference: StudioBasketReference = { id, sku, finish: option.finish, nominalHeightIn: option.nominalHeightIn, nominalWidthIn: option.nominalWidthIn, sourceRevision: option.sourceRevision, capability: "referenceOnly" };
  return { ok: true, reference, design: { ...design, basketReferences: [...studioBasketReferences(design), reference] } };
}

export function removeStudioBasketReference(design: StudioDesign, id: string): StudioDesign {
  return { ...design, basketReferences: studioBasketReferences(design).filter((reference) => reference.id !== id) };
}

export function updateStudioBasketReference(design: StudioDesign, id: string, sku: string): { ok: true; design: StudioDesign; reference: StudioBasketReference } | { ok: false; reason: string } {
  if (!studioBasketReferences(design).some((reference) => reference.id === id)) return { ok: false, reason: "Choose a saved basket reference first." };
  const staged = addStudioBasketReference(removeStudioBasketReference(design, id), sku, id);
  return staged;
}
/** The sourced board remains 0.75-inch thick; a shoe organizer reserves its taller, explicitly illustrative 45-degree visual envelope. */
export const studioItemHeight = (kind: StudioKind) => kind === "drawer" ? 5 : kind === "rod" ? 0 : kind === "shoe" ? STUDIO_ILLUSTRATIVE_SHOE_ENVELOPE_HEIGHT_IN : THICKNESS;
export const studioStockWidth = (bay: StudioBay) => bay.stockWidthIn ?? bay.widthIn;
export function studioBayCut(bay: StudioBay): StudioShelfCut | null {
  const stockWidthIn = studioStockWidth(bay);
  if (!bay.stockWidthIn || stockWidthIn - bay.widthIn <= EPS) return null;
  return { stockWidthIn: bay.stockWidthIn, installedWidthIn: bay.widthIn, offcutIn: Math.round((stockWidthIn - bay.widthIn) * 1000) / 1000 };
}

/** Shelf top/bottom and drawer face thickness are sourced; rod diameter and drawer body remain schematic. */
export function studioCollision(design: StudioDesign, bayIndex: number, candidate: StudioItem, excludeId?: string): string | null {
  const bay = design.bays[bayIndex];
  if (!bay) return "Choose a tower bay.";
  const bottom = studioFixedBottom(design);
  const top = studioFixedTop(design);
  const height = studioItemHeight(candidate.kind);
  if (!Number.isFinite(candidate.bottomIn) || candidate.bottomIn < bottom + THICKNESS || candidate.bottomIn + height > top)
    return `This item must fit between the fixed shelves (${bottom + THICKNESS}–${top} in within the panel).`;
  const occupied = [
    { id: "fixed-bottom", bottomIn: bottom, kind: "shelf" as const },
    { id: "fixed-top", bottomIn: top, kind: "shelf" as const },
    ...bay.items.filter((item) => item.id !== excludeId),
  ];
  for (const other of occupied) {
    if (candidate.kind === "rod" && other.kind === "rod") continue; // Rod-to-rod clearance is unspecified.
    if (candidate.bottomIn < other.bottomIn + studioItemHeight(other.kind) - 0.000001 &&
      other.bottomIn < candidate.bottomIn + height - 0.000001) return `At ${candidate.bottomIn} in this item intersects ${other.kind} at ${other.bottomIn} in. Keep actual parts physically separate.`;
  }
  return null;
}

export function studioProduct(design: StudioDesign, category: string, description: RegExp, widthIn?: number, heightIn?: number): MasterTracProduct | undefined {
  return CLOSET_PARTS.find((p) => p.category === category && p.finish === design.finish && p.packQty === 1 && description.test(p.description)
    && (widthIn == null || p.widthIn === widthIn || p.lengthIn === widthIn)
    && (heightIn == null || p.heightIn === heightIn) && (category === "Cleats" || p.depthIn === 14.5));
}
export function studioPartReferences(design: StudioDesign, bayIndex: number, kind: StudioReferenceKind): MasterTracProduct[] | null {
  const bay = design.bays[bayIndex];
  if (!bay) return null;
  const stockWidthIn = studioStockWidth(bay);
  if (kind === "shelf" || kind === "fixedShelf") {
    const shelf = studioProduct(design, "Shelves", kind === "fixedShelf" ? /\bFixed Shelf\b/i : /\b(?:Adj|Adjustable) Shelf\b/i, stockWidthIn, 0.75);
    return shelf ? [shelf] : null;
  }
  // The manual's field-cut steps are limited to straight fixed/adjustable shelves; other changed-width fits are not verified.
  if (studioBayCut(bay)) return null;
  if (kind === "rod") {
    const rod = CLOSET_PARTS.find((p) => p.category === "Accessories" && p.finish === "Chrome" && p.packQty === 1 && /^8' Rod\b/i.test(p.description));
    const cup = CLOSET_PARTS.find((p) => p.category === "Accessories" && p.finish === "Chrome" && p.packQty === 10 && /^Rod Cup \(10 Each\)/i.test(p.description));
    return rod && cup ? [rod, cup] : null;
  }
  const refs = towerStorageSkuReferences(kind === "drawer"
    ? { kind: "drawers", count: 1, drawerSize: "small", frontStyle: "slab" }
    : { kind: "shoe", count: 1, fenceFinish: "Chrome" }, bay.widthIn, 14.5, design.finish);
  return refs.ok ? refs.parts.map((line) => line.product) : null;
}

/** Plans a measured straight-shelf cut; this is not a cutting, drilling, or installation instruction. */
export function configureStudioBayCut(design: StudioDesign, bayIndex: number, stockWidthIn: 18 | 24 | 30, installedWidthIn: number):
  { ok: true; design: StudioDesign } | { ok: false; reason: string } {
  const bay = design.bays[bayIndex];
  if (!bay) return { ok: false, reason: "Choose a tower bay." };
  if (design.mount !== "floor") return { ok: false, reason: "Cut-to-fit planning is documented here only for floor-mounted straight shelves." };
  if (!WIDTHS.includes(stockWidthIn)) return { ok: false, reason: "Choose a sourced 18, 24, or 30 inch stock shelf." };
  if (!Number.isFinite(installedWidthIn) || installedWidthIn < CUT_PLANNING_MIN_IN || installedWidthIn > stockWidthIn + EPS)
    return { ok: false, reason: `Installed width must be ${CUT_PLANNING_MIN_IN}–${stockWidthIn} in for this planning tool.` };
  const normalizedInstalled = Math.round(installedWidthIn * 1000) / 1000;
  const candidateBay: StudioBay = { ...bay, widthIn: normalizedInstalled, ...(normalizedInstalled < stockWidthIn - EPS ? { stockWidthIn } : {}) };
  if (normalizedInstalled >= stockWidthIn - EPS) delete candidateBay.stockWidthIn;
  if (!studioPartReferences({ ...design, bays: design.bays.map((current, index) => index === bayIndex ? candidateBay : current) }, bayIndex, "fixedShelf")
    || !studioPartReferences({ ...design, bays: design.bays.map((current, index) => index === bayIndex ? candidateBay : current) }, bayIndex, "shelf"))
    return { ok: false, reason: `No matching ${stockWidthIn} inch stock fixed and adjustable shelf SKU is available in the selected finish.` };
  if (candidateBay.stockWidthIn && candidateBay.items.some((item) => item.kind !== "shelf"))
    return { ok: false, reason: "Drawer, shoe organizer, and rod fit is not verified in a field-cut bay. Remove those items or restore full stock width." };
  const candidate: StudioDesign = { ...design, bays: design.bays.map((current, index) => index === bayIndex ? candidateBay : current) };
  if (studioWidth(candidate) > studioWallLength(candidate)) return { ok: false, reason: "The connected towers exceed the selected wall length." };
  const cornerError = studioCornerDesignError(candidate);
  if (cornerError) return { ok: false, reason: cornerError };
  return { ok: true, design: candidate };
}

export function canStageStudioPart(design: StudioDesign, bayIndex: number, kind: StudioKind): string | null {
  if (!design.bays[bayIndex]) return "Choose a tower bay.";
  if (!studioPartReferences(design, bayIndex, kind)) return `No verified March 2022 ${kind} SKU combination fits this bay and finish.`;
  if (studioWidth(design) > studioWallLength(design)) return "The connected towers exceed the selected wall length.";
  return null;
}

/** First free quarter-inch physical slot, or the preferred height snapped to the nearest valid inch. */
export function snapStudioPart(design: StudioDesign, bayIndex: number, kind: StudioKind, preferredIn?: number, id = `item-${Date.now()}`):
  { ok: true; design: StudioDesign; item: StudioItem } | { ok: false; reason: string } {
  const sourceError = canStageStudioPart(design, bayIndex, kind);
  if (sourceError) return { ok: false, reason: sourceError };
  const min = studioFixedBottom(design) + THICKNESS;
  const max = studioFixedTop(design) - studioItemHeight(kind);
  const preferred = preferredIn == null ? kind === "rod" ? 64 : kind === "shoe" ? 24 : kind === "drawer" ? 20 : 42 : preferredIn;
  const clamped = Math.max(min, Math.min(max, Math.round(preferred)));
  const candidates = Array.from({ length: Math.floor((max - min) * 4) + 1 }, (_, i) => Math.round((min + i * 0.25) * 100) / 100);
  candidates.sort((a, b) => Math.abs(a - clamped) - Math.abs(b - clamped) || a - b);
  for (const bottomIn of candidates) {
    const item = { id, kind, bottomIn };
    if (studioCollision(design, bayIndex, item)) continue;
    return { ok: true, item, design: { ...design, bays: design.bays.map((bay, index) => index === bayIndex ? { ...bay, items: [...bay.items, item] } : bay) } };
  }
  return { ok: false, reason: `There is no physical space left in Tower ${bayIndex + 1}; move or remove an item first.` };
}
export function moveStudioItem(design: StudioDesign, bayIndex: number, itemId: string, bottomIn: number):
  { ok: true; design: StudioDesign } | { ok: false; reason: string } {
  const item = design.bays[bayIndex]?.items.find((candidate) => candidate.id === itemId);
  if (!item) return { ok: false, reason: "Choose a placed part first." };
  const next = { ...item, bottomIn: Math.round(bottomIn) };
  const error = studioCollision(design, bayIndex, next, itemId);
  if (error) return { ok: false, reason: error };
  return { ok: true, design: { ...design, bays: design.bays.map((bay, i) => i === bayIndex
    ? { ...bay, items: bay.items.map((existing) => existing.id === itemId ? next : existing) } : bay) } };
}
export function addStudioBay(design: StudioDesign, widthIn: 18 | 24 | 30 = 24):
  { ok: true; design: StudioDesign } | { ok: false; reason: string } {
  if (!WIDTHS.includes(widthIn) || design.bays.length >= 4) return { ok: false, reason: "Choose up to four sourced tower bays." };
  const candidate: StudioDesign = { ...design, bays: [...design.bays, { id: `bay-${Date.now()}`, widthIn, items: [] }] };
  if (studioWidth(candidate) > studioWallLength(candidate)) return { ok: false, reason: "No wall space for a neighboring tower. Choose another wall or a narrower bay." };
  const cornerError = studioCornerDesignError(candidate);
  if (cornerError) return { ok: false, reason: cornerError };
  return { ok: true, design: candidate };
}

/** Shareable, isolated sample. Never substitute this for a customer's saved draft. */
export function createStudioReviewDemo(): StudioDesign {
  let design: StudioDesign = { ...createStudioDesign(), finish: "Spiced Mahogany" };
  const neighbor = addStudioBay(design);
  if (!neighbor.ok) throw new Error(neighbor.reason);
  design = neighbor.design;
  for (const [kind, preferred, id] of [
    ["shoe", 24, "sample-shoe"], ["rod", 64, "sample-rod"], ["drawer", 20, "sample-drawer"],
  ] as const) {
    const staged = snapStudioPart(design, 1, kind, preferred, id);
    if (!staged.ok) throw new Error(staged.reason);
    design = staged.design;
  }
  return design;
}

/** Every priced line is from the public-only 2022 catalog. Unknown screws, anchors, cam locks and slide hardware are NOT silently counted. */
export function studioTakeoff(design: StudioDesign): StudioTakeoff {
  const rows = new Map<string, ReferenceLine>();
  const missing: string[] = [];
  const add = (p: MasterTracProduct | undefined, section: ReferenceLine["section"], qty = 1, packNote?: string, cut?: StudioShelfCut | null) => {
    if (!p) { missing.push(`A ${section} SKU or exact assembly quantity is not verified.`); return; }
    const key = `${section}:${p.sku}:${cut ? `${cut.stockWidthIn}:${cut.installedWidthIn}` : "full"}`;
    const row = rows.get(key);
    if (row) row.qty += qty;
    else {
      const cutSuffix = cut ? ` · installed ${cut.installedWidthIn}″ · cut from ${cut.stockWidthIn}″ stock` : "";
      const cutNote = cut ? `Installed ${cut.installedWidthIn}″ · planning difference ${cut.offcutIn}″ (not usable offcut; field measurement and manufacturer template/jig required)` : undefined;
      rows.set(key, {
        sku: p.sku,
        label: `${p.description} · ${p.finish}${cutSuffix}`,
        qty,
        unitUsd: p.packQty > 1 ? p.listPackUsd : p.listEachUsd,
        section,
        ...(cut ? { stockWidthIn: cut.stockWidthIn, installedWidthIn: cut.installedWidthIn, offcutIn: cut.offcutIn } : {}),
        ...(packNote ?? cutNote ? { packNote: [packNote, cutNote].filter(Boolean).join(" · ") } : {}),
      });
    }
  };
  for (let i = 0; i < design.bays.length; i++) {
    const bay = design.bays[i];
    const cut = studioBayCut(bay);
    if (cut) missing.push(`Tower ${i + 1}: a matching cleat at the cut installed width is not verified; it is not substituted in the material reference.`);
    else add(studioProduct(design, "Cleats", /\bCleat\b/i, bay.widthIn), "cleat");
  }
  const panelCategory = design.mount === "hanging" ? "Panels (Hang)" : "Panels (Floor)";
  const panelHeight = studioPanelHeight(design);
  add(studioProduct(design, panelCategory, /\bLeft End\b/i, 0.75, panelHeight), "panel");
  for (let i = 1; i < design.bays.length; i++) add(studioProduct(design, panelCategory, /\bCenter Upright\b/i, 0.75, panelHeight), "panel");
  add(studioProduct(design, panelCategory, /\bRight End\b/i, 0.75, panelHeight), "panel");
  let rods = 0;
  for (let i = 0; i < design.bays.length; i++) {
    const bay = design.bays[i];
    const cut = studioBayCut(bay);
    const fixed = studioPartReferences(design, i, "fixedShelf")?.[0];
    add(fixed, "shelf", 2, undefined, cut);
    for (const item of bay.items) {
      const parts = studioPartReferences(design, i, item.kind);
      if (!parts) { missing.push(`Tower ${i + 1}: ${item.kind} has no compatible verified SKU.`); continue; }
      if (item.kind === "rod") { rods++; add(parts[0], "accessory"); }
      else parts.forEach((part) => add(part, item.kind === "shelf" ? "shelf" : "accessory", 1, undefined, item.kind === "shelf" ? cut : null));
    }
  }
  for (const shelf of studioCornerShelves(design)) {
    const corner = masterTracProduct(shelf.sku);
    const key = `shelf:${shelf.sku}:corner:${shelf.mount}:${shelf.geometryRevision}`;
    const row = rows.get(key);
    const cornerLabel = `${corner?.description ?? "Corner Shelf"} · ${shelf.finish} · ${shelf.mount} · 2026 planning envelope 29.5″ × 29.5″ · reference only`;
    const cornerNote = "Visual planning only · 2026 nominal envelope; 2022 manual lists 29¼″ actual · curved profile, supports, connectors, H-joint applicability, and installation fit are unverified";
    if (!corner) missing.push(`Corner shelf ${shelf.sku} is not available in the public historical source catalog.`);
    else if (row) row.qty += 1;
    else rows.set(key, { sku: corner.sku, label: cornerLabel, qty: 1, unitUsd: corner.packQty > 1 ? corner.listPackUsd : corner.listEachUsd, section: "shelf", packNote: cornerNote });
  }
  if (rods) {
    const cups = CLOSET_PARTS.find((p) => p.category === "Accessories" && p.finish === "Chrome" && p.packQty === 10 && /^Rod Cup \(10 Each\)/i.test(p.description));
    add(cups, "hardware", Math.ceil(rods * 2 / 10), `${rods * 2} cups required · sold in packs of 10`);
  }
  if (design.bays.some((bay) => bay.items.some((item) => item.kind === "shoe")))
    missing.push("Shoe organizer 45° pitch is illustrative; verify supplier fit, attachment, and support requirements before ordering or installation.");
  if (studioCornerShelves(design).length)
    missing.push("Corner shelves use a 2026 29.5″ visual-planning envelope, not the unavailable curved-board profile or installation drawing. The 2022 manual lists 29¼″ actual; verify profile, supports, connectors, adjacent assembly, and fit before ordering or installation.");
  if (studioBasketReferences(design).length)
    missing.push(`Basket references selected: ${studioBasketReferences(design).map((reference) => reference.sku).join(", ")}. They are not placed, priced in the material lines, or fit-approved because outer envelope, rails, mounting offsets, extension travel, and clearance requirements are not source-verified.`);
  if (design.bays.some((bay) => studioBayCut(bay))) missing.push("Field-cut shelf planning: measure the finished opening; use the manufacturer’s adjustable-shelf template or fixed-shelf connector-hole jig as applicable. This Studio is not a cutting or drilling guide.");
  missing.push("Wall anchors, cleat fasteners, connector/cam-lock quantities, and drawer slide hardware are not verified by the provided sources; obtain the installation schedule before ordering.");
  if (design.mount === "hanging") missing.push("Hanging-panel installation elevation and fastener locations are not certified here; the 3D height is illustrative.");
  const order: ReferenceLine["section"][] = ["cleat", "panel", "shelf", "accessory", "hardware"];
  const lines = Array.from(rows.values()).sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.sku.localeCompare(b.sku));
  return { lines, subtotalUsd: Math.round(lines.reduce((sum, line) => sum + line.qty * line.unitUsd, 0) * 100) / 100, missing };
}

export function restoreStudioDesign(raw: string | null): StudioDesign | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const v = value as Partial<StudioDesign>;
    if (v.version !== 1 || !STUDIO_MODES.includes(v.mode!) || !["floor", "hanging"].includes(v.mount!)
      || !STUDIO_FINISHES.includes(v.finish!) || !STUDIO_WALLS.includes(v.wall!)
      || !Number.isFinite(v.wallWidthIn) || !Number.isFinite(v.roomDepthIn)
      || v.wallWidthIn! < 24 || v.wallWidthIn! > 360 || v.roomDepthIn! < 24 || v.roomDepthIn! > 360
      || !Array.isArray(v.bays) || !v.bays.length || v.bays.length > 4
      || (v.cornerShelves != null && !Array.isArray(v.cornerShelves))
      || (v.basketReferences != null && !Array.isArray(v.basketReferences))) return null;
    if (v.bays.some((bay) => !bay || typeof bay.id !== "string" || !Number.isFinite(bay.widthIn)
      || bay.widthIn < CUT_PLANNING_MIN_IN || bay.widthIn > 30
      || (bay.stockWidthIn != null && (!WIDTHS.includes(bay.stockWidthIn) || bay.widthIn > bay.stockWidthIn + EPS))
      || (!bay.stockWidthIn && !WIDTHS.includes(bay.widthIn as 18 | 24 | 30))
      || !Array.isArray(bay.items) || bay.items.some((item) => !item || typeof item.id !== "string" || !STUDIO_PART_KINDS.includes(item.kind) || !Number.isFinite(item.bottomIn)))) return null;
    const design = v as StudioDesign;
    if (studioWidth(design) > studioWallLength(design)) return null;
    for (let i = 0; i < design.bays.length; i++) {
      if (studioBayCut(design.bays[i]) && design.mount !== "floor") return null;
      if (!studioPartReferences(design, i, "fixedShelf")) return null;
      for (const item of design.bays[i].items) {
        if (studioCollision(design, i, item, item.id) || !studioPartReferences(design, i, item.kind)) return null;
      }
    }
    const seenCornerIds = new Set<string>();
    for (const shelf of studioCornerShelves(design)) {
      if (!shelf || typeof shelf.id !== "string" || seenCornerIds.has(shelf.id)
        || !["432556", "432557"].includes(shelf.sku) || shelf.finish !== design.finish
        || !["fixed", "adjustable"].includes(shelf.mount) || shelf.profile !== "curved-illustrative"
        || !["back-left", "back-right", "front-left", "front-right"].includes(shelf.cornerId)
        || !Array.isArray(shelf.wallIds) || shelf.wallIds.length !== 2 || !STUDIO_WALLS.includes(shelf.wallIds[0]) || !STUDIO_WALLS.includes(shelf.wallIds[1])
        || !Number.isFinite(shelf.elevationIn) || shelf.nominalFootprintIn !== STUDIO_CORNER_SHELF_NOMINAL_FOOTPRINT_IN
        || shelf.geometryRevision !== STUDIO_CORNER_SHELF_GEOMETRY_REVISION || shelf.geometrySource !== "MasterTrac Spec Book NP 2026 p. 13" || shelf.capability !== "visualPlanning") return null;
      seenCornerIds.add(shelf.id);
    }
    if (studioCornerDesignError(design)) return null;
    const seenBasketIds = new Set<string>();
    for (const reference of studioBasketReferences(design)) {
      const option = STUDIO_BASKET_REFERENCE_OPTIONS.find((entry) => entry.sku === reference?.sku);
      const product = reference ? masterTracProduct(reference.sku) : undefined;
      if (!reference || typeof reference.id !== "string" || seenBasketIds.has(reference.id)
        || reference.finish !== "Chrome" || reference.capability !== "referenceOnly" || reference.sourceRevision !== "floor-579554-p13-historical-reference-v1"
        || !option || reference.nominalHeightIn !== option.nominalHeightIn || reference.nominalWidthIn !== option.nominalWidthIn
        || !product || product.finish !== "Chrome" || product.category !== "Accessories" || product.placeable || studioFitCapability(reference.sku)?.status !== "referenceOnly") return null;
      seenBasketIds.add(reference.id);
    }
    return design;
  } catch { return null; }
}

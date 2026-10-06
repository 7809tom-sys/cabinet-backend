import { CLOSET_PARTS, masterTracProduct, type MasterTracProduct } from "./closet";
import { towerStorageSkuReferences } from "./masterTracTower";

export type StudioMode = "closet" | "pantry" | "mudroom";
export type StudioMount = "floor" | "hanging";
export type StudioWall = "back" | "left" | "right" | "front";
export type StudioKind = "shelf" | "rod" | "drawer" | "shoe";
export type StudioReferenceKind = StudioKind | "fixedShelf";
export type StudioItem = { id: string; kind: StudioKind; bottomIn: number };
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
export const STUDIO_MODES: StudioMode[] = ["closet", "pantry", "mudroom"];
export const STUDIO_PART_KINDS: StudioKind[] = ["shelf", "rod", "drawer", "shoe"];
export const STUDIO_WALLS: StudioWall[] = ["back", "left", "right", "front"];
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
  if (rods) {
    const cups = CLOSET_PARTS.find((p) => p.category === "Accessories" && p.finish === "Chrome" && p.packQty === 10 && /^Rod Cup \(10 Each\)/i.test(p.description));
    add(cups, "hardware", Math.ceil(rods * 2 / 10), `${rods * 2} cups required · sold in packs of 10`);
  }
  if (design.bays.some((bay) => bay.items.some((item) => item.kind === "shoe")))
    missing.push("Shoe organizer 45° pitch is illustrative; verify supplier fit, attachment, and support requirements before ordering or installation.");
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
      || !Array.isArray(v.bays) || !v.bays.length || v.bays.length > 4) return null;
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
    return design;
  } catch { return null; }
}

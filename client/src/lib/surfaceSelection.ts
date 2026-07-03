// Shared contract for the Surfaces & Fixtures wizard -> Design Tool hand-off.
//
// The wizard lets a customer choose their flooring, backsplash tile, countertop,
// sink and faucet (with square-footage/box math for the area-based items) BEFORE
// they open the Design Tool. We persist that choice to localStorage so the Design
// Tool can pre-select matching materials and pre-load the chosen fixtures.

export type SurfaceRole = "flooring" | "tile" | "countertop" | "sink" | "faucet";

export interface SurfacePick {
  id: number;
  slug: string;
  name: string;
  category: string;
  /** Which wizard slot this pick fills; set by the wizard when a product is chosen. */
  role?: SurfaceRole;
  subCategory?: string | null;
  size?: string | null;
  imageUrl?: string | null;
  sellPrice: number | null;
  /** Area entered by the user (sq ft) for area-priced roles. */
  areaSqft?: number | null;
  /** Editable coverage assumption (sq ft per box/package). */
  sqftPerBox?: number | null;
  /** Waste factor applied on top of area (e.g. 0.1 = 10%). */
  wastePct?: number | null;
  /** Computed package/box count = ceil(area * (1+waste) / sqftPerBox). */
  boxes?: number | null;
}

export interface SurfaceSelection {
  v: 1;
  savedAt: number;
  picks: Partial<Record<SurfaceRole, SurfacePick>>;
  layout: "l-shape" | "u-shape" | "galley" | "island" | "straight";
  /** Optional last generated preview image URL. */
  previewUrl?: string | null;
}

export const SURFACE_SELECTION_KEY = "cd_surface_selection";

export const DEFAULT_SQFT_PER_BOX: Record<SurfaceRole, number> = {
  flooring: 20,
  tile: 10,
  countertop: 0,
  sink: 0,
  faucet: 0,
};

export const DEFAULT_WASTE_PCT = 0.1;

export function computeBoxes(
  areaSqft: number | null | undefined,
  sqftPerBox: number | null | undefined,
  wastePct: number | null | undefined
): number | null {
  if (!areaSqft || areaSqft <= 0) return null;
  const per = sqftPerBox && sqftPerBox > 0 ? sqftPerBox : 1;
  const waste = wastePct != null && wastePct >= 0 ? wastePct : 0;
  return Math.ceil((areaSqft * (1 + waste)) / per);
}

export function saveSurfaceSelection(sel: SurfaceSelection): void {
  try {
    localStorage.setItem(SURFACE_SELECTION_KEY, JSON.stringify(sel));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function loadSurfaceSelection(): SurfaceSelection | null {
  try {
    const raw = localStorage.getItem(SURFACE_SELECTION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && obj.v === 1 && obj.picks) return obj as SurfaceSelection;
  } catch {
    /* corrupt — ignore */
  }
  return null;
}

export function clearSurfaceSelection(): void {
  try {
    localStorage.removeItem(SURFACE_SELECTION_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Map a Pelican pick onto the Design Tool's built-in material palettes ─────
// The Design Tool renders plan/elevation views from a small curated palette of
// material ids (see client/src/lib/design.ts). We can't render an arbitrary
// product photo into that 2D engine, so we pick the closest palette entry by
// keyword. The exact product (name/price/photo) is still carried in the saved
// selection and surfaced in the design's Surfaces & Fixtures panel.

export function guessFlooringMaterialId(pick: SurfacePick | undefined): string | null {
  if (!pick) return null;
  const s = `${pick.name} ${pick.subCategory ?? ""}`.toLowerCase();
  if (/(walnut|espresso|dark)/.test(s)) return "walnut-hardwood";
  if (/(white oak|natural oak|light)/.test(s)) return "white-oak";
  if (/(oak|hickory|maple|wood|hardwood)/.test(s)) return "oak-hardwood";
  if (/(vinyl|lvp|lvt|spc|plank)/.test(s)) return "luxury-vinyl";
  if (/(herringbone)/.test(s)) return "herringbone-tile";
  if (/(chevron)/.test(s)) return "chevron-wood";
  if (/(black|slate|charcoal)/.test(s)) return "black-tile";
  if (/(gray|grey|porcelain)/.test(s)) return "gray-tile";
  if (/(concrete)/.test(s)) return "concrete";
  if (/(tile|ceramic|marble)/.test(s)) return "white-tile";
  return "luxury-vinyl";
}

export function guessBacksplashMaterialId(pick: SurfacePick | undefined): string | null {
  if (!pick) return null;
  const s = `${pick.name} ${pick.subCategory ?? ""}`.toLowerCase();
  if (/(hex)/.test(s)) return /(marble)/.test(s) ? "marble-hex" : "white-hex";
  if (/(mosaic)/.test(s)) return "black-mosaic";
  if (/(zellige|blue)/.test(s)) return "blue-zellige";
  if (/(terracotta|clay)/.test(s)) return "terracotta";
  if (/(herringbone)/.test(s)) return "herringbone-wood";
  if (/(gray|grey)/.test(s)) return "gray-subway";
  if (/(large|slab|panel)/.test(s)) return "white-large";
  if (/(subway|brick|tile|marble|ceramic|porcelain)/.test(s)) return "white-subway";
  return "white-subway";
}

export function guessCountertopMaterialId(pick: SurfacePick | undefined): string | null {
  if (!pick) return null;
  const s = `${pick.name} ${pick.subCategory ?? ""}`.toLowerCase();
  if (/(calacatta|carrara|marble)/.test(s)) return "carrara-marble";
  if (/(black|nero|charcoal|midnight)/.test(s)) return "black-granite";
  if (/(sand|beige|cream|tan|gold|oro)/.test(s)) return "sand-quartz";
  if (/(concrete|gray|grey)/.test(s)) return "concrete-gray";
  if (/(butcher|wood|oak|walnut)/.test(s)) return "butcher-block";
  return "white-quartz";
}

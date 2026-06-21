// Pure helpers that map a cabinet record to a 2D drawing type, an SEO-friendly
// image slug, and descriptive alt text. Kept framework-free so it is unit-testable.

export type CabinetDrawingType =
  | "standard-door" // 1+ door box (base/wall/tall)
  | "drawer-base" // stacked drawer fronts
  | "sink-base" // false tilt-out top panel + sink cutout indication
  | "appliance-garage" // tambour roll-up slats
  | "blind-corner" // L-shaped footprint
  | "vanity" // vanity door/drawer combo
  | "ada" // ADA-height unit
  | "accessory-strip" // moldings, fillers, panels, shelves (thin)
  | "glass-door"; // glass-front wall cabinet

export interface CabinetLike {
  masterCode?: string | null;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  depth?: number | string | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  isCornerCabinet?: boolean | null;
  placementType?: string | null;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function lc(v: string | null | undefined): string {
  return (v ?? "").toLowerCase();
}

/**
 * Decide which 2D front drawing best represents this cabinet, based on the
 * real catalog data (category / subCategory / counts / corner flag).
 * Order matters: most specific specialty types are checked first.
 */
export function cabinetDrawingType(cab: CabinetLike): CabinetDrawingType {
  const cat = lc(cab.category);
  const sub = lc(cab.subCategory);
  const code = lc(cab.masterCode);
  const desc = lc(cab.description);
  const hay = `${sub} ${desc} ${code}`;

  // Real cabinet families are never accessory strips, even if their description
  // mentions words like "shelf" or "panel" (e.g. "...Base Cabinet with Adjustable Shelf").
  const isRealCabinetFamily = ["base", "wall", "tall", "vanity", "ada"].includes(cat);

  // Accessories: moldings, fillers, end panels, shelves, light/base rail, toe kick.
  // The keyword heuristic only applies as a fallback for items NOT already in a
  // real cabinet category; explicit category==="accessory" always wins.
  if (
    cat === "accessory" ||
    (!isRealCabinetFamily &&
      /molding|filler|end panel|\bpanel\b|shelf|light rail|base rail|toe kick|scribe|valance/.test(
        hay,
      ))
  ) {
    return "accessory-strip";
  }

  // Appliance garage (tambour roll-up). Check before generic wall/door.
  if (/appliance garage|tambour|garage/.test(hay)) {
    return "appliance-garage";
  }

  // Blind / corner cabinets render as an L-shape.
  if (cab.isCornerCabinet || /blind corner|corner|easy reach|lazy susan|diagonal/.test(hay)) {
    return "blind-corner";
  }

  // Sink base (false front tilt-out + sink cutout indication).
  if (/sink base|sink/.test(hay) && /base|vanity/.test(`${cat} ${sub} ${desc}`)) {
    return "sink-base";
  }

  // Glass-front wall cabinets.
  if (/glass/.test(hay)) {
    return "glass-door";
  }

  // ADA units (shallower / lower) — only when not already a more specific type.
  if (cat === "ada" || /\bada\b/.test(hay)) {
    return "ada";
  }

  // Vanity units.
  if (cat === "vanity" || /vanity/.test(hay)) {
    return "vanity";
  }

  // Drawer base: all-drawer fronts (no doors, or explicitly a drawer base).
  const doors = cab.numberOfDoors ?? 0;
  const drawers = cab.numberOfDrawers ?? 0;
  if (/drawer base|\bdrawer\b/.test(`${sub} ${desc}`) && doors === 0) {
    return "drawer-base";
  }
  if (drawers > 0 && doors === 0) {
    return "drawer-base";
  }

  // Default: a door box (with optional top drawer handled by the renderer).
  return "standard-door";
}

/** Slugify a string into an SEO-friendly, hyphenated token. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/["'']/g, "") // drop quotes/inch marks
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, "") // trim hyphens
    .replace(/-{2,}/g, "-"); // collapse repeats
}

/**
 * SEO-friendly image slug/key for a model, e.g.
 * "Drawer Base 12" + DB-12-3  ->  "drawer-base-12-db-12-3".
 * Uses the description (truncated) plus the unique master code so it is both
 * descriptive and unique.
 */
export function cabinetImageSlug(cab: CabinetLike): string {
  const descPart = slugify((cab.description ?? "").split(/[.,;]/)[0] ?? "").slice(0, 60);
  const codePart = slugify(cab.masterCode ?? "");
  const joined = [descPart, codePart].filter(Boolean).join("-");
  return joined || codePart || "cabinet";
}

/**
 * Human-readable alt text for accessibility + SEO, e.g.
 * 'Drawer Base 12" (DB-12-3) — 3-drawer base cabinet'.
 */
export function cabinetAltText(cab: CabinetLike): string {
  const code = cab.masterCode ?? "";
  const w = toNum(cab.width);
  const type = cabinetDrawingType(cab);
  const doors = cab.numberOfDoors ?? 0;
  const drawers = cab.numberOfDrawers ?? 0;

  const widthPart = w ? `${w}"` : "";
  const namePart = (cab.description ?? "").split(/[.,;]/)[0]?.trim() || cab.subCategory || "Cabinet";

  const bits: string[] = [];
  bits.push(namePart);
  if (widthPart && !namePart.includes(widthPart)) bits.push(widthPart);
  const head = bits.join(" ").trim();

  const detailMap: Record<CabinetDrawingType, string> = {
    "standard-door": doors > 0 ? `${doors}-door cabinet` : "cabinet",
    "drawer-base": drawers > 0 ? `${drawers}-drawer base cabinet` : "drawer base cabinet",
    "sink-base": "sink base cabinet with false tilt-out front",
    "appliance-garage": "appliance garage with tambour door",
    "blind-corner": "blind corner cabinet",
    vanity: "vanity cabinet",
    ada: "ADA-compliant cabinet",
    "accessory-strip": "accessory / trim",
    "glass-door": "glass-front wall cabinet",
  };

  const detail = detailMap[type];
  const codePart = code ? `(${code})` : "";
  return [head, codePart, "—", detail].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

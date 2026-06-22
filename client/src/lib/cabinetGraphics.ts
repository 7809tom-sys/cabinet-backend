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

const WORD_NUM: Record<string, number> = {
  single: 1, one: 1, two: 2, double: 2, three: 3, triple: 3,
  four: 4, five: 5, six: 6,
};

/**
 * Resolve how many door panels and drawer fronts a cabinet should DRAW so that
 * the picture always agrees with the visible label. The catalog's numeric
 * `numberOfDoors` / `subCategory` fields are unreliable for some rows (e.g. a
 * 12" wall tagged "Double Door Wall" / doors=1 whose description clearly says
 * "Single Door"), so the human-readable DESCRIPTION is treated as the source of
 * truth, with numeric fields and width as fallbacks.
 */
export function resolveDoorDrawerCounts(cab: CabinetLike): {
  doors: number;
  drawers: number;
} {
  const desc = lc(cab.description);
  const sub = lc(cab.subCategory);
  const w = toNum(cab.width);

  // 1) Drawers from the description, e.g. "3 Drawer Base", "with 4 Drawers".
  let drawers = 0;
  const drawerNum = desc.match(/(\d+)\s*[- ]?drawer/);
  if (drawerNum) drawers = parseInt(drawerNum[1], 10);
  else {
    const drawerWord = desc.match(/\b(single|two|double|three|triple|four|five|six)\s*[- ]?drawer/);
    if (drawerWord) drawers = WORD_NUM[drawerWord[1]] ?? 0;
  }
  if (drawers === 0 && (cab.numberOfDrawers ?? 0) > 0 && /drawer/.test(`${desc} ${sub}`)) {
    drawers = cab.numberOfDrawers ?? 0;
  }

  // 2) Doors from the description first ("Single Door", "Double Door", "2 Door").
  let doors = 0;
  const doorNum = desc.match(/(\d+)\s*[- ]?door/);
  if (doorNum) doors = parseInt(doorNum[1], 10);
  else {
    const doorWord = desc.match(/\b(single|two|double|three|triple|four)\s*[- ]?door/);
    if (doorWord) doors = WORD_NUM[doorWord[1]] ?? 0;
  }

  // 3) Fall back to the numeric field, then to width (>=24" base/wall = 2 doors).
  if (doors === 0) {
    const n = cab.numberOfDoors ?? 0;
    if (n > 0) doors = n;
  }
  if (doors === 0 && drawers === 0) {
    doors = w !== null && w >= 24 ? 2 : 1;
  }

  return { doors, drawers };
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

  // Drawer base: all-drawer fronts (no doors). Use the description-driven
  // resolver so the type matches the label (e.g. "3 Drawer Base").
  const { doors, drawers } = resolveDoorDrawerCounts(cab);
  if (/drawer base/.test(`${sub} ${desc}`) && doors === 0) {
    return "drawer-base";
  }
  if (drawers > 0 && doors === 0) {
    return "drawer-base";
  }

  // Default: a door box (with optional top drawer handled by the renderer).
  return "standard-door";
}

/**
 * A short, shopper-facing type label that ALWAYS agrees with the drawing.
 * The catalog's `subCategory` is sometimes wrong (a single-door wall tagged
 * "Double Door Wall"), so when the description clearly states the door/drawer
 * count we derive the label from the description instead.
 */
export function cabinetTypeLabel(cab: CabinetLike): string {
  const cat = lc(cab.category);
  const sub = (cab.subCategory ?? "").trim();
  const desc = lc(cab.description);
  const type = cabinetDrawingType(cab);
  const { doors, drawers } = resolveDoorDrawerCounts(cab);

  const placement =
    cat === "wall" ? "Wall" :
    cat === "tall" ? "Tall" :
    cat === "vanity" ? "Vanity" :
    cat === "ada" ? "ADA" :
    cat === "accessory" ? "Accessory" : "Base";

  if (type === "drawer-base") {
    return drawers > 0 ? `${drawers}-Drawer ${placement}` : `Drawer ${placement}`;
  }
  if (type === "sink-base") return `Sink ${placement === "Vanity" ? "Vanity" : "Base"}`;
  if (type === "blind-corner") return /lazy susan|easy reach/.test(desc) ? `Corner ${placement}` : `Blind Corner ${placement}`;
  if (type === "appliance-garage") return "Appliance Garage";
  if (type === "glass-door") return doors >= 2 ? `Double Glass Door ${placement}` : `Single Glass Door ${placement}`;
  if (type === "accessory-strip") return sub || "Trim / Accessory";

  // Standard door box: name by door count so it matches the drawing.
  if (type === "standard-door") {
    const doorWord = doors >= 2 ? "Double Door" : "Single Door";
    if (placement === "Vanity" || placement === "ADA") return `${doorWord} ${placement}`;
    return `${doorWord} ${placement}`;
  }
  return sub || `${placement} Cabinet`;
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
  const { doors, drawers } = resolveDoorDrawerCounts(cab);

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

// Pure helpers that map a cabinet record to a 2D drawing type, an SEO-friendly
// image slug, and descriptive alt text. Kept framework-free so it is unit-testable.

export type CabinetDrawingType =
  | "standard-door" // 1+ door box (base/wall/tall)
  | "drawer-base" // stacked drawer fronts
  | "sink-base" // false tilt-out top panel + sink cutout indication
  | "appliance-garage" // tambour roll-up slats
  | "blind-corner" // L-shaped footprint
  | "corner-drawer-base" // L-shaped corner with stacked drawers on the main face (CDB-*)
  | "vanity" // vanity door/drawer combo
  | "ada" // ADA-height unit
  | "accessory-strip" // moldings, fillers, panels, shelves (thin)
  | "glass-door" // glass-front wall cabinet
  | "pantry"; // tall pantry: 4 doors split at 54" (2 bottom, 2 top)

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
  catalogImageUrl?: string | null;
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

  // 3) If the description/subCategory clearly indicates a PURE drawer base
  //    (e.g. "Two Drawer Base", subCategory="Drawer Base"), force doors=0 so
  //    the cabinet is never mis-classified as a door box. The numberOfDoors
  //    field in the DB is sometimes wrong (e.g. 2DB24 has numberOfDoors=2).
  const isPureDrawerBase =
    drawers > 0 &&
    (/drawer base/.test(`${sub} ${desc}`) ||
      /^\d+db\d/i.test(lc(cab.masterCode ?? "")) ||
      /^(?:db|bd)[-_]\d/.test(lc(cab.masterCode ?? "")));
  if (isPureDrawerBase) {
    return { doors: 0, drawers };
  }

  // 4) Fall back to the numeric field, then to width (>=24" base/wall = 2 doors).
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

  // Corner drawer base (CDB-*): L-shaped footprint with stacked drawers on the main face.
  // Must be detected BEFORE the generic blind-corner check.
  const { doors: _cdbDoors, drawers: _cdbDrawers } = resolveDoorDrawerCounts(cab);
  if (/^cdb[-_]?\d/.test(code) || (/corner.*drawer.*base|corner drawer base/.test(hay) && _cdbDrawers > 0 && _cdbDoors === 0)) {
    return "corner-drawer-base";
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

  // Tall/pantry cabinets: 4-door split at 54" (2 bottom, 2 top).
  if (cat === "tall") {
    return "pantry";
  }

  // Default: a door box (with optional top drawer handled by the renderer).
  return "standard-door";
}

/**
 * Sub-grouping used by the designer's "Base" palette tab so floor cabinets are
 * organized logically instead of one long list. Four ordered buckets:
 *   1. base       — standard door base cabinets (the most common)
 *   2. drawer     — all-drawer drawer bases
 *   3. sink       — sink/farmhouse/vanity-sink fronts
 *   4. specialty  — everything else that's still a base box (blind/lazy-susan
 *                   corners that land on the Base tab, microwave/oven/trash
 *                   bases, spice pull-outs, end/wine/desk specialty units, ADA)
 *
 * Pure + framework-free so it is unit-testable. Order of checks matters: the
 * most specific specialty signals win, then sink, then drawer, then plain base.
 */
export type BaseSubGroup = "base" | "drawer" | "sink" | "specialty";

export function baseSubGroup(cab: CabinetLike): BaseSubGroup {
  const code = lc(cab.masterCode);
  const sub = lc(cab.subCategory);
  const desc = lc(cab.description);
  const hay = `${sub} ${desc} ${code}`;
  const type = cabinetDrawingType(cab);

  // 1) Sink fronts/bases first — a sink base often also has drawers/doors, so it
  //    must be classified before the drawer/standard checks.
  if (
    type === "sink-base" ||
    /\bsink\b/.test(hay) ||
    /^(?:ada-)?f?sb[-_ ]?\d/.test(code) ||
    /^csb[-_ ]?\d/.test(code) ||
    /^(?:uv-)?sbf[-_ ]?\d/.test(code) ||
    /^(?:ada-)?vsd?[-_ ]?\d/.test(code)
  ) {
    return "sink";
  }

  // 2) Specialty bases: corners that fall on the Base tab, appliance bases
  //    (microwave/oven/trash/waste), spice pull-outs, blind/lazy-susan, ADA,
  //    end/wine/desk and other non-standard boxes.
  if (
    type === "blind-corner" ||
    type === "corner-drawer-base" ||
    type === "appliance-garage" ||
    type === "ada" ||
    cab.isCornerCabinet ||
    /blind|lazy susan|easy reach|diagonal|corner/.test(hay) ||
    /microwave|\boven\b|trash|waste|recycl/.test(hay) ||
    /spice|pull[- ]?out|pullout|roll[- ]?out|tray base/.test(hay) ||
    /\bada\b/.test(hay) ||
    /end (?:shelf|panel|base)|angle|wine|desk|peninsula base|appliance base/.test(
      hay,
    )
  ) {
    return "specialty";
  }

  // 3) Drawer bases: ALL-drawer fronts only. We must NOT catch standard door
  //    bases that happen to include one drawer (e.g. B-24 = "Double Door Single
  //    Drawer Base Cabinet"): those are regular bases and belong in the "base"
  //    bucket. So classify as drawer ONLY when the drawing type is a drawer base,
  //    or the subCategory is exactly "Drawer Base" (the catalog's own all-drawer
  //    designation). The loose /drawer base/ description match is intentionally
  //    dropped because descriptions like "...Single Drawer Base Cabinet" contain
  //    that substring while still being door bases.
  //    Some catalog rows are mis-tagged subCategory="Drawer Base" while actually
  //    being single-door full-height bases (e.g. BFH-12/15/18, doors=1). A real
  //    drawer base has NO doors, so require a 0-door box before trusting the tag.
  const { doors: ddDoors, drawers: ddDrawers } = resolveDoorDrawerCounts(cab);
  if (
    type === "drawer-base" ||
    (/^drawer base$/.test(sub.trim()) && ddDoors === 0 && ddDrawers >= 1)
  ) {
    return "drawer";
  }

  // 4) Everything else is a standard door base.
  return "base";
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
  if (type === "corner-drawer-base") return `Corner Drawer ${placement}`;
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
    "corner-drawer-base": "corner drawer base cabinet",
    vanity: "vanity cabinet",
    ada: "ADA-compliant cabinet",
    "accessory-strip": "accessory / trim",
    "glass-door": "glass-front wall cabinet",
    "pantry": "tall pantry cabinet with 4 doors",
  };

  let detail = detailMap[type];
  // Corner cabinets share one L-shaped drawing, but the accessible label should
  // reflect the actual mechanism (lazy-Susan / easy-reach / corner sink) rather
  // than always saying "blind corner cabinet".
  if (type === "blind-corner") {
    const hay = `${cab.description ?? ""} ${cab.subCategory ?? ""} ${cab.masterCode ?? ""}`.toLowerCase();
    if (/lazy susan|lazy-susan|\blsb\b/.test(hay)) detail = "lazy-Susan corner base cabinet";
    else if (/easy reach|easy-reach|\berb\b/.test(hay)) detail = "easy-reach corner base cabinet";
    else if (/corner sink|sink/.test(hay)) detail = "corner sink base cabinet";
    else if (/diagonal/.test(hay)) detail = "diagonal corner cabinet";
  }
  const codePart = code ? `(${code})` : "";
  return [head, codePart, "—", detail].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

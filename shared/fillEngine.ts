// ─────────────────────────────────────────────────────────────────────────────
// Shared deterministic wall-span fill engine (no DOM / no client deps).
//
// This is the SINGLE source of truth for "how do we tile a wall span with real
// catalog cabinets". It is imported by:
//   - the client auto-fill button (client/src/lib/autofill.ts wraps it), and
//   - the server AI design-consultant (server/routers/design.ts),
// so the math is identical whether a human clicks "Auto-Fill" or the AI proposes
// a layout. The AI only ever chooses a STRATEGY (which spans, what intent); the
// actual cabinet codes + widths come from this deterministic engine, so the AI
// can never invent a SKU or a size that does not add up to the wall length.
// ─────────────────────────────────────────────────────────────────────────────

export type FillMode = "kitchen" | "closet";

/** Minimal catalog row shape the engine needs (a subset of DesignCabinet). */
export interface FillCabinet {
  id: number;
  masterCode: string;
  description: string;
  category?: string | null;
  subCategory?: string | null;
  width: string | null;
  height?: string | null;
  depth?: string | null;
  placement: "base" | "wall" | "tall" | "appliance";
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  isCornerCabinet?: boolean | null;
  catalogImageUrl?: string | null;
}

export interface FillItem {
  cabinet: FillCabinet;
  width: number;
  isFiller: boolean;
}

export interface FillResult {
  items: FillItem[];
  usedInches: number;
  leftoverInches: number;
  fillerInches: number;
}

const MIN_FILLER = 1.5;
const MAX_FILLER = 6;

function widthOf(c: FillCabinet, fallback = 24): number {
  const w = c.width != null ? parseFloat(c.width) : NaN;
  return Number.isFinite(w) && w > 0 ? w : fallback;
}

function isStraightRunCabinet(c: FillCabinet): boolean {
  if (c.placement === "appliance") return false;
  if (c.isCornerCabinet) return false;
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""}`.toLowerCase();
  if (/\bfiller\b|\bscribe\b|\bpanel\b|\bskin\b|\bmolding\b|toe kick|crown/.test(hay)) return false;
  if (/blind corner|easy reach|lazy susan|corner/.test(hay)) return false;
  // Exclude accessory "fronts"/display items that are not real storage boxes
  // (e.g. "Hanging Display Door & Drawer Front", end panels, false fronts).
  if (/\bfront\b|display|false front|tilt-?out|end panel|finished end|valance|light rail|riser|deco/.test(hay)) {
    return false;
  }
  return true;
}

export function candidatesForMode(mode: FillMode, catalog: FillCabinet[]): FillCabinet[] {
  const straight = catalog.filter(isStraightRunCabinet);
  let pool: FillCabinet[];
  if (mode === "kitchen") {
    pool = straight.filter((c) => c.placement === "base");
  } else {
    // For closets, prefer real storage UNITS (drawer banks, shelf/hanging
    // towers, wardrobe cabinets). Require a real placement (base/tall) so we
    // never tile a wall with accessory fronts. Fall back to base/tall boxes.
    const closetish = straight.filter((c) => {
      if (c.placement !== "base" && c.placement !== "tall") return false;
      const hay = `${c.category ?? ""} ${c.subCategory ?? ""} ${c.description ?? ""}`.toLowerCase();
      return /closet|wardrobe|shelf|drawer|hanging unit|tower/.test(hay);
    });
    pool = closetish.length > 0 ? closetish : straight.filter((c) => c.placement === "base" || c.placement === "tall");
  }
  const seen = new Set<string>();
  const uniq: FillCabinet[] = [];
  for (const c of pool) {
    if (seen.has(c.masterCode)) continue;
    seen.add(c.masterCode);
    uniq.push(c);
  }
  return uniq.sort((a, b) => widthOf(b) - widthOf(a));
}

export function makeFiller(widthInches: number, placement: FillCabinet["placement"] = "base"): FillCabinet {
  const w = Math.round(widthInches * 10) / 10;
  return {
    id: 0,
    masterCode: `FILL-${w}`,
    description: `${w}" Filler / Scribe Strip`,
    category: "Accessory",
    subCategory: "Filler",
    width: String(w),
    height: placement === "wall" ? "30" : "34.5",
    depth: placement === "wall" ? "12" : "24",
    placement,
    numberOfDoors: 0,
    numberOfDrawers: 0,
    isCornerCabinet: false,
    catalogImageUrl: null,
  };
}

/**
 * Tile a wall span with real catalog cabinets (greedy widest-first), resolving
 * any leftover with a filler/scribe strip.
 */
export function autoFillSpan(spanInches: number, mode: FillMode, catalog: FillCabinet[]): FillResult {
  const span = Math.max(0, Math.round(spanInches * 100) / 100);
  const items: FillItem[] = [];
  const candidates = candidatesForMode(mode, catalog);

  if (span < MIN_FILLER || candidates.length === 0) {
    return { items, usedInches: 0, leftoverInches: span, fillerInches: 0 };
  }

  const narrowest = candidates[candidates.length - 1];
  const narrowestW = widthOf(narrowest);

  let remaining = span;
  let guard = 0;
  while (remaining >= narrowestW - 0.01 && guard < 500) {
    guard++;
    const fit = candidates.find((c) => widthOf(c) <= remaining + 0.01);
    if (!fit) break;
    const w = widthOf(fit);
    items.push({ cabinet: fit, width: w, isFiller: false });
    remaining = Math.round((remaining - w) * 100) / 100;
  }

  let fillerInches = 0;
  if (remaining >= MIN_FILLER) {
    const placement = mode === "closet" ? narrowest.placement : "base";
    fillerInches = Math.min(remaining, MAX_FILLER);
    items.push({ cabinet: makeFiller(fillerInches, placement), width: fillerInches, isFiller: true });
    remaining = Math.round((remaining - fillerInches) * 100) / 100;
  }

  const usedInches = Math.round(items.reduce((s, it) => s + it.width, 0) * 100) / 100;
  const leftoverInches = Math.max(0, Math.round((span - usedInches) * 100) / 100);
  return { items, usedInches, leftoverInches, fillerInches };
}

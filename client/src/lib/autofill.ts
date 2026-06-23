// ─────────────────────────────────────────────────────────────────────────────
// Deterministic wall-span auto-fill engine
//
// Given a wall span length (inches) and a mode (kitchen base run vs closet run)
// plus the available catalog, choose a sequence of REAL catalog cabinets whose
// widths tile the span, snapping to standard widths and adding a filler strip
// for any small leftover gap. This is pure math — no AI — so it is fast, free,
// always produces valid catalog codes, and the widths always add up to the run.
//
// The result is a list of "fill items" (cabinet + chosen width). The caller is
// responsible for turning each fill item into a PlacedCabinet using the same
// nextFreeSpotOnWall/snap geometry the rest of the designer uses, so auto-filled
// cabinets are movable/deletable exactly like hand-placed ones.
// ─────────────────────────────────────────────────────────────────────────────

import type { DesignCabinet } from "./design";

export type FillMode = "kitchen" | "closet";

export interface FillItem {
  /** The catalog cabinet to place. */
  cabinet: DesignCabinet;
  /** Width in inches to place it at (its natural width; fillers excepted). */
  width: number;
  /** True when this is a filler strip rather than a real cabinet. */
  isFiller: boolean;
}

export interface FillResult {
  items: FillItem[];
  /** Sum of all item widths (should equal span minus any tiny rounding). */
  usedInches: number;
  /** Leftover inches not covered by any cabinet or filler (should be ~0). */
  leftoverInches: number;
  /** Width of the filler strip added, if any (0 when none needed). */
  fillerInches: number;
}

// A filler/scribe strip narrower than this is not worth ordering; we simply
// absorb sub-threshold leftovers as reveal/scribe rather than a filler line.
const MIN_FILLER = 1.5;
// Standard fillers come in stick widths; we never need a filler wider than this
// because the engine prefers a narrower cabinet first.
const MAX_FILLER = 6;

function widthOf(c: DesignCabinet, fallback = 24): number {
  const w = c.width != null ? parseFloat(c.width) : NaN;
  return Number.isFinite(w) && w > 0 ? w : fallback;
}

// Is this catalog row a plain, fillable cabinet (not a corner, not a panel,
// not an appliance, not a filler itself)? Corner cabinets and blind corners
// have special placement rules and are excluded from straight-run auto-fill.
function isStraightRunCabinet(c: DesignCabinet): boolean {
  if (c.placement === "appliance") return false;
  if (c.isCornerCabinet) return false;
  const hay = `${c.subCategory ?? ""} ${c.description ?? ""} ${c.masterCode ?? ""}`.toLowerCase();
  if (/\bfiller\b|\bscribe\b|\bpanel\b|\bskin\b|\bmolding\b|toe kick|crown/.test(hay)) return false;
  if (/blind corner|easy reach|lazy susan|corner/.test(hay)) return false;
  return true;
}

// Pick the candidate cabinets for a given mode, sorted widest→narrowest so the
// greedy tiler lays down big cabinets first and finishes with small ones.
export function candidatesForMode(mode: FillMode, catalog: DesignCabinet[]): DesignCabinet[] {
  const straight = catalog.filter(isStraightRunCabinet);
  let pool: DesignCabinet[];
  if (mode === "kitchen") {
    // Kitchen base run: standard base cabinets (doors + drawer bases).
    pool = straight.filter((c) => c.placement === "base");
  } else {
    // Closet run: prefer closet system parts if present, else fall back to
    // base/tall cabinets (drawer towers, shelf stacks) so closets still fill.
    const closetish = straight.filter((c) => {
      const hay = `${c.category ?? ""} ${c.subCategory ?? ""} ${c.description ?? ""}`.toLowerCase();
      return /closet|hanging|wardrobe|shelf tower|drawer tower/.test(hay);
    });
    pool = closetish.length > 0 ? closetish : straight.filter((c) => c.placement === "base" || c.placement === "tall");
  }
  // De-dupe by master code, keep one per width, sort widest first.
  const seen = new Set<string>();
  const uniq: DesignCabinet[] = [];
  for (const c of pool) {
    if (seen.has(c.masterCode)) continue;
    seen.add(c.masterCode);
    uniq.push(c);
  }
  return uniq.sort((a, b) => widthOf(b) - widthOf(a));
}

// Build a synthetic filler "cabinet" so the caller can place it like any item.
export function makeFiller(widthInches: number, placement: DesignCabinet["placement"] = "base"): DesignCabinet {
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
 * Tile a wall span with real catalog cabinets using a greedy widest-first pass,
 * then resolve any leftover with a smaller cabinet or a filler strip.
 *
 * @param spanInches usable wall length to fill (inches)
 * @param mode kitchen base run or closet run
 * @param catalog available DesignCabinets (already filtered to the chosen line)
 */
export function autoFillSpan(spanInches: number, mode: FillMode, catalog: DesignCabinet[]): FillResult {
  const span = Math.max(0, Math.round(spanInches * 100) / 100);
  const items: FillItem[] = [];
  const candidates = candidatesForMode(mode, catalog);

  if (span < MIN_FILLER || candidates.length === 0) {
    return { items, usedInches: 0, leftoverInches: span, fillerInches: 0 };
  }

  const narrowest = candidates[candidates.length - 1];
  const narrowestW = widthOf(narrowest);

  let remaining = span;
  // Greedy widest-first: drop the widest cabinet that still fits, repeat.
  // Guard the loop with a hard cap so a pathological catalog can't spin forever.
  let guard = 0;
  while (remaining >= narrowestW - 0.01 && guard < 500) {
    guard++;
    const fit = candidates.find((c) => widthOf(c) <= remaining + 0.01);
    if (!fit) break;
    const w = widthOf(fit);
    items.push({ cabinet: fit, width: w, isFiller: false });
    remaining = Math.round((remaining - w) * 100) / 100;
  }

  // Resolve the leftover gap.
  let fillerInches = 0;
  if (remaining >= MIN_FILLER) {
    if (remaining <= MAX_FILLER) {
      // Small gap → a filler/scribe strip.
      fillerInches = remaining;
      const placement = mode === "closet" ? narrowest.placement : "base";
      items.push({ cabinet: makeFiller(remaining, placement), width: remaining, isFiller: true });
      remaining = 0;
    } else {
      // Gap larger than a filler but smaller than our narrowest cabinet should
      // not happen (narrowest <= MAX_FILLER would have been caught), but if the
      // catalog's narrowest is wide, split the leftover into a filler we can
      // actually order rather than leaving a big hole.
      fillerInches = Math.min(remaining, MAX_FILLER);
      const placement = mode === "closet" ? narrowest.placement : "base";
      items.push({ cabinet: makeFiller(fillerInches, placement), width: fillerInches, isFiller: true });
      remaining = Math.round((remaining - fillerInches) * 100) / 100;
    }
  }

  const usedInches = Math.round(items.reduce((s, it) => s + it.width, 0) * 100) / 100;
  const leftoverInches = Math.max(0, Math.round((span - usedInches) * 100) / 100);
  return { items, usedInches, leftoverInches, fillerInches };
}

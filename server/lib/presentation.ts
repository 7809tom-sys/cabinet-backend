// Distributor presentation model helpers.
//
// Each distributor (supply line) can be shown to members in one of three ways:
//   - "neutral"  → white-labeled behind a generic label (e.g. "Line A"). Supplier identity hidden.
//   - "branded"  → the real supplier brand is shown (for distributors who want to promote themselves).
//   - "series"   → re-branded under a Cabinet Dealz series name (e.g. "Cabinet Dealz Elegant Series")
//                  with an optional price markup applied on top of the base pricing.
//
// This keeps Cabinet Dealz as the primary brand while never leaking a hidden supplier's name.

export type DisplayMode = "neutral" | "branded" | "series";

export interface DistributorPresentationInput {
  name: string; // neutral label, e.g. "Line A"
  initials: string; // neutral initials, e.g. "A"
  brandName?: string | null; // real supplier brand
  brandInitials?: string | null; // real supplier initials
  whiteLabel?: boolean | null;
  displayMode?: DisplayMode | null;
  seriesName?: string | null;
  markupPercent?: string | number | null; // e.g. 0.15 = +15%
}

export interface ResolvedPresentation {
  displayName: string;
  displayInitials: string;
  displayMode: DisplayMode;
  markup: number; // multiplier factor, e.g. 1.15
}

/**
 * Resolve the customer-facing label and price markup for a distributor line.
 * Never returns the real supplier name unless displayMode is explicitly "branded".
 */
export function resolvePresentation(
  d: DistributorPresentationInput
): ResolvedPresentation {
  const mode: DisplayMode = (d.displayMode as DisplayMode) || "neutral";
  const markupPct = Number(d.markupPercent ?? 0) || 0;
  const markup = 1 + markupPct;

  if (mode === "branded" && !d.whiteLabel && d.brandName) {
    return {
      displayName: d.brandName,
      displayInitials: d.brandInitials || d.initials,
      displayMode: mode,
      markup,
    };
  }

  if (mode === "series" && d.seriesName) {
    // Derive short initials from the series name (e.g. "Elegant" → "EL")
    const initials =
      d.seriesName
        .replace(/cabinet dealz/i, "")
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 4)
        .toUpperCase() || d.initials;
    return {
      displayName: d.seriesName,
      displayInitials: initials,
      displayMode: mode,
      markup,
    };
  }

  // Default: neutral white-labeled line. No supplier identity, no markup unless set.
  return {
    displayName: d.name,
    displayInitials: d.initials,
    displayMode: "neutral",
    markup,
  };
}

/** Apply a markup multiplier to a decimal-string price, returning a 2-dp string (or null). */
export function applyMarkup(
  price: string | number | null | undefined,
  markup: number
): string | null {
  if (price === null || price === undefined) return null;
  const n = Number(price);
  if (Number.isNaN(n)) return null;
  return (n * markup).toFixed(2);
}

// Trim → cart / build-sheet pricing helper.
//
// The Design Tool auto-adds trim (toe kick, crown, light rail, batten) and lets
// the user add fillers/scribe. Previously those trims were computed for the
// build sheet only and never became priced cart line items, so a designed
// kitchen's trim was missing from the cart (and showed "incl." / $0). They also
// didn't reflect the selected finish.
//
// This helper resolves each ACTIVE trim to its per-style priced SKU. Because the
// price lookup is keyed by the design's styleId, the resolved trim inherits the
// cabinets' finish/color automatically. Trims with no SKU for the selected style
// (e.g. crown — no Clark And Son crown SKU exists, or a brand-new door style
// without trim SKUs yet) resolve to null and are left as quote-only lines rather
// than blocking the cart or inventing a price.

export type TrimKind = "toeKick" | "lightRail" | "batten" | "crown";

// Map each auto-trim to the master code that carries its per-style priced SKU.
// crown intentionally has NO buyable master code (no crown SKU exists for the
// supported line), so it always stays quote-only.
export const TRIM_MASTER_CODES: Record<TrimKind, string | null> = {
  toeKick: "TK-8",
  lightRail: "LRM-8",
  batten: "BAM",
  crown: null,
};

// A resolved, priced trim SKU for one style (as returned by the
// design.trimSkusForStyles procedure, after tier resolution on the client).
export interface TrimPrice {
  cabinetId: number;
  masterCode: string;
  description: string | null;
  unitPrice: number; // already tier-resolved
}

// The minimal cart line shape this helper emits. Matches the fields the
// DesignTool cart builder needs (kept structurally compatible with CartItem).
export interface TrimCartLine {
  masterCode: string;
  name: string;
  styleId: number;
  styleLabel: string;
  unitPrice: number;
  qty: number;
}

// One active trim to consider: its kind and how many sticks/pieces are needed.
export interface ActiveTrim {
  kind: TrimKind;
  pieces: number;
}

/**
 * Build priced cart lines for the active trims of a single-style design.
 *
 * @param trims       active trims with their piece counts (pieces > 0 to count)
 * @param styleId     the design's selected door style id (finish scope)
 * @param styleLabel  human-readable finish/color name for the line
 * @param priceByCode lookup: trim master code -> resolved priced SKU (for styleId)
 * @returns priced cart lines (one per priced, active trim with pieces > 0)
 *
 * Trims are skipped when: pieces <= 0, the kind has no buyable master code
 * (crown), or no priced SKU exists for the style (priceByCode miss). Skipped
 * trims are the caller's cue to render a quote-only build-sheet line.
 */
export function buildTrimCartLines(
  trims: ActiveTrim[],
  styleId: number | null,
  styleLabel: string,
  priceByCode: Map<string, TrimPrice>,
): TrimCartLine[] {
  if (styleId == null) return [];
  const out: TrimCartLine[] = [];
  for (const t of trims) {
    if (!t || t.pieces <= 0) continue;
    const code = TRIM_MASTER_CODES[t.kind];
    if (!code) continue; // crown / no buyable code → quote-only
    const priced = priceByCode.get(code);
    if (!priced || !(priced.unitPrice > 0)) continue; // no SKU for this style → quote-only
    out.push({
      masterCode: priced.masterCode,
      name: priced.description ?? priced.masterCode,
      styleId,
      styleLabel,
      unitPrice: priced.unitPrice,
      qty: t.pieces,
    });
  }
  return out;
}

/**
 * True when a given active trim kind can be resolved to a real price for the
 * current style. Used by the build sheet to decide whether to show a price or a
 * "quote" tag for the trim line.
 */
export function trimHasPrice(
  kind: TrimKind,
  priceByCode: Map<string, TrimPrice>,
): boolean {
  const code = TRIM_MASTER_CODES[kind];
  if (!code) return false;
  const p = priceByCode.get(code);
  return !!p && p.unitPrice > 0;
}

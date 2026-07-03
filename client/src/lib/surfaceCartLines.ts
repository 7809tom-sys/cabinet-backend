import type { PricingTier } from "@shared/pricingTier";

/** Minimal shape of a picked surface/fixture (subset of SelectedSurface). */
export type SurfacePick = {
  id: number;
  name: string;
  category: string;
  size?: string | null;
  sellPrice: number | null;
  /** Sq ft per box — when set, qty is auto-calculated from area + overage. */
  coverageSqFt?: number | null;
};

/** Minimal cart line shape (subset of CartItem) produced for a surface pick. */
export type SurfaceCartLine = {
  masterCode: string;
  name: string;
  styleId: number;
  styleLabel: string;
  distributorId: number | null;
  tier: "wholesale" | "contractor" | "homeowner";
  unitPrice: number | null;
  qty: number;
  /** When qty was auto-calculated from area, this note explains the math. */
  qtyNote?: string;
};

/**
 * Overage percentages by Pelican category.
 * - Mosaic / Backsplash tile: 15%
 * - Flooring: 10%
 * - Everything else: 0% (qty = 1 per pick)
 */
const OVERAGE: Record<string, number> = {
  Backsplash: 0.15,
  Tile: 0.15,
  Mosaic: 0.15,
  Flooring: 0.10,
};

/** Return the overage factor (1.15 or 1.10) for a given category. */
function overageFor(category: string): number {
  // Check exact match first, then substring match for flexibility.
  if (OVERAGE[category] != null) return 1 + OVERAGE[category];
  const lower = category.toLowerCase();
  if (lower.includes("backsplash") || lower.includes("mosaic") || lower.includes("tile")) return 1.15;
  if (lower.includes("floor")) return 1.10;
  return 1;
}

/**
 * Area info passed from the Design Tool so we can compute box quantities.
 * All values in square feet.
 */
export type RoomAreas = {
  /** Total backsplash area (sq ft) — all exposed wall between counter and uppers. */
  backsplashSqFt: number;
  /** Total flooring area (sq ft) — room footprint. */
  flooringSqFt: number;
};

/**
 * Turn the Design Tool's picked Surfaces & Fixtures into cart line items so they
 * land on the shopping list. Pelican surfaces are a DIFFERENT supply line than
 * the cabinet distributor, so each line carries `distributorId: null` (it never
 * triggers the cabinet distributor-lock) and a `PEL-<id>` code namespace so it
 * can never collide with a cabinet masterCode.
 *
 * When a product has `coverageSqFt` set AND the matching area is provided,
 * quantity is auto-calculated:
 *   boxes = ceil( area × overageFactor / coverageSqFt )
 *
 * Otherwise quantity defaults to 1 per selected product.
 * Unpriced (quote-only) picks are skipped.
 */
export function buildSurfaceCartLines(
  surfaces: SurfacePick[],
  tier: "wholesale" | "contractor" | "homeowner",
  areas?: RoomAreas | null,
): SurfaceCartLine[] {
  const lines: SurfaceCartLine[] = [];
  for (const s of surfaces) {
    if (s.sellPrice == null) continue; // skip unpriced (quote-only) picks
    const label = s.size ? `${s.category} · ${s.size}` : s.category;
    let qty = 1;
    let qtyNote: string | undefined;

    // Auto-calculate box quantity when coverage info is available.
    if (s.coverageSqFt && s.coverageSqFt > 0 && areas) {
      const cat = s.category.toLowerCase();
      const isBacksplash = cat.includes("backsplash") || cat.includes("mosaic") || cat.includes("tile");
      const isFlooring = cat.includes("floor");
      const rawArea = isBacksplash ? areas.backsplashSqFt : isFlooring ? areas.flooringSqFt : 0;
      if (rawArea > 0) {
        const factor = overageFor(s.category);
        const pct = Math.round((factor - 1) * 100);
        qty = Math.ceil((rawArea * factor) / s.coverageSqFt);
        qtyNote = `${rawArea.toFixed(1)} sq ft × ${pct}% overage ÷ ${s.coverageSqFt} sq ft/box = ${qty} boxes`;
      }
    }

    lines.push({
      masterCode: `PEL-${s.id}`,
      name: s.name,
      styleId: -s.id, // stable + unique so two picks never collapse
      styleLabel: label,
      distributorId: null,
      tier,
      unitPrice: s.sellPrice,
      qty,
      ...(qtyNote ? { qtyNote } : {}),
    });
  }
  return lines;
}

// Re-export the design-tier mapping type for callers that need it.
export type { PricingTier };

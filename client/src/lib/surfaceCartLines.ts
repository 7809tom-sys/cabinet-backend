import type { PricingTier } from "@shared/pricingTier";

/** Minimal shape of a picked surface/fixture (subset of SelectedSurface). */
export type SurfacePick = {
  id: number;
  name: string;
  category: string;
  size?: string | null;
  sellPrice: number | null;
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
};

/**
 * Turn the Design Tool's picked Surfaces & Fixtures into cart line items so they
 * land on the shopping list. Pelican surfaces are a DIFFERENT supply line than
 * the cabinet distributor, so each line carries `distributorId: null` (it never
 * triggers the cabinet distributor-lock) and a `PEL-<id>` code namespace so it
 * can never collide with a cabinet masterCode. Quantity is 1 per selected
 * product; unpriced (quote-only) picks are skipped.
 */
export function buildSurfaceCartLines(
  surfaces: SurfacePick[],
  tier: "wholesale" | "contractor" | "homeowner",
): SurfaceCartLine[] {
  const lines: SurfaceCartLine[] = [];
  for (const s of surfaces) {
    if (s.sellPrice == null) continue; // skip unpriced (quote-only) picks
    const label = s.size ? `${s.category} · ${s.size}` : s.category;
    lines.push({
      masterCode: `PEL-${s.id}`,
      name: s.name,
      styleId: -s.id, // stable + unique so two picks never collapse
      styleLabel: label,
      distributorId: null,
      tier,
      unitPrice: s.sellPrice,
      qty: 1,
    });
  }
  return lines;
}

// Re-export the design-tier mapping type for callers that need it.
export type { PricingTier };

import type { CartItem } from "@/contexts/CartContext";
import { effectiveStyleId, type PlacedCabinet } from "@/lib/design";
import { isClosetPart } from "@/lib/closet";
import { calculateCartSubtotal } from "@/lib/cartTotals";

type BuildDesignCabinetCartLinesArgs = {
  placed: PlacedCabinet[];
  styleId: number | null;
  distributorId: number | null;
  tier: CartItem["tier"];
  styleNameById: Map<number, string>;
  unitPriceFor: (cabinet: PlacedCabinet) => number | null;
};

/** Turns the priced cabinets in a design into the exact cart lines submitted by Design Tool. */
export function buildDesignCabinetCartLines({
  placed,
  styleId,
  distributorId,
  tier,
  styleNameById,
  unitPriceFor,
}: BuildDesignCabinetCartLinesArgs): CartItem[] {
  if (!styleId) return [];
  const lines = new Map<string, CartItem>();
  for (const cabinet of placed) {
    // Launch appliances are visual-only design context. They remain in the 2D
    // plan and 3D selling view but are intentionally excluded from all cabinet
    // cart/quote/invoice/checkout commerce until appliance sales are enabled.
    if (cabinet.placement === "appliance" || isClosetPart(cabinet.masterCode) || cabinet.cabinetId == null) continue;
    const unitPrice = unitPriceFor(cabinet);
    if (unitPrice == null) continue;
    const resolvedStyleId = effectiveStyleId(cabinet, styleId) ?? styleId;
    const masterCode = cabinet.glassDoor ? `${cabinet.masterCode}GD` : cabinet.masterCode;
    const key = `${masterCode}::${resolvedStyleId}`;
    const existing = lines.get(key);
    if (existing) {
      existing.qty += 1;
      continue;
    }
    lines.set(key, {
      masterCode,
      name: cabinet.description ?? cabinet.masterCode,
      styleId: resolvedStyleId,
      styleLabel: styleNameById.get(resolvedStyleId) ?? "",
      distributorId,
      tier,
      unitPrice,
      qty: 1,
      catalogImageUrl: cabinet.catalogImageUrl ?? null,
    });
  }
  return Array.from(lines.values());
}

export { calculateCartSubtotal };

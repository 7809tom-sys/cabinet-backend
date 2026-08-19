import type { CartItem } from "@/contexts/CartContext";
import { customSizeFee, effectiveStyleId, type PlacedCabinet } from "@/lib/design";
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
      priceLocked: true,
      qty: 1,
      catalogImageUrl: cabinet.catalogImageUrl ?? null,
    });
  }
  return Array.from(lines.values());
}

/**
 * Redistributes a verified package total across its already-price-locked design
 * lines. This is used only for a bundle loaded with a persisted package price;
 * it never updates catalog data. Keeping the total on actual cabinet lines lets
 * the established cart-to-checkout price lock preserve it end to end.
 */
export function lockDesignCartLinesToPackageTotal(lines: CartItem[], packageTotal: number): CartItem[] {
  if (!Number.isFinite(packageTotal) || packageTotal < 0) return lines;
  const eligible = lines.filter((line) => line.unitPrice != null && line.qty > 0);
  const currentTotal = calculateCartSubtotal(eligible);
  if (eligible.length === 0 || currentTotal <= 0) return lines;

  const targetCents = Math.round(packageTotal * 100);
  let remainingCents = targetCents;
  const locked = new Map<CartItem, CartItem>();

  for (let index = 0; index < eligible.length; index += 1) {
    const line = eligible[index];
    const lineCurrentTotal = (line.unitPrice ?? 0) * line.qty;
    const lineCents = index === eligible.length - 1
      ? remainingCents
      : Math.round(targetCents * (lineCurrentTotal / currentTotal));
    // Unit prices may carry fractional cents for a multi-quantity line so the
    // persisted line totals add to the exact verified package total.
    locked.set(line, {
      ...line,
      unitPrice: lineCents / (line.qty * 100),
      priceLocked: true,
    });
    remainingCents -= lineCents;
  }

  return lines.map((line) => locked.get(line) ?? line);
}

/** A bundle price remains valid only while its priced cabinet composition matches the saved snapshot. */
export function bundleCabinetPricingSignature(placed: PlacedCabinet[], styleId: number | null): string {
  return placed
    .filter((cabinet) => cabinet.placement !== "appliance" && !isClosetPart(cabinet.masterCode) && cabinet.cabinetId != null)
    .map((cabinet) => [
      cabinet.uid,
      cabinet.masterCode,
      effectiveStyleId(cabinet, styleId) ?? styleId ?? 0,
      cabinet.glassDoor ? "glass" : "standard",
      cabinet.discountPct ?? 0,
      cabinet.width,
      cabinet.height,
      cabinet.depth,
    ].join(":"))
    .sort()
    .join("|");
}

/**
 * Pricing rows for the interactive 3D quote. These intentionally mirror the
 * visible build-sheet estimate: cabinets only, with each placement's discount
 * and custom-size fee applied. Trim, surfaces, fixtures, and launch-stage
 * visual appliances remain outside this cabinet-design subtotal.
 */
export function buildDesignPreviewPricingLines({
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
    if (cabinet.placement === "appliance" || isClosetPart(cabinet.masterCode) || cabinet.cabinetId == null) continue;
    const basePrice = unitPriceFor(cabinet);
    if (basePrice == null) continue;
    const adjustedUnitPrice = basePrice * (1 + (cabinet.discountPct ?? 0) / 100) + customSizeFee(cabinet);
    const resolvedStyleId = effectiveStyleId(cabinet, styleId) ?? styleId;
    const masterCode = cabinet.glassDoor ? `${cabinet.masterCode}GD` : cabinet.masterCode;
    // Different discounts or custom fees must remain distinct priced lines.
    const key = `${masterCode}::${resolvedStyleId}::${adjustedUnitPrice.toFixed(4)}`;
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
      unitPrice: adjustedUnitPrice,
      qty: 1,
      catalogImageUrl: cabinet.catalogImageUrl ?? null,
    });
  }
  return Array.from(lines.values());
}

export { calculateCartSubtotal };

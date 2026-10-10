import type { CartItem } from "@/contexts/CartContext";

export type CartCheckoutPrefillItem = {
  code: string;
  qty: number;
  styleId?: number | null;
  distributorId?: number | null;
  tier?: string | null;
  unitPrice?: number | null;
  priceLocked?: boolean;
  name?: string | null;
  styleLabel?: string | null;
  category?: string | null;
  productKind?: "surface" | null;
  pelicanProductId?: number | null;
  glassIncluded?: boolean | null;
};

type MatchedCheckoutLine = {
  rawCode: string;
  normalized: string;
  qty: number;
  cabinetId: number | null;
  masterCode: string | null;
  description: string | null;
  matched: boolean;
  confidence: "exact" | "normalized" | "fuzzy" | "none";
};

export type CartCheckoutMetadata = {
  cartUnitPrice: number | null;
  cartPriceLocked: boolean;
  cartStyleId: number | null;
  cartDistributorId: number | null;
  /** Distributor glass policy carried from the cart so checkout repeats the glass warning. */
  glassIncluded?: boolean | null;
  cartTier: string | null;
  cartProductKind: "surface" | null;
  cartCategory: string | null;
  cartPelicanProductId: number | null;
};

export function cartItemToCheckoutPrefill(
  item: CartItem,
  unitPrice: number | null,
): CartCheckoutPrefillItem {
  return {
    code: item.masterCode,
    qty: item.qty,
    styleId: item.styleId,
    distributorId: item.distributorId,
    tier: item.tier,
    unitPrice,
    priceLocked: item.priceLocked === true,
    name: item.name,
    styleLabel: item.styleLabel,
    category: item.category ?? null,
    productKind: item.productKind ?? null,
    pelicanProductId: item.pelicanProductId ?? null,
    glassIncluded: item.glassIncluded ?? null,
  };
}

/** Legacy Pelican carts predate productKind and used several supplier-code shapes. */
export function isSurfaceCheckoutPrefill(item: CartCheckoutPrefillItem): boolean {
  return item.productKind === "surface"
    || (item.distributorId == null && /^PEL-\d+$/i.test(item.code))
    || (
      item.distributorId == null
      && item.unitPrice != null
      && Number.isFinite(item.unitPrice)
      && Boolean(item.category?.trim())
    );
}

export function applyCartCheckoutPrefill<T extends MatchedCheckoutLine>(
  line: T,
  item: CartCheckoutPrefillItem,
): T & CartCheckoutMetadata {
  const isSurface = isSurfaceCheckoutPrefill(item);
  const recognizedLine = isSurface
    ? {
        cabinetId: null,
        masterCode: item.code,
        normalized: item.code,
        description: item.name?.trim() || line.description || item.code,
        matched: true,
        confidence: "exact" as const,
      }
    : {};

  return {
    ...line,
    ...recognizedLine,
    cartUnitPrice: item.unitPrice ?? null,
    cartPriceLocked: item.priceLocked === true || isSurface,
    cartStyleId: item.styleId ?? null,
    cartDistributorId: item.distributorId ?? null,
    glassIncluded: item.glassIncluded ?? null,
    cartTier: item.tier ?? null,
    cartProductKind: isSurface ? "surface" : null,
    cartCategory: item.category ?? null,
    cartPelicanProductId: isSurface && Number.isInteger(item.pelicanProductId) && (item.pelicanProductId ?? 0) > 0
      ? item.pelicanProductId!
      : null,
  };
}

export function isSurfaceCheckoutLine(line: { cartProductKind?: string | null }): boolean {
  return line.cartProductKind === "surface";
}

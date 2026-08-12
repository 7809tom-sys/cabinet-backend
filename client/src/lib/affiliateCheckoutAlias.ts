export type CheckoutAliasStyle = { styleId: number; name: string } | null | undefined;

/** Resolves the display name used throughout the order-review summary. */
export function resolveCheckoutAlias(
  selectedStyle: CheckoutAliasStyle,
  styleNames: Record<number, string> | null | undefined,
): string | null {
  if (!selectedStyle) return null;
  return styleNames?.[selectedStyle.styleId] || selectedStyle.name;
}

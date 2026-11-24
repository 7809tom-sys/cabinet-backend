/**
 * Affiliate checkout price for one Pelican or hardware line.
 *
 * Precedence, first positive price wins:
 * 1. The admin's fixed affiliate sale price on that exact item.
 * 2. The category affiliate percent: cost × (1 + affiliate%).
 * 3. The automatic price already produced from the product record.
 *
 * A blank category percent is unset and falls through. Zero and negative
 * prices are never returned. Null means nothing valid was found.
 */
export function resolveAffiliateCatalogSale(input: {
  fixedPrice?: number | string | null;
  /** Null or omitted means the category override is not set. */
  categoryMarkupBps?: number | null;
  cost?: number | string | null;
  automaticPrice?: number | null;
}): number | null {
  const fixed = positiveDollars(input.fixedPrice);
  if (fixed != null) return fixed;

  const bps = input.categoryMarkupBps;
  if (typeof bps === "number" && Number.isFinite(bps) && bps >= 0) {
    const cost = positiveDollars(input.cost);
    if (cost != null) {
      const sale = Math.round(cost * (1 + bps / 10000) * 100) / 100;
      if (sale > 0) return sale;
    }
  }

  return positiveDollars(input.automaticPrice);
}

function positiveDollars(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rounded = Math.round(amount * 100) / 100;
  return rounded > 0 ? rounded : null;
}

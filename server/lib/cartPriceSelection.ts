import { sellPriceForTier, type TierMarkupBps } from "@shared/margins";

export type CartPriceIdentity = {
  masterCode: string;
  styleId: number;
  distributorId?: number | null;
};

export type CartPriceCandidate = {
  masterCode: string;
  styleId: number | string;
  distributorId: number | string;
  yourCost?: number | string | null;
  wholesalePrice?: number | string | null;
  adjustedListPrice?: number | string | null;
  listPrice?: number | string | null;
};

export function cartPriceIdentityKey(identity: CartPriceIdentity): string {
  return `${identity.masterCode}:${identity.styleId}:${identity.distributorId ?? "_"}`;
}

/**
 * Select one published candidate per exact cart identity. Distributor-locked
 * lines may never refresh from another supplier. Legacy lines without a
 * distributor retain the established least-expensive contractor-price fallback.
 */
export function selectExactCartPriceRows<T extends CartPriceCandidate>(
  items: readonly CartPriceIdentity[],
  rows: readonly T[],
  settings: TierMarkupBps,
): Array<{ key: string; identity: CartPriceIdentity; row: T }> {
  const uniqueItems = new Map(items.map((item) => [cartPriceIdentityKey(item), item]));
  const selected: Array<{ key: string; identity: CartPriceIdentity; row: T }> = [];

  for (const [key, identity] of Array.from(uniqueItems.entries())) {
    const candidates = rows.filter((row) =>
      row.masterCode === identity.masterCode
      && Number(row.styleId) === identity.styleId
      && (identity.distributorId == null || Number(row.distributorId) === identity.distributorId),
    );
    let best: T | null = null;
    for (const candidate of candidates) {
      if (best == null) {
        best = candidate;
        continue;
      }
      const candidatePrice = sellPriceForTier(candidate, settings, "contractor") ?? Infinity;
      const bestPrice = sellPriceForTier(best, settings, "contractor") ?? Infinity;
      if (candidatePrice < bestPrice) best = candidate;
    }
    if (best) selected.push({ key, identity, row: best });
  }

  return selected;
}

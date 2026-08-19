export type BundleSnapshotPlacement = {
  masterCode?: unknown;
  styleId?: unknown;
  placement?: unknown;
};

export type BundleSnapshotLike = {
  placed?: unknown;
  lockedDistributorId?: unknown;
  selectedSurfaces?: unknown;
};

export type BundlePriceCandidate = {
  masterCode: string;
  styleId: number;
  distributorId: number;
  homeownerPrice: number | null;
};

export type BundleSurfacePriceCandidate = {
  id: number;
  homeownerPrice: number | null;
};

export type CurrentBundlePrice = {
  total: number | null;
  pricedItemCount: number;
  missingItemCount: number;
};

/** A published bundle’s approved saved amount is authoritative for that package. */
export function publishedBundlePrice(savedHomeownerPrice: string | null | undefined): string | null {
  if (savedHomeownerPrice == null) return null;
  const amount = Number(savedHomeownerPrice);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isVisualOnlyAppliance(placement: BundleSnapshotPlacement, masterCode: string): boolean {
  if (placement.placement === "appliance") return true;
  return /^(RANGE|FRIDGE|DISHWASHER|HOOD|MW-|MICROWAVE)/.test(masterCode.toUpperCase());
}

/**
 * Converts a saved bundle snapshot into the exact master-code/style pairs that
 * must be priced. A cabinet's explicit saved style wins; otherwise the bundle
 * feature style is used.
 */
export function bundlePricePairs(
  snapshot: BundleSnapshotLike | null | undefined,
  bundleStyleId: number | null | undefined,
): Array<{ masterCode: string; styleId: number }> {
  const fallbackStyleId = positiveInteger(bundleStyleId);
  if (!snapshot || !Array.isArray(snapshot.placed)) return [];

  return (snapshot.placed as BundleSnapshotPlacement[])
    .map((placement) => {
      const masterCode = typeof placement.masterCode === "string" ? placement.masterCode.trim() : "";
      const styleId = positiveInteger(placement.styleId) ?? fallbackStyleId;
      return masterCode && styleId && !isVisualOnlyAppliance(placement, masterCode) ? { masterCode, styleId } : null;
    })
    .filter((item): item is { masterCode: string; styleId: number } => item !== null);
}

/** Returns selected sink, faucet, and surface product IDs from a saved plan. */
export function bundleSurfaceIds(snapshot: BundleSnapshotLike | null | undefined): number[] {
  if (!snapshot || !Array.isArray(snapshot.selectedSurfaces)) return [];
  return (snapshot.selectedSurfaces as Array<{ id?: unknown }>)
    .map((surface) => positiveInteger(surface.id))
    .filter((id): id is number => id !== null);
}

/**
 * Calculates a bundle's live total exclusively from current catalog prices.
 * If the saved plan locks a distributor, only that vendor's rows are eligible.
 * Returning null for total ensures an incomplete current price is never
 * presented as a stale exact quote.
 */
export function calculateCurrentBundlePrice({
  snapshot,
  bundleStyleId,
  lockedDistributorId,
  candidates,
  surfaceCandidates = [],
}: {
  snapshot: BundleSnapshotLike | null | undefined;
  bundleStyleId: number | null | undefined;
  lockedDistributorId: number | null | undefined;
  candidates: BundlePriceCandidate[];
  surfaceCandidates?: BundleSurfacePriceCandidate[];
}): CurrentBundlePrice {
  const pairs = bundlePricePairs(snapshot, bundleStyleId);
  const surfaceIds = bundleSurfaceIds(snapshot);
  const snapshotLockedDistributorId = positiveInteger(snapshot?.lockedDistributorId);
  const requiredDistributorId = positiveInteger(lockedDistributorId) ?? snapshotLockedDistributorId;

  let pricedItemCount = 0;
  let missingItemCount = 0;
  let total = 0;

  for (const pair of pairs) {
    const matchingPrices = candidates
      .filter((candidate) =>
        candidate.masterCode === pair.masterCode &&
        candidate.styleId === pair.styleId &&
        (requiredDistributorId === null || candidate.distributorId === requiredDistributorId) &&
        candidate.homeownerPrice !== null,
      )
      .map((candidate) => candidate.homeownerPrice as number);

    if (matchingPrices.length === 0) {
      missingItemCount += 1;
      continue;
    }

    total += Math.min(...matchingPrices);
    pricedItemCount += 1;
  }

  for (const surfaceId of surfaceIds) {
    const currentPrice = surfaceCandidates.find((candidate) => candidate.id === surfaceId)?.homeownerPrice ?? null;
    if (currentPrice === null) {
      missingItemCount += 1;
      continue;
    }
    total += currentPrice;
    pricedItemCount += 1;
  }

  return {
    total: pairs.length + surfaceIds.length > 0 && missingItemCount === 0 ? Number(total.toFixed(2)) : null,
    pricedItemCount,
    missingItemCount,
  };
}

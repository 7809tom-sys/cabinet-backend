/**
 * Supplier cost is composed in two stages:
 * 1. Core cost = supplier list × base fraction.
 * 2. Tariff/freight = a percentage of that core cost, never of the list.
 *
 * Values are rounded at the same monetary boundaries used for persisted SKU
 * costs, so a tariff is demonstrably applied to the actual acquisition cost.
 */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The display/audit factor equivalent to base × (1 + tariffRate). */
export function landedCostMultiplier(baseFraction: number, tariffRate: number): number {
  return Math.round(baseFraction * (1 + tariffRate) * 10_000) / 10_000;
}

/**
 * Calculates the landed supplier cost from a verified source list price.
 * For example: $389 list × 23% = $89.47 core cost; +7% tariff = $95.73.
 */
export function landedCostFromList(
  listPrice: number,
  baseFraction: number,
  tariffRate: number,
): number {
  const coreCost = roundCurrency(listPrice * baseFraction);
  return roundCurrency(coreCost * (1 + tariffRate));
}

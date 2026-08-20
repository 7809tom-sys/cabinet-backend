/**
 * Saved plans keep their original cabinet identity for geometry, but pricing must
 * follow the active catalog record with the same exact master code. This repairs
 * legacy placements whose retired cabinet ID no longer owns the live supplier SKU.
 */
export function currentCatalogPricingCabinetId(
  placed: { cabinetId: number; masterCode: string },
  activeCatalogIdByMasterCode: ReadonlyMap<string, number>,
): number {
  return activeCatalogIdByMasterCode.get(placed.masterCode) ?? placed.cabinetId;
}

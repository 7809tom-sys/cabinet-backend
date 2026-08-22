/**
 * Build a catalog-price identity map. A master code that resolves to different
 * active IDs is deliberately marked ambiguous so a saved placement cannot be
 * silently repriced through an unrelated duplicate record.
 */
export function activeCatalogPricingIdsByMasterCode(
  catalog: readonly { id: number; masterCode: string | null | undefined }[],
): Map<string, number | null> {
  const ids = new Map<string, number | null>();
  for (const item of catalog) {
    const code = item.masterCode?.trim();
    if (!code || !Number.isFinite(item.id) || item.id <= 0) continue;
    const current = ids.get(code);
    if (current === undefined) ids.set(code, item.id);
    else if (current !== item.id) ids.set(code, null);
  }
  return ids;
}

/**
 * Saved plans keep their original cabinet identity for geometry, but pricing may
 * follow one unambiguous active catalog record with the same exact master code.
 * Ambiguous codes retain their persisted ID rather than borrowing another SKU's
 * distributor/style price.
 */
export function currentCatalogPricingCabinetId(
  placed: { cabinetId: number; masterCode: string },
  activeCatalogIdByMasterCode: ReadonlyMap<string, number | null | undefined>,
): number {
  const activeId = activeCatalogIdByMasterCode.get(placed.masterCode);
  return typeof activeId === "number" && activeId > 0 ? activeId : placed.cabinetId;
}

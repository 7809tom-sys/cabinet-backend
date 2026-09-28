import { resolveCanonicalCatalogSources, type ApprovedMasterAlias } from "./canonicalCatalogSources";

/**
 * One source SKU feeds a cabinet selection only when it has an orderable supplier
 * record and resolves to a live, Designer-visible canonical master.  Keep this
 * exactly aligned with design.placeableCabinets: supplier facts remain on the
 * source row; cabinet identity and Designer visibility stay on the master.
 */
export type DesignerCabinetSourceRow = {
  skuId: number;
  sourceMasterCode: string | null;
  isAvailable: boolean;
  isPublished: boolean;
  listPrice: string | number | null;
  yourCost: string | number | null;
  sourceConflictStatus: string | null;
};

export type DesignerCabinetMasterRow = {
  masterCode: string | null;
  isActive: boolean;
  showInDesigner: boolean;
  conflictStatus: string | null;
};

export type DesignerCabinetReadiness = {
  isCompliant: boolean;
  reason: string | null;
  canonicalMasterCode: string | null;
};

function positivePrice(value: string | number | null): boolean {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0;
}

/**
 * Return a readiness result for every source SKU. The source master can be an
 * approved legacy alias; the returned canonical code is the master the Designer
 * would actually offer, never a guessed replacement.
 */
export function designerCabinetReadinessBySku(
  sources: readonly DesignerCabinetSourceRow[],
  aliases: readonly ApprovedMasterAlias[],
  masters: readonly DesignerCabinetMasterRow[],
): Map<number, DesignerCabinetReadiness> {
  const result = new Map<number, DesignerCabinetReadiness>();
  const resolved = new Map(
    resolveCanonicalCatalogSources(sources, aliases, masters)
      .map(({ source, master }) => [source.skuId, master] as const),
  );

  for (const source of sources) {
    const master = resolved.get(source.skuId);
    const canonicalMasterCode = master?.masterCode ?? null;

    if (!source.isAvailable) {
      result.set(source.skuId, { isCompliant: false, reason: "supplier SKU is unavailable", canonicalMasterCode });
      continue;
    }
    if (!source.isPublished) {
      result.set(source.skuId, { isCompliant: false, reason: "supplier SKU is not published", canonicalMasterCode });
      continue;
    }
    if (!positivePrice(source.listPrice) && !positivePrice(source.yourCost)) {
      result.set(source.skuId, { isCompliant: false, reason: "positive source price is missing", canonicalMasterCode });
      continue;
    }
    if (source.sourceConflictStatus === "conflict") {
      result.set(source.skuId, { isCompliant: false, reason: "source cabinet identity is in conflict", canonicalMasterCode });
      continue;
    }
    if (!master) {
      result.set(source.skuId, { isCompliant: false, reason: "no approved canonical cabinet master", canonicalMasterCode: null });
      continue;
    }
    if (master.conflictStatus === "conflict") {
      result.set(source.skuId, { isCompliant: false, reason: "canonical cabinet identity is in conflict", canonicalMasterCode });
      continue;
    }
    if (!master.isActive) {
      result.set(source.skuId, { isCompliant: false, reason: "canonical cabinet is inactive", canonicalMasterCode });
      continue;
    }
    if (!master.showInDesigner) {
      result.set(source.skuId, { isCompliant: false, reason: "canonical cabinet is not enabled for Designer", canonicalMasterCode });
      continue;
    }
    result.set(source.skuId, { isCompliant: true, reason: null, canonicalMasterCode });
  }

  return result;
}

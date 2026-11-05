import { resolveCanonicalCatalogSources, type ApprovedMasterAlias } from "./canonicalCatalogSources";
import { designerOfferSlot } from "../../shared/designerPanels";

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
  sourceStyleId?: number | null;
  sourceDistributorId?: number | null;
};

export type DesignerCabinetMasterRow = {
  masterCode: string | null;
  isActive: boolean;
  showInDesigner: boolean;
  designerEligible: boolean;
  conflictStatus: string | null;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  placementType?: string | null;
  numberOfDoors?: number | string | null;
  numberOfDrawers?: number | string | null;
};

/** The Designer surface a cabinet will actually land on. */
export type DesignerOfferSurface = "base" | "wall" | "tall" | "panels" | "accessory";

export type DesignerCabinetReadiness = {
  isCompliant: boolean;
  reason: string | null;
  canonicalMasterCode: string | null;
  /** Where the palette will offer this item once it is compliant. */
  designerSurface: DesignerOfferSurface | null;
};

function positivePrice(value: string | number | null): boolean {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0;
}

function surfaceFor(master: DesignerCabinetMasterRow | undefined): DesignerOfferSurface | null {
  if (!master) return null;
  return designerOfferSlot({
    masterCode: master.masterCode,
    description: master.description ?? null,
    category: master.category ?? null,
    subCategory: master.subCategory ?? null,
    placementType: master.placementType ?? null,
    numberOfDoors: master.numberOfDoors ?? null,
    numberOfDrawers: master.numberOfDrawers ?? null,
  });
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
  const masterByCode = new Map<string, DesignerCabinetMasterRow>();
  for (const master of masters) {
    const code = (master.masterCode ?? "").trim().toUpperCase();
    if (code) masterByCode.set(code, master);
  }
  const resolved = new Map(
    resolveCanonicalCatalogSources(sources, aliases, masters)
      .map(({ source, master }) => [source.skuId, master] as const),
  );

  for (const source of sources) {
    const master = resolved.get(source.skuId);
    const canonicalMasterCode = master?.masterCode ?? null;
    const designerSurface = surfaceFor(master);

    if (!source.isAvailable) {
      result.set(source.skuId, { isCompliant: false, reason: "supplier SKU is unavailable", canonicalMasterCode, designerSurface });
      continue;
    }
    if (!source.isPublished) {
      result.set(source.skuId, { isCompliant: false, reason: "supplier SKU is not published", canonicalMasterCode, designerSurface });
      continue;
    }
    if (!positivePrice(source.listPrice) && !positivePrice(source.yourCost)) {
      result.set(source.skuId, { isCompliant: false, reason: "positive source price is missing", canonicalMasterCode, designerSurface });
      continue;
    }
    if (source.sourceConflictStatus === "conflict") {
      result.set(source.skuId, { isCompliant: false, reason: "source cabinet identity is in conflict", canonicalMasterCode, designerSurface });
      continue;
    }
    if (!master) {
      result.set(source.skuId, { isCompliant: false, reason: "no approved canonical cabinet master", canonicalMasterCode: null, designerSurface: null });
      continue;
    }
    if (master.conflictStatus === "conflict") {
      result.set(source.skuId, { isCompliant: false, reason: "canonical cabinet identity is in conflict", canonicalMasterCode, designerSurface });
      continue;
    }
    if (!master.isActive) {
      result.set(source.skuId, { isCompliant: false, reason: "canonical cabinet is inactive", canonicalMasterCode, designerSurface });
      continue;
    }
    if (!master.showInDesigner) {
      result.set(source.skuId, { isCompliant: false, reason: "canonical cabinet is not enabled for Designer", canonicalMasterCode, designerSurface });
      continue;
    }
    if (!master.designerEligible) {
      result.set(source.skuId, { isCompliant: false, reason: "canonical cabinet is not eligible for the 3D Designer", canonicalMasterCode, designerSurface });
      continue;
    }
    result.set(source.skuId, { isCompliant: true, reason: null, canonicalMasterCode, designerSurface });
  }

  return result;
}

export type DesignerMasterReadiness = {
  masterCode: string;
  /** True only when at least one supplier SKU for the scope is compliant. */
  isCompliant: boolean;
  reason: string | null;
  /** Designer tab that offers the item; `panels` is the Panels palette. */
  designerSurface: DesignerOfferSurface | null;
  /** How many supplier SKUs were inspected for this master. */
  skuCount: number;
  compliantSkuCount: number;
};

/**
 * Collapse per-SKU readiness to one answer per canonical master, which is what
 * Cabinet Config shows. A master stays visible when ANY one of its supplier SKUs
 * is orderable, so a stale sibling record cannot make it red. The first reason
 * from an excluded SKU explains why the rest of the catalog is hidden.
 */
export function designerMasterReadinessByCode(
  sources: readonly DesignerCabinetSourceRow[],
  aliases: readonly ApprovedMasterAlias[],
  masters: readonly DesignerCabinetMasterRow[],
): Map<string, DesignerMasterReadiness> {
  const readinessBySku = designerCabinetReadinessBySku(sources, aliases, masters);
  const aggregated = new Map<string, DesignerMasterReadiness>();
  for (const source of sources) {
    const readiness = readinessBySku.get(source.skuId);
    const code = readiness?.canonicalMasterCode
      ?? (source.sourceMasterCode ?? "").trim().toUpperCase();
    if (!code) continue;
    const current = aggregated.get(code) ?? {
      masterCode: code,
      isCompliant: false,
      reason: null,
      designerSurface: readiness?.designerSurface ?? null,
      skuCount: 0,
      compliantSkuCount: 0,
    };
    current.skuCount += 1;
    if (readiness?.isCompliant) {
      current.isCompliant = true;
      current.compliantSkuCount += 1;
    } else if (!current.reason) {
      current.reason = readiness?.reason ?? "Designer readiness could not be verified";
    }
    if (!current.designerSurface && readiness?.designerSurface) current.designerSurface = readiness.designerSurface;
    aggregated.set(code, current);
  }
  for (const entry of Array.from(aggregated.values())) {
    if (entry.isCompliant) entry.reason = null;
  }
  return aggregated;
}

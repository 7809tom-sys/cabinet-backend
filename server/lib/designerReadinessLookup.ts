import { and, eq, inArray, or } from "drizzle-orm";
import { cabinets, distributorSkus, skuMasterAliases } from "../../drizzle/schema";
import {
  designerMasterReadinessByCode,
  type DesignerCabinetSourceRow,
  type DesignerCabinetMasterRow,
  type DesignerMasterReadiness,
} from "./designerCabinetReadiness";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

/**
 * Designer readiness for a known set of master codes, resolved from the same
 * supplier and master gates `design.placeableCabinets` applies. Cabinet Config
 * calls this so its "designer" claim cannot outlive the palette: when the
 * selected style has no published, available, priced SKU, the row is reported
 * with the reason the palette would drop it, plus the tab it would appear on.
 *
 * Alias rows are followed so a priced SKU filed under a retired code still
 * makes its canonical master ready, exactly as the palette does. Every query is
 * bounded by the requested codes and their approved aliases, so opening a page
 * of Cabinet Config never scans the catalog.
 */
export async function designerReadinessForMasterCodes(
  db: Db,
  masterCodes: readonly (string | null | undefined)[],
): Promise<Map<string, DesignerMasterReadiness>> {
  const wanted = Array.from(new Set(masterCodes
    .map((code) => (code ?? "").trim().toUpperCase())
    .filter(Boolean)));
  if (wanted.length === 0) return new Map();

  // One alias hop is enough: the palette resolves through the same table and a
  // chained alias is represented by its own row, which the canonical lookup
  // below already contains.
  const aliases = await db
    .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
    .from(skuMasterAliases)
    .where(and(
      eq(skuMasterAliases.conflictStatus, "ok"),
      or(
        inArray(skuMasterAliases.masterCode, wanted),
        inArray(skuMasterAliases.aliasCode, wanted),
      ),
    ));

  // A supplier row may be filed under an approved alias of a requested master.
  const relatedCodes = new Set(wanted);
  for (const alias of aliases) {
    const aliasCode = (alias.aliasCode ?? "").trim().toUpperCase();
    const canonical = (alias.masterCode ?? "").trim().toUpperCase();
    if (aliasCode) relatedCodes.add(aliasCode);
    if (canonical) relatedCodes.add(canonical);
  }
  const codes = Array.from(relatedCodes);

  const [sourceRows, masterRows] = await Promise.all([
    db
      .select({
        skuId: distributorSkus.id,
        sourceMasterCode: cabinets.masterCode,
        isAvailable: distributorSkus.isAvailable,
        isPublished: distributorSkus.isPublished,
        listPrice: distributorSkus.listPrice,
        yourCost: distributorSkus.yourCost,
        sourceConflictStatus: cabinets.conflictStatus,
        sourceStyleId: distributorSkus.styleId,
        sourceDistributorId: distributorSkus.distributorId,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .where(inArray(cabinets.masterCode, codes)),
    db
      .select({
        masterCode: cabinets.masterCode,
        isActive: cabinets.isActive,
        showInDesigner: cabinets.showInDesigner,
        designerEligible: cabinets.designerEligible,
        conflictStatus: cabinets.conflictStatus,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        placementType: cabinets.placementType,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, codes)),
  ]);

  const masters: DesignerCabinetMasterRow[] = masterRows;
  return designerMasterReadinessByCode(sourceRows as DesignerCabinetSourceRow[], aliases, masters);
}

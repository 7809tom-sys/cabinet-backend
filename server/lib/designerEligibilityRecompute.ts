import { and, eq } from "drizzle-orm";
import { getDb, hasPositivePublishedCabinetPrice } from "../db";
import { cabinets } from "../../drizzle/schema";
import { cabinetCanBeRenderedOrPlacedIn3d } from "../../shared/designerEligibility";

export type DesignerEligibilityRecompute = { checked: number; promoted: number; masterCodes: string[] };

/**
 * Recomputes `designerEligible` for masters that ALREADY exist, so an item that
 * just got a published positive price (for example B24FH) shows up in the
 * Designer without a separate manual edit.
 *
 * Same rule as shared/designerEligibility.ts: positive published supplier price
 * AND the Designer can render or place the cabinet. It only PROMOTES false -> true
 * for active, designer-visible masters; it never demotes, so an admin's manual
 * choice is not undone. Call it after an import, a publish, or a price edit.
 */
export async function recomputeDesignerEligibility(
  options: { cabinetIds?: readonly number[] } = {},
): Promise<DesignerEligibilityRecompute> {
  const db = await getDb();
  if (!db) return { checked: 0, promoted: 0, masterCodes: [] };
  const rows = await db
    .select({
      id: cabinets.id,
      masterCode: cabinets.masterCode,
      description: cabinets.description,
      category: cabinets.category,
      subCategory: cabinets.subCategory,
      placementType: cabinets.placementType,
      isNotCabinet: cabinets.isNotCabinet,
      width: cabinets.width,
      height: cabinets.height,
      depth: cabinets.depth,
    })
    .from(cabinets)
    .where(and(
      eq(cabinets.designerEligible, false),
      eq(cabinets.isActive, true),
      eq(cabinets.showInDesigner, true),
      hasPositivePublishedCabinetPrice(),
    ));
  const only = options.cabinetIds ? new Set(options.cabinetIds) : null;
  const eligible = rows.filter((row) => (!only || only.has(row.id)) && cabinetCanBeRenderedOrPlacedIn3d(row));
  for (const row of eligible) {
    await db.update(cabinets).set({ designerEligible: true }).where(and(eq(cabinets.id, row.id), eq(cabinets.designerEligible, false)));
  }
  return { checked: rows.length, promoted: eligible.length, masterCodes: eligible.map((r) => r.masterCode) };
}

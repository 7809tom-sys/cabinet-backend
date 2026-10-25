import { sanitizeCatalogPublicDescription } from "../../shared/catalogPublicDescription";

type SupplierPresentation = {
  distributorCode: string | null;
  supplierDescription?: string | null;
  skuImageUrl?: string | null;
  overrideImageUrl?: string | null;
  configJson?: string | null;
};

/** Only AEF's own source overlay is projected into this style-specific view. */
export function framelessCatalogPresentation<T extends Record<string, unknown>>(master: T, source: SupplierPresentation): T {
  if (source.distributorCode !== "AEF") return master;
  let config: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(source.configJson ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed;
  } catch { /* Preserve the master identity; do not expose malformed source data. */ }
  const result: Record<string, unknown> = { ...master };
  for (const key of ["width", "height", "depth", "category", "subCategory", "numberOfDoors", "numberOfDrawers", "numberOfAdjShelves", "graphicType", "placementType", "isCornerCabinet"]) {
    if (!(key in master) || config[key] == null) continue;
    result[key] = ["width", "height", "depth"].includes(key) ? String(config[key]) : config[key];
  }
  const description = source.supplierDescription?.trim() || (typeof config.description === "string" ? config.description : String(master.description ?? ""));
  result.description = sanitizeCatalogPublicDescription(description);
  // If a source image is missing, draw this source configuration; never show an unrelated framed master image.
  result.catalogImageUrl = source.overrideImageUrl?.trim() || source.skuImageUrl?.trim() || null;
  return result as T;
}

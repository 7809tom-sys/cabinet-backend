/**
 * Product-page description precedence.
 *
 * Cabinetdealz copy is what an admin saves. A selected distributor can have its
 * own copy in distributor_cabinet_overrides.configJson. The shared cabinets row
 * holds the master copy. distributor_skus.supplierDescription is the
 * distributor's source record and is only a display fallback. Callers must not
 * write that source field from these helpers.
 */

export type ProductPageDescriptionInput = {
  /** Cabinetdealz description saved for the selected distributor, when there is one. */
  distributorDescription?: string | null;
  /** cabinets.description */
  masterDescription?: string | null;
  /** distributor_skus.supplierDescription. Source text only. */
  supplierDescription?: string | null;
  /** Last-resort label when every description is blank. */
  masterCode?: string | null;
};

function presentText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Text the public product page should present, before catalogPublicCopy.
 * Order: our description for the selected distributor, the master description,
 * the distributor supplier description, then the master code.
 */
export function resolveProductPageDescription(input: ProductPageDescriptionInput): string {
  return (
    presentText(input.distributorDescription)
    ?? presentText(input.masterDescription)
    ?? presentText(input.supplierDescription)
    ?? presentText(input.masterCode)
    ?? ""
  );
}

/**
 * Text the admin editor should show. This is the saved Cabinetdealz copy for
 * the selected distributor, or the master description when that distributor
 * has none. Supplier source text is not an editable value.
 */
export function resolveEditableProductDescription(
  input: Pick<ProductPageDescriptionInput, "distributorDescription" | "masterDescription">,
): string {
  return presentText(input.distributorDescription) ?? presentText(input.masterDescription) ?? "";
}

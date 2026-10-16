import { hardwareStyle, type HardwareStyleId } from "./hardware";

export type GeminiMaterialManifestEntry = {
  id: string;
  role: string;
  label: string;
  itemIds: string[];
  referenceUrl: string | null;
  referenceSource?: "catalog-image" | "locked-designer-jpeg";
  provenance: string;
  provenanceDetails?: string;
};

/** Hardware styles are planning specifications, not catalog SKUs. When no
 * product image exists, preserve the actual handles in the locked JPEG instead
 * of demanding a swatch the picker cannot supply or inventing a product. */
export function geminiHardwareReference(
  styleId: HardwareStyleId,
  itemIds: string[],
  referenceUrl: string | null,
): GeminiMaterialManifestEntry | null {
  if (styleId === "none" || itemIds.length === 0) return null;
  const style = hardwareStyle(styleId);
  const source = referenceUrl ? "catalog-image" : "locked-designer-jpeg";
  return {
    id: "hardware:handles",
    role: "hardware/handles",
    label: style.label,
    itemIds,
    referenceUrl,
    referenceSource: source,
    provenance: `hardware/handles: ${style.label} — ${source}`.slice(0, 160),
    provenanceDetails: referenceUrl
      ? `Selected hardware reference: ${referenceUrl}`
      : `${style.label} is a planning style, not a catalog SKU. Copy the handles, finish and placement already visible in image 1; do not substitute a hardware product.`,
  };
}

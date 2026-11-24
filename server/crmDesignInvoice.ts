import {
  cleanStyleText,
  composeDoorStyleLabel,
  doorStyleOwnName,
  positiveStyleId,
  type DoorStyleNameFields,
} from "@shared/orderStyleLabel";

export type SavedPlacementMaterial = {
  cabinetId?: unknown;
  masterCode?: unknown;
  description?: unknown;
  styleId?: unknown;
  catalogImageUrl?: unknown;
  thumbnailUrl?: unknown;
  imageUrl?: unknown;
};

export type DesignInvoiceMaterialLine = {
  description: string;
  quantity: number;
  styleName: string | null;
  color: string | null;
};

function placementStyleId(candidate: SavedPlacementMaterial, defaultStyleId?: number | null): number | null {
  return positiveStyleId(candidate.styleId) ?? positiveStyleId(defaultStyleId);
}

/**
 * Groups saved design placements into the customer-readable material list shown
 * beneath a billed Kitchen Design line. Prices stay on the single imported
 * design charge, so material details cannot inflate the invoice total twice.
 *
 * Each cabinet is named with its own style and color. Placements without a
 * style use the design's default style. Product images are never included.
 */
export function groupedDesignInvoiceMaterials(
  placed: unknown,
  styles: ReadonlyMap<number, DoorStyleNameFields> = new Map(),
  defaultStyleId?: number | null,
): DesignInvoiceMaterialLine[] {
  if (!Array.isArray(placed)) return [];
  const grouped = new Map<string, DesignInvoiceMaterialLine>();
  for (const candidate of placed as SavedPlacementMaterial[]) {
    if (typeof candidate.cabinetId !== "number" || !Number.isFinite(candidate.cabinetId)) continue;
    const code = typeof candidate.masterCode === "string" && candidate.masterCode.trim() ? candidate.masterCode.trim() : `Cabinet #${candidate.cabinetId}`;
    const rawDescription = typeof candidate.description === "string" && candidate.description.trim() ? candidate.description.trim() : code;
    const styleId = placementStyleId(candidate, defaultStyleId);
    const style = styleId != null ? styles.get(styleId) : undefined;
    const styleName = doorStyleOwnName(style);
    const color = cleanStyleText(style?.color) || null;
    const identity = composeDoorStyleLabel(style) || cleanStyleText(rawDescription) || code;
    const key = `${candidate.cabinetId}:${styleId ?? "default"}:${code}`;
    const existing = grouped.get(key);
    if (existing) existing.quantity += 1;
    else grouped.set(key, { description: identity, quantity: 1, styleName, color });
  }
  return Array.from(grouped.values()).sort((a, b) => a.description.localeCompare(b.description));
}

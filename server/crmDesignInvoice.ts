export type SavedPlacementMaterial = {
  cabinetId?: unknown;
  masterCode?: unknown;
  description?: unknown;
  styleId?: unknown;
};

export type DesignInvoiceMaterialLine = {
  description: string;
  quantity: number;
};

/**
 * Groups saved design placements into the customer-readable material list shown
 * beneath a billed Kitchen Design line. Prices stay on the single imported
 * design charge, so material details cannot inflate the invoice total twice.
 */
export function groupedDesignInvoiceMaterials(placed: unknown): DesignInvoiceMaterialLine[] {
  if (!Array.isArray(placed)) return [];
  const grouped = new Map<string, DesignInvoiceMaterialLine>();
  for (const candidate of placed as SavedPlacementMaterial[]) {
    if (typeof candidate.cabinetId !== "number" || !Number.isFinite(candidate.cabinetId)) continue;
    const code = typeof candidate.masterCode === "string" && candidate.masterCode.trim() ? candidate.masterCode.trim() : `Cabinet #${candidate.cabinetId}`;
    const description = typeof candidate.description === "string" && candidate.description.trim() ? candidate.description.trim() : code;
    const key = `${candidate.cabinetId}:${candidate.styleId ?? "default"}:${code}`;
    const existing = grouped.get(key);
    if (existing) existing.quantity += 1;
    else grouped.set(key, { description, quantity: 1 });
  }
  return Array.from(grouped.values()).sort((a, b) => a.description.localeCompare(b.description));
}

export type KitchenCabinetBreakdown = { base: number; wall: number; tall: number; total: number };
export type KitchenCabinetWorkQuantities = KitchenCabinetBreakdown & {
  cabinetAssembly: number;
  cabinetInstallation: number;
  cabinetHanging: number;
  pantryCabinet: number;
  handles: number;
};
export type KitchenCabinetClassificationRow = {
  category?: string | null;
  subCategory?: string | null;
  productType?: string | null;
  placementType?: string | null;
  isNotCabinet?: boolean | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  height?: number | string | null;
};
export type KitchenPlanPlacement = { uid?: string | null; cabinetId?: number | null; qty?: number | null };

export function emptyKitchenCabinetBreakdown(): KitchenCabinetBreakdown {
  return { base: 0, wall: 0, tall: 0, total: 0 };
}

/** Catalog families, not a substring of an accessory's placement/description. */
export function classifyKitchenCabinet(row: KitchenCabinetClassificationRow): "base" | "wall" | "tall" | null {
  if (row.isNotCabinet) return null;
  const category = row.category?.trim().toLowerCase() ?? "";
  if (["base", "base cabinet", "base cabinets"].includes(category)) return "base";
  if (["wall", "wall cabinet", "wall cabinets"].includes(category)) return "wall";
  if (["tall", "tall cabinet", "tall cabinets"].includes(category)) return "tall";
  // These additional real catalog families are cabinets, but only their
  // documented cabinet placement determines which installation bucket they use.
  if (["ada", "american disability act cabinet", "corner", "vanity"].includes(category)) {
    const placement = row.placementType?.toLowerCase();
    if (placement === "wall" || placement === "tall") return placement;
    if (placement === "base" || placement === "island" || placement === "vanity") return "base";
  }
  return null;
}

export function countKitchenCabinets(placements: unknown, cabinetById: Map<number, KitchenCabinetClassificationRow>): KitchenCabinetBreakdown {
  const counts = emptyKitchenCabinetBreakdown();
  const seen = new Set<string>();
  if (!Array.isArray(placements)) return counts;
  for (const item of placements) {
    if (!item || typeof item !== "object") continue;
    const placement = item as KitchenPlanPlacement;
    const id = Number(placement.cabinetId);
    if (!Number.isInteger(id) || id <= 0) continue;
    const family = classifyKitchenCabinet(cabinetById.get(id) ?? {});
    if (!family) continue;
    const quantity = placement.qty == null ? 1 : Number(placement.qty);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 10_000) continue;
    const uid = typeof placement.uid === "string" ? placement.uid.trim() : "";
    if (uid && seen.has(uid)) continue;
    if (uid) seen.add(uid);
    counts[family] += quantity;
    counts.total += quantity;
  }
  return counts;
}

/** Quantities directly knowable from saved catalog placements; prices stay editable. */
export function countKitchenCabinetWork(placements: unknown, cabinetById: Map<number, KitchenCabinetClassificationRow>): KitchenCabinetWorkQuantities {
  const counts = countKitchenCabinets(placements, cabinetById);
  const work: KitchenCabinetWorkQuantities = { ...counts, cabinetAssembly: counts.total, cabinetInstallation: counts.total, cabinetHanging: counts.wall, pantryCabinet: 0, handles: 0 };
  const seen = new Set<string>();
  if (!Array.isArray(placements)) return work;
  for (const item of placements) {
    if (!item || typeof item !== "object") continue;
    const placement = item as KitchenPlanPlacement;
    const id = Number(placement.cabinetId);
    const row = cabinetById.get(id);
    if (!classifyKitchenCabinet(row ?? {})) continue;
    const quantity = placement.qty == null ? 1 : Number(placement.qty);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 10_000) continue;
    const uid = typeof placement.uid === "string" ? placement.uid.trim() : "";
    if (uid && seen.has(uid)) continue;
    if (uid) seen.add(uid);
    if (Number(row?.height ?? 0) >= 84) work.pantryCabinet += quantity;
    work.handles += quantity * Math.max(0, Number(row?.numberOfDoors ?? 0) + Number(row?.numberOfDrawers ?? 0));
  }
  return work;
}

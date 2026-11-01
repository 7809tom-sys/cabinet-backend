/**
 * Read-time cabinet warehouse coverage for Featured Door Style editors.
 *
 * A style with no origins of its own inherits distributors.warehouseZips
 * (joined by door_styles.distributorId). The first vendor zip is primary.
 * Inheritance is computed when the editor lists are read. It is never copied
 * onto door_styles.warehouseZip / door_styles.warehouseZips.
 */

const FIVE_DIGIT_ZIP = /^\d{5}$/;

export type DoorStyleWarehouseCoverage = {
  /** Vendor cabinet warehouse coverage. Always an array; first zip is primary. */
  distributorWarehouseZips: string[];
  /** The style's own origins, or the vendor coverage list when the style has none. */
  effectiveWarehouseZips: string[];
  /** True when the style stores no origins, so coverage comes from the vendor. */
  warehouseZipsInherited: boolean;
};

export type DoorStyleWarehouseCoverageInput = {
  warehouseZips?: unknown;
  warehouseZip?: string | null;
  distributorWarehouseZips?: unknown;
};

function coerceZipEntries(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // A bare ZIP string is a one-item list.
    }
    return [trimmed];
  }
  return [];
}

/** Ordered, de-duplicated 5-digit ZIPs. The first kept value stays primary. */
export function normalizeWarehouseZipList(value: unknown): string[] {
  const seen = new Set<string>();
  const zips: string[] = [];
  for (const entry of coerceZipEntries(value)) {
    if (typeof entry !== "string") continue;
    const zip = entry.trim();
    if (!FIVE_DIGIT_ZIP.test(zip) || seen.has(zip)) continue;
    seen.add(zip);
    zips.push(zip);
  }
  return zips;
}

/**
 * Origins stored on the door style itself. warehouseZips wins in order;
 * a legacy warehouseZip is appended when it is not already listed.
 * An empty result means the style inherits vendor coverage.
 */
export function styleOwnOriginZips(input: Pick<DoorStyleWarehouseCoverageInput, "warehouseZips" | "warehouseZip">): string[] {
  return normalizeWarehouseZipList([...normalizeWarehouseZipList(input.warehouseZips), input.warehouseZip ?? ""]);
}

export function doorStyleWarehouseCoverage(input: DoorStyleWarehouseCoverageInput): DoorStyleWarehouseCoverage {
  const own = styleOwnOriginZips(input);
  const distributorWarehouseZips = normalizeWarehouseZipList(input.distributorWarehouseZips);
  const warehouseZipsInherited = own.length === 0;
  return {
    distributorWarehouseZips,
    effectiveWarehouseZips: warehouseZipsInherited ? distributorWarehouseZips : own,
    warehouseZipsInherited,
  };
}

export function withDoorStyleWarehouseCoverage<T extends DoorStyleWarehouseCoverageInput>(
  row: T,
): Omit<T, keyof DoorStyleWarehouseCoverage> & DoorStyleWarehouseCoverage {
  return {
    ...row,
    ...doorStyleWarehouseCoverage(row),
  };
}

/**
 * Persist a style's own origin list. An empty submission stays empty (null)
 * so the style keeps inheriting vendor coverage. This function has no vendor
 * zip argument and must not be given distributor coverage to copy.
 */
export function doorStyleOwnWarehouseZipWrite(
  warehouseZips: readonly string[] | null | undefined,
): { warehouseZips: string[] | null; warehouseZip: string | null } {
  const normalizedOrigins = Array.from(new Set(
    (warehouseZips ?? []).map((zip) => zip.trim()).filter(Boolean),
  ));
  return {
    warehouseZips: normalizedOrigins.length > 0 ? normalizedOrigins : null,
    warehouseZip: normalizedOrigins[0] ?? null,
  };
}

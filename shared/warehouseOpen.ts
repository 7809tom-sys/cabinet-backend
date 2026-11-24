/**
 * Open/closed warehouse rules for freight origin selection.
 *
 * A warehouse is a distributor + ZIP record (docs/sql/0287). ZIP lists on
 * distributors and door styles stay the candidate origins. A ZIP present in
 * `closedZips` is never chosen, even when it is the nearest. A ZIP with no
 * record is open, which is also the behavior before 0287 has been run.
 */

export const WAREHOUSES_MIGRATION_FILE = "0287_warehouses_open_closed.tidb.sql";

/** Cause on the quote error so checkout can show a closed-warehouse reason. */
export class AllWarehousesClosedError extends Error {
  readonly warehousesClosed = true;
  constructor(message: string) {
    super(message);
    this.name = "AllWarehousesClosedError";
  }
}

/** Seeded by 0287. Starts closed and is not added to any origin ZIP list. */
export const WOODLAND_SACRAMENTO_WAREHOUSE = {
  distributorId: 180001,
  zip: "95691",
  name: "Woodland Sacramento",
  address: "2925 Ramco St, West Sacramento CA 95691",
  isOpen: false,
} as const;

export function normalizeOriginZip(input: string | null | undefined): string | null {
  if (input == null) return null;
  const digits = String(input).replace(/\D/g, "");
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

/** True only for an explicit closed flag. Missing or unexpected values stay open. */
export function warehouseRowIsClosed(isOpen: unknown): boolean {
  return isOpen === false || isOpen === 0 || isOpen === "0";
}

export function filterOpenOriginZips(
  zips: readonly (string | null | undefined)[] | null | undefined,
  closedZips: ReadonlySet<string>,
): string[] {
  const open: string[] = [];
  const seen = new Set<string>();
  for (const raw of zips ?? []) {
    const zip = normalizeOriginZip(raw);
    if (!zip || seen.has(zip) || closedZips.has(zip)) continue;
    seen.add(zip);
    open.push(zip);
  }
  return open;
}

export type OpenOriginChoice = {
  /** Origins that may be used, nearest-first selection happens after this. */
  originZips: string[];
  /** The style (or its inherited distributor list) had origins and every one is closed. */
  allListedWarehousesClosed: boolean;
  closedListedZips: string[];
  listedZips: string[];
};

/**
 * Style origins win when the style lists any. Otherwise the distributor list
 * is the candidate set. Closed ZIPs are removed from whichever list is used.
 */
export function chooseOpenOriginZips(input: {
  styleOriginZips: readonly (string | null | undefined)[] | null | undefined;
  distributorOriginZips: readonly (string | null | undefined)[] | null | undefined;
  closedZips: ReadonlySet<string>;
}): OpenOriginChoice {
  const style = filterOpenOriginZips(input.styleOriginZips, new Set());
  const distributor = filterOpenOriginZips(input.distributorOriginZips, new Set());
  const listedZips = style.length > 0 ? style : distributor;
  const closedListedZips = listedZips.filter((zip) => input.closedZips.has(zip));
  const originZips = listedZips.filter((zip) => !input.closedZips.has(zip));
  return {
    originZips,
    allListedWarehousesClosed: listedZips.length > 0 && originZips.length === 0,
    closedListedZips,
    listedZips,
  };
}

/** Drop closed warehouses before nearest-origin selection. */
export function excludeClosedWarehouseRefs<T extends { zip: string }>(
  warehouses: readonly T[],
  closedZips: ReadonlySet<string>,
): T[] {
  return warehouses.filter((warehouse) => {
    const zip = normalizeOriginZip(warehouse.zip);
    return zip != null && !closedZips.has(zip);
  });
}

/**
 * Operations test origin used only when every listed warehouse is closed.
 * Returns null when that fallback is itself a closed warehouse ZIP.
 */
export function closedWarehouseFallbackZip(
  fallbackZip: string | null | undefined,
  closedZips: ReadonlySet<string>,
): string | null {
  const zip = normalizeOriginZip(fallbackZip);
  if (!zip || closedZips.has(zip)) return null;
  return zip;
}

export function allWarehousesClosedMessage(styleName: string, closedZips: readonly string[]): string {
  const listed = closedZips.length > 0 ? ` (${closedZips.join(", ")})` : "";
  return `${styleName} cannot ship because every warehouse for this style is closed${listed}. Reopen a warehouse in Admin before this order or quote can use that line.`;
}

export function allWarehousesClosedLabel(originZip: string): string {
  return `all warehouses closed · Operations test origin ${originZip}`;
}

// Supplier lock (pure, testable).
//
// A single order must stay with ONE supplier (distributorId). Colors and door
// styles from that supplier mix freely — a two-tone kitchen is one order.
// Mixing suppliers would split freight, pricing, and the purchase order, so
// submit rejects it.
//
// Pelican surface lines and hardware lines carry no door style and no supplier
// constraint. A cabinet line with no distributor yet does not, by itself, fail
// the lock.

export interface FamilyLockLine {
  /** Door style on this line. Several styles are allowed. */
  styleId?: number | null;
  /** Supplier for this line. The order may contain only one. */
  distributorId?: number | null;
  /** surface and hardware lines are not cabinet-supplier lines. */
  productKind?: string | null;
  /** Optional human label, used only for error messages. */
  masterCode?: string | null;
}

export interface FamilyLockResult {
  ok: boolean;
  /** The single supplier the order is locked to, when one is present. */
  distributorId: number | null;
  /** Distinct supplier ids on cabinet lines (sorted ascending). */
  distinctDistributorIds: number[];
  /** Set only when every cabinet line shares one door style. */
  styleId: number | null;
  /** Distinct door styles on cabinet lines (sorted ascending). */
  distinctStyleIds: number[];
  /** Human-readable reason when ok = false. */
  reason?: string;
}

function positiveId(value: number | null | undefined): number | null {
  if (value == null) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cabinetLines(lines: FamilyLockLine[]): FamilyLockLine[] {
  return lines.filter((line) => line.productKind !== "surface" && line.productKind !== "hardware");
}

/**
 * Validate that every cabinet line in an order comes from one supplier.
 * Different door styles from that supplier are allowed.
 */
export function validateFamilyLock(lines: FamilyLockLine[]): FamilyLockResult {
  const cabinets = cabinetLines(lines);
  const distributorIds = cabinets
    .map((line) => positiveId(line.distributorId))
    .filter((id): id is number => id != null);
  const distinctDistributorIds = Array.from(new Set(distributorIds)).sort((a, b) => a - b);
  const styleIds = cabinets
    .map((line) => positiveId(line.styleId))
    .filter((id): id is number => id != null);
  const distinctStyleIds = Array.from(new Set(styleIds)).sort((a, b) => a - b);
  const singleStyleId = distinctStyleIds.length === 1 ? distinctStyleIds[0] : null;

  if (distinctDistributorIds.length > 1) {
    return {
      ok: false,
      distributorId: null,
      distinctDistributorIds,
      styleId: null,
      distinctStyleIds,
      reason:
        "An order must stay with a single supplier. " +
        `This order mixes ${distinctDistributorIds.length} suppliers (ids: ${distinctDistributorIds.join(", ")}). ` +
        "Please split it into one order per supplier.",
    };
  }

  return {
    ok: true,
    distributorId: distinctDistributorIds[0] ?? null,
    distinctDistributorIds,
    styleId: singleStyleId,
    distinctStyleIds,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Add-time family-lock decision (pure, testable).
//
// SCOPE = DISTRIBUTOR (supply line), NOT a single door style/color.
//
// Mixing colors (and door styles) in one design/order is a first-class feature:
// two-tone kitchens (e.g. a white perimeter + a contrasting island, or a
// completely different color on the wall cabinets than the base cabinets) are
// very common. So the cart must NOT block an item just because its color/style
// differs from what's already in it. "Lock" in the UI means "I'm done with this
// color, let me pick another" — a commit-and-continue action, not a restriction.
//
// The ONE thing we still enforce is that every line comes from the SAME
// distributor (supply line); cross-distributor mixing would break pricing,
// freight and ordering, so that is rejected. An empty cart (lockedDistributorId
// == null) accepts anything and sets the lock; once set, only items from that
// same distributor are accepted. Items with an unknown distributor (null) are
// always allowed (they carry no constraint).
// ─────────────────────────────────────────────────────────────────────────────
export interface CanAddResult {
  ok: boolean;
  /** True only when the cart already holds a DIFFERENT distributor. */
  blockedByLock: boolean;
}

export function canAddToCart(
  lockedDistributorId: number | null | undefined,
  incomingDistributorId: number | null | undefined
): CanAddResult {
  // Cart empty / no lock yet — anything is allowed and sets the lock.
  if (lockedDistributorId == null) return { ok: true, blockedByLock: false };
  // Incoming item has no distributor constraint — always allowed.
  if (incomingDistributorId == null) return { ok: true, blockedByLock: false };
  if (Number(lockedDistributorId) === Number(incomingDistributorId)) {
    return { ok: true, blockedByLock: false };
  }
  return { ok: false, blockedByLock: true };
}

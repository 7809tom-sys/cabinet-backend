// Family-lock rule (pure, testable).
//
// Business rule: a single order must stay within ONE cabinet family — i.e. one
// door style (styleId) sourced from one supply line (distributorId). Mixing
// families on a single order forces multiple shipments and breaks pricing/finish
// consistency, so the backend rejects it.
//
// Only *matched, priced* lines are constrained: a line with no resolved styleId
// (e.g. an unmatched OCR line still in review) does not break the lock — it
// simply isn't covered yet. The order-level styleId, when supplied, defines the
// canonical family every priced line must agree with.

export interface FamilyLockLine {
  /** Resolved door-style id for this line, or null if not yet matched/priced. */
  styleId?: number | null;
  /** Optional human label, used only for error messages. */
  masterCode?: string | null;
}

export interface FamilyLockResult {
  ok: boolean;
  /** The single styleId the order is locked to, when resolvable. */
  styleId: number | null;
  /** Distinct styleIds seen across priced lines (sorted ascending). */
  distinctStyleIds: number[];
  /** Human-readable reason when ok = false. */
  reason?: string;
}

/**
 * Validate that every priced line in an order belongs to one door-style family.
 *
 * @param lines         order lines (each may carry a styleId once priced)
 * @param orderStyleId  optional order-level family the lines must match
 */
export function validateFamilyLock(
  lines: FamilyLockLine[],
  orderStyleId?: number | null
): FamilyLockResult {
  const styleIds = lines
    .map((l) => (l.styleId == null ? null : Number(l.styleId)))
    .filter((s): s is number => s != null && Number.isFinite(s));

  const distinct = Array.from(new Set(styleIds)).sort((a, b) => a - b);

  // No priced line carries a style yet — nothing to enforce. Lock to the
  // order-level style if one was provided.
  if (distinct.length === 0) {
    return {
      ok: true,
      styleId: orderStyleId ?? null,
      distinctStyleIds: [],
    };
  }

  // More than one style across priced lines → mixed family, reject.
  if (distinct.length > 1) {
    return {
      ok: false,
      styleId: null,
      distinctStyleIds: distinct,
      reason:
        "An order must stay within a single door-style family. " +
        `This order mixes ${distinct.length} different styles (ids: ${distinct.join(", ")}). ` +
        "Please split it into one order per door style.",
    };
  }

  const single = distinct[0];

  // If the order declares a family, every priced line must match it.
  if (orderStyleId != null && Number(orderStyleId) !== single) {
    return {
      ok: false,
      styleId: null,
      distinctStyleIds: distinct,
      reason:
        `Line items belong to door style ${single}, ` +
        `but the order is set to style ${orderStyleId}. ` +
        "All items must share one door-style family.",
    };
  }

  return { ok: true, styleId: single, distinctStyleIds: distinct };
}

// ─────────────────────────────────────────────────────────────────────────────
// Add-time family-lock decision (pure, testable).
//
// The cart is locked to ONE door-style family: the styleId of whatever is
// already in it. This helper decides whether a new item may be added. An empty
// cart (lockedStyleId == null) accepts anything and sets the lock; a non-empty
// cart only accepts items from the same family.
// ─────────────────────────────────────────────────────────────────────────────
export interface CanAddResult {
  ok: boolean;
  /** True only when the cart already holds a DIFFERENT family. */
  blockedByLock: boolean;
}

export function canAddToCart(
  lockedStyleId: number | null | undefined,
  incomingStyleId: number
): CanAddResult {
  if (lockedStyleId == null) return { ok: true, blockedByLock: false };
  if (Number(lockedStyleId) === Number(incomingStyleId)) {
    return { ok: true, blockedByLock: false };
  }
  return { ok: false, blockedByLock: true };
}

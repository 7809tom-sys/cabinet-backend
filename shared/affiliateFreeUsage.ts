/**
 * Free-usage rules for an affiliate without a paid membership.
 *
 * An affiliate store whose `affiliates.membershipStatus` is not `active` gets
 * five free uses of the design tools, counted together across the three things
 * that do real work:
 *
 *   design        a new saved kitchen design (creating a plan, not autosaving it)
 *   auto_design   one Auto Design run in the Designer
 *   photo_render  one new Photo Quality render
 *
 * Paid (active) affiliates are unlimited. Admins are exempt. People who are not
 * an affiliate at all — house customers, contractors, distributors — are never
 * counted, so the storefront shopper is unaffected.
 *
 * The count lives in the `affiliate_free_usage` ledger (one row per consumed
 * use) rather than being derived from how many designs exist. A ledger cannot
 * be reset by deleting designs, and deleting a free design does not hand the
 * use back.
 */

export const FREE_USAGE_LIMIT = 5;

export const FREE_USAGE_KINDS = [
  "design",
  "auto_design",
  "photo_render",
] as const;
export type FreeUsageKind = (typeof FREE_USAGE_KINDS)[number];

/**
 * Stable, machine-readable reason the server refused a use. The tRPC error
 * formatter in server/_core/trpc.ts copies this onto `error.data.cause`, so the
 * client can branch on it instead of matching the message text.
 */
export const MEMBERSHIP_REQUIRED_CAUSE = "MEMBERSHIP_REQUIRED";

export const FREE_USAGE_LABELS: Record<FreeUsageKind, string> = {
  design: "saved design",
  auto_design: "Auto Design run",
  photo_render: "photo render",
};

export const MEMBERSHIP_REQUIRED_MESSAGE = `Your ${FREE_USAGE_LIMIT} free designs are used up. Buy the affiliate membership to keep saving designs, running Auto Design, and creating photo renders.`;

export type FreeUsageKindCounts = Record<FreeUsageKind, number>;

export type FreeUsageSnapshot = {
  /** True when the account is actually capped (affiliate without an active membership). */
  enforced: boolean;
  unlimited: boolean;
  /** Null when unlimited. */
  limit: number | null;
  used: number;
  /** Null when unlimited. Never negative. */
  remaining: number | null;
  byKind: FreeUsageKindCounts;
  membershipStatus: string | null;
};

export type FreeUsageBasis = {
  /** users.role */
  role: string | null | undefined;
  /** True when the person resolves to an affiliate (owner or active team member). */
  hasAffiliate: boolean;
  /** affiliates.membershipStatus; null when the row was not read or does not exist. */
  membershipStatus: string | null | undefined;
};

/** Only an active paid membership removes the cap. Pending, past_due, and cancelled are all capped. */
export function isPaidMembership(
  membershipStatus: string | null | undefined
): boolean {
  return (membershipStatus ?? "").trim().toLowerCase() === "active";
}

/**
 * Who the five free uses apply to. Admins run the platform, and a person with
 * no affiliate relationship is not an affiliate trial, so neither is capped.
 */
export function freeUsageApplies(basis: FreeUsageBasis): boolean {
  if (basis.role === "admin") return false;
  if (!basis.hasAffiliate) return false;
  return !isPaidMembership(basis.membershipStatus);
}

export function emptyUsageCounts(): FreeUsageKindCounts {
  return { design: 0, auto_design: 0, photo_render: 0 };
}

/** Coerces a partial/loose kind tally into the fixed shape, ignoring unknown kinds. */
export function normalizeUsageCounts(
  counts: Partial<Record<string, number>> | null | undefined
): FreeUsageKindCounts {
  const out = emptyUsageCounts();
  for (const kind of FREE_USAGE_KINDS) {
    const value = counts?.[kind];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      out[kind] = Math.floor(value);
    }
  }
  return out;
}

export function totalUsage(counts: FreeUsageKindCounts): number {
  return FREE_USAGE_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
}

export function freeUsageSnapshot(
  counts: Partial<Record<string, number>> | null | undefined,
  options: {
    enforced: boolean;
    membershipStatus?: string | null;
    limit?: number;
  }
): FreeUsageSnapshot {
  const byKind = normalizeUsageCounts(counts);
  const used = totalUsage(byKind);
  const limit = options.enforced ? (options.limit ?? FREE_USAGE_LIMIT) : null;
  return {
    enforced: options.enforced,
    unlimited: limit == null,
    limit,
    used,
    remaining: limit == null ? null : Math.max(0, limit - used),
    byKind,
    membershipStatus: options.membershipStatus ?? null,
  };
}

/** True when the next use must be refused. */
export function freeUsageExhausted(snapshot: FreeUsageSnapshot): boolean {
  if (!snapshot.enforced) return false;
  return snapshot.remaining != null && snapshot.remaining <= 0;
}

/** What the person is told when the cap is reached. */
export function membershipRequiredMessage(kind: FreeUsageKind): string {
  return `This ${FREE_USAGE_LABELS[kind]} needs the affiliate membership. ${MEMBERSHIP_REQUIRED_MESSAGE}`;
}

/** Shown next to the tool while the free uses are running out. */
export function freeUsageNotice(snapshot: FreeUsageSnapshot): string | null {
  if (!snapshot.enforced || snapshot.remaining == null) return null;
  if (snapshot.remaining <= 0) return MEMBERSHIP_REQUIRED_MESSAGE;
  const noun = snapshot.remaining === 1 ? "use" : "uses";
  return `${snapshot.remaining} of ${snapshot.limit} free ${noun} left. Buy the affiliate membership for unlimited designs, Auto Design, and photo renders.`;
}

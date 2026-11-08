/**
 * Design allowances for an affiliate without a paid membership.
 *
 * There are two layers, and they are spent in this order:
 *
 *   1. the five free uses, counted together across saved designs, Auto Design
 *      runs, and photo renders;
 *   2. an admin-granted bonus on top of those five (`affiliate_design_grants`),
 *      which an admin can top back up to its stored count at any time.
 *
 * When both are gone the server refuses with MEMBERSHIP_REQUIRED.
 *
 * Paid (active) affiliates are unlimited. Admins are exempt. People who are not
 * an affiliate at all — house customers, contractors, distributors — are never
 * counted, so the storefront shopper is unaffected.
 *
 * The free count lives in the `affiliate_free_usage` ledger (one row per
 * consumed use) rather than being derived from how many designs exist. A ledger
 * cannot be reset by deleting designs, and deleting a free design does not hand
 * the use back.
 *
 * A bonus grant carries its own count (`designCount`) and its own spent counter
 * (`usedSinceGrant`), so renewing is just resetting the counter — it never has
 * to touch the ledger and never revives an already-spent free use.
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

export const MEMBERSHIP_REQUIRED_MESSAGE =
  "Your free designs and any extra design allowance are used up. Buy the affiliate membership to keep saving designs, running Auto Design, and creating photo renders.";

const BUY_MEMBERSHIP_LINE =
  "Buy the affiliate membership for unlimited designs, Auto Design, and photo renders.";

export type FreeUsageKindCounts = Record<FreeUsageKind, number>;

/** A bonus grant as the gate and the admin view both see it. */
export type DesignGrantSummary = {
  id: number;
  /** The count the admin stored on the grant, e.g. 5. */
  designCount: number;
  /** Uses spent since the grant was issued or last renewed. */
  used: number;
  /** designCount - used, never negative. */
  remaining: number;
  /** The emails the grant is tied to, normalized lowercase. */
  contactEmails: string[];
  /** True when the signed-in person's email is one of contactEmails. */
  appliesToYou: boolean;
  grantedBy: string | null;
  /** ISO strings so the value survives the wire unchanged. */
  grantedAt: string | null;
  renewedAt: string | null;
  renewedBy: string | null;
};

export type FreeUsageSnapshot = {
  /** True when the account is actually capped (affiliate without an active membership). */
  enforced: boolean;
  unlimited: boolean;
  /** The free allowance. Null when unlimited. */
  limit: number | null;
  /** Free uses spent, across all three kinds. */
  used: number;
  /** Null when unlimited. Never negative. */
  freeRemaining: number | null;
  /** The bonus grant for this store, whether or not it applies to this person. */
  grant: DesignGrantSummary | null;
  /** Bonus uses this person can still spend: 0 when there is no grant, or when it is not theirs. */
  grantRemaining: number;
  /** Free plus bonus. Null when unlimited. */
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
 * Who the free uses and any bonus grant apply to. Admins run the platform, and
 * a person with no affiliate relationship is not an affiliate trial, so neither
 * is capped.
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

/** One email per entry, lowercased, de-duplicated, in the order given. */
export function normalizeContactEmails(
  value: string | readonly string[] | null | undefined
): string[] {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[,;\s]+/);
  const out: string[] = [];
  for (const entry of raw) {
    const email = String(entry ?? "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/** How contactEmails is stored on the row: one comma-separated line. */
export function formatContactEmails(
  value: string | readonly string[] | null | undefined
): string {
  return normalizeContactEmails(value).join(",");
}

/** True when this person's sign-in email is one the grant was issued for. */
export function contactEmailMatches(
  contactEmails: string | readonly string[] | null | undefined,
  email: string | null | undefined
): boolean {
  const wanted = (email ?? "").trim().toLowerCase();
  if (!wanted) return false;
  return normalizeContactEmails(contactEmails).includes(wanted);
}

export function normalizeDesignGrant(
  grant:
    | {
        id: number;
        designCount: number;
        usedSinceGrant: number;
        contactEmails?: string | null;
        grantedBy?: string | null;
        grantedAt?: Date | string | null;
        renewedAt?: Date | string | null;
        renewedBy?: string | null;
      }
    | null
    | undefined,
  viewerEmail: string | null | undefined
): DesignGrantSummary | null {
  if (!grant) return null;
  const designCount = Math.max(0, Math.floor(Number(grant.designCount) || 0));
  const used = Math.max(0, Math.floor(Number(grant.usedSinceGrant) || 0));
  const contactEmails = normalizeContactEmails(grant.contactEmails);
  const at = (value: Date | string | null | undefined) =>
    value == null
      ? null
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  return {
    id: grant.id,
    designCount,
    used,
    remaining: Math.max(0, designCount - used),
    contactEmails,
    appliesToYou: contactEmailMatches(contactEmails, viewerEmail),
    grantedBy: grant.grantedBy ?? null,
    grantedAt: at(grant.grantedAt),
    renewedAt: at(grant.renewedAt),
    renewedBy: grant.renewedBy ?? null,
  };
}

export function freeUsageSnapshot(
  counts: Partial<Record<string, number>> | null | undefined,
  options: {
    enforced: boolean;
    membershipStatus?: string | null;
    limit?: number;
    grant?: DesignGrantSummary | null;
  }
): FreeUsageSnapshot {
  const byKind = normalizeUsageCounts(counts);
  const used = totalUsage(byKind);
  const limit = options.enforced ? (options.limit ?? FREE_USAGE_LIMIT) : null;
  const freeRemaining = limit == null ? null : Math.max(0, limit - used);
  const grant = options.grant ?? null;
  // A grant this person's email does not match is visible but not spendable by
  // them, so it must not raise the number they are told they have left.
  const grantRemaining =
    limit == null || !grant?.appliesToYou ? 0 : grant.remaining;
  return {
    enforced: options.enforced,
    unlimited: limit == null,
    limit,
    used,
    freeRemaining,
    grant,
    grantRemaining,
    remaining: limit == null ? null : (freeRemaining ?? 0) + grantRemaining,
    byKind,
    membershipStatus: options.membershipStatus ?? null,
  };
}

/** True when the next use must be refused. */
export function freeUsageExhausted(snapshot: FreeUsageSnapshot): boolean {
  if (!snapshot.enforced) return false;
  return snapshot.remaining != null && snapshot.remaining <= 0;
}

/** The admin's stored count and what is left of it, e.g. "Extra designs: 5 (3 left)". */
export function grantLine(
  grant: DesignGrantSummary | null | undefined
): string | null {
  if (!grant) return null;
  return `Extra designs: ${grant.designCount} (${grant.remaining} left)`;
}

/** What the person is told when both the free uses and the grant are gone. */
export function membershipRequiredMessage(kind: FreeUsageKind): string {
  return `This ${FREE_USAGE_LABELS[kind]} needs the affiliate membership. ${MEMBERSHIP_REQUIRED_MESSAGE}`;
}

/**
 * Shown next to the tool: what is left of the free five and of the bonus grant,
 * or the buy prompt when both are gone.
 */
export function freeUsageNotice(snapshot: FreeUsageSnapshot): string | null {
  if (!snapshot.enforced || snapshot.remaining == null) return null;
  if (snapshot.remaining <= 0) return MEMBERSHIP_REQUIRED_MESSAGE;
  const parts: string[] = [];
  if ((snapshot.freeRemaining ?? 0) > 0) {
    const noun = snapshot.freeRemaining === 1 ? "use" : "uses";
    parts.push(
      `${snapshot.freeRemaining} of ${snapshot.limit} free ${noun} left.`
    );
  }
  const line = grantLine(snapshot.grant?.appliesToYou ? snapshot.grant : null);
  if (line) parts.push(`${line}.`);
  return `${parts.join(" ")} ${BUY_MEMBERSHIP_LINE}`;
}

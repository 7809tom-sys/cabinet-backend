/**
 * Server-side enforcement of the affiliate design allowance.
 *
 * An affiliate whose membership is not active has two layers of allowance, and
 * they are spent in this order:
 *
 *   1. the five free uses, counted together across saved designs, Auto Design
 *      runs, and photo renders (the `affiliate_free_usage` ledger);
 *   2. an admin-granted bonus on top of those five (`affiliate_design_grants`),
 *      which an admin can top back up to its stored count at any time.
 *
 * Only when both are gone is the use refused with MEMBERSHIP_REQUIRED.
 *
 * Every entry point:
 *
 *   1. `loadFreeUsageGate`        — is this person capped, and how much is left;
 *   2. `assertFreeUsageAvailable` — refuse before any work is done;
 *   3. `claimFreeUsage`           — spend the free bucket, else the grant (this
 *                                   is the real guard);
 *   4. `releaseFreeUsage`         — give the use back if the work then failed.
 *
 * Claiming first and releasing on failure means neither bucket keeps a use that
 * did not produce something. Both buckets are claimed with a write that is then
 * re-checked, so two simultaneous requests cannot both spend the last use.
 *
 * A grant belongs to the store but is spendable only by the emails recorded on
 * it (`contactEmails`, read from the affiliate's own row when it is issued). An
 * owner or listed contact signed in with one of those emails draws from it; a
 * team member whose email is not listed does not, and is told only about the
 * free five.
 *
 * Who is capped is decided from the signed-in person, not from the design:
 *  - admins are exempt;
 *  - someone who is not an affiliate at all (a storefront customer, contractor,
 *    or house shopper) is never counted;
 *  - an affiliate owner or their enabled team member is capped while
 *    affiliates.membershipStatus is anything other than "active".
 *
 * See shared/affiliateFreeUsage.ts for the pure rules and the messages.
 */
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  affiliates,
  affiliateDesignGrants,
  affiliateFreeUsage,
} from "../../drizzle/schema";
import {
  FREE_USAGE_LIMIT,
  MEMBERSHIP_REQUIRED_CAUSE,
  formatContactEmails,
  freeUsageApplies,
  freeUsageExhausted,
  freeUsageNotice,
  freeUsageSnapshot,
  grantLine,
  membershipRequiredMessage,
  normalizeContactEmails,
  normalizeDesignGrant,
  type DesignGrantSummary,
  type FreeUsageKind,
  type FreeUsageSnapshot,
} from "../../shared/affiliateFreeUsage";
import { resolveAffiliateAccess } from "./affiliateAccess";
import { isMissingSchemaError } from "./orderSchemaGuard";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

/** Which allowance a use came out of. */
export type FreeUsageBucket = "free" | "grant";

export type FreeUsageGate = {
  /** True when this person's uses must be counted. */
  enforced: boolean;
  /** The affiliate whose ledger is used. Null when not enforced. */
  affiliateId: number | null;
  membershipStatus: string | null;
  /** The signed-in person's email, which is what a grant's contactEmails are matched against. */
  viewerEmail: string | null;
  snapshot: FreeUsageSnapshot;
};

/** A claimed use, so the caller can hand it back if the work fails. */
export type FreeUsageClaim = {
  /** Set when the use came out of the free five. */
  ledgerId: number | null;
  /** Set when the use came out of the admin grant. */
  grantId: number | null;
  bucket: FreeUsageBucket | null;
  kind: FreeUsageKind;
  affiliateId: number | null;
  /** The balance after this use. */
  snapshot: FreeUsageSnapshot;
};

type GateUser = { id: number; email: string | null; role: string };

type GrantRow = typeof affiliateDesignGrants.$inferSelect;

export type UsageState = {
  counts: Partial<Record<string, number>>;
  grant: GrantRow | null;
};

function uncappedGate(
  affiliateId: number | null,
  membershipStatus: string | null,
  limit: number,
  viewerEmail: string | null
): FreeUsageGate {
  return {
    enforced: false,
    affiliateId,
    membershipStatus,
    viewerEmail,
    snapshot: freeUsageSnapshot(null, {
      enforced: false,
      membershipStatus,
      limit,
    }),
  };
}

async function readMembershipStatus(
  db: Database,
  affiliateId: number
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ membershipStatus: affiliates.membershipStatus })
      .from(affiliates)
      .where(eq(affiliates.id, affiliateId))
      .limit(1);
    return row?.membershipStatus ?? null;
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    // A row we cannot read is treated as unpaid, so the boundary errs toward the
    // paid membership rather than away from it.
    console.warn(
      "[Affiliate usage] membershipStatus could not be read; treating the store as unpaid.",
      error
    );
    return null;
  }
}

/**
 * Count the uses this store has spent, per kind. The ledger for one store can
 * never hold more than about six rows: once a store hits the cap it is refused,
 * and a store that becomes paid stops being counted. So the rows are read and
 * tallied here rather than aggregated in SQL, which also keeps the count honest
 * for any driver that returns its aggregate as a string.
 */
export async function loadUsageCounts(
  db: Database,
  affiliateId: number
): Promise<Partial<Record<string, number>>> {
  const rows = await db
    .select({ kind: affiliateFreeUsage.kind })
    .from(affiliateFreeUsage)
    .where(eq(affiliateFreeUsage.affiliateId, affiliateId));
  const counts: Partial<Record<string, number>> = {};
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  return counts;
}

/**
 * The store's live grant row, or null. A missing table means the grant SQL has
 * not run yet, which is not an error: it means nobody has a grant.
 */
export async function loadDesignGrant(
  db: Database,
  affiliateId: number
): Promise<GrantRow | null> {
  try {
    const [row] = await db
      .select()
      .from(affiliateDesignGrants)
      .where(eq(affiliateDesignGrants.affiliateId, affiliateId))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    console.warn(
      "[Affiliate usage] affiliate_design_grants is missing; run the design-grant SQL. Grants are ignored until then."
    );
    return null;
  }
}

/** Fresh counts and grant for one store, so a claim decides on current rows. */
export async function loadUsageState(
  db: Database,
  affiliateId: number
): Promise<UsageState> {
  const [counts, grant] = await Promise.all([
    loadUsageCounts(db, affiliateId),
    loadDesignGrant(db, affiliateId),
  ]);
  return { counts, grant };
}

function snapshotFor(
  state: UsageState,
  options: {
    enforced: boolean;
    membershipStatus: string | null;
    limit: number;
    viewerEmail: string | null;
  }
): FreeUsageSnapshot {
  return freeUsageSnapshot(state.counts, {
    enforced: options.enforced,
    membershipStatus: options.membershipStatus,
    limit: options.limit,
    grant: normalizeDesignGrant(state.grant, options.viewerEmail),
  });
}

/**
 * Resolve whether this person is capped and what they have used. The ledger and
 * the grant are only read when the cap applies, so a paid affiliate and a
 * customer pay nothing for this check.
 */
export async function loadFreeUsageGate(
  db: Database,
  user: GateUser,
  options: { limit?: number } = {}
): Promise<FreeUsageGate> {
  const limit = options.limit ?? FREE_USAGE_LIMIT;
  if (user.role === "admin") return uncappedGate(null, null, limit, user.email);
  const access = await resolveAffiliateAccess(db, user);
  if (!access) return uncappedGate(null, null, limit, user.email);
  const membershipStatus = await readMembershipStatus(db, access.affiliateId);
  if (
    !freeUsageApplies({
      role: user.role,
      hasAffiliate: true,
      membershipStatus,
    })
  ) {
    return {
      enforced: false,
      affiliateId: access.affiliateId,
      membershipStatus,
      viewerEmail: user.email,
      // A paid store is unlimited; the grant is not read at all.
      snapshot: freeUsageSnapshot(null, {
        enforced: false,
        membershipStatus,
        limit,
      }),
    };
  }
  let state: UsageState;
  try {
    state = await loadUsageState(db, access.affiliateId);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    // The ledger is added by the SQL Tom runs by hand. Until it exists the cap
    // cannot be counted, so the Designer keeps working instead of failing for
    // every unpaid affiliate. Logged so the missing SQL is visible.
    console.warn(
      "[Affiliate usage] affiliate_free_usage is missing; run the free-usage SQL. The cap is not enforced until then."
    );
    return uncappedGate(
      access.affiliateId,
      membershipStatus,
      limit,
      user.email
    );
  }
  return {
    enforced: true,
    affiliateId: access.affiliateId,
    membershipStatus,
    viewerEmail: user.email,
    snapshot: snapshotFor(state, {
      enforced: true,
      membershipStatus,
      limit,
      viewerEmail: user.email,
    }),
  };
}

function membershipError(kind: FreeUsageKind): TRPCError {
  return new TRPCError({
    code: "FORBIDDEN",
    message: membershipRequiredMessage(kind),
    // The tRPC error formatter copies this onto error.data.cause, so the client
    // can branch on MEMBERSHIP_REQUIRED instead of matching message text.
    cause: new Error(MEMBERSHIP_REQUIRED_CAUSE),
  });
}

/** Throws the membership error when the next use would exceed both allowances. */
export function assertFreeUsageAvailable(
  gate: FreeUsageGate,
  kind: FreeUsageKind
): void {
  if (freeUsageExhausted(gate.snapshot)) throw membershipError(kind);
}

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number(
    (header as { affectedRows?: number } | undefined)?.affectedRows ?? 0
  );
}

/**
 * Take one use out of the grant. The read and the write are separated by a
 * guard on the value that was read, so two requests cannot both take the last
 * bonus use: the loser's UPDATE matches no row and it retries against the new
 * total. Returns the grant id on success, null when there is nothing left.
 */
async function claimGrantUse(
  db: Database,
  grantId: number,
  attempts = 3
): Promise<number | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const [row] = await db
      .select({
        usedSinceGrant: affiliateDesignGrants.usedSinceGrant,
        designCount: affiliateDesignGrants.designCount,
      })
      .from(affiliateDesignGrants)
      .where(eq(affiliateDesignGrants.id, grantId))
      .limit(1);
    if (!row) return null;
    if (row.usedSinceGrant >= row.designCount) return null;
    const result = await db
      .update(affiliateDesignGrants)
      .set({ usedSinceGrant: row.usedSinceGrant + 1 })
      .where(
        and(
          eq(affiliateDesignGrants.id, grantId),
          eq(affiliateDesignGrants.usedSinceGrant, row.usedSinceGrant)
        )
      );
    if (affectedRows(result) > 0) return grantId;
  }
  return null;
}

/** Give a grant use back, guarded the same way so it cannot go below zero. */
async function releaseGrantUse(
  db: Database,
  grantId: number,
  attempts = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const [row] = await db
      .select({ usedSinceGrant: affiliateDesignGrants.usedSinceGrant })
      .from(affiliateDesignGrants)
      .where(eq(affiliateDesignGrants.id, grantId))
      .limit(1);
    if (!row || row.usedSinceGrant <= 0) return false;
    const result = await db
      .update(affiliateDesignGrants)
      .set({ usedSinceGrant: row.usedSinceGrant - 1 })
      .where(
        and(
          eq(affiliateDesignGrants.id, grantId),
          eq(affiliateDesignGrants.usedSinceGrant, row.usedSinceGrant)
        )
      );
    if (affectedRows(result) > 0) return true;
  }
  return false;
}

/**
 * Spend one use: the free five first, then the admin grant, then refuse.
 *
 * The decision is re-made from fresh rows on every attempt, so a request that
 * loses a race for the last free use simply falls through to the grant instead
 * of being refused. Only when both buckets are genuinely empty is
 * MEMBERSHIP_REQUIRED thrown.
 */
export async function claimFreeUsage(
  db: Database,
  gate: FreeUsageGate,
  kind: FreeUsageKind,
  input: { refId?: number | null; userId?: number | null } = {},
  attempt = 0
): Promise<FreeUsageClaim> {
  if (!gate.enforced || gate.affiliateId == null) {
    return {
      ledgerId: null,
      grantId: null,
      bucket: null,
      kind,
      affiliateId: null,
      snapshot: gate.snapshot,
    };
  }
  const limit = gate.snapshot.limit ?? FREE_USAGE_LIMIT;
  const viewerEmail = gate.viewerEmail;
  const state = await loadUsageState(db, gate.affiliateId);
  const snapshot = snapshotFor(state, {
    enforced: true,
    membershipStatus: gate.membershipStatus,
    limit,
    viewerEmail,
  });
  const freeUsed = snapshot.used;

  if (freeUsed < limit) {
    const inserted = await db.insert(affiliateFreeUsage).values({
      affiliateId: gate.affiliateId,
      kind,
      refId: input.refId ?? null,
      userId: input.userId ?? null,
    });
    const ledgerId =
      Number(
        (inserted as unknown as [{ insertId?: number }])[0]?.insertId ?? 0
      ) || null;
    const claim: FreeUsageClaim = {
      ledgerId,
      grantId: null,
      bucket: "free",
      kind,
      affiliateId: gate.affiliateId,
      snapshot,
    };
    let after: FreeUsageSnapshot;
    try {
      after = snapshotFor(await loadUsageState(db, gate.affiliateId), {
        enforced: true,
        membershipStatus: gate.membershipStatus,
        limit,
        viewerEmail,
      });
    } catch (error) {
      // The row was written but the total could not be read, so nothing can be
      // proven about the cap. Take the row back out and let the caller fail.
      await releaseFreeUsage(db, claim).catch(() => undefined);
      throw error;
    }
    if (after.used <= limit) return { ...claim, snapshot: after };
    // A concurrent request took the last free slot. Undo this row and decide
    // again, which will now fall through to the grant.
    await releaseFreeUsage(db, claim).catch(() => undefined);
    if (attempt >= 2) throw membershipError(kind);
    return claimFreeUsage(db, gate, kind, input, attempt + 1);
  }

  // The free five are gone. The grant is spendable only by the emails on it,
  // which the snapshot already resolved against this person's sign-in email.
  const grant = state.grant;
  if (grant != null && snapshot.grant?.appliesToYou === true) {
    const grantId = await claimGrantUse(db, grant.id);
    if (grantId != null) {
      const after = snapshotFor(await loadUsageState(db, gate.affiliateId), {
        enforced: true,
        membershipStatus: gate.membershipStatus,
        limit,
        viewerEmail,
      });
      return {
        ledgerId: null,
        grantId,
        bucket: "grant",
        kind,
        affiliateId: gate.affiliateId,
        snapshot: after,
      };
    }
  }
  throw membershipError(kind);
}

/** Hand a claimed use back because the work it paid for did not happen. */
export async function releaseFreeUsage(
  db: Database,
  claim: FreeUsageClaim
): Promise<void> {
  if (claim.bucket === "grant") {
    if (claim.grantId != null) await releaseGrantUse(db, claim.grantId);
    return;
  }
  if (claim.ledgerId == null || claim.affiliateId == null) return;
  await db
    .delete(affiliateFreeUsage)
    .where(
      and(
        eq(affiliateFreeUsage.id, claim.ledgerId),
        eq(affiliateFreeUsage.affiliateId, claim.affiliateId)
      )
    );
}

/**
 * Hand a use back when the caller only kept the ledger id from an earlier
 * response. The row must still be the caller's own and of the expected kind, so
 * a guessed id cannot delete another store's use.
 */
export async function releaseUsageById(
  db: Database,
  input: { ledgerId: number; userId: number; kind?: FreeUsageKind }
): Promise<void> {
  await db
    .delete(affiliateFreeUsage)
    .where(
      and(
        eq(affiliateFreeUsage.id, input.ledgerId),
        eq(affiliateFreeUsage.userId, input.userId),
        ...(input.kind ? [eq(affiliateFreeUsage.kind, input.kind)] : [])
      )
    );
}

/** Remember what a claimed free use actually created, once the row exists. */
export async function attachFreeUsageRef(
  db: Database,
  claim: FreeUsageClaim,
  refId: number | null | undefined
): Promise<void> {
  if (claim.ledgerId == null || refId == null) return;
  await db
    .update(affiliateFreeUsage)
    .set({ refId })
    .where(eq(affiliateFreeUsage.id, claim.ledgerId));
}

/** Snapshot for the usage endpoint, including the line the UI shows by the tools. */
export function usagePayload(gate: FreeUsageGate) {
  return {
    ...gate.snapshot,
    notice: freeUsageNotice(gate.snapshot),
    // "Extra designs: 5 (3 left)" — null when this store has no grant.
    grantLine: grantLine(gate.snapshot.grant),
  };
}

// ─── Admin side of the grant ─────────────────────────────────────────────────

/** The emails a grant is issued for: the affiliate's own contact emails. */
export async function affiliateContactEmails(
  db: Database,
  affiliateId: number
): Promise<string[]> {
  const [row] = await db
    .select({ email: affiliates.email, publicEmail: affiliates.publicEmail })
    .from(affiliates)
    .where(eq(affiliates.id, affiliateId))
    .limit(1);
  if (!row) return [];
  // The owner's sign-in email first: that is the account that resolves to this
  // store. publicEmail is the storefront contact and is listed when set.
  return normalizeContactEmails([row.email ?? "", row.publicEmail ?? ""]);
}

export type GrantView = {
  affiliateId: number;
  storeName: string | null;
  membershipStatus: string | null;
  grant: DesignGrantSummary | null;
  grantLine: string | null;
  /** True when the store has no grant row yet. */
  hasGrant: boolean;
};

/** One store's grant as the admin sees it. */
export async function loadGrantView(
  db: Database,
  affiliateId: number,
  viewerEmail: string | null = null
): Promise<GrantView> {
  const [affiliate] = await db
    .select({
      storeName: affiliates.storeName,
      membershipStatus: affiliates.membershipStatus,
    })
    .from(affiliates)
    .where(eq(affiliates.id, affiliateId))
    .limit(1);
  const row = await loadDesignGrant(db, affiliateId);
  const grant = normalizeDesignGrant(row, viewerEmail);
  return {
    affiliateId,
    storeName: affiliate?.storeName ?? null,
    membershipStatus: affiliate?.membershipStatus ?? null,
    grant,
    grantLine: grantLine(grant),
    hasGrant: row != null,
  };
}

export type GrantWriteInput = {
  affiliateId: number;
  /** The allowance to store on the grant. */
  designCount: number;
  /** Override the emails; omitted means the affiliate's own contact emails. */
  contactEmails?: string[] | null;
  /** Label for who made the change, e.g. the admin's email. */
  actor: string | null;
};

/**
 * Issue a grant, or renew the store's existing one. Renewing resets the spent
 * counter to zero and can change the count — that is what "top it back up"
 * means. One row per store, so this never stacks two grants.
 */
export async function writeDesignGrant(
  db: Database,
  input: GrantWriteInput
): Promise<GrantView> {
  const designCount = Math.max(
    0,
    Math.min(10_000, Math.floor(input.designCount))
  );
  const emails =
    input.contactEmails == null
      ? await affiliateContactEmails(db, input.affiliateId)
      : normalizeContactEmails(input.contactEmails);
  const contactEmails = emails.length > 0 ? formatContactEmails(emails) : null;
  const existing = await loadDesignGrant(db, input.affiliateId);
  const now = new Date();

  if (!existing) {
    await db.insert(affiliateDesignGrants).values({
      affiliateId: input.affiliateId,
      designCount,
      usedSinceGrant: 0,
      contactEmails,
      grantedBy: input.actor,
      grantedAt: now,
      renewedAt: null,
      renewedBy: null,
    });
  } else {
    await db
      .update(affiliateDesignGrants)
      .set({
        designCount,
        // A renewal puts the store back to a full allowance.
        usedSinceGrant: 0,
        ...(input.contactEmails == null ? {} : { contactEmails }),
        grantedBy: existing.grantedBy ?? input.actor,
        renewedAt: now,
        renewedBy: input.actor,
      })
      .where(eq(affiliateDesignGrants.id, existing.id));
  }
  return loadGrantView(db, input.affiliateId);
}

/** Renew to the count already stored, or to a new one when given. */
export async function renewDesignGrant(
  db: Database,
  input: {
    affiliateId: number;
    designCount?: number | null;
    contactEmails?: string[] | null;
    actor: string | null;
  }
): Promise<GrantView> {
  const existing = await loadDesignGrant(db, input.affiliateId);
  const designCount =
    input.designCount ?? existing?.designCount ?? FREE_USAGE_LIMIT;
  return writeDesignGrant(db, {
    affiliateId: input.affiliateId,
    designCount,
    contactEmails: input.contactEmails,
    actor: input.actor,
  });
}

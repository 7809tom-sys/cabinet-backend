/**
 * Server-side enforcement of the affiliate free-use cap.
 *
 * An affiliate whose membership is not active gets FREE_USAGE_LIMIT uses in
 * total, counted together across saved designs, Auto Design runs, and photo
 * renders. Every entry point:
 *
 *   1. `loadFreeUsageGate`   — is this person capped, and how much is left;
 *   2. `assertFreeUsageAvailable` — refuse before any work is done;
 *   3. `claimFreeUsage`      — write the ledger row (this is the real guard);
 *   4. `releaseFreeUsage`    — give the use back if the work then failed.
 *
 * Claiming first and releasing on failure means the ledger only keeps uses that
 * really produced something, and two simultaneous attempts cannot both spend
 * the last free use: the second one counts the first one's row and is refused.
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
import { affiliates, affiliateFreeUsage } from "../../drizzle/schema";
import {
  FREE_USAGE_LIMIT,
  MEMBERSHIP_REQUIRED_CAUSE,
  freeUsageApplies,
  freeUsageExhausted,
  freeUsageNotice,
  freeUsageSnapshot,
  membershipRequiredMessage,
  type FreeUsageKind,
  type FreeUsageSnapshot,
} from "../../shared/affiliateFreeUsage";
import { resolveAffiliateAccess } from "./affiliateAccess";
import { isMissingSchemaError } from "./orderSchemaGuard";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export type FreeUsageGate = {
  /** True when this person's uses must be counted. */
  enforced: boolean;
  /** The affiliate whose ledger is used. Null when not enforced. */
  affiliateId: number | null;
  membershipStatus: string | null;
  snapshot: FreeUsageSnapshot;
};

/** A claimed use, so the caller can hand it back if the work fails. */
export type FreeUsageClaim = {
  ledgerId: number | null;
  kind: FreeUsageKind;
  affiliateId: number | null;
  /** The balance after this use. */
  snapshot: FreeUsageSnapshot;
};

type GateUser = { id: number; email: string | null; role: string };

function uncappedGate(
  affiliateId: number | null,
  membershipStatus: string | null,
  limit: number
): FreeUsageGate {
  return {
    enforced: false,
    affiliateId,
    membershipStatus,
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
 * Resolve whether this person is capped and what they have used. The ledger is
 * only read when the cap applies, so a paid affiliate and a customer pay nothing
 * for this check.
 */
export async function loadFreeUsageGate(
  db: Database,
  user: GateUser,
  options: { limit?: number } = {}
): Promise<FreeUsageGate> {
  const limit = options.limit ?? FREE_USAGE_LIMIT;
  if (user.role === "admin") return uncappedGate(null, null, limit);
  const access = await resolveAffiliateAccess(db, user);
  if (!access) return uncappedGate(null, null, limit);
  const membershipStatus = await readMembershipStatus(db, access.affiliateId);
  if (
    !freeUsageApplies({ role: user.role, hasAffiliate: true, membershipStatus })
  ) {
    return uncappedGate(access.affiliateId, membershipStatus, limit);
  }
  let counts: Partial<Record<string, number>>;
  try {
    counts = await loadUsageCounts(db, access.affiliateId);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    // The ledger is added by the SQL Tom runs by hand. Until it exists the cap
    // cannot be counted, so the Designer keeps working instead of failing for
    // every unpaid affiliate. Logged so the missing SQL is visible.
    console.warn(
      "[Affiliate usage] affiliate_free_usage is missing; run the free-usage SQL. The cap is not enforced until then."
    );
    return uncappedGate(access.affiliateId, membershipStatus, limit);
  }
  return {
    enforced: true,
    affiliateId: access.affiliateId,
    membershipStatus,
    snapshot: freeUsageSnapshot(counts, {
      enforced: true,
      membershipStatus,
      limit,
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

/** Throws the membership error when the next use would exceed the cap. */
export function assertFreeUsageAvailable(
  gate: FreeUsageGate,
  kind: FreeUsageKind
): void {
  if (freeUsageExhausted(gate.snapshot)) throw membershipError(kind);
}

/**
 * Spend one free use. Writes the ledger row and counts the total afterwards, so
 * the row is what actually enforces the cap. A row that pushes the store one
 * past the limit is removed again and the use is refused — at the boundary a
 * racing pair of requests can therefore be refused rather than both allowed.
 */
export async function claimFreeUsage(
  db: Database,
  gate: FreeUsageGate,
  kind: FreeUsageKind,
  input: { refId?: number | null; userId?: number | null } = {}
): Promise<FreeUsageClaim> {
  if (!gate.enforced || gate.affiliateId == null) {
    return { ledgerId: null, kind, affiliateId: null, snapshot: gate.snapshot };
  }
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
  const limit = gate.snapshot.limit ?? FREE_USAGE_LIMIT;
  const claim: FreeUsageClaim = {
    ledgerId,
    kind,
    affiliateId: gate.affiliateId,
    snapshot: gate.snapshot,
  };
  let snapshot: FreeUsageSnapshot;
  try {
    snapshot = freeUsageSnapshot(await loadUsageCounts(db, gate.affiliateId), {
      enforced: true,
      membershipStatus: gate.membershipStatus,
      limit,
    });
  } catch (error) {
    // The row was written but the total could not be read, so nothing can be
    // proven about the cap. Take the row back out and let the caller fail.
    await releaseFreeUsage(db, claim).catch(() => undefined);
    throw error;
  }
  claim.snapshot = snapshot;
  // `remaining` is clamped at zero, so the over-limit test is on the raw total.
  if (limit != null && snapshot.used > limit) {
    await releaseFreeUsage(db, claim);
    throw membershipError(kind);
  }
  return claim;
}

/** Hand a claimed use back because the work it paid for did not happen. */
export async function releaseFreeUsage(
  db: Database,
  claim: FreeUsageClaim
): Promise<void> {
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

/** Remember what a claimed use actually created, once the row exists. */
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
  return { ...gate.snapshot, notice: freeUsageNotice(gate.snapshot) };
}

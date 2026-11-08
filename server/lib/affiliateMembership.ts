/**
 * Affiliate membership read model with two plans (annual $1,195, monthly $169
 * with a three-month minimum).
 *
 * The plan columns are added by hand with
 * docs/sql/0269_membership_plan_options.tidb.sql. If the application ships
 * before that file is run, the new columns do not exist yet. Reads here fall
 * back to the legacy columns (annual plan, no commitment) instead of throwing,
 * so an affiliate can still see and pay their membership during that window.
 */

import { eq } from "drizzle-orm";
import { affiliates } from "../../drizzle/schema";
import type { getDb } from "../db";
import {
  ANNUAL_MEMBERSHIP_FEE_CENTS,
  assessMembershipCancellation,
  formatPlanPrice,
  membershipPlanOption,
  normalizeMembershipPlan,
  type MembershipPlan,
} from "@shared/affiliateMembershipPlans";

export type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface MembershipSnapshot {
  affiliateId: number;
  storeName: string;
  plan: MembershipPlan;
  /** Price of the current plan, in cents. */
  feeCents: number;
  status: string;
  paidAt: Date | null;
  expiresAt: Date | null;
  /** Date the member may cancel without penalty. Null for legacy annual rows. */
  committedUntil: Date | null;
  cancelledAt: Date | null;
  stripeSubscriptionId: string | null;
  /** False while the hand-run SQL has not been applied. */
  planColumnsAvailable: boolean;
}

const legacyColumns = {
  id: affiliates.id,
  storeName: affiliates.storeName,
  membershipStatus: affiliates.membershipStatus,
  membershipFeeCents: affiliates.membershipFeeCents,
  membershipPaidAt: affiliates.membershipPaidAt,
  membershipExpiresAt: affiliates.membershipExpiresAt,
};

const planColumns = {
  ...legacyColumns,
  membershipPlan: affiliates.membershipPlan,
  membershipCommittedUntil: affiliates.membershipCommittedUntil,
  membershipCancelledAt: affiliates.membershipCancelledAt,
  membershipStripeSubscriptionId: affiliates.membershipStripeSubscriptionId,
};

/** True for "Unknown column 'membershipPlan' in 'field list'" style errors. */
export function isMissingMembershipColumnError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current != null) {
    if (typeof current === "string") {
      return /unknown column|ER_BAD_FIELD_ERROR|no such column/i.test(current);
    }
    if (typeof current !== "object" || seen.has(current)) return false;
    seen.add(current);
    const row = current as { code?: unknown; errno?: unknown; message?: unknown; sqlMessage?: unknown; cause?: unknown };
    const errno = typeof row.errno === "number" ? row.errno : Number(row.errno);
    const codeMatches = row.code === "ER_BAD_FIELD_ERROR" || errno === 1054;
    const text = [row.message, row.sqlMessage]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    if ((codeMatches || /unknown column|no such column/i.test(text)) && /membership/i.test(text)) return true;
    current = row.cause;
  }
  return false;
}

export async function loadMembershipSnapshot(
  db: Database,
  affiliateId: number,
): Promise<MembershipSnapshot | null> {
  try {
    const [row] = await db.select(planColumns).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    if (!row) return null;
    const plan = normalizeMembershipPlan(row.membershipPlan);
    return {
      affiliateId: row.id,
      storeName: row.storeName,
      plan,
      feeCents: row.membershipFeeCents ?? membershipPlanOption(plan).amountCents,
      status: row.membershipStatus,
      paidAt: row.membershipPaidAt ?? null,
      expiresAt: row.membershipExpiresAt ?? null,
      committedUntil: row.membershipCommittedUntil ?? null,
      cancelledAt: row.membershipCancelledAt ?? null,
      stripeSubscriptionId: row.membershipStripeSubscriptionId ?? null,
      planColumnsAvailable: true,
    };
  } catch (error) {
    if (!isMissingMembershipColumnError(error)) throw error;
    const [row] = await db.select(legacyColumns).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    if (!row) return null;
    return {
      affiliateId: row.id,
      storeName: row.storeName,
      plan: "annual",
      feeCents: row.membershipFeeCents ?? ANNUAL_MEMBERSHIP_FEE_CENTS,
      status: row.membershipStatus,
      paidAt: row.membershipPaidAt ?? null,
      expiresAt: row.membershipExpiresAt ?? null,
      committedUntil: null,
      cancelledAt: null,
      stripeSubscriptionId: null,
      planColumnsAvailable: false,
    };
  }
}

/**
 * Status as a member should read it. A cancelled membership keeps its access
 * until the paid period ends, so it only reads "cancelled" once that date has
 * passed. An active membership whose date has passed reads "past_due", which is
 * the state an admin or a retried payment can clear.
 */
export function effectiveMembershipStatus(
  snapshot: Pick<MembershipSnapshot, "status" | "expiresAt" | "cancelledAt">,
  nowMs: number,
): "pending" | "active" | "past_due" | "cancelled" {
  const expired = snapshot.expiresAt != null && snapshot.expiresAt.getTime() <= nowMs;
  if (snapshot.cancelledAt != null && expired) return "cancelled";
  if (snapshot.cancelledAt != null) return "active"; // paid through the end of the period
  if (expired && snapshot.status === "active") return "past_due";
  if (snapshot.status === "cancelled") return "cancelled";
  if (snapshot.status === "past_due") return "past_due";
  if (snapshot.status === "active") return "active";
  return "pending";
}

export interface MembershipView {
  affiliateId: number;
  storeName: string;
  plan: MembershipPlan;
  planLabel: string;
  planPriceLabel: string;
  membershipFeeCents: number;
  membershipStatus: string;
  storedMembershipStatus: string;
  membershipPaidAt: Date | null;
  membershipExpiresAt: Date | null;
  membershipCommittedUntil: Date | null;
  membershipCancelledAt: Date | null;
  hasStripeSubscription: boolean;
  canCancel: boolean;
  cancelBlockedReason: "monthly_minimum_commitment" | null;
  cancelEarliestAt: Date | null;
  /** Access ends here if the member cancels today. */
  cancelEndsAccessAt: Date | null;
  /** True once the hand-run SQL has been applied. */
  planSwitchAvailable: boolean;
}

export function toMembershipView(snapshot: MembershipSnapshot, nowMs: number = Date.now()): MembershipView {
  const option = membershipPlanOption(snapshot.plan);
  const decision = assessMembershipCancellation({
    plan: snapshot.plan,
    nowMs,
    periodEndMs: snapshot.expiresAt?.getTime() ?? null,
    commitmentEndsAtMs: snapshot.committedUntil?.getTime() ?? null,
  });
  return {
    affiliateId: snapshot.affiliateId,
    storeName: snapshot.storeName,
    plan: snapshot.plan,
    planLabel: option.label,
    planPriceLabel: formatPlanPrice(snapshot.plan),
    membershipFeeCents: snapshot.feeCents,
    membershipStatus: effectiveMembershipStatus(snapshot, nowMs),
    storedMembershipStatus: snapshot.status,
    membershipPaidAt: snapshot.paidAt,
    membershipExpiresAt: snapshot.expiresAt,
    membershipCommittedUntil: snapshot.committedUntil,
    membershipCancelledAt: snapshot.cancelledAt,
    hasStripeSubscription: Boolean(snapshot.stripeSubscriptionId),
    canCancel: decision.allowed && snapshot.cancelledAt == null,
    cancelBlockedReason: decision.blockedReason,
    cancelEarliestAt: decision.blockedReason ? snapshot.committedUntil : null,
    cancelEndsAccessAt: decision.accessUntilMs != null ? new Date(decision.accessUntilMs) : null,
    planSwitchAvailable: snapshot.planColumnsAvailable,
  };
}

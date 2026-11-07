// Pure, framework-free rules for the two affiliate membership plans.
// Kept in `shared` so the server procedures, the Stripe checkout builder, and
// the unit tests all use one definition of "which plan", "when does this period
// end", and "may this member cancel yet". No database, no Stripe, no clock.

import { computeMembershipPeriodEnd } from "./salesPrograms";

export const MEMBERSHIP_PLAN_IDS = ["annual", "monthly"] as const;
export type MembershipPlan = (typeof MEMBERSHIP_PLAN_IDS)[number];

export const ANNUAL_MEMBERSHIP_FEE_CENTS = 119500; // $1,195.00
export const MONTHLY_MEMBERSHIP_FEE_CENTS = 16900; // $169.00
export const ANNUAL_TERM_MONTHS = 12;
export const MONTHLY_MINIMUM_MONTHS = 3;

export interface MembershipPlanOption {
  id: MembershipPlan;
  /** Short label for pickers and receipts. */
  label: string;
  /** Amount charged on each billing date. */
  amountCents: number;
  /** Stripe recurring interval. Annual is billed once, so it has no interval. */
  recurringInterval: "month" | null;
  /** Billing periods in one paid term. */
  periodsPerTerm: number;
  /** Months the member is committed to before they may cancel. */
  minimumMonths: number;
  /** Smallest amount a member can be on the hook for when they sign up. */
  minimumCommitmentCents: number;
  /** One line the pricing page can show under the price. */
  description: string;
}

export const MEMBERSHIP_PLAN_OPTIONS: Record<MembershipPlan, MembershipPlanOption> = {
  annual: {
    id: "annual",
    label: "Annual",
    amountCents: ANNUAL_MEMBERSHIP_FEE_CENTS,
    recurringInterval: null,
    periodsPerTerm: 1,
    minimumMonths: ANNUAL_TERM_MONTHS,
    minimumCommitmentCents: ANNUAL_MEMBERSHIP_FEE_CENTS,
    description: "Pay once a year. Renews when the year ends, and you can stop before the next year starts.",
  },
  monthly: {
    id: "monthly",
    label: "Monthly",
    amountCents: MONTHLY_MEMBERSHIP_FEE_CENTS,
    recurringInterval: "month",
    periodsPerTerm: 1,
    minimumMonths: MONTHLY_MINIMUM_MONTHS,
    minimumCommitmentCents: MONTHLY_MEMBERSHIP_FEE_CENTS * MONTHLY_MINIMUM_MONTHS,
    description: "Pay month to month with a three-month minimum, then cancel any time.",
  },
};

export function isMembershipPlan(value: unknown): value is MembershipPlan {
  return typeof value === "string" && (MEMBERSHIP_PLAN_IDS as readonly string[]).includes(value);
}

/** Unknown or missing values are treated as the original annual plan. */
export function normalizeMembershipPlan(value: unknown): MembershipPlan {
  return isMembershipPlan(value) ? value : "annual";
}

export function membershipPlanOption(plan: unknown): MembershipPlanOption {
  return MEMBERSHIP_PLAN_OPTIONS[normalizeMembershipPlan(plan)];
}

/** "$169" or "$1,195". Amounts are whole dollars on both plans. */
export function formatPlanAmount(amountCents: number): string {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return "$0";
  const dollars = Math.round(amountCents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

/** "$169/month" or "$1,195/year". */
export function formatPlanPrice(plan: unknown): string {
  const option = membershipPlanOption(plan);
  const period = option.id === "annual" ? "year" : "month";
  return `${formatPlanAmount(option.amountCents)}/${period}`;
}

/**
 * Add whole calendar months in UTC, clamping the day of month so that
 * Jan 31 + 1 month is Feb 28/29 rather than spilling into March.
 */
export function addMonthsUtc(fromMs: number, months: number): number {
  const from = new Date(fromMs);
  const monthIndex = from.getUTCMonth() + months;
  const year = from.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(from.getUTCDate(), daysInTargetMonth),
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds(),
  );
}

export interface MembershipTerm {
  /** First moment the paid period covers. */
  periodStartMs: number;
  /** Moment the paid period ends (access ends here). */
  periodEndMs: number;
  /** Moment the member becomes free to cancel. Never earlier than periodEndMs. */
  commitmentEndsAtMs: number;
}

export interface MembershipTermInput {
  plan: MembershipPlan;
  /** When the payment landed. */
  paidAtMs: number;
  /** Existing expiry, if the member still has paid time left (renewals stack). */
  currentPeriodEndMs?: number | null;
  /** Existing commitment end, so a renewal never shortens it. */
  currentCommitmentEndMs?: number | null;
}

/**
 * Work out the term a payment buys.
 *
 * Annual: one 365-day year, stacked on any remaining time (the same rule the
 * single-plan code already used). The year that was paid for is also the
 * commitment, so a member can always decline the next year.
 *
 * Monthly: one calendar month, stacked on any remaining time. The three-month
 * commitment is measured from the first monthly payment that starts a term, and
 * a later month-to-month payment keeps that original date. Paying after a lapse
 * starts a new membership, so it also starts a fresh three-month commitment.
 */
export function computeMembershipTerm(input: MembershipTermInput): MembershipTerm {
  const plan = normalizeMembershipPlan(input.plan);
  const { paidAtMs } = input;
  const periodStartMs =
    input.currentPeriodEndMs && input.currentPeriodEndMs > paidAtMs ? input.currentPeriodEndMs : paidAtMs;
  const carriedCommitmentMs =
    input.currentCommitmentEndMs && input.currentCommitmentEndMs > paidAtMs
      ? input.currentCommitmentEndMs
      : null;

  if (plan === "annual") {
    const periodEndMs = computeMembershipPeriodEnd(paidAtMs, input.currentPeriodEndMs ?? null);
    return {
      periodStartMs,
      periodEndMs,
      commitmentEndsAtMs: Math.max(periodEndMs, carriedCommitmentMs ?? 0),
    };
  }

  const periodEndMs = addMonthsUtc(periodStartMs, 1);
  const commitmentEndsAtMs = carriedCommitmentMs ?? addMonthsUtc(periodStartMs, MONTHLY_MINIMUM_MONTHS);
  return { periodStartMs, periodEndMs, commitmentEndsAtMs };
}

export interface CancellationDecision {
  allowed: boolean;
  /** Why a cancellation is refused. Null when it is allowed. */
  blockedReason: "monthly_minimum_commitment" | null;
  /** Access ends here after a cancellation (the end of the paid period). */
  accessUntilMs: number | null;
  /** The date the member may cancel again, when a cancellation is refused. */
  minimumCommitmentEndsAtMs: number | null;
}

export interface CancellationAssessmentInput {
  plan: MembershipPlan | null | undefined;
  nowMs: number;
  /** Paid-through date. */
  periodEndMs?: number | null;
  commitmentEndsAtMs?: number | null;
}

/**
 * Decide whether a member may cancel.
 *
 * Monthly members are locked in until the three-month minimum ends; the refusal
 * carries the date so the UI can say when the button unlocks. Annual members
 * may cancel at any time, but the cancellation only takes effect when the paid
 * year runs out — the year is already paid and is not refunded.
 */
export function assessMembershipCancellation(input: CancellationAssessmentInput): CancellationDecision {
  const plan = normalizeMembershipPlan(input.plan);
  const periodEndMs = input.periodEndMs ?? null;

  if (plan === "monthly") {
    const minimumCommitmentEndsAtMs = input.commitmentEndsAtMs ?? null;
    if (minimumCommitmentEndsAtMs != null && input.nowMs < minimumCommitmentEndsAtMs) {
      return {
        allowed: false,
        blockedReason: "monthly_minimum_commitment",
        accessUntilMs: minimumCommitmentEndsAtMs,
        minimumCommitmentEndsAtMs,
      };
    }
    return {
      allowed: true,
      blockedReason: null,
      accessUntilMs: periodEndMs != null && periodEndMs > input.nowMs ? periodEndMs : input.nowMs,
      minimumCommitmentEndsAtMs,
    };
  }

  return {
    allowed: true,
    blockedReason: null,
    accessUntilMs: periodEndMs != null && periodEndMs > input.nowMs ? periodEndMs : input.nowMs,
    minimumCommitmentEndsAtMs: null,
  };
}

/** Convenience wrapper for callers that only need a yes/no. */
export function canCancelMembership(input: CancellationAssessmentInput): boolean {
  return assessMembershipCancellation(input).allowed;
}

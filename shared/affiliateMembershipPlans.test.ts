import { describe, it, expect } from "vitest";
import {
  ANNUAL_MEMBERSHIP_FEE_CENTS,
  MONTHLY_MEMBERSHIP_FEE_CENTS,
  MONTHLY_MINIMUM_MONTHS,
  MEMBERSHIP_PLAN_OPTIONS,
  MEMBERSHIP_PLAN_IDS,
  addMonthsUtc,
  assessMembershipCancellation,
  canCancelMembership,
  computeMembershipTerm,
  formatPlanPrice,
  isMembershipPlan,
  membershipPlanOption,
  normalizeMembershipPlan,
} from "./affiliateMembershipPlans";
import { MS_PER_DAY } from "./salesPrograms";
import { AFFILIATE_MEMBERSHIP } from "./affiliate";

// A fixed UTC anchor so the tests never depend on when they run.
const JAN_15 = Date.UTC(2026, 0, 15, 12, 0, 0);

describe("membership plan options", () => {
  it("keeps the existing annual price and adds $169 a month", () => {
    expect(ANNUAL_MEMBERSHIP_FEE_CENTS).toBe(119500);
    expect(MONTHLY_MEMBERSHIP_FEE_CENTS).toBe(16900);
    expect(MEMBERSHIP_PLAN_OPTIONS.annual.amountCents).toBe(119500);
    expect(MEMBERSHIP_PLAN_OPTIONS.monthly.amountCents).toBe(16900);
  });

  it("matches the prices the marketing copy publishes", () => {
    // shared/affiliate.ts still drives the landing page copy. If a price changes
    // here, the copy has to change with it.
    expect(AFFILIATE_MEMBERSHIP.priceUsd * 100).toBe(ANNUAL_MEMBERSHIP_FEE_CENTS);
    expect([...AFFILIATE_MEMBERSHIP.planIds].sort()).toEqual([...MEMBERSHIP_PLAN_IDS].sort());
  });

  it("states the three-month minimum in money and in months", () => {
    expect(MEMBERSHIP_PLAN_OPTIONS.monthly.minimumMonths).toBe(3);
    expect(MEMBERSHIP_PLAN_OPTIONS.monthly.minimumCommitmentCents).toBe(16900 * 3);
    expect(MEMBERSHIP_PLAN_OPTIONS.annual.minimumCommitmentCents).toBe(119500);
  });

  it("recognizes only the two plan ids", () => {
    expect(isMembershipPlan("annual")).toBe(true);
    expect(isMembershipPlan("monthly")).toBe(true);
    expect(isMembershipPlan("weekly")).toBe(false);
    expect(isMembershipPlan(undefined)).toBe(false);
  });

  it("treats a missing plan as annual, so old rows keep their meaning", () => {
    expect(normalizeMembershipPlan(null)).toBe("annual");
    expect(normalizeMembershipPlan(undefined)).toBe("annual");
    expect(normalizeMembershipPlan("")).toBe("annual");
    expect(normalizeMembershipPlan("garbage")).toBe("annual");
    expect(normalizeMembershipPlan("monthly")).toBe("monthly");
    expect(membershipPlanOption("nonsense").id).toBe("annual");
  });

  it("formats both prices for display", () => {
    expect(formatPlanPrice("annual")).toBe("$1,195/year");
    expect(formatPlanPrice("monthly")).toBe("$169/month");
    expect(formatPlanPrice(undefined)).toBe("$1,195/year");
  });
});

describe("addMonthsUtc", () => {
  it("clamps the day of month instead of spilling into the next month", () => {
    const jan31 = Date.UTC(2026, 0, 31, 15, 30);
    expect(addMonthsUtc(jan31, 1)).toBe(Date.UTC(2026, 1, 28, 15, 30));
  });

  it("lands on Feb 29 in a leap year", () => {
    const jan31 = Date.UTC(2028, 0, 31);
    expect(addMonthsUtc(jan31, 1)).toBe(Date.UTC(2028, 1, 29));
  });

  it("crosses the year boundary", () => {
    expect(addMonthsUtc(Date.UTC(2026, 10, 15), 3)).toBe(Date.UTC(2027, 1, 15));
  });

  it("keeps the time of day", () => {
    expect(addMonthsUtc(Date.UTC(2026, 5, 10, 8, 15, 42), 1)).toBe(Date.UTC(2026, 6, 10, 8, 15, 42));
  });
});

describe("computeMembershipTerm — annual", () => {
  it("buys 365 days from the payment date, same as before", () => {
    const term = computeMembershipTerm({ plan: "annual", paidAtMs: JAN_15, currentPeriodEndMs: null });
    expect(term.periodStartMs).toBe(JAN_15);
    expect(term.periodEndMs).toBe(JAN_15 + 365 * MS_PER_DAY);
    expect(term.commitmentEndsAtMs).toBe(term.periodEndMs);
  });

  it("stacks a renewal on remaining time and pushes the commitment too", () => {
    const remainingEnd = JAN_15 + 100 * MS_PER_DAY;
    const term = computeMembershipTerm({ plan: "annual", paidAtMs: JAN_15, currentPeriodEndMs: remainingEnd });
    expect(term.periodStartMs).toBe(remainingEnd);
    expect(term.periodEndMs).toBe(remainingEnd + 365 * MS_PER_DAY);
    expect(term.commitmentEndsAtMs).toBe(term.periodEndMs);
  });

  it("starts fresh when the previous term lapsed", () => {
    const lapsed = JAN_15 - 30 * MS_PER_DAY;
    const term = computeMembershipTerm({ plan: "annual", paidAtMs: JAN_15, currentPeriodEndMs: lapsed });
    expect(term.periodStartMs).toBe(JAN_15);
    expect(term.periodEndMs).toBe(JAN_15 + 365 * MS_PER_DAY);
  });
});

describe("computeMembershipTerm — monthly", () => {
  it("bills one calendar month at a time", () => {
    const term = computeMembershipTerm({ plan: "monthly", paidAtMs: JAN_15, currentPeriodEndMs: null });
    expect(term.periodStartMs).toBe(JAN_15);
    expect(term.periodEndMs).toBe(Date.UTC(2026, 1, 15, 12, 0, 0));
  });

  it("sets a three-month commitment from the first monthly payment", () => {
    const term = computeMembershipTerm({ plan: "monthly", paidAtMs: JAN_15, currentPeriodEndMs: null });
    expect(term.commitmentEndsAtMs).toBe(Date.UTC(2026, 3, 15, 12, 0, 0));
    expect(term.commitmentEndsAtMs).toBeGreaterThan(term.periodEndMs);
  });

  it("keeps the original commitment when the second month is paid", () => {
    const first = computeMembershipTerm({ plan: "monthly", paidAtMs: JAN_15, currentPeriodEndMs: null });
    const second = computeMembershipTerm({
      plan: "monthly",
      paidAtMs: first.periodEndMs - 2 * MS_PER_DAY,
      currentPeriodEndMs: first.periodEndMs,
      currentCommitmentEndMs: first.commitmentEndsAtMs,
    });
    expect(second.periodStartMs).toBe(first.periodEndMs);
    expect(second.periodEndMs).toBe(Date.UTC(2026, 2, 15, 12, 0, 0));
    expect(second.commitmentEndsAtMs).toBe(first.commitmentEndsAtMs);
  });

  it("never shortens an existing commitment mid-minimum", () => {
    const commitment = Date.UTC(2026, 3, 15, 12, 0, 0);
    const term = computeMembershipTerm({
      plan: "monthly",
      paidAtMs: Date.UTC(2026, 1, 15, 12, 0, 0),
      currentPeriodEndMs: null,
      currentCommitmentEndMs: commitment,
    });
    expect(term.commitmentEndsAtMs).toBe(commitment);
  });

  it("starts a new three-month minimum after a lapse", () => {
    const lapsedCommitment = JAN_15 - 5 * MS_PER_DAY;
    const term = computeMembershipTerm({
      plan: "monthly",
      paidAtMs: JAN_15,
      currentPeriodEndMs: JAN_15 - 10 * MS_PER_DAY,
      currentCommitmentEndMs: lapsedCommitment,
    });
    expect(term.commitmentEndsAtMs).toBe(Date.UTC(2026, 3, 15, 12, 0, 0));
  });

  it("adds up to more per year than the annual plan", () => {
    const monthlyYearCents = MONTHLY_MEMBERSHIP_FEE_CENTS * 12;
    expect(monthlyYearCents).toBe(202800);
    expect(monthlyYearCents).toBeGreaterThan(ANNUAL_MEMBERSHIP_FEE_CENTS);
  });
});

describe("membership cancellation guard", () => {
  const firstMonthlyPayment = computeMembershipTerm({
    plan: "monthly",
    paidAtMs: JAN_15,
    currentPeriodEndMs: null,
  });

  it("refuses a monthly cancel inside the three-month minimum and says when it unlocks", () => {
    const decision = assessMembershipCancellation({
      plan: "monthly",
      nowMs: JAN_15 + 10 * MS_PER_DAY,
      periodEndMs: firstMonthlyPayment.periodEndMs,
      commitmentEndsAtMs: firstMonthlyPayment.commitmentEndsAtMs,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toBe("monthly_minimum_commitment");
    expect(decision.minimumCommitmentEndsAtMs).toBe(firstMonthlyPayment.commitmentEndsAtMs);
    expect(canCancelMembership({
      plan: "monthly",
      nowMs: JAN_15 + 10 * MS_PER_DAY,
      periodEndMs: firstMonthlyPayment.periodEndMs,
      commitmentEndsAtMs: firstMonthlyPayment.commitmentEndsAtMs,
    })).toBe(false);
  });

  it("allows a monthly cancel on the day the minimum ends", () => {
    const decision = assessMembershipCancellation({
      plan: "monthly",
      nowMs: firstMonthlyPayment.commitmentEndsAtMs,
      periodEndMs: firstMonthlyPayment.commitmentEndsAtMs,
      commitmentEndsAtMs: firstMonthlyPayment.commitmentEndsAtMs,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.blockedReason).toBeNull();
  });

  it("allows a monthly cancel after the minimum, and access runs to the paid-through date", () => {
    const paidThrough = Date.UTC(2026, 5, 15, 12, 0, 0);
    const decision = assessMembershipCancellation({
      plan: "monthly",
      nowMs: Date.UTC(2026, 4, 20, 12, 0, 0),
      periodEndMs: paidThrough,
      commitmentEndsAtMs: firstMonthlyPayment.commitmentEndsAtMs,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.accessUntilMs).toBe(paidThrough);
  });

  it("lets an annual member cancel any time, but keeps them through the paid year", () => {
    const annual = computeMembershipTerm({ plan: "annual", paidAtMs: JAN_15, currentPeriodEndMs: null });
    const decision = assessMembershipCancellation({
      plan: "annual",
      nowMs: JAN_15 + 20 * MS_PER_DAY,
      periodEndMs: annual.periodEndMs,
      commitmentEndsAtMs: annual.commitmentEndsAtMs,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.accessUntilMs).toBe(annual.periodEndMs);
  });

  it("a monthly member with no commitment recorded is not trapped", () => {
    expect(canCancelMembership({ plan: "monthly", nowMs: JAN_15, periodEndMs: null, commitmentEndsAtMs: null })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { MS_PER_DAY } from "@shared/salesPrograms";
import {
  addMonthsUtc,
  computeMembershipTerm,
  type MembershipTerm,
} from "@shared/affiliateMembershipPlans";

/**
 * The invoice/expiry behaviour that lives in SQL-shaped code is exercised
 * through the same pure functions here, plus the two small helpers that decide
 * which date an admin mark-paid writes. Anything that needs a real database is
 * covered by the shape tests in affiliateMembership.planMath.test.ts.
 */
describe("what an admin mark-paid writes", () => {
  const firstPay = Date.UTC(2026, 2, 10, 9, 0, 0); // March 10, 2026

  function adminMarkPaid(plan: "annual" | "monthly", existing: Partial<MembershipTerm> | null): MembershipTerm {
    return computeMembershipTerm({
      plan,
      paidAtMs: firstPay,
      currentPeriodEndMs: existing?.periodEndMs ?? null,
      currentCommitmentEndMs: existing?.commitmentEndsAtMs ?? null,
    });
  }

  it("annual: expiry is one year out and the commitment matches the expiry", () => {
    const term = adminMarkPaid("annual", null);
    expect(term.periodEndMs).toBe(firstPay + 365 * MS_PER_DAY);
    expect(term.commitmentEndsAtMs).toBe(term.periodEndMs);
  });

  it("monthly: expiry is one month out and the commitment is three months out", () => {
    const term = adminMarkPaid("monthly", null);
    expect(term.periodEndMs).toBe(Date.UTC(2026, 3, 10, 9, 0, 0));
    expect(term.commitmentEndsAtMs).toBe(Date.UTC(2026, 5, 10, 9, 0, 0));
  });

  it("monthly month 2 and 3 extend the expiry but not the commitment", () => {
    const month1 = adminMarkPaid("monthly", null);
    const month2 = adminMarkPaid("monthly", month1);
    expect(month2.periodEndMs).toBe(Date.UTC(2026, 4, 10, 9, 0, 0));
    expect(month2.commitmentEndsAtMs).toBe(month1.commitmentEndsAtMs);

    const month3 = adminMarkPaid("monthly", month2);
    expect(month3.periodEndMs).toBe(Date.UTC(2026, 5, 10, 9, 0, 0));
    expect(month3.commitmentEndsAtMs).toBe(month1.commitmentEndsAtMs);
    // After three payments the paid-through date has caught up with the
    // commitment, so the cancel button unlocks exactly when month 3 is paid.
    expect(month3.periodEndMs).toBe(month3.commitmentEndsAtMs);
  });

  it("an annual renewal stacks on remaining time instead of restarting", () => {
    const year1 = adminMarkPaid("annual", null);
    const year2 = computeMembershipTerm({
      plan: "annual",
      paidAtMs: year1.periodEndMs - 30 * MS_PER_DAY, // paid 30 days early
      currentPeriodEndMs: year1.periodEndMs,
      currentCommitmentEndMs: year1.commitmentEndsAtMs,
    });
    expect(year2.periodStartMs).toBe(year1.periodEndMs);
    expect(year2.periodEndMs).toBe(year1.periodEndMs + 365 * MS_PER_DAY);
    expect(year2.commitmentEndsAtMs).toBe(year2.periodEndMs);
  });

  it("monthly billing across January 31st does not skip a month", () => {
    const jan31 = Date.UTC(2026, 0, 31, 10, 0, 0);
    const month1 = computeMembershipTerm({ plan: "monthly", paidAtMs: jan31, currentPeriodEndMs: null });
    expect(month1.periodEndMs).toBe(Date.UTC(2026, 1, 28, 10, 0, 0));
    const month2 = computeMembershipTerm({
      plan: "monthly",
      paidAtMs: month1.periodEndMs,
      currentPeriodEndMs: month1.periodEndMs,
      currentCommitmentEndMs: month1.commitmentEndsAtMs,
    });
    // Feb 28 + one month is March 28, not April 3.
    expect(month2.periodEndMs).toBe(Date.UTC(2026, 2, 28, 10, 0, 0));
    expect(month2.commitmentEndsAtMs).toBe(addMonthsUtc(jan31, 3));
    expect(month2.commitmentEndsAtMs).toBe(Date.UTC(2026, 3, 30, 10, 0, 0));
  });
});

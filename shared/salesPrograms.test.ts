import { describe, it, expect } from "vitest";
import {
  SALES_REP_COMMISSION_USD,
  SALES_REP_COMMISSION_CENTS,
  shouldCreateCommission,
  computeMembershipPeriodEnd,
  isMembershipActive,
  MS_PER_DAY,
  MEMBERSHIP_TERM_DAYS,
} from "./salesPrograms";

describe("sales-rep commission", () => {
  it("is a flat $400 / 40000 cents", () => {
    expect(SALES_REP_COMMISSION_USD).toBe(400);
    expect(SALES_REP_COMMISSION_CENTS).toBe(40000);
  });

  it("pays when a sales_rep's deal first becomes won", () => {
    expect(
      shouldCreateCommission({
        ownerRole: "sales_rep",
        nextStage: "won",
        previousStage: "negotiation",
        commissionAlreadyExists: false,
      }),
    ).toBe(true);
  });

  it("does not pay non-sales-rep owners", () => {
    for (const role of ["admin", "designer", "user", null, undefined]) {
      expect(
        shouldCreateCommission({
          ownerRole: role,
          nextStage: "won",
          previousStage: "negotiation",
          commissionAlreadyExists: false,
        }),
      ).toBe(false);
    }
  });

  it("does not pay for non-won transitions", () => {
    expect(
      shouldCreateCommission({
        ownerRole: "sales_rep",
        nextStage: "negotiation",
        previousStage: "qualified",
        commissionAlreadyExists: false,
      }),
    ).toBe(false);
  });

  it("does not re-trigger when the deal was already won", () => {
    expect(
      shouldCreateCommission({
        ownerRole: "sales_rep",
        nextStage: "won",
        previousStage: "won",
        commissionAlreadyExists: false,
      }),
    ).toBe(false);
  });

  it("is idempotent — never pays twice for the same deal", () => {
    expect(
      shouldCreateCommission({
        ownerRole: "sales_rep",
        nextStage: "won",
        previousStage: "negotiation",
        commissionAlreadyExists: true,
      }),
    ).toBe(false);
  });
});

describe("affiliate membership term", () => {
  const jan1 = Date.UTC(2026, 0, 1);

  it("starts a fresh 365-day term from the payment date when none exists", () => {
    const end = computeMembershipPeriodEnd(jan1, null);
    expect(end).toBe(jan1 + MEMBERSHIP_TERM_DAYS * MS_PER_DAY);
  });

  it("starts fresh from payment when the prior term already lapsed", () => {
    const lapsed = jan1 - 10 * MS_PER_DAY;
    const end = computeMembershipPeriodEnd(jan1, lapsed);
    expect(end).toBe(jan1 + MEMBERSHIP_TERM_DAYS * MS_PER_DAY);
  });

  it("stacks a renewal on top of remaining time (early renewal loses no days)", () => {
    const remainingEnd = jan1 + 100 * MS_PER_DAY; // 100 days left
    const end = computeMembershipPeriodEnd(jan1, remainingEnd);
    expect(end).toBe(remainingEnd + MEMBERSHIP_TERM_DAYS * MS_PER_DAY);
  });

  it("reports active vs inactive correctly", () => {
    const end = computeMembershipPeriodEnd(jan1, null);
    expect(isMembershipActive(jan1 + 30 * MS_PER_DAY, end)).toBe(true);
    expect(isMembershipActive(jan1 + 400 * MS_PER_DAY, end)).toBe(false);
    expect(isMembershipActive(jan1, null)).toBe(false);
  });
});

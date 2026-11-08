import { describe, expect, it } from "vitest";
import {
  effectiveMembershipStatus,
  isMissingMembershipColumnError,
  toMembershipView,
  type MembershipSnapshot,
} from "./affiliateMembership";

const NOW = Date.UTC(2026, 6, 1);

function snapshot(overrides: Partial<MembershipSnapshot> = {}): MembershipSnapshot {
  return {
    affiliateId: 12,
    storeName: "North Shore Cabinets",
    plan: "annual",
    feeCents: 119500,
    status: "active",
    paidAt: new Date(NOW - 30 * 86400000),
    expiresAt: new Date(NOW + 300 * 86400000),
    committedUntil: new Date(NOW + 300 * 86400000),
    cancelledAt: null,
    stripeSubscriptionId: null,
    planColumnsAvailable: true,
    ...overrides,
  };
}

describe("isMissingMembershipColumnError", () => {
  it("recognizes the drizzle-wrapped MySQL unknown-column error", () => {
    const error = Object.assign(new Error("Failed query: select `membershipPlan` from `affiliates`"), {
      cause: { code: "ER_BAD_FIELD_ERROR", errno: 1054, sqlMessage: "Unknown column 'membershipPlan' in 'field list'" },
    });
    expect(isMissingMembershipColumnError(error)).toBe(true);
  });

  it("ignores an unknown column on an unrelated table", () => {
    const error = Object.assign(new Error("Failed query"), {
      cause: { code: "ER_BAD_FIELD_ERROR", errno: 1054, sqlMessage: "Unknown column 'freeShipping' in 'field list'" },
    });
    expect(isMissingMembershipColumnError(error)).toBe(false);
  });

  it("ignores ordinary errors", () => {
    expect(isMissingMembershipColumnError(new Error("connection lost"))).toBe(false);
    expect(isMissingMembershipColumnError(null)).toBe(false);
  });
});

describe("effectiveMembershipStatus", () => {
  it("reads active while the paid period is running", () => {
    expect(effectiveMembershipStatus({ status: "active", expiresAt: new Date(NOW + 1000), cancelledAt: null }, NOW)).toBe("active");
  });

  it("reads past_due once an active membership runs out", () => {
    expect(effectiveMembershipStatus({ status: "active", expiresAt: new Date(NOW - 1000), cancelledAt: null }, NOW)).toBe("past_due");
  });

  it("keeps a cancelled member active until the paid period ends", () => {
    expect(
      effectiveMembershipStatus({ status: "active", expiresAt: new Date(NOW + 1000), cancelledAt: new Date(NOW - 500) }, NOW),
    ).toBe("active");
  });

  it("reads cancelled once a cancelled member's paid period ends", () => {
    expect(
      effectiveMembershipStatus({ status: "active", expiresAt: new Date(NOW - 1000), cancelledAt: new Date(NOW - 5000) }, NOW),
    ).toBe("cancelled");
  });
});

describe("toMembershipView", () => {
  it("publishes the monthly minimum so the page can explain the cancel button", () => {
    const view = toMembershipView(
      snapshot({
        plan: "monthly",
        feeCents: 16900,
        expiresAt: new Date(NOW + 10 * 86400000),
        committedUntil: new Date(NOW + 40 * 86400000),
      }),
      NOW,
    );
    expect(view.plan).toBe("monthly");
    expect(view.planPriceLabel).toBe("$169/month");
    expect(view.canCancel).toBe(false);
    expect(view.cancelBlockedReason).toBe("monthly_minimum_commitment");
    expect(view.cancelEarliestAt).toEqual(new Date(NOW + 40 * 86400000));
    expect(view.cancelEndsAccessAt).toEqual(new Date(NOW + 40 * 86400000));
  });

  it("lets a monthly member past the minimum cancel, with access to the paid-through date", () => {
    const view = toMembershipView(
      snapshot({
        plan: "monthly",
        feeCents: 16900,
        expiresAt: new Date(NOW + 10 * 86400000),
        committedUntil: new Date(NOW - 5 * 86400000),
      }),
      NOW,
    );
    expect(view.canCancel).toBe(true);
    expect(view.cancelBlockedReason).toBeNull();
    expect(view.cancelEarliestAt).toBeNull();
    expect(view.cancelEndsAccessAt).toEqual(new Date(NOW + 10 * 86400000));
  });

  it("does not offer cancel twice once the member has cancelled", () => {
    const view = toMembershipView(
      snapshot({ plan: "monthly", cancelledAt: new Date(NOW - 1000), committedUntil: new Date(NOW - 5000) }),
      NOW,
    );
    expect(view.canCancel).toBe(false);
    expect(view.cancelledAt).not.toBeNull();
  });

  it("shows annual members the annual price and lets them cancel", () => {
    const view = toMembershipView(snapshot(), NOW);
    expect(view.planLabel).toBe("Annual");
    expect(view.planPriceLabel).toBe("$1,195/year");
    expect(view.canCancel).toBe(true);
    expect(view.hasStripeSubscription).toBe(false);
  });

  it("flags plan switching as unavailable while the hand-run SQL is missing", () => {
    const view = toMembershipView(snapshot({ planColumnsAvailable: false }), NOW);
    expect(view.planSwitchAvailable).toBe(false);
  });
});

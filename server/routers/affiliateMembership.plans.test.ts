import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateInvoices, affiliates } from "../../drizzle/schema";
import { FakeDb } from "../lib/testing/fakeMembershipDb";

const { getDbMock, accessMock, stripeMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessMock: vi.fn(),
  stripeMock: {
    createMembershipCheckoutSession: vi.fn(),
    cancelMembershipSubscriptionAtPeriodEnd: vi.fn(),
  },
}));

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../lib/affiliateAccess", () => ({ resolveAffiliateAccess: accessMock }));
vi.mock("../lib/affiliateMembershipCheckout", () => ({
  ...stripeMock,
  isMembershipCheckoutMetadata: () => false,
  planFromMetadata: () => "annual",
}));

import { affiliateMembershipRouter } from "./affiliateMembership";

const AFFILIATE_ID = 42;
const NOW = Date.now();
const DAY = 86400000;

const owner = { id: 9, role: "partner", email: "owner@shop.test", openId: "aff" };
const admin = { id: 1, role: "admin", email: "admin@example.com", openId: "admin" };

function caller(user: typeof owner | null) {
  return affiliateMembershipRouter.createCaller({ user, req: { headers: {} }, res: {} } as never);
}

function fakeDbFor(affiliate: Record<string, unknown>, invoices: Record<string, unknown>[] = []) {
  return new FakeDb([
    {
      table: affiliates,
      rows: [
        {
          id: AFFILIATE_ID,
          storeName: "North Shore Cabinets",
          membershipStatus: "pending",
          membershipPlan: "annual",
          membershipFeeCents: 119500,
          membershipPaidAt: null,
          membershipExpiresAt: null,
          membershipCommittedUntil: null,
          membershipCancelledAt: null,
          membershipStripeSubscriptionId: null,
          ...affiliate,
        },
      ],
    },
    { table: affiliateInvoices, rows: invoices },
  ]);
}

beforeEach(() => {
  getDbMock.mockReset();
  accessMock.mockReset();
  stripeMock.createMembershipCheckoutSession.mockReset();
  stripeMock.cancelMembershipSubscriptionAtPeriodEnd.mockReset();
  accessMock.mockResolvedValue({
    affiliateId: AFFILIATE_ID,
    isOwner: true,
    accessCrm: true,
    accessDesigner: true,
    teamMemberId: null,
  });
});

describe("affiliateMembership.cancelMembership — three-month minimum guard", () => {
  it("refuses a monthly cancel inside the minimum and names the unlock date", async () => {
    const committedUntil = new Date(NOW + 40 * DAY);
    getDbMock.mockResolvedValue(
      fakeDbFor({
        membershipStatus: "active",
        membershipPlan: "monthly",
        membershipFeeCents: 16900,
        membershipExpiresAt: new Date(NOW + 10 * DAY),
        membershipCommittedUntil: committedUntil,
      }),
    );

    await expect(caller(owner).cancelMembership()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(caller(owner).cancelMembership()).rejects.toThrow(
      new RegExp(committedUntil.toISOString().slice(0, 10)),
    );
    // Nothing was cancelled and Stripe was never touched.
    expect(stripeMock.cancelMembershipSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
  });

  it("allows a monthly cancel past the minimum, stopping Stripe billing at period end", async () => {
    const fake = fakeDbFor({
      membershipStatus: "active",
      membershipPlan: "monthly",
      membershipFeeCents: 16900,
      membershipExpiresAt: new Date(NOW + 10 * DAY),
      membershipCommittedUntil: new Date(NOW - 20 * DAY),
      membershipStripeSubscriptionId: "sub_123",
    });
    getDbMock.mockResolvedValue(fake);
    stripeMock.cancelMembershipSubscriptionAtPeriodEnd.mockResolvedValue("cancelled");

    const result = await caller(owner).cancelMembership();

    expect(result.ok).toBe(true);
    expect(result.accessUntil?.getTime()).toBe(new Date(NOW + 10 * DAY).getTime());
    expect(stripeMock.cancelMembershipSubscriptionAtPeriodEnd).toHaveBeenCalledWith("sub_123");
    const [row] = fake.rows(affiliates);
    expect(row.membershipCancelledAt).toBeInstanceOf(Date);
    // Access is unchanged: the member keeps the period they already paid for.
    expect((row.membershipExpiresAt as Date).getTime()).toBe(new Date(NOW + 10 * DAY).getTime());
  });

  it("lets an annual member cancel at any time", async () => {
    const fake = fakeDbFor({
      membershipStatus: "active",
      membershipPlan: "annual",
      membershipExpiresAt: new Date(NOW + 200 * DAY),
      membershipCommittedUntil: new Date(NOW + 200 * DAY),
    });
    getDbMock.mockResolvedValue(fake);
    const result = await caller(owner).cancelMembership();
    expect(result.ok).toBe(true);
    expect(stripeMock.cancelMembershipSubscriptionAtPeriodEnd).toHaveBeenCalledWith(null);
    expect((fake.rows(affiliates)[0].membershipCancelledAt as Date)).toBeInstanceOf(Date);
  });

  it("does not cancel twice", async () => {
    getDbMock.mockResolvedValue(
      fakeDbFor({
        membershipStatus: "active",
        membershipPlan: "annual",
        membershipExpiresAt: new Date(NOW + 200 * DAY),
        membershipCancelledAt: new Date(NOW - DAY),
      }),
    );
    const result = await caller(owner).cancelMembership();
    expect(result.alreadyCancelled).toBe(true);
    expect(stripeMock.cancelMembershipSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
  });

  it("rejects a signed-in user with no affiliate account", async () => {
    accessMock.mockResolvedValue(null);
    getDbMock.mockResolvedValue(fakeDbFor({}));
    await expect(caller({ id: 5, role: "user", email: "x@y.test", openId: "u" }).cancelMembership()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("affiliateMembership.myMembership", () => {
  it("returns the plan, the price, and whether cancel is available yet", async () => {
    getDbMock.mockResolvedValue(
      fakeDbFor({
        membershipStatus: "active",
        membershipPlan: "monthly",
        membershipFeeCents: 16900,
        membershipExpiresAt: new Date(NOW + 10 * DAY),
        membershipCommittedUntil: new Date(NOW + 40 * DAY),
      }),
    );
    const view = await caller(owner).myMembership();
    expect(view?.plan).toBe("monthly");
    expect(view?.planPriceLabel).toBe("$169/month");
    expect(view?.canCancel).toBe(false);
    expect(view?.cancelBlockedReason).toBe("monthly_minimum_commitment");
    expect(view?.planOptions).toHaveLength(2);
    expect(view?.invoices).toEqual([]);
  });
});

describe("affiliateMembership.planOptions", () => {
  it("publishes both prices from one place", async () => {
    const options = await caller(null).planOptions();
    expect(options.map((o) => o.id)).toEqual(["annual", "monthly"]);
    expect(options[0]).toMatchObject({ amountCents: 119500, priceLabel: "$1,195/year" });
    expect(options[1]).toMatchObject({ amountCents: 16900, priceLabel: "$169/month", minimumMonths: 3 });
  });
});

describe("affiliateMembership.startCheckout", () => {
  it("sends the member to Stripe in subscription mode for monthly", async () => {
    getDbMock.mockResolvedValue(fakeDbFor({}));
    stripeMock.createMembershipCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
      sessionId: "cs_test_1",
      mode: "subscription",
    });
    const result = await caller(owner).startCheckout({ plan: "monthly" });
    expect(result.mode).toBe("subscription");
    expect(result.amountCents).toBe(16900);
    expect(stripeMock.createMembershipCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ affiliateId: AFFILIATE_ID, plan: "monthly", userId: owner.id }),
    );
  });

  it("surfaces a Stripe failure as a gateway error instead of a crash", async () => {
    getDbMock.mockResolvedValue(fakeDbFor({}));
    stripeMock.createMembershipCheckoutSession.mockRejectedValue(new Error("No such price"));
    await expect(caller(owner).startCheckout({ plan: "annual" })).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });
});

describe("affiliateMembership.adminCreateInvoice", () => {
  it("creates the plan the admin picked", async () => {
    const fake = fakeDbFor({});
    getDbMock.mockResolvedValue(fake);
    const annual = await caller(admin).adminCreateInvoice({ affiliateId: AFFILIATE_ID, plan: "annual" });
    expect(annual?.amountCents).toBe(119500);
    const monthly = await caller(admin).adminCreateInvoice({ affiliateId: AFFILIATE_ID, plan: "monthly" });
    // Same single open invoice, re-pointed at the monthly plan.
    expect(monthly?.id).toBe(annual?.id);
    expect(monthly?.amountCents).toBe(16900);
    expect(fake.rows(affiliateInvoices)).toHaveLength(1);
  });

  it("is admin-only", async () => {
    await expect(caller(owner).adminCreateInvoice({ affiliateId: AFFILIATE_ID, plan: "annual" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

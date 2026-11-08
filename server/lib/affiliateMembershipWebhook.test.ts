import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { affiliateInvoices, affiliates } from "../../drizzle/schema";
import { FakeDb } from "./testing/fakeMembershipDb";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));

import { handleMembershipStripeEvent } from "./affiliateMembershipWebhook";

const AFFILIATE_ID = 7;
const CREATED = Math.floor(Date.UTC(2026, 2, 10, 9, 0, 0) / 1000);

function fakeDb() {
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
        },
      ],
    },
    { table: affiliateInvoices, rows: [] },
  ]);
}

function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: `evt_${type}`, type, created: CREATED, data: { object } } as unknown as Stripe.Event;
}

const membershipMetadata = {
  purpose: "affiliate_membership",
  affiliate_id: String(AFFILIATE_ID),
  membership_plan: "monthly",
};

beforeEach(() => {
  getDbMock.mockReset();
});

describe("membership webhook routing", () => {
  it("ignores an order checkout so the order path is untouched", async () => {
    getDbMock.mockResolvedValue(fakeDb());
    const outcome = await handleMembershipStripeEvent(
      event("checkout.session.completed", {
        id: "cs_order",
        payment_status: "paid",
        created: CREATED,
        metadata: { purpose: "order", order_id: "12" },
      }),
    );
    expect(outcome.handled).toBe(false);
  });

  it("does not activate on an unpaid completed session", async () => {
    getDbMock.mockResolvedValue(fakeDb());
    const outcome = await handleMembershipStripeEvent(
      event("checkout.session.completed", {
        id: "cs_pending",
        payment_status: "unpaid",
        created: CREATED,
        metadata: membershipMetadata,
      }),
    );
    expect(outcome.handled).toBe(false);
  });

  it("activates a monthly membership from the first Checkout payment", async () => {
    const fake = fakeDb();
    getDbMock.mockResolvedValue(fake);
    const outcome = await handleMembershipStripeEvent(
      event("checkout.session.completed", {
        id: "cs_sub",
        payment_status: "paid",
        created: CREATED,
        amount_total: 16900,
        subscription: "sub_777",
        metadata: membershipMetadata,
      }),
    );
    expect(outcome).toMatchObject({ handled: true, action: "membership_activated:monthly", affiliateId: AFFILIATE_ID });
    const [affiliate] = fake.rows(affiliates);
    expect(affiliate.membershipStatus).toBe("active");
    expect(affiliate.membershipPlan).toBe("monthly");
    expect(affiliate.membershipStripeSubscriptionId).toBe("sub_777");
    expect((affiliate.membershipExpiresAt as Date).toISOString()).toBe("2026-04-10T09:00:00.000Z");
    expect((affiliate.membershipCommittedUntil as Date).toISOString()).toBe("2026-06-10T09:00:00.000Z");
  });

  it("activates an annual membership from a one-time payment", async () => {
    const fake = fakeDb();
    getDbMock.mockResolvedValue(fake);
    const outcome = await handleMembershipStripeEvent(
      event("checkout.session.completed", {
        id: "cs_year",
        payment_status: "paid",
        created: CREATED,
        amount_total: 119500,
        metadata: { ...membershipMetadata, membership_plan: "annual" },
      }),
    );
    expect(outcome).toMatchObject({ handled: true, action: "membership_activated:annual" });
    const [affiliate] = fake.rows(affiliates);
    expect((affiliate.membershipExpiresAt as Date).toISOString()).toBe("2027-03-10T09:00:00.000Z");
  });

  it("is a no-op when the same Checkout session is replayed", async () => {
    const fake = fakeDb();
    getDbMock.mockResolvedValue(fake);
    const payload = {
      id: "cs_sub",
      payment_status: "paid",
      created: CREATED,
      subscription: "sub_777",
      metadata: membershipMetadata,
    };
    await handleMembershipStripeEvent(event("checkout.session.completed", payload));
    const second = await handleMembershipStripeEvent(event("checkout.session.completed", payload));
    expect(second).toMatchObject({ handled: true, action: "membership_already_active" });
    expect(fake.rows(affiliateInvoices)).toHaveLength(1);
  });

  it("adds one month for a subscription renewal invoice", async () => {
    const fake = fakeDb();
    getDbMock.mockResolvedValue(fake);
    await handleMembershipStripeEvent(
      event("checkout.session.completed", {
        id: "cs_sub",
        payment_status: "paid",
        created: CREATED,
        subscription: "sub_777",
        metadata: membershipMetadata,
      }),
    );
    const nextMonth = Math.floor(Date.UTC(2026, 3, 10, 9, 0, 0) / 1000);
    const outcome = await handleMembershipStripeEvent(
      event("invoice.paid", {
        id: "in_2",
        created: nextMonth,
        description: "Subscription update",
        billing_reason: "subscription_cycle",
        amount_paid: 16900,
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_777", metadata: membershipMetadata },
        },
      }),
    );
    expect(outcome).toMatchObject({ handled: true, action: "membership_period_added:monthly" });
    const [affiliate] = fake.rows(affiliates);
    expect((affiliate.membershipExpiresAt as Date).toISOString()).toBe("2026-05-10T09:00:00.000Z");
  });

  it("counts the first subscription invoice once, whichever event arrives first", async () => {
    const fake = fakeDb();
    getDbMock.mockResolvedValue(fake);
    // Stripe often delivers invoice.paid before checkout.session.completed.
    const first = await handleMembershipStripeEvent(
      event("invoice.paid", {
        id: "in_1",
        created: CREATED,
        description: "Cabinet Dealz affiliate membership — monthly",
        billing_reason: "subscription_create",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_777", metadata: membershipMetadata },
        },
      }),
    );
    expect(first).toMatchObject({ handled: true, action: "membership_period_added:monthly" });

    const second = await handleMembershipStripeEvent(
      event("checkout.session.completed", {
        id: "cs_sub",
        payment_status: "paid",
        created: CREATED,
        subscription: "sub_777",
        metadata: membershipMetadata,
      }),
    );
    expect(second).toMatchObject({ handled: true, action: "membership_already_active" });
    expect(fake.rows(affiliateInvoices)).toHaveLength(1);
    // One month only — the same payment is never applied twice.
    expect((fake.rows(affiliates)[0].membershipExpiresAt as Date).toISOString()).toBe("2026-04-10T09:00:00.000Z");
  });

  it("flags a failed renewal past_due instead of dropping access", async () => {
    const fake = fakeDb();
    getDbMock.mockResolvedValue(fake);
    fake.rows(affiliates)[0].membershipStatus = "active";
    fake.rows(affiliates)[0].membershipStripeSubscriptionId = "sub_777";
    const outcome = await handleMembershipStripeEvent(
      event("invoice.payment_failed", {
        id: "in_3",
        created: CREATED,
        description: "Cabinet Dealz affiliate membership — monthly",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_777", metadata: membershipMetadata },
        },
      }),
    );
    expect(outcome).toMatchObject({ handled: true, action: "membership_past_due", affiliateId: AFFILIATE_ID });
    expect(fake.rows(affiliates)[0].membershipStatus).toBe("past_due");
  });

  it("ignores an invoice that is not a membership", async () => {
    getDbMock.mockResolvedValue(fakeDb());
    const outcome = await handleMembershipStripeEvent(
      event("invoice.paid", {
        id: "in_order",
        created: CREATED,
        description: "Order CD-2026-0001",
        metadata: { purpose: "order", order_id: "5" },
      }),
    );
    expect(outcome.handled).toBe(false);
  });

  it("keeps a member who already paid through their period on subscription.deleted", async () => {
    const fake = fakeDb();
    getDbMock.mockResolvedValue(fake);
    fake.rows(affiliates)[0].membershipStatus = "active";
    fake.rows(affiliates)[0].membershipExpiresAt = new Date(Date.now() + 20 * 86400000);
    const outcome = await handleMembershipStripeEvent(
      event("customer.subscription.deleted", { id: "sub_777", metadata: membershipMetadata }),
    );
    expect(outcome).toMatchObject({ handled: true, action: "membership_still_paid_through" });
    expect(fake.rows(affiliates)[0].membershipStatus).toBe("active");
  });
});

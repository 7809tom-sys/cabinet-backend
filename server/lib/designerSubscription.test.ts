import { describe, expect, it, vi } from "vitest";

vi.mock("../stripe", () => ({ getStripe: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => null) }));

import {
  buildDesignerSubscriptionCheckoutParams,
  designerSubscriptionProductName,
  handleDesignerSubscriptionStripeEvent,
  isDesignerSubscriptionMetadata,
  isMissingDesignerSubscriptionTable,
} from "./designerSubscription";
import { isMembershipCheckoutMetadata } from "./affiliateMembershipCheckout";

const base = {
  userId: 42,
  customerEmail: "pro@example.com",
  successUrl: "https://www.cabinetdealz.com/plans?subscription=success",
  cancelUrl: "https://www.cabinetdealz.com/plans?subscription=cancelled",
};

describe("designer subscription checkout", () => {
  it("bills Designer + Website at 1199 cents a month", () => {
    const params = buildDesignerSubscriptionCheckoutParams({ ...base, tier: "designer_website" });
    expect(params.mode).toBe("subscription");
    const price = params.line_items?.[0]?.price_data;
    expect(price?.unit_amount).toBe(1199);
    expect(price?.recurring).toEqual({ interval: "month", interval_count: 1 });
    expect(params.metadata?.designer_tier).toBe("designer_website");
    expect(params.subscription_data?.metadata?.purpose).toBe("designer_subscription");
  });

  it("bills Designer only at 1599 cents a month", () => {
    const params = buildDesignerSubscriptionCheckoutParams({ ...base, tier: "designer_only" });
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(1599);
  });

  it("is never mistaken for the affiliate membership", () => {
    const params = buildDesignerSubscriptionCheckoutParams({ ...base, tier: "designer_only" });
    const metadata = params.metadata as Record<string, string>;
    expect(isDesignerSubscriptionMetadata(metadata)).toBe(true);
    expect(isMembershipCheckoutMetadata(metadata)).toBe(false);
    expect(designerSubscriptionProductName("designer_website")).not.toMatch(/affiliate membership/i);
    expect(designerSubscriptionProductName("designer_only")).not.toMatch(/affiliate membership/i);
  });

  it("leaves other Stripe events to the order and membership handlers", async () => {
    const outcome = await handleDesignerSubscriptionStripeEvent({
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", metadata: { purpose: "affiliate_membership" } } },
    } as never);
    expect(outcome.handled).toBe(false);
  });

  it("recognizes the missing-table error so the webhook does not fail before the SQL is run", () => {
    expect(
      isMissingDesignerSubscriptionTable({ code: "ER_NO_SUCH_TABLE", errno: 1146, message: "Table 'cabinet_dealz.designer_subscriptions' doesn't exist" }),
    ).toBe(true);
    expect(isMissingDesignerSubscriptionTable({ code: "ER_NO_SUCH_TABLE", message: "Table 'cabinet_dealz.orders' doesn't exist" })).toBe(false);
  });
});

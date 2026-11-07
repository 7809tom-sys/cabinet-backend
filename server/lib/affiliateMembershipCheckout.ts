/**
 * Self-serve Stripe Checkout for the two affiliate membership plans.
 *
 * Annual ($1,195) is a one-time payment, exactly like the order Checkout: inline
 * `price_data`, mode "payment". A member who wants another year pays again.
 *
 * Monthly ($169) is a real Stripe subscription, mode "subscription" with an
 * inline recurring `price_data`. That choice is deliberate:
 *   - Stripe bills the card every month and retries a failed renewal itself.
 *   - The three-month minimum is enforced in our own database (the commitment
 *     date), not by charging three months up front. A member who cancels with a
 *     real reason inside the minimum is then a support decision, not a refund of
 *     money we already took.
 *   - `cancel_at_period_end` maps cleanly onto "cancelled, access runs to the
 *     paid-through date", which is the promise both plans make.
 * A first-three-months-up-front charge was the fallback; it was not needed
 * because inline recurring `price_data` is supported.
 */

import type Stripe from "stripe";
import { getStripe } from "../stripe";
import {
  membershipPlanOption,
  normalizeMembershipPlan,
  type MembershipPlan,
} from "@shared/affiliateMembershipPlans";

export const MEMBERSHIP_CHECKOUT_PURPOSE = "affiliate_membership";

export interface MembershipCheckoutInput {
  affiliateId: number;
  /** The signed-in account paying. Stored on the session for audit. */
  userId: number;
  plan: MembershipPlan;
  customerEmail?: string | null;
  customerName?: string | null;
  invoiceId?: number | null;
  successUrl: string;
  cancelUrl: string;
}

export interface MembershipCheckoutResult {
  url: string;
  sessionId: string;
  mode: "payment" | "subscription";
}

/**
 * Metadata the webhook reads back. Keys are snake_case to match the existing
 * order Checkout metadata, and `purpose` is what tells the webhook this session
 * activates a membership instead of fulfilling an order.
 */
export function membershipCheckoutMetadata(input: {
  affiliateId: number;
  userId: number;
  plan: MembershipPlan;
  invoiceId?: number | null;
  customerEmail?: string | null;
  customerName?: string | null;
}): Record<string, string> {
  return {
    purpose: MEMBERSHIP_CHECKOUT_PURPOSE,
    affiliate_id: String(input.affiliateId),
    user_id: String(input.userId),
    membership_plan: input.plan,
    affiliate_invoice_id: input.invoiceId != null ? String(input.invoiceId) : "",
    customer_email: input.customerEmail ?? "",
    customer_name: input.customerName ?? "",
  };
}

/** Read the plan out of a Stripe object's metadata, defaulting to annual. */
export function planFromMetadata(metadata: Record<string, string> | null | undefined): MembershipPlan {
  return normalizeMembershipPlan(metadata?.membership_plan);
}

export function isMembershipCheckoutMetadata(metadata: Record<string, string> | null | undefined): boolean {
  return metadata?.purpose === MEMBERSHIP_CHECKOUT_PURPOSE;
}

export async function createMembershipCheckoutSession(
  input: MembershipCheckoutInput,
): Promise<MembershipCheckoutResult> {
  const stripe = getStripe();
  const plan = normalizeMembershipPlan(input.plan);
  const option = membershipPlanOption(plan);
  const metadata = membershipCheckoutMetadata(input);
  const productName =
    plan === "annual" ? "Cabinet Dealz affiliate membership — annual" : "Cabinet Dealz affiliate membership — monthly";

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
    price_data: {
      currency: "usd",
      unit_amount: option.amountCents,
      product_data: {
        name: productName,
        description:
          plan === "annual"
            ? "One year of the affiliate program: designer, storefront, and buying-group pricing."
            : "Three-month minimum, then month to month. Cancel any time after the minimum.",
        metadata: { plan },
      },
      ...(plan === "monthly" ? { recurring: { interval: "month" as const, interval_count: 1 } } : {}),
    },
    quantity: 1,
  };

  const common: Stripe.Checkout.SessionCreateParams = {
    ui_mode: "hosted_page",
    client_reference_id: String(input.userId),
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    billing_address_collection: "auto",
    phone_number_collection: { enabled: false },
    automatic_tax: { enabled: false },
    allow_promotion_codes: false,
    line_items: [lineItem],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
  };

  const params: Stripe.Checkout.SessionCreateParams =
    plan === "monthly"
      ? {
          ...common,
          mode: "subscription",
          // The minimum is enforced by our own commitment date, so the
          // subscription itself stays cancellable; the member page refuses the
          // cancel button until the minimum ends.
          subscription_data: {
            metadata,
            description: "Cabinet Dealz affiliate membership — monthly",
          },
        }
      : {
          ...common,
          mode: "payment",
          submit_type: "auto",
          ...(input.customerEmail
            ? {
                payment_intent_data: {
                  receipt_email: input.customerEmail,
                  description: "Cabinet Dealz affiliate membership — annual",
                  metadata,
                },
                invoice_creation: {
                  enabled: true as const,
                  invoice_data: {
                    description: "Cabinet Dealz affiliate membership — annual",
                    metadata,
                    footer: "Thank you for being a Cabinet Dealz affiliate.",
                  },
                },
              }
            : {}),
        };

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id, mode: plan === "monthly" ? "subscription" : "payment" };
}

/**
 * Cancel the Stripe subscription that backs a monthly membership so it stops
 * billing at the end of the period the member already paid for.
 *
 * Returns "not_applicable" when the membership has no subscription (annual, or a
 * card payment recorded by an admin). Never throws for a missing subscription:
 * the local membership record is the source of truth for access.
 */
export async function cancelMembershipSubscriptionAtPeriodEnd(
  subscriptionId: string | null | undefined,
): Promise<"cancelled" | "not_applicable" | "failed"> {
  const id = (subscriptionId ?? "").trim();
  if (!id) return "not_applicable";
  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(id);
    if (subscription.cancel_at_period_end) return "cancelled";
    await stripe.subscriptions.update(id, { cancel_at_period_end: true });
    return "cancelled";
  } catch (error) {
    console.error(
      "[Affiliate membership] Stripe could not schedule the subscription cancellation:",
      error instanceof Error ? error.message : String(error),
    );
    return "failed";
  }
}

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  chooseInvoiceRecipient,
  contactEmailToBackfill,
  customerEmailFromStripeResource,
  lookupStripeCustomerEmail,
  usableInvoiceEmail,
} from "./invoiceRecipient";

const SANDBOX_MISS = "No such payment_intent: 'pi_3UJHny3gL4KQ5uZE0TBGOfzN' (This is an unclaimed Stripe sandbox...)";

describe("invoice recipient resolution", () => {
  it("keeps a usable address and rejects a blank or malformed one", () => {
    expect(usableInvoiceEmail("  Home@Example.com ")).toBe("Home@Example.com");
    expect(usableInvoiceEmail(" ")).toBeNull();
    expect(usableInvoiceEmail("not-an-email")).toBeNull();
  });

  it("backfills only when the lead has no contact email", () => {
    expect(contactEmailToBackfill(null, "home@example.com")).toBe("home@example.com");
    expect(contactEmailToBackfill("  ", "home@example.com")).toBe("home@example.com");
    expect(contactEmailToBackfill("kept@example.com", "other@example.com")).toBeNull();
    expect(contactEmailToBackfill(null, "not-an-email")).toBeNull();
  });

  it("prefers the linked order, then the stored checkout email, then the account", () => {
    expect(chooseInvoiceRecipient({
      dealEmail: null,
      orderEmail: "order@example.com",
      checkoutEmail: "stripe-row@example.com",
      accountEmail: "account@example.com",
    })).toEqual({ email: "order@example.com", source: "order", stripeLookup: "not_needed" });

    expect(chooseInvoiceRecipient({
      checkoutEmail: "stripe-row@example.com",
      accountEmail: "account@example.com",
      stripeLiveEmail: "live@example.com",
    })).toEqual({ email: "stripe-row@example.com", source: "stripe_record", stripeLookup: "not_needed" });

    expect(chooseInvoiceRecipient({
      accountEmail: "account@example.com",
    })).toEqual({ email: "account@example.com", source: "account", stripeLookup: "not_needed" });
  });

  it("uses a live Stripe email only after local sources are empty", () => {
    expect(chooseInvoiceRecipient({
      dealEmail: "lead@example.com",
      stripeLiveEmail: "live@example.com",
    })).toEqual({ email: "lead@example.com", source: "deal", stripeLookup: "not_needed" });
    expect(chooseInvoiceRecipient({
      stripeLiveEmail: "live@example.com",
    })).toEqual({ email: "live@example.com", source: "stripe", stripeLookup: "found" });
    expect(chooseInvoiceRecipient({
      stripeLookup: "unavailable",
    })).toEqual({ email: null, source: null, stripeLookup: "unavailable" });
  });

  it("reads receipt_email, then billing_details.email, then customer.email", () => {
    expect(customerEmailFromStripeResource({
      receipt_email: "receipt@example.com",
      billing_details: { email: "billing@example.com" },
      email: "customer@example.com",
    })).toBe("receipt@example.com");
    expect(customerEmailFromStripeResource({
      receipt_email: "",
      latest_charge: { billing_details: { email: "billing@example.com" } },
    })).toBe("billing@example.com");
    expect(customerEmailFromStripeResource({
      customer_details: { email: "checkout@example.com" },
    })).toBe("checkout@example.com");
    expect(customerEmailFromStripeResource({ email: "customer@example.com", deleted: false })).toBe("customer@example.com");
    expect(customerEmailFromStripeResource({ email: "customer@example.com", deleted: true })).toBeNull();
  });

  it("treats a payment intent on another Stripe account as unavailable and does not throw", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await lookupStripeCustomerEmail({
      paymentIntentId: "pi_3UJHny3gL4KQ5uZE0TBGOfzN",
      chargeId: "ch_missing",
      sessionId: "cs_missing",
      customerId: "cus_missing",
    }, {
      orderId: 11700001,
      reader: {
        retrievePaymentIntent: async () => { throw new Error(SANDBOX_MISS); },
        retrieveCharge: async () => { throw new Error("No such charge"); },
        retrieveCheckoutSession: async () => { throw new Error("No such checkout.session"); },
        retrieveCustomer: async () => { throw new Error("No such customer"); },
      },
    });
    expect(result).toEqual({ email: null, unavailable: true });
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toContain("11700001");
    expect(String(error.mock.calls[0]?.[0])).toContain("pi_3UJHny3gL4KQ5uZE0TBGOfzN");
    error.mockRestore();
  });

  it("returns the first Stripe object that actually has an email", async () => {
    const result = await lookupStripeCustomerEmail({
      paymentIntentId: "pi_other_account",
      chargeId: "ch_live",
    }, {
      reader: {
        retrievePaymentIntent: async () => { throw new Error(SANDBOX_MISS); },
        retrieveCharge: async () => ({ billing_details: { email: "charge@example.com" }, receipt_email: null }),
        retrieveCheckoutSession: async () => { throw new Error("not called"); },
        retrieveCustomer: async () => { throw new Error("not called"); },
      },
    });
    expect(result).toEqual({ email: "charge@example.com", unavailable: false });
  });

  it("keeps the CRM invoice send and New Sale sync on this resolver", () => {
    const crm = readFileSync(new URL("../routers/crm.ts", import.meta.url), "utf8");
    expect(crm).toContain("loadDealInvoiceRecipient");
    expect(crm).toContain("contactEmailToBackfill(deal.contactEmail, to)");
    expect(crm).toContain("invoiceRecipient");
    const attach = readFileSync(new URL("./crmPipelineAttach.ts", import.meta.url), "utf8");
    expect(attach).toContain("contactEmailToBackfill(picked.contactEmail, email)");
  });
});

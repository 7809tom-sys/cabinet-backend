import { describe, expect, it } from "vitest";
import { NO_CUSTOMER_EMAIL_MESSAGE, verifiedEmailResponseFields } from "./orderVerifiedEmailResponse";

describe("verifiedEmailResponseFields", () => {
  it("reports the address when the thank-you email went out", () => {
    expect(verifiedEmailResponseFields({ sent: true, skipped: false, to: "ada@example.com" }))
      .toEqual({ customerEmailSentTo: "ada@example.com", customerEmailError: null });
  });

  it("stays quiet when the order was already emailed", () => {
    expect(verifiedEmailResponseFields({ sent: false, skipped: true, skipReason: "already_sent" }))
      .toEqual({ customerEmailSentTo: null, customerEmailError: null });
  });

  it("says so when the order has no customer email", () => {
    expect(verifiedEmailResponseFields({ sent: false, skipped: true, skipReason: "no_customer_email" }))
      .toEqual({ customerEmailSentTo: null, customerEmailError: NO_CUSTOMER_EMAIL_MESSAGE });
  });

  it("passes the reason through when the marker column is missing", () => {
    const error = "order_requests.orderVerifiedEmailSentAt is missing. Run the order verified email SQL before verified orders can email the customer.";
    expect(verifiedEmailResponseFields({ sent: false, skipped: true, skipReason: "schema_missing", error }))
      .toEqual({ customerEmailSentTo: null, customerEmailError: error });
  });

  it("passes the provider error through when the send failed", () => {
    expect(verifiedEmailResponseFields({ sent: false, skipped: false, error: "Email is not configured.", to: "ada@example.com" }))
      .toEqual({ customerEmailSentTo: null, customerEmailError: "Email is not configured." });
  });

  it("returns nulls when nothing was attempted", () => {
    expect(verifiedEmailResponseFields(undefined)).toEqual({ customerEmailSentTo: null, customerEmailError: null });
  });
});

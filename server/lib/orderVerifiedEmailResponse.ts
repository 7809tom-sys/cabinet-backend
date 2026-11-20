import type { OrderVerifiedEmailResult } from "./orderVerifiedEmail";

/**
 * What `orders.markVerified` tells the admin panel about the customer's
 * "your order has been verified" email. The panel shows:
 *  - customerEmailError set   → "Order verified, but the thank-you email was not sent: …"
 *  - customerEmailSentTo set  → "Order verified — thank-you email sent to …"
 *  - both null                → "Order verified" (already emailed earlier, or nothing attempted)
 */
export type VerifiedEmailResponseFields = {
  customerEmailSentTo: string | null;
  customerEmailError: string | null;
};

export const NO_CUSTOMER_EMAIL_MESSAGE = "The order has no customer email address.";

export function verifiedEmailResponseFields(result: OrderVerifiedEmailResult | null | undefined): VerifiedEmailResponseFields {
  if (!result) return { customerEmailSentTo: null, customerEmailError: null };
  if (result.sent) return { customerEmailSentTo: result.to ?? null, customerEmailError: null };
  // A second click on an order that was already emailed is not a failure.
  if (result.skipReason === "already_sent") return { customerEmailSentTo: null, customerEmailError: null };
  if (result.skipReason === "no_customer_email") {
    return { customerEmailSentTo: null, customerEmailError: result.error?.trim() || NO_CUSTOMER_EMAIL_MESSAGE };
  }
  const error = result.error?.trim();
  return { customerEmailSentTo: null, customerEmailError: error || "The thank-you email was not sent." };
}

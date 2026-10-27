import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_ORDER_NOTIFY_EMAIL,
  composeOrderReceipt,
  deliverOrderReceipt,
  orderNotifyEmail,
  type ReceiptOrder,
} from "./orderReceiptEmail";

const paidOrder: ReceiptOrder = {
  id: 18,
  requestNumber: "CD-520",
  originatorName: "Ada Lovelace",
  originatorEmail: "ada@example.com",
  shippingAddressLine1: "1 Analytic Engine",
  shippingCity: "London",
  shippingState: "KY",
  zip: "40741",
  deliveryMethod: "ship",
  freightQuoteCents: 4700,
  freightQuoteVerified: true,
  taxAmount: "24.00",
  lineItems: [{
    masterCode: "3DB18",
    distributorSku: "3DB18",
    description: "3 drawer base",
    qty: 1,
    unitPrice: 449,
    linePrice: 449,
  }],
};

describe("paid order receipt", () => {
  it("emails the customer and BCCs the sales inbox once", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const release = vi.fn(async () => undefined);
    const first = await deliverOrderReceipt({
      order: paidOrder,
      notifyEmail: DEFAULT_ORDER_NOTIFY_EMAIL,
      claim: async () => "claimed",
      release,
      send,
      shipping: { carrier: "UPS", method: "Ground" },
    });
    const second = await deliverOrderReceipt({
      order: paidOrder,
      notifyEmail: DEFAULT_ORDER_NOTIFY_EMAIL,
      claim: async () => "already_sent",
      release,
      send,
    });
    expect(first).toMatchObject({ sent: true, customerEmailed: true, salesCopied: true, customerEmailMissing: false });
    expect(second.skipped).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("ada@example.com");
    expect(message.bcc).toBe("sales@cabinetdealz.com");
    expect(message.subject).toContain("CD-520");
    expect(message.text).toContain("3 drawer base");
    expect(message.text).toContain("3DB18");
    expect(message.text).toContain("$449.00");
    expect(message.text).toContain("$47.00");
    expect(message.text).toContain("$24.00");
    expect(message.text).toContain("$520.00");
    expect(message.text).toContain("1 Analytic Engine");
    expect(message.text).toContain("London");
    expect(message.text).toContain("UPS");
    expect(release).not.toHaveBeenCalled();
  });

  it("sends only the sales copy and flags a missing customer email", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const result = await deliverOrderReceipt({
      order: { ...paidOrder, originatorEmail: "not-an-email" },
      notifyEmail: "sales@cabinetdealz.com",
      claim: async () => "claimed",
      release: async () => undefined,
      send,
    });
    expect(result).toMatchObject({ sent: true, customerEmailed: false, salesCopied: true, customerEmailMissing: true });
    expect(send.mock.calls[0][0].to).toBe("sales@cabinetdealz.com");
    expect(send.mock.calls[0][0].bcc).toBeUndefined();
    expect(send.mock.calls[0][0].text).toContain("Customer email was missing or invalid");
  });

  it("releases the claim when the provider rejects the message", async () => {
    const release = vi.fn(async () => undefined);
    const result = await deliverOrderReceipt({
      order: paidOrder,
      notifyEmail: "sales@cabinetdealz.com",
      claim: async () => "claimed",
      release,
      send: async () => ({ success: false, error: "SMTP connection refused" }),
    });
    expect(result.sent).toBe(false);
    expect(result.error).toContain("SMTP connection refused");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not send when the receipt marker column is missing", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const result = await deliverOrderReceipt({
      order: paidOrder,
      notifyEmail: orderNotifyEmail({}),
      claim: async () => "schema_missing",
      release: async () => undefined,
      send,
    });
    expect(result.sent).toBe(false);
    expect(result.error).toContain("receiptSentAt");
    expect(send).not.toHaveBeenCalled();
    expect(orderNotifyEmail({ ORDER_NOTIFY_EMAIL: "desk@cabinetdealz.com" })).toBe("desk@cabinetdealz.com");
    expect(orderNotifyEmail({})).toBe("sales@cabinetdealz.com");
  });

  it("includes the invoice lines in the composed body", () => {
    const message = composeOrderReceipt(paidOrder, "sales@cabinetdealz.com", { carrier: "UPS", method: "Ground" });
    expect(message.html).toContain("3 drawer base");
    expect(message.html).toContain("$520.00");
    expect(message.text).toContain("Order number: CD-520");
  });
});

describe("paid order receipt wiring", () => {
  it("sends from the paid checkout and payment intent handlers", () => {
    const webhook = readFileSync(resolve(process.cwd(), "server/stripeWebhook.ts"), "utf8");
    expect(webhook).toContain("await sendPaidOrderReceipt(orderId)");
    expect(webhook).toContain('case "checkout.session.completed"');
    expect(webhook).toContain('case "checkout.session.async_payment_succeeded"');
    expect(webhook).toContain('case "payment_intent.succeeded"');
    const orders = readFileSync(resolve(process.cwd(), "server/routers/orders.ts"), "utf8");
    const listStart = orders.indexOf("adminList:");
    const detailStart = orders.indexOf("adminDetail:");
    const listBody = orders.slice(listStart, detailStart);
    expect(listBody).not.toContain("getStripe(");
    expect(listBody).not.toContain("readStripeChargeFacts");
    expect(orders.slice(detailStart, orders.indexOf("sendToDistributor:"))).toContain("readStripeChargeFacts");
    const sql = readFileSync(resolve(process.cwd(), "docs/sql/0224_order_admin_reconciliation.tidb.sql"), "utf8");
    expect(sql).toContain("cabinet_dealz.order_requests");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS receiptSentAt");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.order_request_line_costs");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.order_request_commerce_snapshots");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS stripeFeeCents INT NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS stripeNetCents INT NULL");
    expect(sql).not.toContain("--> statement-breakpoint");
  });

  it("does not send when the sales notify address is unusable", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const result = await deliverOrderReceipt({
      order: paidOrder,
      notifyEmail: "not-an-email",
      claim: async () => "claimed",
      release: async () => undefined,
      send,
    });
    expect(result.sent).toBe(false);
    expect(result.error).toContain("ORDER_NOTIFY_EMAIL");
    expect(send).not.toHaveBeenCalled();
  });
});

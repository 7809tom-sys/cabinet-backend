import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("order CRM and distributor email hooks", () => {
  it("keeps submitted orders qualified and emails the distributor without a second deal helper", () => {
    const orders = source("../routers/orders.ts");
    expect(orders).toContain("ensureAffiliatePipelineDeal");
    expect(orders).toContain('stage: "qualified"');
    expect(orders).toContain("await onOrderPlaced(insertId)");
    expect(orders).toContain("backfillOrderCrm(!input.apply)");
    expect(orders).toContain("resendDistributorEmail");
    const sideEffects = source("./orderSideEffects.ts");
    expect(sideEffects).toContain("buildDistributorEmailContent");
    expect(sideEffects).toContain("createDistributorPoPdf");
    expect(sideEffects).toContain("html: message.html");
    expect(sideEffects).toContain("application/pdf");
    expect(sideEffects).not.toContain("styleName: order.styleName");
  });

  it("moves a paid order to New Sale from checkout, payment intent, admin mark-paid, and Stripe sync", () => {
    expect(source("../stripe.ts")).toContain("await onOrderPaid(paidOrder.id)");
    expect(source("./orderReceiptEmail.ts")).toContain("await onOrderPaid(orderId)");
    expect(source("./orderSideEffects.ts")).toContain("export async function adminMarkOrderPaid");
    expect(source("./orderSideEffects.ts")).toContain("export async function noteStripeMatchedPayment");
    expect(source("../stripePaymentRecords.ts")).toContain("onLinkedPayment");
    expect(source("../routers/stripeInvoices.ts")).toContain("noteStripeMatchedPayment");
    expect(source("../stripeWebhook.ts")).toContain("flagOrderCrmRefund");
  });

  it("covers manual sample orders and the labor estimator without creating a contacts table", () => {
    expect(source("../routers/vendorSamples.ts")).toContain("syncStoredOrderCrm");
    expect(source("../routers/installationEstimates.ts")).toContain("syncStoredOrderCrm");
    expect(source("./orderSideEffects.ts")).not.toContain("crm_contacts");
    expect(source("./orderCrmSale.ts")).toContain('target.stage = "new_sale"');
    expect(source("./orderImageGenerated.ts")).toContain("export async function markOrderImageGenerated");
  });
});

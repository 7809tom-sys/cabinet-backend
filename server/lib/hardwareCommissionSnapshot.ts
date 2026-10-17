import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  affiliateHardwareCommissionSnapshots,
  orderRequests,
  type OrderLineItem,
} from "../../drizzle/schema";
import { HARDWARE_COMMISSION_RATE_BPS, hardwareAffiliateCommissionCents } from "@shared/hardwareCommerce";

/**
 * Create one immutable hardware commission snapshot after a paid order is confirmed.
 * No row is written for house orders or orders without hardware. The unique order key
 * makes Stripe webhook retries and an alternate gateway approval safe.
 */
export async function createHardwareCommissionSnapshot(orderRequestId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db
    .select({
      id: orderRequests.id,
      affiliateId: orderRequests.affiliateId,
      lineItems: orderRequests.lineItems,
      status: orderRequests.status,
      paidAt: orderRequests.paidAt,
      confirmedAt: orderRequests.confirmedAt,
      stripePaymentIntentId: orderRequests.stripePaymentIntentId,
    })
    .from(orderRequests)
    .where(eq(orderRequests.id, orderRequestId))
    .limit(1);
  if (!order?.affiliateId || order.status !== "confirmed" || (!order.paidAt && !order.confirmedAt && !order.stripePaymentIntentId)) return;

  const hardwareLines = ((order.lineItems as OrderLineItem[]) ?? [])
    .filter((line) => line.productKind === "hardware" && line.vendorProductId != null && line.linePrice != null);
  if (hardwareLines.length === 0) return;

  const hardwareMerchandiseCents = hardwareLines.reduce(
    (sum, line) => sum + Math.max(0, Math.round(Number(line.linePrice) * 100)),
    0,
  );
  const hardwareCostCents = hardwareLines.reduce(
    (sum, line) => sum + Math.max(0, Math.round(line.hardwareUnitCostCents ?? 0)) * Math.max(1, line.qty),
    0,
  );
  const markupValues = new Set(hardwareLines.map((line) => Math.max(0, Math.round(line.hardwareMarkupBps ?? 0))));
  const affiliateMarkupBps = markupValues.size === 1 ? Array.from(markupValues)[0]! : 0;
  const commissionCents = hardwareAffiliateCommissionCents(hardwareMerchandiseCents);

  const existing = await db
    .select({ id: affiliateHardwareCommissionSnapshots.id })
    .from(affiliateHardwareCommissionSnapshots)
    .where(eq(affiliateHardwareCommissionSnapshots.orderRequestId, orderRequestId))
    .limit(1);
  if (existing[0]) return;
  try {
    await db.insert(affiliateHardwareCommissionSnapshots).values({
      orderRequestId,
      affiliateId: order.affiliateId,
      hardwareMerchandiseCents,
      hardwareCostCents,
      affiliateMarkupBps,
      commissionRateBps: HARDWARE_COMMISSION_RATE_BPS,
      commissionCents,
    });
  } catch (error) {
    // A duplicate key from a concurrent webhook means the same immutable snapshot
    // already won the race. Re-throw all other database errors.
    if (!(error instanceof Error) || !/duplicate|unique/i.test(error.message)) throw error;
  }
}

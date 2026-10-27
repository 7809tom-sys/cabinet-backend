import { ENV } from "../_core/env";
import { getDb } from "../db";
import { getStripe } from "../stripe";
import { readStoredStripePayouts, saveStoredStripePayout, type StoredStripePayout } from "./orderCostSnapshot";
import { readStripeChargeFacts } from "./stripeChargeFacts";

type ExecuteDb = Parameters<typeof readStoredStripePayouts>[0];

const payoutCache = new Map<string, StoredStripePayout>();

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
}

function stripeReader() {
  const stripe = getStripe();
  return {
    retrievePaymentIntent: (id: string) => stripe.paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction"] }),
    retrieveCharge: (id: string) => stripe.charges.retrieve(id, { expand: ["balance_transaction"] }),
    retrieveBalanceTransaction: (id: string) => stripe.balanceTransactions.retrieve(id),
  };
}

/**
 * Fee and net for the admin list. Stored snapshots win. Orders that have a
 * payment intent and no snapshot are looked up a few at a time, then saved
 * so the next list load does not call Stripe again.
 */
export async function loadStripePayouts(
  db: ExecuteDb,
  orders: Array<{ id: number; paymentIntentId?: string | null }>,
): Promise<Map<number, StoredStripePayout>> {
  const stored = await readStoredStripePayouts(db, orders.map((order) => order.id));
  for (const order of orders) {
    if (stored.has(order.id) || !order.paymentIntentId) continue;
    const cached = payoutCache.get(order.paymentIntentId);
    if (cached) stored.set(order.id, cached);
  }
  if (!ENV.stripeSecretKey) return stored;
  const missing = orders.filter((order) => order.paymentIntentId && !stored.has(order.id));
  await mapPool(missing, 4, async (order) => {
    const paymentIntentId = order.paymentIntentId;
    if (!paymentIntentId) return;
    try {
      const facts = await readStripeChargeFacts(stripeReader(), { paymentIntentId });
      const feeCents = facts?.feeCents ?? null;
      const netCents = facts?.netCents ?? (
        facts?.amountReceivedCents != null && feeCents != null ? facts.amountReceivedCents - feeCents : null
      );
      const payout = { feeCents, netCents, amountReceivedCents: facts?.amountReceivedCents ?? null };
      payoutCache.set(paymentIntentId, payout);
      stored.set(order.id, payout);
      await saveStoredStripePayout(db, order.id, feeCents, netCents);
    } catch (error) {
      console.error(`[Admin Order] Stripe fee lookup failed for order ${order.id}:`, error instanceof Error ? error.message : "unknown error");
      payoutCache.set(paymentIntentId, { feeCents: null, netCents: null, amountReceivedCents: null });
    }
  });
  return stored;
}

export async function rememberOrderStripePayout(orderId: number, paymentIntentId: string | null): Promise<void> {
  if (!paymentIntentId || !ENV.stripeSecretKey) return;
  try {
    const db = await getDb();
    if (!db) return;
    await loadStripePayouts(db, [{ id: orderId, paymentIntentId }]);
  } catch (error) {
    console.error(`[Admin Order] Could not store the Stripe fee for order ${orderId}:`, error instanceof Error ? error.message : "unknown error");
  }
}

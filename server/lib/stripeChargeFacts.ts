/**
 * Read a PaymentIntent's amount_received and the charge balance-transaction
 * fee and net. Used only for a single admin order detail, never for the list.
 */

export type StripeChargeFacts = {
  amountReceivedCents: number | null;
  feeCents: number | null;
  netCents: number | null;
  chargeId: string | null;
  paymentIntentId: string | null;
  currency: string | null;
};

export type StripeChargeReader = {
  retrievePaymentIntent(id: string): Promise<unknown>;
  retrieveCharge(id: string): Promise<unknown>;
  retrieveBalanceTransaction(id: string): Promise<unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function balanceFacts(value: unknown): { id: string | null; feeCents: number | null; netCents: number | null } {
  if (typeof value === "string") return { id: asString(value), feeCents: null, netCents: null };
  const record = asRecord(value);
  if (!record) return { id: null, feeCents: null, netCents: null };
  return {
    id: asString(record.id),
    feeCents: asCents(record.fee),
    netCents: asCents(record.net),
  };
}

async function feeAndNet(reader: StripeChargeReader, balance: unknown): Promise<{ feeCents: number | null; netCents: number | null }> {
  const direct = balanceFacts(balance);
  if (direct.feeCents != null || direct.netCents != null || !direct.id) {
    return { feeCents: direct.feeCents, netCents: direct.netCents };
  }
  const loaded = balanceFacts(await reader.retrieveBalanceTransaction(direct.id));
  return { feeCents: loaded.feeCents, netCents: loaded.netCents };
}

export async function readStripeChargeFacts(
  reader: StripeChargeReader,
  ids: { paymentIntentId?: string | null; chargeId?: string | null },
): Promise<StripeChargeFacts | null> {
  const paymentIntentId = asString(ids.paymentIntentId);
  const chargeId = asString(ids.chargeId);
  if (paymentIntentId) {
    const intent = asRecord(await reader.retrievePaymentIntent(paymentIntentId));
    if (!intent) return null;
    const latest = intent.latest_charge;
    const charge = asRecord(latest);
    const resolvedChargeId = charge ? asString(charge.id) : asString(latest);
    const balance = charge ? charge.balance_transaction : null;
    let fees = await feeAndNet(reader, balance);
    if (fees.feeCents == null && fees.netCents == null && resolvedChargeId) {
      const loadedCharge = asRecord(await reader.retrieveCharge(resolvedChargeId));
      fees = await feeAndNet(reader, loadedCharge?.balance_transaction);
    }
    return {
      amountReceivedCents: asCents(intent.amount_received),
      feeCents: fees.feeCents,
      netCents: fees.netCents,
      chargeId: resolvedChargeId,
      paymentIntentId,
      currency: asString(intent.currency),
    };
  }
  if (!chargeId) return null;
  const charge = asRecord(await reader.retrieveCharge(chargeId));
  if (!charge) return null;
  const fees = await feeAndNet(reader, charge.balance_transaction);
  const intentId = asString(charge.payment_intent) ?? asString(asRecord(charge.payment_intent)?.id);
  let amountReceivedCents: number | null = null;
  if (intentId) {
    const intent = asRecord(await reader.retrievePaymentIntent(intentId));
    amountReceivedCents = asCents(intent?.amount_received);
  }
  return {
    amountReceivedCents: amountReceivedCents ?? asCents(charge.amount),
    feeCents: fees.feeCents,
    netCents: fees.netCents,
    chargeId,
    paymentIntentId: intentId,
    currency: asString(charge.currency),
  };
}

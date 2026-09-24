export type InvoicePrefillCandidate = {
  totalAmount: string | number | null;
  status?: string | null;
  source: string;
};

export type VerifiedFreightInvoiceCandidate = {
  freightQuoteCents: number | null;
  freightQuoteVerified: boolean;
  deliveryMethod?: "ship" | "pickup" | null;
  status?: string | null;
  source: string;
};

export function usableInvoicePrefill(candidate: InvoicePrefillCandidate | null | undefined): { amount: string | null; source: string | null } {
  if (!candidate || candidate.status === "cancelled") return { amount: null, source: null };
  const amount = Number(candidate.totalAmount);
  if (!Number.isFinite(amount) || amount < 0) return { amount: null, source: null };
  return { amount: amount.toFixed(2), source: candidate.source };
}

/**
 * An invoice may only carry a shipping amount that came from the signed freight
 * quote persisted on the order request. A plan or cart subtotal is merchandise
 * only; it must never be treated as shipping, and an unverified $0 is not free
 * freight. Pickup intentionally has no shipping line.
 */
export function verifiedFreightInvoicePrefill(
  candidate: VerifiedFreightInvoiceCandidate | null | undefined,
): { amount: string | null; source: string | null; note: string | null } {
  if (!candidate || candidate.status === "cancelled") {
    return { amount: null, source: null, note: "Shipping needs a verified carrier quote." };
  }
  if (candidate.deliveryMethod === "pickup") {
    return { amount: null, source: null, note: "Pickup selected — no shipping charge is added." };
  }
  if (!candidate.freightQuoteVerified) {
    return { amount: null, source: null, note: "Shipping needs a verified carrier quote." };
  }
  const cents = Number(candidate.freightQuoteCents);
  if (!Number.isInteger(cents) || cents < 0) {
    return { amount: null, source: null, note: "Shipping needs a verified carrier quote." };
  }
  return { amount: (cents / 100).toFixed(2), source: candidate.source, note: null };
}

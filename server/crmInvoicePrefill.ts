export type InvoicePrefillCandidate = {
  totalAmount: string | number | null;
  status?: string | null;
  source: string;
};

export function usableInvoicePrefill(candidate: InvoicePrefillCandidate | null | undefined): { amount: string | null; source: string | null } {
  if (!candidate || candidate.status === "cancelled") return { amount: null, source: null };
  const amount = Number(candidate.totalAmount);
  if (!Number.isFinite(amount) || amount < 0) return { amount: null, source: null };
  return { amount: amount.toFixed(2), source: candidate.source };
}

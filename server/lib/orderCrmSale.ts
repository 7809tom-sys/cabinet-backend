// Moves the single crm_deals row already linked by orderRequestId.
// Submitted unpaid stays qualified. Paid becomes New Sale. A refund keeps the row.
import { contactEmailToBackfill } from "./invoiceRecipient";

export type CrmOrderView = {
  id: number;
  requestNumber: string;
  status: string;
  paidAt: string | Date | null;
  stripePaymentIntentId?: string | null;
  totalAmount: string | null;
  affiliateId?: number | null;
  originatorName?: string | null;
  originatorEmail?: string | null;
  originatorPhone?: string | null;
};

export type CrmDealView = {
  id: number;
  stage: string;
  orderRequestId: number | null;
  estimatedValue: string | null;
  closedAt: string | Date | null;
};

export type MemoryDeal = {
  id: number;
  stage: string;
  orderRequestId: number | null;
  estimatedValue: string | null;
  closedAt: string | null;
  activities: string[];
  saleRefundedAt: string | null;
  affiliateId: number | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

export type CrmBackfillPreview = {
  createQualified: number;
  createNewSale: number;
  moveToNewSale: number;
  unchanged: number;
  skipped: number;
};

export function orderIsPaid(order: Pick<CrmOrderView, "paidAt" | "stripePaymentIntentId">): boolean {
  return order.paidAt != null || Boolean(order.stripePaymentIntentId);
}

export function newSaleActivityBody(order: Pick<CrmOrderView, "id" | "requestNumber" | "totalAmount">): string {
  return `[order-crm:${order.id}:new_sale] Order ${order.requestNumber} was paid and recorded as a New Sale. Total ${order.totalAmount ?? "—"}.`;
}

export function refundActivityBody(order: Pick<CrmOrderView, "id" | "requestNumber">, source: string): string {
  return `[order-crm:${order.id}:refund] Refund recorded for order ${order.requestNumber} (${source}). The CRM sale was kept.`;
}

export function orderStepActivityBody(orderId: number, step: string, detail: string): string {
  return `[order-step:${orderId}:${step}] ${detail}`;
}

function stamp(value: string | Date | null | undefined, fallback: string): string {
  if (value == null || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export type CrmSyncPlan =
  | { kind: "skip" }
  | { kind: "qualified"; create: boolean; dealId: number | null; setStage: boolean }
  | { kind: "new_sale"; create: boolean; dealId: number | null; estimatedValue: string | null; closedAt: string; activityBody: string; logActivity: boolean };

export function planOrderCrmSync(order: CrmOrderView, deal: CrmDealView | null, now = new Date()): CrmSyncPlan {
  const paid = orderIsPaid(order);
  const tracked = paid || order.status === "submitted" || order.status === "confirmed";
  if (!tracked || order.status === "cancelled") return { kind: "skip" };
  if (!paid) {
    const setStage = deal != null && deal.stage === "new";
    return { kind: "qualified", create: deal == null, dealId: deal?.id ?? null, setStage };
  }
  const closedAt = stamp(deal?.closedAt ?? order.paidAt, now.toISOString());
  return {
    kind: "new_sale",
    create: deal == null,
    dealId: deal?.id ?? null,
    estimatedValue: order.totalAmount,
    closedAt,
    activityBody: newSaleActivityBody(order),
    logActivity: deal?.stage !== "new_sale",
  };
}

function nextId(deals: MemoryDeal[]): number {
  return deals.reduce((max, deal) => Math.max(max, deal.id), 0) + 1;
}

/** Fill contact fields that the lead is still missing. Never overwrite a stored email. */
export function blankCrmContactPatch(
  deal: { contactEmail?: string | null; contactName?: string | null; contactPhone?: string | null } | null,
  order: Pick<CrmOrderView, "originatorEmail" | "originatorName" | "originatorPhone">,
): { contactEmail?: string; contactName?: string; contactPhone?: string } {
  const patch: { contactEmail?: string; contactName?: string; contactPhone?: string } = {};
  const email = contactEmailToBackfill(deal?.contactEmail, order.originatorEmail);
  if (email) patch.contactEmail = email;
  if (!deal?.contactName?.trim() && order.originatorName?.trim()) patch.contactName = order.originatorName.trim();
  if (!deal?.contactPhone?.trim() && order.originatorPhone?.trim()) patch.contactPhone = order.originatorPhone.trim();
  return patch;
}

function applyBlankContact(target: MemoryDeal, order: CrmOrderView) {
  const patch = blankCrmContactPatch(target, order);
  if (patch.contactEmail) target.contactEmail = patch.contactEmail;
  if (patch.contactName) target.contactName = patch.contactName;
  if (patch.contactPhone) target.contactPhone = patch.contactPhone;
}

function blankDeal(id: number, order: CrmOrderView, stage: string): MemoryDeal {
  return {
    id,
    stage,
    orderRequestId: order.id,
    estimatedValue: stage === "new_sale" ? order.totalAmount : null,
    closedAt: null,
    activities: [],
    saleRefundedAt: null,
    affiliateId: order.affiliateId ?? null,
    contactEmail: order.originatorEmail ?? null,
    contactName: order.originatorName ?? null,
    contactPhone: order.originatorPhone ?? null,
  };
}

export function applyOrderCrmSync(deals: MemoryDeal[], order: CrmOrderView, now = new Date()): MemoryDeal[] {
  const next = deals.map((deal) => ({ ...deal, activities: [...deal.activities] }));
  const existing = next.find((deal) => deal.orderRequestId === order.id) ?? null;
  const plan = planOrderCrmSync(order, existing, now);
  if (plan.kind === "skip") return next;
  if (plan.kind === "qualified") {
    if (plan.create) {
      const created = blankDeal(nextId(next), order, "qualified");
      applyBlankContact(created, order);
      next.push(created);
    } else if (existing) {
      if (plan.setStage) existing.stage = "qualified";
      applyBlankContact(existing, order);
    }
    return next;
  }
  const target = existing ?? blankDeal(nextId(next), order, "new_sale");
  if (!existing) next.push(target);
  target.stage = "new_sale";
  target.orderRequestId = order.id;
  target.estimatedValue = plan.estimatedValue;
  target.closedAt = target.closedAt ?? plan.closedAt;
  applyBlankContact(target, order);
  if (plan.logActivity && !target.activities.some((body) => body.includes(`[order-crm:${order.id}:new_sale]`))) {
    target.activities.push(plan.activityBody);
  }
  return next;
}

export function applyOrderRefund(deals: MemoryDeal[], order: CrmOrderView, source: string, at = new Date()): MemoryDeal[] {
  const next = deals.map((deal) => ({ ...deal, activities: [...deal.activities] }));
  const deal = next.find((row) => row.orderRequestId === order.id);
  if (!deal) return next;
  const body = refundActivityBody(order, source);
  if (!deal.activities.some((activity) => activity.includes(`[order-crm:${order.id}:refund]`))) {
    deal.activities.push(body);
  }
  deal.saleRefundedAt = deal.saleRefundedAt ?? at.toISOString();
  return next;
}

export function previewCrmBackfill(orders: CrmOrderView[], deals: MemoryDeal[]): CrmBackfillPreview {
  const preview: CrmBackfillPreview = { createQualified: 0, createNewSale: 0, moveToNewSale: 0, unchanged: 0, skipped: 0 };
  for (const order of orders) {
    const deal = deals.find((row) => row.orderRequestId === order.id) ?? null;
    const plan = planOrderCrmSync(order, deal);
    if (plan.kind === "skip") preview.skipped += 1;
    else if (plan.kind === "qualified" && plan.create) preview.createQualified += 1;
    else if (plan.kind === "qualified") preview.unchanged += 1;
    else if (plan.create) preview.createNewSale += 1;
    else if (plan.logActivity) preview.moveToNewSale += 1;
    else preview.unchanged += 1;
  }
  return preview;
}

export function applyCrmBackfill(orders: CrmOrderView[], deals: MemoryDeal[], dryRun: boolean): { deals: MemoryDeal[]; preview: CrmBackfillPreview } {
  const preview = previewCrmBackfill(orders, deals);
  if (dryRun) return { deals, preview };
  return { deals: orders.reduce((current, order) => applyOrderCrmSync(current, order), deals), preview };
}

export function wonRevenueDeals<T extends { stage: string; estimatedValue?: string | null }>(deals: T[]): { count: number; value: number } {
  const won = deals.filter((deal) => deal.stage === "won" || deal.stage === "new_sale");
  const value = won.reduce((sum, deal) => {
    const amount = Number(deal.estimatedValue ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return { count: won.length, value };
}

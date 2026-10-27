import type { CleanupPlan } from "./plan";

function cell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const HEADER = [
  "action",
  "entity",
  "id",
  "reason",
  "hasRealPayment",
  "name",
  "email",
  "role",
  "userId",
  "parentId",
  "requestNumber",
  "title",
  "updatedAt",
];

export function planToCsv(plan: CleanupPlan): string {
  const lines = [HEADER.join(",")];
  const push = (row: unknown[]) => lines.push(row.map(cell).join(","));

  for (const user of plan.users) {
    push([
      user.action,
      "users",
      user.id,
      user.reason,
      user.hasRealPayment ? "yes" : "no",
      user.name,
      user.email,
      user.role,
      user.id,
      "",
      "",
      "",
      user.updatedAt,
    ]);
  }
  for (const order of plan.orderRequests) {
    push([
      order.action,
      "order_requests",
      order.id,
      order.reason,
      order.hasRealPayment ? "yes" : "no",
      order.originatorName,
      order.originatorEmail,
      "",
      order.userId,
      "",
      order.requestNumber,
      "",
      order.updatedAt,
    ]);
  }
  for (const order of plan.legacyOrders) {
    push([
      order.action,
      "orders",
      order.id,
      order.reason,
      order.hasRealPayment ? "yes" : "no",
      "",
      "",
      "",
      order.userId,
      "",
      order.orderNumber,
      "",
      order.updatedAt,
    ]);
  }
  for (const deal of plan.deals) {
    push([
      deal.action,
      "crm_deals",
      deal.id,
      deal.reason,
      deal.hasRealPayment ? "yes" : "no",
      deal.contactName,
      deal.contactEmail,
      "",
      deal.ownerUserId,
      deal.orderRequestId,
      "",
      deal.title,
      deal.updatedAt,
    ]);
  }
  for (const child of plan.children) {
    push([
      child.action,
      child.table,
      child.id,
      child.reason,
      "no",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      child.updatedAt,
    ]);
  }
  for (const record of plan.stripeRecords) {
    push([
      record.action,
      "stripe_payment_records",
      record.id,
      record.reason,
      record.hasRealPayment ? "yes" : "no",
      record.customerName,
      record.customerEmail,
      "",
      "",
      record.orderRequestId,
      "",
      record.purpose,
      record.updatedAt,
    ]);
  }
  for (const estimate of plan.estimates) {
    push([
      estimate.action,
      "affiliate_installation_estimates",
      estimate.id,
      estimate.reason,
      "no",
      estimate.customerName,
      estimate.customerEmail,
      "",
      "",
      estimate.orderRequestId ?? estimate.crmDealId,
      "",
      "",
      estimate.updatedAt,
    ]);
  }
  return `${lines.join("\n")}\n`;
}

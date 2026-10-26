import { DELETE_REASONS, REASON_LABELS, type CleanupPlan, type DeleteReason } from "./plan";

const SAMPLE = 300;

export type ReasonCount = { users: number; orders: number; deals: number; children: number };

function emptyReasonCounts(): Record<DeleteReason, ReasonCount> {
  const counts = {} as Record<DeleteReason, ReasonCount>;
  for (const reason of DELETE_REASONS) counts[reason] = { users: 0, orders: 0, deals: 0, children: 0 };
  return counts;
}

function slimUser(user: CleanupPlan["users"][number]) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    pricingTier: user.pricingTier,
    reason: user.reason,
    reasonLabel: REASON_LABELS[user.reason] ?? user.reason,
    hasRealPayment: user.hasRealPayment,
    hasSupabaseAuth: Boolean(user.authId),
    forced: user.forced,
    updatedAt: user.updatedAt,
  };
}

export function summarizePlan(plan: CleanupPlan) {
  const countsByReason = emptyReasonCounts();
  for (const user of plan.users) {
    if (user.action === "delete" && user.reason in countsByReason) countsByReason[user.reason as DeleteReason].users += 1;
  }
  for (const order of plan.orderRequests) {
    if (order.action === "delete" && order.reason in countsByReason) countsByReason[order.reason as DeleteReason].orders += 1;
  }
  for (const deal of plan.deals) {
    if (deal.action === "delete" && deal.reason in countsByReason) countsByReason[deal.reason as DeleteReason].deals += 1;
  }
  const childDeleteCounts: Record<string, number> = {};
  for (const row of plan.children) {
    if (row.action !== "delete") continue;
    childDeleteCounts[row.table] = (childDeleteCounts[row.table] ?? 0) + 1;
    if (row.reason in countsByReason) countsByReason[row.reason as DeleteReason].children += 1;
  }
  for (const row of plan.stripeRecords) {
    if (row.action !== "delete") continue;
    childDeleteCounts.stripe_payment_records = (childDeleteCounts.stripe_payment_records ?? 0) + 1;
    if (row.reason in countsByReason) countsByReason[row.reason as DeleteReason].children += 1;
  }
  for (const row of plan.estimates) {
    if (row.action !== "delete") continue;
    childDeleteCounts.affiliate_installation_estimates = (childDeleteCounts.affiliate_installation_estimates ?? 0) + 1;
    if (row.reason in countsByReason) countsByReason[row.reason as DeleteReason].children += 1;
  }

  const deleteUsers = plan.users.filter((user) => user.action === "delete");
  const deleteOrders = plan.orderRequests.filter((order) => order.action === "delete");
  const deleteDeals = plan.deals.filter((deal) => deal.action === "delete");
  return {
    countsByReason,
    childDeleteCounts,
    keepUsers: plan.users.filter((user) => plan.keepUserIds.includes(user.id)).map(slimUser),
    forcedUserIds: plan.forcedUserIds,
    deleteUsers: deleteUsers.slice(0, SAMPLE).map(slimUser),
    deleteOrders: deleteOrders.slice(0, SAMPLE).map((order) => ({
      id: order.id,
      userId: order.userId,
      requestNumber: order.requestNumber,
      originatorName: order.originatorName,
      originatorEmail: order.originatorEmail,
      status: order.status,
      reason: order.reason,
      reasonLabel: REASON_LABELS[order.reason] ?? order.reason,
      hasRealPayment: order.hasRealPayment,
      updatedAt: order.updatedAt,
    })),
    deleteDeals: deleteDeals.slice(0, SAMPLE).map((deal) => ({
      id: deal.id,
      title: deal.title,
      contactName: deal.contactName,
      contactEmail: deal.contactEmail,
      ownerUserId: deal.ownerUserId,
      orderRequestId: deal.orderRequestId,
      reason: deal.reason,
      reasonLabel: REASON_LABELS[deal.reason] ?? deal.reason,
      hasRealPayment: deal.hasRealPayment,
      updatedAt: deal.updatedAt,
    })),
    totals: {
      deleteUsers: deleteUsers.length,
      keepUsers: plan.users.filter((user) => user.action === "keep").length,
      authorizedKeeps: plan.keepUserIds.length,
      deleteOrders: deleteOrders.length,
      keepOrders: plan.orderRequests.filter((order) => order.action === "keep").length,
      deleteDeals: deleteDeals.length,
      keepDeals: plan.deals.filter((deal) => deal.action === "keep").length,
      deleteChildren:
        plan.children.filter((row) => row.action === "delete").length +
        plan.stripeRecords.filter((row) => row.action === "delete").length +
        plan.estimates.filter((row) => row.action === "delete").length +
        plan.legacyOrders.filter((row) => row.action === "delete").length,
      keepChildren: plan.children.filter((row) => row.action === "keep").length,
      supabaseAuthUsers: plan.users.filter((user) => user.action === "delete" && user.authId).length,
      unlinks: plan.unlinks.length,
    },
    paymentFlags: {
      users: deleteUsers.filter((user) => user.hasRealPayment).length,
      orders: deleteOrders.filter((order) => order.hasRealPayment).length,
      deals: deleteDeals.filter((deal) => deal.hasRealPayment).length,
    },
    preservedAffiliates: plan.preservedAffiliates.map((row) => ({
      id: row.id,
      storeName: row.storeName,
      contactName: row.contactName,
      userId: row.userId,
    })),
    unlinkedAffiliates: plan.unlinkedAffiliates.map((row) => ({
      id: row.id,
      storeName: row.storeName,
      contactName: row.contactName,
      userId: row.userId,
    })),
    warnings: plan.warnings,
    sampleTruncated: deleteUsers.length > SAMPLE || deleteOrders.length > SAMPLE || deleteDeals.length > SAMPLE,
  };
}

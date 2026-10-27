import { inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  affiliateHardwareCommissionSnapshots,
  affiliateInstallationEstimates,
  affiliateTeamMembers,
  affiliates,
  aiServiceRequests,
  cartItems,
  carts,
  codeAliases,
  countertopQuotes,
  crmActivities,
  crmDealDesigns,
  crmDeals,
  crmEmailLog,
  crmEvents,
  customerFavorites,
  customerFavoriteSyncs,
  customerPreferredProducts,
  designConsultations,
  designGeminiImageTestJobs,
  designImageRequests,
  designLayoutInstances,
  designLayoutZoneSelections,
  designLeads,
  designPhotoRenders,
  designViewLog,
  designerAvailability,
  kitchenDesigns,
  measureSessions,
  orderItems,
  orderRequests,
  orderShipments,
  orders,
  passwordResetTokens,
  payments,
  salesCommissions,
  stripePaymentRecords,
  subscribers,
  surfacePreviews,
  threeDRoomShares,
  users,
} from "../../drizzle/schema";
import type { BuildPlanInput, LinkKind, PlannerChild } from "./plan";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

function iso(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

function child(
  table: string,
  id: number,
  updatedAt: Date | string | null | undefined,
  links: { kind: LinkKind; id: number }[],
  mode?: "any" | "user_only",
): PlannerChild | null {
  const usable = links.filter((link) => Number.isFinite(link.id));
  if (usable.length === 0) return null;
  return { table, id, updatedAt: iso(updatedAt), links: usable, mode };
}

export async function loadCleanupDataset(db: Database): Promise<Omit<BuildPlanInput, "actorUserId" | "keepUserIds" | "alsoDeleteUserIds" | "deleteSupabaseAuth" | "ownerEmail" | "ownerOpenId">> {
  const userRows = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      pricingTier: users.pricingTier,
      companyName: users.companyName,
      authId: users.authId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users);

  const authorCounts = await db
    .select({ userId: crmActivities.authorUserId, n: sql<number>`count(*)` })
    .from(crmActivities)
    .where(isNotNull(crmActivities.authorUserId))
    .groupBy(crmActivities.authorUserId);
  const authored = new Map<number, number>();
  for (const row of authorCounts) {
    if (row.userId != null) authored.set(row.userId, Number(row.n));
  }

  const dealActivity = await db
    .select({ dealId: crmActivities.dealId, n: sql<number>`count(*)` })
    .from(crmActivities)
    .groupBy(crmActivities.dealId);
  const activityByDeal = new Map<number, number>();
  for (const row of dealActivity) activityByDeal.set(row.dealId, Number(row.n));

  const affiliateRows = await db
    .select({
      id: affiliates.id,
      userId: affiliates.userId,
      contactName: affiliates.contactName,
      email: affiliates.email,
      storeName: affiliates.storeName,
      status: affiliates.status,
      updatedAt: affiliates.updatedAt,
    })
    .from(affiliates);

  const teamRows = await db
    .select({ userId: affiliateTeamMembers.userId })
    .from(affiliateTeamMembers)
    .where(isNotNull(affiliateTeamMembers.userId));

  const orderRows = await db
    .select({
      id: orderRequests.id,
      userId: orderRequests.userId,
      requestNumber: orderRequests.requestNumber,
      originatorName: orderRequests.originatorName,
      originatorEmail: orderRequests.originatorEmail,
      status: orderRequests.status,
      notes: orderRequests.notes,
      paidAt: orderRequests.paidAt,
      stripeSessionId: orderRequests.stripeSessionId,
      stripePaymentIntentId: orderRequests.stripePaymentIntentId,
      createdAt: orderRequests.createdAt,
      updatedAt: orderRequests.updatedAt,
    })
    .from(orderRequests);

  const approvedPayments = await db
    .select({ orderRequestId: payments.orderRequestId })
    .from(payments)
    .where(inArray(payments.status, ["approved", "refunded"]));
  const paidOrderIds = new Set(approvedPayments.map((row) => row.orderRequestId));

  const stripeRows = await db
    .select({
      id: stripePaymentRecords.id,
      orderRequestId: stripePaymentRecords.orderRequestId,
      customerEmail: stripePaymentRecords.customerEmail,
      customerName: stripePaymentRecords.customerName,
      purpose: stripePaymentRecords.purpose,
      affiliateId: stripePaymentRecords.affiliateId,
      status: stripePaymentRecords.status,
      updatedAt: stripePaymentRecords.updatedAt,
    })
    .from(stripePaymentRecords);
  const stripeOrderIds = new Set(
    stripeRows
      .filter((row) => row.orderRequestId != null && (row.status === "paid" || row.status === "refunded" || row.status === "partially_refunded"))
      .map((row) => row.orderRequestId as number),
  );

  const legacyRows = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      orderNumber: orders.orderNumber,
      paymentStatus: orders.paymentStatus,
      paidAt: orders.paidAt,
      stripePaymentIntentId: orders.stripePaymentIntentId,
      updatedAt: orders.updatedAt,
    })
    .from(orders);

  const dealRows = await db
    .select({
      id: crmDeals.id,
      title: crmDeals.title,
      contactName: crmDeals.contactName,
      contactEmail: crmDeals.contactEmail,
      ownerUserId: crmDeals.ownerUserId,
      affiliateId: crmDeals.affiliateId,
      orderRequestId: crmDeals.orderRequestId,
      notes: crmDeals.notes,
      stage: crmDeals.stage,
      createdAt: crmDeals.createdAt,
      updatedAt: crmDeals.updatedAt,
      laborEstimateId: crmDeals.laborEstimateId,
    })
    .from(crmDeals);

  const estimateRows = await db
    .select({
      id: affiliateInstallationEstimates.id,
      affiliateId: affiliateInstallationEstimates.affiliateId,
      orderRequestId: affiliateInstallationEstimates.orderRequestId,
      kitchenDesignId: affiliateInstallationEstimates.kitchenDesignId,
      crmDealId: affiliateInstallationEstimates.crmDealId,
      customerName: affiliateInstallationEstimates.customerName,
      customerEmail: affiliateInstallationEstimates.customerEmail,
      updatedAt: affiliateInstallationEstimates.updatedAt,
    })
    .from(affiliateInstallationEstimates);

  const aliasRows = await db
    .select({ id: codeAliases.id, createdByUserId: codeAliases.createdByUserId, updatedAt: codeAliases.updatedAt })
    .from(codeAliases)
    .where(isNull(codeAliases.userId));

  const children = (await loadChildren(db)).filter((row): row is PlannerChild => row != null);

  return {
    users: userRows.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      lastSignedIn: row.lastSignedIn ? iso(row.lastSignedIn) : null,
      authoredActivityCount: authored.get(row.id) ?? 0,
    })),
    orderRequests: orderRows.map((row) => ({
      ...row,
      paidAt: row.paidAt ? iso(row.paidAt) : null,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      paymentApproved: paidOrderIds.has(row.id),
      hasStripeRecord: stripeOrderIds.has(row.id),
    })),
    legacyOrders: legacyRows.map((row) => ({
      ...row,
      paidAt: row.paidAt ? iso(row.paidAt) : null,
      updatedAt: iso(row.updatedAt),
    })),
    deals: dealRows.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      activityCount: activityByDeal.get(row.id) ?? 0,
    })),
    affiliates: affiliateRows.map((row) => ({ ...row, updatedAt: iso(row.updatedAt) })),
    teamMemberUserIds: teamRows.map((row) => row.userId).filter((id): id is number => id != null),
    stripeRecords: stripeRows.map((row) => ({ ...row, updatedAt: iso(row.updatedAt) })),
    estimates: estimateRows.map((row) => ({ ...row, updatedAt: iso(row.updatedAt) })),
    children,
    globalAliases: aliasRows.map((row) => ({ ...row, updatedAt: iso(row.updatedAt) })),
  };
}

async function loadChildren(db: Database): Promise<Array<PlannerChild | null>> {
  const out: Array<PlannerChild | null> = [];
  const push = (row: PlannerChild | null) => out.push(row);

  for (const row of await db.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId, createdAt: passwordResetTokens.createdAt }).from(passwordResetTokens)) {
    push(child("password_reset_tokens", row.id, row.createdAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: customerFavorites.id, userId: customerFavorites.userId, createdAt: customerFavorites.createdAt }).from(customerFavorites)) {
    push(child("customer_favorites", row.id, row.createdAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: customerFavoriteSyncs.id, userId: customerFavoriteSyncs.userId, updatedAt: customerFavoriteSyncs.updatedAt }).from(customerFavoriteSyncs)) {
    push(child("customer_favorite_syncs", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: customerPreferredProducts.id, userId: customerPreferredProducts.userId, createdAt: customerPreferredProducts.createdAt }).from(customerPreferredProducts)) {
    push(child("customer_preferred_products", row.id, row.createdAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: designPhotoRenders.id, userId: designPhotoRenders.userId, updatedAt: designPhotoRenders.updatedAt }).from(designPhotoRenders)) {
    push(child("design_photo_renders", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: designGeminiImageTestJobs.id, userId: designGeminiImageTestJobs.userId, updatedAt: designGeminiImageTestJobs.updatedAt }).from(designGeminiImageTestJobs)) {
    push(child("design_gemini_image_test_jobs", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: designImageRequests.id, userId: designImageRequests.userId, crmDealId: designImageRequests.crmDealId, updatedAt: designImageRequests.updatedAt }).from(designImageRequests)) {
    const links: { kind: LinkKind; id: number }[] = [{ kind: "user", id: row.userId }];
    if (row.crmDealId != null) links.push({ kind: "deal", id: row.crmDealId });
    push(child("design_image_requests", row.id, row.updatedAt, links));
  }
  const cartRows = await db.select({ id: carts.id, userId: carts.userId, updatedAt: carts.updatedAt }).from(carts);
  const cartOwner = new Map<number, number>();
  for (const row of cartRows) {
    if (row.userId == null) continue;
    cartOwner.set(row.id, row.userId);
    push(child("carts", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: cartItems.id, cartId: cartItems.cartId, createdAt: cartItems.createdAt }).from(cartItems)) {
    const owner = cartOwner.get(row.cartId);
    if (owner == null) continue;
    push(child("cart_items", row.id, row.createdAt, [{ kind: "user", id: owner }]));
  }
  for (const row of await db.select({ id: kitchenDesigns.id, userId: kitchenDesigns.userId, updatedAt: kitchenDesigns.updatedAt }).from(kitchenDesigns)) {
    if (row.userId == null) continue;
    push(child("kitchen_designs", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  const layoutRows = await db.select({ id: designLayoutInstances.id, kitchenDesignId: designLayoutInstances.kitchenDesignId, updatedAt: designLayoutInstances.updatedAt }).from(designLayoutInstances);
  const layoutDesign = new Map<number, number>();
  for (const row of layoutRows) {
    layoutDesign.set(row.id, row.kitchenDesignId);
    push(child("design_layout_instances", row.id, row.updatedAt, [{ kind: "design", id: row.kitchenDesignId }]));
  }
  for (const row of await db.select({ id: designLayoutZoneSelections.id, designLayoutInstanceId: designLayoutZoneSelections.designLayoutInstanceId, updatedAt: designLayoutZoneSelections.updatedAt }).from(designLayoutZoneSelections)) {
    const designId = layoutDesign.get(row.designLayoutInstanceId);
    if (designId == null) continue;
    push(child("design_layout_zone_selections", row.id, row.updatedAt, [{ kind: "design", id: designId }]));
  }
  for (const row of await db.select({ id: threeDRoomShares.id, kitchenDesignId: threeDRoomShares.kitchenDesignId, updatedAt: threeDRoomShares.updatedAt }).from(threeDRoomShares)) {
    if (row.kitchenDesignId == null) continue;
    push(child("three_d_room_shares", row.id, row.updatedAt, [{ kind: "design", id: row.kitchenDesignId }]));
  }
  for (const row of await db.select({ id: subscribers.id, userId: subscribers.userId, createdAt: subscribers.createdAt }).from(subscribers)) {
    push(child("subscribers", row.id, row.createdAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: countertopQuotes.id, userId: countertopQuotes.userId, updatedAt: countertopQuotes.updatedAt }).from(countertopQuotes)) {
    if (row.userId == null) continue;
    push(child("countertop_quotes", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: codeAliases.id, userId: codeAliases.userId, updatedAt: codeAliases.updatedAt }).from(codeAliases).where(isNotNull(codeAliases.userId))) {
    if (row.userId == null) continue;
    push(child("code_aliases", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: designConsultations.id, customerUserId: designConsultations.customerUserId, dealId: designConsultations.dealId, updatedAt: designConsultations.updatedAt }).from(designConsultations)) {
    const links: { kind: LinkKind; id: number }[] = [];
    if (row.customerUserId != null) links.push({ kind: "user", id: row.customerUserId });
    if (row.dealId != null) links.push({ kind: "deal", id: row.dealId });
    push(child("design_consultations", row.id, row.updatedAt, links, "user_only"));
  }
  for (const row of await db.select({ id: designerAvailability.id, designerUserId: designerAvailability.designerUserId, updatedAt: designerAvailability.updatedAt }).from(designerAvailability)) {
    push(child("designer_availability", row.id, row.updatedAt, [{ kind: "user", id: row.designerUserId }], "user_only"));
  }
  for (const row of await db.select({ id: measureSessions.id, userId: measureSessions.userId, createdAt: measureSessions.createdAt }).from(measureSessions)) {
    push(child("measure_sessions", row.id, row.createdAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: crmEvents.id, userId: crmEvents.userId, updatedAt: crmEvents.updatedAt }).from(crmEvents)) {
    if (row.userId == null) continue;
    push(child("crm_events", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: designLeads.id, userId: designLeads.userId, dealId: designLeads.dealId, updatedAt: designLeads.updatedAt }).from(designLeads)) {
    const links: { kind: LinkKind; id: number }[] = [];
    if (row.userId != null) links.push({ kind: "user", id: row.userId });
    if (row.dealId != null) links.push({ kind: "deal", id: row.dealId });
    push(child("design_leads", row.id, row.updatedAt, links, row.userId == null ? "any" : "user_only"));
  }
  for (const row of await db.select({ id: aiServiceRequests.id, userId: aiServiceRequests.userId, updatedAt: aiServiceRequests.updatedAt }).from(aiServiceRequests)) {
    push(child("ai_service_requests", row.id, row.updatedAt, [{ kind: "user", id: row.userId }]));
  }
  for (const row of await db.select({ id: affiliateTeamMembers.id, userId: affiliateTeamMembers.userId, createdAt: affiliateTeamMembers.createdAt }).from(affiliateTeamMembers)) {
    if (row.userId == null) continue;
    push(child("affiliate_team_members", row.id, row.createdAt, [{ kind: "user", id: row.userId }]));
  }
  const userOpenIds = await db.select({ id: users.id, openId: users.openId }).from(users);
  const byOpenId = new Map(userOpenIds.map((row) => [row.openId, row.id]));
  for (const row of await db.select({ id: surfacePreviews.id, ownerOpenId: surfacePreviews.ownerOpenId, updatedAt: surfacePreviews.updatedAt }).from(surfacePreviews)) {
    if (!row.ownerOpenId) continue;
    const userId = byOpenId.get(row.ownerOpenId);
    if (userId == null) continue;
    push(child("surface_previews", row.id, row.updatedAt, [{ kind: "user", id: userId }]));
  }
  for (const row of await db.select({ id: orderItems.id, orderId: orderItems.orderId }).from(orderItems)) {
    push(child("order_items", row.id, "", [{ kind: "legacyOrder", id: row.orderId }]));
  }
  for (const row of await db.select({ id: designViewLog.id, designId: designViewLog.designId, viewedAt: designViewLog.viewedAt }).from(designViewLog)) {
    push(child("design_view_log", row.id, row.viewedAt, [{ kind: "design", id: row.designId }]));
  }
  for (const row of await db.select({ id: crmDealDesigns.id, dealId: crmDealDesigns.dealId, designId: crmDealDesigns.designId, createdAt: crmDealDesigns.createdAt }).from(crmDealDesigns)) {
    push(child("crm_deal_designs", row.id, row.createdAt, [{ kind: "deal", id: row.dealId }, { kind: "design", id: row.designId }]));
  }
  for (const row of await db.select({ id: crmActivities.id, dealId: crmActivities.dealId, createdAt: crmActivities.createdAt }).from(crmActivities)) {
    push(child("crm_activities", row.id, row.createdAt, [{ kind: "deal", id: row.dealId }]));
  }
  for (const row of await db.select({ id: crmEmailLog.id, dealId: crmEmailLog.dealId, sentAt: crmEmailLog.sentAt }).from(crmEmailLog)) {
    push(child("crm_email_log", row.id, row.sentAt, [{ kind: "deal", id: row.dealId }]));
  }
  for (const row of await db.select({ id: salesCommissions.id, dealId: salesCommissions.dealId, updatedAt: salesCommissions.updatedAt }).from(salesCommissions)) {
    push(child("sales_commissions", row.id, row.updatedAt, [{ kind: "deal", id: row.dealId }]));
  }
  for (const row of await db.select({ id: payments.id, orderRequestId: payments.orderRequestId, updatedAt: payments.updatedAt }).from(payments)) {
    push(child("payments", row.id, row.updatedAt, [{ kind: "order", id: row.orderRequestId }]));
  }
  for (const row of await db.select({ id: orderShipments.id, orderRequestId: orderShipments.orderRequestId, updatedAt: orderShipments.updatedAt }).from(orderShipments)) {
    push(child("order_shipments", row.id, row.updatedAt, [{ kind: "order", id: row.orderRequestId }]));
  }
  for (const row of await db.select({ id: affiliateHardwareCommissionSnapshots.id, orderRequestId: affiliateHardwareCommissionSnapshots.orderRequestId, confirmedAt: affiliateHardwareCommissionSnapshots.confirmedAt }).from(affiliateHardwareCommissionSnapshots)) {
    push(child("affiliate_hardware_commission_snapshots", row.id, row.confirmedAt, [{ kind: "order", id: row.orderRequestId }]));
  }
  return out;
}

import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import {
  affiliates,
  crmActivities,
  crmDeals,
  distributorSkus,
  distributors,
  doorStyles,
  orderRequests,
  type OrderLineItem,
} from "../../drizzle/schema";
import { distributorFacingName, resolveDistributorPoLine } from "@shared/distributorPoLine";
import { getDb } from "../db";
import { sendEmail } from "../email";
import { insertCrmEmailLog } from "./crmCustomerMail";
import { ensureAffiliatePipelineDeal } from "./crmPipelineAttach";
import { fetchDistributorPoCatalog } from "./distributorPoCatalog";
import { createDistributorPoPdf } from "./distributorPoPdf";
import {
  assignLinesToDistributors,
  buildDistributorEmailContent,
  CABINET_DEALZ_PO_BRAND,
  deliverDistributorEmails,
  distributorPoAttachmentNames,
  distributorPoPaymentTerms,
  orderFulfillmentNotes,
  orderPurchaseOrderCharges,
  parseCcEmails,
  poViewToEmailLine,
  summarizeDistributorEmails,
  usableEmail,
  type DistributorEmailRecord,
  type DistributorPortion,
  type PoParty,
} from "./distributorOrderEmail";
import {
  applyCrmBackfill,
  blankCrmContactPatch,
  orderIsPaid,
  orderStepActivityBody,
  planOrderCrmSync,
  previewCrmBackfill,
  refundActivityBody,
  type CrmDealView,
  type CrmOrderView,
  type MemoryDeal,
} from "./orderCrmSale";
import {
  isEnumValueError,
  isMissingSchemaError,
  ORDER_SCHEMA_MESSAGES,
  schemaErrorMessage,
  type OrderSchemaActionResult,
} from "./orderSchemaGuard";
import {
  columnPresent,
  hasAllColumns,
  newSaleStagePresent,
  ORDER_TRAIL_COLUMNS,
  readOrderSchemaSupport,
} from "./orderSchemaSupport";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object") return result as Array<Record<string, unknown>>;
  }
  return [];
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function stamp(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toISOString();
}

export type OrderFulfillmentOverlay = {
  distributorEmailStatus: string | null;
  distributorEmailSentAt: string | null;
  distributorEmailTo: string | null;
  distributorEmailError: string | null;
  orderVerifiedAt: string | null;
  orderVerifiedBy: string | null;
  orderShippedAt: string | null;
  orderShippedBy: string | null;
  shipmentCarrier: string | null;
  shipmentTracking: string | null;
  orderSignedAt: string | null;
  orderSignedBy: string | null;
  signerName: string | null;
  crmSyncStatus: string | null;
  crmSyncError: string | null;
  crmDealId: number | null;
  imageGeneratedCount: number;
  lastImageGeneratedAt: string | null;
  distributorEmails: DistributorEmailRecord[];
  shipments: Array<{
    status: string | null;
    shippedAt: string | null;
    carrier: string | null;
    trackingNumber: string | null;
    shippedBy: string | null;
    signatureName: string | null;
    deliveredWithSignature: boolean;
  }>;
};

const EMPTY_OVERLAY: OrderFulfillmentOverlay = {
  distributorEmailStatus: null,
  distributorEmailSentAt: null,
  distributorEmailTo: null,
  distributorEmailError: null,
  orderVerifiedAt: null,
  orderVerifiedBy: null,
  orderShippedAt: null,
  orderShippedBy: null,
  shipmentCarrier: null,
  shipmentTracking: null,
  orderSignedAt: null,
  orderSignedBy: null,
  signerName: null,
  crmSyncStatus: null,
  crmSyncError: null,
  crmDealId: null,
  imageGeneratedCount: 0,
  lastImageGeneratedAt: null,
  distributorEmails: [],
  shipments: [],
};

async function guarded<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingSchemaError(error)) return fallback;
    console.error(`[OrderEmail] ${label}: ${schemaErrorMessage(error)}`);
    return fallback;
  }
}

export async function readOrderFulfillmentOverlay(db: Database, orderIds: number[]): Promise<Map<number, OrderFulfillmentOverlay>> {
  const map = new Map<number, OrderFulfillmentOverlay>();
  if (orderIds.length === 0) return map;
  const ids = sql.join(orderIds.map((id) => sql`${id}`), sql`, `);
  const support = await readOrderSchemaSupport(db);
  const canReadTrail = support == null || hasAllColumns(support, "order_requests", ORDER_TRAIL_COLUMNS);
  const canReadDistributorEmails = support == null || columnPresent(support, "order_distributor_emails", "orderRequestId");
  const orderRows = !canReadTrail
    ? []
    : await guarded("read order trail columns", [] as Array<Record<string, unknown>>, async () => rowsFrom(await db.execute(sql`
    SELECT id, distributorEmailStatus, distributorEmailSentAt, distributorEmailTo, distributorEmailError,
      orderVerifiedAt, orderVerifiedBy, orderShippedAt, orderShippedBy, shipmentCarrier, shipmentTracking,
      orderSignedAt, orderSignedBy, signerName, crmSyncStatus, crmSyncError, crmDealId,
      imageGeneratedCount, lastImageGeneratedAt
    FROM order_requests
    WHERE id IN (${ids})
  `)));
  const emailRows = !canReadDistributorEmails
    ? []
    : await guarded("read distributor email rows", [] as Array<Record<string, unknown>>, async () => rowsFrom(await db.execute(sql`
    SELECT orderRequestId, distributorId, distributorEmailStatus, distributorEmailSentAt, distributorEmailTo, distributorEmailError
    FROM order_distributor_emails
    WHERE orderRequestId IN (${ids})
  `)));
  const shipmentRows = await guarded("read order shipments", [] as Array<Record<string, unknown>>, async () => rowsFrom(await db.execute(sql`
    SELECT orderRequestId, status, shippedAt, carrier, trackingNumber
    FROM order_shipments
    WHERE orderRequestId IN (${ids})
  `)));
  for (const id of orderIds) map.set(id, { ...EMPTY_OVERLAY, distributorEmails: [], shipments: [] });
  for (const row of orderRows) {
    const id = Number(row.id);
    const current = map.get(id);
    if (!current) continue;
    current.distributorEmailStatus = text(row.distributorEmailStatus);
    current.distributorEmailSentAt = stamp(row.distributorEmailSentAt);
    current.distributorEmailTo = text(row.distributorEmailTo);
    current.distributorEmailError = text(row.distributorEmailError);
    current.orderVerifiedAt = stamp(row.orderVerifiedAt);
    current.orderVerifiedBy = text(row.orderVerifiedBy);
    current.orderShippedAt = stamp(row.orderShippedAt);
    current.orderShippedBy = text(row.orderShippedBy);
    current.shipmentCarrier = text(row.shipmentCarrier);
    current.shipmentTracking = text(row.shipmentTracking);
    current.orderSignedAt = stamp(row.orderSignedAt);
    current.orderSignedBy = text(row.orderSignedBy);
    current.signerName = text(row.signerName);
    current.crmSyncStatus = text(row.crmSyncStatus);
    current.crmSyncError = text(row.crmSyncError);
    current.crmDealId = row.crmDealId == null ? null : Number(row.crmDealId);
    current.imageGeneratedCount = Number(row.imageGeneratedCount ?? 0) || 0;
    current.lastImageGeneratedAt = stamp(row.lastImageGeneratedAt);
  }
  for (const row of emailRows) {
    const current = map.get(Number(row.orderRequestId));
    if (!current) continue;
    current.distributorEmails.push({
      distributorId: Number(row.distributorId),
      distributorName: `Distributor ${row.distributorId}`,
      status: (text(row.distributorEmailStatus) as DistributorEmailRecord["status"]) || "pending",
      sentAt: stamp(row.distributorEmailSentAt),
      sentTo: text(row.distributorEmailTo),
      error: text(row.distributorEmailError),
    });
  }
  for (const row of shipmentRows) {
    const current = map.get(Number(row.orderRequestId));
    if (!current) continue;
    current.shipments.push({
      status: text(row.status),
      shippedAt: stamp(row.shippedAt),
      carrier: text(row.carrier),
      trackingNumber: text(row.trackingNumber),
      shippedBy: null,
      signatureName: null,
      deliveredWithSignature: false,
    });
  }
  return map;
}

export async function attachOrderFulfillmentOverlay<T extends { id: number }>(db: Database, orders: T[]): Promise<Array<T & OrderFulfillmentOverlay>> {
  const overlay = await readOrderFulfillmentOverlay(db, orders.map((order) => order.id));
  return orders.map((order) => ({ ...order, ...(overlay.get(order.id) ?? EMPTY_OVERLAY) }));
}

async function writeCrmSync(db: Database, orderId: number, status: string, error: string | null, dealId: number | null): Promise<void> {
  await guarded("write crm sync", undefined, async () => {
    await db.execute(sql`
      UPDATE order_requests
      SET crmSyncStatus = ${status}, crmSyncError = ${error}, crmDealId = ${dealId}
      WHERE id = ${orderId}
    `);
  });
}

async function writeOrderEmailSummary(db: Database, orderId: number, summary: ReturnType<typeof summarizeDistributorEmails>, distributorId: number | null): Promise<void> {
  const support = await readOrderSchemaSupport(db);
  const summaryColumns = ["distributorEmailStatus", "distributorEmailSentAt", "distributorEmailTo", "distributorEmailError"];
  if (support == null || hasAllColumns(support, "order_requests", summaryColumns)) {
    await guarded("write distributor email summary", undefined, async () => {
      await db.execute(sql`
        UPDATE order_requests
        SET distributorEmailStatus = ${summary.distributorEmailStatus},
            distributorEmailSentAt = ${summary.distributorEmailSentAt},
            distributorEmailTo = ${summary.distributorEmailTo},
            distributorEmailError = ${summary.distributorEmailError}
        WHERE id = ${orderId}
      `);
    });
  }
  if (summary.distributorEmailStatus === "sent" && summary.distributorEmailSentAt) {
    await db.update(orderRequests).set({
      sentToDistributorAt: new Date(summary.distributorEmailSentAt),
      sentToDistributorEmail: summary.distributorEmailTo,
      ...(distributorId ? { distributorId } : {}),
    }).where(eq(orderRequests.id, orderId));
  }
}

async function writeDistributorEmailRows(db: Database, orderId: number, records: DistributorEmailRecord[]): Promise<void> {
  const support = await readOrderSchemaSupport(db);
  if (support && !columnPresent(support, "order_distributor_emails", "orderRequestId")) return;
  for (const record of records) {
    await guarded(`write distributor ${record.distributorId} email`, undefined, async () => {
      await db.execute(sql`
        INSERT INTO order_distributor_emails
          (orderRequestId, distributorId, distributorEmailStatus, distributorEmailSentAt, distributorEmailTo, distributorEmailError)
        VALUES (${orderId}, ${record.distributorId}, ${record.status}, ${record.sentAt}, ${record.sentTo}, ${record.error})
        ON DUPLICATE KEY UPDATE
          distributorEmailStatus = VALUES(distributorEmailStatus),
          distributorEmailSentAt = VALUES(distributorEmailSentAt),
          distributorEmailTo = VALUES(distributorEmailTo),
          distributorEmailError = VALUES(distributorEmailError)
      `);
    });
  }
}

function shipTo(order: typeof orderRequests.$inferSelect): string[] {
  return [
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    [order.shippingCity, order.shippingState, order.zip].filter(Boolean).join(", "),
  ].map((part) => part?.trim()).filter((part): part is string => Boolean(part));
}

function toCrmOrder(order: typeof orderRequests.$inferSelect): CrmOrderView {
  return {
    id: order.id,
    requestNumber: order.requestNumber,
    status: order.status,
    paidAt: order.paidAt,
    stripePaymentIntentId: order.stripePaymentIntentId,
    totalAmount: order.totalAmount,
    affiliateId: order.affiliateId,
    originatorName: order.originatorName,
    originatorEmail: order.originatorEmail,
    originatorPhone: order.originatorPhone,
  };
}

async function findDealForOrder(db: Database, orderId: number, preferredDealId?: number | null): Promise<typeof crmDeals.$inferSelect | null> {
  const [linked] = await db.select().from(crmDeals).where(eq(crmDeals.orderRequestId, orderId)).orderBy(desc(crmDeals.updatedAt)).limit(1);
  if (linked) return linked;
  if (!preferredDealId) return null;
  const [preferred] = await db.select().from(crmDeals).where(eq(crmDeals.id, preferredDealId)).limit(1);
  if (!preferred) return null;
  if (preferred.orderRequestId != null && preferred.orderRequestId !== orderId) return null;
  if (preferred.orderRequestId == null) {
    await db.update(crmDeals).set({ orderRequestId: orderId }).where(and(eq(crmDeals.id, preferred.id), isNull(crmDeals.orderRequestId)));
    return { ...preferred, orderRequestId: orderId };
  }
  return preferred;
}

async function logDealActivity(db: Database, dealId: number, kind: "note" | "stage_change" | "email", body: string, marker: string): Promise<void> {
  const [existing] = await db.select({ id: crmActivities.id }).from(crmActivities)
    .where(and(eq(crmActivities.dealId, dealId), like(crmActivities.body, `%${marker}%`)))
    .limit(1);
  if (existing) return;
  await db.insert(crmActivities).values({ dealId, kind, body });
}

function dealView(deal: typeof crmDeals.$inferSelect): CrmDealView {
  return {
    id: deal.id,
    stage: deal.stage,
    orderRequestId: deal.orderRequestId,
    estimatedValue: deal.estimatedValue,
    closedAt: deal.closedAt,
  };
}

async function rememberPaidOrderWithoutNewSale(
  db: Database,
  order: typeof orderRequests.$inferSelect,
  dealId: number | null,
): Promise<void> {
  let keptId = dealId;
  if (keptId == null) {
    try {
      const ensured = await ensureAffiliatePipelineDeal(db, qualifiedDraft(order, "qualified"));
      keptId = ensured.id;
    } catch (error) {
      console.error(`[OrderCrm] Could not keep a qualified deal for paid order ${order.requestNumber}: ${schemaErrorMessage(error)}`);
    }
  }
  console.warn(`[OrderCrm] ${ORDER_SCHEMA_MESSAGES.newSale} Order ${order.requestNumber} was left off New Sale.`);
  await writeCrmSync(db, order.id, "failed", ORDER_SCHEMA_MESSAGES.newSale, keptId);
}

function qualifiedDraft(order: typeof orderRequests.$inferSelect, stage: "qualified" | "new_sale") {
  return {
    affiliateId: order.affiliateId,
    match: "order" as const,
    orderRequestId: order.id,
    ownerUserId: order.userId,
    title: `Order ${order.requestNumber}${order.originatorName ? ` — ${order.originatorName}` : ""}`.slice(0, 256),
    stage,
    contactName: order.originatorName,
    contactEmail: order.originatorEmail,
    contactPhone: order.originatorPhone,
    location: shipTo(order).join(", ") || order.zip,
    estimatedValue: order.totalAmount,
    source: "order_request" as const,
    referralCode: order.referralCode,
    notes: [
      `Order ${order.requestNumber}`,
      order.totalAmount ? `Total ${order.totalAmount}` : null,
      order.notes,
    ].filter(Boolean).join("\n"),
  };
}

export async function syncStoredOrderCrm(orderId: number, opts?: { preferredDealId?: number | null }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
    if (!order) return;
    const deal = await findDealForOrder(db, order.id, opts?.preferredDealId);
    const crmOrder = toCrmOrder(order);
    const plan = planOrderCrmSync(crmOrder, deal ? dealView(deal) : null);
    const contactPatch = blankCrmContactPatch(deal, crmOrder);
    if (plan.kind === "skip") {
      await writeCrmSync(db, order.id, "skipped", null, deal?.id ?? null);
      return;
    }
    if (plan.kind === "qualified") {
      if (!deal) {
        const ensured = await ensureAffiliatePipelineDeal(db, qualifiedDraft(order, "qualified"));
        await writeCrmSync(db, order.id, "qualified", null, ensured.id);
        return;
      }
      if ((plan.setStage && deal.stage === "new") || Object.keys(contactPatch).length > 0) {
        await db.update(crmDeals).set({
          ...(plan.setStage && deal.stage === "new" ? { stage: "qualified" as const } : {}),
          ...contactPatch,
        }).where(eq(crmDeals.id, deal.id));
      }
      await writeCrmSync(db, order.id, "qualified", null, deal.id);
      return;
    }
    const support = await readOrderSchemaSupport(db);
    if (support && !newSaleStagePresent(support)) {
      await rememberPaidOrderWithoutNewSale(db, order, deal?.id ?? null);
      return;
    }
    let dealId = deal?.id ?? null;
    try {
      if (!dealId) {
        const ensured = await ensureAffiliatePipelineDeal(db, qualifiedDraft(order, "new_sale"));
        dealId = ensured.id;
      }
      await db.update(crmDeals).set({
        stage: "new_sale",
        estimatedValue: order.totalAmount,
        closedAt: deal?.closedAt ?? (order.paidAt ? new Date(order.paidAt) : new Date()),
        ...contactPatch,
      }).where(eq(crmDeals.id, dealId));
    } catch (error) {
      const schemaRejected = isEnumValueError(error) || isMissingSchemaError(error);
      const message = schemaRejected ? ORDER_SCHEMA_MESSAGES.newSale : schemaErrorMessage(error);
      console.error(`[OrderCrm] Could not move order ${order.requestNumber} to New Sale: ${message}`);
      if (schemaRejected && dealId == null) {
        await rememberPaidOrderWithoutNewSale(db, order, null);
        return;
      }
      await writeCrmSync(db, order.id, "failed", message, dealId);
      return;
    }
    if (plan.logActivity) {
      await logDealActivity(db, dealId, "stage_change", plan.activityBody, `[order-crm:${order.id}:new_sale]`);
    }
    await writeCrmSync(db, order.id, "new_sale", null, dealId);
  } catch (error) {
    console.error(`[OrderCrm] Sync failed for order ${orderId}: ${schemaErrorMessage(error)}`);
    try { await writeCrmSync(db, orderId, "failed", schemaErrorMessage(error), null); } catch { /* the order itself still stands */ }
  }
}

export async function flagOrderCrmRefund(orderId: number, source: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
    if (!order) return;
    if (orderIsPaid(toCrmOrder(order)) || order.paidAt) await syncStoredOrderCrm(orderId);
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.orderRequestId, orderId)).limit(1);
    if (!deal) return;
    await logDealActivity(db, deal.id, "note", refundActivityBody(toCrmOrder(order), source), `[order-crm:${order.id}:refund]`);
    await guarded("flag refund", undefined, async () => {
      await db.execute(sql`UPDATE crm_deals SET saleRefundedAt = COALESCE(saleRefundedAt, CURRENT_TIMESTAMP) WHERE id = ${deal.id}`);
    });
    console.log(`[OrderCrm] Refund flagged on deal ${deal.id} for order ${order.requestNumber}. The deal was kept.`);
  } catch (error) {
    console.error(`[OrderCrm] Refund flag failed for order ${orderId}: ${schemaErrorMessage(error)}`);
  }
}

export async function logOrderStep(orderId: number, step: "email_sent" | "verified" | "shipped" | "signed", detail: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.orderRequestId, orderId)).limit(1);
    if (!deal) return;
    await logDealActivity(db, deal.id, step === "email_sent" ? "email" : "note", orderStepActivityBody(orderId, step, detail), `[order-step:${orderId}:${step}]`);
  } catch (error) {
    console.error(`[OrderCrm] Could not log ${step} for order ${orderId}: ${schemaErrorMessage(error)}`);
  }
}

function moneyAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }
  return null;
}

function lineUnitCost(line: OrderLineItem): number | null {
  const snapshot = moneyAmount(line.unitDistributorCost);
  if (snapshot != null) return snapshot;
  if (typeof line.hardwareUnitCostCents === "number" && Number.isFinite(line.hardwareUnitCostCents)) {
    return Math.round(line.hardwareUnitCostCents) / 100;
  }
  return null;
}

async function purchaseOrderBillTo(db: Database, order: typeof orderRequests.$inferSelect): Promise<PoParty> {
  if (order.affiliateId) {
    const [affiliate] = await db.select({
      storeName: affiliates.storeName,
      publicAddress: affiliates.publicAddress,
      location: affiliates.location,
      publicPhone: affiliates.publicPhone,
      publicEmail: affiliates.publicEmail,
    }).from(affiliates).where(eq(affiliates.id, order.affiliateId)).limit(1);
    if (affiliate?.storeName?.trim()) {
      return {
        name: affiliate.storeName.trim(),
        lines: [affiliate.publicAddress, affiliate.location, affiliate.publicPhone, affiliate.publicEmail]
          .map((line) => line?.trim() ?? "")
          .filter(Boolean),
      };
    }
  }
  return { name: CABINET_DEALZ_PO_BRAND.name, lines: [...CABINET_DEALZ_PO_BRAND.lines] };
}

function portionDocumentInput(
  order: typeof orderRequests.$inferSelect,
  portion: DistributorPortion,
  billTo: PoParty,
) {
  return {
    orderNumber: order.requestNumber,
    orderDate: new Date(order.createdAt).toISOString().slice(0, 10),
    customerName: order.originatorName,
    shipTo: shipTo(order),
    distributorName: portion.distributorName,
    lines: portion.lines,
    poNumber: order.distributorInvoiceReference,
    notes: order.notes,
    deliveryMethod: order.deliveryMethod,
    vendorLines: portion.vendorLines,
    billTo,
    charges: orderPurchaseOrderCharges(order),
    paymentTerms: distributorPoPaymentTerms(),
    fulfillmentNotes: orderFulfillmentNotes(order),
  };
}

export async function buildOrderDistributorMessage(
  db: Database,
  orderId: number,
  distributorId: number,
): Promise<{ subject: string; text: string; html: string; csv: string; document: ReturnType<typeof buildDistributorEmailContent>["document"]; orderNumber: string } | null> {
  const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
  if (!order) return null;
  const portions = await loadPortions(db, order);
  const portion = portions.find((row) => row.distributorId === distributorId);
  if (!portion) return null;
  const message = buildDistributorEmailContent(portionDocumentInput(order, portion, await purchaseOrderBillTo(db, order)));
  return { subject: message.subject, text: message.text, html: message.html, csv: message.csv, document: message.document, orderNumber: order.requestNumber };
}

async function logAutomaticDistributorEmail(
  db: Database,
  order: typeof orderRequests.$inferSelect,
  portion: DistributorPortion,
  message: { subject: string; text: string },
  fromEmail: string,
): Promise<void> {
  if (!portion.orderEmail) return;
  try {
    let dealId: number | null = null;
    const [existing] = await db.select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.orderRequestId, order.id)).limit(1);
    dealId = existing?.id ?? null;
    if (dealId == null) {
      const ensured = await ensureAffiliatePipelineDeal(db, {
        affiliateId: order.affiliateId,
        ownerUserId: null,
        title: `Order ${order.requestNumber}`,
        contactName: order.originatorName,
        contactEmail: order.originatorEmail,
        source: "order_request",
        orderRequestId: order.id,
        match: "order",
      });
      dealId = ensured.id;
    }
    await insertCrmEmailLog(db, {
      dealId,
      distributorId: portion.distributorId,
      toEmail: portion.orderEmail,
      fromEmail: fromEmail || "Cabinet Dealz",
      subject: message.subject,
      body: message.text,
      sentByName: "Automatic distributor PO",
    });
    await db.insert(crmActivities).values({
      dealId,
      authorUserId: null,
      kind: "email",
      body: `Automatic purchase order emailed to ${portion.distributorName} (${portion.orderEmail}).`,
    });
  } catch (error) {
    console.error(`[CRM email] Distributor PO for order ${order.requestNumber} was sent but not logged: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadPortions(db: Database, order: typeof orderRequests.$inferSelect): Promise<DistributorPortion[]> {
  const lines = (order.lineItems ?? []) as OrderLineItem[];
  const cabinetIds = lines.map((line) => line.cabinetId).filter((id): id is number => typeof id === "number");
  const styleIds = new Set<number>();
  for (const line of lines) if (line.styleId) styleIds.add(line.styleId);
  if (order.styleId) styleIds.add(order.styleId);
  const skuRows = cabinetIds.length && styleIds.size
    ? await db.select({
      cabinetId: distributorSkus.cabinetId,
      styleId: distributorSkus.styleId,
      distributorId: distributorSkus.distributorId,
    }).from(distributorSkus)
      .where(and(
        inArray(distributorSkus.cabinetId, cabinetIds),
        inArray(distributorSkus.styleId, Array.from(styleIds)),
        eq(distributorSkus.isAvailable, true),
      ))
    : [];
  const skuDistributor = new Map<string, number>();
  for (const row of skuRows) {
    const key = `${row.cabinetId}-${row.styleId}`;
    if (!skuDistributor.has(key)) skuDistributor.set(key, row.distributorId);
  }
  let fallback = order.distributorId ?? null;
  if (fallback == null && order.styleId) {
    const [style] = await db.select({ distributorId: doorStyles.distributorId }).from(doorStyles).where(eq(doorStyles.id, order.styleId)).limit(1);
    fallback = style?.distributorId ?? null;
  }
  const groups = assignLinesToDistributors(lines.map((line) => ({
    distributorId: line.distributorId,
    cabinetId: line.cabinetId,
    styleId: line.styleId ?? order.styleId,
    sku: "",
    description: "",
    doorStyle: null,
    qty: line.qty,
    masterCode: line.masterCode,
    rawCode: line.rawCode,
    catalogDescription: line.description,
    lineDistributorSku: line.distributorSku,
    productKind: line.productKind,
    vendorProductId: line.vendorProductId,
    storedDoorStyle: line.doorStyle,
    unitDistributorCost: lineUnitCost(line),
  })), skuDistributor, fallback);
  if (groups.size === 0) return [];
  const ids = Array.from(groups.keys());
  const catalog = await fetchDistributorPoCatalog(db, Array.from(groups.values()).flat().map((line) => ({
    cabinetId: line.cabinetId,
    styleId: line.styleId,
    masterCode: line.masterCode,
    rawCode: line.rawCode,
    description: line.catalogDescription,
    qty: line.qty,
    doorStyle: line.storedDoorStyle,
    distributorSku: line.lineDistributorSku,
    productKind: line.productKind,
    vendorProductId: line.vendorProductId,
  })));
  const dists = await db.select({
    id: distributors.id,
    code: distributors.code,
    brandName: distributors.brandName,
    orderEmail: distributors.orderEmail,
    ccEmails: distributors.ccEmails,
    warehouseName: distributors.warehouseName,
    warehouseAddress: distributors.warehouseAddress,
  }).from(distributors).where(inArray(distributors.id, ids));
  const byId = new Map(dists.map((row) => [row.id, row]));
  return ids.map((id) => {
    const dist = byId.get(id);
    const bucket = groups.get(id) ?? [];
    return {
      distributorId: id,
      distributorName: distributorFacingName({ id, brandName: dist?.brandName, code: dist?.code }),
      orderEmail: dist?.orderEmail ?? null,
      ccEmails: parseCcEmails(dist?.ccEmails),
      vendorLines: [dist?.warehouseName, dist?.warehouseAddress].map((line) => line?.trim() ?? "").filter(Boolean),
      lines: bucket.map((line) => poViewToEmailLine(resolveDistributorPoLine({
        cabinetId: line.cabinetId,
        styleId: line.styleId,
        masterCode: line.masterCode,
        rawCode: line.rawCode,
        description: line.catalogDescription,
        qty: line.qty,
        doorStyle: line.storedDoorStyle,
        distributorSku: line.lineDistributorSku,
        productKind: line.productKind,
        vendorProductId: line.vendorProductId,
        unitPrice: line.unitDistributorCost ?? null,
      }, id, catalog))),
    };
  });
}

async function readPriorEmails(db: Database, orderId: number, _order: typeof orderRequests.$inferSelect): Promise<{ records: DistributorEmailRecord[]; schemaMissing: boolean }> {
  const support = await readOrderSchemaSupport(db);
  if (support && !columnPresent(support, "order_distributor_emails", "orderRequestId")) {
    return { records: [], schemaMissing: true };
  }
  let schemaMissing = false;
  const rows = await guarded("read prior distributor emails", null as Array<Record<string, unknown>> | null, async () => {
    try {
      return rowsFrom(await db.execute(sql`
        SELECT distributorId, distributorEmailStatus, distributorEmailSentAt, distributorEmailTo, distributorEmailError
        FROM order_distributor_emails
        WHERE orderRequestId = ${orderId}
      `));
    } catch (error) {
      if (isMissingSchemaError(error)) {
        schemaMissing = true;
        return null;
      }
      throw error;
    }
  });
  if (rows == null) return { records: [], schemaMissing: true };
  return {
    schemaMissing,
    records: rows.map((row) => ({
      distributorId: Number(row.distributorId),
      distributorName: `Distributor ${row.distributorId}`,
      status: (text(row.distributorEmailStatus) as DistributorEmailRecord["status"]) || "pending",
      sentAt: stamp(row.distributorEmailSentAt),
      sentTo: text(row.distributorEmailTo),
      error: text(row.distributorEmailError),
    })),
  };
}

export type DistributorNotifyResult = {
  status: ReturnType<typeof summarizeDistributorEmails>["distributorEmailStatus"];
  sentTo: string | null;
  error: string | null;
  records: DistributorEmailRecord[];
  schemaMissing?: boolean;
};

export async function notifyOrderDistributors(orderId: number, opts?: { force?: boolean; actor?: string }): Promise<DistributorNotifyResult> {
  const empty: DistributorNotifyResult = { status: "pending", sentTo: null, error: null, records: [] };
  const db = await getDb();
  if (!db) return empty;
  try {
    const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
    if (!order) return { ...empty, status: "failed", error: "Order not found" };
    const portions = await loadPortions(db, order);
    if (portions.length === 0) {
      console.warn(`[OrderEmail] Order ${order.requestNumber} has no distributor to email.`);
      return { status: "pending", sentTo: null, error: "No distributor could be resolved", records: [] };
    }
    const priorRead = await readPriorEmails(db, order.id, order);
    const prior = priorRead.schemaMissing && order.sentToDistributorAt && !opts?.force
      ? portions.map((portion) => ({
        distributorId: portion.distributorId,
        distributorName: portion.distributorName,
        status: "sent" as const,
        sentAt: order.sentToDistributorAt!.toISOString(),
        sentTo: order.sentToDistributorEmail,
        error: null,
      }))
      : priorRead.records;
    const records = await deliverDistributorEmails({
      portions,
      prior,
      force: Boolean(opts?.force),
      send: async (portion) => {
        const message = buildDistributorEmailContent(portionDocumentInput(order, portion, await purchaseOrderBillTo(db, order)));
        const names = distributorPoAttachmentNames(order.requestNumber);
        const pdf = await createDistributorPoPdf(message.document);
        const payload = {
          to: portion.orderEmail || "",
          cc: portion.ccEmails,
          subject: message.subject,
          text: message.text,
          html: message.html,
          replyTo: usableEmail(order.originatorEmail) ?? undefined,
          attachments: [
            { filename: names.pdf, content: pdf, contentType: "application/pdf" },
            { filename: names.csv, content: message.csv, contentType: "text/csv" },
          ],
        };
        const result = await sendEmail(payload);
        if (result.success) {
          console.log(`[OrderEmail] sent via ${result.transport === "smtp" ? "SMTP" : "Resend"} order ${order.requestNumber} to distributor ${portion.distributorId} (${portion.orderEmail}).`);
          await logAutomaticDistributorEmail(db, order, portion, message, result.from ?? "");
        } else console.error(`[OrderEmail] Failed order ${order.requestNumber} to distributor ${portion.distributorId}: ${result.error || "not sent"}`);
        return { ok: result.success, error: result.error };
      },
    });
    const named = records.map((record) => ({
      ...record,
      distributorName: portions.find((portion) => portion.distributorId === record.distributorId)?.distributorName || record.distributorName,
    }));
    for (const record of named) {
      if (record.status === "no_email") console.warn(`[OrderEmail] No order email set for ${record.distributorName} on order ${order.requestNumber}.`);
    }
    const summary = summarizeDistributorEmails(named);
    await writeDistributorEmailRows(db, order.id, named);
    await writeOrderEmailSummary(db, order.id, summary, named.find((row) => row.status === "sent")?.distributorId ?? portions[0]?.distributorId ?? null);
    if (summary.distributorEmailStatus === "sent") {
      const who = opts?.actor ? ` by ${opts.actor}` : "";
      await logOrderStep(order.id, "email_sent", `Email sent${who} to ${summary.distributorEmailTo || "the distributor"}.`);
    }
    return { status: summary.distributorEmailStatus, sentTo: summary.distributorEmailTo, error: summary.distributorEmailError, records: named };
  } catch (error) {
    const schemaMissing = isMissingSchemaError(error);
    const message = schemaMissing ? ORDER_SCHEMA_MESSAGES.distributorEmails : schemaErrorMessage(error);
    console.error(`[OrderEmail] Order ${orderId} email step failed without blocking the order: ${message}`);
    return { ...empty, status: "failed", error: message, schemaMissing };
  }
}

const TRAIL_WRITE_COLUMNS = new Set([
  "orderVerifiedAt",
  "orderVerifiedBy",
  "orderShippedAt",
  "orderShippedBy",
  "shipmentCarrier",
  "shipmentTracking",
  "orderSignedAt",
  "orderSignedBy",
  "signerName",
]);

async function writeTrail(db: Database, orderId: number, patch: Record<string, string | null>): Promise<"ok" | "missing" | "failed"> {
  const assignments = Object.entries(patch).filter(([column]) => TRAIL_WRITE_COLUMNS.has(column));
  if (assignments.length === 0) return "failed";
  try {
    const setSql = sql.join(assignments.map(([column, value]) => sql`${sql.raw(column)} = ${value}`), sql`, `);
    await db.execute(sql`UPDATE order_requests SET ${setSql} WHERE id = ${orderId}`);
    return "ok";
  } catch (error) {
    if (isMissingSchemaError(error)) return "missing";
    console.error(`[OrderEmail] Could not update the order trail for ${orderId}: ${schemaErrorMessage(error)}`);
    return "failed";
  }
}

/**
 * Distributor invoice confirmation and vendor shipping call these as side
 * effects. They return a result instead of throwing, so those existing flows
 * still succeed when the trail columns are absent. Admin procedures turn a
 * failed result into a migration error.
 */
async function stampOrderTrail(orderId: number, patch: Record<string, string | null>, step: "verified" | "shipped" | "signed", detail: string): Promise<OrderSchemaActionResult> {
  try {
    const db = await getDb();
    if (!db) return { ok: false, schemaMissing: false, message: "Database not available" };
    const support = await readOrderSchemaSupport(db);
    const columns = Object.keys(patch);
    if (support && !hasAllColumns(support, "order_requests", columns)) {
      return { ok: false, schemaMissing: true, message: ORDER_SCHEMA_MESSAGES.trail };
    }
    const wrote = await writeTrail(db, orderId, patch);
    if (wrote === "missing") return { ok: false, schemaMissing: true, message: ORDER_SCHEMA_MESSAGES.trail };
    if (wrote === "failed") return { ok: false, schemaMissing: false, message: "Could not update the order status trail." };
    await logOrderStep(orderId, step, detail);
    return { ok: true };
  } catch (error) {
    if (isMissingSchemaError(error)) return { ok: false, schemaMissing: true, message: ORDER_SCHEMA_MESSAGES.trail };
    console.error(`[OrderEmail] Order trail update failed for ${orderId}: ${schemaErrorMessage(error)}`);
    return { ok: false, schemaMissing: false, message: schemaErrorMessage(error) };
  }
}

export async function markOrderVerified(orderId: number, by: string): Promise<OrderSchemaActionResult> {
  const at = new Date().toISOString();
  return stampOrderTrail(
    orderId,
    { orderVerifiedAt: at, orderVerifiedBy: by.slice(0, 255) },
    "verified",
    `Order verified by ${by}.`,
  );
}

export async function markOrderShipped(orderId: number, input: { by: string; carrier?: string | null; tracking?: string | null }): Promise<OrderSchemaActionResult> {
  const at = new Date().toISOString();
  return stampOrderTrail(orderId, {
    orderShippedAt: at,
    orderShippedBy: input.by.slice(0, 255),
    shipmentCarrier: input.carrier?.trim() || null,
    shipmentTracking: input.tracking?.trim() || null,
  }, "shipped", `Order shipped by ${input.by}${input.carrier ? ` via ${input.carrier}` : ""}${input.tracking ? ` tracking ${input.tracking}` : ""}.`);
}

export async function markOrderSigned(orderId: number, input: { by: string; signerName?: string | null }): Promise<OrderSchemaActionResult> {
  const at = new Date().toISOString();
  return stampOrderTrail(orderId, {
    orderSignedAt: at,
    orderSignedBy: input.by.slice(0, 255),
    signerName: input.signerName?.trim() || null,
  }, "signed", `Order signed${input.signerName ? ` by ${input.signerName}` : ""} and recorded by ${input.by}.`);
}

export async function onOrderPlaced(orderId: number): Promise<void> {
  try {
    await notifyOrderDistributors(orderId, { force: false, actor: "Automatic" });
  } catch (error) {
    console.error(`[OrderEmail] Submitted order ${orderId} continued without the distributor email: ${schemaErrorMessage(error)}`);
  }
}

export async function onOrderPaid(orderId: number): Promise<void> {
  try {
    await syncStoredOrderCrm(orderId);
  } catch (error) {
    console.error(`[OrderCrm] Paid order ${orderId} was saved, but the CRM follow-up failed: ${schemaErrorMessage(error)}`);
  }
  try {
    await notifyOrderDistributors(orderId, { force: false, actor: "Automatic" });
  } catch (error) {
    console.error(`[OrderEmail] Paid order ${orderId} continued without the distributor email: ${schemaErrorMessage(error)}`);
  }
}

export async function noteStripeMatchedPayment(orderId: number, status: string): Promise<void> {
  if (status !== "paid" && status !== "refunded" && status !== "partially_refunded") return;
  const db = await getDb();
  if (!db) return;
  try {
    const [order] = await db.select({ id: orderRequests.id, paidAt: orderRequests.paidAt, status: orderRequests.status })
      .from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
    if (!order) return;
    if (!order.paidAt) {
      await db.update(orderRequests).set({
        paidAt: new Date(),
        status: order.status === "draft" || order.status === "submitted" ? "confirmed" : order.status,
      }).where(eq(orderRequests.id, orderId));
    }
  } catch (error) {
    console.error(`[OrderCrm] Could not stamp payment for order ${orderId}: ${schemaErrorMessage(error)}`);
  }
  await onOrderPaid(orderId);
  if (status === "refunded" || status === "partially_refunded") await flagOrderCrmRefund(orderId, "Stripe sync");
}

export async function adminMarkOrderPaid(orderId: number, by: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [order] = await db.select({ id: orderRequests.id, paidAt: orderRequests.paidAt, status: orderRequests.status })
    .from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
  if (!order) return;
  await db.update(orderRequests).set({
    paidAt: order.paidAt ?? new Date(),
    status: order.status === "draft" || order.status === "submitted" ? "confirmed" : order.status,
  }).where(eq(orderRequests.id, orderId));
  await onOrderPaid(orderId);
  console.log(`[OrderCrm] ${by} marked order ${orderId} paid.`);
}

function memoryFromDeal(deal: typeof crmDeals.$inferSelect): MemoryDeal {
  return {
    id: deal.id,
    stage: deal.stage,
    orderRequestId: deal.orderRequestId,
    estimatedValue: deal.estimatedValue,
    closedAt: deal.closedAt ? new Date(deal.closedAt).toISOString() : null,
    activities: [],
    saleRefundedAt: null,
    affiliateId: deal.affiliateId,
    contactEmail: deal.contactEmail,
    contactName: deal.contactName,
    contactPhone: deal.contactPhone,
  };
}

export async function backfillOrderCrm(dryRun: boolean): Promise<{ dryRun: boolean; preview: ReturnType<typeof previewCrmBackfill>; scanned: number }> {
  const db = await getDb();
  if (!db) return { dryRun, scanned: 0, preview: { createQualified: 0, createNewSale: 0, moveToNewSale: 0, unchanged: 0, skipped: 0 } };
  const orders = await db.select().from(orderRequests).where(or(
    inArray(orderRequests.status, ["submitted", "confirmed"]),
    isNotNull(orderRequests.paidAt),
  )).orderBy(desc(orderRequests.id)).limit(5000);
  const ids = orders.map((order) => order.id);
  const deals = ids.length
    ? await db.select().from(crmDeals).where(inArray(crmDeals.orderRequestId, ids))
    : [];
  const views = orders.map(toCrmOrder);
  const memory = deals.map(memoryFromDeal);
  const preview = previewCrmBackfill(views, memory);
  if (!dryRun) {
    for (const order of orders) await syncStoredOrderCrm(order.id);
  }
  const checked = applyCrmBackfill(views, memory, true);
  return { dryRun, scanned: orders.length, preview: checked.preview };
}

export async function readDealImageCounts(db: Database, orderIds: number[]): Promise<Map<number, { imageGeneratedCount: number; lastImageGeneratedAt: string | null; saleRefundedAt: string | null }>> {
  const map = new Map<number, { imageGeneratedCount: number; lastImageGeneratedAt: string | null; saleRefundedAt: string | null }>();
  if (orderIds.length === 0) return map;
  const ids = sql.join(orderIds.map((id) => sql`${id}`), sql`, `);
  const support = await readOrderSchemaSupport(db);
  const canReadImages = support == null || hasAllColumns(support, "order_requests", ["imageGeneratedCount", "lastImageGeneratedAt"]);
  const canReadRefunds = support == null || columnPresent(support, "crm_deals", "saleRefundedAt");
  const orderRows = !canReadImages
    ? []
    : await guarded("read image counts", [] as Array<Record<string, unknown>>, async () => rowsFrom(await db.execute(sql`
    SELECT id, imageGeneratedCount, lastImageGeneratedAt
    FROM order_requests
    WHERE id IN (${ids})
  `)));
  for (const row of orderRows) {
    map.set(Number(row.id), {
      imageGeneratedCount: Number(row.imageGeneratedCount ?? 0) || 0,
      lastImageGeneratedAt: stamp(row.lastImageGeneratedAt),
      saleRefundedAt: null,
    });
  }
  const refunds = !canReadRefunds
    ? []
    : await guarded("read sale refunds", [] as Array<Record<string, unknown>>, async () => rowsFrom(await db.execute(sql`
    SELECT orderRequestId, saleRefundedAt FROM crm_deals WHERE orderRequestId IN (${ids})
  `)));
  for (const row of refunds) {
    const id = Number(row.orderRequestId);
    const current = map.get(id) ?? { imageGeneratedCount: 0, lastImageGeneratedAt: null, saleRefundedAt: null };
    current.saleRefundedAt = stamp(row.saleRefundedAt);
    map.set(id, current);
  }
  return map;
}

import { and, desc, eq, gte, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import {
  affiliateInvoices,
  affiliates,
  orderRequests,
  stripePaymentRecords,
  stripeWebhookEvents,
  type StripePaymentRecord,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  invoiceDelivery,
  isDuplicateKeyError,
  receiptDelivery,
  type PaymentLinkContext,
  type StripeMode,
  type StripePaymentDraft,
  type StripePaymentStatus,
  type StripePaymentStore,
  type StoredStripePayment,
} from "./stripePaymentRecords";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function toStored(row: StripePaymentRecord): StoredStripePayment {
  return {
    id: row.id,
    livemode: row.livemode,
    stripeMode: row.stripeMode,
    checkoutSessionId: row.checkoutSessionId,
    paymentIntentId: row.paymentIntentId,
    chargeId: row.chargeId,
    invoiceId: row.invoiceId,
    customerId: row.customerId,
    subscriptionId: row.subscriptionId,
    amountCents: row.amountCents,
    amountRefundedCents: row.amountRefundedCents,
    currency: row.currency,
    status: row.status,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    purpose: row.purpose,
    description: row.description,
    lineItemsJson: row.lineItemsJson,
    metadataJson: row.metadataJson,
    orderRequestId: row.orderRequestId,
    orderNumber: row.orderNumber,
    affiliateId: row.affiliateId,
    affiliateInvoiceId: row.affiliateInvoiceId,
    receiptEmail: row.receiptEmail,
    receiptUrl: row.receiptUrl,
    receiptEmailSent: row.receiptEmailSent,
    invoiceEmailSent: row.invoiceEmailSent,
    hostedInvoiceUrl: row.hostedInvoiceUrl,
    invoicePdfUrl: row.invoicePdfUrl,
    stripeDashboardUrl: row.stripeDashboardUrl,
    occurredAt: row.occurredAt,
    lastEventId: row.lastEventId,
    lastEventType: row.lastEventType,
  };
}

function toValues(draft: StripePaymentDraft) {
  return {
    livemode: draft.livemode,
    stripeMode: draft.stripeMode,
    checkoutSessionId: draft.checkoutSessionId,
    paymentIntentId: draft.paymentIntentId,
    chargeId: draft.chargeId,
    invoiceId: draft.invoiceId,
    customerId: draft.customerId,
    subscriptionId: draft.subscriptionId,
    amountCents: draft.amountCents,
    amountRefundedCents: draft.amountRefundedCents,
    currency: draft.currency,
    status: draft.status,
    customerName: draft.customerName,
    customerEmail: draft.customerEmail,
    purpose: draft.purpose,
    description: draft.description,
    lineItemsJson: draft.lineItemsJson,
    metadataJson: draft.metadataJson,
    orderRequestId: draft.orderRequestId,
    orderNumber: draft.orderNumber,
    affiliateId: draft.affiliateId,
    affiliateInvoiceId: draft.affiliateInvoiceId,
    receiptEmail: draft.receiptEmail,
    receiptUrl: draft.receiptUrl,
    receiptEmailSent: draft.receiptEmailSent,
    invoiceEmailSent: draft.invoiceEmailSent,
    hostedInvoiceUrl: draft.hostedInvoiceUrl,
    invoicePdfUrl: draft.invoicePdfUrl,
    stripeDashboardUrl: draft.stripeDashboardUrl,
    occurredAt: draft.occurredAt,
    lastEventId: draft.lastEventId,
    lastEventType: draft.lastEventType,
  };
}

export function createDrizzleStripePaymentStore(db: Database): StripePaymentStore {
  return {
    async findByStripeIds(ids) {
      const clauses = [];
      if (ids.chargeId) clauses.push(eq(stripePaymentRecords.chargeId, ids.chargeId));
      if (ids.paymentIntentId) clauses.push(eq(stripePaymentRecords.paymentIntentId, ids.paymentIntentId));
      if (ids.checkoutSessionId) clauses.push(eq(stripePaymentRecords.checkoutSessionId, ids.checkoutSessionId));
      if (ids.invoiceId) clauses.push(eq(stripePaymentRecords.invoiceId, ids.invoiceId));
      if (clauses.length === 0) return [];
      const rows = await db
        .select()
        .from(stripePaymentRecords)
        .where(or(...clauses))
        .limit(10);
      return rows.map(toStored);
    },
    async insert(row) {
      const result = await db.insert(stripePaymentRecords).values(toValues(row));
      const header = (Array.isArray(result) ? result[0] : result) as { insertId?: number } | undefined;
      const id = Number(header?.insertId);
      const stored = await db.select().from(stripePaymentRecords).where(eq(stripePaymentRecords.id, id)).limit(1);
      if (!stored[0]) throw new Error("Stripe payment record was not saved");
      return toStored(stored[0]);
    },
    async update(id, row) {
      await db.update(stripePaymentRecords).set(toValues(row)).where(eq(stripePaymentRecords.id, id));
      const stored = await db.select().from(stripePaymentRecords).where(eq(stripePaymentRecords.id, id)).limit(1);
      if (!stored[0]) throw new Error("Stripe payment record was not saved");
      return toStored(stored[0]);
    },
    async deleteIds(ids) {
      if (ids.length === 0) return;
      await db.delete(stripePaymentRecords).where(inArray(stripePaymentRecords.id, ids));
    },
    async hasEvent(eventId) {
      const rows = await db
        .select({ id: stripeWebhookEvents.id })
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.eventId, eventId))
        .limit(1);
      return Boolean(rows[0]);
    },
    async saveEvent(eventId, eventType) {
      try {
        await db.insert(stripeWebhookEvents).values({ eventId, eventType });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
      }
    },
  };
}

export function createDbPaymentLinkContext(db: Database): PaymentLinkContext {
  const orderColumns = {
    id: orderRequests.id,
    requestNumber: orderRequests.requestNumber,
    affiliateId: orderRequests.affiliateId,
    originatorName: orderRequests.originatorName,
    originatorEmail: orderRequests.originatorEmail,
  };
  return {
    async findOrderByStripe({ sessionId, paymentIntentId, orderId }) {
      if (orderId) {
        const rows = await db.select(orderColumns).from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
        if (rows[0]) return rows[0];
      }
      if (sessionId) {
        const rows = await db.select(orderColumns).from(orderRequests).where(eq(orderRequests.stripeSessionId, sessionId)).limit(1);
        if (rows[0]) return rows[0];
      }
      if (paymentIntentId) {
        const rows = await db
          .select(orderColumns)
          .from(orderRequests)
          .where(eq(orderRequests.stripePaymentIntentId, paymentIntentId))
          .limit(1);
        if (rows[0]) return rows[0];
      }
      return null;
    },
    async findAffiliateInvoiceByRef(refs) {
      const clean = Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)));
      if (clean.length === 0) return null;
      const rows = await db
        .select({
          id: affiliateInvoices.id,
          affiliateId: affiliateInvoices.affiliateId,
          description: affiliateInvoices.description,
        })
        .from(affiliateInvoices)
        .where(inArray(affiliateInvoices.paymentRef, clean))
        .limit(1);
      return rows[0] ?? null;
    },
    async findAffiliateByEmail(email) {
      const rows = await db
        .select({ id: affiliates.id })
        .from(affiliates)
        .where(sql`lower(${affiliates.email}) = ${email.trim().toLowerCase()}`)
        .limit(2);
      return rows.length === 1 ? rows[0] : null;
    },
  };
}

export async function linkStripeRecordsToAffiliateInvoice(
  db: Database,
  input: { paymentRef: string; affiliateId: number; affiliateInvoiceId: number; description: string | null },
): Promise<{ linked: number }> {
  const ref = input.paymentRef.trim();
  if (!ref) return { linked: 0 };
  const rows = await db
    .select({ id: stripePaymentRecords.id, description: stripePaymentRecords.description, affiliateId: stripePaymentRecords.affiliateId })
    .from(stripePaymentRecords)
    .where(
      or(
        eq(stripePaymentRecords.chargeId, ref),
        eq(stripePaymentRecords.paymentIntentId, ref),
        eq(stripePaymentRecords.checkoutSessionId, ref),
        eq(stripePaymentRecords.invoiceId, ref),
      ),
    );
  for (const row of rows) {
    await db
      .update(stripePaymentRecords)
      .set({
        affiliateId: row.affiliateId ?? input.affiliateId,
        affiliateInvoiceId: input.affiliateInvoiceId,
        purpose: "affiliate_membership",
        description: row.description ?? input.description,
      })
      .where(eq(stripePaymentRecords.id, row.id));
  }
  return { linked: rows.length };
}

export interface StripeInvoiceListFilters {
  search?: string;
  affiliateId?: number;
  unassignedOnly?: boolean;
  status?: StripePaymentStatus | "all";
  mode?: StripeMode | "all";
  from?: Date;
  to?: Date;
  limit: number;
}

export function toStripeInvoiceDto(
  row: StripePaymentRecord,
  affiliate: { storeName: string | null; email: string | null } | null,
) {
  return {
    id: row.id,
    livemode: row.livemode,
    stripeMode: row.stripeMode,
    amountCents: row.amountCents,
    amountRefundedCents: row.amountRefundedCents,
    currency: row.currency,
    status: row.status,
    occurredAt: row.occurredAt,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    purpose: row.purpose,
    description: row.description,
    lineItems: row.lineItemsJson ?? [],
    orderRequestId: row.orderRequestId,
    orderNumber: row.orderNumber,
    affiliateId: row.affiliateId,
    affiliateStoreName: affiliate?.storeName ?? null,
    affiliateEmail: affiliate?.email ?? null,
    affiliateInvoiceId: row.affiliateInvoiceId,
    checkoutSessionId: row.checkoutSessionId,
    paymentIntentId: row.paymentIntentId,
    chargeId: row.chargeId,
    invoiceId: row.invoiceId,
    subscriptionId: row.subscriptionId,
    receiptEmail: row.receiptEmail,
    receiptUrl: row.receiptUrl,
    receiptEmailSent: row.receiptEmailSent,
    receiptDelivery: receiptDelivery(row),
    invoiceEmailSent: row.invoiceEmailSent,
    invoiceDelivery: invoiceDelivery(row),
    hostedInvoiceUrl: row.hostedInvoiceUrl,
    invoicePdfUrl: row.invoicePdfUrl,
    stripeDashboardUrl: row.stripeDashboardUrl,
  };
}

function listWhere(filters: StripeInvoiceListFilters) {
  const clauses = [];
  if (filters.affiliateId) clauses.push(eq(stripePaymentRecords.affiliateId, filters.affiliateId));
  if (filters.unassignedOnly) clauses.push(isNull(stripePaymentRecords.affiliateId));
  if (filters.status && filters.status !== "all") clauses.push(eq(stripePaymentRecords.status, filters.status));
  if (filters.mode && filters.mode !== "all") clauses.push(eq(stripePaymentRecords.stripeMode, filters.mode));
  if (filters.from) clauses.push(gte(stripePaymentRecords.occurredAt, filters.from));
  if (filters.to) clauses.push(lte(stripePaymentRecords.occurredAt, filters.to));
  const search = filters.search?.trim();
  if (search) {
    const term = `%${search.replace(/[%_\\]/g, "").slice(0, 200)}%`;
    clauses.push(
      or(
        like(stripePaymentRecords.customerEmail, term),
        like(stripePaymentRecords.customerName, term),
        like(stripePaymentRecords.description, term),
        like(stripePaymentRecords.orderNumber, term),
        like(stripePaymentRecords.chargeId, term),
        like(stripePaymentRecords.paymentIntentId, term),
        like(stripePaymentRecords.invoiceId, term),
        like(stripePaymentRecords.checkoutSessionId, term),
        like(stripePaymentRecords.receiptEmail, term),
        like(affiliates.storeName, term),
        like(affiliates.email, term),
      ),
    );
  }
  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listStripePaymentRecords(db: Database, filters: StripeInvoiceListFilters) {
  const where = listWhere(filters);
  const rows = await db
    .select({ payment: stripePaymentRecords, storeName: affiliates.storeName, affiliateEmail: affiliates.email })
    .from(stripePaymentRecords)
    .leftJoin(affiliates, eq(affiliates.id, stripePaymentRecords.affiliateId))
    .where(where)
    .orderBy(desc(stripePaymentRecords.occurredAt), desc(stripePaymentRecords.id))
    .limit(filters.limit);
  const [summaryRow] = await db
    .select({
      total: sql<number>`count(*)`,
      paid: sql<number>`sum(case when ${stripePaymentRecords.status} = 'paid' then 1 else 0 end)`,
      refunded: sql<number>`sum(case when ${stripePaymentRecords.status} in ('refunded', 'partially_refunded') then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${stripePaymentRecords.status} = 'failed' then 1 else 0 end)`,
      receiptsSent: sql<number>`sum(case when ${stripePaymentRecords.receiptEmailSent} = 1 then 1 else 0 end)`,
      receiptsMissing: sql<number>`sum(case when ${stripePaymentRecords.receiptEmailSent} = 0 then 1 else 0 end)`,
    })
    .from(stripePaymentRecords)
    .leftJoin(affiliates, eq(affiliates.id, stripePaymentRecords.affiliateId))
    .where(where);
  return {
    rows: rows.map((row) =>
      toStripeInvoiceDto(row.payment, { storeName: row.storeName, email: row.affiliateEmail }),
    ),
    summary: {
      total: Number(summaryRow?.total ?? 0),
      paid: Number(summaryRow?.paid ?? 0),
      refunded: Number(summaryRow?.refunded ?? 0),
      failed: Number(summaryRow?.failed ?? 0),
      receiptsSent: Number(summaryRow?.receiptsSent ?? 0),
      receiptsMissing: Number(summaryRow?.receiptsMissing ?? 0),
    },
  };
}

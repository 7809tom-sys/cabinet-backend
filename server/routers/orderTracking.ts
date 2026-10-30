import { z } from "zod";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { orderRequests, orderShipments } from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveAffiliateSiteScope, rowBelongsToSite } from "../lib/affiliateSiteScope";
import { columnPresent, readOrderSchemaSupport } from "../lib/orderSchemaSupport";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buildCustomerOrderTimeline,
  invoiceMoney,
  orderVisibleToViewer,
  type CustomerOrderInput,
  type OrderTrackingLine,
} from "../../shared/orderTracking";

const TRAIL_COLUMNS = [
  "orderShippedAt",
  "orderSignedAt",
  "shipmentCarrier",
  "shipmentTracking",
  "distributorEmailStatus",
  "distributorEmailSentAt",
  "distributorEmailTo",
  "signerName",
] as const;

type TrailRow = {
  id: number;
  orderShippedAt?: string | Date | null;
  orderSignedAt?: string | Date | null;
  shipmentCarrier?: string | null;
  shipmentTracking?: string | null;
  distributorEmailStatus?: string | null;
  distributorEmailSentAt?: string | Date | null;
  distributorEmailTo?: string | null;
  signerName?: string | null;
};

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object") return result as Array<Record<string, unknown>>;
  }
  return [];
}

function readField(row: Record<string, unknown>, name: string): unknown {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === target) return value;
  }
  return null;
}

function lineItemsOf(value: unknown): OrderTrackingLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const line = (item ?? {}) as Record<string, unknown>;
    const qty = Number(line.qty ?? 0);
    const unit = line.unitPrice == null ? null : Number(line.unitPrice);
    const total = line.linePrice == null ? null : Number(line.linePrice);
    return {
      description: String(line.description ?? line.masterCode ?? "Item"),
      code: line.masterCode == null ? null : String(line.masterCode),
      qty: Number.isFinite(qty) ? qty : 0,
      unitPrice: unit != null && Number.isFinite(unit) ? unit : null,
      linePrice: total != null && Number.isFinite(total) ? total : null,
    };
  });
}

export const orderTrackingRouter = router({
  list: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().optional(),
      slug: z.string().trim().min(1).max(64).optional(),
      adminAll: z.literal(true).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const email = (ctx.user.email ?? "").trim();
    const site = input?.adminAll || input?.affiliateId != null || input?.slug
      ? await resolveAffiliateSiteScope(db, ctx.user, input)
      : null;
    const viewer = {
      userId: ctx.user.id,
      email: ctx.user.email ?? null,
      role: ctx.user.role,
      affiliateId: site?.mode === "store" ? site.affiliateId : null,
      affiliateCanSeeReferred: site?.mode === "store" || site?.mode === "all",
    };
    const filters = [eq(orderRequests.userId, ctx.user.id)];
    if (email) filters.push(eq(orderRequests.originatorEmail, email));
    if (site?.mode === "store") filters.push(eq(orderRequests.affiliateId, site.affiliateId));

    const orderQuery = db.select({
      id: orderRequests.id,
      userId: orderRequests.userId,
      affiliateId: orderRequests.affiliateId,
      originatorEmail: orderRequests.originatorEmail,
      originatorName: orderRequests.originatorName,
      requestNumber: orderRequests.requestNumber,
      status: orderRequests.status,
      createdAt: orderRequests.createdAt,
      confirmedAt: orderRequests.confirmedAt,
      paidAt: orderRequests.paidAt,
      sentToDistributorAt: orderRequests.sentToDistributorAt,
      totalAmount: orderRequests.totalAmount,
      taxAmount: orderRequests.taxAmount,
      freightQuoteCents: orderRequests.freightQuoteCents,
      lineItems: orderRequests.lineItems,
      qboInvoiceId: orderRequests.qboInvoiceId,
      styleName: orderRequests.styleName,
    }).from(orderRequests);
    const orders = await (site?.mode === "all" ? orderQuery : orderQuery.where(or(...filters)))
      .orderBy(desc(orderRequests.createdAt))
      .limit(100);

    const visible = orders.filter((order) => {
      if (site?.mode === "all") return true;
      if (site?.mode === "store") return rowBelongsToSite(order.affiliateId, site);
      return orderVisibleToViewer(
        { userId: order.userId, originatorEmail: order.originatorEmail, affiliateId: null },
        { ...viewer, affiliateCanSeeReferred: false, affiliateId: null },
      );
    });
    const ids = visible.map((order) => order.id);
    const shipments = ids.length
      ? await db.select({
        orderRequestId: orderShipments.orderRequestId,
        status: orderShipments.status,
        shippedAt: orderShipments.shippedAt,
        carrier: orderShipments.carrier,
        trackingNumber: orderShipments.trackingNumber,
      }).from(orderShipments).where(inArray(orderShipments.orderRequestId, ids))
      : [];

    const trailById = new Map<number, TrailRow>();
    if (ids.length) {
      try {
        const support = await readOrderSchemaSupport(db);
        const columns = TRAIL_COLUMNS.filter((column) => !support || columnPresent(support, "order_requests", column));
        if (columns.length > 0) {
          const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
          const columnList = sql.join(columns.map((column) => sql.raw(column)), sql`, `);
          const result = await db.execute(sql`SELECT id, ${columnList} FROM order_requests WHERE id IN (${idList})`);
          for (const row of rowsFrom(result)) {
            const id = Number(readField(row, "id"));
            if (!Number.isInteger(id)) continue;
            const entry: TrailRow = { id };
            for (const column of columns) {
              (entry as Record<string, unknown>)[column] = readField(row, column);
            }
            trailById.set(id, entry);
          }
        }
      } catch (error) {
        console.warn("[OrderTracking] Status columns are not readable yet", error instanceof Error ? error.message : "unknown error");
      }
    }

    return visible.map((order) => {
      const orderShipmentsForRow = shipments.filter((row) => row.orderRequestId === order.id);
      const trail = trailById.get(order.id);
      const input: CustomerOrderInput = {
        status: order.status,
        createdAt: order.createdAt,
        confirmedAt: order.confirmedAt,
        paidAt: order.paidAt,
        sentToDistributorAt: order.sentToDistributorAt,
        distributorEmailStatus: trail?.distributorEmailStatus ?? null,
        distributorEmailSentAt: trail?.distributorEmailSentAt ?? null,
        distributorEmailTo: trail?.distributorEmailTo ?? null,
        orderShippedAt: trail?.orderShippedAt ?? null,
        shipmentCarrier: trail?.shipmentCarrier ?? null,
        shipmentTracking: trail?.shipmentTracking ?? null,
        orderSignedAt: trail?.orderSignedAt ?? null,
        signerName: trail?.signerName ?? null,
        shipments: orderShipmentsForRow,
      };
      const lines = lineItemsOf(order.lineItems);
      const merchandise = lines.reduce((sum, line) => sum + (line.linePrice ?? 0), 0);
      const freight = (order.freightQuoteCents ?? 0) / 100;
      return {
        id: order.id,
        requestNumber: order.requestNumber,
        status: order.status,
        customerName: order.originatorName,
        customerEmail: order.originatorEmail,
        styleName: order.styleName,
        createdAt: order.createdAt,
        timeline: buildCustomerOrderTimeline(input),
        lines,
        invoice: {
          merchandise,
          tax: invoiceMoney(order.taxAmount),
          freight,
          total: invoiceMoney(order.totalAmount),
          qboInvoiceId: order.qboInvoiceId,
        },
      };
    });
  }),
});

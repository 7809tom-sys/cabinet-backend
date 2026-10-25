/**
 * QuickBooks Online tRPC router.
 * Exposes admin procedures for:
 *   - qbo.status     — check if QBO is connected
 *   - qbo.syncOrder  — push a single order as a QBO Invoice
 *   - qbo.syncAll    — push all unsynced orders (batch)
 */

import { z } from "zod";
import { eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { orderRequests, qboTokens, type OrderLineItem } from "../../drizzle/schema";
import { getQboAccessToken } from "../qboOAuth";

// ── QBO API helpers ────────────────────────────────────────────────────────────

const QBO_BASE = {
  production: "https://quickbooks.api.intuit.com",
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
};

async function qboApiPost(
  endpoint: string,
  body: unknown,
  accessToken: string,
  realmId: string,
  environment: "sandbox" | "production" = "production"
): Promise<unknown> {
  const base = QBO_BASE[environment] ?? QBO_BASE.production;
  const url = `${base}/v3/company/${realmId}/${endpoint}?minorversion=65`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`QBO API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

// Build a QBO Invoice payload from an order row.
function buildInvoicePayload(order: {
  requestNumber: string | null;
  originatorName: string | null;
  originatorEmail: string | null;
  lineItems: OrderLineItem[];
  totalAmount: string | null;
  taxAmount: string | null;
  taxState: string | null;
  taxRate: string | null;
  notes: string | null;
  createdAt: Date;
}) {
  const customerName = order.originatorName || order.originatorEmail || "Cabinet Dealz Customer";
  const lines = order.lineItems ?? [];
  const subtotal = parseFloat(order.totalAmount ?? "0") || 0;
  const taxAmt = parseFloat(order.taxAmount ?? "0") || 0;

  // Build line items — QBO requires at least one SalesItemLineDetail line.
  const qboLines = lines.length > 0
    ? lines.map((l: OrderLineItem) => ({
        DetailType: "SalesItemLineDetail",
        Amount: l.linePrice ?? (l.qty * (l.unitPrice ?? 0)),
        Description: `${l.description || l.masterCode}${l.doorStyle ? ` (${l.doorStyle})` : ""}`,
        SalesItemLineDetail: {
          Qty: l.qty,
          UnitPrice: l.unitPrice ?? 0,
          ItemRef: { value: "1", name: "Services" }, // fallback item ref
        },
      }))
    : [
        {
          DetailType: "SalesItemLineDetail",
          Amount: subtotal,
          Description: `Cabinet Order ${order.requestNumber}`,
          SalesItemLineDetail: {
            Qty: 1,
            UnitPrice: subtotal,
            ItemRef: { value: "1", name: "Services" },
          },
        },
      ];

  // Add tax line if applicable.
  if (taxAmt > 0) {
    qboLines.push({
      DetailType: "SalesItemLineDetail",
      Amount: taxAmt,
      Description: `Sales Tax (${order.taxState ?? ""} ${order.taxRate ? (parseFloat(order.taxRate) * 100).toFixed(2) + "%" : ""})`,
      SalesItemLineDetail: {
        Qty: 1,
        UnitPrice: taxAmt,
        ItemRef: { value: "1", name: "Services" },
      },
    });
  }

  return {
    DocNumber: order.requestNumber,
    TxnDate: new Date(order.createdAt).toISOString().slice(0, 10),
    CustomerRef: { name: customerName },
    Line: qboLines,
    PrivateNote: order.notes ?? undefined,
  };
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const qboRouter = router({
  // Check QBO connection status (reads from DB, not the OAuth endpoint).
  status: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return { connected: false };
    const rows = await db.select({
      realmId: qboTokens.realmId,
      connectedAt: qboTokens.connectedAt,
      refreshTokenExpiresAt: qboTokens.refreshTokenExpiresAt,
      environment: qboTokens.environment,
    }).from(qboTokens).limit(1);
    if (rows.length === 0) return { connected: false };
    const row = rows[0];
    const expired = new Date(row.refreshTokenExpiresAt) < new Date();
    return {
      connected: !expired,
      realmId: row.realmId,
      connectedAt: row.connectedAt,
      environment: row.environment,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt,
    };
  }),

  // Push a single order to QBO as an Invoice.
  syncOrder: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(orderRequests).where(eq(orderRequests.id, input.orderId)).limit(1);
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const order = rows[0];

      const tokenData = await getQboAccessToken();
      if (!tokenData) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "QuickBooks is not connected. Please connect in Admin → Settings → QuickBooks." });

      // Get environment from stored token row.
      const tokenRows = await db.select({ environment: qboTokens.environment }).from(qboTokens).limit(1);
      const environment = (tokenRows[0]?.environment ?? "production") as "sandbox" | "production";

      const payload = buildInvoicePayload({
        requestNumber: order.requestNumber,
        originatorName: order.originatorName,
        originatorEmail: order.originatorEmail,
        lineItems: (order.lineItems ?? []) as OrderLineItem[],
        totalAmount: order.totalAmount,
        taxAmount: order.taxAmount,
        taxState: order.taxState,
        taxRate: order.taxRate,
        notes: order.notes,
        createdAt: order.createdAt,
      });

      const result = await qboApiPost("invoice", payload, tokenData.accessToken, tokenData.realmId, environment) as { Invoice?: { Id?: string } };
      const invoiceId = result?.Invoice?.Id;
      if (!invoiceId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "QBO did not return an invoice ID." });

      await db.update(orderRequests).set({
        qboInvoiceId: invoiceId,
        qboSyncedAt: new Date(),
      }).where(eq(orderRequests.id, input.orderId));

      return { ok: true, invoiceId };
    }),

  // Batch: push all orders that haven't been synced yet.
  syncAll: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const tokenData = await getQboAccessToken();
    if (!tokenData) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "QuickBooks is not connected." });

    const tokenRows = await db.select({ environment: qboTokens.environment }).from(qboTokens).limit(1);
    const environment = (tokenRows[0]?.environment ?? "production") as "sandbox" | "production";

    const unsynced = await db.select().from(orderRequests).where(isNull(orderRequests.qboInvoiceId));
    let synced = 0;
    const errors: string[] = [];

    for (const order of unsynced) {
      try {
        const payload = buildInvoicePayload({
          requestNumber: order.requestNumber,
          originatorName: order.originatorName,
          originatorEmail: order.originatorEmail,
          lineItems: (order.lineItems ?? []) as OrderLineItem[],
          totalAmount: order.totalAmount,
          taxAmount: order.taxAmount,
          taxState: order.taxState,
          taxRate: order.taxRate,
          notes: order.notes,
          createdAt: order.createdAt,
        });
        const result = await qboApiPost("invoice", payload, tokenData.accessToken, tokenData.realmId, environment) as { Invoice?: { Id?: string } };
        const invoiceId = result?.Invoice?.Id;
        if (invoiceId) {
          await db.update(orderRequests).set({ qboInvoiceId: invoiceId, qboSyncedAt: new Date() }).where(eq(orderRequests.id, order.id));
          synced++;
        }
      } catch (err) {
        errors.push(`Order ${order.requestNumber}: ${(err as Error).message}`);
      }
    }

    return { synced, total: unsynced.length, errors };
  }),
});

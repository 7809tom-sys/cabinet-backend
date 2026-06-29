import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb, getPlatformPricingSettings } from "../db";
import { paymentSettings, payments, orderRequests } from "../../drizzle/schema";
import { computeFeeStack } from "@shared/pricing";
import { chargeOpaque, type AuthNetCredentials } from "../authorizeNet";

// Load the single payment_settings row (seeding an empty default row once).
async function loadSettingsRow() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(paymentSettings).limit(1);
  if (rows.length === 0) {
    await db.insert(paymentSettings).values({ provider: "authorizenet" });
    const seeded = await db.select().from(paymentSettings).limit(1);
    return seeded[0] ?? null;
  }
  return rows[0];
}

function credsFromRow(row: NonNullable<Awaited<ReturnType<typeof loadSettingsRow>>>): AuthNetCredentials | null {
  if (!row.apiLoginId || !row.transactionKey) return null;
  return {
    apiLoginId: row.apiLoginId,
    transactionKey: row.transactionKey,
    environment: row.environment,
  };
}

export const paymentsRouter = router({
  // ─── Admin: read settings (transaction key NEVER returned) ─────────────────
  adminGetSettings: adminProcedure.query(async () => {
    const row = await loadSettingsRow();
    if (!row) return null;
    return {
      enabled: row.enabled,
      environment: row.environment,
      apiLoginId: row.apiLoginId ?? "",
      clientKey: row.clientKey ?? "",
      // Only signal whether a transaction key is on file — never expose it.
      hasTransactionKey: Boolean(row.transactionKey),
      updatedAt: row.updatedAt,
    };
  }),

  // ─── Admin: save settings ──────────────────────────────────────────────────
  // transactionKey is optional: when omitted (or blank) we keep the stored key,
  // so the admin can re-save other fields without re-typing the secret.
  adminSaveSettings: adminProcedure
    .input(
      z.object({
        enabled: z.boolean().optional(),
        environment: z.enum(["sandbox", "production"]).optional(),
        apiLoginId: z.string().max(64).optional(),
        clientKey: z.string().max(128).optional(),
        transactionKey: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const row = await loadSettingsRow();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not load payment settings" });

      const set: Record<string, unknown> = { updatedByOpenId: ctx.user.openId };
      if (input.enabled !== undefined) set.enabled = input.enabled;
      if (input.environment !== undefined) set.environment = input.environment;
      if (input.apiLoginId !== undefined) set.apiLoginId = input.apiLoginId.trim() || null;
      if (input.clientKey !== undefined) set.clientKey = input.clientKey.trim() || null;
      // Only overwrite the secret when a non-empty value is provided.
      if (input.transactionKey !== undefined && input.transactionKey.trim() !== "") {
        set.transactionKey = input.transactionKey.trim();
      }
      await db.update(paymentSettings).set(set).where(eq(paymentSettings.id, row.id));
      return { success: true };
    }),

  // ─── Public: client-safe config for Accept.js ──────────────────────────────
  // Returns ONLY the public-facing pieces needed to load Accept.js in the
  // browser, and only when payments are enabled + fully configured. The secret
  // transaction key is never part of this payload.
  publicConfig: publicProcedure.query(async () => {
    const row = await loadSettingsRow();
    if (!row || !row.enabled || !row.apiLoginId || !row.clientKey || !row.transactionKey) {
      return { enabled: false as const };
    }
    return {
      enabled: true as const,
      environment: row.environment,
      apiLoginId: row.apiLoginId,
      clientKey: row.clientKey,
      // Accept.js script URL differs by environment.
      acceptJsUrl:
        row.environment === "production"
          ? "https://js.authorize.net/v1/Accept.js"
          : "https://jstest.authorize.net/v1/Accept.js",
    };
  }),

  // ─── Public: charge an order request 100% upfront (after freight) ──────────
  // The amount is RECOMPUTED on the server from the order's merchandise subtotal
  // + the fee stack + the attached freight, so the client cannot tamper with it.
  // Freight MUST be attached (freightCents > 0 from a real quote) before paying.
  charge: publicProcedure
    .input(
      z.object({
        orderRequestId: z.number().int(),
        // Opaque payment nonce from Accept.js (no raw card data).
        opaqueData: z.object({
          dataDescriptor: z.string().min(1).max(128),
          dataValue: z.string().min(1).max(8192),
        }),
        // The freight total (cents) attached to this order from a freight quote.
        freightCents: z.number().int().min(1, "A shipping quote must be attached before payment."),
        payer: z
          .object({
            name: z.string().max(256).optional(),
            email: z.string().email().max(320).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const row = await loadSettingsRow();
      const creds = row && row.enabled ? credsFromRow(row) : null;
      if (!row || !row.enabled || !creds) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Online payment is not configured yet." });
      }

      // Load the order request and derive the authoritative merchandise subtotal.
      const orderRows = await db
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.id, input.orderRequestId))
        .limit(1);
      const order = orderRows[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order request not found." });

      const merchandiseCents = Math.round(Number(order.totalAmount ?? 0) * 100);
      if (merchandiseCents <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This order has no priced line items to charge." });
      }

      // Recompute the fee stack + grand total on the server (card payment).
      // Tech fee is ONLY charged on affiliate-referred orders.
      const feeSettings = await getPlatformPricingSettings();
      const stack = computeFeeStack(
        {
          cabinetSubtotalCents: merchandiseCents,
          freightCents: input.freightCents,
          paymentMethod: "card",
          isAffiliateOrder: order.affiliateId != null,
        },
        feeSettings,
      );
      const amountCents = stack.totalCents;
      const feesCents = stack.damageFeeCents + stack.techFeeCents + stack.cardFeeCents;

      // Record a pending payment row first so every attempt is auditable.
      const insert = await db.insert(payments).values({
        orderRequestId: order.id,
        requestNumber: order.requestNumber,
        provider: "authorizenet",
        environment: creds.environment,
        status: "pending",
        amountCents,
        merchandiseCents,
        feesCents,
        freightCents: input.freightCents,
        payerName: input.payer?.name ?? order.originatorName ?? null,
        payerEmail: input.payer?.email ?? order.originatorEmail ?? null,
      });
      const paymentId = (insert as unknown as [{ insertId: number }])[0].insertId;

      let result;
      try {
        result = await chargeOpaque(creds, {
          amountCents,
          opaqueData: input.opaqueData,
          invoiceNumber: order.requestNumber,
          description: `Cabinet Dealz order ${order.requestNumber}`,
          customer: {
            name: input.payer?.name ?? order.originatorName ?? undefined,
            email: input.payer?.email ?? order.originatorEmail ?? undefined,
          },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Payment gateway unreachable.";
        await db.update(payments).set({ status: "error", message }).where(eq(payments.id, paymentId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not reach the payment gateway. Please try again." });
      }

      await db
        .update(payments)
        .set({
          status: result.status,
          transactionId: result.transactionId,
          authCode: result.authCode,
          responseCode: result.responseCode,
          avsResultCode: result.avsResultCode,
          cardLast4: result.cardLast4,
          cardType: result.cardType,
          message: result.message,
        })
        .where(eq(payments.id, paymentId));

      // On approval, mark the order request confirmed (paid upfront).
      if (result.status === "approved") {
        await db
          .update(orderRequests)
          .set({ status: "confirmed", confirmedAt: new Date() })
          .where(eq(orderRequests.id, order.id));
      }

      if (result.status !== "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.message || "The payment was declined.",
        });
      }

      return {
        success: true as const,
        paymentId,
        transactionId: result.transactionId,
        amountCents,
        breakdown: {
          merchandiseCents,
          damageFeeCents: stack.damageFeeCents,
          techFeeCents: stack.techFeeCents,
          freightCents: input.freightCents,
          cardFeeCents: stack.cardFeeCents,
          totalCents: amountCents,
        },
        cardLast4: result.cardLast4,
        cardType: result.cardType,
      };
    }),

  // ─── Admin: list payments (newest first) ───────────────────────────────────
  adminList: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(payments)
        .orderBy(desc(payments.createdAt))
        .limit(input?.limit ?? 100);
    }),
});

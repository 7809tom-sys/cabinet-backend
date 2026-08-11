import { and, desc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { affiliateInstallationEstimates, affiliateTeamMembers, affiliates, orderRequests } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { calculateInstallationEstimate } from "../../shared/installationEstimate";

const estimateLineSchema = z.object({
  description: z.string().trim().min(1).max(256),
  quantity: z.number().positive().max(10_000),
  unitCost: z.number().min(0).max(1_000_000),
});

const estimateInputSchema = z.object({
  affiliateId: z.number().int().positive().optional(),
  orderRequestId: z.number().int().positive().nullable().optional(),
  customerName: z.string().trim().max(256).nullable().optional(),
  customerEmail: z.string().trim().email().max(320).nullable().optional(),
  customerPhone: z.string().trim().max(32).nullable().optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  taxAmount: z.number().min(0).max(1_000_000).default(0),
  lineItems: z.array(estimateLineSchema).min(1).max(100),
});

type AuthUser = { id: number; email: string | null; role: string };

async function resolveAffiliateId(user: AuthUser, requestedAffiliateId?: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  if (user.role === "admin" && requestedAffiliateId) return requestedAffiliateId;
  const email = (user.email ?? "").toLowerCase();
  const rows = await db.select().from(affiliates);
  const direct = rows.find((affiliate) => affiliate.userId === user.id) ?? rows.find((affiliate) => (affiliate.email ?? "").toLowerCase() === email && email.length > 0);
  if (direct) return direct.id;

  const memberships = await db.select().from(affiliateTeamMembers).where(and(
    eq(affiliateTeamMembers.isActive, true),
    or(eq(affiliateTeamMembers.userId, user.id), ...(email ? [eq(affiliateTeamMembers.email, email)] : [])),
  ));
  if (memberships.length > 0 && memberships[0].accessCrm) return memberships[0].affiliateId;

  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to affiliate installation estimates." });
}

export const installationEstimatesRouter = router({
  list: protectedProcedure
    .input(z.object({ affiliateId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const affiliateId = await resolveAffiliateId(ctx.user, input?.affiliateId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(affiliateInstallationEstimates)
        .where(eq(affiliateInstallationEstimates.affiliateId, affiliateId))
        .orderBy(desc(affiliateInstallationEstimates.updatedAt));
    }),

  create: protectedProcedure
    .input(estimateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const affiliateId = await resolveAffiliateId(ctx.user, input.affiliateId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const totals = calculateInstallationEstimate(input.lineItems, input.taxAmount);
      const shareToken = crypto.randomUUID().replace(/-/g, "");
      const result = await db.insert(affiliateInstallationEstimates).values({
        affiliateId,
        shareToken,
        orderRequestId: input.orderRequestId ?? null,
        customerName: input.customerName || null,
        customerEmail: input.customerEmail || null,
        customerPhone: input.customerPhone || null,
        notes: input.notes || null,
        lineItems: totals.lineItems,
        subtotal: String(totals.subtotal),
        taxAmount: String(totals.taxAmount),
        totalAmount: String(totals.totalAmount),
      });
      return { id: Number((result as unknown as [{ insertId: number }])[0].insertId), shareToken, ...totals };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), affiliateId: z.number().int().positive().optional(), status: z.enum(["draft", "shared", "accepted", "cancelled"]) }))
    .mutation(async ({ ctx, input }) => {
      const affiliateId = await resolveAffiliateId(ctx.user, input.affiliateId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(affiliateInstallationEstimates).set({ status: input.status })
        .where(and(eq(affiliateInstallationEstimates.id, input.id), eq(affiliateInstallationEstimates.affiliateId, affiliateId)));
      return { success: true };
    }),

  customerDocument: publicProcedure
    .input(z.object({ token: z.string().length(32) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [estimate] = await db.select().from(affiliateInstallationEstimates)
        .where(and(eq(affiliateInstallationEstimates.shareToken, input.token), or(eq(affiliateInstallationEstimates.status, "shared"), eq(affiliateInstallationEstimates.status, "accepted"))))
        .limit(1);
      if (!estimate) throw new TRPCError({ code: "NOT_FOUND", message: "Installation document is not available." });
      const [affiliate] = await db.select({ storeName: affiliates.storeName, phone: affiliates.phone, email: affiliates.email, logoUrl: affiliates.logoUrl, primaryColor: affiliates.primaryColor })
        .from(affiliates).where(eq(affiliates.id, estimate.affiliateId)).limit(1);
      return { estimate, affiliate: affiliate ?? null };
    }),

  // The material-order confirmation can only reveal a separate installation
  // document when the caller supplies the exact order id AND the same customer
  // email that was submitted with that material order. Totals stay independent.
  forOrderConfirmation: publicProcedure
    .input(z.object({ orderRequestId: z.number().int().positive(), customerEmail: z.string().trim().email().max(320) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [order] = await db.select({ affiliateId: orderRequests.affiliateId })
        .from(orderRequests)
        .where(and(eq(orderRequests.id, input.orderRequestId), eq(orderRequests.originatorEmail, input.customerEmail)))
        .limit(1);
      if (!order?.affiliateId) return null;

      const [estimate] = await db.select({ shareToken: affiliateInstallationEstimates.shareToken, totalAmount: affiliateInstallationEstimates.totalAmount })
        .from(affiliateInstallationEstimates)
        .where(and(
          eq(affiliateInstallationEstimates.orderRequestId, input.orderRequestId),
          eq(affiliateInstallationEstimates.affiliateId, order.affiliateId),
          or(eq(affiliateInstallationEstimates.status, "shared"), eq(affiliateInstallationEstimates.status, "accepted")),
        ))
        .orderBy(desc(affiliateInstallationEstimates.updatedAt))
        .limit(1);
      return estimate?.shareToken ? estimate : null;
    }),
});

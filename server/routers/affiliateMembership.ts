import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { affiliates, affiliateInvoices } from "../../drizzle/schema";
import { computeMembershipPeriodEnd } from "@shared/salesPrograms";

const ANNUAL_FEE_CENTS = 119500; // $1,195.00

async function resolveMyAffiliate(ctx: { user: { id: number; email: string | null } }) {
  const db = await getDb();
  if (!db) return null;
  const email = (ctx.user.email ?? "").toLowerCase();
  const rows = await db.select().from(affiliates);
  const linked = rows.find((r) => r.userId === ctx.user.id);
  const emailMatches = email.length > 0
    ? rows.filter((r) => (r.email ?? "").toLowerCase() === email)
    : [];
  const mine = linked ?? (emailMatches.length === 1 ? emailMatches[0] : undefined);
  return mine ?? null;
}

// Human-friendly invoice number: AFF-<year>-<zero-padded id>.
function invoiceNumber(year: number, id: number) {
  return `AFF-${year}-${String(id).padStart(4, "0")}`;
}

/**
 * Ensure an affiliate has an OPEN invoice for their annual membership. If one
 * already exists, return it; otherwise create a fresh $1,195 open invoice.
 * Idempotent per affiliate (only one open invoice at a time).
 */
async function ensureOpenInvoice(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  affiliateId: number,
) {
  const open = (
    await db
      .select()
      .from(affiliateInvoices)
      .where(and(eq(affiliateInvoices.affiliateId, affiliateId), eq(affiliateInvoices.status, "open")))
      .orderBy(desc(affiliateInvoices.issuedAt))
      .limit(1)
  )[0];
  if (open) return open;

  // Temporary unique placeholder so the unique constraint is satisfied on insert,
  // then patch with the real number derived from the generated id.
  const placeholder = `AFF-TMP-${affiliateId}-${Date.now()}`;
  const res = await db.insert(affiliateInvoices).values({
    affiliateId,
    invoiceNumber: placeholder,
    description: "Annual affiliate membership",
    amountCents: ANNUAL_FEE_CENTS,
    status: "open",
    paymentMethod: "none",
  });
  const id = (res as unknown as [{ insertId: number }])[0].insertId;
  const num = invoiceNumber(new Date().getFullYear(), id);
  await db.update(affiliateInvoices).set({ invoiceNumber: num }).where(eq(affiliateInvoices.id, id));
  return (await db.select().from(affiliateInvoices).where(eq(affiliateInvoices.id, id)).limit(1))[0];
}

export const affiliateMembershipRouter = router({
  // ─── Partner: my membership status + invoices ──────────────────────────────
  myMembership: protectedProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return null;
    const db = await getDb();
    if (!db) return null;
    const invoices = await db
      .select()
      .from(affiliateInvoices)
      .where(eq(affiliateInvoices.affiliateId, mine.id))
      .orderBy(desc(affiliateInvoices.issuedAt));
    return {
      affiliateId: mine.id,
      storeName: mine.storeName,
      membershipStatus: mine.membershipStatus,
      membershipFeeCents: mine.membershipFeeCents,
      membershipPaidAt: mine.membershipPaidAt,
      membershipExpiresAt: mine.membershipExpiresAt,
      invoices,
    };
  }),

  // ─── Partner: generate (or fetch) my open annual invoice ───────────────────
  requestInvoice: protectedProcedure.mutation(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const invoice = await ensureOpenInvoice(db, mine.id);
    return invoice;
  }),

  // ─── Admin: list all invoices (optionally by status) ───────────────────────
  adminListInvoices: adminProcedure
    .input(z.object({ status: z.enum(["open", "paid", "void", "all"]).default("all") }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const status = input?.status ?? "all";
      const rows = await db
        .select()
        .from(affiliateInvoices)
        .orderBy(desc(affiliateInvoices.issuedAt))
        .limit(1000);
      return status === "all" ? rows : rows.filter((r) => r.status === status);
    }),

  // ─── Admin: create an open invoice for an affiliate ────────────────────────
  adminCreateInvoice: adminProcedure
    .input(z.object({ affiliateId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const invoice = await ensureOpenInvoice(db, input.affiliateId);
      return invoice;
    }),

  // ─── Admin: record a payment (Stripe / external card / manual) ─────────────
  // Marks the invoice paid and activates the membership for a 1-year term from
  // today (or extends from the current expiry if still active).
  adminMarkPaid: adminProcedure
    .input(
      z.object({
        invoiceId: z.number().int(),
        paymentMethod: z.enum(["stripe", "external_card", "manual"]),
        paymentRef: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const inv = (
        await db.select().from(affiliateInvoices).where(eq(affiliateInvoices.id, input.invoiceId)).limit(1)
      )[0];
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
      if (inv.status === "paid") return { ok: true, alreadyPaid: true };

      const aff = (
        await db.select().from(affiliates).where(eq(affiliates.id, inv.affiliateId)).limit(1)
      )[0];
      const now = new Date();
      // Extend from current expiry if it is in the future, else from now
      // (shared rule: early renewals stack and never lose remaining days).
      const periodEnd = new Date(
        computeMembershipPeriodEnd(
          now.getTime(),
          aff?.membershipExpiresAt ? aff.membershipExpiresAt.getTime() : null,
        ),
      );

      await db
        .update(affiliateInvoices)
        .set({
          status: "paid",
          paymentMethod: input.paymentMethod,
          paymentRef: input.paymentRef ?? null,
          paidAt: now,
          paidByUserId: ctx.user.id,
          periodStart: now,
          periodEnd,
        })
        .where(eq(affiliateInvoices.id, inv.id));

      await db
        .update(affiliates)
        .set({
          membershipStatus: "active",
          membershipPaidAt: now,
          membershipExpiresAt: periodEnd,
        })
        .where(eq(affiliates.id, inv.affiliateId));

      return { ok: true, periodEnd };
    }),

  // ─── Admin: void an invoice ────────────────────────────────────────────────
  adminVoidInvoice: adminProcedure
    .input(z.object({ invoiceId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.update(affiliateInvoices).set({ status: "void" }).where(eq(affiliateInvoices.id, input.invoiceId));
      return { ok: true };
    }),
});

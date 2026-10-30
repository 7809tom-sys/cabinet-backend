import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { affiliateContractorMarkups, contractorAccessRequests, users } from "../../drizzle/schema";
import { getDb, getPricingSettings } from "../db";
import {
  isAffiliateContractorMarkupPercent,
  markupBpsToPercent,
  markupPercentToBps,
  siteContractorMarkupPercent,
} from "../../shared/affiliateContractorMarkup";
import {
  canManageAffiliateContractorDesk,
  canReviewAffiliateContractorRequest,
  contractorRequestSource,
  findPendingDuplicate,
  isAffiliateRole,
  normalizeContractorEmail,
  type ContractorRequestIdentity,
} from "../lib/contractorAccessPolicy";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

const STATUSES = ["pending", "approved", "rejected"] as const;
const requestSubmitter = alias(users, "contractorAccessSubmitter");

const businessNameSchema = z.string().trim().min(2).max(256);
const phoneSchema = z.string().trim().min(7).max(32);
const licenseNumberSchema = z.string().trim().max(64).nullable().optional();

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function insertedId(result: unknown): number {
  return Number((result as [{ insertId: number }])[0].insertId);
}

async function findPendingRequest(
  db: Database,
  key: { userId: number | null; contractorEmail: string | null },
): Promise<ContractorRequestIdentity | null> {
  const byUser = key.userId != null
    ? and(
      eq(contractorAccessRequests.userId, key.userId),
      eq(contractorAccessRequests.status, "pending"),
    )
    : undefined;
  const byEmail = key.contractorEmail
    ? and(
      eq(contractorAccessRequests.contractorEmail, key.contractorEmail),
      eq(contractorAccessRequests.status, "pending"),
    )
    : undefined;
  const whereClause = byUser && byEmail ? or(byUser, byEmail) : byUser ?? byEmail;
  if (!whereClause) return null;
  const rows = await db.select({
    id: contractorAccessRequests.id,
    userId: contractorAccessRequests.userId,
    contractorEmail: contractorAccessRequests.contractorEmail,
    status: contractorAccessRequests.status,
  }).from(contractorAccessRequests).where(whereClause);
  return findPendingDuplicate(rows, key);
}

async function userForContractorEmail(db: Database, email: string) {
  const [matched] = await db.select({
    id: users.id,
    role: users.role,
  }).from(users).where(or(
    eq(users.emailLower, email),
    sql`lower(${users.email}) = ${email}`,
  )).limit(1);
  return matched ?? null;
}

function requireAffiliateDesk(role: string) {
  if (!canManageAffiliateContractorDesk(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only affiliate and admin accounts can add a contractor.",
    });
  }
}

function requireAffiliateMarkupAccess(role: string) {
  if (role !== "admin" && !isAffiliateRole(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an affiliate can set contractor markup.",
    });
  }
}

/** Admins may pass affiliateUserId. Everyone else is limited to their own user id. */
function markupAffiliateUserId(user: { id: number; role: string }, affiliateUserId?: number): number {
  requireAffiliateMarkupAccess(user.role);
  if (affiliateUserId != null && affiliateUserId !== user.id && user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only change your own contractor markup.",
    });
  }
  return user.role === "admin" && affiliateUserId != null ? affiliateUserId : user.id;
}

type AccessRequest = typeof contractorAccessRequests.$inferSelect;

async function applyContractorAccessDecision(
  db: Database,
  request: AccessRequest,
  decision: "approved" | "rejected",
  reviewerUserId: number,
) {
  if (request.userId != null) {
    const [account] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, request.userId)).limit(1);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
    if (decision === "approved") {
      if (account.role !== "user" && account.role !== "contractor") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This account already has a staff or affiliate role." });
      }
      if (account.role === "user") {
        await db.update(users).set({ role: "contractor" }).where(eq(users.id, account.id));
      }
    }
  }
  await db.update(contractorAccessRequests).set({
    status: decision,
    reviewedByUserId: reviewerUserId,
    reviewedAt: new Date(),
  }).where(eq(contractorAccessRequests.id, request.id));
  return { ok: true as const, status: decision };
}

export const contractorAccessRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(contractorAccessRequests)
      .where(eq(contractorAccessRequests.userId, ctx.user.id))
      .orderBy(desc(contractorAccessRequests.createdAt))
      .limit(1);
    return row ?? null;
  }),
  // Named submit, not apply: tRPC reserves apply for the procedure proxy.
  submit: protectedProcedure.input(z.object({
    businessName: businessNameSchema,
    phone: phoneSchema,
    licenseNumber: licenseNumberSchema,
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role === "contractor") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This account is already an approved contractor." });
    }
    if (ctx.user.role !== "user") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate and staff accounts keep their current role." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const pending = await findPendingRequest(db, {
      userId: ctx.user.id,
      contractorEmail: normalizeContractorEmail(ctx.user.email),
    });
    if (pending) {
      // An affiliate may have filed this before the contractor had an account.
      // Attach the account so approval can grant the role on this row.
      if (pending.userId == null) {
        await db.update(contractorAccessRequests).set({ userId: ctx.user.id }).where(and(
          eq(contractorAccessRequests.id, pending.id),
          isNull(contractorAccessRequests.userId),
        ));
      }
      return { id: pending.id, status: "pending" as const };
    }
    const result = await db.insert(contractorAccessRequests).values({
      userId: ctx.user.id,
      businessName: input.businessName,
      phone: input.phone,
      licenseNumber: input.licenseNumber || null,
      status: "pending",
    });
    return { id: insertedId(result), status: "pending" as const };
  }),
  submitForContractor: protectedProcedure.input(z.object({
    contractorName: z.string().trim().min(2).max(256),
    contractorEmail: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
    businessName: businessNameSchema,
    phone: phoneSchema,
    licenseNumber: licenseNumberSchema,
  })).mutation(async ({ ctx, input }) => {
    requireAffiliateDesk(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const email = normalizeContractorEmail(input.contractorEmail);
    if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "A contractor email is required." });
    const matched = await userForContractorEmail(db, email);
    if (matched?.role === "contractor") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This account is already an approved contractor." });
    }
    const pending = await findPendingRequest(db, {
      userId: matched?.id ?? null,
      contractorEmail: email,
    });
    if (pending) return { id: pending.id, status: "pending" as const, duplicate: true };
    const result = await db.insert(contractorAccessRequests).values({
      userId: matched?.id ?? null,
      submittedByUserId: ctx.user.id,
      contractorName: input.contractorName,
      contractorEmail: email,
      businessName: input.businessName,
      phone: input.phone,
      licenseNumber: input.licenseNumber || null,
      status: "pending",
    });
    return { id: insertedId(result), status: "pending" as const, duplicate: false };
  }),
  myAffiliateRequests: protectedProcedure.query(async ({ ctx }) => {
    requireAffiliateDesk(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      id: contractorAccessRequests.id,
      contractorName: contractorAccessRequests.contractorName,
      contractorEmail: contractorAccessRequests.contractorEmail,
      businessName: contractorAccessRequests.businessName,
      phone: contractorAccessRequests.phone,
      licenseNumber: contractorAccessRequests.licenseNumber,
      status: contractorAccessRequests.status,
      createdAt: contractorAccessRequests.createdAt,
      reviewedAt: contractorAccessRequests.reviewedAt,
      userId: contractorAccessRequests.userId,
      submittedByUserId: contractorAccessRequests.submittedByUserId,
    }).from(contractorAccessRequests)
      .where(eq(contractorAccessRequests.submittedByUserId, ctx.user.id))
      .orderBy(desc(contractorAccessRequests.createdAt));
    return rows
      .filter((row) => row.submittedByUserId === ctx.user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((row) => ({
        id: row.id,
        contractorName: row.contractorName,
        contractorEmail: row.contractorEmail,
        businessName: row.businessName,
        phone: row.phone,
        licenseNumber: row.licenseNumber,
        status: row.status,
        createdAt: row.createdAt,
        reviewedAt: row.reviewedAt,
        hasAccount: row.userId != null,
        submittedByUserId: row.submittedByUserId,
      }));
  }),
  list: adminProcedure.input(z.object({
    status: z.enum(STATUSES).optional(),
    submittedByUserId: z.number().int().positive().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      id: contractorAccessRequests.id,
      userId: contractorAccessRequests.userId,
      businessName: contractorAccessRequests.businessName,
      phone: contractorAccessRequests.phone,
      licenseNumber: contractorAccessRequests.licenseNumber,
      status: contractorAccessRequests.status,
      createdAt: contractorAccessRequests.createdAt,
      email: users.email,
      name: users.name,
      role: users.role,
      submittedByUserId: contractorAccessRequests.submittedByUserId,
      submittedByName: requestSubmitter.name,
      submittedByEmail: requestSubmitter.email,
      contractorName: contractorAccessRequests.contractorName,
      contractorEmail: contractorAccessRequests.contractorEmail,
    }).from(contractorAccessRequests)
      .leftJoin(users, eq(users.id, contractorAccessRequests.userId))
      .leftJoin(requestSubmitter, eq(requestSubmitter.id, contractorAccessRequests.submittedByUserId))
      .orderBy(desc(contractorAccessRequests.createdAt));
    return rows
      .filter((row) => (input?.status ? row.status === input.status : true))
      .filter((row) => (input?.submittedByUserId != null ? row.submittedByUserId === input.submittedByUserId : true))
      .map((row) => ({
        id: row.id,
        userId: row.userId,
        businessName: row.businessName,
        phone: row.phone,
        licenseNumber: row.licenseNumber,
        status: row.status,
        createdAt: row.createdAt,
        email: row.email,
        name: row.name,
        role: row.role,
        source: contractorRequestSource(row.submittedByUserId),
        submittedByUserId: row.submittedByUserId ?? null,
        submittedByName: row.submittedByName ?? null,
        submittedByEmail: row.submittedByEmail ?? null,
        contractorName: row.contractorName ?? null,
        contractorEmail: row.contractorEmail ?? null,
      }));
  }),
  review: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    decision: z.enum(["approved", "rejected"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [request] = await db.select().from(contractorAccessRequests).where(eq(contractorAccessRequests.id, input.id)).limit(1);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
    return applyContractorAccessDecision(db, request, input.decision, ctx.user.id);
  }),
  affiliateReview: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    decision: z.enum(["approved", "rejected"]),
  })).mutation(async ({ ctx, input }) => {
    if (!canReviewAffiliateContractorRequest(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only an affiliate can review contractors they submitted.",
      });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [request] = await db.select().from(contractorAccessRequests).where(eq(contractorAccessRequests.id, input.id)).limit(1);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
    if (ctx.user.role !== "admin" && request.submittedByUserId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only review contractors you submitted.",
      });
    }
    if (request.status !== "pending") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only a pending request can be reviewed.",
      });
    }
    return applyContractorAccessDecision(db, request, input.decision, ctx.user.id);
  }),
  affiliateMarkup: protectedProcedure.input(z.object({
    affiliateUserId: z.number().int().positive().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const affiliateUserId = markupAffiliateUserId(ctx.user, input?.affiliateUserId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const settings = await getPricingSettings();
    const [row] = await db.select({ markupBps: affiliateContractorMarkups.markupBps })
      .from(affiliateContractorMarkups)
      .where(eq(affiliateContractorMarkups.affiliateUserId, affiliateUserId))
      .limit(1);
    return {
      markupPercent: row ? markupBpsToPercent(row.markupBps) : null,
      siteDefaultPercent: siteContractorMarkupPercent(settings.contractorMarkupBps),
    };
  }),
  setAffiliateMarkup: protectedProcedure.input(z.object({
    affiliateUserId: z.number().int().positive().optional(),
    markupPercent: z.number().nullable().superRefine((value, ctx) => {
      if (value == null) return;
      if (!isAffiliateContractorMarkupPercent(value)) {
        ctx.addIssue({
          code: "custom",
          message: "Markup percent must be from 0 to 200 with at most 2 decimal places.",
        });
      }
    }),
  })).mutation(async ({ ctx, input }) => {
    const affiliateUserId = markupAffiliateUserId(ctx.user, input.affiliateUserId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    if (input.markupPercent == null) {
      await db.delete(affiliateContractorMarkups)
        .where(eq(affiliateContractorMarkups.affiliateUserId, affiliateUserId));
    } else {
      const markupBps = markupPercentToBps(input.markupPercent);
      await db.insert(affiliateContractorMarkups).values({
        affiliateUserId,
        markupBps,
        updatedByUserId: ctx.user.id,
      }).onDuplicateKeyUpdate({
        set: { markupBps, updatedByUserId: ctx.user.id },
      });
    }
    const settings = await getPricingSettings();
    return {
      markupPercent: input.markupPercent,
      siteDefaultPercent: siteContractorMarkupPercent(settings.contractorMarkupBps),
    };
  }),
});

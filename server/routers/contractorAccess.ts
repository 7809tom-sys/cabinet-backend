import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { affiliateContractorMarkups, affiliates, contractorAccessRequests, users } from "../../drizzle/schema";
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
import { DIRECT_STORE_NAME } from "@shared/customerDirectory";
import { affiliateIdFromStoreScope, listAccessibleAffiliateIds, resolveAffiliateSiteScope, resolveContractorSubmitAffiliateId, rowBelongsToSite } from "../lib/affiliateSiteScope";
import { queryOrLogMissingColumn } from "../lib/signupAffiliateStamp";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

const STATUSES = ["pending", "approved", "rejected"] as const;
const requestSubmitter = alias(users, "contractorAccessSubmitter");
const requestStore = alias(affiliates, "contractorAccessStore");

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

/** Store for this markup. A login with several stores must name one. No store keeps the legacy user key. */
async function markupTarget(
  db: Database,
  user: { id: number; email: string | null; role: string },
  input?: { affiliateUserId?: number; affiliateId?: number; slug?: string },
): Promise<{ affiliateUserId: number; affiliateId: number | null }> {
  const affiliateUserId = markupAffiliateUserId(user, input?.affiliateUserId);
  const subject = user.role === "admin" && input?.affiliateUserId != null
    ? { id: input.affiliateUserId, email: null, role: "partner" }
    : user;
  let affiliateId = input?.affiliateId ?? null;
  if (input?.slug) affiliateId = await affiliateIdFromStoreScope(db, input.slug);
  const accessible = await listAccessibleAffiliateIds(db, subject);
  if (affiliateId == null && accessible.length === 1) affiliateId = accessible[0];
  if (affiliateId == null && accessible.length > 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose which affiliate store to view." });
  }
  if (affiliateId != null && user.role !== "admin" && !accessible.includes(affiliateId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can only change your own contractor markup." });
  }
  return { affiliateUserId, affiliateId };
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
    storeScope: z.string().trim().min(1).max(64).optional(),
    slug: z.string().trim().min(1).max(64).optional(),
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
    const affiliateId = await affiliateIdFromStoreScope(db, input.storeScope ?? input.slug);
    const result = await db.insert(contractorAccessRequests).values({
      userId: ctx.user.id,
      affiliateId,
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
    affiliateId: z.number().int().positive().optional(),
    slug: z.string().trim().min(1).max(64).optional(),
    storeScope: z.string().trim().min(1).max(64).optional(),
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
    const affiliateId = await resolveContractorSubmitAffiliateId(db, ctx.user, {
      affiliateId: input.affiliateId,
      slug: input.slug,
      storeScope: input.storeScope,
    });
    const result = await db.insert(contractorAccessRequests).values({
      userId: matched?.id ?? null,
      submittedByUserId: ctx.user.id,
      affiliateId,
      contractorName: input.contractorName,
      contractorEmail: email,
      businessName: input.businessName,
      phone: input.phone,
      licenseNumber: input.licenseNumber || null,
      status: "pending",
    });
    return { id: insertedId(result), status: "pending" as const, duplicate: false };
  }),
  myAffiliateRequests: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().optional(),
      slug: z.string().trim().min(1).max(64).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
    requireAffiliateDesk(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    const scope = await resolveAffiliateSiteScope(db, ctx.user, input ?? undefined);
    const requestQuery = db.select({
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
      affiliateId: contractorAccessRequests.affiliateId,
    }).from(contractorAccessRequests);
    const rows = scope.mode === "store"
      ? await requestQuery.where(eq(contractorAccessRequests.affiliateId, scope.affiliateId)).orderBy(desc(contractorAccessRequests.createdAt))
      : await requestQuery.orderBy(desc(contractorAccessRequests.createdAt));
    return rows
      .filter((row) => rowBelongsToSite(row.affiliateId, scope))
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
    affiliateId: z.number().int().positive().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await queryOrLogMissingColumn("contractorAccess.list", () => db.select({
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
      affiliateId: contractorAccessRequests.affiliateId,
      ownerStoreName: requestStore.storeName,
    }).from(contractorAccessRequests)
      .leftJoin(users, eq(users.id, contractorAccessRequests.userId))
      .leftJoin(requestSubmitter, eq(requestSubmitter.id, contractorAccessRequests.submittedByUserId))
      .leftJoin(requestStore, eq(requestStore.id, contractorAccessRequests.affiliateId))
      .orderBy(desc(contractorAccessRequests.createdAt)));
    return rows
      .filter((row) => (input?.status ? row.status === input.status : true))
      .filter((row) => (input?.submittedByUserId != null ? row.submittedByUserId === input.submittedByUserId : true))
      .filter((row) => (input?.affiliateId != null ? row.affiliateId === input.affiliateId : true))
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
        affiliateId: row.affiliateId ?? null,
        ownerAffiliateId: row.affiliateId ?? null,
        ownerStoreName: row.affiliateId == null ? DIRECT_STORE_NAME : (row.ownerStoreName ?? `Affiliate #${row.affiliateId}`),
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
    affiliateId: z.number().int().positive().optional(),
    adminAll: z.literal(true).optional(),
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
    if (ctx.user.role !== "admin") {
      const submittedByCaller = request.submittedByUserId === ctx.user.id;
      let storeMatch = false;
      if (request.affiliateId != null) {
        try {
          const scope = await resolveAffiliateSiteScope(db, ctx.user, { affiliateId: request.affiliateId });
          storeMatch = scope.mode === "store" && scope.affiliateId === request.affiliateId;
        } catch {
          storeMatch = false;
        }
      }
      if (!submittedByCaller && !storeMatch) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only review contractors for this store.",
        });
      }
    } else if (!input.adminAll && request.affiliateId != null) {
      if (input.affiliateId != null && input.affiliateId !== request.affiliateId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only review contractors for this store." });
      }
      if (input.affiliateId == null) {
        const accessible = await listAccessibleAffiliateIds(db, ctx.user);
        const ownStore = accessible.length === 1 && accessible[0] === request.affiliateId;
        if (!ownStore) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Open the admin directory to review every store." });
        }
      }
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
    affiliateId: z.number().int().positive().optional(),
    slug: z.string().trim().min(1).max(64).optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const target = await markupTarget(db, ctx.user, input);
    const settings = await getPricingSettings();
    const markupRows = await db.select({
      markupBps: affiliateContractorMarkups.markupBps,
      affiliateId: affiliateContractorMarkups.affiliateId,
      affiliateUserId: affiliateContractorMarkups.affiliateUserId,
    }).from(affiliateContractorMarkups).where(target.affiliateId != null
      ? eq(affiliateContractorMarkups.affiliateId, target.affiliateId)
      : eq(affiliateContractorMarkups.affiliateUserId, target.affiliateUserId));
    const row = markupRows.find((item) => (
      target.affiliateId != null
        ? item.affiliateId === target.affiliateId || (item.affiliateId == null && item.affiliateUserId === target.affiliateUserId)
        : item.affiliateUserId === target.affiliateUserId
    )) ?? markupRows[0];
    return {
      markupPercent: row ? markupBpsToPercent(row.markupBps) : null,
      siteDefaultPercent: siteContractorMarkupPercent(settings.contractorMarkupBps),
    };
  }),
  setAffiliateMarkup: protectedProcedure.input(z.object({
    affiliateUserId: z.number().int().positive().optional(),
    affiliateId: z.number().int().positive().optional(),
    slug: z.string().trim().min(1).max(64).optional(),
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
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const target = await markupTarget(db, ctx.user, input);
    if (input.markupPercent == null) {
      await db.delete(affiliateContractorMarkups)
        .where(target.affiliateId != null
          ? eq(affiliateContractorMarkups.affiliateId, target.affiliateId)
          : eq(affiliateContractorMarkups.affiliateUserId, target.affiliateUserId));
    } else {
      const markupBps = markupPercentToBps(input.markupPercent);
      await db.insert(affiliateContractorMarkups).values({
        affiliateUserId: target.affiliateUserId,
        affiliateId: target.affiliateId,
        markupBps,
        updatedByUserId: ctx.user.id,
      }).onDuplicateKeyUpdate({
        set: { markupBps, updatedByUserId: ctx.user.id, affiliateId: target.affiliateId, affiliateUserId: target.affiliateUserId },
      });
    }
    const settings = await getPricingSettings();
    return {
      markupPercent: input.markupPercent,
      siteDefaultPercent: siteContractorMarkupPercent(settings.contractorMarkupBps),
    };
  }),
});

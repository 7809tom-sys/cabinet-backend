import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  affiliates,
  customerNotices,
  customerProjectDesigns,
  customerProjectQuotes,
  customerProjects,
  customerQuoteRevisions,
  kitchenDesignRevisions,
  kitchenDesigns,
  orderRequests,
  users,
} from "../../drizzle/schema";
import { canDeleteCustomerDesign, canEditCustomerProject, normalizeEmail } from "@shared/customerDirectory";
import { planRevert, snapshotDesign } from "@shared/designAssist";

const projectStatus = z.enum(["planning", "active", "quoted", "completed", "archived"]);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

async function affiliateForSlug(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, slug: string) {
  const [affiliate] = await db.select({ id: affiliates.id, slug: affiliates.slug, storeName: affiliates.storeName }).from(affiliates).where(eq(affiliates.slug, slug)).limit(1);
  if (!affiliate) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found." });
  return affiliate;
}

async function ownedProject(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, projectId: number) {
  const [project] = await db.select().from(customerProjects).where(eq(customerProjects.id, projectId)).limit(1);
  if (!project || !canEditCustomerProject(userId, project.userId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  }
  return project;
}

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { insertId?: number } | undefined)?.insertId ?? 0);
}

export const customerAccountRouter = router({
  overview: protectedProcedure
    .input(z.object({ slug: z.string().trim().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const affiliate = await affiliateForSlug(db, input.slug);
      const [profile] = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        companyName: users.companyName,
        pricingTier: users.pricingTier,
      }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const designs = await db.select({
        id: kitchenDesigns.id,
        name: kitchenDesigns.name,
        thumbnailUrl: kitchenDesigns.thumbnailUrl,
        assistLabel: kitchenDesigns.assistLabel,
        recordKind: kitchenDesigns.recordKind,
        suggestionOfDesignId: kitchenDesigns.suggestionOfDesignId,
        updatedAt: kitchenDesigns.updatedAt,
        createdAt: kitchenDesigns.createdAt,
        projectName: kitchenDesigns.projectName,
      }).from(kitchenDesigns).where(and(eq(kitchenDesigns.userId, ctx.user.id), eq(kitchenDesigns.affiliateId, affiliate.id)));
      const email = normalizeEmail(ctx.user.email);
      const ownOrders = await db.select().from(orderRequests).where(and(eq(orderRequests.userId, ctx.user.id), eq(orderRequests.affiliateId, affiliate.id)));
      const emailOrders = email
        ? await db.select().from(orderRequests).where(and(eq(orderRequests.originatorEmail, email), eq(orderRequests.affiliateId, affiliate.id)))
        : [];
      const orders = [...ownOrders, ...emailOrders.filter((order) => !ownOrders.some((own) => own.id === order.id))];
      const projects = await db.select().from(customerProjects).where(and(eq(customerProjects.userId, ctx.user.id), eq(customerProjects.affiliateId, affiliate.id))).orderBy(desc(customerProjects.updatedAt));
      const projectIds = projects.map((project) => project.id);
      const designLinks = projectIds.length ? await db.select().from(customerProjectDesigns).where(inArray(customerProjectDesigns.projectId, projectIds)) : [];
      const quoteLinks = projectIds.length ? await db.select().from(customerProjectQuotes).where(inArray(customerProjectQuotes.projectId, projectIds)) : [];
      const designIds = designs.map((design) => design.id);
      const revisions = designIds.length ? await db.select().from(kitchenDesignRevisions).where(inArray(kitchenDesignRevisions.kitchenDesignId, designIds)).orderBy(desc(kitchenDesignRevisions.createdAt)) : [];
      const notices = await db.select().from(customerNotices).where(eq(customerNotices.userId, ctx.user.id)).orderBy(desc(customerNotices.createdAt)).limit(20);
      const orderIds = orders.map((order) => order.id);
      const revisionRequests = orderIds.length ? await db.select().from(customerQuoteRevisions).where(inArray(customerQuoteRevisions.orderRequestId, orderIds)) : [];
      return { profile, affiliate, designs, orders, projects, designLinks, quoteLinks, revisions, notices, revisionRequests };
    }),

  setAccountType: protectedProcedure
    .input(z.object({
      accountType: z.enum(["homeowner", "contractor"]),
      companyName: z.string().trim().max(200).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(users).set({
        pricingTier: input.accountType,
        companyName: input.companyName ?? null,
      }).where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),

  createProject: protectedProcedure
    .input(z.object({
      slug: z.string().trim().min(1).max(64),
      name: z.string().trim().min(1).max(256),
      jobSiteAddress: z.string().trim().max(512).nullable().optional(),
      clientName: z.string().trim().max(256).nullable().optional(),
      notes: z.string().trim().max(8000).nullable().optional(),
      status: projectStatus.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const affiliate = await affiliateForSlug(db, input.slug);
      const result = await db.insert(customerProjects).values({
        userId: ctx.user.id,
        affiliateId: affiliate.id,
        name: input.name,
        jobSiteAddress: input.jobSiteAddress ?? null,
        clientName: input.clientName ?? null,
        notes: input.notes ?? null,
        status: input.status ?? "planning",
      });
      return { id: insertId(result) };
    }),

  updateProject: protectedProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      name: z.string().trim().min(1).max(256).optional(),
      jobSiteAddress: z.string().trim().max(512).nullable().optional(),
      clientName: z.string().trim().max(256).nullable().optional(),
      notes: z.string().trim().max(8000).nullable().optional(),
      status: projectStatus.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ownedProject(db, ctx.user.id, input.projectId);
      await db.update(customerProjects).set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.jobSiteAddress !== undefined ? { jobSiteAddress: input.jobSiteAddress } : {}),
        ...(input.clientName !== undefined ? { clientName: input.clientName } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      }).where(eq(customerProjects.id, input.projectId));
      return { ok: true };
    }),

  deleteProject: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ownedProject(db, ctx.user.id, input.projectId);
      await db.delete(customerProjectDesigns).where(eq(customerProjectDesigns.projectId, input.projectId));
      await db.delete(customerProjectQuotes).where(eq(customerProjectQuotes.projectId, input.projectId));
      await db.delete(customerProjects).where(and(eq(customerProjects.id, input.projectId), eq(customerProjects.userId, ctx.user.id)));
      return { ok: true };
    }),

  moveDesign: protectedProcedure
    .input(z.object({
      designId: z.number().int().positive(),
      projectId: z.number().int().positive().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [design] = await db.select({ id: kitchenDesigns.id, userId: kitchenDesigns.userId }).from(kitchenDesigns).where(eq(kitchenDesigns.id, input.designId)).limit(1);
      if (!design || !canDeleteCustomerDesign(ctx.user.id, design.userId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });
      }
      if (input.projectId != null) await ownedProject(db, ctx.user.id, input.projectId);
      await db.delete(customerProjectDesigns).where(eq(customerProjectDesigns.kitchenDesignId, input.designId));
      if (input.projectId != null) {
        await db.insert(customerProjectDesigns).values({ projectId: input.projectId, kitchenDesignId: input.designId });
      }
      return { ok: true };
    }),

  moveQuote: protectedProcedure
    .input(z.object({
      orderRequestId: z.number().int().positive(),
      projectId: z.number().int().positive().nullable(),
      slug: z.string().trim().min(1).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const affiliate = await affiliateForSlug(db, input.slug);
      const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, input.orderRequestId)).limit(1);
      const email = normalizeEmail(ctx.user.email);
      const owns = order && order.affiliateId === affiliate.id && (order.userId === ctx.user.id || (email != null && normalizeEmail(order.originatorEmail) === email));
      if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found." });
      if (input.projectId != null) await ownedProject(db, ctx.user.id, input.projectId);
      await db.delete(customerProjectQuotes).where(eq(customerProjectQuotes.orderRequestId, input.orderRequestId));
      if (input.projectId != null) {
        await db.insert(customerProjectQuotes).values({ projectId: input.projectId, orderRequestId: input.orderRequestId });
      }
      return { ok: true };
    }),

  duplicateDesign: protectedProcedure
    .input(z.object({ designId: z.number().int().positive(), slug: z.string().trim().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const affiliate = await affiliateForSlug(db, input.slug);
      const [design] = await db.select().from(kitchenDesigns).where(and(eq(kitchenDesigns.id, input.designId), eq(kitchenDesigns.userId, ctx.user.id), eq(kitchenDesigns.affiliateId, affiliate.id))).limit(1);
      if (!design || !canDeleteCustomerDesign(ctx.user.id, design.userId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });
      }
      const result = await db.insert(kitchenDesigns).values({
        userId: ctx.user.id,
        affiliateId: affiliate.id,
        name: `Copy of ${design.name}`.slice(0, 256),
        projectName: design.projectName,
        roomLabel: design.roomLabel,
        roomType: design.roomType,
        roomData: design.roomData,
        placedCabinets: design.placedCabinets,
        selectedSurfaces: design.selectedSurfaces,
        threeDPresentation: design.threeDPresentation,
        selectedStyleId: design.selectedStyleId,
        selectedDistributorId: design.selectedDistributorId,
        thumbnailUrl: design.thumbnailUrl,
        recordKind: "customer",
      });
      return { id: insertId(result) };
    }),

  requestQuoteRevision: protectedProcedure
    .input(z.object({
      orderRequestId: z.number().int().positive(),
      slug: z.string().trim().min(1).max(64),
      note: z.string().trim().min(1).max(4000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const affiliate = await affiliateForSlug(db, input.slug);
      const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, input.orderRequestId)).limit(1);
      const email = normalizeEmail(ctx.user.email);
      const owns = order && order.affiliateId === affiliate.id && (order.userId === ctx.user.id || (email != null && normalizeEmail(order.originatorEmail) === email));
      if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found." });
      await db.insert(customerQuoteRevisions).values({
        orderRequestId: order.id,
        userId: ctx.user.id,
        note: input.note,
      });
      return { ok: true };
    }),

  revertDesign: protectedProcedure
    .input(z.object({ designId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [design] = await db.select().from(kitchenDesigns).where(eq(kitchenDesigns.id, input.designId)).limit(1);
      if (!design || !canDeleteCustomerDesign(ctx.user.id, design.userId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });
      }
      const [revision] = await db.select().from(kitchenDesignRevisions).where(eq(kitchenDesignRevisions.kitchenDesignId, design.id)).orderBy(desc(kitchenDesignRevisions.revisionNumber)).limit(1);
      if (!revision) throw new TRPCError({ code: "BAD_REQUEST", message: "This design has no earlier version to restore." });
      const previous = revision.snapshot as Parameters<typeof planRevert>[1];
      const current = snapshotDesign(design);
      const plan = planRevert(current, previous);
      if (plan.deletesDesign) throw new TRPCError({ code: "BAD_REQUEST", message: "Revert cannot delete a design." });
      await db.insert(kitchenDesignRevisions).values({
        kitchenDesignId: design.id,
        revisionNumber: revision.revisionNumber + 1,
        authorUserId: ctx.user.id,
        authorLabel: ctx.user.name?.trim() || "Customer",
        kind: "revert",
        snapshot: plan.preservedCurrent,
      });
      await db.update(kitchenDesigns).set({
        name: plan.live.name,
        roomData: plan.live.roomData as object | null,
        placedCabinets: plan.live.placedCabinets as object[] | null,
        selectedSurfaces: plan.live.selectedSurfaces as object[] | null,
        threeDPresentation: plan.live.threeDPresentation as object | null,
        selectedStyleId: plan.live.selectedStyleId,
        selectedDistributorId: plan.live.selectedDistributorId,
        projectName: plan.live.projectName,
        roomLabel: plan.live.roomLabel,
        roomType: plan.live.roomType,
        assistLabel: null,
        recordKind: "customer",
      }).where(and(eq(kitchenDesigns.id, design.id), eq(kitchenDesigns.userId, ctx.user.id)));
      return { ok: true };
    }),

  markNoticeRead: protectedProcedure
    .input(z.object({ noticeId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(customerNotices).set({ readAt: new Date() }).where(and(eq(customerNotices.id, input.noticeId), eq(customerNotices.userId, ctx.user.id)));
      return { ok: true };
    }),
});

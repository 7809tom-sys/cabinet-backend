import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import {
  affiliateInstallationEstimates,
  affiliates,
  crmActivities,
  crmDeals,
  customerFavorites,
  customerProjectDesigns,
  customerProjectQuotes,
  customerProjects,
  designLeads,
  kitchenDesignRevisions,
  kitchenDesigns,
  orderRequests,
  users,
} from "../../drizzle/schema";
import {
  BROWSING_HISTORY_NOTE,
  activitySummary,
  customerPagePath,
  decideDirectoryAccess,
  mergeCustomers,
  normalizeEmail,
  normalizePhone,
  statusFromStage,
  type CustomerSource,
  type CustomerStatus,
  type RawCustomerRecord,
  type UnifiedCustomer,
} from "@shared/customerDirectory";

const statusEnum = z.enum(["new", "contacted", "quoted", "won", "lost"]);

function unfinished(placed: unknown): boolean {
  return !Array.isArray(placed) || placed.length === 0;
}

function money(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function iso(value: Date | string | null | undefined): string {
  if (value == null) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

async function actorAccess(user: { id: number; email: string | null; role: string }) {
  if (user.role === "admin") return null;
  const db = await getDb();
  if (!db) return null;
  return resolveAffiliateAccess(db, user);
}

async function requireDirectory(user: { id: number; email: string | null; role: string }, requestedAffiliateId: number | null) {
  const decision = decideDirectoryAccess(
    { role: user.role, access: await actorAccess(user) },
    requestedAffiliateId,
  );
  if (!decision.ok) throw new TRPCError({ code: "FORBIDDEN", message: decision.message });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return { db, affiliateId: decision.affiliateId };
}

async function loadRaw(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, affiliateId: number | null): Promise<RawCustomerRecord[]> {
  const rows: RawCustomerRecord[] = [];
  const designQuery = db
    .select({
      id: kitchenDesigns.id,
      userId: kitchenDesigns.userId,
      affiliateId: kitchenDesigns.affiliateId,
      name: kitchenDesigns.name,
      thumbnailUrl: kitchenDesigns.thumbnailUrl,
      placedCabinets: kitchenDesigns.placedCabinets,
      createdAt: kitchenDesigns.createdAt,
      updatedAt: kitchenDesigns.updatedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(kitchenDesigns)
    .leftJoin(users, eq(users.id, kitchenDesigns.userId));
  const designs = affiliateId == null ? await designQuery : await designQuery.where(eq(kitchenDesigns.affiliateId, affiliateId));
  for (const design of designs) {
    rows.push({
      affiliateId: design.affiliateId,
      userId: design.userId,
      name: design.userName,
      email: design.userEmail,
      source: "design",
      seenAt: design.createdAt,
      activityAt: design.updatedAt,
      designId: design.id,
      designName: design.name,
      thumbnailUrl: design.thumbnailUrl,
      unfinishedDesign: unfinished(design.placedCabinets),
    });
  }

  const leadQuery = db.select().from(designLeads);
  const leads = affiliateId == null ? await leadQuery : await leadQuery.where(eq(designLeads.affiliateId, affiliateId));
  for (const lead of leads) {
    rows.push({
      affiliateId: lead.affiliateId,
      userId: lead.userId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: "lead",
      seenAt: lead.createdAt,
      activityAt: lead.lastLaunchAt,
      dealId: lead.dealId,
    });
  }

  const orderQuery = db.select().from(orderRequests);
  const orders = affiliateId == null ? await orderQuery : await orderQuery.where(eq(orderRequests.affiliateId, affiliateId));
  for (const order of orders) {
    const source: CustomerSource = order.status === "confirmed" ? "order" : "quote";
    rows.push({
      affiliateId: order.affiliateId,
      userId: order.userId,
      name: order.originatorName,
      email: order.originatorEmail,
      phone: order.originatorPhone,
      source,
      seenAt: order.createdAt,
      activityAt: order.updatedAt,
      orderId: order.id,
      orderNumber: order.requestNumber,
      orderStatus: order.status,
      orderTotal: money(order.totalAmount),
      designId: order.kitchenDesignId,
    });
  }

  const dealQuery = db.select().from(crmDeals);
  const deals = affiliateId == null ? await dealQuery : await dealQuery.where(eq(crmDeals.affiliateId, affiliateId));
  for (const deal of deals) {
    rows.push({
      affiliateId: deal.affiliateId,
      name: deal.contactName,
      email: deal.contactEmail,
      phone: deal.contactPhone,
      company: deal.company,
      source: "crm",
      seenAt: deal.createdAt,
      activityAt: deal.updatedAt,
      dealId: deal.id,
      dealStage: deal.stage,
      followUpAt: deal.nextFollowUpAt,
    });
  }

  const estimateQuery = db.select().from(affiliateInstallationEstimates);
  const estimates = affiliateId == null
    ? await estimateQuery
    : await estimateQuery.where(eq(affiliateInstallationEstimates.affiliateId, affiliateId));
  for (const estimate of estimates) {
    rows.push({
      affiliateId: estimate.affiliateId,
      name: estimate.customerName,
      email: estimate.customerEmail,
      phone: estimate.customerPhone,
      source: "estimate",
      seenAt: estimate.createdAt,
      activityAt: estimate.updatedAt,
      estimateId: estimate.id,
      estimateStatus: estimate.status,
      estimateTotal: money(estimate.totalAmount),
      dealId: estimate.crmDealId,
      designId: estimate.kitchenDesignId,
      orderId: estimate.orderRequestId,
    });
  }

  const projectQuery = db.select().from(customerProjects);
  const projects = affiliateId == null ? await projectQuery : await projectQuery.where(eq(customerProjects.affiliateId, affiliateId));
  for (const project of projects) {
    rows.push({
      affiliateId: project.affiliateId,
      userId: project.userId,
      name: project.clientName,
      source: "storefront",
      seenAt: project.createdAt,
      activityAt: project.updatedAt,
      projectId: project.id,
    });
  }

  if (affiliateId != null) {
    const [store] = await db.select({ slug: affiliates.slug }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    if (store?.slug) {
      const favorites = await db
        .select({
          userId: customerFavorites.userId,
          createdAt: customerFavorites.createdAt,
          name: users.name,
          email: users.email,
          company: users.companyName,
        })
        .from(customerFavorites)
        .innerJoin(users, eq(users.id, customerFavorites.userId))
        .where(eq(customerFavorites.storefrontSlug, store.slug));
      for (const favorite of favorites) {
        rows.push({
          affiliateId,
          userId: favorite.userId,
          name: favorite.name,
          email: favorite.email,
          company: favorite.company,
          source: "storefront",
          seenAt: favorite.createdAt,
          activityAt: favorite.createdAt,
        });
      }
    }
  }
  return rows;
}

function findCustomer(customers: UnifiedCustomer[], key: string): UnifiedCustomer | undefined {
  return customers.find((customer) => customer.key === key);
}

async function ensureDeal(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  args: { affiliateId: number | null; userId: number; customer: UnifiedCustomer; stage?: CustomerStatus },
) {
  if (args.customer.dealId) return args.customer.dealId;
  const email = normalizeEmail(args.customer.email);
  const phone = normalizePhone(args.customer.phone);
  const existing = await db.select({ id: crmDeals.id, contactEmail: crmDeals.contactEmail, contactPhone: crmDeals.contactPhone, affiliateId: crmDeals.affiliateId }).from(crmDeals);
  const match = existing.find((deal) => {
    if (args.affiliateId != null && deal.affiliateId !== args.affiliateId) return false;
    if (args.affiliateId == null && deal.affiliateId != null) return false;
    return (email != null && normalizeEmail(deal.contactEmail) === email) || (phone != null && normalizePhone(deal.contactPhone) === phone);
  });
  if (match) return match.id;
  const stage = args.stage ?? "new";
  const result = await db.insert(crmDeals).values({
    affiliateId: args.affiliateId,
    ownerUserId: args.userId,
    title: args.customer.name || "Customer",
    stage,
    contactName: args.customer.name,
    contactEmail: args.customer.email,
    contactPhone: args.customer.phone,
    company: args.customer.company,
    source: "storefront",
    closedAt: stage === "won" || stage === "lost" ? new Date() : null,
  });
  return Number((result as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
}

export const affiliateCustomersRouter = router({
  list: protectedProcedure
    .input(z.object({ affiliateId: z.number().int().positive().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { db, affiliateId } = await requireDirectory(ctx.user, input?.affiliateId ?? null);
      const customers = mergeCustomers(await loadRaw(db, affiliateId)).map(({ designs, quotes, ...customer }) => customer);
      return { customers, browsingNote: BROWSING_HISTORY_NOTE, consultationsIncluded: false as const };
    }),

  get: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().nullable().optional(),
      customerKey: z.string().min(3).max(400),
    }))
    .query(async ({ ctx, input }) => {
      const { db, affiliateId } = await requireDirectory(ctx.user, input.affiliateId ?? null);
      const raw = await loadRaw(db, affiliateId);
      const customer = findCustomer(mergeCustomers(raw), input.customerKey);
      if (!customer || (affiliateId != null && customer.affiliateId != null && customer.affiliateId !== affiliateId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      }
      const designIds = customer.designs.map((design) => design.id);
      const designs = designIds.length === 0 ? [] : await db
        .select({
          id: kitchenDesigns.id,
          name: kitchenDesigns.name,
          thumbnailUrl: kitchenDesigns.thumbnailUrl,
          assistLabel: kitchenDesigns.assistLabel,
          recordKind: kitchenDesigns.recordKind,
          suggestionOfDesignId: kitchenDesigns.suggestionOfDesignId,
          updatedAt: kitchenDesigns.updatedAt,
          userId: kitchenDesigns.userId,
          affiliateId: kitchenDesigns.affiliateId,
        })
        .from(kitchenDesigns)
        .where(inArray(kitchenDesigns.id, designIds));
      const revisions = designIds.length === 0 ? [] : await db
        .select()
        .from(kitchenDesignRevisions)
        .where(inArray(kitchenDesignRevisions.kitchenDesignId, designIds))
        .orderBy(desc(kitchenDesignRevisions.revisionNumber));
      const projects = customer.userId == null ? [] : await db
        .select()
        .from(customerProjects)
        .where(and(
          eq(customerProjects.userId, customer.userId),
          affiliateId == null ? eq(customerProjects.userId, customer.userId) : eq(customerProjects.affiliateId, affiliateId),
        ));
      const projectIds = projects.map((project) => project.id);
      const projectDesigns = projectIds.length === 0 ? [] : await db.select().from(customerProjectDesigns).where(inArray(customerProjectDesigns.projectId, projectIds));
      const projectQuotes = projectIds.length === 0 ? [] : await db.select().from(customerProjectQuotes).where(inArray(customerProjectQuotes.projectId, projectIds));
      const dealIds = Array.from(new Set(raw.filter((row) => row.dealId != null && (
        (customer.email && normalizeEmail(row.email) === customer.email) ||
        (customer.phone && normalizePhone(row.phone) === customer.phone) ||
        (customer.userId != null && row.userId === customer.userId) ||
        row.dealId === customer.dealId
      )).map((row) => row.dealId!)));
      const notes = dealIds.length === 0 ? [] : await db.select().from(crmActivities).where(inArray(crmActivities.dealId, dealIds)).orderBy(desc(crmActivities.createdAt));
      const [store] = affiliateId == null ? [] : await db.select({ slug: affiliates.slug, storeName: affiliates.storeName }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
      const timeline = [
        ...customer.designs.map((design) => ({ at: design.seenAt, kind: "design" as const, title: design.name, href: null as string | null })),
        ...customer.quotes.map((quote) => ({ at: quote.seenAt, kind: quote.kind, title: quote.number ?? `Request ${quote.id}`, detail: quote.status, total: quote.total })),
        ...notes.map((note) => ({ at: iso(note.createdAt), kind: "note" as const, title: note.body, detail: note.kind })),
        ...revisions.map((revision) => ({ at: iso(revision.createdAt), kind: "assist" as const, title: revision.authorLabel, detail: revision.kind })),
      ].sort((a, b) => (a.at < b.at ? 1 : -1));
      return {
        customer,
        designs,
        projects: projects.map((project) => ({
          ...project,
          designIds: projectDesigns.filter((link) => link.projectId === project.id).map((link) => link.kitchenDesignId),
          quoteIds: projectQuotes.filter((link) => link.projectId === project.id).map((link) => link.orderRequestId),
        })),
        revisions,
        timeline,
        browsingNote: BROWSING_HISTORY_NOTE,
        consultationsIncluded: false as const,
        storeSlug: store?.slug ?? null,
        storeName: store?.storeName ?? null,
      };
    }),

  summaries: protectedProcedure
    .input(z.object({
      deals: z.array(z.object({
        id: z.number().int(),
        contactEmail: z.string().nullable().optional(),
        contactPhone: z.string().nullable().optional(),
        affiliateId: z.number().int().nullable().optional(),
      })).max(300),
    }))
    .query(async ({ ctx, input }) => {
      const access = await actorAccess(ctx.user);
      const decision = decideDirectoryAccess(
        { role: ctx.user.role, access },
        ctx.user.role === "admin" ? null : access?.affiliateId ?? null,
      );
      if (!decision.ok) throw new TRPCError({ code: "FORBIDDEN", message: decision.message });
      const db = await getDb();
      if (!db) return { byDealId: {} as Record<number, { text: string; href: string; customerKey: string }> };
      const affiliateIds = Array.from(new Set(input.deals.map((deal) => deal.affiliateId ?? null)));
      const directories = new Map<string, UnifiedCustomer[]>();
      for (const id of affiliateIds) {
        if (decision.affiliateId != null && id !== decision.affiliateId) continue;
        directories.set(String(id), mergeCustomers(await loadRaw(db, id)));
      }
      const byDealId: Record<number, { text: string; href: string; customerKey: string }> = {};
      for (const deal of input.deals) {
        if (decision.affiliateId != null && (deal.affiliateId ?? null) !== decision.affiliateId) continue;
        const customers = directories.get(String(deal.affiliateId ?? null)) ?? [];
        const email = normalizeEmail(deal.contactEmail);
        const phone = normalizePhone(deal.contactPhone);
        const customer = customers.find((row) => (email != null && row.email === email) || (phone != null && row.phone === phone));
        if (!customer) continue;
        byDealId[deal.id] = {
          text: activitySummary(customer),
          customerKey: customer.key,
          href: customerPagePath({
            affiliateId: deal.affiliateId ?? null,
            customerKey: customer.key,
            admin: ctx.user.role === "admin",
          }),
        };
      }
      return { byDealId };
    }),

  setStatus: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().nullable().optional(),
      customerKey: z.string().min(3).max(400),
      status: statusEnum,
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, affiliateId } = await requireDirectory(ctx.user, input.affiliateId ?? null);
      const customer = findCustomer(mergeCustomers(await loadRaw(db, affiliateId)), input.customerKey);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      const dealId = await ensureDeal(db, { affiliateId, userId: ctx.user.id, customer, stage: input.status });
      await db.update(crmDeals).set({
        stage: input.status,
        closedAt: input.status === "won" || input.status === "lost" ? new Date() : null,
      }).where(eq(crmDeals.id, dealId));
      await db.insert(crmActivities).values({
        dealId,
        authorUserId: ctx.user.id,
        kind: "stage_change",
        body: `Customer status set to ${statusFromStage(input.status)}`,
      });
      return { ok: true, dealId };
    }),

  addNote: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().nullable().optional(),
      customerKey: z.string().min(3).max(400),
      body: z.string().trim().min(1).max(8000),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, affiliateId } = await requireDirectory(ctx.user, input.affiliateId ?? null);
      const customer = findCustomer(mergeCustomers(await loadRaw(db, affiliateId)), input.customerKey);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      const dealId = await ensureDeal(db, { affiliateId, userId: ctx.user.id, customer });
      await db.insert(crmActivities).values({
        dealId,
        authorUserId: ctx.user.id,
        kind: "note",
        body: input.body,
      });
      await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, dealId));
      return { ok: true, dealId };
    }),

  setFollowUp: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().nullable().optional(),
      customerKey: z.string().min(3).max(400),
      followUpAt: z.string().datetime().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, affiliateId } = await requireDirectory(ctx.user, input.affiliateId ?? null);
      const customer = findCustomer(mergeCustomers(await loadRaw(db, affiliateId)), input.customerKey);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      const dealId = await ensureDeal(db, { affiliateId, userId: ctx.user.id, customer });
      await db.update(crmDeals).set({
        nextFollowUpAt: input.followUpAt ? new Date(input.followUpAt) : null,
      }).where(eq(crmDeals.id, dealId));
      return { ok: true, dealId };
    }),

  openDeal: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().nullable().optional(),
      customerKey: z.string().min(3).max(400),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, affiliateId } = await requireDirectory(ctx.user, input.affiliateId ?? null);
      const customer = findCustomer(mergeCustomers(await loadRaw(db, affiliateId)), input.customerKey);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      const dealId = await ensureDeal(db, { affiliateId, userId: ctx.user.id, customer });
      return { dealId };
    }),
});

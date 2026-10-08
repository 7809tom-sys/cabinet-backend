import { z } from "zod";
import { and, eq, desc, isNull, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  crmDeals,
  crmActivities,
  crmDealDesigns,
  crmEmailLog,
  emailSettings,
  kitchenDesigns,
  threeDRoomShares,
  affiliates,
  orderRequests,
  affiliateInstallationEstimates,
  proApplications,
  salesCommissions,
  users,
} from "../../drizzle/schema";
import nodemailer from "nodemailer";
import {
  CRM_STAGES,
  CRM_PRIORITIES,
  CRM_ACTIVITY_KINDS,
  CRM_LANGUAGES,
  isClosedStage,
  crmEmailBlockedReason,
  crmEmailBodyToHtml,
  type CrmStage,
} from "@shared/crm";
import {
  SALES_REP_COMMISSION_CENTS,
  shouldCreateCommission,
} from "@shared/salesPrograms";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { buildCrmInvoiceEmailHtml, createCrmInvoicePdf } from "../crmInvoicePdf";
import { usableInvoicePrefill, verifiedFreightInvoicePrefill } from "../crmInvoicePrefill";
import { groupedDesignInvoiceMaterials } from "../crmDesignInvoice";
import { crmCustomerImportIdentities, prepareCrmCustomerImport } from "@shared/crmCustomerListImport";

/**
 * Record a flat $400 commission when a deal owned by a sales rep transitions to
 * "won". Idempotent: the sales_commissions.dealId unique constraint guarantees
 * at most one commission per deal even under races / repeated transitions.
 * Only the deal's owner earns it, and only if that owner is a sales_rep.
 */
async function recordSalesCommissionOnWon(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  deal: typeof crmDeals.$inferSelect,
): Promise<void> {
  if (!deal.ownerUserId) return;
  // Already recorded for this deal?
  const existing = await db
    .select({ id: salesCommissions.id })
    .from(salesCommissions)
    .where(eq(salesCommissions.dealId, deal.id))
    .limit(1);
  // Owner must be a sales rep, and the shared rule must approve creation.
  const ownerRows = await db.select().from(users).where(eq(users.id, deal.ownerUserId)).limit(1);
  const owner = ownerRows[0];
  if (!owner) return;
  const ok = shouldCreateCommission({
    ownerRole: owner.role,
    nextStage: "won",
    previousStage: null,
    commissionAlreadyExists: !!existing[0],
  });
  if (!ok) return;
  try {
    await db.insert(salesCommissions).values({
      dealId: deal.id,
      repUserId: owner.id,
      repName: owner.name ?? owner.email ?? "Sales Rep",
      amountCents: SALES_REP_COMMISSION_CENTS,
      status: "pending",
      dealTitle: deal.title,
      wonAt: new Date(),
    });
  } catch {
    // Unique violation under a race — another path already recorded it. Safe to ignore.
  }
}

// ─── Scope resolution ──────────────────────────────────────────────────────────
// Admin (role === "admin") uses the master CRM and sees house plus affiliate deals.
// A partner/affiliate user sees ONLY their own affiliate's deals.
// We resolve the caller's affiliate by linked userId first, then by email.

type Ctx = { user: { id: number; email: string | null; role: string } };

async function resolveMyAffiliateAccess(ctx: Ctx) {
  const db = await getDb();
  if (!db) return null;
  return resolveAffiliateAccess(db, ctx.user);
}

async function resolveMyAffiliateId(ctx: Ctx): Promise<number | null> {
  const access = await resolveMyAffiliateAccess(ctx);
  return access?.affiliateId ?? null;
}

// A deal-ownership scope. Three kinds:
//  - house       : the distributor / Cabinet Dealz sales team. Sees every deal
//                  while affiliate ownership remains available for attribution.
//  - affiliate   : a paid storefront affiliate — sees only their affiliate deals.
//  - contractor  : a lightweight self-serve contractor — sees only the deals
//                  they personally own (crmDeals.ownerUserId = them).
export type CrmScope =
  | { kind: "house" }
  | { kind: "affiliate"; affiliateId: number }
  | { kind: "contractor"; userId: number };

/**
 * Returns the scope for the caller:
 *  - admin / designer / sales_rep → { kind: "house" } (sees ALL deals)
 *    (designer = internal sales staff with CRM-only admin access)
 *  - contractor → { kind: "contractor", userId } (deals they own)
 *  - partner with an affiliate → { kind: "affiliate", affiliateId }
 * Throws FORBIDDEN if a non-house/contractor caller has no affiliate.
 */
async function resolveScope(ctx: Ctx): Promise<CrmScope> {
  if (ctx.user.role === "admin") return { kind: "house" };

  const affiliateAccess = await resolveMyAffiliateAccess(ctx);
  if (affiliateAccess) {
    if (!affiliateAccess.accessCrm) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "CRM access has not been enabled for this team member.",
      });
    }
    return { kind: "affiliate", affiliateId: affiliateAccess.affiliateId };
  }

  // Internal platform CRM roles remain house-scoped when they are not linked
  // to an affiliate team invitation.
  if (ctx.user.role === "designer" || ctx.user.role === "sales_rep") {
    return { kind: "house" };
  }
  if (ctx.user.role === "contractor") return { kind: "contractor", userId: ctx.user.id };

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "No affiliate account is linked to your login.",
  });
}

// The SQL predicate that isolates a caller's deals.
//  - house      : no filter — the master CRM sees every deal on the platform.
//  - affiliate  : that affiliate's deals only.
//  - contractor : deals whose ownerUserId is the contractor.
export function scopeWhere(scope: CrmScope) {
  if (scope.kind === "house") return undefined;
  if (scope.kind === "affiliate") return eq(crmDeals.affiliateId, scope.affiliateId);
  return eq(crmDeals.ownerUserId, scope.userId);
}

export function resolveBoardScope(scope: CrmScope, requestedAffiliateId?: number): CrmScope {
  if (requestedAffiliateId != null && scope.kind === "house") {
    return { kind: "affiliate", affiliateId: requestedAffiliateId };
  }
  return scope;
}

// Verify a deal belongs to the caller's scope; returns the deal or throws.
async function getOwnedDeal(
  ctx: Ctx,
  dealId: number,
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const scope = await resolveScope(ctx);
  const where = scopeWhere(scope);
  const rows = await db
    .select()
    .from(crmDeals)
    .where(where ? and(eq(crmDeals.id, dealId), where) : eq(crmDeals.id, dealId));
  const deal = rows[0];
  if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found in your pipeline." });
  return { db, scope, deal };
}

const dealCoreInput = {
  title: z.string().min(1).max(256),
  stage: z.enum(CRM_STAGES).optional(),
  priority: z.enum(CRM_PRIORITIES).optional(),
  contactName: z.string().max(256).nullable().optional(),
  contactEmail: z.string().max(320).nullable().optional(),
  contactPhone: z.string().max(32).nullable().optional(),
  company: z.string().max(256).nullable().optional(),
  location: z.string().max(256).nullable().optional(),
  language: z.enum(CRM_LANGUAGES).optional(),
  estimatedValue: z.number().min(0).nullable().optional(),
  nextFollowUpAt: z.number().int().nullable().optional(), // epoch ms
  notes: z.string().max(8000).nullable().optional(),
  needsHelpClosing: z.boolean().optional(),
};

function sameCustomerEmail(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

export function laborEstimateMatchesDeal(
  estimate: Pick<typeof affiliateInstallationEstimates.$inferSelect, "orderRequestId" | "customerEmail"> & { crmDealId?: number | null },
  deal: Pick<typeof crmDeals.$inferSelect, "orderRequestId" | "contactEmail"> & { id?: number },
) {
  return (deal.id != null && estimate.crmDealId === deal.id)
    || (deal.orderRequestId != null && estimate.orderRequestId === deal.orderRequestId)
    || sameCustomerEmail(estimate.customerEmail, deal.contactEmail);
}

function designAffiliateWhere(affiliateId: number | null) {
  return affiliateId == null ? isNull(kitchenDesigns.affiliateId) : eq(kitchenDesigns.affiliateId, affiliateId);
}

function designScopePath(affiliateSlug: string | null, designId: number, crmDealId?: number | null) {
  const params = new URLSearchParams({ load: String(designId), preview: "3d" });
	if (crmDealId != null) params.set("crmDeal", String(crmDealId));
	const path = affiliateSlug ? `/store/${encodeURIComponent(affiliateSlug)}/design` : "/design";
	return `${path}?${params.toString()}`;
}

export const crmRouter = router({
  // ── Import a customer list into the caller's CRM scope ──────────────────────
  importCustomerList: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        contactName: z.string().min(1).max(256),
        contactEmail: z.string().email().max(320).nullable(),
        contactPhone: z.string().max(32).nullable(),
        company: z.string().max(256).nullable(),
        location: z.string().max(256).nullable(),
        notes: z.string().max(8000).nullable(),
      })).min(1).max(500),
      affiliateId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const callerScope = await resolveScope(ctx);
      const scope = resolveBoardScope(callerScope, input.affiliateId);
      const where = scopeWhere(scope);
      const existingQuery = db.select({ contactEmail: crmDeals.contactEmail, contactPhone: crmDeals.contactPhone }).from(crmDeals);
      const existing = await (where ? existingQuery.where(where) : existingQuery);
      const existingIdentities = new Set(existing.flatMap((row) => crmCustomerImportIdentities(row)));
      const report = prepareCrmCustomerImport(input.rows, existingIdentities);
      if (report.accepted.length) {
        await db.insert(crmDeals).values(report.accepted.map((row) => ({
          affiliateId: scope.kind === "affiliate" ? scope.affiliateId : null,
          ownerUserId: scope.kind === "contractor" ? scope.userId : ctx.user.id,
          title: `${row.company ?? row.contactName} — ${row.contactName}`.slice(0, 256),
          stage: "new" as const,
          priority: "medium" as const,
          contactName: row.contactName,
          contactEmail: row.contactEmail,
          contactPhone: row.contactPhone,
          company: row.company,
          location: row.location,
          source: "manual" as const,
          notes: row.notes ? `Customer list import: ${row.notes}` : "Customer list import.",
        })));
      }
      return { imported: report.accepted.length, skipped: report.skipped };
    }),

  // ── Board: all deals grouped by stage for the caller's scope ────────────────
  board: protectedProcedure
    .input(z.object({ affiliateId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) {
      return {
        scope: "house" as "house" | "affiliate" | "contractor",
        affiliateId: null as number | null,
        deals: [] as (typeof crmDeals.$inferSelect)[],
        affiliateNames: {} as Record<number, string>,
        affiliateBranding: {} as Record<number, { storeName: string; primaryColor: string | null; accentColor: string | null }>,
        isMasterView: false,
      };
    }
    // If an admin passes affiliateId, force the scope to that affiliate's deals
    const callerScope = await resolveScope(ctx);
    const isMasterView = callerScope.kind === "house";
    const scope = resolveBoardScope(callerScope, input?.affiliateId);
    const where = scopeWhere(scope);
    const q = db.select().from(crmDeals);
    const deals = await (where ? q.where(where) : q).orderBy(
      crmDeals.boardOrder,
      desc(crmDeals.updatedAt),
    );
    // For house scope, build a map of affiliateId -> storeName for attribution
    let affiliateNames: Record<number, string> = {};
    let affiliateBranding: Record<number, { storeName: string; primaryColor: string | null; accentColor: string | null }> = {};
    if (isMasterView) {
      const affRows = await db.select({
        id: affiliates.id,
        storeName: affiliates.storeName,
        primaryColor: affiliates.primaryColor,
        accentColor: affiliates.accentColor,
      }).from(affiliates);
      affiliateNames = Object.fromEntries(affRows.map((a) => [a.id, a.storeName]));
      affiliateBranding = Object.fromEntries(affRows.map((a) => [a.id, {
        storeName: a.storeName,
        primaryColor: a.primaryColor,
        accentColor: a.accentColor,
      }]));
    }
    return {
      scope: scope.kind as "house" | "affiliate" | "contractor",
      affiliateId: (scope.kind === "affiliate" ? scope.affiliateId : null) as number | null,
      deals,
      affiliateNames,
      affiliateBranding,
      isMasterView,
    };
  }),

  // ── Deal detail + its activity timeline ─────────────────────────────────────
  deal: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id);
      const activities = await db
        .select()
        .from(crmActivities)
        .where(eq(crmActivities.dealId, deal.id))
        .orderBy(desc(crmActivities.createdAt));
      const linkedDesignRows = await db
        .select()
        .from(crmDealDesigns)
        .where(eq(crmDealDesigns.dealId, deal.id))
        .orderBy(desc(crmDealDesigns.createdAt));
      const linkedDesignIds = linkedDesignRows.map((link) => link.designId);
      const savedDesignRows = linkedDesignIds.length === 0
        ? []
        : await db.select({
          id: kitchenDesigns.id,
          name: kitchenDesigns.name,
          affiliateId: kitchenDesigns.affiliateId,
          updatedAt: kitchenDesigns.updatedAt,
          selectedStyleId: kitchenDesigns.selectedStyleId,
          selectedSurfaces: kitchenDesigns.selectedSurfaces,
          placedCabinets: kitchenDesigns.placedCabinets,
        })
          .from(kitchenDesigns)
          .where(inArray(kitchenDesigns.id, linkedDesignIds));
      const savedDesignById = new Map(savedDesignRows.map((design) => [design.id, design]));
	  const scopedLinkedDesignIds = savedDesignRows.filter((design) => design.affiliateId === deal.affiliateId).map((design) => design.id);
      const shareRows = scopedLinkedDesignIds.length === 0
        ? []
        : await db.select({ kitchenDesignId: threeDRoomShares.kitchenDesignId, orderSubtotal: threeDRoomShares.orderSubtotal, updatedAt: threeDRoomShares.updatedAt })
          .from(threeDRoomShares)
	      .where(inArray(threeDRoomShares.kitchenDesignId, scopedLinkedDesignIds))
          .orderBy(desc(threeDRoomShares.updatedAt));
      const shareByDesignId = new Map<number, (typeof shareRows)[number]>();
      for (const share of shareRows) {
        if (share.kitchenDesignId != null && !shareByDesignId.has(share.kitchenDesignId)) shareByDesignId.set(share.kitchenDesignId, share);
      }
      const linkedAffiliateIds = Array.from(new Set(savedDesignRows.map((design) => design.affiliateId).filter((id): id is number => id != null)));
      const linkedAffiliateRows = linkedAffiliateIds.length === 0
        ? []
        : await db.select({ id: affiliates.id, slug: affiliates.slug, storeName: affiliates.storeName })
          .from(affiliates)
          .where(inArray(affiliates.id, linkedAffiliateIds));
      const linkedAffiliateById = new Map(linkedAffiliateRows.map((affiliate) => [affiliate.id, affiliate]));
      let linkedDesigns = linkedDesignRows.flatMap((link) => {
        const savedDesign = savedDesignById.get(link.designId);
	      if (!savedDesign || savedDesign.affiliateId !== deal.affiliateId) return [];
        const share = shareByDesignId.get(link.designId);
        const shareSubtotal = Number(share?.orderSubtotal ?? 0);
	      const creatorAffiliate = savedDesign.affiliateId == null ? null : linkedAffiliateById.get(savedDesign.affiliateId) ?? null;
        return [{
          ...link,
	        designName: savedDesign.name,
	        designUpdatedAt: savedDesign.updatedAt,
	        creatorScope: creatorAffiliate?.slug ?? "owner",
	        creatorStoreName: creatorAffiliate?.storeName ?? "Cabinet Dealz",
	        designUrl: designScopePath(creatorAffiliate?.slug ?? null, savedDesign.id, deal.id),
	        selectedStyleId: savedDesign.selectedStyleId,
	        selectedSurfaces: savedDesign.selectedSurfaces,
          // A zero plan share is not an authorized sell price. Keep it out of
          // the invoice until a verified saved-order subtotal exists.
          catalogSubtotal: Number.isFinite(shareSubtotal) && shareSubtotal > 0 ? share?.orderSubtotal ?? null : null,
          catalogSubtotalSource: Number.isFinite(shareSubtotal) && shareSubtotal > 0
            ? "Saved design catalog subtotal"
            : "No verified plan price yet",
          materialLines: groupedDesignInvoiceMaterials(savedDesign?.placedCabinets),
	      }];
      });
      const emails = await db
        .select()
        .from(crmEmailLog)
        .where(eq(crmEmailLog.dealId, deal.id))
        .orderBy(desc(crmEmailLog.sentAt));
      const affiliateRows = deal.affiliateId == null
        ? []
        : await db.select({
          storeName: affiliates.storeName,
          logoUrl: affiliates.logoUrl,
          primaryColor: affiliates.primaryColor,
          accentColor: affiliates.accentColor,
        }).from(affiliates).where(eq(affiliates.id, deal.affiliateId)).limit(1);
      const affiliate = affiliateRows[0];
      const invoiceBrand = affiliate ?? {
        storeName: "Cabinet Dealz",
        logoUrl: null,
        primaryColor: "#172033",
        accentColor: "#B5893D",
      };
      // Use source application amounts as invoice defaults. A direct order link
      // wins. For a linked plan, an order saved against that plan is safer than
      // an email match because a customer may have multiple kitchen projects.
      // Legacy leads can still recover a same-affiliate order by customer email.
      const orderScope = deal.affiliateId == null
        ? isNull(orderRequests.affiliateId)
        : eq(orderRequests.affiliateId, deal.affiliateId);
      const linkedOrderRows = deal.orderRequestId == null
        ? []
	    : await db.select().from(orderRequests).where(and(eq(orderRequests.id, deal.orderRequestId), orderScope)).limit(1);
	  const designOrderRows = linkedOrderRows[0] || scopedLinkedDesignIds.length === 0
        ? []
        : await db.select().from(orderRequests)
	      .where(and(inArray(orderRequests.kitchenDesignId, scopedLinkedDesignIds), orderScope))
          .orderBy(desc(orderRequests.updatedAt))
          .limit(1);
      const matchedOrderRows = linkedOrderRows[0] || designOrderRows[0] || !deal.contactEmail
        ? (linkedOrderRows[0] ? linkedOrderRows : designOrderRows)
        : await db.select().from(orderRequests)
          .where(and(eq(orderRequests.originatorEmail, deal.contactEmail), orderScope))
          .orderBy(desc(orderRequests.updatedAt))
          .limit(1);
      const invoiceOrder = matchedOrderRows[0] ?? null;

      // Labor is never guessed from an arbitrary installation estimate. The deal
      // owner must choose an eligible affiliate estimate from this same customer
      // or directly linked order; that selected estimate becomes a separately
      // labeled Labor line in the consolidated CRM invoice draft.
      const laborEstimateRows = deal.affiliateId == null || (!deal.orderRequestId && !deal.contactEmail && !deal.laborEstimateId)
        ? []
        : await db.select({
          id: affiliateInstallationEstimates.id,
          crmDealId: affiliateInstallationEstimates.crmDealId,
          orderRequestId: affiliateInstallationEstimates.orderRequestId,
          customerName: affiliateInstallationEstimates.customerName,
          customerEmail: affiliateInstallationEstimates.customerEmail,
          status: affiliateInstallationEstimates.status,
          totalAmount: affiliateInstallationEstimates.totalAmount,
          updatedAt: affiliateInstallationEstimates.updatedAt,
        }).from(affiliateInstallationEstimates)
          .where(eq(affiliateInstallationEstimates.affiliateId, deal.affiliateId))
          .orderBy(desc(affiliateInstallationEstimates.updatedAt))
          .limit(100);
      const laborEstimates = laborEstimateRows.filter((estimate) => (
        estimate.status !== "cancelled" && laborEstimateMatchesDeal(estimate, deal)
      ));
      const selectedLaborEstimate = deal.laborEstimateId == null
        ? null
        : laborEstimates.find((estimate) => estimate.id === deal.laborEstimateId) ?? null;
      const cabinetOrderPrefill = usableInvoicePrefill(invoiceOrder ? {
        totalAmount: invoiceOrder.totalAmount,
        status: invoiceOrder.status,
        source: `Order ${invoiceOrder.requestNumber}`,
      } : null);
      const shippingPrefill = verifiedFreightInvoicePrefill(invoiceOrder ? {
        freightQuoteCents: invoiceOrder.freightQuoteCents,
        freightQuoteVerified: invoiceOrder.freightQuoteVerified,
        deliveryMethod: invoiceOrder.deliveryMethod,
        status: invoiceOrder.status,
        source: `Verified shipping quote · Order ${invoiceOrder.requestNumber}`,
      } : null);
      // A submitted order can be tied directly to a saved plan. When it is,
      // prefer that signed merchandise subtotal over a presentation-share
      // snapshot, and keep the signed freight separate on its own invoice line.
      // This avoids both a stale $0 plan amount and the error of treating freight
      // as merchandise.
      if (invoiceOrder?.kitchenDesignId != null) {
        const orderDesignId = invoiceOrder.kitchenDesignId;
        const orderPlanPrefill = usableInvoicePrefill({
          totalAmount: invoiceOrder.totalAmount,
          status: invoiceOrder.status,
          source: `Order ${invoiceOrder.requestNumber} merchandise subtotal`,
        });
        linkedDesigns = linkedDesigns.map((linkedDesign) => linkedDesign.designId === orderDesignId
          ? {
              ...linkedDesign,
              catalogSubtotal: orderPlanPrefill.amount,
              catalogSubtotalSource: orderPlanPrefill.source ?? "No verified plan price yet",
            }
          : linkedDesign);
      }
      const laborPrefill = usableInvoicePrefill(selectedLaborEstimate ? {
        totalAmount: selectedLaborEstimate.totalAmount,
        status: selectedLaborEstimate.status,
        source: `Labor estimate #${selectedLaborEstimate.id}`,
      } : null);
      const invoicePrefill = {
        cabinetOrderAmount: cabinetOrderPrefill.amount,
        cabinetOrderSource: cabinetOrderPrefill.source,
        shippingAmount: shippingPrefill.amount,
        shippingSource: shippingPrefill.source,
        shippingNote: shippingPrefill.note,
        laborAmount: laborPrefill.amount,
        laborSource: laborPrefill.source,
      };
      return { deal, activities, linkedDesigns, emails, invoiceBrand, invoicePrefill, laborEstimates };
    }),

  // ── Saved designs compatible with this CRM scope/deal ──────────────────────
  linkableDesigns: protectedProcedure
	  .input(z.object({ dealId: z.number().int().positive().optional() }).optional())
	  .query(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) return [];
	    const scope = await resolveScope(ctx);
	    const deal = input?.dealId != null ? (await getOwnedDeal(ctx, input.dealId)).deal : null;
	    const targetAffiliateId = deal
	      ? deal.affiliateId
	      : scope.kind === "affiliate" ? scope.affiliateId
	      : scope.kind === "contractor" ? null
	      : undefined;
	    const conditions = [];
	    if (targetAffiliateId !== undefined) conditions.push(designAffiliateWhere(targetAffiliateId));
	    if (scope.kind === "contractor") conditions.push(eq(kitchenDesigns.userId, scope.userId));
	    const rows = await db
	      .select({
	        id: kitchenDesigns.id,
	        name: kitchenDesigns.name,
	        affiliateId: kitchenDesigns.affiliateId,
	        updatedAt: kitchenDesigns.updatedAt,
	      })
	      .from(kitchenDesigns)
	      .where(conditions.length ? and(...conditions) : undefined)
	      .orderBy(desc(kitchenDesigns.updatedAt));
	    const affiliateIds = Array.from(new Set(rows.map((design) => design.affiliateId).filter((id): id is number => id != null)));
	    const affiliateRows = affiliateIds.length === 0 ? [] : await db
	      .select({ id: affiliates.id, slug: affiliates.slug, storeName: affiliates.storeName })
	      .from(affiliates)
	      .where(inArray(affiliates.id, affiliateIds));
	    const affiliateById = new Map(affiliateRows.map((affiliate) => [affiliate.id, affiliate]));
	    return rows.map((design) => {
	      const affiliate = design.affiliateId == null ? null : affiliateById.get(design.affiliateId) ?? null;
	      return {
	        ...design,
	        creatorScope: affiliate?.slug ?? "owner",
	        creatorStoreName: affiliate?.storeName ?? "Cabinet Dealz",
	        designUrl: designScopePath(affiliate?.slug ?? null, design.id, deal?.id),
	      };
	    });
	  }),

  // ── Attach a saved design to a deal (snapshots the name) ────────────────────
  linkDesign: protectedProcedure
    .input(z.object({ dealId: z.number().int(), designId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { db, scope, deal } = await getOwnedDeal(ctx, input.dealId);
      const dRows = await db
        .select()
        .from(kitchenDesigns)
	      .where(eq(kitchenDesigns.id, input.designId))
        .limit(1);
      const design = dRows[0];
      if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });
	    if (design.affiliateId !== deal.affiliateId) {
	      throw new TRPCError({ code: "NOT_FOUND", message: "Design is not available in this deal's store." });
	    }
	    if (scope.kind === "contractor" && design.userId !== ctx.user.id) {
	      throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });
	    }
      // Avoid duplicate links.
      const existing = await db
        .select()
        .from(crmDealDesigns)
        .where(
          and(
            eq(crmDealDesigns.dealId, deal.id),
            eq(crmDealDesigns.designId, design.id)
          )
        )
        .limit(1);
      if (existing[0]) return { ok: true, alreadyLinked: true };
      await db.insert(crmDealDesigns).values({
        dealId: deal.id,
        designId: design.id,
        designName: design.name,
        linkedByUserId: ctx.user.id,
      });
      await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
	    await db.insert(crmActivities).values({
	      dealId: deal.id,
	      authorUserId: ctx.user.id,
	      kind: "note",
	      body: `Saved design linked: ${design.name}.`,
	    });
      return { ok: true };
    }),

  // ── Detach a linked design from a deal ──────────────────────────────────────
  unlinkDesign: protectedProcedure
    .input(z.object({ dealId: z.number().int(), linkId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
	    const links = await db.select({ designName: crmDealDesigns.designName })
	      .from(crmDealDesigns)
	      .where(and(eq(crmDealDesigns.id, input.linkId), eq(crmDealDesigns.dealId, deal.id)))
	      .limit(1);
      await db
        .delete(crmDealDesigns)
        .where(
          and(
            eq(crmDealDesigns.id, input.linkId),
            eq(crmDealDesigns.dealId, deal.id)
          )
        );
	    if (links[0]) {
	      await db.insert(crmActivities).values({
	        dealId: deal.id,
	        authorUserId: ctx.user.id,
	        kind: "note",
	        body: `Saved design unlinked: ${links[0].designName}.`,
	      });
	    }
      return { ok: true };
    }),

  // ── Select the approved labor estimate to consolidate in a CRM invoice ──────
  setLaborEstimate: protectedProcedure
    .input(z.object({ dealId: z.number().int(), laborEstimateId: z.number().int().positive().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      if (input.laborEstimateId == null) {
        await db.update(crmDeals)
          .set({ laborEstimateId: null, updatedAt: new Date() })
          .where(eq(crmDeals.id, deal.id));
        return { ok: true, laborEstimateId: null };
      }
      if (deal.affiliateId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Labor estimates are available only for affiliate deals." });
      }
      const rows = await db.select({
        id: affiliateInstallationEstimates.id,
        crmDealId: affiliateInstallationEstimates.crmDealId,
        affiliateId: affiliateInstallationEstimates.affiliateId,
        orderRequestId: affiliateInstallationEstimates.orderRequestId,
        customerEmail: affiliateInstallationEstimates.customerEmail,
        status: affiliateInstallationEstimates.status,
      }).from(affiliateInstallationEstimates)
        .where(eq(affiliateInstallationEstimates.id, input.laborEstimateId))
        .limit(1);
      const laborEstimate = rows[0];
      if (!laborEstimate || laborEstimate.affiliateId !== deal.affiliateId || laborEstimate.status === "cancelled" || !laborEstimateMatchesDeal(laborEstimate, deal)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Labor estimate is not available for this deal." });
      }
      await db.update(crmDeals)
        .set({ laborEstimateId: laborEstimate.id, updatedAt: new Date() })
        .where(eq(crmDeals.id, deal.id));
      await db.insert(crmActivities).values({
        dealId: deal.id,
        authorUserId: ctx.user.id,
        kind: "note",
        body: `Labor estimate #${laborEstimate.id} selected for the consolidated CRM invoice.`,
      });
      return { ok: true, laborEstimateId: laborEstimate.id };
    }),

  // ── Create a deal in the caller's scope ─────────────────────────────────────
  create: protectedProcedure
    .input(z.object({ ...dealCoreInput, affiliateId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      const stage = (input.stage ?? "new") as CrmStage;
      const res = await db.insert(crmDeals).values({
        affiliateId: scope.kind === "affiliate"
          ? scope.affiliateId
          : (input.affiliateId != null && scope.kind === "house" ? input.affiliateId : null),
        ownerUserId: ctx.user.id,
        title: input.title,
        stage,
        priority: input.priority ?? "medium",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        company: input.company ?? null,
        location: input.location ?? null,
        language: input.language ?? "en",
        estimatedValue: input.estimatedValue != null ? String(input.estimatedValue) : null,
        source: "manual",
        nextFollowUpAt: input.nextFollowUpAt != null ? new Date(input.nextFollowUpAt) : null,
        notes: input.notes ?? null,
        closedAt: isClosedStage(stage) ? new Date() : null,
      });
      const insertId = (res as unknown as [{ insertId: number }])[0].insertId;
      return { id: insertId };
    }),

  // ── Update deal fields ──────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({ id: z.number().int(), ...dealCoreInput, title: z.string().min(1).max(256).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id);
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.contactName !== undefined) patch.contactName = input.contactName;
      if (input.contactEmail !== undefined) patch.contactEmail = input.contactEmail;
      if (input.contactPhone !== undefined) patch.contactPhone = input.contactPhone;
      if (input.company !== undefined) patch.company = input.company;
      if (input.location !== undefined) patch.location = input.location;
      if (input.language !== undefined) patch.language = input.language;
      if (input.estimatedValue !== undefined)
        patch.estimatedValue = input.estimatedValue != null ? String(input.estimatedValue) : null;
      if (input.nextFollowUpAt !== undefined)
        patch.nextFollowUpAt = input.nextFollowUpAt != null ? new Date(input.nextFollowUpAt) : null;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.needsHelpClosing !== undefined) patch.needsHelpClosing = input.needsHelpClosing;
      if (input.stage !== undefined && input.stage !== deal.stage) {
        patch.stage = input.stage;
        patch.closedAt = isClosedStage(input.stage as CrmStage) ? new Date() : null;
      }
      if (Object.keys(patch).length > 0) {
        await db.update(crmDeals).set(patch).where(eq(crmDeals.id, deal.id));
      }
      // Newly won → record the sales-rep commission (idempotent, sales reps only).
      if (input.stage === "won" && deal.stage !== "won") {
        await recordSalesCommissionOnWon(db, deal);
      }
      return { ok: true };
    }),

  // ── Move a deal to a new stage (board drag) ─────────────────────────────────
  moveStage: protectedProcedure
    .input(z.object({ id: z.number().int(), stage: z.enum(CRM_STAGES), boardOrder: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id);
      const changed = input.stage !== deal.stage;
      await db
        .update(crmDeals)
        .set({
          stage: input.stage,
          boardOrder: input.boardOrder ?? deal.boardOrder,
          closedAt: isClosedStage(input.stage) ? new Date() : null,
        })
        .where(eq(crmDeals.id, deal.id));
      if (changed) {
        await db.insert(crmActivities).values({
          dealId: deal.id,
          authorUserId: ctx.user.id,
          kind: "stage_change",
          body: `Stage changed from ${deal.stage} to ${input.stage}`,
        });
      }
      // Newly won → record the sales-rep commission (idempotent, sales reps only).
      if (input.stage === "won" && deal.stage !== "won") {
        await recordSalesCommissionOnWon(db, deal);
      }
      return { ok: true };
    }),

  // ── Add an activity / note / task to a deal ─────────────────────────────────
  addActivity: protectedProcedure
    .input(
      z.object({
        dealId: z.number().int(),
        kind: z.enum(CRM_ACTIVITY_KINDS).optional(),
        body: z.string().min(1).max(8000),
        dueAt: z.number().int().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      await db.insert(crmActivities).values({
        dealId: deal.id,
        authorUserId: ctx.user.id,
        kind: input.kind ?? "note",
        body: input.body,
        dueAt: input.dueAt != null ? new Date(input.dueAt) : null,
      });
      // touch the deal so it sorts to the top of its column
      await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
      return { ok: true };
    }),

  // ── Sent-email history for a deal ────────────────────────────────────────────
  emailLog: protectedProcedure
    .input(z.object({ dealId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      return db
        .select()
        .from(crmEmailLog)
        .where(eq(crmEmailLog.dealId, deal.id))
        .orderBy(desc(crmEmailLog.sentAt));
    }),

  // ── SMTP readiness for the composer (no secrets returned) ────────────────────
  emailReadiness: protectedProcedure.query(async ({ ctx }) => {
    // Any CRM-scoped caller may check; scope is enforced on send.
    await resolveScope(ctx);
    const db = await getDb();
    if (!db) return { configured: false, enabled: false, from: "" };
    const rows = await db.select().from(emailSettings).limit(1);
    const s = rows[0];
    const configured = !!(s?.smtpHost && s?.smtpUser && s?.smtpPass);
    return {
      configured,
      enabled: s?.enabled ?? false,
      from: s?.smtpFrom || s?.smtpUser || "",
    };
  }),

  // ── Send an email to the deal contact via the site's saved SMTP ──────────────
  // Sends from the saved smtpFrom (e.g. sales@cabinetdealz.com), logs the email
  // on the deal (crm_email_log) and drops an "email" activity on the timeline.
  // Blocks with a helpful reason when SMTP is not configured or disabled.
  sendEmail: protectedProcedure
    .input(
      z.object({
        dealId: z.number().int(),
        to: z.string().email(),
        subject: z.string().min(1).max(512),
        body: z.string().min(1).max(20000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);

      // Load SMTP settings + evaluate readiness (shared, unit-tested guard).
      const rows = await db.select().from(emailSettings).limit(1);
      const s = rows[0];
      const configured = !!(s?.smtpHost && s?.smtpUser && s?.smtpPass);
      const blocked = crmEmailBlockedReason({ configured, enabled: s?.enabled ?? false });
      if (blocked) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: blocked, // "not_configured" | "disabled" — client maps to a friendly message
        });
      }

      const from = (s!.smtpFrom || s!.smtpUser).trim();
      const senderName = ctx.user.email ?? String(ctx.user.id);

      // Send via nodemailer using the saved transport.
      try {
        const transport = nodemailer.createTransport({
          host: s!.smtpHost,
          port: s!.smtpPort,
          secure: s!.smtpPort === 465,
          auth: { user: s!.smtpUser, pass: s!.smtpPass },
        });
        await transport.sendMail({
          from,
          to: input.to,
          subject: input.subject,
          text: input.body,
          html: crmEmailBodyToHtml(input.body),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Send failed: ${msg}` });
      }

      // Persist a durable log row + timeline activity.
      await db.insert(crmEmailLog).values({
        dealId: deal.id,
        toEmail: input.to,
        fromEmail: from,
        subject: input.subject,
        body: input.body,
        sentByUserId: ctx.user.id,
        sentByName: senderName,
      });
      await db.insert(crmActivities).values({
        dealId: deal.id,
        authorUserId: ctx.user.id,
        kind: "email",
        body: `Email sent to ${input.to} — ${input.subject}`,
      });
      await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
      return { ok: true };
    }),

  // ── Send a final branded invoice PDF to the CRM lead contact ────────────────
  // The recipient always comes from the scoped deal itself; callers cannot turn
  // this into an arbitrary outbound-email endpoint.
  sendInvoiceEmail: protectedProcedure
    .input(z.object({
      dealId: z.number().int(),
      lines: z.array(z.object({
        description: z.string().trim().min(1).max(256),
        amount: z.number().finite().min(0).max(10_000_000),
        kind: z.enum(["charge", "included"]).optional(),
      })).min(1).max(30),
      linkedDesignId: z.number().int().nullable().optional(),
      notes: z.string().trim().max(8000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      const to = deal.contactEmail?.trim();
      if (!to) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "missing_recipient" });
      }

      const rows = await db.select().from(emailSettings).limit(1);
      const s = rows[0];
      const configured = !!(s?.smtpHost && s?.smtpUser && s?.smtpPass);
      const blocked = crmEmailBlockedReason({ configured, enabled: s?.enabled ?? false });
      if (blocked) throw new TRPCError({ code: "PRECONDITION_FAILED", message: blocked });

      let linkedDesignName: string | null = null;
      if (input.linkedDesignId != null) {
        const linkedRows = await db.select({ designName: crmDealDesigns.designName })
          .from(crmDealDesigns)
          .where(and(eq(crmDealDesigns.id, input.linkedDesignId), eq(crmDealDesigns.dealId, deal.id)))
          .limit(1);
        if (!linkedRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Linked design not found." });
        linkedDesignName = linkedRows[0].designName;
      }

      const affiliateRows = deal.affiliateId == null
        ? []
        : await db.select({
          storeName: affiliates.storeName,
          logoUrl: affiliates.logoUrl,
          primaryColor: affiliates.primaryColor,
          accentColor: affiliates.accentColor,
        }).from(affiliates).where(eq(affiliates.id, deal.affiliateId)).limit(1);
      const brand = affiliateRows[0] ?? {
        storeName: "Cabinet Dealz",
        logoUrl: null,
        primaryColor: "#172033",
        accentColor: "#B5893D",
      };
      const now = new Date();
      const invoiceNumber = `CRM-${deal.id}-${now.toISOString().slice(0, 10).replaceAll("-", "")}`;
      const invoice = {
        invoiceNumber,
        issuedOn: now.toLocaleDateString("en-US"),
        customerName: deal.contactName || deal.company || deal.title,
        customerEmail: to,
        customerPhone: deal.contactPhone,
        linkedDesignName,
        notes: input.notes ?? null,
        lines: input.lines,
        brand,
      };
      const pdf = await createCrmInvoicePdf(invoice);
      const subject = `${brand.storeName} invoice ${invoiceNumber}`;
      const from = (s!.smtpFrom || s!.smtpUser).trim();

      try {
        const transport = nodemailer.createTransport({
          host: s!.smtpHost,
          port: s!.smtpPort,
          secure: s!.smtpPort === 465,
          auth: { user: s!.smtpUser, pass: s!.smtpPass },
        });
        await transport.sendMail({
          from,
          to,
          subject,
          text: `Your invoice ${invoiceNumber} from ${brand.storeName} is attached.`,
          html: buildCrmInvoiceEmailHtml(invoice),
          attachments: [{
            filename: `${invoiceNumber}.pdf`,
            content: pdf,
            contentType: "application/pdf",
          }],
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Send failed: ${msg}` });
      }

      await db.insert(crmEmailLog).values({
        dealId: deal.id,
        toEmail: to,
        fromEmail: from,
        subject,
        body: `Branded invoice PDF ${invoiceNumber} attached.`,
        sentByUserId: ctx.user.id,
        sentByName: ctx.user.email ?? String(ctx.user.id),
      });
      await db.insert(crmActivities).values({
        dealId: deal.id,
        authorUserId: ctx.user.id,
        kind: "email",
        body: `Branded invoice PDF ${invoiceNumber} sent to ${to}${linkedDesignName ? ` · Linked design: ${linkedDesignName}` : ""}.`,
      });
      await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
      return { ok: true, invoiceNumber };
    }),

  // ── Toggle a task activity done/undone ──────────────────────────────────────
  toggleTask: protectedProcedure
    .input(z.object({ activityId: z.number().int(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(crmActivities).where(eq(crmActivities.id, input.activityId));
      const act = rows[0];
      if (!act) throw new TRPCError({ code: "NOT_FOUND" });
      // ownership check via the parent deal
      await getOwnedDeal(ctx, act.dealId);
      await db.update(crmActivities).set({ done: input.done }).where(eq(crmActivities.id, act.id));
      return { ok: true };
    }),

  // ── Delete a deal (and its activities) ──────────────────────────────────────
  remove: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id);
      await db.delete(crmActivities).where(eq(crmActivities.dealId, deal.id));
      await db.delete(crmDeals).where(eq(crmDeals.id, deal.id));
      return { ok: true };
    }),

  // ── Importable leads: platform activity not yet a deal in this scope ─────────
  // Admin: pro applications + house (unattributed) order requests.
  // Affiliate: their own referred order requests.
  importableLeads: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { orderRequests: [], proApplications: [] };
    const scope = await resolveScope(ctx);

    // Contractors don't import platform leads; they only work their own saved-plan deals.
    if (scope.kind === "contractor") return { orderRequests: [], proApplications: [] };

    // already-imported source ids in this scope
    const existingWhere = scopeWhere(scope);
    const existingQ = db.select().from(crmDeals);
    const existing = await (existingWhere ? existingQ.where(existingWhere) : existingQ);
    const usedOrderReqIds = new Set(existing.map((d) => d.orderRequestId).filter(Boolean) as number[]);
    const usedProAppIds = new Set(existing.map((d) => d.proApplicationId).filter(Boolean) as number[]);

    if (scope.kind === "affiliate") {
      const reqs = await db
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.affiliateId, scope.affiliateId))
        .orderBy(desc(orderRequests.createdAt));
      return {
        orderRequests: reqs.filter((r) => !usedOrderReqIds.has(r.id)).slice(0, 50),
        proApplications: [],
      };
    }

    // house/admin
    const reqs = await db
      .select()
      .from(orderRequests)
      .where(isNull(orderRequests.affiliateId))
      .orderBy(desc(orderRequests.createdAt));
    const apps = await db
      .select()
      .from(proApplications)
      .orderBy(desc(proApplications.createdAt));
    return {
      orderRequests: reqs.filter((r) => !usedOrderReqIds.has(r.id)).slice(0, 50),
      proApplications: apps.filter((a) => !usedProAppIds.has(a.id)).slice(0, 50),
    };
  }),

  // ── Import a platform lead into the pipeline as a new deal ───────────────────
  importLead: protectedProcedure
    .input(
      z.object({
        type: z.enum(["order_request", "pro_application"]),
        id: z.number().int(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      const affiliateId = scope.kind === "affiliate" ? scope.affiliateId : null;

      if (input.type === "order_request") {
        const rows = await db.select().from(orderRequests).where(eq(orderRequests.id, input.id));
        const r = rows[0];
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        // affiliate scope can only import their own referred requests
        if (scope.kind === "affiliate" && r.affiliateId !== scope.affiliateId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const res = await db.insert(crmDeals).values({
          affiliateId,
          ownerUserId: ctx.user.id,
          title: `Order ${r.requestNumber}${r.originatorName ? ` — ${r.originatorName}` : ""}`,
          stage: "qualified",
          priority: "medium",
          contactName: r.originatorName ?? null,
          contactEmail: r.originatorEmail ?? null,
          contactPhone: r.originatorPhone ?? null,
          location: ([r.shippingAddressLine1, r.shippingAddressLine2, r.shippingCity, r.shippingState, r.zip]
            .filter(Boolean)
            .join(", ") || r.zip) || null,
          estimatedValue: r.totalAmount ?? null,
          source: "order_request",
          orderRequestId: r.id,
          referralCode: r.referralCode ?? null,
        });
        return { id: (res as unknown as [{ insertId: number }])[0].insertId };
      }

      // pro_application (admin-only source)
      if (scope.kind === "affiliate") throw new TRPCError({ code: "FORBIDDEN" });
      const rows = await db.select().from(proApplications).where(eq(proApplications.id, input.id));
      const a = rows[0];
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      const res = await db.insert(crmDeals).values({
        affiliateId: null,
        ownerUserId: ctx.user.id,
        title: `Pro — ${a.companyName}`,
        stage: "new",
        priority: "medium",
        contactName: a.contactName,
        contactEmail: a.email,
        contactPhone: a.phone ?? null,
        company: a.companyName,
        location: a.baseZip ?? null,
        source: "pro_application",
        proApplicationId: a.id,
      });
      return { id: (res as unknown as [{ insertId: number }])[0].insertId };
    }),

  // ── Request a quote from a saved design (member-facing) ──────────────────────
  // Affiliate-owned designs create or reuse deals only in their owning affiliate
  // CRM. Non-affiliate designs retain the existing house pipeline behavior.
  requestQuoteFromDesign: protectedProcedure
    .input(
      z.object({
        designId: z.number().int(),
        contactName: z.string().max(256).nullable().optional(),
        contactEmail: z.string().max(320).nullable().optional(),
        contactPhone: z.string().max(32).nullable().optional(),
        estimatedValue: z.number().min(0).nullable().optional(),
        notes: z.string().max(8000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // The design must belong to the caller.
      const dRows = await db
        .select()
        .from(kitchenDesigns)
        .where(and(eq(kitchenDesigns.id, input.designId), eq(kitchenDesigns.userId, ctx.user.id)))
        .limit(1);
      const design = dRows[0];
      if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });

      // If this design is already linked to its owning CRM deal, reuse it.
      const links = await db
        .select()
        .from(crmDealDesigns)
        .where(eq(crmDealDesigns.designId, design.id));
      for (const link of links) {
        const existingDeal = await db
          .select()
          .from(crmDeals)
          .where(and(eq(crmDeals.id, link.dealId), design.affiliateId == null ? isNull(crmDeals.affiliateId) : eq(crmDeals.affiliateId, design.affiliateId)))
          .limit(1);
        if (existingDeal[0]) {
          await db
            .update(crmDeals)
            .set({ updatedAt: new Date() })
            .where(eq(crmDeals.id, existingDeal[0].id));
          return { id: existingDeal[0].id, reused: true };
        }
      }

      // Build a sensible title from the project/room/design name.
      const job = design.projectName?.trim();
      const room = design.roomLabel?.trim();
      const who = (input.contactName ?? "").trim();
      const baseLabel = job
        ? `${job}${room ? ` — ${room}` : ""}`
        : design.name;
      const title = who ? `${baseLabel} — ${who}` : baseLabel;

      const res = await db.insert(crmDeals).values({
        affiliateId: design.affiliateId,
        ownerUserId: ctx.user.id,
        title: title.slice(0, 256),
        stage: "new",
        priority: "medium",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? ctx.user.email ?? null,
        contactPhone: input.contactPhone ?? null,
        company: design.projectName ?? null,
        estimatedValue: input.estimatedValue != null ? String(input.estimatedValue) : null,
        source: "storefront",
        notes:
          input.notes ??
          `Quote requested from the designer. Room type: ${design.roomType ?? "kitchen"}.`,
      });
      const dealId = (res as unknown as [{ insertId: number }])[0].insertId;

      await db.insert(crmDealDesigns).values({
        dealId,
        designId: design.id,
        designName: design.name,
        linkedByUserId: ctx.user.id,
      });

            return { id: dealId, reused: false };
    }),

  // ── Sales-rep commissions: list (admin) ────────────────────────────────────
  // Admin sees all commissions; a sales rep sees only their own.
  listCommissions: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "paid", "void", "all"]).default("all") }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [] as (typeof salesCommissions.$inferSelect)[];
      const isStaff = ["admin"].includes(ctx.user.role);
      const conds = [];
      if (!isStaff) {
        if (ctx.user.role !== "sales_rep") return [];
        conds.push(eq(salesCommissions.repUserId, ctx.user.id));
      }
      const status = input?.status ?? "all";
      if (status !== "all") conds.push(eq(salesCommissions.status, status));
      return db
        .select()
        .from(salesCommissions)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(salesCommissions.wonAt))
        .limit(500);
    }),

  // ── Sales-rep commissions: mark paid / void (admin only) ────────────────────
  // ── Admin: CRM deals for a specific affiliate ─────────────────────────────
  adminAffiliateDeals: adminProcedure
    .input(z.object({ affiliateId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { deals: [] as (typeof crmDeals.$inferSelect)[] };
      const deals = await db
        .select()
        .from(crmDeals)
        .where(eq(crmDeals.affiliateId, input.affiliateId))
        .orderBy(crmDeals.boardOrder, desc(crmDeals.updatedAt));
      return { deals };
    }),

  setCommissionStatus: adminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["pending", "paid", "void"]), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const patch: Partial<typeof salesCommissions.$inferInsert> = { status: input.status };
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.status === "paid") {
        patch.paidAt = new Date();
        patch.paidByUserId = ctx.user.id;
      } else {
        patch.paidAt = null;
        patch.paidByUserId = null;
      }
      await db.update(salesCommissions).set(patch).where(eq(salesCommissions.id, input.id));
      return { ok: true };
    }),
});
// (exported helpers kept internal; inArray imported for potential batch ops)
void inArray;

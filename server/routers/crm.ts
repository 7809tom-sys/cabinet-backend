import { z } from "zod";
import { and, eq, desc, isNull, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { isEnumValueError, isMissingSchemaError, ORDER_SCHEMA_MESSAGES } from "../lib/orderSchemaGuard";
import { newSaleStagePresent, readOrderSchemaSupport } from "../lib/orderSchemaSupport";
import { readDealImageCounts } from "../lib/orderSideEffects";
import {
  crmDeals,
  crmActivities,
  crmDealDesigns,
  crmEmailLog,
  crmEmailDrafts,
  notificationSettings,
  distributors,
  kitchenDesigns,
  threeDRoomShares,
  affiliates,
  orderRequests,
  affiliateInstallationEstimates,
  proApplications,
  salesCommissions,
  users,
  designViewLog,
} from "../../drizzle/schema";
import {
  CRM_STAGES,
  CRM_PRIORITIES,
  CRM_ACTIVITY_KINDS,
  CRM_LANGUAGES,
  isClosedStage,
  crmEmailBodyToHtml,
  type CrmStage,
} from "@shared/crm";
import {
  SALES_REP_COMMISSION_CENTS,
  shouldCreateCommission,
} from "@shared/salesPrograms";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { listAccessibleAffiliateIds } from "../lib/affiliateSiteScope";
import { contractorRecordUserId } from "../lib/contractorRecordScope";
import { loadAffiliatePricingById } from "../lib/affiliateStorefrontPricing";
import { sumPlacedAffiliateSale } from "../lib/affiliateTierPricing";
import { verifyUsAddress, formatEnteredAddress } from "../lib/addressVerification";
import { buildCrmInvoiceEmailHtml, createCrmInvoicePdf } from "../crmInvoicePdf";
import { usableInvoicePrefill, verifiedFreightInvoicePrefill } from "../crmInvoicePrefill";
import { groupedDesignInvoiceMaterials } from "../crmDesignInvoice";
import { crmCustomerImportIdentities, prepareCrmCustomerImport } from "@shared/crmCustomerListImport";
import { sendEmail } from "../email";
import { loadCrmOutboundPlan } from "../lib/crmOutboundMail";
import { sendCrmDealEmail } from "../lib/crmCustomerMail";
import { distributorPoAttachmentNames } from "../lib/distributorOrderEmail";
import { contactEmailToBackfill, loadDealInvoiceRecipient, usableInvoiceEmail } from "../lib/invoiceRecipient";
import { buildOrderDistributorMessage } from "../lib/orderSideEffects";
import { createDistributorPoPdf } from "../lib/distributorPoPdf";
import { crmHtmlToText, crmMailboxVisible, sanitizeCrmEmailHtml } from "@shared/crmMailbox";
import {
  newlyRequestedCrmHelpKinds,
  recipientsForCrmHelpNotification,
  type CrmHelpNotificationKind,
} from "../lib/crmHelpNotifications";

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

async function loadCrmOutbound(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  dealAffiliateId: number | null,
) {
  return loadCrmOutboundPlan(db, dealAffiliateId);
}

async function notifyCrmHelpTeam(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  deal: typeof crmDeals.$inferSelect,
  kind: CrmHelpNotificationKind,
): Promise<void> {
  try {
    const [settings] = await db.select().from(notificationSettings).limit(1);
    const recipients = recipientsForCrmHelpNotification(settings, kind);
    if (recipients.length === 0) return;

    const requestLabel = kind === "design" ? "Design Help" : "Shipping Cost Help";
    const customer = deal.contactName || deal.contactEmail || "Customer";
    const text = [
      `A CRM deal now needs ${requestLabel}.`,
      `Deal: ${deal.title}`,
      `Customer: ${customer}`,
      `Deal ID: ${deal.id}`,
      "",
      "Open Administration → CRM to review the deal and respond.",
    ].join("\n");
    const delivery = await sendEmail({
      to: recipients[0]!,
      cc: recipients.slice(1),
      subject: `CRM: ${requestLabel} requested — ${deal.title}`,
      text,
      html: crmEmailBodyToHtml(text),
    });
    if (!delivery.success) {
      console.error("[CRM] Help team notification failed", delivery.error ?? "send failed");
    }
  } catch (error) {
    // A mail outage cannot prevent the help request itself from being saved.
    console.error("[CRM] Help team notification failed", error);
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
 *  - admin + adminAll → { kind: "house" } (every deal). Any admin, not one account.
 *  - admin + affiliateId → that store only, including an admin who is also an affiliate.
 *  - admin with exactly one store and no opt-in → that store, never every deal.
 *  - contractor → { kind: "contractor", userId } (deals they own). Checked
 *    before affiliate team access so a contractor never sees another pipeline.
 *  - designer / sales_rep → { kind: "house" } unless they belong to an affiliate team
 *  - partner with an affiliate → { kind: "affiliate", affiliateId }
 * Throws FORBIDDEN if a non-house/contractor caller has no affiliate.
 */
export async function resolveScope(
  ctx: Ctx,
  requested?: { contractorUserId?: number; affiliateId?: number; adminAll?: boolean },
): Promise<CrmScope> {
  const contractorUserId = contractorRecordUserId(ctx.user, requested?.contractorUserId);
  if (ctx.user.role === "admin") {
    if (contractorUserId != null) return { kind: "contractor", userId: contractorUserId };
    if (requested?.adminAll) return { kind: "house" };
    if (requested?.affiliateId != null) return { kind: "affiliate", affiliateId: requested.affiliateId };
    const db = await getDb();
    const ids = db ? await listAccessibleAffiliateIds(db, ctx.user) : [];
    if (ids.length === 1) return { kind: "affiliate", affiliateId: ids[0] };
    if (ids.length > 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose which affiliate store to view." });
    }
    throw new TRPCError({ code: "BAD_REQUEST", message: "Open the admin directory to view every store." });
  }
  if (ctx.user.role === "contractor") return { kind: "contractor", userId: ctx.user.id };

  const affiliateAccess = await resolveMyAffiliateAccess(ctx);
  if (affiliateAccess) {
    if (!affiliateAccess.accessCrm) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "CRM access has not been enabled for this team member.",
      });
    }
    if (requested?.affiliateId != null && requested.affiliateId !== affiliateAccess.affiliateId) {
      const db = await getDb();
      const ids = db ? await listAccessibleAffiliateIds(db, ctx.user, { crm: true }) : [];
      if (!ids.includes(requested.affiliateId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view this store's own records." });
      }
      return { kind: "affiliate", affiliateId: requested.affiliateId };
    }
    return { kind: "affiliate", affiliateId: affiliateAccess.affiliateId };
  }

  // Internal platform CRM roles remain house-scoped when they are not linked
  // to an affiliate team invitation.
  if (ctx.user.role === "designer" || ctx.user.role === "sales_rep") {
    return { kind: "house" };
  }

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
export async function getOwnedDeal(
  ctx: Ctx,
  dealId: number,
  requested?: { contractorUserId?: number },
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const scope = await resolveScope(ctx, {
    ...requested,
    adminAll: ctx.user.role === "admin" && requested?.contractorUserId == null,
  });
  const where = scopeWhere(scope);
  const rows = await db
    .select()
    .from(crmDeals)
    .where(where ? and(eq(crmDeals.id, dealId), where) : eq(crmDeals.id, dealId));
  const deal = rows[0];
  if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found in your pipeline." });
  return { db, scope, deal };
}

type CrmDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function guardNewSaleStage(db: CrmDb, stage: string | undefined): Promise<void> {
  if (stage !== "new_sale") return;
  const support = await readOrderSchemaSupport(db);
  if (support && !newSaleStagePresent(support)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: ORDER_SCHEMA_MESSAGES.newSale });
  }
}

function rethrowNewSaleWrite(stage: string | undefined, error: unknown): never {
  if (stage === "new_sale" && (isEnumValueError(error) || isMissingSchemaError(error))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: ORDER_SCHEMA_MESSAGES.newSale });
  }
  throw error;
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
  needsHelpDesigning: z.boolean().optional(),
  needsHelpShipping: z.boolean().optional(),
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
      const callerScope = await resolveScope(ctx, input.affiliateId != null
        ? { affiliateId: input.affiliateId }
        : { adminAll: ctx.user.role === "admin" });
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
    .input(z.object({
      affiliateId: z.number().int().optional(),
      contractorUserId: z.number().int().positive().optional(),
      adminAll: z.literal(true).optional(),
    }).optional())
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
    if (input?.affiliateId != null && input?.contractorUserId != null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Pass either affiliateId or contractorUserId." });
    }
    // If an admin passes affiliateId, force the scope to that affiliate's deals.
    // contractorUserId narrows an admin to one contractor's own deals.
    const callerScope = await resolveScope(ctx, {
      contractorUserId: input?.contractorUserId,
      affiliateId: input?.affiliateId,
      adminAll: input?.adminAll,
    });
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
    const orderIds = deals.map((deal) => deal.orderRequestId).filter((id): id is number => id != null);
    const imageCounts = await readDealImageCounts(db, orderIds);
    const decoratedDeals = deals.map((deal) => {
      const extra = deal.orderRequestId == null ? undefined : imageCounts.get(deal.orderRequestId);
      return {
        ...deal,
        imageGeneratedCount: extra?.imageGeneratedCount ?? 0,
        lastImageGeneratedAt: extra?.lastImageGeneratedAt ?? null,
        saleRefundedAt: extra?.saleRefundedAt ?? null,
      };
    });
    return {
      scope: scope.kind as "house" | "affiliate" | "contractor",
      affiliateId: (scope.kind === "affiliate" ? scope.affiliateId : null) as number | null,
      deals: decoratedDeals,
      affiliateNames,
      affiliateBranding,
      isMasterView,
    };
  }),

  // ── Deal detail + its activity timeline ─────────────────────────────────────
  deal: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      contractorUserId: z.number().int().positive().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id, { contractorUserId: input.contractorUserId });
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
      const linkedOrder = deal.orderRequestId == null
        ? null
        : (await db.select({ kitchenDesignId: orderRequests.kitchenDesignId, totalAmount: orderRequests.totalAmount })
          .from(orderRequests)
          .where(eq(orderRequests.id, deal.orderRequestId))
          .limit(1))[0] ?? null;
      const savedDesignRows = linkedDesignIds.length === 0
        ? []
        : await db.select({
          id: kitchenDesigns.id,
          name: kitchenDesigns.name,
          affiliateId: kitchenDesigns.affiliateId,
          createdAt: kitchenDesigns.createdAt,
          updatedAt: kitchenDesigns.updatedAt,
          selectedStyleId: kitchenDesigns.selectedStyleId,
          selectedDistributorId: kitchenDesigns.selectedDistributorId,
          selectedSurfaces: kitchenDesigns.selectedSurfaces,
          placedCabinets: kitchenDesigns.placedCabinets,
        })
          .from(kitchenDesigns)
          .where(inArray(kitchenDesigns.id, linkedDesignIds));
      const viewRows = linkedDesignIds.length === 0
        ? []
        : await db.select().from(designViewLog)
          .where(inArray(designViewLog.designId, linkedDesignIds))
          .orderBy(desc(designViewLog.viewedAt))
          .limit(200);
      const viewsByDesignId = new Map<number, typeof viewRows>();
      for (const v of viewRows) viewsByDesignId.set(v.designId, [...(viewsByDesignId.get(v.designId) ?? []), v]);
      const savedDesignById = new Map(savedDesignRows.map((design) => [design.id, design]));
      const tierSaleByDesignId = new Map<number, number>();
      if (deal.affiliateId != null) {
        const affiliatePricing = await loadAffiliatePricingById(deal.affiliateId);
        if (affiliatePricing) {
          for (const design of savedDesignRows) {
            if (design.affiliateId !== deal.affiliateId) continue;
            const total = await sumPlacedAffiliateSale(
              db,
              affiliatePricing,
              design.placedCabinets,
              design.selectedStyleId,
              design.selectedDistributorId ?? null,
            );
            if (total != null && total > 0) tierSaleByDesignId.set(design.id, total);
          }
        }
      }
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
        const tierSale = tierSaleByDesignId.get(link.designId) ?? 0;
        const submittedOrderValue = linkedOrder?.kitchenDesignId === link.designId ? Number(linkedOrder.totalAmount ?? 0) : 0;
        const designValue = tierSale > 0 ? tierSale : shareSubtotal > 0 ? shareSubtotal : submittedOrderValue > 0 ? submittedOrderValue : 0;
	      const creatorAffiliate = savedDesign.affiliateId == null ? null : linkedAffiliateById.get(savedDesign.affiliateId) ?? null;
        return [{
          ...link,
	        designName: savedDesign.name,
	        designUpdatedAt: savedDesign.updatedAt,
	        creatorScope: creatorAffiliate?.slug ?? "owner",
          creatorStoreName: creatorAffiliate?.storeName ?? "Cabinet Dealz",
          designUrl: designScopePath(creatorAffiliate?.slug ?? null, savedDesign.id, deal.id),
          designCreatedAt: savedDesign.createdAt,
          viewCount: (viewsByDesignId.get(link.designId) ?? []).length,
          lastViewedAt: (viewsByDesignId.get(link.designId) ?? [])[0]?.viewedAt ?? null,
          recentViews: (viewsByDesignId.get(link.designId) ?? []).slice(0, 10).map((v) => ({ viewedAt: v.viewedAt, viewerName: v.viewerName, viewerKind: v.viewerKind })),
          selectedStyleId: savedDesign.selectedStyleId,
          selectedSurfaces: savedDesign.selectedSurfaces,
          designOrderValue: deal.estimatedValue,
          // A zero plan share is not an authorized sell price. Keep it out of
          // the invoice until a verified saved-order subtotal exists.
          catalogSubtotal: designValue > 0 ? designValue.toFixed(2) : null,
          catalogSubtotalSource: tierSale > 0
            ? "Affiliate pricing tier"
            : shareSubtotal > 0
            ? "Saved design catalog subtotal"
            : submittedOrderValue > 0
              ? "Submitted order value"
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
      const laborOwner = deal.affiliateId != null
        ? eq(affiliateInstallationEstimates.affiliateId, deal.affiliateId)
        : deal.ownerUserId != null
          ? eq(affiliateInstallationEstimates.contractorUserId, deal.ownerUserId)
          : null;
      const laborEstimateRows = laborOwner == null || (!deal.orderRequestId && !deal.contactEmail && !deal.laborEstimateId)
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
          .where(laborOwner!)
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
      const invoiceRecipient = await loadDealInvoiceRecipient(db, {
        contactEmail: deal.contactEmail,
        orderRequestId: deal.orderRequestId,
      });
      return { deal, activities, linkedDesigns, emails, invoiceBrand, invoicePrefill, invoiceRecipient, laborEstimates };
    }),

  // ── Saved designs compatible with this CRM scope/deal ──────────────────────
  linkableDesigns: protectedProcedure
	  .input(z.object({
      dealId: z.number().int().positive().optional(),
      contractorUserId: z.number().int().positive().optional(),
    }).optional())
	  .query(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) return [];
	    const scope = await resolveScope(ctx, {
	      contractorUserId: input?.contractorUserId,
	      adminAll: ctx.user.role === "admin" && input?.contractorUserId == null,
	    });
	    const deal = input?.dealId != null ? (await getOwnedDeal(ctx, input.dealId, { contractorUserId: input?.contractorUserId })).deal : null;
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
    .input(z.object({
      dealId: z.number().int(),
      designId: z.number().int(),
      contractorUserId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, scope, deal } = await getOwnedDeal(ctx, input.dealId, { contractorUserId: input.contractorUserId });
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
	    if (scope.kind === "contractor" && design.userId !== scope.userId) {
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
      const { db, deal, scope } = await getOwnedDeal(ctx, input.dealId);
      if (input.laborEstimateId == null) {
        await db.update(crmDeals)
          .set({ laborEstimateId: null, updatedAt: new Date() })
          .where(eq(crmDeals.id, deal.id));
        return { ok: true, laborEstimateId: null };
      }
      if (scope.kind === "contractor") {
        const rows = await db.select({
          id: affiliateInstallationEstimates.id,
          crmDealId: affiliateInstallationEstimates.crmDealId,
          contractorUserId: affiliateInstallationEstimates.contractorUserId,
          orderRequestId: affiliateInstallationEstimates.orderRequestId,
          customerEmail: affiliateInstallationEstimates.customerEmail,
          status: affiliateInstallationEstimates.status,
        }).from(affiliateInstallationEstimates)
          .where(eq(affiliateInstallationEstimates.id, input.laborEstimateId))
          .limit(1);
        const laborEstimate = rows[0];
        if (!laborEstimate || laborEstimate.contractorUserId !== scope.userId || laborEstimate.status === "cancelled" || !laborEstimateMatchesDeal(laborEstimate, deal)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Labor estimate is not available for this deal." });
        }
        await db.update(crmDeals).set({ laborEstimateId: laborEstimate.id, updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
        return { ok: true, laborEstimateId: laborEstimate.id };
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
    .input(z.object({
      ...dealCoreInput,
      affiliateId: z.number().int().optional(),
      contractorUserId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.affiliateId != null && input.contractorUserId != null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pass either affiliateId or contractorUserId." });
      }
      const scope = await resolveScope(ctx, {
        contractorUserId: input.contractorUserId,
        affiliateId: input.affiliateId,
        adminAll: ctx.user.role === "admin" && input.affiliateId == null && input.contractorUserId == null,
      });
      const stage = (input.stage ?? "new") as CrmStage;
      await guardNewSaleStage(db, stage);
      let res: unknown;
      try {
        res = await db.insert(crmDeals).values({
          affiliateId: scope.kind === "affiliate"
            ? scope.affiliateId
            : (input.affiliateId != null && scope.kind === "house" ? input.affiliateId : null),
          ownerUserId: scope.kind === "contractor" ? scope.userId : ctx.user.id,
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
          needsHelpClosing: input.needsHelpClosing ?? false,
          needsHelpDesigning: input.needsHelpDesigning ?? false,
          needsHelpShipping: input.needsHelpShipping ?? false,
          closedAt: isClosedStage(stage) ? new Date() : null,
        });
      } catch (error) {
        rethrowNewSaleWrite(stage, error);
      }
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
      if (input.needsHelpDesigning !== undefined) patch.needsHelpDesigning = input.needsHelpDesigning;
      if (input.needsHelpShipping !== undefined) patch.needsHelpShipping = input.needsHelpShipping;
      if (input.stage !== undefined && input.stage !== deal.stage) {
        await guardNewSaleStage(db, input.stage);
        patch.stage = input.stage;
        patch.closedAt = isClosedStage(input.stage as CrmStage) ? new Date() : null;
      }
      if (Object.keys(patch).length > 0) {
        try {
          await db.update(crmDeals).set(patch).where(eq(crmDeals.id, deal.id));
        } catch (error) {
          rethrowNewSaleWrite(input.stage, error);
        }
      }
      const newlyRequestedHelpKinds = newlyRequestedCrmHelpKinds(deal, input);
      for (const kind of newlyRequestedHelpKinds) {
        await notifyCrmHelpTeam(db, deal, kind);
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
      await guardNewSaleStage(db, input.stage);
      try {
        await db
          .update(crmDeals)
          .set({
            stage: input.stage,
            boardOrder: input.boardOrder ?? deal.boardOrder,
            closedAt: isClosedStage(input.stage) ? new Date() : null,
          })
          .where(eq(crmDeals.id, deal.id));
      } catch (error) {
        rethrowNewSaleWrite(input.stage, error);
      }
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

  // ── Resend readiness for the composer (no secrets returned) ──────────────────
  // Ready only when RESEND_API_KEY and ORDER_EMAIL_FROM are both set. A saved
  // SMTP row does not make the composer ready. This check is transport-only:
  // a missing invoice recipient is reported by sendInvoiceEmail. Affiliate
  // deals include replyTo for the store address.
  emailReadiness: protectedProcedure
    .input(z.object({ dealId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { configured: false, enabled: false, from: "", channel: "platform" as const, replyTo: null as string | null };
      let affiliateId: number | null = null;
      if (input?.dealId) {
        affiliateId = (await getOwnedDeal(ctx, input.dealId)).deal.affiliateId;
      } else {
        const scope = await resolveScope(ctx, ctx.user.role === "admin" ? { adminAll: true } : undefined);
        if (scope.kind === "affiliate") affiliateId = scope.affiliateId;
      }
      const plan = await loadCrmOutbound(db, affiliateId);
      if (!plan.ok) {
        return {
          configured: plan.reason !== "not_configured",
          enabled: false,
          from: "",
          channel: affiliateId == null ? "platform" as const : "platform_fallback" as const,
          replyTo: null,
        };
      }
      return {
        configured: true,
        enabled: true,
        from: plan.from,
        channel: plan.channel,
        replyTo: plan.replyTo ?? null,
      };
    }),

  // ── Send an email to a deal contact ─────────────────────────────────────────
  // Customer compose, follow-ups, and design links use this path. Delivery is
  // Resend when configured and SMTP otherwise. Every send is logged on the deal.
  sendEmail: protectedProcedure
    .input(
      z.object({
        dealId: z.number().int(),
        to: z.string().email(),
        subject: z.string().min(1).max(512),
        body: z.string().min(1).max(20000),
        html: z.string().max(50000).optional(),
        draftId: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, scope, deal } = await getOwnedDeal(ctx, input.dealId);
      const plan = await loadCrmOutbound(db, deal.affiliateId);
      const html = sanitizeCrmEmailHtml(input.html?.trim() || crmEmailBodyToHtml(input.body));
      const text = input.html ? crmHtmlToText(input.html) : input.body;
      const senderName = ctx.user.email ?? String(ctx.user.id);
      await sendCrmDealEmail(db, {
        dealId: deal.id,
        affiliateId: deal.affiliateId,
        to: input.to,
        subject: input.subject,
        text,
        html,
        sentByUserId: ctx.user.id,
        sentByName: senderName,
        activityBody: `Email sent to ${input.to} — ${input.subject}`,
        logBody: input.html?.trim() || input.body,
      });
      if (input.draftId) {
        const [draft] = await db.select().from(crmEmailDrafts).where(eq(crmEmailDrafts.id, input.draftId)).limit(1);
        const visible = draft != null && crmMailboxVisible(
          scope.kind === "house" ? { kind: "house" } : scope.kind === "affiliate" ? { kind: "affiliate", affiliateId: scope.affiliateId } : { kind: "contractor", userId: scope.userId },
          draft,
        );
        if (visible && draft) await db.delete(crmEmailDrafts).where(eq(crmEmailDrafts.id, draft.id));
      }
      return { ok: true, channel: plan.ok ? plan.channel : "platform" };
    }),

  // ── Send a final branded invoice PDF to the CRM lead contact ────────────────
  // The address is the one the deal owner typed, otherwise the lead, the linked
  // order, the stored Stripe checkout row, the customer account, or a live
  // Stripe customer email. A blank lead is filled in when the invoice is sent.
  sendInvoiceEmail: protectedProcedure
    .input(z.object({
      dealId: z.number().int(),
      to: z.string().trim().email().max(320).optional(),
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
      const typed = usableInvoiceEmail(input.to);
      const resolved = typed ? null : await loadDealInvoiceRecipient(db, {
        contactEmail: deal.contactEmail,
        orderRequestId: deal.orderRequestId,
      });
      const to = typed ?? resolved?.email ?? null;
      if (!to) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "missing_recipient" });
      }

      const plan = await loadCrmOutbound(db, deal.affiliateId);
      if (!plan.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: plan.reason });

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
      await sendCrmDealEmail(db, {
        dealId: deal.id,
        affiliateId: deal.affiliateId,
        to,
        subject,
        text: `Your invoice ${invoiceNumber} from ${brand.storeName} is attached.`,
        html: buildCrmInvoiceEmailHtml(invoice),
        attachments: [{
          filename: `${invoiceNumber}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        }],
        sentByUserId: ctx.user.id,
        sentByName: ctx.user.email ?? String(ctx.user.id),
        activityBody: `Branded invoice PDF ${invoiceNumber} sent to ${to}${linkedDesignName ? ` · Linked design: ${linkedDesignName}` : ""}.`,
        logBody: `Branded invoice PDF ${invoiceNumber} attached.`,
      });
      // Persist the address only after the message is accepted. A blocked or
      // rejected send must leave a blank lead email unchanged, and a usable
      // lead email is never overwritten.
      const backfill = contactEmailToBackfill(deal.contactEmail, to);
      if (backfill) {
        await db.update(crmDeals).set({ contactEmail: backfill }).where(eq(crmDeals.id, deal.id));
      }
      return { ok: true, invoiceNumber };
    }),

  // ── Email the customer a linked design ──────────────────────────────────────
  sendDesign: protectedProcedure
    .input(z.object({
      dealId: z.number().int(),
      designLinkId: z.number().int(),
      note: z.string().trim().max(4000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      const to = deal.contactEmail?.trim();
      if (!to) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "missing_recipient" });
      const [link] = await db.select().from(crmDealDesigns)
        .where(and(eq(crmDealDesigns.id, input.designLinkId), eq(crmDealDesigns.dealId, deal.id)))
        .limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Linked design not found." });
      const [saved] = await db.select({
        id: kitchenDesigns.id,
        name: kitchenDesigns.name,
        affiliateId: kitchenDesigns.affiliateId,
      }).from(kitchenDesigns).where(eq(kitchenDesigns.id, link.designId)).limit(1);
      if (!saved) throw new TRPCError({ code: "NOT_FOUND", message: "Saved design not found." });
      const slug = saved.affiliateId == null
        ? null
        : (await db.select({ slug: affiliates.slug }).from(affiliates).where(eq(affiliates.id, saved.affiliateId)).limit(1))[0]?.slug ?? null;
      const path = designScopePath(slug, saved.id, deal.id);
      const origin = ctx.req.headers.origin ?? `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const url = `${origin}${path}`;
      const note = input.note?.trim();
      const text = [
        deal.contactName ? `Hi ${deal.contactName},` : "Hello,",
        "",
        `Here is your kitchen design "${saved.name}":`,
        url,
        note ? "" : null,
        note || null,
      ].filter((line): line is string => line != null).join("\n");
      const html = `<p>${deal.contactName ? `Hi ${deal.contactName},` : "Hello,"}</p><p>Here is your kitchen design <strong>${saved.name}</strong>.</p><p><a href="${url}">${url}</a></p>${note ? `<p>${note.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : ""}`;
      await sendCrmDealEmail(db, {
        dealId: deal.id,
        affiliateId: deal.affiliateId,
        to,
        subject: `Your kitchen design: ${saved.name}`,
        text,
        html,
        sentByUserId: ctx.user.id,
        sentByName: ctx.user.email ?? String(ctx.user.id),
        activityBody: `Design link sent to ${to} — ${saved.name}`,
        logBody: text,
      });
      return { ok: true, sentTo: to, designName: saved.name };
    }),

  distributorRecipients: protectedProcedure
    .input(z.object({ dealId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { db } = await getOwnedDeal(ctx, input.dealId);
      const rows = await db.select({
        id: distributors.id,
        name: distributors.name,
        orderEmail: distributors.orderEmail,
      }).from(distributors).where(eq(distributors.isActive, true)).limit(200);
      return rows
        .filter((row) => !!row.orderEmail?.trim())
        .map((row) => ({ id: row.id, name: row.name, orderEmail: row.orderEmail!.trim() }));
    }),

  // ── Email a distributor from the deal ───────────────────────────────────────
  emailDistributor: protectedProcedure
    .input(z.object({
      dealId: z.number().int(),
      distributorId: z.number().int(),
      subject: z.string().trim().min(1).max(512),
      body: z.string().trim().min(1).max(20000),
      attachPo: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      const [distributor] = await db.select({
        id: distributors.id,
        name: distributors.name,
        orderEmail: distributors.orderEmail,
      }).from(distributors).where(eq(distributors.id, input.distributorId)).limit(1);
      const to = distributor?.orderEmail?.trim();
      if (!distributor || !to) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This distributor does not have an order email." });
      }
      const replyTo = ctx.user.email?.trim();
      if (!replyTo) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your account does not have an email address for reply-to." });
      let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
      let logBody = input.body;
      if (input.attachPo) {
        if (deal.orderRequestId == null) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Link an order before attaching a purchase-order PDF." });
        }
        const po = await buildOrderDistributorMessage(db, deal.orderRequestId, distributor.id);
        if (!po) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This distributor has no lines on the deal's order." });
        }
        const pdf = await createDistributorPoPdf(po.document);
        const names = distributorPoAttachmentNames(po.orderNumber);
        attachments = [
          { filename: names.pdf, content: pdf, contentType: "application/pdf" },
          { filename: names.csv, content: Buffer.from(po.csv), contentType: "text/csv" },
        ];
        logBody = `${input.body}\n\nPurchase order PDF ${names.pdf} and CSV ${names.csv} attached for ${distributor.name}.`;
      }
      const html = crmEmailBodyToHtml(input.body);
      await sendCrmDealEmail(db, {
        dealId: deal.id,
        affiliateId: deal.affiliateId,
        to,
        subject: input.subject,
        text: input.body,
        html,
        attachments,
        replyTo,
        sentByUserId: ctx.user.id,
        sentByName: replyTo,
        activityBody: `Distributor email sent to ${distributor.name} (${to}) — ${input.subject}`,
        logBody,
        distributorId: distributor.id,
      });
      return { ok: true, sentTo: to, distributorName: distributor.name };
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
  importableLeads: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().optional(),
      adminAll: z.literal(true).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { orderRequests: [], proApplications: [] };
    const scope = await resolveScope(ctx, input ?? undefined);

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
        affiliateId: z.number().int().positive().optional(),
        adminAll: z.literal(true).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx, { affiliateId: input.affiliateId, adminAll: input.adminAll });
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
          const reuseSet: Record<string, unknown> = { updatedAt: new Date() };
          if (input.estimatedValue != null) reuseSet.estimatedValue = String(input.estimatedValue);
          if (!existingDeal[0].contactName && input.contactName) reuseSet.contactName = input.contactName;
          if (!existingDeal[0].contactPhone && input.contactPhone) reuseSet.contactPhone = input.contactPhone;
          await db
            .update(crmDeals)
            .set(reuseSet)
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
  // ── Sync design price + shipping + verified address to the design's deal ───
  // Called from the Designer. The address is re-verified on the server so a
  // browser can never mark an unverified address as verified.
  syncDesignQuoteToCrm: protectedProcedure
    .input(
      z.object({
        designId: z.number().int(),
        contactName: z.string().max(256).nullable().optional(),
        contactEmail: z.string().max(320).nullable().optional(),
        contactPhone: z.string().max(32).nullable().optional(),
        designValue: z.number().min(0).max(100_000_000),
        shippingQuote: z.number().min(0).max(10_000_000).nullable().optional(),
        address: z.object({
          line1: z.string().min(1).max(256),
          line2: z.string().max(256).nullable().optional(),
          city: z.string().min(1).max(128),
          state: z.string().length(2),
          zip: z.string().min(5).max(16),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const dRows = await db
        .select()
        .from(kitchenDesigns)
        .where(eq(kitchenDesigns.id, input.designId))
        .limit(1);
      const design = dRows[0];
      // Allowed: the design's owner, or a member of the SAME affiliate's team.
      // Never another affiliate or the house.
      let allowed = design != null && design.userId === ctx.user.id;
      if (design && !allowed && design.affiliateId != null) {
        const access = await resolveAffiliateAccess(db, ctx.user);
        allowed = access?.affiliateId === design.affiliateId && access.accessDesigner !== false;
      }
      if (!design || !allowed) throw new TRPCError({ code: "NOT_FOUND", message: "Save the design first, then sync it to the CRM." });
      const check = await verifyUsAddress(input.address);
      const addressText = check.formatted ?? formatEnteredAddress(input.address);
      const patch = {
        designValue: input.designValue.toFixed(2),
        estimatedValue: (input.designValue + (input.shippingQuote ?? 0)).toFixed(2),
        shippingQuote: input.shippingQuote != null ? input.shippingQuote.toFixed(2) : null,
        shippingAddress: addressText.slice(0, 512),
        shippingAddressVerified: check.verified,
        location: `${check.normalized?.city ?? input.address.city}, ${(check.normalized?.state ?? input.address.state).toUpperCase()} ${check.normalized?.zip ?? input.address.zip}`.slice(0, 256),
        designSyncedAt: new Date(),
        ...(input.contactName ? { contactName: input.contactName } : {}),
        ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
      };
      const links = await db.select().from(crmDealDesigns).where(eq(crmDealDesigns.designId, design.id));
      for (const link of links) {
        const rows = await db
          .select({ id: crmDeals.id })
          .from(crmDeals)
          .where(and(eq(crmDeals.id, link.dealId), design.affiliateId == null ? isNull(crmDeals.affiliateId) : eq(crmDeals.affiliateId, design.affiliateId)))
          .limit(1);
        if (rows[0]) {
          await db.update(crmDeals).set(patch).where(eq(crmDeals.id, rows[0].id));
          return { dealId: rows[0].id, created: false, verification: check };
        }
      }
      const who = (input.contactName ?? "").trim();
      const baseLabel = design.projectName?.trim() || design.name;
      const title = who ? `${who} — ${baseLabel}` : baseLabel;
      const res = await db.insert(crmDeals).values({
        affiliateId: design.affiliateId,
        ownerUserId: ctx.user.id,
        title: title.slice(0, 256),
        stage: "new",
        priority: "medium",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? ctx.user.email ?? null,
        company: design.projectName ?? null,
        source: "storefront",
        notes: `Design saved from the Designer. Room type: ${design.roomType ?? "kitchen"}.`,
        ...patch,
      });
      const dealId = (res as unknown as [{ insertId: number }])[0].insertId;
      await db.insert(crmDealDesigns).values({
        dealId,
        designId: design.id,
        designName: design.name,
        linkedByUserId: ctx.user.id,
      });
      return { dealId, created: true, verification: check };
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

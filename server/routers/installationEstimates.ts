import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { affiliateInstallationEstimates, affiliateTeamMembers, affiliates, cabinets, crmActivities, crmDealDesigns, crmDeals, kitchenDesigns, orderRequests } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { calculateInstallationEstimate, INSTALLATION_ROOM_TYPES, INSTALLATION_COST_TYPES } from "../../shared/installationEstimate";
import { createBlankKitchenCostDefaults, KITCHEN_COST_SHEET_DESCRIPTIONS } from "../../shared/kitchenCostSheet";
import { countKitchenCabinets, countKitchenCabinetWork, emptyKitchenCabinetBreakdown, type KitchenCabinetBreakdown } from "../../shared/kitchenPlanCabinetBreakdown";
import { resolveInstallationEstimateAffiliateId } from "../../shared/installationEstimateAccess";

const estimateLineSchema = z.object({
  description: z.string().trim().min(1).max(256),
  quantity: z.number().int("Quantity must be a whole number").positive().max(10_000),
  unitCost: z.number().min(0).max(1_000_000),
  costType: z.enum(INSTALLATION_COST_TYPES).default("labor"),
});

const estimateInputSchema = z.object({
  affiliateId: z.number().int().positive().optional(),
  orderRequestId: z.number().int().positive().nullable().optional(),
  customerName: z.string().trim().max(256).nullable().optional(),
  customerEmail: z.string().trim().email().max(320).nullable().optional(),
  customerPhone: z.string().trim().max(32).nullable().optional(),
  roomType: z.enum(INSTALLATION_ROOM_TYPES).default("Kitchen"),
  kitchenDesignId: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  taxAmount: z.number().min(0).max(1_000_000).default(0),
  markupPercent: z.number().min(0).max(10_000).default(0),
  lineItems: z.array(estimateLineSchema).min(1).max(100),
});

const kitchenCostDefaultSchema = z.object({
  description: z.enum(KITCHEN_COST_SHEET_DESCRIPTIONS),
  materialUnitCost: z.number().min(0).max(1_000_000),
  laborUnitCost: z.number().min(0).max(1_000_000),
});
const kitchenCostDefaultsInputSchema = z.array(kitchenCostDefaultSchema).min(KITCHEN_COST_SHEET_DESCRIPTIONS.length - 1).max(KITCHEN_COST_SHEET_DESCRIPTIONS.length);

type AuthUser = { id: number; email: string | null; role: string };

async function resolveAffiliateId(user: AuthUser, requestedAffiliateId?: number, requireDesigner = false) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const rows = await db.select().from(affiliates);
  const email = (user.email ?? "").toLowerCase();

  const memberships = await db.select().from(affiliateTeamMembers).where(and(
    eq(affiliateTeamMembers.isActive, true),
    or(eq(affiliateTeamMembers.userId, user.id), ...(email ? [eq(affiliateTeamMembers.email, email)] : [])),
  ));
  const affiliateId = resolveInstallationEstimateAffiliateId({
    user,
    requestedAffiliateId,
    affiliates: rows,
    memberships,
    requireDesigner,
  });
  if (affiliateId) return affiliateId;

  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to affiliate installation estimates." });
}

export const installationEstimatesRouter = router({
  kitchenPlans: protectedProcedure
    .input(z.object({ affiliateId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const affiliateId = await resolveAffiliateId(ctx.user, input?.affiliateId, true);
      const db = await getDb();
      if (!db) return [];
      const designs = await db.select({ id: kitchenDesigns.id, name: kitchenDesigns.name, projectName: kitchenDesigns.projectName, roomLabel: kitchenDesigns.roomLabel, updatedAt: kitchenDesigns.updatedAt, placedCabinets: kitchenDesigns.placedCabinets })
        .from(kitchenDesigns)
        .where(and(eq(kitchenDesigns.affiliateId, affiliateId), or(isNull(kitchenDesigns.roomType), eq(kitchenDesigns.roomType, "Kitchen"), eq(kitchenDesigns.roomType, "kitchen"))))
        .orderBy(desc(kitchenDesigns.updatedAt));
      const ids = Array.from(new Set(designs.flatMap((design) => (Array.isArray(design.placedCabinets) ? design.placedCabinets : []).map((item) => Number((item as { cabinetId?: number } | null)?.cabinetId)).filter((id) => Number.isInteger(id) && id > 0))));
      const catalogRows = ids.length
        ? await db.select({ id: cabinets.id, category: cabinets.category, subCategory: cabinets.subCategory, productType: cabinets.productType, placementType: cabinets.placementType, isNotCabinet: cabinets.isNotCabinet, numberOfDoors: cabinets.numberOfDoors, numberOfDrawers: cabinets.numberOfDrawers }).from(cabinets).where(inArray(cabinets.id, ids))
        : [];
      const cabinetById = new Map(catalogRows.map((row) => [row.id, row]));
      return designs.map((design) => ({
        id: design.id,
        name: design.name,
        projectName: design.projectName,
        roomLabel: design.roomLabel,
        updatedAt: design.updatedAt,
        cabinetBreakdown: countKitchenCabinets((Array.isArray(design.placedCabinets) ? design.placedCabinets : []) as Array<{ cabinetId?: number | null; qty?: number | null }>, cabinetById),
        workQuantities: countKitchenCabinetWork((Array.isArray(design.placedCabinets) ? design.placedCabinets : []) as Array<{ cabinetId?: number | null; qty?: number | null }>, cabinetById),
      }));
    }),

  kitchenCostDefaults: protectedProcedure
    .input(z.object({ affiliateId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const affiliateId = await resolveAffiliateId(ctx.user, input?.affiliateId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [affiliate] = await db.select({ kitchenCostDefaultsJson: affiliates.kitchenCostDefaultsJson })
        .from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
      const blank = createBlankKitchenCostDefaults();
      if (!affiliate?.kitchenCostDefaultsJson) return { defaults: blank, hasSavedDefaults: false };
      try {
        const saved = z.array(kitchenCostDefaultSchema).parse(JSON.parse(affiliate.kitchenCostDefaultsJson));
        const byDescription = new Map(saved.map((row) => [row.description, row]));
        return { defaults: blank.map((row) => ({ ...row, ...(byDescription.get(row.description) ?? {}) })), hasSavedDefaults: true };
      } catch {
        return { defaults: blank, hasSavedDefaults: false };
      }
    }),

  saveKitchenCostDefaults: protectedProcedure
    .input(z.object({ affiliateId: z.number().int().positive().optional(), defaults: kitchenCostDefaultsInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const affiliateId = await resolveAffiliateId(ctx.user, input.affiliateId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const byDescription = new Map(input.defaults.map((row) => [row.description, row]));
      const normalized = createBlankKitchenCostDefaults().map((row) => ({
        ...row,
        materialUnitCost: byDescription.get(row.description)?.materialUnitCost ?? 0,
        laborUnitCost: byDescription.get(row.description)?.laborUnitCost ?? 0,
      }));
      await db.update(affiliates).set({ kitchenCostDefaultsJson: JSON.stringify(normalized) }).where(eq(affiliates.id, affiliateId));
      return { success: true, defaults: normalized };
    }),

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
      const affiliateId = await resolveAffiliateId(ctx.user, input.affiliateId, input.roomType === "Kitchen" && input.kitchenDesignId != null);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.transaction(async (tx) => {
        const kitchenDesignId = input.roomType === "Kitchen" ? (input.kitchenDesignId ?? null) : null;
        let cabinetBreakdown: KitchenCabinetBreakdown | null = null;
        let kitchenDesignName: string | null = null;
        if (kitchenDesignId != null) {
          const [design] = await tx.select({ id: kitchenDesigns.id, name: kitchenDesigns.name, affiliateId: kitchenDesigns.affiliateId, placedCabinets: kitchenDesigns.placedCabinets })
            .from(kitchenDesigns)
            .where(and(eq(kitchenDesigns.id, kitchenDesignId), eq(kitchenDesigns.affiliateId, affiliateId), or(isNull(kitchenDesigns.roomType), eq(kitchenDesigns.roomType, "Kitchen"), eq(kitchenDesigns.roomType, "kitchen"))))
            .limit(1).for("update");
          if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "The selected kitchen plan was not found in this affiliate store." });
          kitchenDesignName = design.name;
          const placed = (Array.isArray(design.placedCabinets) ? design.placedCabinets : []) as Array<{ cabinetId?: number | null; qty?: number | null }>;
          const ids = Array.from(new Set(placed.filter(Boolean).map((item) => Number(item.cabinetId)).filter((id) => Number.isInteger(id) && id > 0)));
          const catalogRows = ids.length
            ? await tx.select({ id: cabinets.id, category: cabinets.category, subCategory: cabinets.subCategory, productType: cabinets.productType, placementType: cabinets.placementType, isNotCabinet: cabinets.isNotCabinet, numberOfDoors: cabinets.numberOfDoors, numberOfDrawers: cabinets.numberOfDrawers }).from(cabinets).where(inArray(cabinets.id, ids))
            : [];
          cabinetBreakdown = countKitchenCabinets(placed, new Map(catalogRows.map((row) => [row.id, row])));
        }
        if (input.orderRequestId != null) {
          const [order] = await tx.select({ id: orderRequests.id }).from(orderRequests)
            .where(and(eq(orderRequests.id, input.orderRequestId), eq(orderRequests.affiliateId, affiliateId))).limit(1);
          if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "The material order was not found in this affiliate store." });
        }
        const totals = calculateInstallationEstimate(input.lineItems, input.taxAmount, input.markupPercent);
        const shareToken = crypto.randomUUID().replace(/-/g, "");
        const result = await tx.insert(affiliateInstallationEstimates).values({
          affiliateId,
          shareToken,
          orderRequestId: input.orderRequestId ?? null,
          kitchenDesignId,
          customerName: input.customerName || null,
          customerEmail: input.customerEmail || null,
          customerPhone: input.customerPhone || null,
          roomType: input.roomType,
          cabinetBreakdown,
          notes: input.notes || null,
          lineItems: totals.lineItems,
          subtotal: String(totals.subtotal),
          markupPercent: String(totals.markupPercent),
          markupAmount: String(totals.markupAmount),
          taxAmount: String(totals.taxAmount),
          totalAmount: String(totals.totalAmount),
        });
        const estimateId = Number((result as unknown as [{ insertId: number }])[0].insertId);
        let crmDealId: number | null = null;
        if (input.roomType === "Kitchen" && (kitchenDesignId != null || input.customerName || input.customerEmail || input.customerPhone)) {
          let matching = kitchenDesignId == null ? [] : await tx.select({ id: crmDeals.id })
            .from(crmDealDesigns).innerJoin(crmDeals, eq(crmDeals.id, crmDealDesigns.dealId))
            .where(and(eq(crmDealDesigns.designId, kitchenDesignId), eq(crmDeals.affiliateId, affiliateId)))
            .orderBy(desc(crmDeals.updatedAt)).limit(1);
          if (!matching.length && input.orderRequestId) matching = await tx.select({ id: crmDeals.id }).from(crmDeals)
            .where(and(eq(crmDeals.affiliateId, affiliateId), eq(crmDeals.orderRequestId, input.orderRequestId)))
            .orderBy(desc(crmDeals.updatedAt)).limit(1);
          if (!matching.length && input.customerEmail) matching = await tx.select({ id: crmDeals.id }).from(crmDeals)
            .where(and(eq(crmDeals.affiliateId, affiliateId), eq(crmDeals.contactEmail, input.customerEmail)))
            .orderBy(desc(crmDeals.updatedAt)).limit(1);
          if (matching[0]) {
            crmDealId = matching[0].id;
            await tx.update(crmDeals).set({ laborEstimateId: estimateId, updatedAt: new Date() }).where(eq(crmDeals.id, crmDealId));
          } else {
            const breakdown = cabinetBreakdown ?? emptyKitchenCabinetBreakdown();
            const title = `${kitchenDesignName ?? "Kitchen installation"}${input.customerName ? ` — ${input.customerName}` : ""}`.slice(0, 256);
            const dealResult = await tx.insert(crmDeals).values({ affiliateId, ownerUserId: ctx.user.id, title, stage: "new", priority: "medium", contactName: input.customerName ?? null, contactEmail: input.customerEmail ?? null, contactPhone: input.customerPhone ?? null, source: "manual", orderRequestId: input.orderRequestId ?? null, laborEstimateId: estimateId, notes: `Auto-created from the Kitchen labor estimator.${kitchenDesignId != null ? ` Saved plan: ${kitchenDesignName ?? `#${kitchenDesignId}`}.` : ""} Cabinet count — Base: ${breakdown.base}, Wall: ${breakdown.wall}, Tall: ${breakdown.tall}, Total: ${breakdown.total}.` });
            crmDealId = Number((dealResult as unknown as [{ insertId: number }])[0].insertId);
          }
          if (kitchenDesignId != null && crmDealId != null) {
            const [existingLink] = await tx.select({ id: crmDealDesigns.id }).from(crmDealDesigns).where(and(eq(crmDealDesigns.dealId, crmDealId), eq(crmDealDesigns.designId, kitchenDesignId))).limit(1);
            if (!existingLink) await tx.insert(crmDealDesigns).values({ dealId: crmDealId, designId: kitchenDesignId, designName: kitchenDesignName ?? `Kitchen plan #${kitchenDesignId}`, linkedByUserId: ctx.user.id });
          }
        }
        if (crmDealId != null) {
          await tx.update(affiliateInstallationEstimates).set({ crmDealId }).where(eq(affiliateInstallationEstimates.id, estimateId));
          const counts = cabinetBreakdown;
          await tx.insert(crmActivities).values({ dealId: crmDealId, authorUserId: ctx.user.id, kind: "note",
            body: `Kitchen installation estimate #${estimateId} saved: $${totals.totalAmount.toFixed(2)}. Material pricing remains separate.${counts ? ` Plan: ${kitchenDesignName}. Cabinets — Base: ${counts.base}, Wall: ${counts.wall}, Tall: ${counts.tall}, Total: ${counts.total}.` : ""}` });
        }
        return { id: estimateId, shareToken, crmDealId, kitchenDesignId, cabinetBreakdown, ...totals };
      });
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

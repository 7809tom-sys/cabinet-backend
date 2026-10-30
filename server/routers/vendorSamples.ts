import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router, supplierProfileProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { syncStoredOrderCrm } from "../lib/orderSideEffects";
import {
  cabinets,
  distributorSkus,
  doorStyles,
  doorStyleSampleOffers,
  orderRequests,
  sampleKitItems,
  sampleKits,
  type OrderLineItem,
} from "../../drizzle/schema";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { resolveAffiliateSiteScope, rowBelongsToSite } from "../lib/affiliateSiteScope";
import { assertVendorScope, listVendorScopes } from "../lib/vendorFulfillmentStore";
import { distributorScope } from "../../shared/vendorFulfillment";
import {
  canPlaceSampleOrder,
  resolveSampleDoorLink,
  sampleChargePrice,
  sampleOrderAffiliateId,
  samplesTabEnabled,
  type SampleActor,
} from "../../shared/samples";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

async function actorFor(db: Db, user: { id: number; role: string; email: string | null }): Promise<SampleActor> {
  if (user.role === "admin") return { role: "admin", isAffiliateMember: false, affiliateId: null };
  const access = await resolveAffiliateAccess(db, user);
  return {
    role: user.role,
    affiliateId: access?.affiliateId ?? null,
    isAffiliateMember: Boolean(access),
  };
}

function requestNumber(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CD-SMP-${stamp}-${rand}`;
}

const shipTo = {
  customerName: z.string().trim().min(2).max(256),
  customerEmail: z.string().trim().email().max(320).optional(),
  projectLabel: z.string().trim().max(256).optional(),
  addressLine1: z.string().trim().min(3).max(256),
  addressLine2: z.string().trim().max(256).optional(),
  city: z.string().trim().min(2).max(128),
  state: z.string().trim().min(2).max(64),
  zip: z.string().trim().min(5).max(16),
};

export const vendorSamplesRouter = router({
  access: supplierProfileProcedure.input(z.object({
    distributorId: z.number().int().positive().optional(),
    approvedVendorLineId: z.number().int().positive().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const scopes = await listVendorScopes(db, ctx.user, {
      distributorId: ctx.isAdmin ? input?.distributorId ?? null : ctx.distributorId,
      approvedVendorLineId: ctx.isAdmin ? input?.approvedVendorLineId ?? null : ctx.approvedVendorLineId,
    });
    const cabinet = scopes.find((scope) => samplesTabEnabled({ scope: scope.scope }));
    return { enabled: Boolean(cabinet), scope: cabinet?.scope ?? null, featureKey: "samples" as const };
  }),

  listOffers: supplierProfileProcedure.input(z.object({ scope: z.string() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const scope = await assertVendorScope(db, ctx.user, input.scope);
    if (!samplesTabEnabled({ scope })) throw new TRPCError({ code: "FORBIDDEN", message: "Samples are for cabinet vendors." });
    const distributorId = Number(scope.slice(5));
    const styles = await db.select({
      id: doorStyles.id,
      styleCode: doorStyles.styleCode,
      name: doorStyles.ourName,
      doorStyle: doorStyles.doorStyle,
      color: doorStyles.color,
    }).from(doorStyles).where(eq(doorStyles.distributorId, distributorId));
    const offers = await db.select().from(doorStyleSampleOffers).where(eq(doorStyleSampleOffers.distributorId, distributorId));
    const catalog = await db.select({
      id: cabinets.id,
      masterCode: cabinets.masterCode,
      distributorId: distributorSkus.distributorId,
      showInDesigner: cabinets.showInDesigner,
      showInCatalog: cabinets.showInCatalog,
      description: cabinets.description,
    }).from(cabinets).innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id)).where(eq(distributorSkus.distributorId, distributorId));
    const offerByStyle = new Map(offers.map((offer) => [offer.styleId, offer]));
    return {
      styles: styles.map((style) => ({
        ...style,
        offer: offerByStyle.get(style.id) ?? null,
        linkedSampleDoor: resolveSampleDoorLink(catalog, distributorId, offerByStyle.get(style.id)?.sampleSku),
        sampleAvailable: Boolean(offerByStyle.get(style.id)?.available),
      })),
    };
  }),

  saveOffer: supplierProfileProcedure.input(z.object({
    scope: z.string(),
    styleId: z.number().int().positive(),
    available: z.boolean(),
    sampleSku: z.string().max(128).nullable().optional(),
    price: z.number().min(0).nullable().optional(),
    leadTimeDays: z.number().int().min(0).nullable().optional(),
    notes: z.string().max(512).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const scope = await assertVendorScope(db, ctx.user, input.scope);
    if (!samplesTabEnabled({ scope })) throw new TRPCError({ code: "FORBIDDEN", message: "Samples are for cabinet vendors." });
    const distributorId = Number(scope.slice(5));
    const [style] = await db.select({ id: doorStyles.id }).from(doorStyles).where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, distributorId))).limit(1);
    if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That door style is not in your line." });
    const catalog = await db.select({
      id: cabinets.id,
      masterCode: cabinets.masterCode,
      distributorId: distributorSkus.distributorId,
      showInDesigner: cabinets.showInDesigner,
      showInCatalog: cabinets.showInCatalog,
    }).from(cabinets).innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id)).where(eq(distributorSkus.distributorId, distributorId));
    const link = resolveSampleDoorLink(catalog, distributorId, input.sampleSku);
    if (input.sampleSku && !link) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That SKU is not an existing sample door on your line. Link the catalog sample door instead of creating a new one." });
    }
    const price = input.price == null ? null : sampleChargePrice({ price: input.price }).toFixed(2);
    const existing = await db.select({ id: doorStyleSampleOffers.id }).from(doorStyleSampleOffers).where(and(eq(doorStyleSampleOffers.distributorId, distributorId), eq(doorStyleSampleOffers.styleId, input.styleId))).limit(1);
    const values = {
      available: input.available,
      sampleSku: link?.masterCode ?? null,
      catalogCabinetId: link?.cabinetId ?? null,
      price,
      leadTimeDays: input.leadTimeDays ?? null,
      notes: input.notes ?? null,
      updatedByUserId: ctx.user.id,
    };
    if (existing[0]) await db.update(doorStyleSampleOffers).set(values).where(eq(doorStyleSampleOffers.id, existing[0].id));
    else await db.insert(doorStyleSampleOffers).values({ distributorId, styleId: input.styleId, ...values });
    return { ok: true as const, linked: link };
  }),

  listKits: supplierProfileProcedure.input(z.object({ scope: z.string() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const scope = await assertVendorScope(db, ctx.user, input.scope);
    if (!samplesTabEnabled({ scope })) throw new TRPCError({ code: "FORBIDDEN", message: "Samples are for cabinet vendors." });
    const distributorId = Number(scope.slice(5));
    const kits = await db.select().from(sampleKits).where(eq(sampleKits.distributorId, distributorId)).orderBy(desc(sampleKits.updatedAt));
    const items = kits.length
      ? await db.select().from(sampleKitItems).where(inArray(sampleKitItems.kitId, kits.map((kit) => kit.id)))
      : [];
    return kits.map((kit) => ({ ...kit, items: items.filter((item) => item.kitId === kit.id) }));
  }),

  saveKit: supplierProfileProcedure.input(z.object({
    scope: z.string(),
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(2).max(191),
    description: z.string().max(2000).optional(),
    price: z.number().min(0).nullable().optional(),
    isFree: z.boolean().default(false),
    active: z.boolean().default(true),
    imageUrl: z.string().max(512).nullable().optional(),
    styleIds: z.array(z.number().int().positive()).min(1).max(40),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const scope = await assertVendorScope(db, ctx.user, input.scope);
    if (!samplesTabEnabled({ scope })) throw new TRPCError({ code: "FORBIDDEN", message: "Samples are for cabinet vendors." });
    const distributorId = Number(scope.slice(5));
    const styles = await db.select({ id: doorStyles.id }).from(doorStyles).where(and(eq(doorStyles.distributorId, distributorId), inArray(doorStyles.id, input.styleIds)));
    if (styles.length !== new Set(input.styleIds).size) {
      throw new TRPCError({ code: "FORBIDDEN", message: "A kit can include only your own door styles." });
    }
    const price = sampleChargePrice({ price: input.price, free: input.isFree });
    const values = {
      name: input.name,
      description: input.description ?? null,
      price: price.toFixed(2),
      isFree: input.isFree,
      active: input.active,
      imageUrl: input.imageUrl ?? null,
    };
    let kitId = input.id ?? null;
    if (kitId) {
      const [owned] = await db.select({ id: sampleKits.id }).from(sampleKits).where(and(eq(sampleKits.id, kitId), eq(sampleKits.distributorId, distributorId))).limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "That kit is not in your line." });
      await db.update(sampleKits).set(values).where(eq(sampleKits.id, kitId));
      await db.delete(sampleKitItems).where(eq(sampleKitItems.kitId, kitId));
    } else {
      const result = await db.insert(sampleKits).values({ distributorId, createdByUserId: ctx.user.id, ...values });
      kitId = (result as unknown as [{ insertId: number }])[0].insertId;
    }
    await db.insert(sampleKitItems).values(input.styleIds.map((styleId) => ({ kitId: kitId!, styleId, qty: 1 })));
    return { id: kitId };
  }),

  vendorOrders: supplierProfileProcedure.input(z.object({ scope: z.string() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const scope = await assertVendorScope(db, ctx.user, input.scope);
    const distributorId = Number(scope.slice(5));
    const rows = await db.select().from(orderRequests).where(eq(orderRequests.orderKind, "sample")).orderBy(desc(orderRequests.createdAt)).limit(200);
    return rows.flatMap((row) => {
      const lines = (row.lineItems ?? []).filter((line) => line.distributorId === distributorId);
      if (lines.length === 0) return [];
      return [{
        id: row.id,
        requestNumber: row.requestNumber,
        status: row.status,
        projectLabel: row.projectLabel,
        shipTo: {
          name: row.originatorName,
          line1: row.shippingAddressLine1,
          city: row.shippingCity,
          state: row.shippingState,
          zip: row.zip,
        },
        lines,
        totalAmount: row.totalAmount,
        createdAt: row.createdAt,
      }];
    });
  }),

  catalogForOrdering: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const actor = await actorFor(db, ctx.user);
    if (!canPlaceSampleOrder(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Sample ordering is in the admin and affiliate back office." });
    const offers = await db.select({
      id: doorStyleSampleOffers.id,
      distributorId: doorStyleSampleOffers.distributorId,
      styleId: doorStyleSampleOffers.styleId,
      available: doorStyleSampleOffers.available,
      sampleSku: doorStyleSampleOffers.sampleSku,
      price: doorStyleSampleOffers.price,
      leadTimeDays: doorStyleSampleOffers.leadTimeDays,
      notes: doorStyleSampleOffers.notes,
      styleName: doorStyles.ourName,
      styleCode: doorStyles.styleCode,
      color: doorStyles.color,
    }).from(doorStyleSampleOffers).innerJoin(doorStyles, eq(doorStyles.id, doorStyleSampleOffers.styleId)).where(eq(doorStyleSampleOffers.available, true));
    const kits = await db.select().from(sampleKits).where(eq(sampleKits.active, true));
    const items = kits.length ? await db.select().from(sampleKitItems).where(inArray(sampleKitItems.kitId, kits.map((kit) => kit.id))) : [];
    return {
      offers,
      kits: kits.map((kit) => ({ ...kit, items: items.filter((item) => item.kitId === kit.id) })),
    };
  }),

  placeOrder: protectedProcedure.input(z.object({
    ...shipTo,
    affiliateId: z.number().int().positive().optional(),
    lines: z.array(z.object({
      offerId: z.number().int().positive().optional(),
      kitId: z.number().int().positive().optional(),
      qty: z.number().int().min(1).max(99).default(1),
    })).min(1).max(40),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const actor = await actorFor(db, ctx.user);
    if (!canPlaceSampleOrder(actor)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "A public customer cannot order samples. Use the admin or affiliate back office." });
    }
    let affiliateId: number | null;
    try {
      affiliateId = sampleOrderAffiliateId(actor, input.affiliateId);
    } catch {
      throw new TRPCError({ code: "FORBIDDEN", message: "A public customer cannot order samples." });
    }
    const offerIds = input.lines.map((line) => line.offerId).filter((id): id is number => id != null);
    const kitIds = input.lines.map((line) => line.kitId).filter((id): id is number => id != null);
    const offers = offerIds.length ? await db.select().from(doorStyleSampleOffers).where(inArray(doorStyleSampleOffers.id, offerIds)) : [];
    const kits = kitIds.length ? await db.select().from(sampleKits).where(inArray(sampleKits.id, kitIds)) : [];
    const offerById = new Map(offers.map((offer) => [offer.id, offer]));
    const kitById = new Map(kits.map((kit) => [kit.id, kit]));
    const lines: OrderLineItem[] = [];
    for (const line of input.lines) {
      if (line.offerId) {
        const offer = offerById.get(line.offerId);
        if (!offer?.available) throw new TRPCError({ code: "BAD_REQUEST", message: "That sample is not available." });
        const unit = sampleChargePrice({ price: offer.price });
        lines.push({
          cabinetId: offer.catalogCabinetId,
          masterCode: offer.sampleSku || "SD",
          description: `Door sample style ${offer.styleId}`,
          qty: line.qty,
          unitPrice: unit,
          linePrice: Number((unit * line.qty).toFixed(2)),
          styleId: offer.styleId,
          distributorId: offer.distributorId,
          productKind: "sample",
          sampleOfferId: offer.id,
          matched: true,
          tier: "Homeowner",
        });
      } else if (line.kitId) {
        const kit = kitById.get(line.kitId);
        if (!kit?.active) throw new TRPCError({ code: "BAD_REQUEST", message: "That sample kit is not active." });
        const unit = sampleChargePrice({ price: kit.price, free: kit.isFree });
        lines.push({
          cabinetId: null,
          masterCode: `SAMPLE-KIT-${kit.id}`,
          description: kit.name,
          qty: line.qty,
          unitPrice: unit,
          linePrice: Number((unit * line.qty).toFixed(2)),
          distributorId: kit.distributorId,
          productKind: "sample",
          sampleKitId: kit.id,
          matched: true,
          tier: "Homeowner",
        });
      }
    }
    if (lines.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a sample or a kit." });
    const total = lines.reduce((sum, line) => sum + (line.linePrice ?? 0), 0);
    const result = await db.insert(orderRequests).values({
      userId: ctx.user.id,
      requestNumber: requestNumber(),
      originatorName: input.customerName,
      originatorEmail: input.customerEmail ?? ctx.user.email,
      zip: input.zip,
      shippingAddressLine1: input.addressLine1,
      shippingAddressLine2: input.addressLine2 ?? null,
      shippingCity: input.city,
      shippingState: input.state,
      source: "manual",
      status: "submitted",
      orderKind: "sample",
      projectLabel: input.projectLabel ?? null,
      tier: "Homeowner",
      affiliateId,
      lineItems: lines,
      itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
      totalAmount: total.toFixed(2),
      notes: "Back-office sample order. Not a public catalog sale.",
      deliveryMethod: "ship",
    });
    const id = (result as unknown as [{ insertId: number }])[0].insertId;
    try {
      await syncStoredOrderCrm(id);
    } catch (error) {
      console.error(`[OrderCrm] Sample order ${id} was saved, but the CRM follow-up failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { id, affiliateId };
  }),

  myOrders: protectedProcedure.input(z.object({
    affiliateId: z.number().int().positive().optional(),
    slug: z.string().trim().min(1).max(64).optional(),
    adminAll: z.literal(true).optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const actor = await actorFor(db, ctx.user);
    if (!canPlaceSampleOrder(actor)) return [];
    const rows = await db.select().from(orderRequests).where(eq(orderRequests.orderKind, "sample")).orderBy(desc(orderRequests.createdAt)).limit(200);
    if (input?.adminAll && actor.role === "admin") return rows;
    if (input?.affiliateId != null || input?.slug) {
      const scope = await resolveAffiliateSiteScope(db, ctx.user, input);
      return rows.filter((row) => rowBelongsToSite(row.affiliateId, scope));
    }
    if (actor.affiliateId != null) return rows.filter((row) => row.affiliateId === actor.affiliateId);
    return [];
  }),

  adminOrders: adminProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(orderRequests).where(eq(orderRequests.orderKind, "sample")).orderBy(desc(orderRequests.createdAt)).limit(200);
  }),
});

export function sampleOrderScope(distributorId: number) {
  return distributorScope(distributorId);
}

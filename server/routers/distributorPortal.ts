import { z } from "zod";
import { and, eq, inArray, desc, asc, sql, or, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { distributorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  distributors,
  cabinets,
  distributorSkus,
  doorStyles,
  orderRequests,
  aiServiceRequests,
} from "../../drizzle/schema";
import { storagePut } from "../storage";

/**
 * Resolve the supply line this request operates on.
 * - distributor role → their own linked line (input distributorId ignored)
 * - admin → must pass a distributorId in input (acts on behalf of that line)
 */
function resolveLineId(
  ctxDistributorId: number | null,
  isAdmin: boolean,
  inputDistributorId?: number | null
): number {
  if (!isAdmin) {
    if (ctxDistributorId == null) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No supply line linked to your account." });
    }
    return ctxDistributorId;
  }
  if (inputDistributorId == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Admins must specify a distributorId to act on a supply line.",
    });
  }
  return inputDistributorId;
}

const MAX_DESIGN_TOOL_PICKS = 8;

export const distributorPortalRouter = router({
  /** The line this user manages: neutral label, counts, lead time. No real brand leaks. */
  myLine: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);

      const rows = await db
        .select({
          id: distributors.id,
          name: distributors.name,
          initials: distributors.initials,
          leadTimeDays: distributors.leadTimeDays,
          warehouseZips: distributors.warehouseZips,
          isActive: distributors.isActive,
          designToolPicks: distributors.designToolPicks,
        })
        .from(distributors)
        .where(eq(distributors.id, lineId))
        .limit(1);
      const line = rows[0];
      if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });

      // SKU counts for this line.
      const [counts] = await db
        .select({
          total: sql<number>`count(*)`,
          published: sql<number>`sum(case when ${distributorSkus.isPublished} = true then 1 else 0 end)`,
          available: sql<number>`sum(case when ${distributorSkus.isAvailable} = true then 1 else 0 end)`,
          pending: sql<number>`sum(case when ${distributorSkus.status} = 'pending' then 1 else 0 end)`,
        })
        .from(distributorSkus)
        .where(eq(distributorSkus.distributorId, lineId));

      // Door styles carried by this line.
      // Note: we intentionally do NOT filter by isActive here so that the vendor
      // portal shows ALL styles (including disabled ones) and can toggle them.
      const styles = await db
        .select({
          id: doorStyles.id,
          ourName: doorStyles.ourName,
          doorStyle: doorStyles.doorStyle,
          isActive: doorStyles.isActive,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, lineId))
        .orderBy(doorStyles.ourName);

      return {
        line,
        counts: {
          total: Number(counts?.total ?? 0),
          published: Number(counts?.published ?? 0),
          available: Number(counts?.available ?? 0),
          pending: Number(counts?.pending ?? 0),
        },
        styles,
      };
    }),

  /** This line's catalog: one row per SKU with cabinet info + visibility state. */
  catalog: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        styleId: z.number().optional(),
        category: z.string().max(64).optional(),
        search: z.string().max(64).optional(),
        onlyHidden: z.boolean().optional(),
        onlyPending: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      const conds = [eq(distributorSkus.distributorId, lineId)];
      if (input.styleId) conds.push(eq(distributorSkus.styleId, input.styleId));
      if (input.onlyHidden) conds.push(eq(distributorSkus.isPublished, false));
      if (input.onlyPending) conds.push(eq(distributorSkus.status, "pending"));
      if (input.category) conds.push(eq(cabinets.category, input.category));
      const q = input.search?.trim();
      if (q) {
        const like = `%${q}%`;
        conds.push(
          sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like})`
        );
      }

      const base = db
        .select({
          skuId: distributorSkus.id,
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          styleId: distributorSkus.styleId,
          styleName: doorStyles.ourName,
          platformSku: distributorSkus.platformSku,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          isPublished: distributorSkus.isPublished,
          isAvailable: distributorSkus.isAvailable,
          imageUrl: distributorSkus.imageUrl,
          status: distributorSkus.status,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(...conds));

      const rows = await base
        .orderBy(cabinets.category, cabinets.masterCode)
        .limit(input.limit)
        .offset(input.offset);

      // Total count for pagination — reflects the SAME filters (incl. search).
      const [tot] = await db
        .select({ n: sql<number>`count(*)` })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(...conds));

      return { items: rows, total: Number(tot?.n ?? 0) };
    }),

  /** Toggle a single SKU's published (visible) state. Scoped to this line. */
  setVisibility: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        isPublished: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard: the SKU must belong to this line.
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, isPublished: input.isPublished };
    }),

  /** Bulk publish/unpublish a set of SKUs in this line. */
  bulkSetVisibility: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuIds: z.array(z.number()).min(1).max(1000),
        isPublished: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Only update rows that belong to this line.
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(inArray(distributorSkus.id, input.skuIds), eq(distributorSkus.distributorId, lineId)));
      const ownedIds = owned.map((o) => o.id);
      if (ownedIds.length === 0) return { updated: 0 };

      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(inArray(distributorSkus.id, ownedIds));
      return { updated: ownedIds.length };
    }),

  // ─── Price Update (instant, no approval) ─────────────────────────────────────

  /** Vendor updates pricing on their own SKUs. Instant — no admin approval needed. */
  updatePrice: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        listPrice: z.string().max(16).optional(),
        wholesalePrice: z.string().max(16).optional(),
        contractorPrice: z.string().max(16).optional(),
        homeownerPrice: z.string().max(16).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      const updates: Record<string, string | null> = {};
      if (input.listPrice !== undefined) updates.listPrice = input.listPrice || null;
      if (input.wholesalePrice !== undefined) updates.wholesalePrice = input.wholesalePrice || null;
      if (input.contractorPrice !== undefined) updates.contractorPrice = input.contractorPrice || null;
      if (input.homeownerPrice !== undefined) updates.homeownerPrice = input.homeownerPrice || null;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No price fields provided." });
      }

      await db
        .update(distributorSkus)
        .set(updates as any)
        .where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, updated: Object.keys(updates) };
    }),

  // ─── Image Upload (instant) ───────────────────────────────────────────────────

  /** Vendor uploads a product image (base64 encoded). Stored in S3, URL saved on SKU. */
  updateImage: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        imageBase64: z.string().max(10_000_000), // ~7.5MB max
        contentType: z.string().max(64).default("image/jpeg"),
        fileName: z.string().max(256).default("product.jpg"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      // Upload to S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `vendor-products/${lineId}/${input.skuId}.${ext}`;
      const { url } = await storagePut(key, buffer, input.contentType);

      // Update SKU
      await db
        .update(distributorSkus)
        .set({ imageUrl: url })
        .where(eq(distributorSkus.id, input.skuId));

      return { skuId: input.skuId, imageUrl: url };
    }),

  // ─── New Product Submission (pending approval) ────────────────────────────────

  /** Vendor submits a new product. Goes to pending status until admin approves. */
  submitNewProduct: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        cabinetId: z.number(),
        styleId: z.number(),
        distributorSku: z.string().min(1).max(128),
        listPrice: z.string().max(16).optional(),
        wholesalePrice: z.string().max(16).optional(),
        contractorPrice: z.string().max(16).optional(),
        homeownerPrice: z.string().max(16).optional(),
        supplierCabinetName: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Verify the cabinet exists
      const cab = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(eq(cabinets.id, input.cabinetId))
        .limit(1);
      if (!cab[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found." });

      // Verify the style belongs to this line
      const style = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
        .limit(1);
      if (!style[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your line." });

      // Generate platform SKU: masterCode-styleCode-distCode
      const platformSku = `${cab[0].masterCode}-${input.distributorSku}-${lineId}`;

      const result = await db.insert(distributorSkus).values({
        cabinetId: input.cabinetId,
        distributorId: lineId,
        styleId: input.styleId,
        platformSku,
        distributorSku: input.distributorSku,
        listPrice: input.listPrice || null,
        wholesalePrice: input.wholesalePrice || null,
        contractorPrice: input.contractorPrice || null,
        homeownerPrice: input.homeownerPrice || null,
        supplierCabinetName: input.supplierCabinetName || null,
        status: "pending",
        isPublished: false,
        isAvailable: true,
      });

      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
      return { skuId: insertId, status: "pending" as const };
    }),

  // ─── Admin Approve/Reject Product ─────────────────────────────────────────────

  /** Admin approves or rejects a pending product submission. */
  adminSetProductStatus: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        status: z.enum(["approved", "rejected"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can approve/reject products." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const sku = await db
        .select({ id: distributorSkus.id, status: distributorSkus.status })
        .from(distributorSkus)
        .where(eq(distributorSkus.id, input.skuId))
        .limit(1);
      if (!sku[0]) throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found." });

      await db
        .update(distributorSkus)
        .set({
          status: input.status,
          isPublished: input.status === "approved" ? true : false,
        })
        .where(eq(distributorSkus.id, input.skuId));

      return { skuId: input.skuId, status: input.status };
    }),

  // ─── Design Tool Picks (max 8) ───────────────────────────────────────────────

  /** Get the vendor's current design tool picks. */
  getDesignToolPicks: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);

      const rows = await db
        .select({ designToolPicks: distributors.designToolPicks })
        .from(distributors)
        .where(eq(distributors.id, lineId))
        .limit(1);

      const picks: number[] = (rows[0]?.designToolPicks as number[]) || [];

      // Fetch details for the picked SKUs
      if (picks.length === 0) return { picks: [], items: [] };

      const items = await db
        .select({
          skuId: distributorSkus.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          styleName: doorStyles.ourName,
          imageUrl: distributorSkus.imageUrl,
          contractorPrice: distributorSkus.contractorPrice,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(inArray(distributorSkus.id, picks), eq(distributorSkus.distributorId, lineId)));

      return { picks, items };
    }),

  /** Vendor sets their design tool picks (max 8 SKU IDs). */
  setDesignToolPicks: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuIds: z.array(z.number()).max(MAX_DESIGN_TOOL_PICKS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      if (input.skuIds.length > MAX_DESIGN_TOOL_PICKS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum ${MAX_DESIGN_TOOL_PICKS} design tool picks allowed.`,
        });
      }

      // Verify all SKUs belong to this line
      if (input.skuIds.length > 0) {
        const owned = await db
          .select({ id: distributorSkus.id })
          .from(distributorSkus)
          .where(and(inArray(distributorSkus.id, input.skuIds), eq(distributorSkus.distributorId, lineId)));
        if (owned.length !== input.skuIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Some SKUs do not belong to your line." });
        }
      }

      await db
        .update(distributors)
        .set({ designToolPicks: input.skuIds.length > 0 ? input.skuIds : null })
        .where(eq(distributors.id, lineId));

      return { picks: input.skuIds };
    }),

  /** Order requests that reference a door style carried by this line. */
  orders: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Resolve the door-style ids that belong to this line.
      const styleRows = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, lineId));
      const styleIds = styleRows.map((s) => s.id);
      if (styleIds.length === 0) return [];

      const rows = await db
        .select({
          id: orderRequests.id,
          requestNumber: orderRequests.requestNumber,
          status: orderRequests.status,
          styleId: orderRequests.styleId,
          styleName: orderRequests.styleName,
          tier: orderRequests.tier,
          itemCount: orderRequests.itemCount,
          totalAmount: orderRequests.totalAmount,
          source: orderRequests.source,
          createdAt: orderRequests.createdAt,
        })
        .from(orderRequests)
        .where(and(inArray(orderRequests.styleId, styleIds), eq(orderRequests.status, "submitted")))
        .orderBy(desc(orderRequests.createdAt))
        .limit(input.limit);
      return rows;
    }),

  // ─── Door Style Image Update (instant) ────────────────────────────────────────

  /** Vendor updates a door style image (room scene or door sample). */
  updateDoorStyleImage: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        styleId: z.number(),
        imageType: z.enum(["doorSample", "roomScene", "thumbnail"]),
        imageBase64: z.string().max(10_000_000),
        contentType: z.string().max(64).default("image/jpeg"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Verify style belongs to this line
      const style = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
        .limit(1);
      if (!style[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your line." });

      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.contentType.split("/")[1] || "jpg";
      const key = `vendor-styles/${lineId}/${input.styleId}-${input.imageType}.${ext}`;
      const { url } = await storagePut(key, buffer, input.contentType);

      const fieldMap = {
        doorSample: "doorSampleImageUrl",
        roomScene: "roomSceneImageUrl",
        thumbnail: "thumbnailImageUrl",
      } as const;

      await db
        .update(doorStyles)
        .set({ [fieldMap[input.imageType]]: url } as any)
        .where(eq(doorStyles.id, input.styleId));

      return { styleId: input.styleId, imageType: input.imageType, imageUrl: url };
    }),

  // ─── Door Style Active / Delete ───────────────────────────────────────────

  setDoorStyleActive: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        styleId: z.number(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const style = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
        .limit(1);
      if (!style[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your line." });
      await db
        .update(doorStyles)
        .set({ isActive: input.isActive })
        .where(eq(doorStyles.id, input.styleId));
      return { styleId: input.styleId, isActive: input.isActive };
    }),

  deleteDoorStyleLine: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        styleId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const style = await db
        .select({ id: doorStyles.id, ourName: doorStyles.ourName })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
        .limit(1);
      if (!style[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your line." });
      await db
        .delete(doorStyles)
        .where(eq(doorStyles.id, input.styleId));
      return { deleted: true, styleId: input.styleId };
    }),

  // ─── AI Service Requests ─────────────────────────────────────────────────────

  aiServiceHistory: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      const rows = await db
        .select()
        .from(aiServiceRequests)
        .where(eq(aiServiceRequests.distributorId, lineId))
        .orderBy(desc(aiServiceRequests.createdAt))
        .limit(50);
      return rows;
    }),

  aiServiceSubmit: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        serviceType: z.string().min(1).max(100),
        fileName: z.string().max(255).optional(),
        fileKey: z.string().max(512).optional(),
        fileUrl: z.string().max(1024).optional(),
        fileSizeBytes: z.number().int().min(0).optional(),
        details: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      // Estimate: ~150 SKUs per hour based on file size heuristic
      const estimatedSkus = input.fileSizeBytes
        ? Math.max(10, Math.round(input.fileSizeBytes / 500))
        : 100;
      const estimatedHours = Math.max(0.25, Number((estimatedSkus / 150).toFixed(2)));
      const estimatedCost = Number((estimatedHours * 100).toFixed(2));
      const [result] = await db.insert(aiServiceRequests).values({
        distributorId: lineId,
        userId: ctx.user.id,
        serviceType: input.serviceType,
        fileName: input.fileName || null,
        fileKey: input.fileKey || null,
        fileUrl: input.fileUrl || null,
        fileSizeBytes: input.fileSizeBytes || null,
        details: input.details || null,
        estimatedSkus,
        estimatedHours: String(estimatedHours),
        estimatedCost: String(estimatedCost),
        status: "estimated",
      });
      return {
        id: result.insertId,
        estimatedSkus,
        estimatedHours,
        estimatedCost,
      };
    }),

  aiServiceApprove: distributorProcedure
    .input(z.object({ distributorId: z.number().optional(), requestId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await db
        .update(aiServiceRequests)
        .set({ status: "approved", approvedAt: new Date() })
        .where(
          and(
            eq(aiServiceRequests.id, input.requestId),
            eq(aiServiceRequests.distributorId, lineId),
            eq(aiServiceRequests.status, "estimated")
          )
        );
      return { success: true };
    }),

  aiServiceCancel: distributorProcedure
    .input(z.object({ distributorId: z.number().optional(), requestId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await db
        .update(aiServiceRequests)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(aiServiceRequests.id, input.requestId),
            eq(aiServiceRequests.distributorId, lineId)
          )
        );
      return { success: true };
    }),

  /**
   * Search the master cabinet catalog by master code or description.
   * Used by vendors/distributors to look up a cabinet before adding a SKU.
   */
  searchMasterCatalog: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        search: z.string().min(1).max(64),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const like = `%${input.search.trim()}%`;
      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
        })
        .from(cabinets)
        .where(
          or(
            sql`${cabinets.masterCode} LIKE ${like}`,
            sql`${cabinets.description} LIKE ${like}`
          )
        )
        .orderBy(asc(cabinets.masterCode))
        .limit(input.limit);
      return rows;
    }),

  /**
   * Export all door styles with their current prices as CSV data.
   * Returns rows: one per SKU across all styles for this line.
   */
  exportStylesCsv: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);

      // Fetch all SKUs for this line with style + cabinet info
      const rows = await db
        .select({
          styleName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
          doorStyle: doorStyles.doorStyle,
          isStyleActive: doorStyles.isActive,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          distributorSku: distributorSkus.distributorSku,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(eq(distributorSkus.distributorId, lineId))
        .orderBy(doorStyles.ourName, cabinets.category, cabinets.masterCode);

      return rows;
    }),
});

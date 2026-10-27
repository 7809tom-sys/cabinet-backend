import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { withVendorFeature } from "../lib/vendorFeatureProcedure";
import { getDb } from "../db";
import { productGalleryImages, distributorSkus } from "../../drizzle/schema";
import { storagePut } from "../storage";

function resolveLineId(
  ctxDistributorId: number | null,
  isAdmin: boolean,
  inputDistributorId?: number | null
): number {
  if (!isAdmin) {
    if (ctxDistributorId == null) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No supply line linked." });
    }
    return ctxDistributorId;
  }
  if (inputDistributorId == null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Admins must specify distributorId." });
  }
  return inputDistributorId;
}

export const galleryRouter = router({
  /** List gallery images for a specific SKU. */
  listBySku: publicProcedure
    .input(z.object({ skuId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(productGalleryImages)
        .where(eq(productGalleryImages.skuId, input.skuId))
        .orderBy(asc(productGalleryImages.sortOrder));
    }),

  /** List all gallery images for a distributor (vendor portal overview). */
  listByDistributor: withVendorFeature("room_scenes")
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      return db
        .select()
        .from(productGalleryImages)
        .where(eq(productGalleryImages.distributorId, lineId))
        .orderBy(asc(productGalleryImages.sortOrder));
    }),

  /** Upload a gallery image for a product SKU. */
  upload: withVendorFeature("room_scenes")
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        imageBase64: z.string(),
        fileName: z.string(),
        contentType: z.string().default("image/jpeg"),
        caption: z.string().max(256).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Verify SKU belongs to this distributor
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      // Get current max sort order
      const existing = await db
        .select({ sortOrder: productGalleryImages.sortOrder })
        .from(productGalleryImages)
        .where(and(eq(productGalleryImages.skuId, input.skuId), eq(productGalleryImages.distributorId, lineId)))
        .orderBy(asc(productGalleryImages.sortOrder));
      const nextSort = existing.length > 0 ? (existing[existing.length - 1]?.sortOrder ?? 0) + 1 : 0;

      // Upload to S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `vendor-gallery/${lineId}/${input.skuId}/${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.contentType);

      // Insert record
      await db.insert(productGalleryImages).values({
        skuId: input.skuId,
        distributorId: lineId,
        s3Key: key,
        s3Url: url,
        sortOrder: nextSort,
        caption: input.caption || null,
      });

      return { success: true, url };
    }),

  /** Delete a gallery image. */
  delete: withVendorFeature("room_scenes")
    .input(z.object({ id: z.number(), distributorId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await db
        .delete(productGalleryImages)
        .where(and(eq(productGalleryImages.id, input.id), eq(productGalleryImages.distributorId, lineId)));
      return { success: true };
    }),

  /** Update caption or sort order. */
  update: withVendorFeature("room_scenes")
    .input(
      z.object({
        id: z.number(),
        distributorId: z.number().optional(),
        caption: z.string().max(256).nullable().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      const patch: Record<string, unknown> = {};
      if (input.caption !== undefined) patch.caption = input.caption;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      if (Object.keys(patch).length === 0) return { success: true };

      await db
        .update(productGalleryImages)
        .set(patch)
        .where(and(eq(productGalleryImages.id, input.id), eq(productGalleryImages.distributorId, lineId)));
      return { success: true };
    }),
});

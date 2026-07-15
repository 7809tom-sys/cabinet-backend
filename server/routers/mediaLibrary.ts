/**
 * Media Library router
 * Lists all image URLs stored across the site with their source context,
 * and allows re-assigning images to slots that are missing/broken.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import {
  doorStyles,
  distributorSkus,
  affiliateRoomSceneGallery,
  affiliateStyleBranding,
  affiliates,
  doorStyleCorrections,
} from "../../drizzle/schema";
import { isNotNull, eq, or, isNull } from "drizzle-orm";
import { storagePut } from "../storage";

export type MediaItem = {
  id: string;           // unique key: "table:rowId:field"
  url: string;
  sourceTable: string;
  sourceLabel: string;  // human-readable: "Door Style", "Room Scene", etc.
  rowId: number;
  rowLabel: string;     // e.g. style name or SKU
  field: string;        // column name
  isMissing: boolean;   // true if the slot exists but URL is null/empty
};

export const mediaLibraryRouter = router({
  /**
   * List all image slots across the site.
   * Returns both filled (has URL) and missing (null URL) slots.
   */
  list: adminProcedure
    .input(z.object({
      sourceType: z.enum(["all", "door_sample", "room_scene", "sku_image", "affiliate_gallery", "corrections"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const items: MediaItem[] = [];

      // ── Door style samples + room scenes ──────────────────────────────────
      if (input.sourceType === "all" || input.sourceType === "door_sample" || input.sourceType === "room_scene") {
        const styles = await db
          .select({
            id: doorStyles.id,
            ourName: doorStyles.ourName,
            styleCode: doorStyles.styleCode,
            doorSampleImageUrl: doorStyles.doorSampleImageUrl,
            roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          })
          .from(doorStyles);

        for (const s of styles) {
          const label = `${s.ourName} (${s.styleCode})`;

          if (input.sourceType === "all" || input.sourceType === "door_sample") {
            items.push({
              id: `door_styles:${s.id}:doorSampleImageUrl`,
              url: s.doorSampleImageUrl ?? "",
              sourceTable: "door_styles",
              sourceLabel: "Door Sample",
              rowId: s.id,
              rowLabel: label,
              field: "doorSampleImageUrl",
              isMissing: !s.doorSampleImageUrl,
            });
          }

          if (input.sourceType === "all" || input.sourceType === "room_scene") {
            items.push({
              id: `door_styles:${s.id}:roomSceneImageUrl`,
              url: s.roomSceneImageUrl ?? "",
              sourceTable: "door_styles",
              sourceLabel: "Room Scene",
              rowId: s.id,
              rowLabel: label,
              field: "roomSceneImageUrl",
              isMissing: !s.roomSceneImageUrl,
            });
          }
        }
      }

      // ── Door style corrections (updated sample images) ────────────────────
      if (input.sourceType === "all" || input.sourceType === "corrections") {
        const corrections = await db
          .select({
            id: doorStyleCorrections.id,
            styleId: doorStyleCorrections.styleId,
            imageUrl: doorStyleCorrections.imageUrl,
          })
          .from(doorStyleCorrections);

        for (const c of corrections) {
          items.push({
            id: `door_style_corrections:${c.id}:imageUrl`,
            url: c.imageUrl ?? "",
            sourceTable: "door_style_corrections",
            sourceLabel: "Style Correction",
            rowId: c.id,
            rowLabel: `Correction for style #${c.styleId}`,
            field: "imageUrl",
            isMissing: !c.imageUrl,
          });
        }
      }

      // ── Affiliate room scene gallery ───────────────────────────────────────
      if (input.sourceType === "all" || input.sourceType === "affiliate_gallery") {
        const gallery = await db
          .select({
            id: affiliateRoomSceneGallery.id,
            affiliateId: affiliateRoomSceneGallery.affiliateId,
            styleId: affiliateRoomSceneGallery.styleId,
            imageUrl: affiliateRoomSceneGallery.imageUrl,
          })
          .from(affiliateRoomSceneGallery);

        for (const g of gallery) {
          items.push({
            id: `affiliate_room_scene_gallery:${g.id}:imageUrl`,
            url: g.imageUrl ?? "",
            sourceTable: "affiliate_room_scene_gallery",
            sourceLabel: "Affiliate Gallery",
            rowId: g.id,
            rowLabel: `Affiliate #${g.affiliateId} / Style #${g.styleId}`,
            field: "imageUrl",
            isMissing: !g.imageUrl,
          });
        }
      }

      // ── Distributor SKU images (sample only — too many, limit to those with images) ──
      if (input.sourceType === "all" || input.sourceType === "sku_image") {
        const skuImages = await db
          .select({
            id: distributorSkus.id,
            platformSku: distributorSkus.platformSku,
            distributorSku: distributorSkus.distributorSku,
            imageUrl: distributorSkus.imageUrl,
          })
          .from(distributorSkus)
          .where(isNotNull(distributorSkus.imageUrl))
          .limit(500);

        for (const s of skuImages) {
          items.push({
            id: `distributor_skus:${s.id}:imageUrl`,
            url: s.imageUrl ?? "",
            sourceTable: "distributor_skus",
            sourceLabel: "SKU Image",
            rowId: s.id,
            rowLabel: s.distributorSku ?? s.platformSku ?? `SKU #${s.id}`,
            field: "imageUrl",
            isMissing: false, // only fetched non-null above
          });
        }
      }

      // Sort: missing first, then by sourceLabel, then rowLabel
      items.sort((a, b) => {
        if (a.isMissing !== b.isMissing) return a.isMissing ? -1 : 1;
        if (a.sourceLabel !== b.sourceLabel) return a.sourceLabel.localeCompare(b.sourceLabel);
        return a.rowLabel.localeCompare(b.rowLabel);
      });

      const total = items.length;
      const missing = items.filter((i) => i.isMissing).length;
      return { items, total, missing };
    }),

  /**
   * Assign a URL to an image slot (re-assign existing or fill a missing slot).
   */
  assignUrl: adminProcedure
    .input(z.object({
      itemId: z.string(), // "table:rowId:field"
      url: z.string().url(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [table, rowIdStr, field] = input.itemId.split(":");
      const rowId = parseInt(rowIdStr, 10);
      if (!table || isNaN(rowId) || !field) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid item ID" });
      }

      if (table === "door_styles") {
        if (field === "doorSampleImageUrl") {
          await db.update(doorStyles).set({ doorSampleImageUrl: input.url }).where(eq(doorStyles.id, rowId));
        } else if (field === "roomSceneImageUrl") {
          await db.update(doorStyles).set({ roomSceneImageUrl: input.url }).where(eq(doorStyles.id, rowId));
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown field" });
        }
      } else if (table === "distributor_skus") {
        await db.update(distributorSkus).set({ imageUrl: input.url }).where(eq(distributorSkus.id, rowId));
      } else if (table === "affiliate_room_scene_gallery") {
        await db.update(affiliateRoomSceneGallery).set({ imageUrl: input.url }).where(eq(affiliateRoomSceneGallery.id, rowId));
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported table" });
      }

      return { success: true };
    }),

  /**
   * Upload a new image to S3 and optionally assign it to a slot.
   */
  uploadAndAssign: adminProcedure
    .input(z.object({
      fileBase64: z.string(),
      filename: z.string(),
      itemId: z.string().optional(), // if provided, also assign to this slot
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Decode base64 and upload to S3
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.filename.split(".").pop()?.toLowerCase() ?? "jpg";
      const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const key = `media-library/${Date.now()}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(key, buffer, contentType);

      // Optionally assign to a slot
      if (input.itemId) {
        const [table, rowIdStr, field] = input.itemId.split(":");
        const rowId = parseInt(rowIdStr, 10);
        if (table && !isNaN(rowId) && field) {
          if (table === "door_styles") {
            if (field === "doorSampleImageUrl") {
              await db.update(doorStyles).set({ doorSampleImageUrl: url }).where(eq(doorStyles.id, rowId));
            } else if (field === "roomSceneImageUrl") {
              await db.update(doorStyles).set({ roomSceneImageUrl: url }).where(eq(doorStyles.id, rowId));
            }
          } else if (table === "distributor_skus") {
            await db.update(distributorSkus).set({ imageUrl: url }).where(eq(distributorSkus.id, rowId));
          } else if (table === "affiliate_room_scene_gallery") {
            await db.update(affiliateRoomSceneGallery).set({ imageUrl: url }).where(eq(affiliateRoomSceneGallery.id, rowId));
          }
        }
      }

      return { url };
    }),
});

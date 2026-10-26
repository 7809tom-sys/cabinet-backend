import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { distributorProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { cabinets, distributorSkus, doorStyleRoomScenes, doorStyles } from "../../drizzle/schema";
import { storagePut } from "../storage";
import {
  MAX_ROOM_SCENE_PHOTOS_PER_STYLE,
  coverPhoto,
  normalizeRoomSceneDescription,
  normalizeRoomSceneName,
  parseIdList,
  roomSceneImageError,
} from "@shared/vendorRoomScenes";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function asBadRequest(error: unknown): never {
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid room scene." });
}

function sceneNameOrThrow(name: string): string {
  try { return normalizeRoomSceneName(name); } catch (error) { asBadRequest(error); }
}

function sceneDescriptionOrThrow(description: string | null | undefined): string | null {
  try { return normalizeRoomSceneDescription(description); } catch (error) { asBadRequest(error); }
}

function lineIdFrom(ctxDistributorId: number | null, isAdmin: boolean, inputDistributorId?: number | null): number {
  if (!isAdmin) {
    if (ctxDistributorId == null) throw new TRPCError({ code: "FORBIDDEN", message: "No supply line linked." });
    return ctxDistributorId;
  }
  if (inputDistributorId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Admins must specify distributorId." });
  return inputDistributorId;
}

async function requireOwnStyle(db: Db, lineId: number, styleId: number) {
  const [style] = await db.select({ id: doorStyles.id }).from(doorStyles)
    .where(and(eq(doorStyles.id, styleId), eq(doorStyles.distributorId, lineId))).limit(1);
  if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That Door Style does not belong to your cabinet line." });
  return style;
}

async function requireOwnPhoto(db: Db, lineId: number, photoId: number) {
  const [photo] = await db
    .select({
      id: doorStyleRoomScenes.id,
      styleId: doorStyleRoomScenes.styleId,
      sceneName: doorStyleRoomScenes.sceneName,
      imageUrl: doorStyleRoomScenes.imageUrl,
    })
    .from(doorStyleRoomScenes)
    .innerJoin(doorStyles, eq(doorStyles.id, doorStyleRoomScenes.styleId))
    .where(and(
      eq(doorStyleRoomScenes.id, photoId),
      eq(doorStyles.distributorId, lineId),
      eq(doorStyleRoomScenes.sourceDistributorId, lineId),
    ))
    .limit(1);
  if (!photo) throw new TRPCError({ code: "FORBIDDEN", message: "Only your own room-scene photo can be changed." });
  return photo;
}

async function stylePhotoCount(db: Db, styleId: number) {
  const [{ sceneCount }] = await db.select({ sceneCount: sql<number>`count(*)` }).from(doorStyleRoomScenes)
    .where(eq(doorStyleRoomScenes.styleId, styleId));
  return Number(sceneCount);
}

async function syncPrimaryRoomScene(db: Db, styleId: number) {
  const photos = await db.select().from(doorStyleRoomScenes)
    .where(and(eq(doorStyleRoomScenes.styleId, styleId), eq(doorStyleRoomScenes.isActive, true)))
    .orderBy(asc(doorStyleRoomScenes.sceneSortOrder), desc(doorStyleRoomScenes.isCover), asc(doorStyleRoomScenes.sortOrder), asc(doorStyleRoomScenes.id));
  const cover = coverPhoto(photos);
  await db.update(doorStyles).set({ roomSceneImageUrl: cover?.imageUrl ?? null }).where(eq(doorStyles.id, styleId));
}

const lineInput = { distributorId: z.number().int().positive().optional() };

export const vendorRoomSceneProcedures = {
  /** Photos this vendor placed into room scenes on their own door styles. */
  ownRoomScenes: distributorProcedure
    .input(z.object(lineInput).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      const rows = await db.select({
        id: doorStyleRoomScenes.id,
        styleId: doorStyleRoomScenes.styleId,
        imageUrl: doorStyleRoomScenes.imageUrl,
        sortOrder: doorStyleRoomScenes.sortOrder,
        sceneName: doorStyleRoomScenes.sceneName,
        sceneDescription: doorStyleRoomScenes.sceneDescription,
        sceneSortOrder: doorStyleRoomScenes.sceneSortOrder,
        isCover: doorStyleRoomScenes.isCover,
        isVerified: doorStyleRoomScenes.isVerified,
        isActive: doorStyleRoomScenes.isActive,
        sourceNote: doorStyleRoomScenes.sourceNote,
        sourceDistributorId: doorStyleRoomScenes.sourceDistributorId,
        taggedCabinetIds: doorStyleRoomScenes.taggedCabinetIds,
        taggedStyleIds: doorStyleRoomScenes.taggedStyleIds,
      }).from(doorStyleRoomScenes)
        .innerJoin(doorStyles, eq(doorStyles.id, doorStyleRoomScenes.styleId))
        .where(eq(doorStyles.distributorId, lineId))
        .orderBy(asc(doorStyleRoomScenes.sceneSortOrder), asc(doorStyleRoomScenes.sortOrder), asc(doorStyleRoomScenes.id));
      return rows.map((row) => ({
        ...row,
        taggedCabinetIds: parseIdList(row.taggedCabinetIds),
        taggedStyleIds: parseIdList(row.taggedStyleIds),
      }));
    }),

  uploadFeaturedStyleScenePhoto: distributorProcedure
    .input(z.object({
      ...lineInput,
      styleId: z.number().int().positive(),
      sceneName: z.string().trim().min(1).max(128),
      sceneDescription: z.string().max(512).nullable().optional(),
      imageBase64: z.string().min(1).max(12_000_000),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      fileName: z.string().trim().max(256).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await requireOwnStyle(db, lineId, input.styleId);
      const sceneName = sceneNameOrThrow(input.sceneName);
      const sceneDescription = sceneDescriptionOrThrow(input.sceneDescription);
      const buffer = Buffer.from(input.imageBase64, "base64");
      const imageError = roomSceneImageError(buffer, input.contentType);
      if (imageError) throw new TRPCError({ code: "BAD_REQUEST", message: imageError });
      const count = await stylePhotoCount(db, input.styleId);
      if (count >= MAX_ROOM_SCENE_PHOTOS_PER_STYLE) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Each Door Style can have up to six room scene photos." });
      }
      const existing = await db.select({
        sceneSortOrder: doorStyleRoomScenes.sceneSortOrder,
        sortOrder: doorStyleRoomScenes.sortOrder,
        sceneDescription: doorStyleRoomScenes.sceneDescription,
      }).from(doorStyleRoomScenes).where(and(
        eq(doorStyleRoomScenes.styleId, input.styleId),
        eq(doorStyleRoomScenes.sourceDistributorId, lineId),
        eq(doorStyleRoomScenes.sceneName, sceneName),
      ));
      const [{ maxScene }] = await db.select({ maxScene: sql<number>`coalesce(max(${doorStyleRoomScenes.sceneSortOrder}), 0)` })
        .from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
      const sceneSortOrder = existing[0]?.sceneSortOrder ?? Number(maxScene) + 10;
      const sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 10;
      const extension = input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";
      const safeName = (input.fileName ?? `scene.${extension}`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const key = `vendor-styles/${lineId}/room-scenes/${input.styleId}/${Date.now()}-${safeName}`;
      const stored = await storagePut(key, buffer, input.contentType);
      const isCover = existing.length === 0;
      await db.insert(doorStyleRoomScenes).values({
        styleId: input.styleId,
        imageUrl: stored.url,
        fileKey: stored.key,
        sortOrder,
        sceneName,
        sceneDescription: sceneDescription ?? existing.find((row) => row.sceneDescription)?.sceneDescription ?? null,
        sceneSortOrder,
        isCover,
        isVerified: true,
        isActive: true,
        sourceDistributorId: lineId,
        sourceNote: `Vendor room scene · ${sceneName}`,
      });
      if (sceneDescription) {
        await db.update(doorStyleRoomScenes).set({ sceneDescription }).where(and(
          eq(doorStyleRoomScenes.styleId, input.styleId),
          eq(doorStyleRoomScenes.sourceDistributorId, lineId),
          eq(doorStyleRoomScenes.sceneName, sceneName),
        ));
      }
      await syncPrimaryRoomScene(db, input.styleId);
      return { ok: true as const, imageUrl: stored.url };
    }),

  renameFeaturedStyleScene: distributorProcedure
    .input(z.object({
      ...lineInput,
      styleId: z.number().int().positive(),
      fromName: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(128),
      description: z.string().max(512).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await requireOwnStyle(db, lineId, input.styleId);
      const fromName = sceneNameOrThrow(input.fromName);
      const name = sceneNameOrThrow(input.name);
      const description = input.description === undefined ? undefined : sceneDescriptionOrThrow(input.description);
      const patch: { sceneName: string; sceneDescription?: string | null; sourceNote: string } = {
        sceneName: name,
        sourceNote: `Vendor room scene · ${name}`,
      };
      if (description !== undefined) patch.sceneDescription = description;
      const [owned] = await db.select({ id: doorStyleRoomScenes.id }).from(doorStyleRoomScenes).where(and(
        eq(doorStyleRoomScenes.styleId, input.styleId),
        eq(doorStyleRoomScenes.sourceDistributorId, lineId),
        eq(doorStyleRoomScenes.sceneName, fromName),
      )).limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "That room scene was not found on your line." });
      await db.update(doorStyleRoomScenes).set(patch).where(and(
        eq(doorStyleRoomScenes.styleId, input.styleId),
        eq(doorStyleRoomScenes.sourceDistributorId, lineId),
        eq(doorStyleRoomScenes.sceneName, fromName),
      ));
      return { ok: true as const };
    }),

  reorderFeaturedStyleScenes: distributorProcedure
    .input(z.object({
      ...lineInput,
      styleId: z.number().int().positive(),
      orderedNames: z.array(z.string().trim().min(1).max(128)).min(1).max(12),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await requireOwnStyle(db, lineId, input.styleId);
      for (const [index, rawName] of input.orderedNames.entries()) {
        const name = sceneNameOrThrow(rawName);
        await db.update(doorStyleRoomScenes).set({ sceneSortOrder: (index + 1) * 10 }).where(and(
          eq(doorStyleRoomScenes.styleId, input.styleId),
          eq(doorStyleRoomScenes.sourceDistributorId, lineId),
          eq(doorStyleRoomScenes.sceneName, name),
        ));
      }
      await syncPrimaryRoomScene(db, input.styleId);
      return { ok: true as const };
    }),

  reorderFeaturedStyleScenePhotos: distributorProcedure
    .input(z.object({
      ...lineInput,
      styleId: z.number().int().positive(),
      sceneName: z.string().trim().min(1).max(128),
      orderedIds: z.array(z.number().int().positive()).min(1).max(MAX_ROOM_SCENE_PHOTOS_PER_STYLE),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const sceneName = sceneNameOrThrow(input.sceneName);
      const owned = await db.select({ id: doorStyleRoomScenes.id }).from(doorStyleRoomScenes).where(and(
        eq(doorStyleRoomScenes.styleId, input.styleId),
        eq(doorStyleRoomScenes.sourceDistributorId, lineId),
        eq(doorStyleRoomScenes.sceneName, sceneName),
        inArray(doorStyleRoomScenes.id, input.orderedIds),
      ));
      if (owned.length !== input.orderedIds.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only photos in your own room scene can be reordered." });
      }
      await Promise.all(input.orderedIds.map((id, index) => db.update(doorStyleRoomScenes)
        .set({ sortOrder: (index + 1) * 10 })
        .where(eq(doorStyleRoomScenes.id, id))));
      await syncPrimaryRoomScene(db, input.styleId);
      return { ok: true as const };
    }),

  moveFeaturedStyleScenePhoto: distributorProcedure
    .input(z.object({
      ...lineInput,
      photoId: z.number().int().positive(),
      styleId: z.number().int().positive(),
      sceneName: z.string().trim().min(1).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const photo = await requireOwnPhoto(db, lineId, input.photoId);
      await requireOwnStyle(db, lineId, input.styleId);
      const sceneName = sceneNameOrThrow(input.sceneName);
      if (input.styleId !== photo.styleId) {
        const count = await stylePhotoCount(db, input.styleId);
        if (count >= MAX_ROOM_SCENE_PHOTOS_PER_STYLE) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The destination Door Style already has six room scene photos." });
        }
      }
      const destination = (await db.select({
        id: doorStyleRoomScenes.id,
        sceneSortOrder: doorStyleRoomScenes.sceneSortOrder,
        sortOrder: doorStyleRoomScenes.sortOrder,
      }).from(doorStyleRoomScenes).where(and(
        eq(doorStyleRoomScenes.styleId, input.styleId),
        eq(doorStyleRoomScenes.sourceDistributorId, lineId),
        eq(doorStyleRoomScenes.sceneName, sceneName),
      ))).filter((row) => row.id !== input.photoId);
      const [{ maxScene }] = await db.select({ maxScene: sql<number>`coalesce(max(${doorStyleRoomScenes.sceneSortOrder}), 0)` })
        .from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
      await db.update(doorStyleRoomScenes).set({
        styleId: input.styleId,
        sceneName,
        sceneSortOrder: destination[0]?.sceneSortOrder ?? Number(maxScene) + 10,
        sortOrder: destination.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 10,
        sourceNote: `Vendor room scene · ${sceneName}`,
      }).where(eq(doorStyleRoomScenes.id, photo.id));
      await syncPrimaryRoomScene(db, photo.styleId);
      if (input.styleId !== photo.styleId) await syncPrimaryRoomScene(db, input.styleId);
      return { ok: true as const };
    }),

  setFeaturedStyleSceneCover: distributorProcedure
    .input(z.object({ ...lineInput, photoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const photo = await requireOwnPhoto(db, lineId, input.photoId);
      await db.update(doorStyleRoomScenes).set({ isCover: false }).where(and(
        eq(doorStyleRoomScenes.styleId, photo.styleId),
        eq(doorStyleRoomScenes.sourceDistributorId, lineId),
        eq(doorStyleRoomScenes.sceneName, photo.sceneName),
      ));
      await db.update(doorStyleRoomScenes).set({ isCover: true }).where(eq(doorStyleRoomScenes.id, photo.id));
      await syncPrimaryRoomScene(db, photo.styleId);
      return { ok: true as const };
    }),

  tagFeaturedStyleScenePhoto: distributorProcedure
    .input(z.object({
      ...lineInput,
      photoId: z.number().int().positive(),
      cabinetIds: z.array(z.number().int().positive()).max(50),
      styleIds: z.array(z.number().int().positive()).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const photo = await requireOwnPhoto(db, lineId, input.photoId);
      const cabinetIds = Array.from(new Set(input.cabinetIds));
      const styleIds = Array.from(new Set(input.styleIds));
      if (cabinetIds.length > 0) {
        const ownedCabinets = await db.select({ id: cabinets.id }).from(cabinets)
          .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
          .where(and(eq(distributorSkus.distributorId, lineId), inArray(cabinets.id, cabinetIds)));
        if (new Set(ownedCabinets.map((row) => row.id)).size !== cabinetIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Tag only catalog items from your own line." });
        }
      }
      if (styleIds.length > 0) {
        const ownedStyles = await db.select({ id: doorStyles.id }).from(doorStyles)
          .where(and(eq(doorStyles.distributorId, lineId), inArray(doorStyles.id, styleIds)));
        if (ownedStyles.length !== styleIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Tag only door styles from your own line." });
        }
      }
      await db.update(doorStyleRoomScenes).set({
        taggedCabinetIds: cabinetIds,
        taggedStyleIds: styleIds,
      }).where(eq(doorStyleRoomScenes.id, photo.id));
      return { ok: true as const };
    }),

  deleteFeaturedStyleSceneGroup: distributorProcedure
    .input(z.object({
      ...lineInput,
      styleId: z.number().int().positive(),
      sceneName: z.string().trim().min(1).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = lineIdFrom(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await requireOwnStyle(db, lineId, input.styleId);
      const sceneName = sceneNameOrThrow(input.sceneName);
      await db.delete(doorStyleRoomScenes).where(and(
        eq(doorStyleRoomScenes.styleId, input.styleId),
        eq(doorStyleRoomScenes.sourceDistributorId, lineId),
        eq(doorStyleRoomScenes.sceneName, sceneName),
      ));
      await syncPrimaryRoomScene(db, input.styleId);
      return { ok: true as const };
    }),
};

import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";
import {
  designGeminiImageTestJobs,
  designImageRequests,
  designPhotoRenders,
  doorStyleRoomScenes,
  doorStyles,
  kitchenDesigns,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";

const generatedImageSourceSchema = z.enum(["deterministic", "gemini"]);
type GeneratedImageSource = z.infer<typeof generatedImageSourceSchema>;

type GeneratedImageProvenance = {
  designId?: number;
  materials?: Array<{ role?: string; productId?: number | null; name?: string | null }>;
};

type GeneratedImageEntry = {
  source: GeneratedImageSource;
  sourceId: number;
  userId: number;
  kitchenDesignId: number | null;
  sceneSignature: string;
  imageUrl: string;
  provenance: GeneratedImageProvenance | null;
  generationMethod: string | null;
  createdAt: Date;
};

function generatedImageSourceKey(source: GeneratedImageSource, sourceId: number) {
  return `generated-design-image:${source}:${sourceId}`;
}

function lockedDesignId(entry: GeneratedImageEntry) {
  const id = entry.kitchenDesignId ?? entry.provenance?.designId ?? null;
  return id != null && id > 0 ? id : null;
}

function cabinetNameFromProvenance(provenance: GeneratedImageProvenance | null) {
  return provenance?.materials?.find((material) => material.role === "cabinet")?.name?.trim() || null;
}

function sourceLabel(source: GeneratedImageSource, method: string | null) {
  if (source === "gemini") return "Google/Gemini administrator test";
  if (method === "manual-final-review-deterministic-webgl-v1") return "Exact 3D final render";
  return "Generated design image";
}

/**
 * Internal-only review library for images generated from a locked CabinetDealz
 * design. This does not make an image public. Publication requires the separate
 * carousel action below, which creates or activates a door-style room scene.
 */
export const generatedDesignImagesRouter = router({
  list: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(250).default(100) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [] as unknown[], total: 0 };
      const limit = input?.limit ?? 100;

      const [deterministicRows, geminiRows] = await Promise.all([
        db.select({
          id: designPhotoRenders.id,
          userId: designPhotoRenders.userId,
          kitchenDesignId: designPhotoRenders.kitchenDesignId,
          sceneSignature: designPhotoRenders.sceneSignature,
          imageUrl: designPhotoRenders.imageUrl,
          provenance: designPhotoRenders.provenance,
          generationMethod: designPhotoRenders.generationMethod,
          createdAt: designPhotoRenders.createdAt,
        }).from(designPhotoRenders).orderBy(desc(designPhotoRenders.createdAt)).limit(limit),
        db.select({
          id: designGeminiImageTestJobs.id,
          userId: designGeminiImageTestJobs.userId,
          kitchenDesignId: designGeminiImageTestJobs.kitchenDesignId,
          sceneSignature: designGeminiImageTestJobs.sceneSignature,
          imageUrl: designGeminiImageTestJobs.imageUrl,
          provenance: designGeminiImageTestJobs.provenance,
          createdAt: designGeminiImageTestJobs.completedAt,
        }).from(designGeminiImageTestJobs)
          .where(and(eq(designGeminiImageTestJobs.status, "completed"),))
          .orderBy(desc(designGeminiImageTestJobs.completedAt))
          .limit(limit),
      ]);

      const generated: GeneratedImageEntry[] = [
        ...deterministicRows.map((row) => ({
          source: "deterministic" as const,
          sourceId: row.id,
          userId: row.userId,
          kitchenDesignId: row.kitchenDesignId,
          sceneSignature: row.sceneSignature,
          imageUrl: row.imageUrl,
          provenance: row.provenance,
          generationMethod: row.generationMethod,
          createdAt: row.createdAt,
        })),
        ...geminiRows.filter((row): row is typeof row & { imageUrl: string; createdAt: Date } => Boolean(row.imageUrl && row.createdAt)).map((row) => ({
          source: "gemini" as const,
          sourceId: row.id,
          userId: row.userId,
          kitchenDesignId: row.kitchenDesignId,
          sceneSignature: row.sceneSignature,
          imageUrl: row.imageUrl,
          provenance: row.provenance,
          generationMethod: "manual-final-review-gemini-nano-banana-v1",
          createdAt: row.createdAt,
        })),
      ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, limit);

      const designIds = Array.from(new Set(generated.map(lockedDesignId).filter((id): id is number => id !== null)));
      const [designRows, sceneRows] = await Promise.all([
        designIds.length
          ? db.select({ id: kitchenDesigns.id, userId: kitchenDesigns.userId, name: kitchenDesigns.name, selectedStyleId: kitchenDesigns.selectedStyleId }).from(kitchenDesigns).where(inArray(kitchenDesigns.id, designIds))
          : Promise.resolve([]),
        db.select({ id: doorStyleRoomScenes.id, styleId: doorStyleRoomScenes.styleId, isActive: doorStyleRoomScenes.isActive, sourceNote: doorStyleRoomScenes.sourceNote })
          .from(doorStyleRoomScenes)
          .where(like(doorStyleRoomScenes.sourceNote, "generated-design-image:%")),
      ]);
      const designsById = new Map(designRows.map((design) => [design.id, design]));
      const userIds = Array.from(new Set(generated.map((entry) => entry.userId).concat(designRows.map((design) => design.userId).filter((id): id is number => id != null))));
      const styleIds = Array.from(new Set(designRows.map((design) => design.selectedStyleId).filter((id): id is number => id != null).concat(generated.map((entry) => entry.provenance?.materials?.find((material) => material.role === "cabinet")?.productId ?? null).filter((id): id is number => id != null))));
      const sceneSignatures = Array.from(new Set(generated.map((entry) => entry.sceneSignature)));
      const [userRows, styleRows, requestRows] = await Promise.all([
        userIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
        styleIds.length ? db.select({ id: doorStyles.id, ourName: doorStyles.ourName, aliasName: doorStyles.aliasName }).from(doorStyles).where(inArray(doorStyles.id, styleIds)) : Promise.resolve([]),
        sceneSignatures.length ? db.select({ sceneSignature: designImageRequests.sceneSignature, name: designImageRequests.name, updatedAt: designImageRequests.updatedAt }).from(designImageRequests).where(inArray(designImageRequests.sceneSignature, sceneSignatures)).orderBy(desc(designImageRequests.updatedAt)) : Promise.resolve([]),
      ]);
      const usersById = new Map(userRows.map((user) => [user.id, user]));
      const stylesById = new Map(styleRows.map((style) => [style.id, style]));
      const customerBySignature = new Map<string, string>();
      for (const request of requestRows) {
        if (!customerBySignature.has(request.sceneSignature)) customerBySignature.set(request.sceneSignature, request.name);
      }
      const scenesByKey = new Map<string, typeof sceneRows[number]>();
      for (const scene of sceneRows) {
        if (scene.sourceNote && !scenesByKey.has(scene.sourceNote)) scenesByKey.set(scene.sourceNote, scene);
      }

      return {
        total: generated.length,
        items: generated.map((entry) => {
          const designId = lockedDesignId(entry);
          const design = designId ? designsById.get(designId) ?? null : null;
          const provenanceStyleId = entry.provenance?.materials?.find((material) => material.role === "cabinet")?.productId ?? null;
          const defaultStyleId = design?.selectedStyleId ?? provenanceStyleId ?? null;
          const style = defaultStyleId ? stylesById.get(defaultStyleId) ?? null : null;
          const sourceKey = generatedImageSourceKey(entry.source, entry.sourceId);
          const scene = scenesByKey.get(sourceKey) ?? null;
          return {
            source: entry.source,
            sourceId: entry.sourceId,
            sourceKey,
            sourceLabel: sourceLabel(entry.source, entry.generationMethod),
            imageUrl: entry.imageUrl,
            createdAt: entry.createdAt,
            designId,
            designName: design?.name ?? "Current design snapshot",
            cabinetStyleId: defaultStyleId,
            cabinetName: style?.aliasName?.trim() || style?.ourName?.trim() || cabinetNameFromProvenance(entry.provenance),
            customerName: customerBySignature.get(entry.sceneSignature) ?? null,
            originatorName: usersById.get(entry.userId)?.name ?? `User #${entry.userId}`,
            carousel: scene ? { sceneId: scene.id, styleId: scene.styleId, active: scene.isActive } : null,
          };
        }),
      };
    }),

  setRoomSceneCarousel: adminProcedure
    .input(z.object({
      source: generatedImageSourceSchema,
      sourceId: z.number().int().positive(),
      styleId: z.number().int().positive(),
      active: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const source = input.source === "deterministic"
        ? (await db.select({ id: designPhotoRenders.id, imageUrl: designPhotoRenders.imageUrl }).from(designPhotoRenders).where(eq(designPhotoRenders.id, input.sourceId)).limit(1))[0]
        : (await db.select({ id: designGeminiImageTestJobs.id, imageUrl: designGeminiImageTestJobs.imageUrl, status: designGeminiImageTestJobs.status }).from(designGeminiImageTestJobs).where(eq(designGeminiImageTestJobs.id, input.sourceId)).limit(1))[0];
      if (!source?.imageUrl || (input.source === "gemini" && "status" in source && source.status !== "completed")) {
        throw new TRPCError({ code: "NOT_FOUND", message: "The completed generated image is no longer available." });
      }
      const [style] = await db.select({ id: doorStyles.id }).from(doorStyles).where(eq(doorStyles.id, input.styleId)).limit(1);
      if (!style) throw new TRPCError({ code: "NOT_FOUND", message: "Choose a valid Door Style before adding this image to the room-scene carousel." });

      const sourceNote = generatedImageSourceKey(input.source, input.sourceId);
      const [existing] = await db.select({ id: doorStyleRoomScenes.id }).from(doorStyleRoomScenes).where(and(
        eq(doorStyleRoomScenes.styleId, input.styleId),
        eq(doorStyleRoomScenes.sourceNote, sourceNote),
      )).limit(1);

      if (!input.active) {
        if (existing) await db.update(doorStyleRoomScenes).set({ isActive: false }).where(eq(doorStyleRoomScenes.id, existing.id));
        return { active: false, sceneId: existing?.id ?? null };
      }
      if (existing) {
        await db.update(doorStyleRoomScenes).set({ isActive: true, isVerified: true }).where(eq(doorStyleRoomScenes.id, existing.id));
        return { active: true, sceneId: existing.id };
      }

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
      const sceneCount = Number(count ?? 0);
      if (sceneCount >= 6) throw new TRPCError({ code: "BAD_REQUEST", message: "This Door Style already has the maximum of 6 room-scene images. Deactivate or remove one before approving another." });
      const [lastScene] = await db.select({ maxOrder: doorStyleRoomScenes.sortOrder }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId)).orderBy(desc(doorStyleRoomScenes.sortOrder)).limit(1);
      const result = await db.insert(doorStyleRoomScenes).values({
        styleId: input.styleId,
        imageUrl: source.imageUrl,
        sourceNote,
        isVerified: true,
        isActive: true,
        sortOrder: (lastScene?.maxOrder ?? 0) + 10,
      });
      return { active: true, sceneId: Number((result as unknown as { insertId: number }).insertId) };
    }),
});

export { generatedImageSourceKey };

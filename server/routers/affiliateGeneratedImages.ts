import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  affiliateGeneratedImages,
  affiliateStyleBranding,
  affiliates,
  designGeminiImageTestJobs,
  designPhotoRenders,
  kitchenDesigns,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { applyAffiliateLogoWatermark } from "../lib/affiliateImageWatermark";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const sourceInput = z.object({
  sourceType: z.enum(["deterministic", "gemini"]),
  sourceId: z.number().int().positive(),
});

async function requireAffiliate(ctx: { user: { id: number; email: string | null } }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const access = await resolveAffiliateAccess(db, ctx.user);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate access required" });
  return { db, affiliateId: access.affiliateId };
}

async function loadSourceImage(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, affiliateId: number, input: z.infer<typeof sourceInput>) {
  if (input.sourceType === "deterministic") {
    const rows = await db.select({
      id: designPhotoRenders.id,
      imageUrl: designPhotoRenders.imageUrl,
      kitchenDesignId: designPhotoRenders.kitchenDesignId,
      createdAt: designPhotoRenders.createdAt,
      name: kitchenDesigns.name,
    }).from(designPhotoRenders)
      .leftJoin(kitchenDesigns, eq(kitchenDesigns.id, designPhotoRenders.kitchenDesignId))
      .where(and(eq(designPhotoRenders.id, input.sourceId), eq(kitchenDesigns.affiliateId, affiliateId)))
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db.select({
    id: designGeminiImageTestJobs.id,
    imageUrl: designGeminiImageTestJobs.imageUrl,
    kitchenDesignId: designGeminiImageTestJobs.kitchenDesignId,
    createdAt: designGeminiImageTestJobs.completedAt,
    name: kitchenDesigns.name,
  }).from(designGeminiImageTestJobs)
    .innerJoin(kitchenDesigns, eq(kitchenDesigns.id, designGeminiImageTestJobs.kitchenDesignId))
    .where(and(eq(designGeminiImageTestJobs.id, input.sourceId), eq(kitchenDesigns.affiliateId, affiliateId), eq(designGeminiImageTestJobs.status, "completed")))
    .limit(1);
  return rows[0] ?? null;
}

async function fetchStoredImage(imageUrl: string) {
  if (!imageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "The generated image has no file." });
  const keyPrefix = "/manus-storage/";
  const response = imageUrl.startsWith(keyPrefix)
    ? await fetch(await storageGetSignedUrl(imageUrl.slice(keyPrefix.length)))
    : await fetch(imageUrl);
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "The generated image could not be read." });
  return Buffer.from(await response.arrayBuffer());
}

function fallbackLogo(storeName: string) {
  const text = storeName.trim().slice(0, 32).replace(/[<&>"']/g, "");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="180" viewBox="0 0 720 180"><rect width="720" height="180" rx="22" fill="#ffffff" fill-opacity="0.92"/><text x="30" y="118" font-family="Arial,sans-serif" font-size="62" font-weight="700" fill="#14213d">${text || "Cabinet Dealz Affiliate"}</text></svg>`);
}

export const affiliateGeneratedImagesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { db, affiliateId } = await requireAffiliate(ctx);
    const [deterministic, gemini, derivatives] = await Promise.all([
      db.select({ id: designPhotoRenders.id, imageUrl: designPhotoRenders.imageUrl, kitchenDesignId: designPhotoRenders.kitchenDesignId, createdAt: designPhotoRenders.createdAt, name: kitchenDesigns.name })
        .from(designPhotoRenders).innerJoin(kitchenDesigns, eq(kitchenDesigns.id, designPhotoRenders.kitchenDesignId))
        .where(eq(kitchenDesigns.affiliateId, affiliateId)).orderBy(desc(designPhotoRenders.createdAt)).limit(100),
      db.select({ id: designGeminiImageTestJobs.id, imageUrl: designGeminiImageTestJobs.imageUrl, kitchenDesignId: designGeminiImageTestJobs.kitchenDesignId, createdAt: designGeminiImageTestJobs.completedAt, name: kitchenDesigns.name })
        .from(designGeminiImageTestJobs).innerJoin(kitchenDesigns, eq(kitchenDesigns.id, designGeminiImageTestJobs.kitchenDesignId))
        .where(and(eq(kitchenDesigns.affiliateId, affiliateId), eq(designGeminiImageTestJobs.status, "completed"))).orderBy(desc(designGeminiImageTestJobs.completedAt)).limit(100),
      db.select().from(affiliateGeneratedImages).where(eq(affiliateGeneratedImages.affiliateId, affiliateId)),
    ]);
    const derivativeByKey = new Map(derivatives.map((row) => [`${row.sourceType}:${row.sourceId}`, row]));
    return [...deterministic.map((row) => ({ ...row, sourceType: "deterministic" as const })), ...gemini.map((row) => ({ ...row, sourceType: "gemini" as const }))]
      .filter((row) => Boolean(row.imageUrl))
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .map((row) => {
        const derivative = derivativeByKey.get(`${row.sourceType}:${row.id}`);
        return { ...row, derivativeId: derivative?.id ?? null, watermarkedUrl: derivative?.watermarkedUrl ?? null, isFeatured: derivative?.isFeatured ?? false, featuredStyleId: derivative?.featuredStyleId ?? null };
      });
  }),

  watermark: protectedProcedure.input(sourceInput).mutation(async ({ ctx, input }) => {
    const { db, affiliateId } = await requireAffiliate(ctx);
    const source = await loadSourceImage(db, affiliateId, input);
    if (!source?.imageUrl) throw new TRPCError({ code: "NOT_FOUND", message: "That generated image is not part of this affiliate storefront." });
    const [affiliate] = await db.select({ logoUrl: affiliates.logoUrl, storeName: affiliates.storeName, watermarkOpacityBps: affiliates.watermarkOpacityBps, watermarkPosition: affiliates.watermarkPosition }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    if (!affiliate) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
    const logo = affiliate.logoUrl ? await fetchStoredImage(affiliate.logoUrl) : fallbackLogo(affiliate.storeName);
    const original = await fetchStoredImage(source.imageUrl);
    const rendered = await applyAffiliateLogoWatermark(original, logo, { opacityBps: affiliate.watermarkOpacityBps, position: affiliate.watermarkPosition });
    const stored = await storagePut(`affiliate-image-cabinet/${affiliateId}/${input.sourceType}-${input.sourceId}-watermarked.${rendered.format}`, rendered.data, rendered.format === "png" ? "image/png" : "image/jpeg");
    const existing = await db.select({ id: affiliateGeneratedImages.id }).from(affiliateGeneratedImages).where(and(eq(affiliateGeneratedImages.affiliateId, affiliateId), eq(affiliateGeneratedImages.sourceType, input.sourceType), eq(affiliateGeneratedImages.sourceId, input.sourceId))).limit(1);
    if (existing[0]) await db.update(affiliateGeneratedImages).set({ originalUrl: source.imageUrl, watermarkedUrl: stored.url, createdByUserId: ctx.user.id }).where(eq(affiliateGeneratedImages.id, existing[0].id));
    else await db.insert(affiliateGeneratedImages).values({ affiliateId, sourceType: input.sourceType, sourceId: input.sourceId, originalUrl: source.imageUrl, watermarkedUrl: stored.url, createdByUserId: ctx.user.id });
    return { url: stored.url, position: "bottom-right" as const };
  }),

  feature: protectedProcedure.input(sourceInput.extend({ styleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { db, affiliateId } = await requireAffiliate(ctx);
    const existing = await db.select().from(affiliateGeneratedImages).where(and(eq(affiliateGeneratedImages.affiliateId, affiliateId), eq(affiliateGeneratedImages.sourceType, input.sourceType), eq(affiliateGeneratedImages.sourceId, input.sourceId))).limit(1);
    const derivative = existing[0];
    if (!derivative?.watermarkedUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Watermark the image before featuring it in room scenes." });
    await db.update(affiliateGeneratedImages).set({ isFeatured: true, featuredStyleId: input.styleId }).where(eq(affiliateGeneratedImages.id, derivative.id));
    const style = await db.select({ id: affiliateStyleBranding.id }).from(affiliateStyleBranding).where(and(eq(affiliateStyleBranding.affiliateId, affiliateId), eq(affiliateStyleBranding.styleId, input.styleId))).limit(1);
    if (style[0]) await db.update(affiliateStyleBranding).set({ roomSceneUrl: derivative.watermarkedUrl, featured: true }).where(eq(affiliateStyleBranding.id, style[0].id));
    else await db.insert(affiliateStyleBranding).values({ affiliateId, styleId: input.styleId, roomSceneUrl: derivative.watermarkedUrl, featured: true });
    return { featured: true, url: derivative.watermarkedUrl };
  }),
});

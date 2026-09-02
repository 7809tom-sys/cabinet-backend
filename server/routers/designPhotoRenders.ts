import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { designPhotoRenders } from "../../drizzle/schema";
import { getDb } from "../db";
import { generateImage } from "../_core/imageGeneration";
import { protectedProcedure, router } from "../_core/trpc";

const DATA_IMAGE_PREFIX = /^data:image\/(png|jpeg|webp);base64,/;
const safeMaterialUrl = z.string().url().refine((value) => {
  const host = new URL(value).hostname.toLowerCase();
  return host === "www.cabinetdealz.com" || host.endsWith(".cabinetdealz.com") || host.endsWith("manuscdn.com") || host === "buildpelican.com";
}, "Material references must be CabinetDealz or manufacturer image URLs.");

function exactPlanPrompt(summary: string) {
  return [
    "Create a polished, photo-quality interior visualization from the FIRST reference image.",
    "The first image is the exact locked CabinetDealz Designer plan and camera composition. Preserve it exactly: do not add, remove, move, rotate, resize, substitute, merge, hide, or invent cabinets, fillers, countertops, appliances, sinks, faucets, windows, doors, walls, islands, ceiling heights, or fixtures. Do not change the camera angle, crop, viewpoint, or room dimensions.",
    "Use the following reference images only to improve physically plausible surface appearance for the exact matching selected cabinet finish, countertop, flooring, and backsplash. Keep product material color and grain faithful. Improve natural daylight, soft contact shadows, metal, glass, and surface realism without changing geometry.",
    "Return only the finished photorealistic kitchen image; no labels, UI, people, text, logos, watermarks, measurements, or additional products.",
    summary ? `Selected design summary: ${summary}` : "",
  ].filter(Boolean).join(" ");
}

export const designPhotoRendersRouter = router({
  getCached: protectedProcedure
    .input(z.object({ sceneSignature: z.string().min(16).max(191) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [cached] = await db.select().from(designPhotoRenders)
        .where(and(eq(designPhotoRenders.userId, ctx.user.id), eq(designPhotoRenders.sceneSignature, input.sceneSignature)))
        .limit(1);
      return cached ? { imageUrl: cached.imageUrl, createdAt: cached.createdAt, reused: true } : null;
    }),

  create: protectedProcedure
    .input(z.object({
      sceneSignature: z.string().min(16).max(191),
      sceneImageDataUrl: z.string().min(128).max(8_500_000).regex(DATA_IMAGE_PREFIX, "A PNG, JPEG, or WebP Designer image is required."),
      materialImageUrls: z.array(safeMaterialUrl).max(4).default([]),
      summary: z.string().trim().max(640).default(""),
      confirmation: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Photo rendering is temporarily unavailable.");
      const [cached] = await db.select().from(designPhotoRenders)
        .where(and(eq(designPhotoRenders.userId, ctx.user.id), eq(designPhotoRenders.sceneSignature, input.sceneSignature)))
        .limit(1);
      if (cached) return { imageUrl: cached.imageUrl, reused: true };

      const sceneImage = input.sceneImageDataUrl.replace(DATA_IMAGE_PREFIX, "");
      const materialReferences = input.materialImageUrls.map((url) => ({ url, mimeType: url.toLowerCase().endsWith(".png") ? "image/png" : url.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg" }));
      const result = await generateImage({
        prompt: exactPlanPrompt(input.summary),
        originalImages: [{ b64Json: sceneImage, mimeType: input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] === "jpeg" ? "image/jpeg" : input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] === "webp" ? "image/webp" : "image/png" }, ...materialReferences],
      });
      if (!result.url) throw new Error("Photo rendering completed without an image result.");
      const promptFingerprint = createHash("sha256").update(exactPlanPrompt(input.summary)).digest("hex").slice(0, 16);
      await db.insert(designPhotoRenders).values({ userId: ctx.user.id, sceneSignature: input.sceneSignature, imageUrl: result.url })
        .onDuplicateKeyUpdate({ set: { imageUrl: result.url, updatedAt: new Date() } });
      return { imageUrl: result.url, reused: false, promptFingerprint };
    }),
});

export { exactPlanPrompt };

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

const vector3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const materialProvenanceSchema = z.object({
  role: z.enum(["cabinet", "countertop", "flooring", "backsplash"]),
  productId: z.number().int().positive().nullable(),
  name: z.string().trim().max(255).nullable(),
  materialImageUrl: safeMaterialUrl.nullable(),
});
export const photoRenderProvenanceSchema = z.object({
  contractVersion: z.literal("exact-plan-v1"),
  designId: z.number().int().positive(),
  designRevision: z.string().trim().max(191).nullable(),
  geometryLock: z.string().min(16).max(400_000),
  camera: z.object({ position: vector3Schema, target: vector3Schema, zoom: z.number().finite().positive() }),
  materials: z.array(materialProvenanceSchema).length(4),
  sourceImageHash: z.string().regex(/^[a-f0-9]{64}$/i, "A SHA-256 source-image hash is required."),
  generationMethod: z.literal("manual-final-review-image-service"),
});
type PhotoRenderProvenanceInput = z.infer<typeof photoRenderProvenanceSchema>;

function exactPlanPrompt(summary: string) {
  return [
    "Create a polished, photo-quality interior visualization from the FIRST reference image.",
    "The first image is the exact locked CabinetDealz Designer plan and camera composition. Preserve it exactly: do not add, remove, move, rotate, resize, substitute, merge, hide, or invent cabinets, fillers, countertops, appliances, sinks, faucets, windows, doors, walls, islands, ceiling heights, or fixtures. Do not change the camera angle, crop, viewpoint, or room dimensions.",
    "Use the following reference images only to improve physically plausible surface appearance for the exact matching selected cabinet finish, countertop, flooring, and backsplash. Keep product material color and grain faithful. Improve natural daylight, soft contact shadows, metal, glass, and surface realism without changing geometry.",
    "Return only the finished photorealistic kitchen image; no labels, UI, people, text, logos, watermarks, measurements, or additional products.",
    summary ? `Selected design summary: ${summary}` : "",
  ].filter(Boolean).join(" ");
}

export function photoRenderProvenanceSummary(provenance: PhotoRenderProvenanceInput) {
  const material = (role: PhotoRenderProvenanceInput["materials"][number]["role"]) =>
    provenance.materials.find((entry) => entry.role === role)?.name ?? "none";
  return `Saved design #${provenance.designId}${provenance.designRevision ? ` revision ${provenance.designRevision}` : ""}. Cabinet finish: ${material("cabinet")}. Countertop: ${material("countertop")}. Flooring: ${material("flooring")}. Backsplash: ${material("backsplash")}.`;
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
      return cached ? {
        imageUrl: cached.imageUrl,
        createdAt: cached.createdAt,
        provenance: cached.provenance,
        sourceImageHash: cached.sourceImageHash,
        promptFingerprint: cached.promptFingerprint,
        generationMethod: cached.generationMethod,
        confirmedAt: cached.confirmedAt,
        reused: true,
      } : null;
    }),

  create: protectedProcedure
    .input(z.object({
      sceneSignature: z.string().min(16).max(191),
      sceneImageDataUrl: z.string().min(128).max(8_500_000).regex(DATA_IMAGE_PREFIX, "A PNG, JPEG, or WebP Designer image is required."),
      provenance: photoRenderProvenanceSchema,
      confirmation: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Photo rendering is temporarily unavailable.");
      const [cached] = await db.select().from(designPhotoRenders)
        .where(and(eq(designPhotoRenders.userId, ctx.user.id), eq(designPhotoRenders.sceneSignature, input.sceneSignature)))
        .limit(1);
      if (cached) return {
        imageUrl: cached.imageUrl,
        provenance: cached.provenance,
        sourceImageHash: cached.sourceImageHash,
        promptFingerprint: cached.promptFingerprint,
        generationMethod: cached.generationMethod,
        confirmedAt: cached.confirmedAt,
        reused: true,
      };

      const sceneImage = input.sceneImageDataUrl.replace(DATA_IMAGE_PREFIX, "");
      const materialReferences = Array.from(new Set(input.provenance.materials.flatMap((material) => material.materialImageUrl ? [material.materialImageUrl] : [])))
        .map((url) => ({ url, mimeType: url.toLowerCase().endsWith(".png") ? "image/png" : url.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg" }));
      const summary = photoRenderProvenanceSummary(input.provenance);
      const result = await generateImage({
        prompt: exactPlanPrompt(summary),
        originalImages: [{ b64Json: sceneImage, mimeType: input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] === "jpeg" ? "image/jpeg" : input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] === "webp" ? "image/webp" : "image/png" }, ...materialReferences],
      });
      if (!result.url) throw new Error("Photo rendering completed without an image result.");
      const promptFingerprint = createHash("sha256").update(exactPlanPrompt(summary)).digest("hex");
      const confirmedAt = new Date();
      await db.insert(designPhotoRenders).values({
        userId: ctx.user.id,
        sceneSignature: input.sceneSignature,
        imageUrl: result.url,
        provenance: input.provenance,
        sourceImageHash: input.provenance.sourceImageHash,
        promptFingerprint,
        generationMethod: input.provenance.generationMethod,
        confirmedAt,
      }).onDuplicateKeyUpdate({
        set: {
          imageUrl: result.url,
          provenance: input.provenance,
          sourceImageHash: input.provenance.sourceImageHash,
          promptFingerprint,
          generationMethod: input.provenance.generationMethod,
          confirmedAt,
          updatedAt: confirmedAt,
        },
      });
      return { imageUrl: result.url, provenance: input.provenance, sourceImageHash: input.provenance.sourceImageHash, reused: false, promptFingerprint, generationMethod: input.provenance.generationMethod, confirmedAt };
    }),
});

export { exactPlanPrompt };

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { designPhotoRenders } from "../../drizzle/schema";
import { getDb } from "../db";
import { generateImage } from "../_core/imageGeneration";
import { emitCrmEvent } from "../_core/crmWebhook";
import { protectedProcedure, router } from "../_core/trpc";

const DATA_IMAGE_PREFIX = /^data:image\/(png|jpeg|webp);base64,/;
const CABINETDEALZ_MATERIAL_ORIGIN = "https://www.cabinetdealz.com";

/**
 * Designer catalog assets are stored as relative `/manus-storage/...` paths,
 * while the protected image service needs an absolute fetchable reference.
 * Only that known CabinetDealz storage namespace is upgraded here; arbitrary
 * relative paths and untrusted hosts remain invalid.
 */
export function normalizePhotoQualityMaterialUrl(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.startsWith("/manus-storage/")) {
    return new URL(trimmed, CABINETDEALZ_MATERIAL_ORIGIN).toString();
  }
  // Earlier preview clients expanded the same trusted relative storage path
  // against a temporary `*.manus.space` deployment URL.  Normalize only that
  // known storage namespace back to the permanent CabinetDealz host; arbitrary
  // paths and hosts continue through the strict validation below.
  try {
    const url = new URL(trimmed);
    if (url.pathname.startsWith("/manus-storage/") && url.hostname.endsWith(".manus.space")) {
      return new URL(url.pathname, CABINETDEALZ_MATERIAL_ORIGIN).toString();
    }
  } catch {
    // Let Zod produce the normal malformed-URL message.
  }
  return trimmed;
}

const safeMaterialUrl = z.preprocess(normalizePhotoQualityMaterialUrl, z.string().url().refine((value) => {
  const host = new URL(value).hostname.toLowerCase();
  return host === "www.cabinetdealz.com" || host.endsWith(".cabinetdealz.com") || host.endsWith("manuscdn.com") || host === "buildpelican.com";
}, "Material references must be CabinetDealz or manufacturer image URLs."));

const vector3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const materialProvenanceSchema = z.object({
  role: z.enum(["cabinet", "countertop", "flooring", "backsplash"]),
  productId: z.number().int().positive().nullable(),
  name: z.string().trim().max(255).nullable(),
  materialImageUrl: safeMaterialUrl.nullable(),
});
export const photoQualityLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(7).max(32).regex(/^[+0-9().\-\s]+$/, "Enter a valid mobile phone number."),
  followUpConsent: z.literal(true),
});
export const photoRenderProvenanceSchema = z.object({
  contractVersion: z.literal("exact-plan-v1"),
  // Design ID 0 is reserved for an administrator-only locked-view test. A
  // customer request must still have a persisted positive saved-design ID.
  designId: z.number().int().nonnegative(),
  designRevision: z.string().trim().max(191).nullable(),
  geometryLock: z.string().min(16).max(400_000),
  camera: z.object({ position: vector3Schema, target: vector3Schema, zoom: z.number().finite().positive() }),
  materials: z.array(materialProvenanceSchema).length(4),
  sourceImageHash: z.string().regex(/^[a-f0-9]{64}$/i, "A SHA-256 source-image hash is required."),
  generationMethod: z.enum([
    "manual-final-review-image-service",
    "manual-final-review-gpt-image-2-high-v2",
  ]),
});
type PhotoRenderProvenanceInput = z.infer<typeof photoRenderProvenanceSchema>;
type PhotoQualityLeadInput = z.infer<typeof photoQualityLeadSchema>;

function photoQualityCrmData(args: {
  sceneSignature: string;
  provenance: PhotoRenderProvenanceInput;
  requestedAt: Date;
  reused: boolean;
}) {
  return {
    source: "photo_quality_render",
    consentToFollowUp: true,
    phoneVerification: "pending_sms_provider_activation",
    sceneSignature: args.sceneSignature,
    designId: args.provenance.designId,
    designRevision: args.provenance.designRevision,
    selectedProducts: args.provenance.materials.map(({ role, productId, name }) => ({ role, productId, name })),
    requestedAt: args.requestedAt.toISOString(),
    reusedPhotoQualityImage: args.reused,
  };
}

function emitPhotoQualityLead(args: {
  userId: number;
  lead: PhotoQualityLeadInput;
  sceneSignature: string;
  provenance: PhotoRenderProvenanceInput;
  originHeader: string | string[] | undefined;
  reused: boolean;
}) {
  const origin = typeof args.originHeader === "string" && /^https?:\/\//.test(args.originHeader)
    ? args.originHeader.replace(/\/$/, "")
    : null;
  void emitCrmEvent({
    event: "lead",
    contact: {
      userId: args.userId,
      name: args.lead.name,
      email: args.lead.email,
      phone: args.lead.phone,
    },
    data: photoQualityCrmData({
      sceneSignature: args.sceneSignature,
      provenance: args.provenance,
      requestedAt: new Date(),
      reused: args.reused,
    }),
    link: origin ? `${origin}/design?load=${args.provenance.designId}` : null,
  });
}

function exactPlanPrompt(summary: string) {
  return [
    "Create a genuinely photorealistic, high-end architectural interior photograph from the FIRST reference image—not a screenshot, wireframe, illustration, or a copy of the reference pixels.",
    "The first image is the exact locked CabinetDealz Designer plan and camera composition. Preserve its visible cabinets, fillers, countertops, appliances, sinks, faucets, windows, doors, walls, islands, ceiling heights, fixtures, room dimensions, and camera framing exactly: do not add, remove, move, rotate, resize, substitute, merge, hide, or invent any of them. Do not change the camera angle, crop, viewpoint, or room dimensions.",
    "Use the following reference images only to improve physically plausible surface appearance for the exact matching selected cabinet finish, countertop, flooring, and backsplash. Use the material references only on their exact matching existing surfaces. Render realistic daylight, physically plausible soft contact shadows, true cabinet grain, countertop depth, metal, glass, tile texture, and surface reflections. Improve realism substantially while keeping geometry and composition locked.",
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
      /** Administrators create render tests without creating customer leads. */
      lead: photoQualityLeadSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Photo rendering is temporarily unavailable.");
      const isAdministratorTest = ctx.user.role === "admin";
      if (!isAdministratorTest && !input.lead) {
        throw new Error("Add your name, email, mobile number, and follow-up consent before requesting a Photo Quality image.");
      }
      if (!isAdministratorTest && input.provenance.designId === 0) {
        throw new Error("Save this design before creating a Photo Quality image so your follow-up lead is tied to its exact plan.");
      }
      const [cached] = await db.select().from(designPhotoRenders)
        .where(and(eq(designPhotoRenders.userId, ctx.user.id), eq(designPhotoRenders.sceneSignature, input.sceneSignature)))
        .limit(1);
      if (cached) {
        if (!isAdministratorTest && input.lead) {
          emitPhotoQualityLead({
            userId: ctx.user.id,
            lead: input.lead,
            sceneSignature: input.sceneSignature,
            provenance: input.provenance,
            originHeader: ctx.req.headers.origin,
            reused: true,
          });
        }
        return {
          imageUrl: cached.imageUrl,
          provenance: cached.provenance,
          sourceImageHash: cached.sourceImageHash,
          promptFingerprint: cached.promptFingerprint,
          generationMethod: cached.generationMethod,
          confirmedAt: cached.confirmedAt,
          reused: true,
        };
      }

      const sceneImage = input.sceneImageDataUrl.replace(DATA_IMAGE_PREFIX, "");
      const lockedReferenceBytesHash = createHash("sha256").update(Buffer.from(sceneImage, "base64")).digest("hex");
      const materialReferences = Array.from(new Set(input.provenance.materials.flatMap((material) => material.materialImageUrl ? [material.materialImageUrl] : [])))
        .map((url) => ({ url, mimeType: url.toLowerCase().endsWith(".png") ? "image/png" : url.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg" }));
      const summary = photoRenderProvenanceSummary(input.provenance);
      const result = await generateImage({
        prompt: exactPlanPrompt(summary),
        model: "MODEL_GPT_IMAGE_2",
        quality: "high",
        originalImages: [{ b64Json: sceneImage, mimeType: input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] === "jpeg" ? "image/jpeg" : input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] === "webp" ? "image/webp" : "image/png" }, ...materialReferences],
      });
      if (!result.url) throw new Error("Photo rendering completed without an image result.");
      if (result.contentHash && result.contentHash === lockedReferenceBytesHash) {
        throw new Error("Photo Quality returned an unchanged Designer screenshot. No image was accepted; please try again after the photo-render service is available.");
      }
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
      if (!isAdministratorTest && input.lead) {
        emitPhotoQualityLead({
          userId: ctx.user.id,
          lead: input.lead,
          sceneSignature: input.sceneSignature,
          provenance: input.provenance,
          originHeader: ctx.req.headers.origin,
          reused: false,
        });
      }
      return { imageUrl: result.url, provenance: input.provenance, sourceImageHash: input.provenance.sourceImageHash, reused: false, promptFingerprint, generationMethod: input.provenance.generationMethod, confirmedAt };
    }),
});

export { exactPlanPrompt };

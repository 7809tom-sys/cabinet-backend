import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { designImageRequests, designPhotoRenders, kitchenDesigns } from "../../drizzle/schema";
import { getDb } from "../db";
import { emitCrmEvent } from "../_core/crmWebhook";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { checkTwilioVerification, hashPhoneE164, isTwilioVerifyConfigured, normalizePhoneE164, sendTwilioVerification } from "../lib/twilioVerify";

const DATA_IMAGE_PREFIX = /^data:image\/(png|jpeg|webp);base64,/;
const CABINETDEALZ_MATERIAL_ORIGIN = "https://www.cabinetdealz.com";

/** Reads JPEG dimensions without accepting a client-declared resolution on trust. */
export function readJpegDimensions(bytes: Buffer) {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("The deterministic render must be a JPEG image.");
  }
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    const isStartOfFrame = marker !== undefined && (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    );
    if (isStartOfFrame) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += segmentLength;
  }
  throw new Error("The deterministic render JPEG did not contain readable dimensions.");
}

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
  role: z.enum(["cabinet", "countertop", "flooring", "backsplash", "faucet", "sink"]),
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
	  planFingerprint: z.string().regex(/^[a-f0-9]{64}$/, "A saved plan fingerprint is required."),
	  geometryLock: z.string().min(16).max(400_000),
  camera: z.object({ position: vector3Schema, target: vector3Schema, zoom: z.number().finite().positive() }),
  materials: z.array(materialProvenanceSchema).length(6).superRefine((materials, ctx) => {
    const expectedRoles = ["cabinet", "countertop", "flooring", "backsplash", "faucet", "sink"] as const;
    for (const role of expectedRoles) {
      if (materials.filter((material) => material.role === role).length !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Exactly one ${role} input is required.` });
      }
    }
  }),
  sourceImageHash: z.string().regex(/^[a-f0-9]{64}$/i, "A SHA-256 source-image hash is required."),
  generationMethod: z.enum([
    "manual-final-review-image-service",
    "manual-final-review-gpt-image-2-high-v2",
    "manual-final-review-deterministic-webgl-v1",
  ]),
});
type PhotoRenderProvenanceInput = z.infer<typeof photoRenderProvenanceSchema>;
type PhotoQualityLeadInput = z.infer<typeof photoQualityLeadSchema>;
type SavedDesignForPhotoRequest = Pick<
  typeof kitchenDesigns.$inferSelect,
  "id" | "userId" | "roomData" | "placedCabinets" | "selectedSurfaces" | "threeDPresentation" | "selectedStyleId" | "selectedDistributorId" | "updatedAt"
>;

const verificationCodeSchema = z.string().trim().regex(/^\d{4,10}$/, "Enter the code from your text message.");
const PHOTO_VERIFICATION_RESEND_MS = 60_000;
const PHOTO_VERIFICATION_EXPIRY_MS = 10 * 60_000;

function savedPhotoPlanRevision(design: SavedDesignForPhotoRequest): string {
  return design.updatedAt.toISOString();
}

/**
 * The canonical plan fingerprint is derived only from the persisted saved
 * design—not from a browser request—so it can identify the exact plan revision
 * associated with a qualified lead without storing duplicate plan JSON.
 */
export function savedPhotoPlanFingerprint(design: SavedDesignForPhotoRequest): string {
  return createHash("sha256").update(JSON.stringify({
    roomData: design.roomData ?? null,
    placedCabinets: design.placedCabinets ?? [],
    selectedSurfaces: design.selectedSurfaces ?? [],
    threeDPresentation: design.threeDPresentation ?? null,
    selectedStyleId: design.selectedStyleId ?? null,
    selectedDistributorId: design.selectedDistributorId ?? null,
  })).digest("hex");
}

function validatePhotoProvenanceAgainstSavedDesign(provenance: PhotoRenderProvenanceInput, design: SavedDesignForPhotoRequest): { revision: string; fingerprint: string } {
  if (provenance.designId !== design.id) {
    throw new Error("This image request is not tied to the saved kitchen plan you own.");
  }
  const revision = savedPhotoPlanRevision(design);
  if (provenance.designRevision !== revision) {
    throw new Error("This kitchen plan changed after the locked preview was prepared. Save the current plan, reopen the preview, and request a new verification code.");
  }
  const fingerprint = savedPhotoPlanFingerprint(design);
  if (provenance.planFingerprint !== fingerprint) {
    throw new Error("The current 3D view no longer matches the saved kitchen plan. Save the plan, reopen the preview, and request a new verification code.");
  }

  const materialByRole = new Map(provenance.materials.map((material) => [material.role, material]));
  const cabinetMaterial = materialByRole.get("cabinet");
  if (cabinetMaterial?.productId !== (design.selectedStyleId ?? null)) {
    throw new Error("The selected door style does not match the saved plan. Save the current plan and reopen the preview.");
  }

  return { revision, fingerprint };
}

async function loadOwnedSavedDesign(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, designId: number): Promise<SavedDesignForPhotoRequest> {
  const [design] = await db.select({
    id: kitchenDesigns.id,
    userId: kitchenDesigns.userId,
    roomData: kitchenDesigns.roomData,
    placedCabinets: kitchenDesigns.placedCabinets,
    selectedSurfaces: kitchenDesigns.selectedSurfaces,
    threeDPresentation: kitchenDesigns.threeDPresentation,
    selectedStyleId: kitchenDesigns.selectedStyleId,
    selectedDistributorId: kitchenDesigns.selectedDistributorId,
    updatedAt: kitchenDesigns.updatedAt,
  }).from(kitchenDesigns).where(and(eq(kitchenDesigns.id, designId), eq(kitchenDesigns.userId, userId))).limit(1);
  if (!design) {
    throw new Error("Save this kitchen plan to your account before requesting an image.");
  }
  return design;
}

/**
 * The persisted provenance must describe the JPEG that was actually received
 * and stored. Browser implementations can serialize a data URL differently
 * across a mobile upload boundary, so this server-derived byte hash is the
 * canonical audit value; it does not alter the locked scene, camera, or plan.
 */
export function canonicalizeDeterministicRenderProvenance(
  provenance: PhotoRenderProvenanceInput,
  renderedBytes: Buffer,
): PhotoRenderProvenanceInput {
  return {
    ...provenance,
    sourceImageHash: createHash("sha256").update(renderedBytes).digest("hex"),
  };
}

function photoQualityCrmData(args: {
  imageRequestId: number;
  planFingerprint: string;
  sceneSignature: string;
  provenance: PhotoRenderProvenanceInput;
  requestedAt: Date;
}) {
  return {
    source: "verified_plan_image_request",
    consentToFollowUp: true,
    phoneVerification: "verified_twilio",
    imageRequestId: args.imageRequestId,
    planFingerprint: args.planFingerprint,
    sceneSignature: args.sceneSignature,
    designId: args.provenance.designId,
    designRevision: args.provenance.designRevision,
    selectedProducts: args.provenance.materials.map(({ role, productId, name }) => ({ role, productId, name })),
    requestedAt: args.requestedAt.toISOString(),
  };
}

function emitPhotoQualityLead(args: {
  userId: number;
  lead: PhotoQualityLeadInput;
  imageRequestId: number;
  planFingerprint: string;
  sceneSignature: string;
  provenance: PhotoRenderProvenanceInput;
  originHeader: string | string[] | undefined;
}) {
  const origin = typeof args.originHeader === "string" && /^https?:\/\//.test(args.originHeader)
    ? args.originHeader.replace(/\/$/, "")
    : null;
  return emitCrmEvent({
    event: "lead",
    contact: {
      userId: args.userId,
      name: args.lead.name,
      email: args.lead.email,
      phone: args.lead.phone,
    },
    data: photoQualityCrmData({
      imageRequestId: args.imageRequestId,
      planFingerprint: args.planFingerprint,
      sceneSignature: args.sceneSignature,
      provenance: args.provenance,
      requestedAt: new Date(),
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
  getVerificationStatus: protectedProcedure
    .input(z.object({ sceneSignature: z.string().min(16).max(191) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [request] = await db.select({
        verificationStatus: designImageRequests.verificationStatus,
        verificationRequestedAt: designImageRequests.verificationRequestedAt,
        verifiedAt: designImageRequests.verifiedAt,
        generationStatus: designImageRequests.generationStatus,
        imageUrl: designImageRequests.imageUrl,
      }).from(designImageRequests).where(and(
        eq(designImageRequests.userId, ctx.user.id),
        eq(designImageRequests.sceneSignature, input.sceneSignature),
      )).limit(1);
      return request ?? null;
    }),

  requestPhoneVerification: protectedProcedure
    .input(z.object({
      sceneSignature: z.string().min(16).max(191),
      provenance: photoRenderProvenanceSchema,
      lead: photoQualityLeadSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Phone verification is temporarily unavailable.");
      if (ctx.user.role === "admin") throw new Error("Administrator render tests do not require a customer phone verification.");

      const design = await loadOwnedSavedDesign(db, ctx.user.id, input.provenance.designId);
      const { revision, fingerprint } = validatePhotoProvenanceAgainstSavedDesign(input.provenance, design);
      const phoneE164 = normalizePhoneE164(input.lead.phone);
      const phoneHash = hashPhoneE164(phoneE164);
      const now = new Date();
      const [existing] = await db.select().from(designImageRequests).where(and(
        eq(designImageRequests.userId, ctx.user.id),
        eq(designImageRequests.sceneSignature, input.sceneSignature),
      )).limit(1);

      if (existing?.verificationStatus === "verified") {
        if (existing.phoneHash !== phoneHash || existing.designRevision !== revision || existing.planFingerprint !== fingerprint) {
          throw new Error("The saved plan or mobile number changed. Reopen the preview to create a new verified request.");
        }
        return { verificationStatus: "verified" as const, canCreateImage: true, resendAfterSeconds: 0 };
      }

      if (existing?.verificationRequestedAt) {
        const elapsed = now.getTime() - existing.verificationRequestedAt.getTime();
        if (elapsed < PHOTO_VERIFICATION_RESEND_MS) {
          throw new Error(`Please wait ${Math.ceil((PHOTO_VERIFICATION_RESEND_MS - elapsed) / 1000)} seconds before requesting another code.`);
        }
      }
      const [recentPhoneRequest] = await db.select({ verificationRequestedAt: designImageRequests.verificationRequestedAt })
        .from(designImageRequests)
        .where(and(eq(designImageRequests.userId, ctx.user.id), eq(designImageRequests.phoneHash, phoneHash)))
        .orderBy(desc(designImageRequests.verificationRequestedAt))
        .limit(1);
      if (recentPhoneRequest?.verificationRequestedAt) {
        const elapsed = now.getTime() - recentPhoneRequest.verificationRequestedAt.getTime();
        if (elapsed < PHOTO_VERIFICATION_RESEND_MS) {
          throw new Error(`Please wait ${Math.ceil((PHOTO_VERIFICATION_RESEND_MS - elapsed) / 1000)} seconds before requesting another code.`);
        }
      }

      const baseRequest = {
        userId: ctx.user.id,
        kitchenDesignId: design.id,
        designRevision: revision,
        planFingerprint: fingerprint,
        sceneSignature: input.sceneSignature,
        provenance: input.provenance,
        name: input.lead.name,
        email: input.lead.email.toLowerCase(),
        phoneE164,
        phoneHash,
        consentAt: now,
        generationStatus: "blocked" as const,
      };

      if (!isTwilioVerifyConfigured()) {
        if (existing) {
          await db.update(designImageRequests).set({
            ...baseRequest,
            verificationStatus: "provider_unavailable",
            verificationSid: null,
            verificationRequestedAt: now,
          }).where(eq(designImageRequests.id, existing.id));
        } else {
          await db.insert(designImageRequests).values({ ...baseRequest, verificationStatus: "provider_unavailable", verificationRequestedAt: now });
        }
        return { verificationStatus: "provider_unavailable" as const, canCreateImage: false, resendAfterSeconds: 0 };
      }

      const verification = await sendTwilioVerification(phoneE164);
      if (existing) {
        await db.update(designImageRequests).set({
          ...baseRequest,
          verificationStatus: "pending",
          verificationSid: verification.sid,
          verificationRequestedAt: now,
          verifiedAt: null,
        }).where(eq(designImageRequests.id, existing.id));
      } else {
        await db.insert(designImageRequests).values({
          ...baseRequest,
          verificationStatus: "pending",
          verificationSid: verification.sid,
          verificationRequestedAt: now,
        });
      }

      return { verificationStatus: "pending" as const, canCreateImage: false, resendAfterSeconds: Math.ceil(PHOTO_VERIFICATION_RESEND_MS / 1000) };
    }),

  confirmPhoneVerification: protectedProcedure
    .input(z.object({ sceneSignature: z.string().min(16).max(191), code: verificationCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Phone verification is temporarily unavailable.");
      const [request] = await db.select().from(designImageRequests).where(and(
        eq(designImageRequests.userId, ctx.user.id),
        eq(designImageRequests.sceneSignature, input.sceneSignature),
      )).limit(1);
      if (!request) throw new Error("Request a verification code for this saved kitchen plan first.");
      if (request.verificationStatus === "verified") return { verificationStatus: "verified" as const, canCreateImage: true };
      if (request.verificationStatus !== "pending" || !request.verificationRequestedAt) {
        throw new Error("Request a new verification code before confirming your phone number.");
      }
      if (Date.now() - request.verificationRequestedAt.getTime() > PHOTO_VERIFICATION_EXPIRY_MS) {
        await db.update(designImageRequests).set({ verificationStatus: "expired" }).where(eq(designImageRequests.id, request.id));
        throw new Error("That verification code expired. Request a new code and try again.");
      }

      const approved = await checkTwilioVerification(request.phoneE164, input.code);
      if (!approved) {
        await db.update(designImageRequests).set({ verificationStatus: "failed" }).where(eq(designImageRequests.id, request.id));
        throw new Error("That verification code was not accepted. Check the code or request a new one.");
      }

      const verifiedAt = new Date();
      await db.update(designImageRequests).set({
        verificationStatus: "verified",
        verifiedAt,
        generationStatus: "ready",
      }).where(eq(designImageRequests.id, request.id));

      if (!request.crmDeliveredAt) {
        const eventId = await emitPhotoQualityLead({
          userId: ctx.user.id,
          lead: { name: request.name, email: request.email, phone: request.phoneE164, followUpConsent: true },
          imageRequestId: request.id,
          planFingerprint: request.planFingerprint,
          sceneSignature: request.sceneSignature,
          provenance: request.provenance,
          originHeader: ctx.req.headers.origin,
        });
        if (eventId != null) {
          await db.update(designImageRequests).set({ crmDeliveredAt: verifiedAt }).where(eq(designImageRequests.id, request.id));
        }
      }

      return { verificationStatus: "verified" as const, canCreateImage: true };
    }),

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
      const isAdministratorTest = ctx.user.role === "admin";
      let verifiedRequest: typeof designImageRequests.$inferSelect | null = null;
      if (!isAdministratorTest) {
        const design = await loadOwnedSavedDesign(db, ctx.user.id, input.provenance.designId);
        const { revision, fingerprint } = validatePhotoProvenanceAgainstSavedDesign(input.provenance, design);
        const [request] = await db.select().from(designImageRequests).where(and(
          eq(designImageRequests.userId, ctx.user.id),
          eq(designImageRequests.sceneSignature, input.sceneSignature),
        )).limit(1);
        if (!request || request.verificationStatus !== "verified" || request.generationStatus === "blocked") {
          throw new Error("Verify your mobile number for this exact saved kitchen plan before creating an image.");
        }
        if (request.kitchenDesignId !== design.id || request.designRevision !== revision || request.planFingerprint !== fingerprint) {
          throw new Error("This saved kitchen plan changed after phone verification. Save the plan, request a new code, and try again.");
        }
        verifiedRequest = request;
      }
      const [cached] = await db.select().from(designPhotoRenders)
        .where(and(eq(designPhotoRenders.userId, ctx.user.id), eq(designPhotoRenders.sceneSignature, input.sceneSignature)))
        .limit(1);
      if (cached) {
        if (verifiedRequest) {
          await db.update(designImageRequests).set({
            generationStatus: "completed",
            designPhotoRenderId: cached.id,
            imageUrl: cached.imageUrl,
          }).where(eq(designImageRequests.id, verifiedRequest.id));
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

      if (input.provenance.generationMethod !== "manual-final-review-deterministic-webgl-v1") {
        throw new Error("This request uses an obsolete image-interpreter profile. Reopen Photo Quality to create an exact deterministic render.");
      }
      const sceneImage = input.sceneImageDataUrl.replace(DATA_IMAGE_PREFIX, "");
      const renderedBytes = Buffer.from(sceneImage, "base64");
      const imageKind = input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] ?? "jpeg";
      if (imageKind !== "jpeg") {
        throw new Error("Photo Quality requires the locked deterministic JPEG capture. Reopen Photo Quality and try again.");
      }
      const dimensions = readJpegDimensions(renderedBytes);
      if (dimensions.width < 1920 || dimensions.height < 1080) {
        throw new Error("Photo Quality requires a minimum 1920×1080 locked render. Reopen Photo Quality and try again.");
      }
      if (verifiedRequest) {
        await db.update(designImageRequests).set({ generationStatus: "generating" }).where(eq(designImageRequests.id, verifiedRequest.id));
      }
      // Persist a canonical hash of the exact decoded JPEG bytes. This keeps
      // the provenance truthful when a browser's client-side digest and the
      // multipart/tRPC transport disagree, without relaxing resolution,
      // JPEG-only, material, geometry, or camera safeguards.
      const canonicalProvenance = canonicalizeDeterministicRenderProvenance(input.provenance, renderedBytes);
      if (canonicalProvenance.sourceImageHash !== input.provenance.sourceImageHash) {
        console.warn("[Photo render] Client JPEG hash differed from decoded deterministic bytes; storing the canonical byte hash.");
      }
      const contentType = "image/jpeg";
      const extension = "jpg";
      const storedRender = await storagePut(
        `photo-quality/${ctx.user.id}/${input.sceneSignature}-deterministic.${extension}`,
        renderedBytes,
        contentType,
      );
      const promptFingerprint = createHash("sha256").update("deterministic-webgl-high-resolution-v1").digest("hex");
      const confirmedAt = new Date();
      await db.insert(designPhotoRenders).values({
        userId: ctx.user.id,
        sceneSignature: input.sceneSignature,
        imageUrl: storedRender.url,
        provenance: canonicalProvenance,
        sourceImageHash: canonicalProvenance.sourceImageHash,
        promptFingerprint,
        generationMethod: input.provenance.generationMethod,
        confirmedAt,
      }).onDuplicateKeyUpdate({
        set: {
          imageUrl: storedRender.url,
          provenance: canonicalProvenance,
          sourceImageHash: canonicalProvenance.sourceImageHash,
          promptFingerprint,
          generationMethod: input.provenance.generationMethod,
          confirmedAt,
          updatedAt: confirmedAt,
        },
      });
      if (verifiedRequest) {
        const [stored] = await db.select({ id: designPhotoRenders.id }).from(designPhotoRenders).where(and(
          eq(designPhotoRenders.userId, ctx.user.id),
          eq(designPhotoRenders.sceneSignature, input.sceneSignature),
        )).limit(1);
        await db.update(designImageRequests).set({
          generationStatus: "completed",
          designPhotoRenderId: stored?.id ?? null,
          imageUrl: storedRender.url,
        }).where(eq(designImageRequests.id, verifiedRequest.id));
      }
      return { imageUrl: storedRender.url, provenance: canonicalProvenance, sourceImageHash: canonicalProvenance.sourceImageHash, reused: false, promptFingerprint, generationMethod: input.provenance.generationMethod, confirmedAt };
    }),
});

export { exactPlanPrompt };

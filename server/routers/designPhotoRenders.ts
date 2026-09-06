import { createHash, randomUUID } from "crypto";
import sharp from "sharp";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { crmActivities, crmDealDesigns, crmDeals, designGeminiImageTestJobs, designImageRequests, designPhotoRenders, doorStyles, kitchenDesigns, notificationSettings } from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { getDb } from "../db";
import { emitCrmEvent } from "../_core/crmWebhook";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { storageGetSignedUrl, storagePut } from "../storage";
import { checkTwilioVerification, hashPhoneE164, isTwilioVerifyConfigured, normalizePhoneE164, sendTwilioVerification } from "../lib/twilioVerify";
import { generateGeminiExactPlanTest, isGeminiImageConfigured, pollGeminiExactPlanTest, startGeminiExactPlanTest, verifyGeminiImageAccess } from "../lib/geminiImageProvider";
import { sendEmail } from "../email";

const DATA_IMAGE_PREFIX = /^data:image\/(png|jpeg|webp);base64,/;
const CABINETDEALZ_MATERIAL_ORIGIN = "https://www.cabinetdealz.com";
const GEMINI_IMAGE_TEST_STALE_MS = 5 * 60 * 1000;
const GEMINI_IMAGE_TEST_RETRY_DELAYS_MS = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000] as const;

function isRetryableGeminiImageTestFailure(message: string) {
  return /rate[ -]?limit|resource[_ -]?exhausted|temporarily unavailable|service unavailable|timed? out|deadline exceeded/i.test(message);
}

async function sendCustomerImageReadyEmail(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  request: typeof designImageRequests.$inferSelect,
) {
  if (request.imageReadyEmailSentAt || request.generationStatus !== "completed" || !request.imageUrl) return;
  const planUrl = `https://www.cabinetdealz.com/design?load=${request.kitchenDesignId}&preview=3d`;
  const result = await sendEmail({
    to: request.email,
    subject: "Your CabinetDealz kitchen image is ready",
    text: `Hello,\n\nYour kitchen image is ready. Open your saved kitchen plan to view it: ${planUrl}\n\nThis image is linked to the verified plan you submitted.`,
    html: `<p>Hello,</p><p><strong>Your kitchen image is ready.</strong></p><p><a href="${planUrl}">Open your saved kitchen plan and view the image</a></p><p>This image is linked to the verified plan you submitted.</p>`,
  });
  if (result.success) {
    await db.update(designImageRequests).set({ imageReadyEmailSentAt: new Date() }).where(eq(designImageRequests.id, request.id));
  }
}

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
    "manual-final-review-gemini-nano-banana-v1",
  ]),
});
type PhotoRenderProvenanceInput = z.infer<typeof photoRenderProvenanceSchema>;
type PhotoQualityLeadInput = z.infer<typeof photoQualityLeadSchema>;
type SavedDesignForPhotoRequest = Pick<
  typeof kitchenDesigns.$inferSelect,
  "id" | "userId" | "name" | "roomData" | "placedCabinets" | "selectedSurfaces" | "threeDPresentation" | "selectedStyleId" | "selectedDistributorId" | "updatedAt"
>;

type ManualAiReference = {
  title: string;
  detail: string;
  imageUrl: string | null;
  role: string;
  productId: number | null;
  pelicanCode: string | null;
};

const MANUAL_HANDOFF_BOARD_WIDTH = 1920;
const MANUAL_HANDOFF_BOARD_MIN_HEIGHT = 1080;
const MANUAL_HANDOFF_MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

function xmlEscape(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] ?? character);
}

function selectedPelicanIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => item && typeof item === "object" ? Number((item as { id?: unknown }).id) : Number.NaN)
    .filter((id) => Number.isInteger(id) && id > 0)));
}

function verifiedManualImageUrl(value: unknown) {
  const normalized = normalizePhotoQualityMaterialUrl(value);
  if (typeof normalized !== "string") return null;
  try {
    const url = new URL(normalized);
    return (url.hostname === "www.cabinetdealz.com" || url.hostname.endsWith(".cabinetdealz.com"))
      && url.pathname.startsWith("/manus-storage/")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function signedReferenceUrl(value: string | null | undefined) {
  if (!value) return null;
  const normalized = normalizePhotoQualityMaterialUrl(value);
  if (typeof normalized !== "string") return null;
  try {
    const url = new URL(normalized);
    if ((url.hostname === "www.cabinetdealz.com" || url.hostname.endsWith(".cabinetdealz.com")) && url.pathname.startsWith("/manus-storage/")) {
      return storageGetSignedUrl(url.pathname.replace(/^\/manus-storage\//, ""));
    }
    if (url.hostname.endsWith("manuscdn.com") || url.hostname === "buildpelican.com") return url.toString();
  } catch {
    return null;
  }
  return null;
}

async function fetchReferenceImage(url: string | null, width: number, height: number) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || (Number.isFinite(contentLength) && contentLength > MANUAL_HANDOFF_MAX_REFERENCE_BYTES)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MANUAL_HANDOFF_MAX_REFERENCE_BYTES) return null;
    return sharp(bytes, { failOn: "none" }).rotate().resize(width, height, { fit: "contain", background: "#ffffff" }).jpeg({ quality: 86 }).toBuffer();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function labelSvg(x: number, y: number, width: number, title: string, detail: string, accent = "#c79b4a") {
  const shortTitle = title.length > 38 ? `${title.slice(0, 35)}…` : title;
  const shortDetail = detail.length > 54 ? `${detail.slice(0, 51)}…` : detail;
  return Buffer.from(`<svg width="${width}" height="58" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="58" fill="#10243d"/>
    <rect width="5" height="58" fill="${accent}"/>
    <text x="16" y="23" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${xmlEscape(shortTitle)}</text>
    <text x="16" y="44" font-family="Arial, sans-serif" font-size="12" fill="#d6e0eb">${xmlEscape(shortDetail)}</text>
  </svg>`);
}

function headingSvg() {
  return Buffer.from(`<svg width="${MANUAL_HANDOFF_BOARD_WIDTH}" height="76" xmlns="http://www.w3.org/2000/svg">
    <rect width="${MANUAL_HANDOFF_BOARD_WIDTH}" height="76" fill="#0b1c31"/>
    <text x="42" y="32" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#ffffff">LOCKED CABINETDEALZ KITCHEN PLAN — MANUAL AI REFERENCE</text>
    <text x="42" y="58" font-family="Arial, sans-serif" font-size="15" fill="#e5bc6e">Keep the large plan image, geometry, camera, and every selected product exactly as shown.</text>
  </svg>`);
}

export async function composeManualHandoffBoard(sourceImage: Buffer, references: ManualAiReference[]) {
  const mainX = 36;
  const mainY = 102;
  const mainWidth = 1122;
  const cardWidth = 334;
  const cardHeight = 274;
  const cardX = 1200;
  const cardY = 102;
  const rows = Math.max(3, Math.ceil(Math.max(references.length, 1) / 2));
  const boardHeight = Math.max(MANUAL_HANDOFF_BOARD_MIN_HEIGHT, cardY + rows * (cardHeight + 24) + 18);
  const mainHeight = boardHeight - mainY - 76;
  const plan = await sharp(sourceImage, { failOn: "none" }).rotate().resize(mainWidth, mainHeight, { fit: "contain", background: "#f7f4ef" }).jpeg({ quality: 90 }).toBuffer();
  const composites: Array<{ input: Buffer; left: number; top: number }> = [
    { input: headingSvg(), left: 0, top: 0 },
    { input: plan, left: mainX, top: mainY },
    { input: labelSvg(mainX, mainY + mainHeight, mainWidth, "1. Exact locked kitchen plan", "This is the required layout and camera. Do not move, add, remove, or substitute anything."), left: mainX, top: mainY + mainHeight },
  ];
  const cards = references;
  for (let index = 0; index < cards.length; index += 1) {
    const reference = cards[index]!;
    const column = index % 2;
    const row = Math.floor(index / 2);
    const left = cardX + column * (cardWidth + 18);
    const top = cardY + row * (cardHeight + 24);
    const image = await fetchReferenceImage(reference.imageUrl, cardWidth, cardHeight - 58);
    if (image) composites.push({ input: image, left, top });
    else {
      composites.push({
        input: Buffer.from(`<svg width="${cardWidth}" height="${cardHeight - 58}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f0ebe2"/><text x="${cardWidth / 2}" y="${(cardHeight - 58) / 2}" text-anchor="middle" font-family="Arial" font-size="14" fill="#5b6775">Reference image unavailable</text></svg>`),
        left,
        top,
      });
    }
    composites.push({ input: labelSvg(left, top + cardHeight - 58, cardWidth, `${index + 2}. ${reference.title}`, reference.detail, "#c79b4a"), left, top: top + cardHeight - 58 });
  }
  for (let index = cards.length; index < Math.max(6, cards.length); index += 1) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const left = cardX + column * (cardWidth + 18);
    const top = cardY + row * (cardHeight + 24);
    composites.push({
      input: Buffer.from(`<svg width="${cardWidth}" height="${cardHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#e9edf1"/><text x="${cardWidth / 2}" y="${cardHeight / 2}" text-anchor="middle" font-family="Arial" font-size="14" fill="#667789">No additional selected product</text></svg>`),
      left,
      top,
    });
  }
  return sharp({
    create: { width: MANUAL_HANDOFF_BOARD_WIDTH, height: boardHeight, channels: 3, background: "#f7f4ef" },
  }).composite(composites).jpeg({ quality: 91, chromaSubsampling: "4:4:4" }).toBuffer();
}

async function manualAiReferences(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  design: SavedDesignForPhotoRequest,
  provenance: PhotoRenderProvenanceInput,
) {
  const selectedIds = selectedPelicanIds(design.selectedSurfaces).slice(0, 40);
  const [styleRows, productRows] = await Promise.all([
    design.selectedStyleId
      ? db.select({ id: doorStyles.id, name: doorStyles.aliasName, ourName: doorStyles.ourName, styleCode: doorStyles.styleCode, doorStyle: doorStyles.doorStyle, woodSpecies: doorStyles.woodSpecies, finish: doorStyles.finish, doorSampleImageUrl: doorStyles.doorSampleImageUrl, cornerSwatchImageUrl: doorStyles.cornerSwatchImageUrl, thumbnailImageUrl: doorStyles.thumbnailImageUrl }).from(doorStyles).where(eq(doorStyles.id, design.selectedStyleId)).limit(1)
      : Promise.resolve([]),
    selectedIds.length
      ? db.select({ id: pelicanProducts.id, pelicanCode: pelicanProducts.pelicanCode, name: pelicanProducts.name, category: pelicanProducts.category, subCategory: pelicanProducts.subCategory, size: pelicanProducts.size, description: pelicanProducts.description, imageUrl: pelicanProducts.imageUrl, materialImageUrl: pelicanProducts.materialImageUrl }).from(pelicanProducts).where(inArray(pelicanProducts.id, selectedIds))
      : Promise.resolve([]),
  ]);
  const references: ManualAiReference[] = [];
  const style = styleRows[0];
  const cabinetProvenance = provenance.materials.find((entry) => entry.role === "cabinet");
  if (style || cabinetProvenance?.materialImageUrl) {
    references.push({
      title: style?.name || style?.ourName || cabinetProvenance?.name || "Cabinet door finish",
      detail: [style?.styleCode, style?.doorStyle, style?.woodSpecies, style?.finish].filter(Boolean).join(" · ") || "Selected cabinet finish",
      imageUrl: await signedReferenceUrl(style?.doorSampleImageUrl ?? style?.cornerSwatchImageUrl ?? style?.thumbnailImageUrl ?? cabinetProvenance?.materialImageUrl),
      role: "cabinet",
      productId: style?.id ?? cabinetProvenance?.productId ?? null,
      pelicanCode: null,
    });
  }
  for (const product of productRows) {
    const materialFirst = /floor|tile|mosaic|backsplash|countertop|quartz|slab/i.test(`${product.category} ${product.subCategory ?? ""}`);
    references.push({
      title: product.name,
      detail: [product.pelicanCode, product.category, product.subCategory, product.size, product.description].filter(Boolean).join(" · "),
      imageUrl: await signedReferenceUrl((materialFirst ? product.materialImageUrl : null) ?? product.imageUrl ?? product.materialImageUrl),
      role: product.category,
      productId: product.id,
      pelicanCode: product.pelicanCode,
    });
  }
  const byRole = new Set(references.map((reference) => reference.role));
  for (const material of provenance.materials) {
    if (!byRole.has(material.role) && material.materialImageUrl) {
      references.push({
        title: material.name ?? `${material.role} selection`,
        detail: `Selected ${material.role}`,
        imageUrl: await signedReferenceUrl(material.materialImageUrl),
        role: material.role,
        productId: material.productId,
        pelicanCode: null,
      });
    }
  }
  return references;
}

function manualAiPrompt(provenance: PhotoRenderProvenanceInput, references: ManualAiReference[]) {
  const selectedReferences = references.map((reference, index) => `${index + 2}. ${reference.title}${reference.detail ? ` — ${reference.detail}` : ""}`).join("\n");
  return [
    "Use image 1 as the locked CabinetDealz kitchen plan and camera composition. Do not alter its layout, cabinets, fillers, countertop runs, appliances, fixtures, walls, doors, windows, island, dimensions, or viewpoint.",
    "The remaining numbered cards are the exact selected CabinetDealz and Pelican product references. Apply each reference only to its matching existing surface or fixture. Do not introduce any product not shown on this board.",
    "Create a photorealistic architectural interior image with realistic lighting and physically plausible material texture. Return one kitchen image only, without labels, UI, people, text, logos, watermarks, measurements, or extra products.",
    `Saved-plan summary: ${photoRenderProvenanceSummary(provenance)}`,
    selectedReferences ? `Reference cards:\n${selectedReferences}` : "",
  ].filter(Boolean).join("\n\n");
}

function internalManualHandoffRecipients(value: string | null | undefined) {
  return Array.from(new Set((value ?? "").split(",").map((email) => email.trim().toLowerCase()).filter((email) => z.string().email().safeParse(email).success)));
}

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
    name: kitchenDesigns.name,
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
 * Creates one house-scoped CRM review item for a verified manual image request.
 * Its contact and saved-plan values are read only from the already verified
 * request. A request keeps its own deal ID, making this operation idempotent.
 */
async function ensureManualAiReviewCrmDeal(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  request: typeof designImageRequests.$inferSelect,
  design: SavedDesignForPhotoRequest,
) {
  if (request.crmDealId) return request.crmDealId;
  const result = await db.insert(crmDeals).values({
    affiliateId: null,
    ownerUserId: null,
    title: `Image review — ${request.name}`.slice(0, 256),
    stage: "image_review",
    priority: "high",
    contactName: request.name,
    contactEmail: request.email,
    contactPhone: request.phoneE164,
    source: "verified_plan_image_request",
    notes: `Verified photo-quality image request. Saved plan #${design.id}: ${design.name}. The plan geometry and selected products are locked for manual AI review.`,
  });
  const dealId = (result as unknown as [{ insertId: number }])[0].insertId;
  await db.insert(crmDealDesigns).values({
    dealId,
    designId: design.id,
    designName: design.name,
    linkedByUserId: request.userId,
  });
  await db.insert(crmActivities).values({
    dealId,
    authorUserId: null,
    kind: "task",
    body: "Verified kitchen image request received. Prepare the locked reference board and upload the finished result from Operations → Manual AI Renders.",
  });
  await db.update(designImageRequests).set({ crmDealId: dealId }).where(eq(designImageRequests.id, request.id));
  return dealId;
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
  return `Saved design #${provenance.designId}${provenance.designRevision ? ` revision ${provenance.designRevision}` : ""}. Cabinet finish: ${material("cabinet")}. Countertop: ${material("countertop")}. Flooring: ${material("flooring")}. Backsplash: ${material("backsplash")}. Faucet: ${material("faucet")}. Sink: ${material("sink")}.`;
}

const activeGeminiImageTestJobs = new Set<number>();

/**
 * Runs after the browser receives a queued-job acknowledgment. The durable
 * source reference is kept in storage, so a queued job can be resumed by a
 * later status request after an in-process restart.
 */
async function runQueuedGeminiImageTestJob(jobId: number) {
  if (activeGeminiImageTestJobs.has(jobId)) return;
  activeGeminiImageTestJobs.add(jobId);
  let durableJob: typeof designGeminiImageTestJobs.$inferSelect | null = null;
  try {
    const db = await getDb();
    if (!db) throw new Error("Google image testing is temporarily unavailable.");
    const [job] = await db.select().from(designGeminiImageTestJobs)
      .where(eq(designGeminiImageTestJobs.id, jobId)).limit(1);
    if (!job || job.status !== "queued" || !job.sourceImageKey) return;
    durableJob = job;
    if (job.nextRetryAt && job.nextRetryAt.getTime() > Date.now()) return;
    const sourceResponse = await fetch(await storageGetSignedUrl(job.sourceImageKey));
    if (!sourceResponse.ok) throw new Error("The locked Google test reference could not be read. Start a fresh test.");
    const sourceBytes = Buffer.from(await sourceResponse.arrayBuffer());
    const dimensions = readJpegDimensions(sourceBytes);
    if (dimensions.width < 1920 || dimensions.height < 1080) throw new Error("The stored Google test reference is below the required 1920×1080 size. Start a fresh test.");
    const prompt = exactPlanPrompt(photoRenderProvenanceSummary(job.provenance as PhotoRenderProvenanceInput));
    const image = await generateGeminiExactPlanTest({
      prompt,
      sourceImageBase64: sourceBytes.toString("base64"),
      sourceMimeType: "image/jpeg",
    });
    await persistGeminiImageTestResult(db, job, image);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google image test could not be started. Please try again.";
    const db = await getDb();
    const retryDelayMs = durableJob && isRetryableGeminiImageTestFailure(message)
      ? GEMINI_IMAGE_TEST_RETRY_DELAYS_MS[durableJob.retryCount]
      : undefined;
    if (db && durableJob && retryDelayMs != null) {
      const retryCount = durableJob.retryCount + 1;
      const nextRetryAt = new Date(Date.now() + retryDelayMs);
      await db.update(designGeminiImageTestJobs).set({
        status: "queued",
        retryCount,
        nextRetryAt,
        errorMessage: `Google is temporarily unavailable. Retrying automatically in ${Math.ceil(retryDelayMs / 60_000)} minute${retryDelayMs >= 2 * 60_000 ? "s" : ""}.`,
        completedAt: null,
      }).where(eq(designGeminiImageTestJobs.id, jobId));
    } else if (db) {
      await db.update(designGeminiImageTestJobs).set({ status: "failed", errorMessage: message, completedAt: new Date(), nextRetryAt: null })
        .where(eq(designGeminiImageTestJobs.id, jobId));
    }
  } finally {
    activeGeminiImageTestJobs.delete(jobId);
  }
}

function queueGeminiImageTestJob(jobId: number) {
  void runQueuedGeminiImageTestJob(jobId);
}

type GeminiImagePollResult =
  | { status: "pending"; nextRetryAt?: Date | null }
  | { status: "completed"; imageUrl: string }
  | { status: "failed"; message: string };

async function deferOrFailGeminiImageTestJob(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  job: typeof designGeminiImageTestJobs.$inferSelect,
  message: string,
): Promise<GeminiImagePollResult> {
  const retryDelayMs = isRetryableGeminiImageTestFailure(message)
    ? GEMINI_IMAGE_TEST_RETRY_DELAYS_MS[job.retryCount]
    : undefined;
  if (retryDelayMs != null) {
    const nextRetryAt = new Date(Date.now() + retryDelayMs);
    await db.update(designGeminiImageTestJobs).set({
      status: "queued",
      retryCount: job.retryCount + 1,
      nextRetryAt,
      errorMessage: `Google is temporarily unavailable. Retrying automatically in ${Math.ceil(retryDelayMs / 60_000)} minute${retryDelayMs >= 2 * 60_000 ? "s" : ""}.`,
      completedAt: null,
    }).where(eq(designGeminiImageTestJobs.id, job.id));
    return { status: "pending", nextRetryAt };
  }

  await db.update(designGeminiImageTestJobs).set({
    status: "failed",
    errorMessage: message,
    completedAt: new Date(),
    nextRetryAt: null,
  }).where(eq(designGeminiImageTestJobs.id, job.id));
  return { status: "failed", message };
}

async function persistGeminiImageTestResult(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  job: typeof designGeminiImageTestJobs.$inferSelect,
  image: { bytes: Buffer; mimeType: "image/jpeg" | "image/png" },
): Promise<{ status: "completed"; imageUrl: string }> {
  const extension = image.mimeType === "image/png" ? "png" : "jpg";
  const stored = await storagePut(`admin-google-image-tests/${job.userId}/${job.sceneSignature}-${Date.now()}.${extension}`, image.bytes, image.mimeType);
  const design = job.kitchenDesignId > 0 ? await loadOwnedSavedDesign(db, job.userId, job.kitchenDesignId) : null;
  const confirmedAt = new Date();
  await db.insert(designPhotoRenders).values({
    userId: job.userId,
    kitchenDesignId: design?.id ?? null,
    sceneSignature: job.sceneSignature,
    imageUrl: stored.url,
    provenance: job.provenance,
    sourceImageHash: (job.provenance as PhotoRenderProvenanceInput).sourceImageHash,
    promptFingerprint: job.promptFingerprint,
    generationMethod: "manual-final-review-gemini-nano-banana-v1",
    confirmedAt,
  }).onDuplicateKeyUpdate({ set: { kitchenDesignId: design?.id ?? null, imageUrl: stored.url, provenance: job.provenance, sourceImageHash: (job.provenance as PhotoRenderProvenanceInput).sourceImageHash, promptFingerprint: job.promptFingerprint, generationMethod: "manual-final-review-gemini-nano-banana-v1", confirmedAt, updatedAt: confirmedAt } });
  await db.update(designGeminiImageTestJobs).set({ status: "completed", imageUrl: stored.url, errorMessage: null, completedAt: confirmedAt, nextRetryAt: null })
    .where(eq(designGeminiImageTestJobs.id, job.id));
  return { status: "completed", imageUrl: stored.url };
}

async function pollPendingGeminiImageTestJob(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  job: typeof designGeminiImageTestJobs.$inferSelect,
): Promise<GeminiImagePollResult> {
  const design = job.kitchenDesignId > 0 ? await loadOwnedSavedDesign(db, job.userId, job.kitchenDesignId) : null;
  if (design && (job.designRevision !== savedPhotoPlanRevision(design) || job.planFingerprint !== savedPhotoPlanFingerprint(design))) {
    const message = "This kitchen plan changed while Google was generating the test. Reopen Final preview and start a new test.";
    await db.update(designGeminiImageTestJobs).set({ status: "failed", errorMessage: message, completedAt: new Date(), nextRetryAt: null })
      .where(eq(designGeminiImageTestJobs.id, job.id));
    return { status: "failed", message };
  }

  let provider;
  try {
    provider = await pollGeminiExactPlanTest(job.interactionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google image test could not be checked. Please try again.";
    return deferOrFailGeminiImageTestJob(db, job, message);
  }
  if (provider.status === "pending") return provider;
  if (provider.status === "failed") return deferOrFailGeminiImageTestJob(db, job, provider.message);

  return persistGeminiImageTestResult(db, job, provider.image);
}

/**
 * Invoked by the authenticated scheduled callback. It recovers queued jobs
 * after a server restart and polls in-progress provider interactions so the
 * browser does not need to remain open for a result to be stored.
 */
export async function recoverDueGeminiImageTestJobs() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while recovering Google image tests.");
  const now = new Date();
  const jobs = await db.select().from(designGeminiImageTestJobs).where(or(
    and(
      eq(designGeminiImageTestJobs.status, "queued"),
      or(isNull(designGeminiImageTestJobs.nextRetryAt), lte(designGeminiImageTestJobs.nextRetryAt, now)),
    ),
    eq(designGeminiImageTestJobs.status, "pending"),
  )).orderBy(desc(designGeminiImageTestJobs.updatedAt)).limit(25);

  let queuedStarted = 0;
  let pendingChecked = 0;
  for (const job of jobs) {
    if (job.status === "queued") {
      if (!activeGeminiImageTestJobs.has(job.id)) {
        queuedStarted += 1;
        await runQueuedGeminiImageTestJob(job.id);
      }
      continue;
    }
    if (!activeGeminiImageTestJobs.has(job.id)) {
      activeGeminiImageTestJobs.add(job.id);
      try {
        await pollPendingGeminiImageTestJob(db, job);
        pendingChecked += 1;
      } finally {
        activeGeminiImageTestJobs.delete(job.id);
      }
    }
  }
  return { queuedStarted, pendingChecked, examined: jobs.length };
}

export const designPhotoRendersRouter = router({
  getGeminiProviderStatus: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      if (!isGeminiImageConfigured()) {
        return { configured: false, connected: false, modelAvailable: false, provider: "Gemini Nano Banana 2" };
      }
      const status = await verifyGeminiImageAccess();
      return { configured: true, ...status, provider: "Gemini Nano Banana 2" };
    }),

  testGeminiProvider: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      if (!isGeminiImageConfigured()) {
        return { configured: false, connected: false, modelAvailable: false, message: "Gemini is not configured." };
      }
      const status = await verifyGeminiImageAccess();
      return {
        configured: true,
        ...status,
        message: status.connected && status.modelAvailable
          ? "Gemini Nano Banana image access is connected."
          : "Gemini is configured but image-model access could not be confirmed.",
      };
    }),

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

  getLatestCustomerReadyImage: protectedProcedure
    .input(z.object({ designId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") return null;
      const db = await getDb();
      if (!db) return null;
      const [request] = await db.select({
        id: designImageRequests.id,
        kitchenDesignId: designImageRequests.kitchenDesignId,
        imageUrl: designImageRequests.imageUrl,
        completedAt: designImageRequests.updatedAt,
      }).from(designImageRequests).where(and(
        eq(designImageRequests.userId, ctx.user.id),
        eq(designImageRequests.kitchenDesignId, input.designId),
        eq(designImageRequests.verificationStatus, "verified"),
        eq(designImageRequests.generationStatus, "completed"),
      )).orderBy(desc(designImageRequests.updatedAt)).limit(1);
      return request?.imageUrl ? request : null;
    }),

  prepareManualAiHandoff: protectedProcedure
    .input(z.object({
      sceneSignature: z.string().min(16).max(191),
      sceneImageDataUrl: z.string().min(128).max(8_500_000).regex(DATA_IMAGE_PREFIX, "A locked JPEG Designer image is required."),
      provenance: photoRenderProvenanceSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator Google tests remain separate from customer manual render requests." });
      const db = await getDb();
      if (!db) throw new Error("Manual image review is temporarily unavailable.");
      const design = await loadOwnedSavedDesign(db, ctx.user.id, input.provenance.designId);
      const { revision, fingerprint } = validatePhotoProvenanceAgainstSavedDesign(input.provenance, design);
      const [request] = await db.select().from(designImageRequests).where(and(
        eq(designImageRequests.userId, ctx.user.id),
        eq(designImageRequests.sceneSignature, input.sceneSignature),
      )).limit(1);
      if (!request || request.verificationStatus !== "verified") {
        throw new Error("Verify your mobile number for this exact saved kitchen plan before requesting manual image review.");
      }
      if (request.kitchenDesignId !== design.id || request.designRevision !== revision || request.planFingerprint !== fingerprint) {
        throw new Error("This saved kitchen plan changed after phone verification. Save the plan, request a new code, and try again.");
      }
      if (request.generationStatus === "completed" && request.imageUrl) {
        return { status: "completed" as const, customerMessage: "Your kitchen image is already ready on this saved plan." };
      }
      if (request.manualHandoffPreparedAt && request.manualHandoffBoardUrl && request.manualHandoffPrompt) {
        const crmDealId = await ensureManualAiReviewCrmDeal(db, request, design);
        return { status: "prepared" as const, crmDealId, customerMessage: "Your exact kitchen plan and selected product references are already with the rendering team." };
      }
      const imageKind = input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] ?? "jpeg";
      if (imageKind !== "jpeg") throw new Error("Manual image review requires the locked deterministic JPEG capture. Reopen Photo Quality and try again.");
      const sourceBytes = Buffer.from(input.sceneImageDataUrl.replace(DATA_IMAGE_PREFIX, ""), "base64");
      const dimensions = readJpegDimensions(sourceBytes);
      if (dimensions.width < 1920 || dimensions.height < 1080) {
        throw new Error("Manual image review requires a minimum 1920×1080 locked render. Reopen Photo Quality and try again.");
      }
      const canonicalProvenance = canonicalizeDeterministicRenderProvenance(input.provenance, sourceBytes);
      const references = await manualAiReferences(db, design, canonicalProvenance);
      const prompt = manualAiPrompt(canonicalProvenance, references);
      const boardBytes = await composeManualHandoffBoard(sourceBytes, references);
      const storedBoard = await storagePut(
        `manual-ai-handoffs/${ctx.user.id}/request-${request.id}-${Date.now()}.jpg`,
        boardBytes,
        "image/jpeg",
      );
      const preparedAt = new Date();
      const planUrl = `https://www.cabinetdealz.com/design?load=${design.id}&preview=3d`;
      const crmDealId = await ensureManualAiReviewCrmDeal(db, request, design);
      const crmEventId = await emitCrmEvent({
        event: "lead",
        contact: { userId: ctx.user.id, name: request.name, email: request.email, phone: request.phoneE164 },
        link: planUrl,
        data: {
          ...photoQualityCrmData({
            imageRequestId: request.id,
            planFingerprint: request.planFingerprint,
            sceneSignature: request.sceneSignature,
            provenance: canonicalProvenance,
            requestedAt: preparedAt,
          }),
          workflow: "manual_ai_render_review",
          crmDealId,
          crmReviewUrl: `https://www.cabinetdealz.com/admin?tab=crm&deal=${crmDealId}`,
          manualHandoffBoardUrl: storedBoard.url,
          manualPrompt: prompt,
          selectedPelicanReferences: references.map(({ title, detail, role, productId, pelicanCode, imageUrl }) => ({ title, detail, role, productId, pelicanCode, imageUrl })),
          instruction: "Use the attached locked-plan reference board as one image in the chosen AI image generator, then upload the finished image to CabinetDealz Operations → Manual AI Renders.",
        },
      });
      await db.update(designImageRequests).set({
        generationStatus: "generating",
        manualHandoffBoardUrl: storedBoard.url,
        manualHandoffPrompt: prompt,
        manualHandoffPreparedAt: preparedAt,
        manualHandoffCrmEventId: crmEventId,
        crmDealId,
      }).where(eq(designImageRequests.id, request.id));

      const [notifications] = await db.select().from(notificationSettings).limit(1);
      const recipients = notifications?.enabled ? internalManualHandoffRecipients(notifications.onNewDesignLead) : [];
      if (recipients.length > 0 && !request.manualHandoffEmailSentAt) {
        const delivery = await sendEmail({
          to: recipients[0]!,
          cc: recipients.slice(1),
          subject: `Manual AI kitchen render ready — saved plan #${design.id}`,
          text: `A verified CabinetDealz customer requested a manual AI kitchen render.\n\nSaved plan: ${planUrl}\nReference board: ${storedBoard.url}\n\nUse the attached JPEG as one reference image. Then upload the finished image in Administration → Operations → Manual AI Renders.\n\nAI instruction:\n${prompt}`,
          html: `<p><strong>A verified CabinetDealz customer requested a manual AI kitchen render.</strong></p><p><a href="${planUrl}">Open the exact saved kitchen plan</a></p><p>The attached reference board contains the locked plan plus the selected CabinetDealz and Pelican product references. Use it as one reference image in the AI generator, then upload the finished image through <strong>Administration → Operations → Manual AI Renders</strong>.</p><p><strong>AI instruction</strong></p><pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${xmlEscape(prompt)}</pre>`,
          attachments: [
            { filename: `cabinetdealz-plan-${design.id}-ai-reference.jpg`, content: boardBytes, contentType: "image/jpeg" },
            { filename: `cabinetdealz-plan-${design.id}-ai-instructions.txt`, content: prompt, contentType: "text/plain" },
          ],
        });
        if (delivery.success) {
          await db.update(designImageRequests).set({ manualHandoffEmailSentAt: new Date() }).where(eq(designImageRequests.id, request.id));
        }
      }
      return {
        status: "prepared" as const,
        crmDealId,
        customerMessage: "Your kitchen plan, selected Pelican references, and rendering instructions were sent to the review team. We will email you when the finished image is attached to this saved plan.",
      };
    }),

  listManualAiHandoffs: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      const db = await getDb();
      if (!db) return { handoffs: [], emailDeliveryConfigured: false };
      const requestsQuery = db.select({
        id: designImageRequests.id,
        kitchenDesignId: designImageRequests.kitchenDesignId,
        name: designImageRequests.name,
        generationStatus: designImageRequests.generationStatus,
        manualHandoffBoardUrl: designImageRequests.manualHandoffBoardUrl,
        manualHandoffPrompt: designImageRequests.manualHandoffPrompt,
        manualHandoffPreparedAt: designImageRequests.manualHandoffPreparedAt,
        manualHandoffEmailSentAt: designImageRequests.manualHandoffEmailSentAt,
        manualResultAttachedAt: designImageRequests.manualResultAttachedAt,
        imageUrl: designImageRequests.imageUrl,
        crmDealId: designImageRequests.crmDealId,
      }).from(designImageRequests).where(and(
        eq(designImageRequests.verificationStatus, "verified"),
        isNull(designImageRequests.manualResultAttachedAt),
      )).orderBy(desc(designImageRequests.manualHandoffPreparedAt)).limit(100);
      const [requests, notificationRows] = await Promise.all([
        requestsQuery,
        db.select({ enabled: notificationSettings.enabled, onNewDesignLead: notificationSettings.onNewDesignLead }).from(notificationSettings).limit(1),
      ]);
      const notifications = notificationRows[0];
      return {
        handoffs: requests.filter((request) => Boolean(request.manualHandoffPreparedAt && request.manualHandoffBoardUrl && request.manualHandoffPrompt)),
        emailDeliveryConfigured: Boolean(notifications?.enabled && internalManualHandoffRecipients(notifications.onNewDesignLead).length > 0),
      };
    }),

  attachManualAiResult: protectedProcedure
    .input(z.object({
      requestId: z.number().int().positive(),
      imageUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      const db = await getDb();
      if (!db) throw new Error("Manual image review is temporarily unavailable.");
      const [request] = await db.select().from(designImageRequests).where(eq(designImageRequests.id, input.requestId)).limit(1);
      if (!request || request.verificationStatus !== "verified" || !request.manualHandoffPreparedAt) {
        throw new Error("This is not an active verified manual image request.");
      }
      if (request.manualResultAttachedAt || request.generationStatus === "completed") {
        throw new Error("A completed image is already attached to this saved plan.");
      }
      const storedImageUrl = verifiedManualImageUrl(input.imageUrl);
      if (!storedImageUrl) throw new Error("Upload the finished image to the CabinetDealz Media Library before attaching it to a customer plan.");
      const design = await loadOwnedSavedDesign(db, request.userId, request.kitchenDesignId);
      if (savedPhotoPlanRevision(design) !== request.designRevision || savedPhotoPlanFingerprint(design) !== request.planFingerprint) {
        throw new Error("This saved kitchen plan changed after the manual handoff. Do not attach the result; prepare a new verified request from the current plan.");
      }
      const completedAt = new Date();
      const promptFingerprint = createHash("sha256").update(request.manualHandoffPrompt ?? "manual-ai-render-handoff").digest("hex");
      await db.insert(designPhotoRenders).values({
        userId: request.userId,
        kitchenDesignId: design.id,
        sceneSignature: request.sceneSignature,
        imageUrl: storedImageUrl,
        provenance: request.provenance,
        sourceImageHash: (request.provenance as PhotoRenderProvenanceInput).sourceImageHash,
        promptFingerprint,
        generationMethod: "manual-final-review-human-ai-v1",
        confirmedAt: completedAt,
      }).onDuplicateKeyUpdate({ set: {
        kitchenDesignId: design.id,
        imageUrl: storedImageUrl,
        provenance: request.provenance,
        sourceImageHash: (request.provenance as PhotoRenderProvenanceInput).sourceImageHash,
        promptFingerprint,
        generationMethod: "manual-final-review-human-ai-v1",
        confirmedAt: completedAt,
        updatedAt: completedAt,
      } });
      const [stored] = await db.select({ id: designPhotoRenders.id }).from(designPhotoRenders).where(and(
        eq(designPhotoRenders.userId, request.userId),
        eq(designPhotoRenders.sceneSignature, request.sceneSignature),
      )).limit(1);
      const completedRequest = {
        ...request,
        generationStatus: "completed" as const,
        designPhotoRenderId: stored?.id ?? null,
        imageUrl: storedImageUrl,
      };
      await db.update(designImageRequests).set({
        generationStatus: "completed",
        designPhotoRenderId: stored?.id ?? null,
        imageUrl: storedImageUrl,
        manualResultAttachedAt: completedAt,
        manualResultAttachedBy: ctx.user.id,
      }).where(eq(designImageRequests.id, request.id));
      if (request.crmDealId) {
        await db.insert(crmActivities).values({
          dealId: request.crmDealId,
          authorUserId: ctx.user.id,
          kind: "task",
          body: "Finished manual AI kitchen image attached to the unchanged saved plan. The customer-ready notice and email were triggered.",
        });
        await db.update(crmDeals).set({ updatedAt: completedAt }).where(eq(crmDeals.id, request.crmDealId));
      }
      void sendCustomerImageReadyEmail(db, completedRequest)
        .catch(() => console.warn("[Manual AI render] Customer image-ready email delivery could not be completed."));
      return { status: "completed" as const, imageUrl: storedImageUrl };
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

  getSavedGeminiImageTest: protectedProcedure
    .input(z.object({ designId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      const db = await getDb();
      if (!db) return null;
      const design = await loadOwnedSavedDesign(db, ctx.user.id, input.designId);
      const [saved] = await db.select().from(designPhotoRenders).where(and(
        eq(designPhotoRenders.userId, ctx.user.id),
        eq(designPhotoRenders.kitchenDesignId, design.id),
        eq(designPhotoRenders.generationMethod, "manual-final-review-gemini-nano-banana-v1"),
      )).orderBy(desc(designPhotoRenders.updatedAt)).limit(1);
      const provenance = saved?.provenance as PhotoRenderProvenanceInput | null | undefined;
      if (!saved || !provenance) return null;
      if (provenance.designRevision !== savedPhotoPlanRevision(design) || provenance.planFingerprint !== savedPhotoPlanFingerprint(design)) {
        return null;
      }
      return {
        imageUrl: saved.imageUrl,
        confirmedAt: saved.confirmedAt,
        generationMethod: saved.generationMethod,
      };
    }),

  startGeminiImageTest: protectedProcedure
    .input(z.object({
      sceneSignature: z.string().min(16).max(191),
      sceneImageDataUrl: z.string().min(128).max(8_500_000).regex(DATA_IMAGE_PREFIX, "A locked JPEG Designer image is required."),
      provenance: photoRenderProvenanceSchema,
      restartPending: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      if (!isGeminiImageConfigured()) throw new Error("Google image testing is not configured.");

      const db = await getDb();
      if (!db) throw new Error("Google image testing is temporarily unavailable.");
      const administratorSnapshot = input.provenance.designId === 0;
      const design = administratorSnapshot ? null : await loadOwnedSavedDesign(db, ctx.user.id, input.provenance.designId);
      let revision: string;
      let fingerprint: string;
      if (administratorSnapshot) {
        revision = "administrator-current-snapshot";
        fingerprint = input.provenance.planFingerprint;
      } else {
        ({ revision, fingerprint } = validatePhotoProvenanceAgainstSavedDesign(input.provenance, design!));
      }

      const imageKind = input.sceneImageDataUrl.match(DATA_IMAGE_PREFIX)?.[1] ?? "jpeg";
      if (imageKind !== "jpeg") throw new Error("Google image testing requires the locked deterministic JPEG capture.");
      const sourceBytes = Buffer.from(input.sceneImageDataUrl.replace(DATA_IMAGE_PREFIX, ""), "base64");
      const dimensions = readJpegDimensions(sourceBytes);
      if (dimensions.width < 1920 || dimensions.height < 1080) {
        throw new Error("Google image testing requires a minimum 1920×1080 locked render. Reopen Final preview and try again.");
      }

      const sourceProvenance = canonicalizeDeterministicRenderProvenance(input.provenance, sourceBytes);
      const prompt = exactPlanPrompt(photoRenderProvenanceSummary(sourceProvenance));
      const [existingPending] = await db.select().from(designGeminiImageTestJobs).where(and(
        eq(designGeminiImageTestJobs.userId, ctx.user.id),
        eq(designGeminiImageTestJobs.kitchenDesignId, design?.id ?? 0),
        eq(designGeminiImageTestJobs.status, "pending"),
      )).orderBy(desc(designGeminiImageTestJobs.updatedAt)).limit(1);
      if (existingPending && existingPending.designRevision === revision && existingPending.planFingerprint === fingerprint) {
        if (!input.restartPending && Date.now() - existingPending.startedAt.getTime() < GEMINI_IMAGE_TEST_STALE_MS) {
          return { jobId: existingPending.id, status: "pending" as const, reused: true };
        }
        await db.update(designGeminiImageTestJobs).set({
          status: "failed",
          errorMessage: input.restartPending
            ? "The earlier Google image test was replaced by a fresh administrator test."
            : "The earlier Google image test expired before it completed. You can start a new test.",
          completedAt: new Date(),
        }).where(eq(designGeminiImageTestJobs.id, existingPending.id));
      }
      const storedSource = await storagePut(
        `admin-google-image-test-sources/${ctx.user.id}/${input.sceneSignature}-${Date.now()}.jpg`,
        sourceBytes,
        "image/jpeg",
      );
      const promptFingerprint = createHash("sha256").update(prompt).digest("hex");
      await db.insert(designGeminiImageTestJobs).values({
        userId: ctx.user.id,
        kitchenDesignId: design?.id ?? 0,
        designRevision: revision,
        planFingerprint: fingerprint,
        sceneSignature: input.sceneSignature,
        interactionId: `queued-${randomUUID()}`,
        status: "queued",
        sourceImageKey: storedSource.key,
        provenance: sourceProvenance,
        promptFingerprint,
      });
      const [job] = await db.select({ id: designGeminiImageTestJobs.id }).from(designGeminiImageTestJobs)
        .where(and(
          eq(designGeminiImageTestJobs.userId, ctx.user.id),
          eq(designGeminiImageTestJobs.sceneSignature, input.sceneSignature),
        )).orderBy(desc(designGeminiImageTestJobs.id)).limit(1);
      if (!job) throw new Error("Google image test could not be queued. Please try again.");
      queueGeminiImageTestJob(job.id);
      return {
        jobId: job.id,
        status: "queued" as const,
        reused: false,
      };
    }),

  getGeminiImageTestJob: protectedProcedure
    .input(z.object({ designId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      const db = await getDb();
      if (!db) return null;
      const design = await loadOwnedSavedDesign(db, ctx.user.id, input.designId);
      const [job] = await db.select().from(designGeminiImageTestJobs).where(and(
        eq(designGeminiImageTestJobs.userId, ctx.user.id),
        eq(designGeminiImageTestJobs.kitchenDesignId, design.id),
      )).orderBy(desc(designGeminiImageTestJobs.updatedAt)).limit(1);
      if (!job || job.designRevision !== savedPhotoPlanRevision(design) || job.planFingerprint !== savedPhotoPlanFingerprint(design)) return null;
      if (job.status === "queued") queueGeminiImageTestJob(job.id);
      return { jobId: job.id, status: job.status, errorMessage: job.errorMessage, startedAt: job.startedAt, nextRetryAt: job.nextRetryAt, retryCount: job.retryCount };
    }),

  pollGeminiImageTest: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      const db = await getDb();
      if (!db) throw new Error("Google image testing is temporarily unavailable.");
      const [job] = await db.select().from(designGeminiImageTestJobs).where(and(
        eq(designGeminiImageTestJobs.id, input.jobId),
        eq(designGeminiImageTestJobs.userId, ctx.user.id),
      )).limit(1);
      if (!job) throw new Error("This Google image test is not available for your account.");
      if (job.status === "completed" && job.imageUrl) return { status: "completed" as const, imageUrl: job.imageUrl };
      if (job.status === "failed") return { status: "failed" as const, message: job.errorMessage ?? "Google image test could not be completed. Please try again." };
      if (job.status === "queued") {
        queueGeminiImageTestJob(job.id);
        return { status: "pending" as const, nextRetryAt: job.nextRetryAt };
      }
      return pollPendingGeminiImageTestJob(db, job);
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
          void sendCustomerImageReadyEmail(db, { ...verifiedRequest, generationStatus: "completed", designPhotoRenderId: cached.id, imageUrl: cached.imageUrl })
            .catch(() => console.warn("[Photo render] Customer image-ready email delivery could not be completed."));
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
        void sendCustomerImageReadyEmail(db, { ...verifiedRequest, generationStatus: "completed", designPhotoRenderId: stored?.id ?? null, imageUrl: storedRender.url })
          .catch(() => console.warn("[Photo render] Customer image-ready email delivery could not be completed."));
      }
      return { imageUrl: storedRender.url, provenance: canonicalProvenance, sourceImageHash: canonicalProvenance.sourceImageHash, reused: false, promptFingerprint, generationMethod: input.provenance.generationMethod, confirmedAt };
    }),
});

export { exactPlanPrompt };

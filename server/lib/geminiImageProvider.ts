import { ENV } from "../_core/env";

export const GEMINI_NANO_BANANA_MODEL = "gemini-3.1-flash-image";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_GENERATE_CONTENT_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_NANO_BANANA_MODEL}:generateContent`;
export const GEMINI_IMAGE_TEST_TIMEOUT_MS = 90_000;

type GeminiImageTestInput = {
  prompt: string;
  sourceImageBase64: string;
  sourceMimeType: "image/jpeg";
  /** Database material pictures (countertop, backsplash, door, floor) sent after the plan image. */
  references?: Array<{ label: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; base64: string }>;
};

type GeminiImageTestOutput = {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png";
};

type GeminiInteractionImageResponse = {
  id?: unknown;
  output_image?: { data?: unknown; mime_type?: unknown };
  steps?: Array<{ content?: Array<{ type?: unknown; data?: unknown; mime_type?: unknown }> }>;
  status?: unknown;
  errors?: Array<{ code?: unknown }>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: unknown; mimeType?: unknown } }> };
  }>;
  error?: { code?: unknown; status?: unknown };
  errors?: Array<{ code?: unknown }>;
};

function safeGeminiFailureMessage(
  status: number | null,
  payload: GeminiInteractionImageResponse | GeminiGenerateContentResponse | null,
) {
  const providerCode = [
    payload?.errors?.[0]?.code,
    payload && "error" in payload ? payload.error?.status : undefined,
  ].find((value): value is string => typeof value === "string")?.toLowerCase() ?? "";
  if (status === 408 || status === 504) return "Google image test timed out before an image was returned. Please try again.";
  if (status === 429 || providerCode.includes("resource_exhausted") || providerCode.includes("rate")) {
    return "Google image test is temporarily rate-limited. Please wait a few minutes and try again.";
  }
  if (status === 401 || status === 403) return "Google image test access was not accepted. Check the secure provider configuration in Operations.";
  if (status !== null && status >= 500) return "Google image test is temporarily unavailable. Please try again shortly.";
  return "Google image test could not be completed. Please try again.";
}

function toImageOutput(encodedImage: unknown, mimeType: unknown) {
  if (typeof encodedImage !== "string" || !encodedImage.length) return null;
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") throw new Error("Google image test returned an unsupported image format.");
  const bytes = Buffer.from(encodedImage, "base64");
  if (!bytes.length) throw new Error("Google image test returned an empty image.");
  return { bytes, mimeType } as GeminiImageTestOutput;
}

function imageFromInteraction(payload: GeminiInteractionImageResponse) {
  const nestedImage = payload.steps?.flatMap((step) => step.content ?? [])
    .find((content) => content.type === "image" && typeof content.data === "string");
  const image = payload.output_image?.data ? payload.output_image : nestedImage;
  return toImageOutput(image?.data, image?.mime_type);
}

function imageFromGenerateContent(payload: GeminiGenerateContentResponse) {
  const image = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.inlineData)
    .find((inlineData) => typeof inlineData?.data === "string");
  return toImageOutput(image?.data, image?.mimeType);
}

async function parseInteractionResponse(response: Response) {
  const payload = await response.json().catch(() => null) as GeminiInteractionImageResponse | null;
  if (!response.ok) throw new Error(safeGeminiFailureMessage(response.status, payload));
  if (!payload) throw new Error("Google image test could not be completed. Please try again.");
  return payload;
}

async function parseGenerateContentResponse(response: Response) {
  const payload = await response.json().catch(() => null) as GeminiGenerateContentResponse | null;
  if (!response.ok) throw new Error(safeGeminiFailureMessage(response.status, payload));
  if (!payload) throw new Error("Google image test could not be completed. Please try again.");
  return payload;
}

export type GeminiImageTestJobStatus =
  | { status: "pending" }
  | { status: "completed"; image: GeminiImageTestOutput }
  | { status: "failed"; message: string };

/** Retained to recover interactions that were created by an earlier app version. */
export async function startGeminiExactPlanTest(input: GeminiImageTestInput): Promise<{ interactionId: string }> {
  if (!isGeminiImageConfigured()) throw new Error("Google image testing is not configured.");
  let response: Response;
  try {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": ENV.geminiApiKey },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: GEMINI_NANO_BANANA_MODEL,
        input: [
          { type: "text", text: input.prompt },
          { type: "image", mime_type: input.sourceMimeType, data: input.sourceImageBase64 },
        ],
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9", image_size: "1K" },
      }),
    });
  } catch {
    throw new Error("Google image test could not be started. Please try again.");
  }
  const payload = await parseInteractionResponse(response);
  if (payload.status === "failed" || payload.status === "cancelled") throw new Error(safeGeminiFailureMessage(null, payload));
  if (typeof payload.id !== "string" || !payload.id) throw new Error("Google image test did not return a tracking identifier. Please try again.");
  return { interactionId: payload.id };
}

/** Retrieves a short status response for legacy background interactions. */
export async function pollGeminiExactPlanTest(interactionId: string): Promise<GeminiImageTestJobStatus> {
  let response: Response;
  try {
    response = await fetch(`${GEMINI_INTERACTIONS_URL}/${encodeURIComponent(interactionId)}`, {
      headers: { "x-goog-api-key": ENV.geminiApiKey },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { status: "pending" };
  }
  const payload = await parseInteractionResponse(response);
  if (payload.status === "failed" || payload.status === "cancelled") return { status: "failed", message: safeGeminiFailureMessage(null, payload) };
  const image = imageFromInteraction(payload);
  return image ? { status: "completed", image } : { status: "pending" };
}

export function isGeminiImageConfigured() {
  return ENV.geminiApiKey.trim().length > 0;
}

/** Validates access without returning the key, account name, or provider payload. */
export async function verifyGeminiImageAccess(): Promise<{ connected: boolean; modelAvailable: boolean }> {
  if (!isGeminiImageConfigured()) return { connected: false, modelAvailable: false };
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": ENV.geminiApiKey },
    });
    if (!response.ok) return { connected: false, modelAvailable: false };
    const payload = await response.json() as { models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }> };
    const modelAvailable = payload.models?.some((model) =>
      model.name === `models/${GEMINI_NANO_BANANA_MODEL}`
      && Array.isArray(model.supportedGenerationMethods)
      && model.supportedGenerationMethods.includes("generateContent"),
    ) ?? false;
    return { connected: true, modelAvailable };
  } catch {
    return { connected: false, modelAvailable: false };
  }
}

/**
 * Creates an administrator-only illustrative test image from the supplied locked
 * Designer JPEG. The key and raw provider payload remain server-side.
 */
export async function generateGeminiExactPlanTest(input: GeminiImageTestInput): Promise<GeminiImageTestOutput> {
  if (!isGeminiImageConfigured()) throw new Error("Google image testing is not configured.");
  let response: Response;
  try {
    response = await fetch(GEMINI_GENERATE_CONTENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": ENV.geminiApiKey,
      },
      signal: AbortSignal.timeout(GEMINI_IMAGE_TEST_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ parts: [
          { text: input.prompt },
          { text: "IMAGE 1 — THE LOCKED KITCHEN PLAN. This is the only layout. Copy its cabinets exactly." },
          { inlineData: { mimeType: input.sourceMimeType, data: input.sourceImageBase64 } },
          ...(input.references ?? []).flatMap((reference, index) => [
            { text: `IMAGE ${index + 2} — MATERIAL SAMPLE ONLY: ${reference.label}. Use this only as the surface finish of the matching part of image 1. Do not copy its layout and do not add anything from it.` },
            { inlineData: { mimeType: reference.mimeType, data: reference.base64 } },
          ]),
        ] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
        },
      }),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error("Google image test timed out before an image was returned. Please try again.");
    }
    throw new Error("Google image test could not be reached. Please try again.");
  }
  const payload = await parseGenerateContentResponse(response);
  const image = imageFromGenerateContent(payload);
  if (!image) throw new Error("Google image test did not return an image.");
  return image;
}

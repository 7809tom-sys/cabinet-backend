import { ENV } from "../_core/env";

export const GEMINI_NANO_BANANA_MODEL = "gemini-3.1-flash-image";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GEMINI_IMAGE_TEST_TIMEOUT_MS = 90_000;

type GeminiImageTestInput = {
  prompt: string;
  sourceImageBase64: string;
  sourceMimeType: "image/jpeg";
};

type GeminiImageTestOutput = {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png";
};

type GeminiImageOutputBlock = {
  type?: unknown;
  data?: unknown;
  mime_type?: unknown;
};

type GeminiInteractionImageResponse = {
  id?: unknown;
  output_image?: GeminiImageOutputBlock;
  steps?: Array<{ content?: GeminiImageOutputBlock[] }>;
  status?: unknown;
  errors?: Array<{ code?: unknown }>;
};

function safeGeminiFailureMessage(status: number | null, payload: GeminiInteractionImageResponse | null) {
  const providerCode = typeof payload?.errors?.[0]?.code === "string" ? payload.errors[0].code.toLowerCase() : "";
  if (status === 408 || status === 504) return "Google image test timed out before an image was returned. Please try again.";
  if (status === 429 || providerCode.includes("resource_exhausted") || providerCode.includes("rate")) {
    return "Google image test is temporarily rate-limited. Please wait a few minutes and try again.";
  }
  if (status === 401 || status === 403) return "Google image test access was not accepted. Check the secure provider configuration in Operations.";
  if (status !== null && status >= 500) return "Google image test is temporarily unavailable. Please try again shortly.";
  return "Google image test could not be completed. Please try again.";
}

function imageFromInteraction(payload: GeminiInteractionImageResponse) {
  const nestedImage = payload.steps?.flatMap((step) => step.content ?? [])
    .find((content) => content.type === "image" && typeof content.data === "string");
  const image = payload.output_image?.data ? payload.output_image : nestedImage;
  const encodedImage = image?.data;
  const mimeType = image?.mime_type;
  if (typeof encodedImage !== "string" || !encodedImage.length) return null;
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") throw new Error("Google image test returned an unsupported image format.");
  const bytes = Buffer.from(encodedImage, "base64");
  if (!bytes.length) throw new Error("Google image test returned an empty image.");
  return { bytes, mimeType } as GeminiImageTestOutput;
}

async function parseInteractionResponse(response: Response) {
  const payload = await response.json().catch(() => null) as GeminiInteractionImageResponse | null;
  if (!response.ok) throw new Error(safeGeminiFailureMessage(response.status, payload));
  if (!payload) throw new Error("Google image test could not be completed. Please try again.");
  return payload;
}

export type GeminiImageTestJobStatus =
  | { status: "pending" }
  | { status: "completed"; image: GeminiImageTestOutput }
  | { status: "failed"; message: string };

/** Starts a Google interaction quickly; the image is fetched later by the server. */
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
        background: true,
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

/** Retrieves a short status response so browsers never wait for generation itself. */
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
 * Designer JPEG. The key and the provider payload remain server-side; callers
 * receive only generated image bytes and a verified content type.
 */
export async function generateGeminiExactPlanTest(input: GeminiImageTestInput): Promise<GeminiImageTestOutput> {
  if (!isGeminiImageConfigured()) throw new Error("Google image testing is not configured.");
  let response: Response;
  try {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": ENV.geminiApiKey,
      },
      signal: AbortSignal.timeout(GEMINI_IMAGE_TEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: GEMINI_NANO_BANANA_MODEL,
        input: [
          { type: "text", text: input.prompt },
          { type: "image", mime_type: input.sourceMimeType, data: input.sourceImageBase64 },
        ],
        // This is an administrator comparison, not the released customer render.
        // 1K keeps the provider call bounded while preserving the 16:9 composition.
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9", image_size: "1K" },
      }),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error("Google image test timed out before an image was returned. Please try again.");
    }
    throw new Error("Google image test could not be reached. Please try again.");
  }
  const payload = await parseInteractionResponse(response);
  if (payload.status === "failed" || payload.status === "cancelled") throw new Error(safeGeminiFailureMessage(null, payload));
  const image = imageFromInteraction(payload);
  if (!image) throw new Error("Google image test did not return an image.");
  return image;
}

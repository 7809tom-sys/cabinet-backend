import { ENV } from "../_core/env";

export const GEMINI_NANO_BANANA_MODEL = "gemini-3.1-flash-image";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

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
  output_image?: GeminiImageOutputBlock;
  steps?: Array<{ content?: GeminiImageOutputBlock[] }>;
};

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
  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": ENV.geminiApiKey,
    },
    body: JSON.stringify({
      model: GEMINI_NANO_BANANA_MODEL,
      input: [
        { type: "text", text: input.prompt },
        { type: "image", mime_type: input.sourceMimeType, data: input.sourceImageBase64 },
      ],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9", image_size: "2K" },
    }),
  });
  if (!response.ok) throw new Error(`Google image test failed with status ${response.status}.`);
  const payload = await response.json() as GeminiInteractionImageResponse;
  // SDKs may expose `output_image` as a convenience property. The REST
  // Interactions response records model output in `steps[].content[]`, so
  // accept that official form too without returning the raw provider payload.
  const nestedImage = payload.steps?.flatMap((step) => step.content ?? [])
    .find((content) => content.type === "image" && typeof content.data === "string");
  const image = payload.output_image?.data ? payload.output_image : nestedImage;
  const encodedImage = image?.data;
  const mimeType = image?.mime_type;
  if (typeof encodedImage !== "string" || !encodedImage.length) throw new Error("Google image test did not return an image.");
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") throw new Error("Google image test returned an unsupported image format.");
  const bytes = Buffer.from(encodedImage, "base64");
  if (!bytes.length) throw new Error("Google image test returned an empty image.");
  return { bytes, mimeType };
}

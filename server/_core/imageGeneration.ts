/**
 * Image generation helper backed by Gemini image generation (Nano Banana).
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 */
import { storageFetchObject, storagePut } from "../storage";
import { ENV } from "./env";
import { createHash } from "crypto";

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
const GENERATE_TIMEOUT_MS = 120_000;
const MAX_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024;

export type GenerateImageOptions = {
  prompt: string;
  /** Accepted for caller compatibility; the Gemini image model is always used. */
  model?: string;
  /** "high" requests 2K output; anything else requests 1K. */
  quality?: "low" | "medium" | "high";
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
  /** SHA-256 of the returned image bytes for duplicate-output safeguards. */
  contentHash?: string;
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: unknown; mimeType?: unknown } }> };
    finishReason?: unknown;
  }>;
  promptFeedback?: { blockReason?: unknown };
  error?: { message?: unknown };
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Resolve a reference image to base64: inline data, a stored /manus-storage file, or an http(s) URL. */
async function loadReferenceImage(
  image: NonNullable<GenerateImageOptions["originalImages"]>[number]
): Promise<{ mimeType: string; data: string }> {
  if (image.b64Json) {
    return { mimeType: image.mimeType || "image/png", data: image.b64Json };
  }
  if (!image.url) throw new Error("Reference image needs a url or b64Json");

  let response: Response;
  const stored = /^\/?manus-storage\/(.+)$/.exec(image.url.split("?")[0]);
  if (stored) {
    response = await storageFetchObject(decodeURIComponent(stored[1]));
  } else if (/^https?:\/\//i.test(image.url)) {
    response = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
  } else {
    throw new Error("Reference image url must be a stored file or an http(s) URL");
  }
  if (!response.ok) throw new Error(`Reference image could not be loaded (${response.status})`);

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("Reference image is empty or too large");
  }
  const headerType = response.headers.get("content-type")?.split(";")[0].trim();
  const mimeType =
    image.mimeType ||
    (headerType && headerType.startsWith("image/") ? headerType : "image/png");
  return { mimeType, data: bytes.toString("base64") };
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const references = await Promise.all(
    (options.originalImages ?? []).map(loadReferenceImage)
  );

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": ENV.geminiApiKey,
      },
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: options.prompt },
              ...references.map((ref) => ({
                inlineData: { mimeType: ref.mimeType, data: ref.data },
              })),
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { imageSize: options.quality === "high" ? "2K" : "1K" },
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail.slice(0, 300)}` : ""}`
    );
  }

  const result = (await response.json()) as GeminiImageResponse;
  const part = result.candidates?.[0]?.content?.parts?.find(
    (p) => typeof p.inlineData?.data === "string" && p.inlineData.data.length > 0
  );
  const base64Data = part?.inlineData?.data;
  if (typeof base64Data !== "string") {
    const blocked = result.promptFeedback?.blockReason ?? result.candidates?.[0]?.finishReason;
    throw new Error(`Image generation returned no image${blocked ? ` (${String(blocked)})` : ""}`);
  }
  const mimeType =
    typeof part?.inlineData?.mimeType === "string" ? part.inlineData.mimeType : "image/png";
  const buffer = Buffer.from(base64Data, "base64");

  const { url } = await storagePut(
    `generated/${Date.now()}.${IMAGE_EXTENSIONS[mimeType] ?? "png"}`,
    buffer,
    mimeType
  );
  return {
    url,
    contentHash: createHash("sha256").update(buffer).digest("hex"),
  };
}

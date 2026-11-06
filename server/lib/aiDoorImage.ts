/**
 * Draw the door: the picture half of Generate.
 *
 * Generate's job in the door editor is a photorealistic image of the door, not a
 * paragraph about it. This module turns a description plus the door's own photo
 * into one image, with the provider that can actually draw it:
 *
 *   OpenAI  POST /v1/images/edits        (image + prompt, `gpt-image` models)
 *   Gemini  models/{id}:generateContent  (responseModalities: ["IMAGE"])
 *
 * Anthropic's Messages API returns text only, so Claude has no image call here.
 * `paintDoorImage` is given the painter explicitly; the caller chooses it from
 * `shared/aiDoorImage.ts`, where Claude's column is documented as
 * description-then-image rather than faked.
 *
 * Keys never leave this server:
 *
 *   OPENAI_API_KEY          GPT's description and OpenAI's image
 *   GEMINI_API_KEY          Gemini's description and the image for Claude's column
 *   OPENAI_DOOR_IMAGE_MODEL optional model override (default below)
 *   GEMINI_IMAGE_MODEL      already set for room scenes; reused for door images
 *
 * A provider failure is returned as a plain sentence and logged with the status
 * and the provider's own error body, so an operator can see why an image did not
 * arrive instead of reading "try again" forever.
 */
import { storagePut } from "../storage";

/** The OpenAI image model a door is drawn with. Overridable without a deploy. */
export const AI_DOOR_OPENAI_IMAGE_MODEL =
  (process.env.OPENAI_DOOR_IMAGE_MODEL ?? "").trim() || "gpt-image-2";

/** The Gemini image model a door is drawn with. Shared with room scenes. */
export const AI_DOOR_GEMINI_IMAGE_MODEL =
  (process.env.GEMINI_IMAGE_MODEL ?? "").trim() || "gemini-3.1-flash-image";

/** A door photo larger than this is not sent to an image call. */
export const AI_DOOR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** An image call may take a while; a door render is 60s of headroom. */
export const AI_DOOR_IMAGE_TIMEOUT_MS = 90_000;

export type DoorImagePainter = "openai" | "gemini";

export type DoorImageInput = {
  painter: DoorImagePainter;
  /** The description the column's model wrote, used as the drawing brief. */
  description: string;
  /** The door's own photo as an inline data URL, when the style has one. */
  photoDataUrl: string | null;
  /** What the door is called, for the prompt's opening line. */
  doorName?: string | null;
  /** The style's finish and color words, when the editor has them. */
  finish?: string | null;
  colorDescription?: string | null;
  env?: {
    openaiApiKey?: string;
    geminiApiKey?: string;
    openaiModel?: string;
    geminiModel?: string;
  };
  fetchImpl?: typeof fetch;
};

export type DoorImageResult =
  | {
    status: "ok";
    /** `/manus-storage/…`, served by the storage proxy. */
    url: string;
    painter: DoorImagePainter;
    providerModel: string;
  }
  | {
    status: "error";
    painter: DoorImagePainter;
    /** One plain sentence for the column. */
    message: string;
  };

/**
 * The brief handed to the image model.
 *
 * It is built from what the text model actually said, plus the door's own name,
 * finish and color words when the editor has them, and it states the rules the
 * photo already implies: one door front, the same construction, the same color,
 * studio lighting, no room. Nothing is invented — an unstated detail is left to
 * the model's reading of the photo rather than filled in here.
 */
export function doorImagePrompt(args: {
  description: string;
  doorName?: string | null;
  finish?: string | null;
  colorDescription?: string | null;
  hasPhoto: boolean;
}): string {
  const name = args.doorName?.trim();
  const finish = args.finish?.trim();
  const color = args.colorDescription?.trim();
  const lines = [
    `Produce one photorealistic studio photograph of a single cabinet door front${name ? ` — ${name}` : ""}.`,
    "It must depict exactly the door described below, at the same proportions and with the same construction, edge profile, bevel, molding, and finish.",
  ];
  if (args.hasPhoto) {
    lines.push("The attached photograph is the authoritative reference for this door. Match its profile, panel, edge and color. Do not redraw it in a different style.");
  } else {
    lines.push("There is no photograph; draw only what the description states and keep unstated details plain or absent rather than inventing an ornate one.");
  }
  if (finish) lines.push(`Finish: ${finish}.`);
  if (color) lines.push(`Color and sheen: ${color}.`);
  lines.push(
    "One door only: the front face, square to the camera, filling the frame, on a neutral mid-grey studio background with soft even light and a gentle shadow.",
    "No kitchen, no cabinets around it, no hardware, no people, no text, no labels, no watermark.",
    "Description of the door:",
    args.description.trim(),
  );
  return lines.join("\n");
}

/** Read the first base64 image out of an OpenAI image response. */
export function imageBytesFromOpenAI(payload: unknown): { bytes: Buffer; mime: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as { b64_json?: unknown; url?: unknown } | undefined;
  const b64 = typeof first?.b64_json === "string" ? first.b64_json : "";
  if (!b64) return null;
  const bytes = Buffer.from(b64, "base64");
  return bytes.length ? { bytes, mime: "image/png" } : null;
}

/** Read the first inline image out of a Gemini generateContent response. */
export function imageBytesFromGemini(payload: unknown): { bytes: Buffer; mime: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = (part as { inlineData?: { data?: unknown; mimeType?: unknown } }).inlineData;
    const b64 = typeof inline?.data === "string" ? inline.data : "";
    if (!b64) continue;
    const mime = typeof inline?.mimeType === "string" && inline.mimeType.startsWith("image/")
      ? inline.mimeType
      : "image/png";
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length) return { bytes, mime };
  }
  return null;
}

/** The provider's own error text, trimmed to something loggable and safe to store. */
function providerErrorDetail(body: string): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  return trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
}

function extensionFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

/**
 * Store the drawn image and return the URL the frontend loads.
 *
 * `door-style-images/` is not a private prefix, so the storage proxy serves it
 * the same way it serves a door sample photo.
 */
async function storeDrawnDoor(
  bytes: Buffer,
  mime: string,
  painter: DoorImagePainter,
  styleHint: string | null,
): Promise<string> {
  const stamp = Date.now().toString(36);
  const slug = (styleHint ?? "door").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40);
  const { url } = await storagePut(
    `door-style-images/ai-generated/${slug || "door"}-${painter}-${stamp}.${extensionFor(mime)}`,
    bytes,
    mime,
  );
  return url;
}

/**
 * Draw one door.
 *
 * Always resolves to a result, never throws, so the column can report an image
 * failure in a sentence while still keeping whatever description came back.
 */
export async function paintDoorImage(args: DoorImageInput): Promise<DoorImageResult> {
  const { painter } = args;
  const env = args.env ?? {};
  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  const prompt = doorImagePrompt({
    description: args.description,
    doorName: args.doorName ?? null,
    finish: args.finish ?? null,
    colorDescription: args.colorDescription ?? null,
    hasPhoto: Boolean(args.photoDataUrl),
  });

  try {
    if (painter === "openai") {
      const key = (env.openaiApiKey ?? "").trim();
      if (!key) return { status: "error", painter, message: "OpenAI's image model is not connected yet." };
      const model = (env.openaiModel ?? "").trim() || AI_DOOR_OPENAI_IMAGE_MODEL;
      const { url, body } = openAIImageRequest({ prompt, model, photoDataUrl: args.photoDataUrl });
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(AI_DOOR_IMAGE_TIMEOUT_MS),
      });
      if (!response.ok) {
        const detail = providerErrorDetail(await response.text().catch(() => ""));
        console.error(`[ai-door-image] openai ${response.status} ${response.statusText}: ${detail}`);
        return { status: "error", painter, message: openAiFailureSentence(response.status) };
      }
      const payload = await response.json();
      const image = imageBytesFromOpenAI(payload);
      if (!image) {
        console.error(`[ai-door-image] openai returned no image for model ${model}`);
        return { status: "error", painter, message: "OpenAI's image model returned no image. Try Generate again." };
      }
      const served = await storeDrawnDoor(image.bytes, image.mime, painter, args.doorName ?? null);
      return { status: "ok", url: served, painter, providerModel: model };
    }

    const key = (env.geminiApiKey ?? "").trim();
    if (!key) return { status: "error", painter, message: "Google's image model is not connected yet." };
    const model = (env.geminiModel ?? "").trim() || AI_DOOR_GEMINI_IMAGE_MODEL;
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(geminiImageBody(prompt, args.photoDataUrl)),
        signal: AbortSignal.timeout(AI_DOOR_IMAGE_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      const detail = providerErrorDetail(await response.text().catch(() => ""));
      console.error(`[ai-door-image] gemini ${response.status} ${response.statusText}: ${detail}`);
      return { status: "error", painter, message: geminiFailureSentence(response.status) };
    }
    const payload = await response.json();
    const image = imageBytesFromGemini(payload);
    if (!image) {
      console.error(`[ai-door-image] gemini returned no image for model ${model}`);
      return { status: "error", painter, message: "Google's image model returned no image. Try Generate again." };
    }
    const served = await storeDrawnDoor(image.bytes, image.mime, painter, args.doorName ?? null);
    return { status: "ok", url: served, painter, providerModel: model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ai-door-image] ${painter} call failed: ${message}`);
    const timedOut = /timeout|abort/i.test(message);
    return {
      status: "error",
      painter,
      message: timedOut
        ? "The image model took too long to answer. Try Generate again."
        : "The image model could not be reached. Try Generate again.",
    };
  }
}

/**
 * The OpenAI image request.
 *
 * With a photo, the door is *edited* from it (`/v1/images/edits`, multipart), so
 * the picture keeps the real door's construction and color instead of inventing
 * a door from words. Without a photo there is nothing to edit, so it falls back
 * to text-to-image (`/v1/images/generations`), and the column's own description
 * is the brief.
 */
function openAIImageRequest(args: {
  prompt: string;
  model: string;
  photoDataUrl: string | null;
}): { url: string; body: BodyInit } {
  const photo = args.photoDataUrl ? parseDataUrl(args.photoDataUrl) : null;
  if (!photo) {
    return {
      url: "https://api.openai.com/v1/images/generations",
      body: JSON.stringify({
        model: args.model,
        prompt: args.prompt,
        n: 1,
        size: "1024x1536",
      }),
    };
  }
  const form = new FormData();
  form.append("model", args.model);
  form.append("prompt", args.prompt);
  form.append("n", "1");
  form.append("size", "1024x1536");
  form.append(
    "image",
    new Blob([new Uint8Array(photo.bytes)], { type: photo.mime }),
    `door.${photo.mime === "image/jpeg" ? "jpg" : photo.mime === "image/webp" ? "webp" : "png"}`,
  );
  return { url: "https://api.openai.com/v1/images/edits", body: form };
}

/** The Gemini image request: the prompt, then the photo as an inline part. */
function geminiImageBody(prompt: string, photoDataUrl: string | null): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  const photo = photoDataUrl ? parseDataUrl(photoDataUrl) : null;
  if (photo) {
    parts.push({ inlineData: { mimeType: photo.mime, data: photo.bytes.toString("base64") } });
  }
  return {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "2:3", imageSize: "1K" },
    },
  };
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length || bytes.length > AI_DOOR_IMAGE_MAX_BYTES) return null;
  return { mime: match[1]!.toLowerCase(), bytes };
}

/** A plain sentence for an OpenAI image failure. Never the provider payload. */
export function openAiFailureSentence(status: number): string {
  if (status === 401 || status === 403) return "OpenAI rejected the image request. The OPENAI_API_KEY on the server may not have image access.";
  if (status === 429) return "OpenAI's image model is busy right now. Try Generate again in a moment.";
  if (status === 400 || status === 404) return "OpenAI's image model rejected this request. The image model name may not be available on this account.";
  return "OpenAI's image model could not draw this door. Try Generate again.";
}

/** A plain sentence for a Gemini image failure. Never the provider payload. */
export function geminiFailureSentence(status: number): string {
  if (status === 401 || status === 403) return "Google rejected the image request. The GEMINI_API_KEY on the server may not have image access.";
  if (status === 429) return "Google's image model is busy right now. Try Generate again in a moment.";
  if (status === 400 || status === 404) return "Google's image model rejected this request. The image model name may not be available on this account.";
  return "Google's image model could not draw this door. Try Generate again.";
}

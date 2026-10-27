import { storageFetchObject } from "../storage";
import { invokeLLM, type InvokeResult } from "../_core/llm";
import {
  DoorRenderingAuditError,
  doorRenderScoresFromPayload,
  type DoorRenderScoreSet,
} from "../../shared/doorRenderingAudit";

export const DOOR_RENDER_AUDIT_MODEL = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-3-flash-preview";
export const DOOR_RENDER_AUDIT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const SCORE_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "door_render_audit_scores",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        woodGrain: { type: "integer", description: "Wood grain realism from 1 to 10" },
        color: { type: "integer", description: "Color realism from 1 to 10" },
        textureSheen: { type: "integer", description: "Texture and sheen realism from 1 to 10" },
        profileEdges: { type: "integer", description: "Profile and edge realism from 1 to 10" },
        overall: { type: "integer", description: "Overall realism from 1 to 10" },
        notes: { type: "string", description: "One short sentence on the largest visual gap, or empty" },
      },
      required: ["woodGrain", "color", "textureSheen", "profileEdges", "overall", "notes"],
    },
  },
};

const SCORE_INSTRUCTIONS = [
  "Compare image 1, the real cabinet door sample photo, with image 2, a 3D designer render of the same door style.",
  "Score how realistic the render looks, from 1 (nothing like the sample) to 10 (indistinguishable for that aspect).",
  "Score only what is visible. Do not invent measurements.",
  "woodGrain: grain direction, figure, and scale.",
  "color: hue and depth versus the sample.",
  "textureSheen: surface texture and sheen, such as matte, satin, or gloss.",
  "profileEdges: rails, stiles, panel, and edge geometry.",
  "overall: your overall realism judgment. It does not have to equal the average of the other scores.",
  "notes: one short sentence naming the largest visual gap. Use an empty string when the render is a close match.",
].join(" ");

type ScoreInvoker = (params: Parameters<typeof invokeLLM>[0]) => Promise<InvokeResult>;

export function doorRenderStorageKey(styleId: number, runId: number, extension: string): string {
  return `door-rendering-audit/style-${styleId}/run-${runId}.${extension}`;
}

export function decodeRenderUpload(imageBase64: string, contentType: "image/png" | "image/jpeg" | "image/webp"): {
  bytes: Buffer;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
} {
  const dataUrl = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(imageBase64.trim());
  const encoded = (dataUrl?.[2] ?? imageBase64).replace(/\s/g, "");
  const declared = dataUrl?.[1] ?? contentType;
  if (declared !== "image/png" && declared !== "image/jpeg" && declared !== "image/webp") {
    throw new DoorRenderingAuditError("Upload a PNG, JPEG, or WebP render.");
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(encoded, "base64");
  } catch {
    throw new DoorRenderingAuditError("The render image could not be read.");
  }
  if (!bytes.length || bytes.length > DOOR_RENDER_AUDIT_MAX_IMAGE_BYTES) {
    throw new DoorRenderingAuditError("The render image is empty or larger than 8 MB.");
  }
  const matches =
    (declared === "image/png" && bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
    (declared === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (declared === "image/webp" && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP");
  if (!matches) throw new DoorRenderingAuditError("Upload a PNG, JPEG, or WebP render.");
  const extension = declared === "image/png" ? "png" : declared === "image/webp" ? "webp" : "jpg";
  return { bytes, contentType: declared, extension };
}

export function messageText(result: InvokeResult): string {
  const raw = result.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw;
  if (!Array.isArray(raw)) return "";
  return raw.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : "")).join("");
}

export function parseDoorRenderScoreText(text: string): { scores: DoorRenderScoreSet; notes: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DoorRenderingAuditError("The vision model did not return scores.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new DoorRenderingAuditError("The vision model did not return scores.");
  }
  const record = parsed as Record<string, unknown>;
  const notes = typeof record.notes === "string" ? record.notes.trim().slice(0, 512) : "";
  return { scores: doorRenderScoresFromPayload(record), notes };
}

/** Load a stored /manus-storage file or an http(s) image as a data URL Gemini can see. */
export async function imageUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:image/")) return url;
  const stored = /^\/?manus-storage\/(.+)$/.exec(url.split("?")[0]);
  let response: Response;
  if (stored) {
    response = await storageFetchObject(decodeURIComponent(stored[1]));
  } else if (/^https?:\/\//i.test(url)) {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } else {
    throw new DoorRenderingAuditError("The sample photo must be a stored file or an http(s) URL.");
  }
  if (!response.ok) {
    throw new DoorRenderingAuditError(`The sample photo could not be loaded (${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > DOOR_RENDER_AUDIT_MAX_IMAGE_BYTES) {
    throw new DoorRenderingAuditError("The sample photo is empty or too large.");
  }
  const headerType = response.headers.get("content-type")?.split(";")[0]?.trim();
  const mime = headerType && headerType.startsWith("image/") ? headerType : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/**
 * Ask the existing Gemini vision path (GEMINI_API_KEY via invokeLLM) to score
 * a designer render against the door style's sample photo.
 */
export async function scoreDoorRenderPair(
  input: { sampleImage: string; renderImage: string },
  invoke: ScoreInvoker = invokeLLM,
): Promise<{ scores: DoorRenderScoreSet; notes: string; model: string }> {
  const sampleImage = await imageUrlToDataUrl(input.sampleImage);
  const renderImage = await imageUrlToDataUrl(input.renderImage);
  const result = await invoke({
    model: DOOR_RENDER_AUDIT_MODEL,
    maxTokens: 800,
    responseFormat: SCORE_RESPONSE_FORMAT,
    messages: [
      {
        role: "system",
        content: "You score cabinet door renders. Reply with the requested scores only.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: SCORE_INSTRUCTIONS },
          { type: "text", text: "Image 1 is the real sample door photo." },
          { type: "image_url", image_url: { url: sampleImage, detail: "auto" } },
          { type: "text", text: "Image 2 is the new 3D designer render." },
          { type: "image_url", image_url: { url: renderImage, detail: "auto" } },
        ],
      },
    ],
  });
  const parsed = parseDoorRenderScoreText(messageText(result));
  return { ...parsed, model: DOOR_RENDER_AUDIT_MODEL };
}

/**
 * Describe one cabinet door with a chosen AI provider.
 *
 * The door editor's comparison tool has three columns (GPT, Claude, Gemini). Each
 * one sends its own prompt here, plus the door's sample photo, and gets back the
 * model's plain-text description. That text is pasted into the column and parsed
 * by `shared/aiDoorDescription.ts` exactly as a hand-pasted answer is, so the
 * generated path and the paste-back path produce the same record.
 *
 * Provider keys stay on this server. They are read from the environment here and
 * nowhere else:
 *
 *   OPENAI_API_KEY     GPT
 *   ANTHROPIC_API_KEY  Claude
 *   GEMINI_API_KEY     Gemini
 *
 * A missing key is not an error. Each call reports `not-connected` with the plain
 * sentence the column shows, so the button can say "Claude isn't connected yet"
 * instead of failing silently or leaking a provider message.
 *
 * The prompt text is the same constant the door editor shows and copies
 * (`shared/aiDoorPrompts.ts`); the caller passes it through so the UI and the call
 * cannot drift. Only the three known models are accepted, and the prompt length is
 * capped, so this procedure cannot be used as a general-purpose LLM proxy.
 */
import {
  AI_DOOR_MODEL_ENV_KEYS,
  AI_DOOR_NOT_CONNECTED_MESSAGE,
  AI_DOOR_GENERATE_FAILED_MESSAGE,
  type AiDoorDescribeImage,
  type AiDoorDescribeResult,
} from "../../shared/aiDoorDescribe";
import type { AiDoorModel } from "../../shared/aiDoorPrompts";
import { AI_DOOR_IMAGE_FAILED_MESSAGE, AI_DOOR_IMAGE_PLANS } from "../../shared/aiDoorImage";
import { ENV } from "../_core/env";
import { storageFetchObject } from "../storage";
import { paintDoorImage, type DoorImageInput, type DoorImageResult } from "./aiDoorImage";

/** Longest prompt this endpoint will forward. The shipped prompts are ~1.2 KB. */
export const AI_DOOR_PROMPT_MAX_CHARS = 6_000;
/** Longest single description this endpoint will return. */
export const AI_DOOR_DESCRIPTION_MAX_CHARS = 8_000;
/** A door photo larger than this is not sent; the description is asked for without it. */
export const AI_DOOR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/**
 * The models that answer each column. Overridable so a rollout does not need a
 * deploy — and so a provider retiring a model id is a variable change, not a code
 * change.
 *
 * All three defaults are current, Active ids on their provider's own model list.
 * `claude-sonnet-5-5` replaced `claude-sonnet-4-5`, which Anthropic deprecated on
 * September 30, 2026 and retires on November 30, 2026. Deprecated models still
 * serve requests until their retirement date, so that was not the cause of the
 * old failure — but it would have become one, without a code change, in three
 * weeks. Every default stays overridable so a future retirement is a variable
 * change rather than a deploy.
 */
export const AI_DOOR_PROVIDER_MODELS: Record<AiDoorModel, { env: string; fallback: string }> = {
  gpt: { env: "OPENAI_DOOR_DESCRIPTION_MODEL", fallback: "gpt-4.1-mini" },
  claude: { env: "ANTHROPIC_DOOR_DESCRIPTION_MODEL", fallback: "claude-sonnet-5-5" },
  gemini: { env: "GEMINI_DOOR_DESCRIPTION_MODEL", fallback: "gemini-3-flash-preview" },
};

/** Which key each column reads, exported so a test and the docs agree with the code. */
export const AI_DOOR_MODEL_KEYS = AI_DOOR_MODEL_ENV_KEYS;

type ProviderEnv = {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openaiModel?: string;
  anthropicModel?: string;
  geminiModel?: string;
};

function providerEnv(): ProviderEnv {
  const read = (key: string) => (process.env[key] ?? "").trim();
  return {
    openaiApiKey: read("OPENAI_API_KEY"),
    anthropicApiKey: read("ANTHROPIC_API_KEY"),
    geminiApiKey: ENV.geminiApiKey.trim() || read("GEMINI_API_KEY"),
    openaiModel: read(AI_DOOR_PROVIDER_MODELS.gpt.env) || AI_DOOR_PROVIDER_MODELS.gpt.fallback,
    anthropicModel: read(AI_DOOR_PROVIDER_MODELS.claude.env) || AI_DOOR_PROVIDER_MODELS.claude.fallback,
    geminiModel: read(AI_DOOR_PROVIDER_MODELS.gemini.env) || AI_DOOR_PROVIDER_MODELS.gemini.fallback,
  };
}

/** True when this model's provider key is set on this server. Never returns the key. */
export function aiDoorModelConnected(model: AiDoorModel, env: ProviderEnv = providerEnv()): boolean {
  if (model === "gpt") return Boolean(env.openaiApiKey);
  if (model === "claude") return Boolean(env.anthropicApiKey);
  return Boolean(env.geminiApiKey);
}

/** The `{ status: "not-connected" }` answer for a model whose key is missing. */
export function aiDoorNotConnected(model: AiDoorModel): AiDoorDescribeResult {
  return { status: "not-connected", model, message: AI_DOOR_NOT_CONNECTED_MESSAGE[model] };
}

/** The plain sentence for a provider failure. Never a provider payload. */
export function aiDoorFailureMessage(model: AiDoorModel, reason: "rate-limited" | "timeout" | "provider-error"): string {
  if (reason === "rate-limited") return `${modelLabel(model)} is busy right now. Try Generate again in a moment.`;
  if (reason === "timeout") return `${modelLabel(model)} took too long to answer. Try Generate again.`;
  return `${AI_DOOR_GENERATE_FAILED_MESSAGE} (${modelLabel(model)})`;
}

function modelLabel(model: AiDoorModel): string {
  return model === "gpt" ? "GPT" : model === "claude" ? "Claude" : "Gemini";
}

/**
 * Read a door photo into an inline data URL the provider can see.
 *
 * Accepts a `data:image/…` URL as-is, a stored `/manus-storage/…` key (fetched
 * with the service-role key), or an http(s) URL. Anything that cannot be read
 * returns null: the door is then described from its name alone, with the prompt's
 * own "not visible" rule keeping the model honest.
 */
export async function loadDoorPhotoDataUrl(
  image: AiDoorDescribeImage | null | undefined,
  fetchObject: (key: string) => Promise<Response> = storageFetchObject,
  fetchHttp: typeof fetch = globalThis.fetch,
): Promise<string | null> {
  const url = image?.url?.trim() ?? "";
  if (!url) return null;
  if (/^data:image\/[a-z+]+;base64,/i.test(url)) {
    return url.length > 0 ? url : null;
  }
  try {
    let response: Response;
    const stored = /^\/?manus-storage\/(.+)$/.exec(url.split("?")[0]);
    if (stored) {
      response = await fetchObject(decodeURIComponent(stored[1]));
    } else if (/^https?:\/\//i.test(url)) {
      response = await fetchHttp(url, { signal: AbortSignal.timeout(30_000) });
    } else {
      return null;
    }
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > AI_DOOR_IMAGE_MAX_BYTES) return null;
    const header = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const mime = header.startsWith("image/") ? header : guessImageMime(url);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function guessImageMime(url: string): string {
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/** The user turn: the prompt, then the photo when there is one. */
export function aiDoorUserContent(prompt: string, photoDataUrl: string | null): MessageContent[] {
  const parts: MessageContent[] = [{ type: "text", text: prompt }];
  if (photoDataUrl) {
    parts.push({ type: "image_url", image_url: { url: photoDataUrl, detail: "high" } });
  } else {
    parts.push({
      type: "text",
      text: "No photo was supplied for this door. Say \"not visible\" for anything the description would need the photo to see.",
    });
  }
  return parts;
}

/**
 * True when this OpenAI model wants `max_completion_tokens` instead of `max_tokens`.
 *
 * The reasoning families (`o1`, `o3`, `o4`, `gpt-5`) reject `max_tokens`; the
 * chat families (`gpt-4.1`, `gpt-4o`, …) reject `max_completion_tokens` on some
 * endpoints. Sending the wrong one is a 400, so the field is chosen from the id
 * rather than assumed.
 */
export function usesCompletionTokensField(model: string): boolean {
  const id = model.trim().toLowerCase();
  return /^(o1|o3|o4|gpt-5)/.test(id);
}

/** True when this model id is one Anthropic still serves. */
export function isKnownAnthropicModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  return /^claude-(3|4|5|opus|sonnet|haiku)/.test(id);
}

/** Whatever a provider returned, read as plain text. */
function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text?: unknown }).text ?? "") : ""))
      .join("");
  }
  return "";
}

type ProviderRequest = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

/**
 * The request body each provider needs for the same question.
 *
 * OpenAI and Gemini share the chat-completions shape (Gemini through its
 * OpenAI-compatible endpoint); Anthropic uses the Messages API, where the image
 * is a `source` block rather than an `image_url`.
 */
export function aiDoorProviderRequest(args: {
  model: AiDoorModel;
  prompt: string;
  photoDataUrl: string | null;
  image: AiDoorDescribeImage | null;
  env?: ProviderEnv;
}): ProviderRequest {
  const env = args.env ?? providerEnv();
  const text = args.prompt.trim();
  const dataUrl = args.photoDataUrl;
  if (args.model === "claude") {
    const content: Record<string, unknown>[] = [{ type: "text", text }];
    if (dataUrl) {
      const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
      if (match) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: match[1], data: match[2] },
        });
      }
    }
    if (!dataUrl) {
      content.push({
        type: "text",
        text: "No photo was supplied for this door. Say \"not visible\" for anything the description would need the photo to see.",
      });
    }
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.anthropicApiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: env.anthropicModel ?? AI_DOOR_PROVIDER_MODELS.claude.fallback,
        // Current Sonnet-class models think adaptively by default at `high`
        // effort, and thinking counts against max_tokens. A budget sized for the
        // answer alone can be spent entirely on thinking, which comes back as
        // empty content with stop_reason "max_tokens". Two changes keep the
        // description reachable: more headroom, and `low` effort, which is enough
        // to read a door photograph and write ten labelled lines.
        max_tokens: 4_096,
        output_config: { effort: "low" },
        messages: [{ role: "user", content }],
      },
    };
  }
  if (args.model === "gpt") {
    const body: Record<string, unknown> = {
      model: env.openaiModel ?? AI_DOOR_PROVIDER_MODELS.gpt.fallback,
      messages: [{ role: "user", content: aiDoorUserContent(text, dataUrl) }],
    };
    // `max_tokens` is the universal Chat Completions field. `max_completion_tokens`
    // is only accepted by the newer reasoning models; sending it to a model on the
    // older contract is a 400 ("Unsupported parameter"), which is exactly the kind
    // of provider error that used to surface here as a generic sentence.
    if (usesCompletionTokensField(body.model)) body.max_completion_tokens = 1_024;
    else body.max_tokens = 1_024;
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.openaiApiKey ?? ""}`,
      },
      body,
    };
  }
  return {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.geminiApiKey ?? ""}`,
    },
    body: {
      model: env.geminiModel ?? AI_DOOR_PROVIDER_MODELS.gemini.fallback,
      max_tokens: 1_024,
      messages: [{ role: "user", content: aiDoorUserContent(text, dataUrl) }],
    },
  };
}

/** Read a provider response into the description text, or null when it said nothing. */
export function aiDoorDescriptionFromResponse(model: AiDoorModel, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  if (model === "claude") {
    const text = textOfContent(body.content).trim();
    return text ? text.slice(0, AI_DOOR_DESCRIPTION_MAX_CHARS) : null;
  }
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const text = textOfContent(message?.content).trim();
  return text ? text.slice(0, AI_DOOR_DESCRIPTION_MAX_CHARS) : null;
}

function failureCodeForStatus(status: number): "rate-limited" | "timeout" | "provider-error" {
  if (status === 429) return "rate-limited";
  if (status === 408 || status === 504) return "timeout";
  return "provider-error";
}

/**
 * Ask one model to describe the door, then draw it.
 *
 * Always resolves to a `AiDoorDescribeResult`, never throws, so the column always
 * has something plain to show.
 *
 * The description step and the image step are separate on purpose. If the drawing
 * fails, the description the model wrote is still returned with a plain sentence
 * about the picture, so the operator does not lose the model's reading of the door.
 * A failed provider call that produced neither is logged with the status and the
 * provider's own error body, so the reason is visible in the server log instead of
 * collapsing into one generic sentence.
 *
 * `fetchImpl`, `env`, `loadPhoto` and `paintImage` are injectable so a test can
 * exercise every branch without a network call or a real key.
 */
export async function describeDoorWithAi(args: {
  model: AiDoorModel;
  prompt: string;
  image?: AiDoorDescribeImage | null;
  doorName?: string | null;
  finish?: string | null;
  colorDescription?: string | null;
  env?: ProviderEnv;
  fetchImpl?: typeof fetch;
  loadPhoto?: (image: AiDoorDescribeImage | null | undefined) => Promise<string | null>;
  paintImage?: (input: DoorImageInput) => Promise<DoorImageResult>;
}): Promise<AiDoorDescribeResult> {
  const env = args.env ?? providerEnv();
  const { model } = args;
  const plan = AI_DOOR_IMAGE_PLANS[model];

  // A column is connected when the provider that writes its text is connected.
  // Claude's picture comes from Gemini, and that is checked below so a Claude
  // column whose text arrived can still say why it has no picture.
  if (!aiDoorModelConnected(model, env)) return aiDoorNotConnected(model);

  const prompt = args.prompt.trim();
  if (!prompt) {
    return { status: "error", model, code: "provider-error", message: AI_DOOR_GENERATE_FAILED_MESSAGE };
  }
  if (prompt.length > AI_DOOR_PROMPT_MAX_CHARS) {
    return {
      status: "error",
      model,
      code: "provider-error",
      message: `That prompt is too long to send. Keep it under ${AI_DOOR_PROMPT_MAX_CHARS} characters.`,
    };
  }

  const photo = await (args.loadPhoto ?? loadDoorPhotoDataUrl)(args.image ?? null);
  const request = aiDoorProviderRequest({ model, prompt, photoDataUrl: photo, image: args.image ?? null, env });
  const fetchImpl = args.fetchImpl ?? globalThis.fetch;

  let description: string | null = null;
  let providerModel: string | null = null;
  let textFailure: AiDoorDescribeResult | null = null;

  try {
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const reason = failureCodeForStatus(response.status);
      const detail = await response.text().catch(() => "");
      console.error(
        `[ai-door-describe] ${model} ${response.status} ${response.statusText} (model ${String(request.body.model)}): ${redactForLog(detail)}`,
      );
      textFailure = { status: "error", model, code: reason, message: aiDoorFailureMessage(model, reason) };
    } else {
      const payload = await response.json();
      description = aiDoorDescriptionFromResponse(model, payload);
      providerModel = providerModelOf(model, request.body);
      if (!description) {
        console.error(`[ai-door-describe] ${model} returned no text (model ${String(request.body.model)})`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ai-door-describe] ${model} call failed: ${message}`);
    const timedOut = /timeout|abort/i.test(message);
    const code = timedOut ? "timeout" : "provider-error";
    textFailure = { status: "error", model, code, message: aiDoorFailureMessage(model, code) };
  }

  // The picture. Claude's column is drawn from its description by the Gemini image
  // model, because Anthropic returns text only; see shared/aiDoorImage.ts.
  const paint = args.paintImage ?? paintDoorImage;
  let image: DoorImageResult | null = null;
  let imageMessage: string | null = null;
  try {
    image = await paint({
      painter: plan.painter,
      description: description ?? prompt,
      photoDataUrl: photo,
      doorName: args.doorName ?? null,
      finish: args.finish ?? null,
      colorDescription: args.colorDescription ?? null,
      env: { openaiApiKey: env.openaiApiKey, geminiApiKey: env.geminiApiKey },
      fetchImpl,
    });
  } catch (error) {
    console.error(`[ai-door-image] ${plan.painter} threw: ${error instanceof Error ? error.message : String(error)}`);
    image = null;
  }
  if (image && image.status === "error") {
    imageMessage = image.message;
    image = null;
  }

  if (!description) {
    if (textFailure) return textFailure;
    return {
      status: "error",
      model,
      code: "provider-error",
      message: `${modelLabel(model)} answered with nothing. Try Generate again.`,
    };
  }

  // A description with no picture is the old, weaker outcome. Say so, and still
  // hand back the text so the operator keeps what the model read from the door.
  if (!image) {
    console.error(`[ai-door-describe] ${model} produced a description but ${plan.painter} produced no image: ${imageMessage ?? "unknown"}`);
  }

  return {
    status: "ok",
    model,
    description,
    providerModel,
    image: image
      ? {
        url: image.url,
        painter: image.painter,
        providerModel: image.providerModel,
        fromDescription: plan.writer,
      }
      : null,
    imageMessage: image ? null : imageMessage ?? AI_DOOR_IMAGE_FAILED_MESSAGE,
  };
}

/** Keep a provider error loggable without ever echoing a credential back. */
function redactForLog(body: string): string {
  return body
    .replace(/\s+/g, " ")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{8,}/g, "AIza[redacted]")
    .trim()
    .slice(0, 400);
}

function providerModelOf(model: AiDoorModel, body: Record<string, unknown>): string | null {
  const value = body.model;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

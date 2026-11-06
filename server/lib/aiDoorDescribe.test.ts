/**
 * Generate: one provider call per column, keys server-side only.
 *
 * What must hold:
 * - a missing key answers `not-connected` with the plain sentence the column shows;
 * - a set key sends the column's own prompt to that column's provider;
 * - the returned text is read out of each provider's own response shape;
 * - a provider failure becomes a plain sentence, never a provider payload;
 * - the three column prompts come from the shared constant the UI shows.
 */
import { describe, expect, it, vi } from "vitest";
import {
  AI_DOOR_DESCRIPTION_MAX_CHARS,
  AI_DOOR_PROMPT_MAX_CHARS,
  aiDoorDescriptionFromResponse,
  aiDoorModelConnected,
  aiDoorProviderRequest,
  aiDoorUserContent,
  aiDoorProviderRequest,
  AI_DOOR_PROVIDER_MODELS,
  describeDoorWithAi,
  isKnownAnthropicModel,
  loadDoorPhotoDataUrl,
} from "./aiDoorDescribe";
import { AI_DOOR_MODELS, AI_DOOR_PROMPTS } from "../../shared/aiDoorPrompts";
import {
  AI_DOOR_DESCRIBE_PROCEDURE,
  AI_DOOR_MODEL_ENV_KEYS,
  AI_DOOR_NOT_CONNECTED_MESSAGE,
} from "../../shared/aiDoorDescribe";

const FULL_ENV = {
  openaiApiKey: "sk-test-openai",
  anthropicApiKey: "sk-test-anthropic",
  geminiApiKey: "test-gemini",
  openaiModel: "gpt-test",
  anthropicModel: "claude-test",
  geminiModel: "gemini-test",
};

/** A drawing step that always succeeds, so a test can assert the text call alone. */
const PAINT_OK = async () => ({
  status: "ok" as const,
  url: "/manus-storage/door-style-images/ai-generated/test.png",
  painter: "openai" as const,
  providerModel: "gpt-image-2",
});

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

describe("which columns are connected", () => {
  it("is decided by each column's own key", () => {
    expect(aiDoorModelConnected("gpt", { openaiApiKey: "x" })).toBe(true);
    expect(aiDoorModelConnected("gpt", { anthropicApiKey: "x", geminiApiKey: "y" })).toBe(false);
    expect(aiDoorModelConnected("claude", { anthropicApiKey: "x" })).toBe(true);
    expect(aiDoorModelConnected("gemini", { geminiApiKey: "x" })).toBe(true);
  });

  it("names the variable each column reads", () => {
    expect(AI_DOOR_MODEL_ENV_KEYS).toEqual({
      gpt: "OPENAI_API_KEY",
      claude: "ANTHROPIC_API_KEY",
      gemini: "GEMINI_API_KEY",
    });
  });

  it("answers not-connected, with the plain sentence, instead of calling out", async () => {
    const fetchImpl = vi.fn();
    const result = await describeDoorWithAi({
      model: "claude",
      prompt: AI_DOOR_PROMPTS.claude,
      env: { openaiApiKey: "only-gpt" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      status: "not-connected",
      model: "claude",
      message: AI_DOOR_NOT_CONNECTED_MESSAGE.claude,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    // The sentence Tom asked for, in plain words.
    expect(AI_DOOR_NOT_CONNECTED_MESSAGE.claude).toContain("Claude isn't connected yet");
  });
});

describe("each column calls its own provider with its own prompt", () => {
  it("sends GPT's prompt to OpenAI", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return okResponse({ choices: [{ message: { content: "Style family: shaker." } }] });
    });
    const result = await describeDoorWithAi({
      model: "gpt",
      prompt: AI_DOOR_PROMPTS.gpt,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
      paintImage: PAINT_OK,
    });
    expect(seen!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(new Headers(seen!.init.headers).get("authorization")).toBe("Bearer sk-test-openai");
    const body = JSON.parse(String(seen!.init.body)) as { model: string; messages: { content: { text?: string }[] }[] };
    expect(body.model).toBe("gpt-test");
    expect(body.messages[0]!.content[0]!.text).toBe(AI_DOOR_PROMPTS.gpt);
    expect(result).toMatchObject({
      status: "ok",
      model: "gpt",
      description: "Style family: shaker.",
      providerModel: "gpt-test",
      // The picture is always drawn from this column's own description.
      image: { painter: "openai", fromDescription: "gpt" },
    });
  });

  it("sends Claude's prompt to Anthropic's Messages API", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return okResponse({ content: [{ type: "text", text: "Style family: raised panel." }] });
    });
    const result = await describeDoorWithAi({
      model: "claude",
      prompt: AI_DOOR_PROMPTS.claude,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
      paintImage: PAINT_OK,
    });
    expect(seen!.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers(seen!.init.headers);
    expect(headers.get("x-api-key")).toBe("sk-test-anthropic");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse(String(seen!.init.body)) as { model: string; messages: { content: { type: string; text?: string }[] }[] };
    expect(body.model).toBe("claude-test");
    expect(body.messages[0]!.content[0]).toEqual({ type: "text", text: AI_DOOR_PROMPTS.claude });
    expect(result).toMatchObject({ status: "ok", description: "Style family: raised panel." });
  });

  it("sends Gemini's prompt through the OpenAI-compatible endpoint with the Gemini key", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return okResponse({ choices: [{ message: { content: "Style: shaker." } }] });
    });
    await describeDoorWithAi({
      model: "gemini",
      prompt: AI_DOOR_PROMPTS.gemini,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
      paintImage: PAINT_OK,
    });
    expect(seen!.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(new Headers(seen!.init.headers).get("authorization")).toBe("Bearer test-gemini");
    const body = JSON.parse(String(seen!.init.body)) as { model: string };
    expect(body.model).toBe("gemini-test");
  });

  it("only ever accepts the three known models", () => {
    expect(AI_DOOR_MODELS).toEqual(["gpt", "claude", "gemini"]);
  });

  it("pins the procedure path the client calls", () => {
    expect(AI_DOOR_DESCRIBE_PROCEDURE).toBe("aiDoorDescription.describeWithAi");
  });
});

describe("the door photo rides along when the prompt is image-based", () => {
  it("adds the photo to the GPT content when one is available", () => {
    const content = aiDoorUserContent("describe this", "data:image/jpeg;base64,AAAA");
    expect(content).toHaveLength(2);
    expect(content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA", detail: "high" } });
  });

  it("asks for 'not visible' instead of guessing when there is no photo", () => {
    const content = aiDoorUserContent("describe this", null);
    expect(content).toHaveLength(2);
    const last = content[1] as { type: string; text: string };
    expect(last.type).toBe("text");
    expect(last.text).toContain("not visible");
  });

  it("sends an Anthropic image block rather than an image_url", () => {
    const request = aiDoorProviderRequest({
      model: "claude",
      prompt: "describe this",
      photoDataUrl: "data:image/png;base64,BBBB",
      image: { url: "/manus-storage/door.png" },
      env: FULL_ENV,
    });
    const messages = request.body.messages as { content: { type: string; source?: { media_type: string; data: string } }[] }[];
    const image = messages[0]!.content.find((part) => part.type === "image");
    expect(image?.source).toEqual({ type: "base64", media_type: "image/png", data: "BBBB" });
  });

  it("reads a stored door photo through the service-role storage helper", async () => {
    const fetchObject = vi.fn(async () => new Response(Buffer.from([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    }));
    const dataUrl = await loadDoorPhotoDataUrl({ url: "/manus-storage/door-styles/sample.jpg" }, fetchObject as never, vi.fn() as never);
    expect(fetchObject).toHaveBeenCalledWith("door-styles/sample.jpg");
    expect(dataUrl).toBe("data:image/jpeg;base64,AQID");
  });

  it("keeps an inline data URL as it is", async () => {
    const dataUrl = "data:image/png;base64,CCCC";
    expect(await loadDoorPhotoDataUrl({ url: dataUrl }, vi.fn() as never, vi.fn() as never)).toBe(dataUrl);
  });

  it("falls back to no photo when the stored file cannot be read", async () => {
    const fetchObject = vi.fn(async () => new Response("", { status: 404 }));
    expect(await loadDoorPhotoDataUrl({ url: "/manus-storage/missing.jpg" }, fetchObject as never, vi.fn() as never)).toBeNull();
    expect(await loadDoorPhotoDataUrl(null, fetchObject as never, vi.fn() as never)).toBeNull();
  });
});

describe("a failure becomes a plain sentence", () => {
  it("reports a rate limit as busy, not as a provider payload", async () => {
    const fetchImpl = vi.fn(async () => new Response("{\"error\":\"slow down\"}", { status: 429 }));
    const result = await describeDoorWithAi({
      model: "gpt",
      prompt: AI_DOOR_PROMPTS.gpt,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
    });
    expect(result).toMatchObject({ status: "error", code: "rate-limited" });
    if (result.status === "error") {
      expect(result.message).toContain("GPT is busy");
      expect(result.message).not.toContain("slow down");
    }
  });

  it("reports a network failure without throwing", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("socket hang up"); });
    const result = await describeDoorWithAi({
      model: "claude",
      prompt: AI_DOOR_PROMPTS.claude,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
    });
    expect(result).toMatchObject({ status: "error", code: "provider-error" });
  });

  it("reports an empty answer rather than pasting nothing", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ choices: [{ message: { content: "   " } }] }));
    const result = await describeDoorWithAi({
      model: "gemini",
      prompt: AI_DOOR_PROMPTS.gemini,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
    });
    expect(result).toMatchObject({ status: "error" });
    if (result.status === "error") expect(result.message).toContain("answered with nothing");
  });

  it("refuses an over-long prompt instead of forwarding it", async () => {
    const fetchImpl = vi.fn();
    const result = await describeDoorWithAi({
      model: "gpt",
      prompt: "x".repeat(AI_DOOR_PROMPT_MAX_CHARS + 1),
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
    });
    expect(result).toMatchObject({ status: "error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caps a runaway description", () => {
    const description = aiDoorDescriptionFromResponse("gpt", {
      choices: [{ message: { content: "a".repeat(AI_DOOR_DESCRIPTION_MAX_CHARS + 500) } }],
    });
    expect(description).toHaveLength(AI_DOOR_DESCRIPTION_MAX_CHARS);
  });
});

describe("the picture each column gets", () => {
  it("draws GPT's and Gemini's pictures with their own provider", async () => {
    const seen: Array<{ painter: string }> = [];
    const paint = async (input: { painter: "openai" | "gemini" }) => {
      seen.push({ painter: input.painter });
      return {
        status: "ok" as const,
        url: "/manus-storage/door-style-images/ai-generated/x.png",
        painter: input.painter,
        providerModel: "m",
      };
    };
    const fetchImpl = vi.fn(async () => okResponse({ choices: [{ message: { content: "Shaker door." } }] }));

    const gpt = await describeDoorWithAi({
      model: "gpt",
      prompt: AI_DOOR_PROMPTS.gpt,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => "data:image/jpeg;base64,AAAA",
      paintImage: paint,
    });
    const gemini = await describeDoorWithAi({
      model: "gemini",
      prompt: AI_DOOR_PROMPTS.gemini,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => "data:image/jpeg;base64,AAAA",
      paintImage: paint,
    });

    expect(seen.map((entry) => entry.painter)).toEqual(["openai", "gemini"]);
    expect(gpt).toMatchObject({ status: "ok", image: { painter: "openai", fromDescription: "gpt" } });
    expect(gemini).toMatchObject({ status: "ok", image: { painter: "gemini", fromDescription: "gemini" } });
  });

  it("draws Claude's picture with the Gemini image model, and records that", async () => {
    let paintedFrom = "";
    const fetchImpl = vi.fn(async () => okResponse({ content: [{ type: "text", text: "Shaker door, flat panel." }] }));
    const result = await describeDoorWithAi({
      model: "claude",
      prompt: AI_DOOR_PROMPTS.claude,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
      paintImage: async (input) => {
        paintedFrom = input.description;
        return {
          status: "ok" as const,
          url: "/manus-storage/door-style-images/ai-generated/claude-gemini.png",
          painter: "gemini" as const,
          providerModel: "gemini-3.1-flash-image",
        };
      },
    });
    // Claude's text is the brief; Gemini draws.
    expect(paintedFrom).toBe("Shaker door, flat panel.");
    expect(result).toMatchObject({
      status: "ok",
      image: { painter: "gemini", fromDescription: "claude", providerModel: "gemini-3.1-flash-image" },
    });
  });

  it("keeps the description and explains a failed picture", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => okResponse({ choices: [{ message: { content: "Shaker door." } }] }));
    const result = await describeDoorWithAi({
      model: "gpt",
      prompt: AI_DOOR_PROMPTS.gpt,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
      paintImage: async () => ({
        status: "error" as const,
        painter: "openai" as const,
        message: "OpenAI's image model could not draw this door. Try Generate again.",
      }),
    });
    expect(result).toMatchObject({ status: "ok", description: "Shaker door.", image: null });
    if (result.status === "ok") {
      expect(result.imageMessage).toContain("could not draw this door");
    }
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain("produced a description but openai produced no image");
    error.mockRestore();
  });

  it("does not throw when the drawing step throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => okResponse({ choices: [{ message: { content: "Shaker door." } }] }));
    const result = await describeDoorWithAi({
      model: "gpt",
      prompt: AI_DOOR_PROMPTS.gpt,
      env: FULL_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadPhoto: async () => null,
      paintImage: async () => { throw new Error("boom"); },
    });
    expect(result).toMatchObject({ status: "ok", description: "Shaker door.", image: null });
    error.mockRestore();
  });
});

describe("the provider request shapes that were failing", () => {
  const base = { prompt: "describe", photoDataUrl: null, image: null, env: FULL_ENV };

  it("uses max_tokens for a chat model and max_completion_tokens only for a reasoning model", () => {
    const chat = aiDoorProviderRequest({ ...base, model: "gpt", env: { ...FULL_ENV, openaiModel: "gpt-4.1-mini" } });
    expect(chat.body).toHaveProperty("max_tokens", 1_024);
    expect(chat.body).not.toHaveProperty("max_completion_tokens");

    const reasoning = aiDoorProviderRequest({ ...base, model: "gpt", env: { ...FULL_ENV, openaiModel: "gpt-5" } });
    expect(reasoning.body).toHaveProperty("max_completion_tokens", 1_024);
    expect(reasoning.body).not.toHaveProperty("max_tokens");
  });

  it("defaults Claude to a current Sonnet-class model", () => {
    // claude-sonnet-4-5 is deprecated (retires 2026-11-30); sonnet-5-5 is Active.
    expect(AI_DOOR_PROVIDER_MODELS.claude.fallback).toBe("claude-sonnet-5-5");
    expect(isKnownAnthropicModel(AI_DOOR_PROVIDER_MODELS.claude.fallback)).toBe(true);
  });

  it("leaves room for adaptive thinking, which counts against max_tokens", () => {
    const request = aiDoorProviderRequest({ ...base, model: "claude" });
    // A budget sized for the answer alone can be spent entirely on thinking.
    expect(request.body.max_tokens).toBeGreaterThanOrEqual(4_096);
    // `low` effort is enough to read a photograph and write ten lines.
    expect(request.body.output_config).toEqual({ effort: "low" });
  });
});

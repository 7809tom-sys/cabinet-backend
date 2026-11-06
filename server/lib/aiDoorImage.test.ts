/**
 * Drawing the door: the picture half of Generate.
 *
 * What must hold:
 * - the picture is drawn by the provider that can draw it, not by whichever
 *   provider wrote the text;
 * - OpenAI is asked to *edit* the door photo when there is one, so the result
 *   keeps the real door rather than inventing one;
 * - a provider failure is logged with its status and body, and returns one plain
 *   sentence — never the payload;
 * - the image always goes through storage and comes back as a served URL.
 */
import { describe, expect, it, vi } from "vitest";
import {
  AI_DOOR_GEMINI_IMAGE_MODEL,
  AI_DOOR_OPENAI_IMAGE_MODEL,
  doorImagePrompt,
  geminiFailureSentence,
  imageBytesFromGemini,
  imageBytesFromOpenAI,
  openAiFailureSentence,
  paintDoorImage,
} from "./aiDoorImage";

vi.mock("../storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `/manus-storage/${key}` })),
}));

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function openAiOk(): Response {
  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: ONE_PIXEL_PNG }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function geminiOk(): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: ONE_PIXEL_PNG } }] } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

const ENV = { openaiApiKey: "sk-test-openai", geminiApiKey: "test-gemini" };

describe("the brief handed to the image model", () => {
  it("names the door, states the finish and color, and forbids a room around it", () => {
    const prompt = doorImagePrompt({
      description: "Shaker door, flat panel, painted warm ivory.",
      doorName: "Classic Cream",
      finish: "Painted",
      colorDescription: "warm ivory, soft matte",
      hasPhoto: true,
    });
    expect(prompt).toContain("single cabinet door front");
    expect(prompt).toContain("Classic Cream");
    expect(prompt).toContain("Finish: Painted.");
    expect(prompt).toContain("Color and sheen: warm ivory, soft matte.");
    expect(prompt).toContain("authoritative reference");
    expect(prompt).toContain("No kitchen, no cabinets around it");
    expect(prompt).toContain("Shaker door, flat panel, painted warm ivory.");
  });

  it("tells the model not to invent an ornate door when there is no photo", () => {
    const prompt = doorImagePrompt({ description: "Slab front, gloss.", hasPhoto: false });
    expect(prompt).toContain("There is no photograph");
    expect(prompt).toContain("rather than inventing an ornate one");
    expect(prompt).not.toContain("authoritative reference");
  });
});

describe("OpenAI draws GPT's door", () => {
  it("edits the door photo when there is one, so the real door is kept", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return openAiOk();
    });

    const result = await paintDoorImage({
      painter: "openai",
      description: "Shaker door, flat panel.",
      photoDataUrl: "data:image/jpeg;base64,AAAA",
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(seen!.url).toBe("https://api.openai.com/v1/images/edits");
    // A multipart edit, not a JSON body: the photo travels with the brief.
    expect(seen!.init.body).toBeInstanceOf(FormData);
    expect(new Headers(seen!.init.headers).get("authorization")).toBe("Bearer sk-test-openai");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.painter).toBe("openai");
      expect(result.url.startsWith("/manus-storage/door-style-images/")).toBe(true);
    }
  });

  it("falls back to text-to-image when the style has no photo", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return openAiOk();
    });
    await paintDoorImage({
      painter: "openai",
      description: "Shaker door.",
      photoDataUrl: null,
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(seen!.url).toBe("https://api.openai.com/v1/images/generations");
    const body = JSON.parse(String(seen!.init.body)) as { model: string };
    expect(body.model).toBe(AI_DOOR_OPENAI_IMAGE_MODEL);
  });

  it("logs the provider status and body, and returns one plain sentence", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: "model gpt-image-2 does not exist" } }),
      { status: 404 },
    ));
    const result = await paintDoorImage({
      painter: "openai",
      description: "Shaker door.",
      photoDataUrl: null,
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("rejected this request");
      expect(result.message).not.toContain("does not exist");
    }
    const logged = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("[ai-door-image] openai 404");
    expect(logged).toContain("does not exist");
    error.mockRestore();
  });

  it("says so when the key is missing, without calling out", async () => {
    const fetchImpl = vi.fn();
    const result = await paintDoorImage({
      painter: "openai",
      description: "Shaker door.",
      photoDataUrl: null,
      env: { geminiApiKey: "only-gemini" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("error");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Gemini draws Gemini's and Claude's doors", () => {
  it("asks the Gemini image model for an image and sends the photo inline", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return geminiOk();
    });
    const result = await paintDoorImage({
      painter: "gemini",
      description: "Raised panel, bevel edge.",
      photoDataUrl: "data:image/png;base64,BBBB",
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(seen!.url).toContain(`/models/${AI_DOOR_GEMINI_IMAGE_MODEL}:generateContent`);
    expect(new Headers(seen!.init.headers).get("x-goog-api-key")).toBe("test-gemini");
    const body = JSON.parse(String(seen!.init.body)) as {
      contents: { parts: Record<string, unknown>[] }[];
      generationConfig: { responseModalities: string[] };
    };
    expect(body.generationConfig.responseModalities).toEqual(["IMAGE"]);
    expect(body.contents[0]!.parts[1]).toEqual({ inlineData: { mimeType: "image/png", data: "BBBB" } });
    expect(result.status).toBe("ok");
  });

  it("returns a plain sentence for a rejected request and logs the payload", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: "image generation is not enabled for this key" } }),
      { status: 403 },
    ));
    const result = await paintDoorImage({
      painter: "gemini",
      description: "Raised panel.",
      photoDataUrl: null,
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toContain("may not have image access");
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain("[ai-door-image] gemini 403");
    error.mockRestore();
  });

  it("reports a 200 that carried no image rather than storing nothing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }),
      { status: 200 },
    ));
    const result = await paintDoorImage({
      painter: "gemini",
      description: "Raised panel.",
      photoDataUrl: null,
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toContain("returned no image");
    error.mockRestore();
  });
});

describe("reading each provider's response", () => {
  it("reads OpenAI's base64 image", () => {
    const image = imageBytesFromOpenAI({ data: [{ b64_json: ONE_PIXEL_PNG }] });
    expect(image).not.toBeNull();
    expect(image!.mime).toBe("image/png");
    expect(image!.bytes.length).toBeGreaterThan(0);
  });

  it("reads Gemini's inline image", () => {
    const image = imageBytesFromGemini({
      candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/jpeg", data: ONE_PIXEL_PNG } }] } }],
    });
    expect(image).not.toBeNull();
    expect(image!.mime).toBe("image/jpeg");
  });

  it("returns nothing when the response holds no image", () => {
    expect(imageBytesFromOpenAI({ data: [] })).toBeNull();
    expect(imageBytesFromOpenAI(null)).toBeNull();
    expect(imageBytesFromGemini({ candidates: [] })).toBeNull();
    expect(imageBytesFromGemini("nope")).toBeNull();
  });
});

describe("failure sentences name the fix", () => {
  it("distinguishes a key that cannot draw from a busy model", () => {
    expect(openAiFailureSentence(401)).toContain("OPENAI_API_KEY");
    expect(openAiFailureSentence(429)).toContain("busy");
    expect(geminiFailureSentence(403)).toContain("GEMINI_API_KEY");
    expect(geminiFailureSentence(429)).toContain("busy");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { GEMINI_IMAGE_TEST_TIMEOUT_MS, GEMINI_NANO_BANANA_MODEL, generateGeminiExactPlanTest, pollGeminiExactPlanTest, startGeminiExactPlanTest, verifyGeminiImageAccess } from "./geminiImageProvider";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("Gemini Nano Banana provider status", () => {
  it("recognizes an accessible Nano Banana image model using a server-only models request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [{ name: `models/${GEMINI_NANO_BANANA_MODEL}`, supportedGenerationMethods: ["generateContent"] }],
    }), { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await verifyGeminiImageAccess();

    expect(result).toEqual({ connected: true, modelAvailable: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models",
      expect.objectContaining({ headers: expect.objectContaining({ "x-goog-api-key": expect.any(String) }) }),
    );
  });

  it("returns a safe unavailable status for rejected or unavailable account access", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;
    await expect(verifyGeminiImageAccess()).resolves.toEqual({ connected: false, modelAvailable: false });
  });

  it("submits a locked JPEG reference only through the server and returns decoded image bytes", async () => {
    const encoded = Buffer.from("generated-google-image").toString("base64");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { data: encoded, mimeType: "image/jpeg" } }] } }],
    }), { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await generateGeminiExactPlanTest({
      prompt: "Keep the exact locked plan.",
      sourceImageBase64: "locked-jpeg-reference",
      sourceMimeType: "image/jpeg",
    });

    expect(result).toMatchObject({ mimeType: "image/jpeg" });
    expect(result.bytes.toString()).toBe("generated-google-image");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-goog-api-key": expect.any(String) }),
        signal: expect.any(AbortSignal),
        body: expect.stringContaining('"responseModalities":["IMAGE"]'),
      }),
    );
    expect(GEMINI_IMAGE_TEST_TIMEOUT_MS).toBe(90_000);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    const text = body.contents[0].parts.filter((part: { text?: string }) => part.text).map((part: { text: string }) => part.text).join("\n");
    expect(text).toContain("must NEVER add extra cabinets");
    expect(text).toContain("Preserve the reference's cabinetry pixel-faithfully, in the same positions.");
    expect(text.indexOf("must NEVER add extra cabinets")).toBeLessThan(text.indexOf("Keep the exact locked plan."));
  });

  it("accepts the official generateContent image output without returning the provider response", async () => {
    const encoded = Buffer.from("nested-google-image").toString("base64");
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { data: encoded, mimeType: "image/png" } }] } }],
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await generateGeminiExactPlanTest({
      prompt: "Keep the exact locked plan.",
      sourceImageBase64: "locked-jpeg-reference",
      sourceMimeType: "image/jpeg",
    });

    expect(result).toMatchObject({ mimeType: "image/png" });
    expect(result.bytes.toString()).toBe("nested-google-image");
  });

  it("rejects a provider response that has no usable image without returning provider payload details", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_image: {} }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateGeminiExactPlanTest({
      prompt: "Keep the exact locked plan.",
      sourceImageBase64: "locked-jpeg-reference",
      sourceMimeType: "image/jpeg",
    })).rejects.toThrow("did not return an image");
  });

  it("returns a clear retry message for a rate-limited or failed interaction without exposing provider payloads", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "failed",
      errors: [{ code: "RESOURCE_EXHAUSTED" }],
    }), { status: 429 })) as unknown as typeof fetch;

    await expect(generateGeminiExactPlanTest({
      prompt: "Keep the exact locked plan.",
      sourceImageBase64: "locked-jpeg-reference",
      sourceMimeType: "image/jpeg",
    })).rejects.toThrow("temporarily rate-limited");
  });

  it("returns a clear retry message when the provider request exceeds the bounded test timeout", async () => {
    const timeoutError = new Error("timed out");
    timeoutError.name = "TimeoutError";
    global.fetch = vi.fn().mockRejectedValue(timeoutError) as unknown as typeof fetch;

    await expect(generateGeminiExactPlanTest({
      prompt: "Keep the exact locked plan.",
      sourceImageBase64: "locked-jpeg-reference",
      sourceMimeType: "image/jpeg",
    })).rejects.toThrow("timed out before an image was returned");
  });

  it("starts a direct image interaction without returning provider image bytes to the browser-held request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "interaction_123", status: "in_progress" }), { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(startGeminiExactPlanTest({
      prompt: "Keep the exact locked plan.",
      sourceImageBase64: "locked-jpeg-reference",
      sourceMimeType: "image/jpeg",
    })).resolves.toEqual({ interactionId: "interaction_123" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      expect.objectContaining({ body: expect.not.stringContaining('"background":true') }),
    );
  });

  it("retrieves a completed background interaction through a short status call", async () => {
    const encoded = Buffer.from("completed-background-image").toString("base64");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "image", data: encoded, mime_type: "image/jpeg" }] }],
    }), { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await pollGeminiExactPlanTest("interaction_123");

    expect(result).toMatchObject({ status: "completed", image: { mimeType: "image/jpeg" } });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/interactions/interaction_123",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

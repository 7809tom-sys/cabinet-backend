import { afterEach, describe, expect, it, vi } from "vitest";
import { GEMINI_NANO_BANANA_MODEL, generateGeminiExactPlanTest, verifyGeminiImageAccess } from "./geminiImageProvider";

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
      output_image: { data: encoded, mime_type: "image/jpeg" },
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
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-goog-api-key": expect.any(String) }),
        body: expect.stringContaining('"image_size":"2K"'),
      }),
    );
  });

  it("rejects a provider response that has no usable image without returning provider payload details", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_image: {} }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateGeminiExactPlanTest({
      prompt: "Keep the exact locked plan.",
      sourceImageBase64: "locked-jpeg-reference",
      sourceMimeType: "image/jpeg",
    })).rejects.toThrow("did not return an image");
  });
});

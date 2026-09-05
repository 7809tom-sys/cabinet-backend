import { describe, expect, it } from "vitest";

describe("Gemini Nano Banana image provider", () => {
  it("authenticates server-side and exposes an image-capable model without revealing the credential", async () => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    expect(apiKey).toBeTruthy();

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey! },
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const imageModel = payload.models?.find((model) =>
      /image/i.test(model.name ?? "") && model.supportedGenerationMethods?.includes("generateContent"),
    );

    expect(imageModel?.name).toBeTruthy();
  }, 20_000);
});

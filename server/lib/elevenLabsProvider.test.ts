import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import { isElevenLabsConfigured, verifyElevenLabsConnection } from "./elevenLabsProvider";

const mutableEnv = ENV as { elevenLabsApiKey: string };
const originalKey = mutableEnv.elevenLabsApiKey;

describe("ElevenLabs connection verification", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    mutableEnv.elevenLabsApiKey = originalKey;
    vi.unstubAllGlobals();
  });

  it("reports an unconfigured provider without calling the network", async () => {
    mutableEnv.elevenLabsApiKey = "";
    expect(isElevenLabsConfigured()).toBe(false);
    await expect(verifyElevenLabsConnection()).resolves.toEqual({
      configured: false,
      connected: false,
      failureReason: "not-configured",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks only the documented user endpoint and returns no provider account payload", async () => {
    mutableEnv.elevenLabsApiKey = "elevenlabs-test-key";
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ user_id: "private-account", subscription: { tier: "creator" } }), { status: 200 }));

    await expect(verifyElevenLabsConnection()).resolves.toEqual({
      configured: true,
      connected: true,
      failureReason: null,
    });
    expect(fetch).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/user", expect.objectContaining({
      headers: { "xi-api-key": "elevenlabs-test-key" },
    }));
  });

  it("classifies rejected credentials without disclosing the API response", async () => {
    mutableEnv.elevenLabsApiKey = "invalid-test-key";
    vi.mocked(fetch).mockResolvedValue(new Response("provider detail that must not reach an admin browser", { status: 401 }));

    await expect(verifyElevenLabsConnection()).resolves.toEqual({
      configured: true,
      connected: false,
      failureReason: "authentication",
    });
  });
});

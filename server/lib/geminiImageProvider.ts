import { ENV } from "../_core/env";

export const GEMINI_NANO_BANANA_MODEL = "gemini-3.1-flash-image";

export function isGeminiImageConfigured() {
  return ENV.geminiApiKey.trim().length > 0;
}

/** Validates access without returning the key, account name, or provider payload. */
export async function verifyGeminiImageAccess(): Promise<{ connected: boolean; modelAvailable: boolean }> {
  if (!isGeminiImageConfigured()) return { connected: false, modelAvailable: false };
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": ENV.geminiApiKey },
    });
    if (!response.ok) return { connected: false, modelAvailable: false };
    const payload = await response.json() as { models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }> };
    const modelAvailable = payload.models?.some((model) =>
      model.name === `models/${GEMINI_NANO_BANANA_MODEL}`
      && Array.isArray(model.supportedGenerationMethods)
      && model.supportedGenerationMethods.includes("generateContent"),
    ) ?? false;
    return { connected: true, modelAvailable };
  } catch {
    return { connected: false, modelAvailable: false };
  }
}

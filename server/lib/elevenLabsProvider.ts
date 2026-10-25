import { ENV } from "../_core/env";

const ELEVENLABS_USER_URL = "https://api.elevenlabs.io/v1/user";

export type ElevenLabsConnectionStatus = {
  configured: boolean;
  connected: boolean;
  /** An operational category only; raw provider payload and account details stay server-side. */
  failureReason: "not-configured" | "authentication" | "unavailable" | null;
};

export function isElevenLabsConfigured() {
  return ENV.elevenLabsApiKey.trim().length > 0;
}

/**
 * Tests only the API credential's ability to reach ElevenLabs' documented user
 * endpoint. It deliberately discards the user, subscription, usage, and raw
 * provider response so no account information or API key can reach the browser.
 */
export async function verifyElevenLabsConnection(): Promise<ElevenLabsConnectionStatus> {
  if (!isElevenLabsConfigured()) {
    return { configured: false, connected: false, failureReason: "not-configured" };
  }

  try {
    const response = await fetch(ELEVENLABS_USER_URL, {
      headers: { "xi-api-key": ENV.elevenLabsApiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      return { configured: true, connected: true, failureReason: null };
    }
    return {
      configured: true,
      connected: false,
      failureReason: response.status === 401 || response.status === 403 ? "authentication" : "unavailable",
    };
  } catch {
    return { configured: true, connected: false, failureReason: "unavailable" };
  }
}

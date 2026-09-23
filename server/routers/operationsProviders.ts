import { adminProcedure, router } from "../_core/trpc";
import { isElevenLabsConfigured, verifyElevenLabsConnection } from "../lib/elevenLabsProvider";

export const operationsProvidersRouter = router({
  getElevenLabsStatus: adminProcedure.query(async () => {
    if (!isElevenLabsConfigured()) {
      return {
        configured: false,
        connected: false,
        failureReason: "not-configured" as const,
        provider: "ElevenLabs",
        purpose: "Voice narration, transcription, and customer-audio workflows",
        imageGenerationSupported: false,
      };
    }
    const status = await verifyElevenLabsConnection();
    return {
      ...status,
      provider: "ElevenLabs",
      purpose: "Voice narration, transcription, and customer-audio workflows",
      imageGenerationSupported: false,
    };
  }),

  testElevenLabsConnection: adminProcedure.mutation(async () => {
    const status = await verifyElevenLabsConnection();
    return {
      ...status,
      provider: "ElevenLabs",
      imageGenerationSupported: false,
      message: !status.configured
        ? "ElevenLabs is not configured. Add the server-only ELEVENLABS_API_KEY, then test again."
        : status.connected
          ? "ElevenLabs connection is available for approved audio workflows."
          : status.failureReason === "authentication"
            ? "ElevenLabs did not accept the server-side credential. Review the secure provider configuration."
            : "ElevenLabs could not be reached. Please try again shortly.",
    };
  }),
});

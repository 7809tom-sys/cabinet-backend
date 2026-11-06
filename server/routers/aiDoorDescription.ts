/**
 * Generate button for the door editor's AI description comparison.
 *
 * One procedure, `describeWithAi`. It takes the prompt a column already holds and
 * the door's sample photo, sends them to that column's provider, and returns the
 * description text. Provider keys never leave this server.
 *
 * The contract lives in `shared/aiDoorDescribe.ts` and the provider calls in
 * `server/lib/aiDoorDescribe.ts`; this file is only the tRPC boundary.
 *
 * It is admin-only because it is a door-editor tool, and the prompt is capped so
 * it cannot be used as a general-purpose model proxy.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { AI_DOOR_MODELS } from "../../shared/aiDoorPrompts";
import {
  AI_DOOR_DESCRIBE_PROCEDURE,
  AI_DOOR_MODEL_ENV_KEYS,
  type AiDoorDescribeResult,
} from "../../shared/aiDoorDescribe";
import {
  AI_DOOR_PROMPT_MAX_CHARS,
  aiDoorModelConnected,
  describeDoorWithAi,
} from "../lib/aiDoorDescribe";

const describeInput = z.object({
  model: z.enum(AI_DOOR_MODELS),
  prompt: z.string().min(1).max(AI_DOOR_PROMPT_MAX_CHARS),
  image: z.object({ url: z.string().min(1).max(4_000) }).nullable().optional(),
  doorName: z.string().max(300).nullable().optional(),
  styleId: z.number().int().positive().nullable().optional(),
  /** The editor's finish words, used only to brief the image model. */
  finish: z.string().max(200).nullable().optional(),
  /** The plain-text color description, used only to brief the image model. */
  colorDescription: z.string().max(600).nullable().optional(),
});

export const aiDoorDescriptionRouter = router({
  /**
   * Which columns have a key on this server, so an admin screen could say so
   * without a failed call. Reports booleans only, never a key or its length.
   */
  providerStatus: adminProcedure.query(() => {
    return {
      gpt: aiDoorModelConnected("gpt"),
      claude: aiDoorModelConnected("claude"),
      gemini: aiDoorModelConnected("gemini"),
      /** The variable each column reads, so the panel can name it. */
      keys: AI_DOOR_MODEL_ENV_KEYS,
    };
  }),

  /**
   * Describe the door with one model.
   *
   * A missing key answers `{ status: "not-connected" }` with the plain sentence
   * the column shows, so nothing has to be caught or guessed on the client.
   */
  describeWithAi: adminProcedure
    .input(describeInput)
    .mutation(async ({ input }): Promise<AiDoorDescribeResult> => {
      return describeDoorWithAi({
        model: input.model,
        prompt: input.prompt,
        image: input.image ?? null,
        doorName: input.doorName ?? null,
        finish: input.finish ?? null,
        colorDescription: input.colorDescription ?? null,
      });
    }),
});

/** The procedure path, re-exported so a test can pin it against the contract. */
export const AI_DOOR_DESCRIBE_PATH = AI_DOOR_DESCRIBE_PROCEDURE;

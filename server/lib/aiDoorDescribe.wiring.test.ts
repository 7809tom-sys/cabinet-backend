/**
 * The router is reachable at the path the door editor calls.
 *
 * The shared contract pins the procedure name; this file proves the backend's
 * `server/routers.ts` actually mounts it there, so the frontend cannot call a
 * path that silently does not exist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { describeMock, connectedMock } = vi.hoisted(() => ({
  describeMock: vi.fn(),
  connectedMock: vi.fn(() => false),
}));

vi.mock("./aiDoorDescribe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiDoorDescribe")>();
  return {
    ...actual,
    describeDoorWithAi: describeMock,
    aiDoorModelConnected: connectedMock,
  };
});

import { appRouter } from "../routers";
import { AI_DOOR_DESCRIBE_PROCEDURE, AI_DOOR_STATUS_PROCEDURE } from "../../shared/aiDoorDescribe";
import { AI_DOOR_PROMPTS } from "../../shared/aiDoorPrompts";
import { NOT_ADMIN_ERR_MSG } from "../../shared/const";

type Caller = ReturnType<typeof appRouter.createCaller>;
const admin = { id: 1, email: "admin@example.com", role: "admin" } as never;
const shopper = { id: 2, email: "person@example.com", role: "user" } as never;

function callerFor(user: unknown): Caller {
  return appRouter.createCaller({ user } as never);
}

describe("aiDoorDescription is mounted where the contract says", () => {
  beforeEach(() => {
    describeMock.mockReset();
  });

  it("exposes both procedures at their pinned paths", () => {
    const paths = Object.keys(appRouter._def.procedures);
    expect(paths).toContain(AI_DOOR_DESCRIBE_PROCEDURE);
    expect(paths).toContain(AI_DOOR_STATUS_PROCEDURE);
  });

  it("keeps the tool admin-only", async () => {
    await expect(
      callerFor(shopper).aiDoorDescription.describeWithAi({
        model: "gpt",
        prompt: AI_DOOR_PROMPTS.gpt,
      }),
    ).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(describeMock).not.toHaveBeenCalled();
  });

  it("passes the column's own prompt and photo to the generator", async () => {
    describeMock.mockResolvedValueOnce({
      status: "ok",
      model: "claude",
      description: "Style family: shaker.",
      providerModel: "claude-test",
    });
    const result = await callerFor(admin).aiDoorDescription.describeWithAi({
      model: "claude",
      prompt: AI_DOOR_PROMPTS.claude,
      image: { url: "/manus-storage/door-styles/sample.jpg" },
      doorName: "Ashford",
      styleId: 12,
    });
    expect(describeMock).toHaveBeenCalledWith({
      model: "claude",
      prompt: AI_DOOR_PROMPTS.claude,
      image: { url: "/manus-storage/door-styles/sample.jpg" },
    });
    expect(result).toMatchObject({ status: "ok", description: "Style family: shaker." });
  });

  it("answers not-connected as data, not an exception, when a key is missing", async () => {
    describeMock.mockResolvedValueOnce({
      status: "not-connected",
      model: "gemini",
      message: "Gemini isn't connected yet. Add GEMINI_API_KEY on the API server.",
    });
    const result = await callerFor(admin).aiDoorDescription.describeWithAi({
      model: "gemini",
      prompt: AI_DOOR_PROMPTS.gemini,
      image: null,
    });
    expect(result).toMatchObject({ status: "not-connected", model: "gemini" });
  });

  it("reports key presence as booleans only", async () => {
    const status = await callerFor(admin).aiDoorDescription.providerStatus();
    expect(status).toEqual({
      gpt: false,
      claude: false,
      gemini: false,
      keys: { gpt: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" },
    });
    expect(JSON.stringify(status)).not.toMatch(/sk-|key.*[A-Za-z0-9]{20}/);
  });

  it("rejects a model it does not know", async () => {
    await expect(
      callerFor(admin).aiDoorDescription.describeWithAi({
        model: "llama" as never,
        prompt: "describe this door",
      }),
    ).rejects.toThrow();
    expect(describeMock).not.toHaveBeenCalled();
  });

  it("rejects an over-long prompt at the boundary", async () => {
    await expect(
      callerFor(admin).aiDoorDescription.describeWithAi({
        model: "gpt",
        prompt: "x".repeat(6_001),
      }),
    ).rejects.toThrow();
  });
});

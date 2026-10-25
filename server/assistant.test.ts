import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

function publicCaller() {
  return appRouter.createCaller({ user: null } as any);
}

describe("assistant.chat", () => {
  it("rejects empty message list", async () => {
    const caller = publicCaller();
    await expect(caller.assistant.chat({ messages: [] })).rejects.toBeTruthy();
  });

  it("rejects an empty message body", async () => {
    const caller = publicCaller();
    await expect(
      caller.assistant.chat({ messages: [{ role: "user", content: "" }] }),
    ).rejects.toBeTruthy();
  });

  it("returns a non-empty reply for a cabinet question", async () => {
    const caller = publicCaller();
    const res = await caller.assistant.chat({
      messages: [{ role: "user", content: "What door styles do you offer?" }],
    });
    expect(typeof res.reply).toBe("string");
    expect(res.reply.length).toBeGreaterThan(0);
    // White-label guard: never name a real supplier brand.
    const lower = res.reply.toLowerCase();
    for (const brand of ["us cabinet depot", "clark & son", "skyline", "rta store"]) {
      expect(lower).not.toContain(brand);
    }
  }, 30000);
});

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

function publicCaller() {
  return appRouter.createCaller({ user: null } as any);
}

function authedCaller() {
  return appRouter.createCaller({
    user: { id: 1, role: "user", openId: "u1", name: "Test", email: "t@example.com" },
  } as any);
}

describe("ocr.extractFromImage", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = publicCaller();
    await expect(
      caller.ocr.extractFromImage({ imageDataUrl: "data:image/png;base64,AAAA" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects non-image / non-data URLs", async () => {
    const caller = authedCaller();
    await expect(
      caller.ocr.extractFromImage({ imageDataUrl: "https://example.com/x.png" }),
    ).rejects.toBeTruthy();
  });

  it("rejects empty input", async () => {
    const caller = authedCaller();
    await expect(
      caller.ocr.extractFromImage({ imageDataUrl: "" }),
    ).rejects.toBeTruthy();
  });
});

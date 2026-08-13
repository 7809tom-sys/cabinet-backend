import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const runLive = process.env.RUN_LIVE_PHOTO_TO_CART_TEST === "1";

describe.runIf(runLive)("Photo to Cart supplied handwritten list", () => {
  it("extracts and matches the handwritten cabinet codes and quantities", async () => {
    const image = readFileSync("/home/ubuntu/upload/20260812_214130.jpg");
    const caller = appRouter.createCaller({
      user: { id: 1, role: "user", openId: "photo-to-cart-test", name: "Photo Test", email: "photo-test@example.com" },
    } as any);

    const result = await caller.ocr.extractFromImage({
      imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
      filename: "handwritten-cabinet-order.jpg",
    });

    const matched = result.matches.filter((row) => row.matched);
    expect(matched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ masterCode: "B12", quantity: 3 }),
        expect.objectContaining({ masterCode: "B24", quantity: 4 }),
        expect.objectContaining({ masterCode: "SB-36", quantity: 2 }),
        expect.objectContaining({ masterCode: "W-21-42", quantity: 1 }),
      ]),
    );
  }, 60_000);
});

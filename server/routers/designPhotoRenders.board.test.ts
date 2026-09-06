import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { composeManualHandoffBoard } from "./designPhotoRenders";

describe("manual AI reference board", () => {
  it("creates one uploadable JPEG board around the locked kitchen image", async () => {
    const lockedPlan = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: "#d8e0e8" },
    }).jpeg().toBuffer();

    const board = await composeManualHandoffBoard(lockedPlan, []);
    const metadata = await sharp(board).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBeGreaterThanOrEqual(1080);
  });
});

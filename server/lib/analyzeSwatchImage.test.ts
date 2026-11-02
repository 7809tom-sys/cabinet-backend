import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { analyzeSwatchBuffer, publicSwatchUrl } from "./analyzeSwatchImage";

describe("analyzeSwatchBuffer", () => {
  it("reads a painted gray door photo and does not return the border", async () => {
    const width = 90;
    const height = 120;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const border = x < 8 || y < 8 || x >= width - 8 || y >= height - 8;
        const offset = (y * width + x) * 3;
        raw[offset] = border ? 237 : 90;
        raw[offset + 1] = border ? 237 : 92;
        raw[offset + 2] = border ? 237 : 94;
      }
    }
    const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
    const color = await analyzeSwatchBuffer(jpeg);
    expect(color?.finishCategory).toBe("paint");
    expect(color?.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(color!.hex).not.toBe("#ededed");
  });
});

describe("publicSwatchUrl", () => {
  it("allows a public https image and rejects local hosts", () => {
    expect(publicSwatchUrl("https://www.cabinetdealz.com/manus-storage/media-library/door.jpg")).toContain("cabinetdealz.com");
    expect(publicSwatchUrl("http://127.0.0.1/secret.jpg")).toBeNull();
    expect(publicSwatchUrl("file:///etc/passwd")).toBeNull();
    expect(publicSwatchUrl("https://169.254.169.254/latest")).toBeNull();
  });
});

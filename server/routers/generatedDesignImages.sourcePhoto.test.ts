import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/routers/generatedDesignImages.ts"), "utf8");

describe("generatedDesignImages source photo", () => {
  it("selects the stored Gemini sourceImageKey and returns a signed sourcePhotoUrl", () => {
    expect(source).toContain("sourceImageKey: designGeminiImageTestJobs.sourceImageKey");
    expect(source).toContain("storageGetSignedUrl");
    expect(source).toContain("sourcePhotoUrl:");
  });
});

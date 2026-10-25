import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const distributorPortal = readFileSync(new URL("./routers/distributorPortal.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("./routers/catalog.ts", import.meta.url), "utf8");

describe("door style thumbnail fallback", () => {
  it("assigns a newly uploaded door sample to an empty thumbnail slot", () => {
    expect(distributorPortal).toContain('if (input.imageType === "doorSample" && !style[0].thumbnailImageUrl) imagePatch.thumbnailImageUrl = url;');
  });

  it("preserves an existing custom thumbnail", () => {
    expect(distributorPortal).toContain("!style.thumbnailImageUrl && !fields.thumbnailImageUrl");
    expect(catalog).toContain("!currentImages[0]?.thumbnailImageUrl && !fields.thumbnailImageUrl");
  });

  it("backfills the existing catalog without replacing custom thumbnails", () => {
    expect(distributorPortal).toContain("doorSampleImageUrl: doorStyles.doorSampleImageUrl");
    expect(catalog).toContain("doorSampleImageUrl: doorStyles.doorSampleImageUrl");
  });
});

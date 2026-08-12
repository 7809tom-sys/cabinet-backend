import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("room-layout seed script safeguards", () => {
  it("requires an explicit real-catalog confirmation before writes", async () => {
    const source = await readFile(new URL("../scripts/seed-room-layout-presets.mjs", import.meta.url), "utf8");
    expect(source).toContain("--confirm-real-catalog-only");
    expect(source).toContain("ds.isPublished = TRUE");
    expect(source).toContain("ds.isAvailable = TRUE");
    expect(source).toContain("ds.status = 'approved'");
    expect(source).toContain("No data was written");
  });
});

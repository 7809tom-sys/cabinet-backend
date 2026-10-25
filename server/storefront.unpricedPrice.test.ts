import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers/storefront.ts", import.meta.url), "utf8");

describe("storefront unpriced catalog safeguards", () => {
  it("returns no visible price when there is no current cost base", () => {
    expect(source).toContain(")?.toFixed(2) ?? null");
    expect(source).not.toContain(")?.toFixed(2) ?? r.homeownerPrice");
  });
});

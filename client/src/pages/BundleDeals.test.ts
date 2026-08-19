import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bundleDealsSource = readFileSync(new URL("./BundleDeals.tsx", import.meta.url), "utf8");

describe("Bundle Deals card pricing", () => {
  it("does not render a recomputed live current total beside the verified saved package price", () => {
    expect(bundleDealsSource).not.toContain("bundle.homeownerPrice");
    expect(bundleDealsSource).not.toContain("Current pricing needs review");
    expect(bundleDealsSource).not.toMatch(/>Current</);
  });
});

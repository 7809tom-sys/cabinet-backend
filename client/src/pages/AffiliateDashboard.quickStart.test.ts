import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AffiliateDashboard.tsx", import.meta.url), "utf8");

describe("affiliate quick storefront setup", () => {
  it("puts identity, logo, contact, color preview, defaults, and one publish action before advanced settings", () => {
    expect(source).toContain('data-testid="affiliate-launch-setup"');
    expect(source).toContain("Business name");
    expect(source).toContain("Business email");
    expect(source).toContain("Business phone");
    expect(source).toContain("Address or service area");
    expect(source).toContain("Upload logo");
    expect(source).toContain("Mini homepage preview");
    expect(source).toContain("Launch with your defaults");
    expect(source).toContain("Publish storefront");
    expect(source).toContain("More storefront options");
  });

  it("provides the post-publish share, customer storefront, and customer Designer actions", () => {
    expect(source).toContain('data-testid="affiliate-publish-success"');
    expect(source).toContain("Copy link");
    expect(source).toContain("Open storefront");
    expect(source).toContain("Open Designer as a customer");
    expect(source).toContain("storefrontPayload(true)");
  });
});

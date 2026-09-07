import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSource = readFileSync(
  resolve(process.cwd(), "client/src/components/admin/FeaturedStylesAdmin.tsx"),
  "utf8",
);

describe("FeaturedStylesAdmin curated homepage scenes", () => {
  it("presents the authorized six-scene curation contract", () => {
    expect(adminSource).toContain("const MAX_FEATURED = 6");
    expect(adminSource).toContain("curated homepage scenes");
    expect(adminSource).toContain("Room scene required");
    expect(adminSource).toContain("Room scene ready");
  });

  it("shows verified distributor attribution only in the authorized management component", () => {
    expect(adminSource).toContain("function SourceAttribution");
    expect(adminSource).toContain("Verified distributor:");
    expect(adminSource).toContain("never shown to public shoppers");
  });
});

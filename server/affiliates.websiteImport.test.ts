import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers/affiliates.ts", import.meta.url), "utf8");

describe("affiliate website brand import contract", () => {
  it("keeps website extraction private until the affiliate explicitly applies selected details", () => {
    expect(source).toContain("importWebsiteBrand: partnerProcedure");
    expect(source).toContain("importAffiliateWebsiteDraft(input.websiteUrl)");
    expect(source).toContain("applyWebsiteBrandImport: partnerProcedure");
    expect(source).toContain("testimonialsPublished");
  });

  it("only exposes testimonials marked published in the public storefront projection", () => {
    expect(source).toContain("eq(affiliateTestimonials.isPublished, true)");
    expect(source).toContain("return { ...toPublicStorefront(a), testimonials }");
    expect(source).toContain("isPublished: true");
  });
});

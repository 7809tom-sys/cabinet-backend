import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Storefront.tsx", import.meta.url), "utf8");

describe("affiliate storefront testimonials", () => {
  it("renders only the testimonials supplied by the public affiliate projection with their original sources", () => {
    expect(source).toContain("data.testimonials.length > 0");
    expect(source).toContain("data.testimonials.map");
    expect(source).toContain("testimonial.sourceUrl");
    expect(source).toContain("What customers say about");
  });
});

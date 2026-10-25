import { describe, expect, it } from "vitest";
import { normalizeStorefrontSlug } from "./routers/favorites";

describe("account favorite storefront scope", () => {
  it("normalizes affiliate slugs and defaults the main storefront", () => {
    expect(normalizeStorefrontSlug(" Reaves-Way-Cabinet-Shop ")).toBe("reaves-way-cabinet-shop");
    expect(normalizeStorefrontSlug()).toBe("main");
    expect(normalizeStorefrontSlug("   ")).toBe("main");
  });
});

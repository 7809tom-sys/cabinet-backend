import { describe, expect, it } from "vitest";
import {
  RESERVED_STOREFRONT_SLUGS,
  STOREFRONT_NAME_MAX_LENGTH,
  STOREFRONT_NAME_MIN_LENGTH,
  checkStorefrontName,
  isReservedStorefrontSlug,
  storefrontPath,
  storefrontSlugFromName,
} from "./affiliateStorefrontName";
import { slugify } from "./affiliate";

describe("storefrontSlugFromName", () => {
  it("produces the same slug the admin create form would", () => {
    const name = "Oak & Iron Cabinet Co.";
    expect(storefrontSlugFromName(name)).toBe(slugify(name));
    expect(storefrontSlugFromName(name)).toBe("oak-iron-cabinet-co");
  });

  it("never ends in a hyphen, even when slugify's 64-character cut lands mid-run", () => {
    const long = `${"a".repeat(63)} bb`;
    const slug = storefrontSlugFromName(long);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("isReservedStorefrontSlug", () => {
  it("refuses every platform route and host", () => {
    for (const word of ["admin", "affiliate", "store", "catalog", "cart", "www", "api", "design"]) {
      expect(isReservedStorefrontSlug(word)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isReservedStorefrontSlug("Admin")).toBe(true);
  });

  it("leaves real store names alone", () => {
    expect(isReservedStorefrontSlug("oak-and-iron")).toBe(false);
    expect(isReservedStorefrontSlug("first-class-flooring")).toBe(false);
  });

  it("covers the seeded sales demo store", () => {
    expect(RESERVED_STOREFRONT_SLUGS.has("sales-demo")).toBe(true);
  });
});

describe("checkStorefrontName", () => {
  it("accepts a normal name and reports the path it would publish", () => {
    const checked = checkStorefrontName("Reaves Way Cabinet Shop");
    expect(checked.ok).toBe(true);
    expect(checked.slug).toBe("reaves-way-cabinet-shop");
    expect(storefrontPath(checked.slug)).toBe("/store/reaves-way-cabinet-shop");
  });

  it("refuses an empty or punctuation-only name", () => {
    expect(checkStorefrontName("")).toMatchObject({ ok: false, problem: "empty" });
    expect(checkStorefrontName("!!!")).toMatchObject({ ok: false, problem: "empty" });
  });

  it("refuses a name shorter than the minimum", () => {
    expect(checkStorefrontName("ab")).toMatchObject({ ok: false, problem: "too_short" });
    expect(checkStorefrontName("A1")).toMatchObject({ ok: false, problem: "too_short" });
    expect(STOREFRONT_NAME_MIN_LENGTH).toBe(3);
    expect(checkStorefrontName("abc")).toMatchObject({ ok: true });
  });

  it("refuses a name longer than the maximum instead of silently truncating it", () => {
    const tooLong = "a".repeat(STOREFRONT_NAME_MAX_LENGTH + 1);
    expect(checkStorefrontName(tooLong)).toMatchObject({ ok: false, problem: "too_long" });
    // Two long names that share a 64-character prefix must not both be accepted.
    const a = checkStorefrontName(`${"a".repeat(STOREFRONT_NAME_MAX_LENGTH)}-one`);
    const b = checkStorefrontName(`${"a".repeat(STOREFRONT_NAME_MAX_LENGTH)}-two`);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });

  it("refuses a reserved name however it is typed", () => {
    expect(checkStorefrontName("Admin")).toMatchObject({ ok: false, problem: "reserved" });
    expect(checkStorefrontName("  Store ")).toMatchObject({ ok: false, problem: "reserved" });
    expect(checkStorefrontName("Sign In")).toMatchObject({ ok: false, problem: "reserved" });
  });

  it("keeps the slug it checked so the form can show the real address", () => {
    const checked = checkStorefrontName("Bayside Cabinets!!");
    expect(checked.slug).toBe("bayside-cabinets");
  });
});

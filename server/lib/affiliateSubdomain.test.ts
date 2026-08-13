import { describe, expect, it } from "vitest";
import { affiliateSlugFromHost } from "./affiliateSubdomain";

describe("affiliate subdomain host resolution", () => {
  it("extracts a single affiliate slug from the public host", () => {
    expect(affiliateSlugFromHost("reaves-way-cabinet-shop.cabinetdealz.com"))
      .toBe("reaves-way-cabinet-shop");
  });

  it("handles proxy-forwarded host chains and local ports", () => {
    expect(affiliateSlugFromHost("reaves-way-cabinet-shop.cabinetdealz.com, internal.manus.space"))
      .toBe("reaves-way-cabinet-shop");
    expect(affiliateSlugFromHost("reaves-way-cabinet-shop.cabinetdealz.com:443"))
      .toBe("reaves-way-cabinet-shop");
  });

  it("does not route the apex, www, nested hosts, or unrelated hosts as affiliates", () => {
    expect(affiliateSlugFromHost("cabinetdealz.com")).toBeNull();
    expect(affiliateSlugFromHost("www.cabinetdealz.com")).toBeNull();
    expect(affiliateSlugFromHost("nested.reaves-way-cabinet-shop.cabinetdealz.com")).toBeNull();
    expect(affiliateSlugFromHost("cabinetz-dq7pucbp.manus.space")).toBeNull();
  });
});

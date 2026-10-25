import { describe, expect, it } from "vitest";
import { canonicalPublicOrigin } from "./publicOrigin";

describe("canonical public origin", () => {
  it("prefers the original CabinetDealz affiliate host over a deployment host", () => {
    expect(canonicalPublicOrigin({
      protocol: "https",
      hostCandidates: [
        "reaves-way-cabinet-shop.cabinetdealz.com",
        "ntr4awi5q3josrid53qp-production.up.railway.app",
      ],
      affiliateSlug: "reaves-way-cabinet-shop",
      production: true,
    })).toBe("https://reaves-way-cabinet-shop.cabinetdealz.com");
  });

  it("normalizes the main-site apex to the public www canonical", () => {
    expect(canonicalPublicOrigin({
      protocol: "http",
      hostCandidates: ["cabinetdealz.com:443"],
      production: true,
    })).toBe("https://www.cabinetdealz.com");
  });

  it("uses the verified production affiliate origin when deployment headers hide the public host", () => {
    expect(canonicalPublicOrigin({
      hostCandidates: ["ntr4awi5q3josrid53qp-production.up.railway.app"],
      affiliateSlug: "reaves-way-cabinet-shop",
      production: true,
    })).toBe("https://reaves-way-cabinet-shop.cabinetdealz.com");
  });

  it("keeps local and preview origins intact outside production", () => {
    expect(canonicalPublicOrigin({
      protocol: "https",
      hostCandidates: ["3000-example.manus.computer"],
      production: false,
    })).toBe("https://3000-example.manus.computer");
  });
});

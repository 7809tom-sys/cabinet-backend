import { describe, expect, it } from "vitest";
import {
  hasApprovedPelicanMaterialSwatch,
  hasVerifiedPelicanFixtureProfile,
  isPelicanDesignerReady,
  pelicanDesignerReadinessReason,
  pelicanDesignerRole,
} from "./pelicanDesignerReadiness";

describe("Pelican Designer readiness policy", () => {
  it("admits a material only with an approved repeatable swatch", () => {
    const readyFloor = {
      category: "Flooring",
      subCategory: "Planks & Flooring",
      pelicanCode: "PL-FLOOR-EXAMPLE",
      materialImageUrl: "/manus-storage/approved-floor-swatch.webp",
    };
    const catalogPhotoOnly = { ...readyFloor, materialImageUrl: null };

    expect(pelicanDesignerRole(readyFloor)).toBe("flooring");
    expect(hasApprovedPelicanMaterialSwatch(readyFloor)).toBe(true);
    expect(isPelicanDesignerReady(readyFloor)).toBe(true);
    expect(isPelicanDesignerReady(catalogPhotoOnly)).toBe(false);
    expect(pelicanDesignerReadinessReason(catalogPhotoOnly)).toBe("Approved repeatable material swatch required");
  });

  it("does not convert moldings, range tops, or other catalog categories into unsupported Designer roles", () => {
    expect(isPelicanDesignerReady({ category: "Flooring", subCategory: "Moldings & Trim", materialImageUrl: "/swatch.webp" })).toBe(false);
    expect(isPelicanDesignerReady({ category: "Range Tops", subCategory: "Gas", materialImageUrl: "/range.webp" })).toBe(false);
    expect(pelicanDesignerReadinessReason({ category: "Range Tops", subCategory: "Gas" })).toBe("No exact supported Designer role");
  });

  it("admits a sink or faucet only when its technical profile is exact and verified", () => {
    const sink = { category: "Sinks & Faucets", subCategory: "Sinks", pelicanCode: "PL-HA128 R15 16G" };
    const faucet = { category: "Sinks & Faucets", subCategory: "Faucets", pelicanCode: "PL-8203 BN" };
    const unmeasuredSink = { category: "Sinks & Faucets", subCategory: "Sinks", pelicanCode: "PL-NO-GEOMETRY" };

    expect(hasVerifiedPelicanFixtureProfile(sink)).toBe(true);
    expect(isPelicanDesignerReady(sink)).toBe(true);
    expect(hasVerifiedPelicanFixtureProfile(faucet)).toBe(true);
    expect(isPelicanDesignerReady(faucet)).toBe(true);
    expect(isPelicanDesignerReady(unmeasuredSink)).toBe(false);
    expect(pelicanDesignerReadinessReason(unmeasuredSink)).toBe("Measured technical fixture profile required");
  });
});

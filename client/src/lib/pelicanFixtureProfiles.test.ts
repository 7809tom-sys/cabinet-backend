import { describe, expect, it } from "vitest";
import { hasVerifiedPelicanFixtureProfile, isPelicanSinkCompatibleWithBase, pelicanSinkBaseKind, verifiedPelicanFaucetProfile, verifiedPelicanSinkFitsCabinet, verifiedPelicanSinkProfile } from "./pelicanFixtureProfiles";

describe("verifiedPelicanSinkProfile", () => {
  it("uses Pelican’s published dimensions for the PL-FC2418SB measured profile", () => {
    expect(verifiedPelicanSinkProfile("PL-FC2418SB")).toMatchObject({
      exteriorWidthIn: 24,
      exteriorDepthIn: 18,
      exteriorHeightIn: 10,
      bowlWidthIn: 22.5,
      bowlDepthIn: 16.625,
      bowlHeightIn: 9,
      installation: "apron-front-undermount",
    });
  });

  it("recognizes imported Farmhouse Series color variants without treating their abbreviated size fields as authoritative", () => {
    expect(verifiedPelicanSinkProfile("PL-FC3018SB Black")).toMatchObject({ exteriorWidthIn: 30, bowlWidthIn: 28.625 });
    expect(verifiedPelicanSinkProfile("PL-FC3318SB Grey")).toMatchObject({ exteriorWidthIn: 32.625, bowlHeightIn: 9.25 });
    expect(verifiedPelicanSinkProfile("PL-FC3321SB White")).toMatchObject({ exteriorDepthIn: 20.875, bowlDepthIn: 19.75 });
  });

  it("distinguishes the measured standard and ADA PL-HA109 undermount depths", () => {
    expect(verifiedPelicanSinkProfile("PL-HA109 R15 16g")).toMatchObject({
      installation: "undermount",
      apronFront: false,
      exteriorHeightIn: 10,
      bowlHeightIn: 10,
    });
    expect(verifiedPelicanSinkProfile("PL-HA109 ADA R0 18g")).toMatchObject({
      installation: "undermount",
      apronFront: false,
      exteriorHeightIn: 5.5,
      bowlHeightIn: 5.5,
    });
  });

  it("uses Pelican’s published PL-8203 dimensions for the matching brushed-nickel faucet", () => {
    expect(verifiedPelicanFaucetProfile("PL-8203 BN")).toMatchObject({
      installation: "single-hole",
      overallHeightIn: 27.1875,
      spoutLengthIn: 9.875,
      spoutHeightIn: 4.9375,
      profile: "pull-down",
    });
  });

  it("maps both imported PL-8207 finish codes to their shared measured profile geometry", () => {
    expect(verifiedPelicanFaucetProfile("PL-8207 BN")).toMatchObject({
      overallHeightIn: 26.125,
      spoutLengthIn: 7.6875,
      spoutHeightIn: 6.5,
      finish: "brushed-nickel",
    });
    expect(verifiedPelicanFaucetProfile("PL-8207 MB")).toMatchObject({
      overallHeightIn: 26.125,
      spoutLengthIn: 7.6875,
      spoutHeightIn: 6.5,
      finish: "matte-black",
    });
  });

  it("maps every active PL-8237 finish code to Pelican’s same verified standard-arc measurements", () => {
    for (const [code, finish] of [["PL-8237 BG", "brushed-gold"], ["PL-8237 BN", "brushed-nickel"], ["PL-8237 CHR", "chrome"], ["PL-8237 MB", "matte-black"]] as const) {
      expect(verifiedPelicanFaucetProfile(code)).toMatchObject({
        overallHeightIn: 12.8125,
        spoutLengthIn: 7.0625,
        spoutHeightIn: 8.375,
        finish,
        profile: "standard-arc",
      });
    }
  });

  it("maps every active PL-8248 finish code to Pelican’s verified pull-out faucet form", () => {
    for (const [code, finish] of [["PL-8248 BN", "brushed-nickel"], ["PL-8248 CHR", "chrome"], ["PL-8248 MB", "matte-black"]] as const) {
      expect(verifiedPelicanFaucetProfile(code)).toMatchObject({
        overallHeightIn: 12.375,
        spoutLengthIn: 10.0625,
        spoutHeightIn: 10.875,
        profile: "pull-out",
        finish,
      });
    }
  });

  it("maps PL-8222 Brushed Nickel to Pelican’s measured compact pull-out faucet profile", () => {
    expect(verifiedPelicanFaucetProfile("PL-8222 BN")).toMatchObject({
      overallHeightIn: 9.5625,
      spoutLengthIn: 8.375,
      spoutHeightIn: 5.8125,
      profile: "pull-out",
      finish: "brushed-nickel",
    });
  });

  it("treats only registered source-verified sink and faucet codes as exact fixture profiles", () => {
    expect(hasVerifiedPelicanFixtureProfile("PL-FC3018SB")).toBe(true);
    expect(hasVerifiedPelicanFixtureProfile("PL-8248 MB")).toBe(true);
    expect(hasVerifiedPelicanFixtureProfile("PL-UNMEASURED")).toBe(false);
    expect(hasVerifiedPelicanFixtureProfile(null)).toBe(false);
  });

  it("does not treat an unverified code as a measured Designer profile", () => {
    const profile = verifiedPelicanSinkProfile("PL-FC2418SB");
    expect(verifiedPelicanSinkProfile("PL-UNKNOWN")).toBeNull();
    expect(profile && verifiedPelicanSinkFitsCabinet(profile, 24)).toBe(true);
    expect(profile && verifiedPelicanSinkFitsCabinet(profile, 18)).toBe(false);
  });

  it("keeps farmhouse and standard sink choices in their matching sink bases", () => {
    const farmhouse = { pelicanCode: "PL-FC2418SB", name: "PL-FC2418SB", description: "Fireclay farmhouse apron-front sink" };
    const standard = { pelicanCode: "PL-SS3018", name: "PL-SS3018", description: "Stainless steel undermount kitchen sink" };
    expect(pelicanSinkBaseKind(farmhouse)).toBe("farmhouse");
    expect(pelicanSinkBaseKind(standard)).toBe("standard");
    expect(isPelicanSinkCompatibleWithBase(farmhouse, "farmhouse")).toBe(true);
    expect(isPelicanSinkCompatibleWithBase(farmhouse, "standard")).toBe(false);
    expect(isPelicanSinkCompatibleWithBase(standard, "standard")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isPelicanSinkCompatibleWithBase, pelicanSinkBaseKind, verifiedPelicanFaucetProfile, verifiedPelicanSinkFitsCabinet, verifiedPelicanSinkProfile } from "./pelicanFixtureProfiles";

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

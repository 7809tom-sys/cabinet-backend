import { describe, expect, it } from "vitest";
import { hasVerifiedPelicanFixtureProfile, isPelicanSinkCompatibleWithBase, pelicanSinkBaseKind, sinkBaseOpeningWidthIn, verifiedPelicanFaucetProfile, verifiedPelicanSinkFitsCabinet, verifiedPelicanSinkProfile } from "./pelicanFixtureProfiles";

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
    expect(verifiedPelicanSinkProfile("PL-FC3620SB White")).toMatchObject({ exteriorWidthIn: 36, bowlWidthIn: 34.5625 });
  });

  it("maps Pelican’s published PL-FC3620SB single-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-FC3620SB")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 36,
      exteriorDepthIn: 20,
      exteriorHeightIn: 10,
      bowlWidthIn: 34.5625,
      bowlDepthIn: 18.5625,
      bowlHeightIn: 9,
      minimumCabinetWidthIn: 36,
    });
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

  it("maps the PL-HA115 R0 source-verified normal-depth standard undermount profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA115 R0 16g")).toMatchObject({
      installation: "undermount",
      sinkType: "single",
      apronFront: false,
      exteriorWidthIn: 32,
      exteriorDepthIn: 18,
      exteriorHeightIn: 10,
      bowlWidthIn: 30,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      minimumCabinetWidthIn: 32,
    });
  });

  it("maps the PL-HA104 R0 source-verified compact standard undermount profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA104 R0 16g")).toMatchObject({
      installation: "undermount",
      sinkType: "single",
      apronFront: false,
      exteriorWidthIn: 17,
      exteriorDepthIn: 18,
      exteriorHeightIn: 10,
      bowlWidthIn: 15,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      minimumCabinetWidthIn: 18,
    });
  });

  it("maps the PL-HA111 R0 source-verified normal-depth standard undermount profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA111 R0 16g")).toMatchObject({
      installation: "undermount",
      sinkType: "single",
      apronFront: false,
      exteriorWidthIn: 27,
      exteriorDepthIn: 18,
      exteriorHeightIn: 10,
      bowlWidthIn: 25,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      minimumCabinetWidthIn: 27,
    });
  });

  it("maps the PL-HA117 R0 source-verified equal double-bowl standard undermount profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA117 R0 16g")).toMatchObject({
      installation: "undermount",
      sinkType: "single",
      apronFront: false,
      exteriorWidthIn: 32,
      exteriorDepthIn: 18,
      exteriorHeightIn: 10,
      bowlWidthIn: 14.5,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      bowlCount: 2,
      minimumCabinetWidthIn: 32,
    });
  });

  it("maps the PL-HA126 R0 source-verified asymmetric double-bowl standard undermount profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA126 R0 16g")).toMatchObject({
      installation: "undermount",
      sinkType: "single",
      apronFront: false,
      exteriorWidthIn: 31.25,
      exteriorDepthIn: 20.5,
      exteriorHeightIn: 10,
      bowlWidthIn: 14,
      bowlDepthIn: 18,
      bowlHeightIn: 10,
      bowlCount: 2,
      bowlWidthsIn: [14, 13.5],
      bowlDepthsIn: [18, 16],
      minimumCabinetWidthIn: 32,
    });
  });

  it("maps the PL-HA128 R15 source-verified double-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA128 R15 16g")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 33,
      exteriorDepthIn: 21,
      exteriorHeightIn: 10,
      bowlWidthIn: 14.5,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      bowlCount: 2,
      minimumCabinetWidthIn: 33,
    });
  });

  it("maps the PL-HA136 R15 source-verified asymmetric double-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA136")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 33,
      exteriorDepthIn: 21,
      exteriorHeightIn: 10,
      bowlWidthIn: 17,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      bowlCount: 2,
      bowlWidthsIn: [17, 12],
      minimumCabinetWidthIn: 33,
    });
  });

  it("maps the PL-HA139 R15 source-verified asymmetric double-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA139 R15 16g")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 33,
      exteriorDepthIn: 21,
      exteriorHeightIn: 10,
      bowlWidthIn: 12,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      bowlCount: 2,
      bowlWidthsIn: [12, 17],
      minimumCabinetWidthIn: 33,
    });
  });

  it("maps the PL-HA130 R0 source-verified equal double-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA130 R0 16g")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 36,
      exteriorDepthIn: 21,
      exteriorHeightIn: 10,
      bowlWidthIn: 16,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      bowlCount: 2,
      minimumCabinetWidthIn: 36,
    });
  });

  it("maps the PL-HA122 R15 source-verified single-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA122 R15 16g")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 32.875,
      exteriorDepthIn: 20.75,
      exteriorHeightIn: 10,
      bowlWidthIn: 30,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      minimumCabinetWidthIn: 33,
    });
  });

  it("maps the PL-HA118 R15 source-verified compact single-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA118 R15 16g")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 30,
      exteriorDepthIn: 21,
      exteriorHeightIn: 10,
      bowlWidthIn: 27,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      minimumCabinetWidthIn: 30,
    });
  });

  it("maps the PL-HA125 R0 source-verified asymmetric double-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA125 R0 16g")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 35.875,
      exteriorDepthIn: 20.75,
      exteriorHeightIn: 10,
      bowlWidthIn: 19,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      bowlCount: 2,
      bowlWidthsIn: [19, 13],
      minimumCabinetWidthIn: 36,
    });
  });

  it("maps the PL-HA124 R0 source-verified single-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA124 R0 16g")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 35.875,
      exteriorDepthIn: 20.75,
      exteriorHeightIn: 10,
      bowlWidthIn: 33,
      bowlDepthIn: 16,
      bowlHeightIn: 10,
      minimumCabinetWidthIn: 36,
    });
  });

  it("maps the PL-HA144 R10 source-verified single-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-HA144 R10 16g")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 33,
      exteriorDepthIn: 21,
      exteriorHeightIn: 10,
      bowlWidthIn: 31,
      bowlDepthIn: 16,
      bowlHeightIn: 9.75,
      minimumCabinetWidthIn: 33,
    });
  });

  it("maps the PL-FC3219SB source-verified single-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-FC3219SB White")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 31.875,
      exteriorDepthIn: 19.125,
      exteriorHeightIn: 10.25,
      bowlWidthIn: 29.125,
      bowlDepthIn: 16.125,
      bowlHeightIn: 9.25,
      minimumCabinetWidthIn: 33,
    });
  });

  it("maps the PL-FC3318DB source-verified double-bowl farmhouse profile", () => {
    expect(verifiedPelicanSinkProfile("PL-FC3318DB White")).toMatchObject({
      installation: "apron-front-undermount",
      sinkType: "farmhouse",
      apronFront: true,
      exteriorWidthIn: 32.625,
      exteriorDepthIn: 18,
      exteriorHeightIn: 10,
      bowlWidthIn: 15.375,
      bowlDepthIn: 16.5,
      bowlHeightIn: 9.25,
      bowlCount: 2,
      minimumCabinetWidthIn: 33,
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

  it("maps every active PL-8206 finish to Pelican’s articulated dual-swing-joint faucet profile", () => {
    for (const [code, finish] of [["PL-8206 BN", "brushed-nickel"], ["PL-8206 CHR", "chrome"], ["PL-8206 MB", "matte-black"]] as const) {
      expect(verifiedPelicanFaucetProfile(code)).toMatchObject({
        overallHeightIn: 10.5,
        spoutLengthIn: 9.75,
        spoutHeightIn: 9.25,
        profile: "articulated-swing",
        finish,
      });
    }
  });

  it("maps active PL-8224 finishes to Pelican’s measured tall pull-out faucet profile", () => {
    expect(verifiedPelicanFaucetProfile("PL-8224 BN")).toMatchObject({ overallHeightIn: 19.3125, spoutLengthIn: 7.9375, spoutHeightIn: 10.25, profile: "pull-out", finish: "brushed-nickel" });
    expect(verifiedPelicanFaucetProfile("PL-8224 ORB")).toMatchObject({ overallHeightIn: 19.3125, spoutLengthIn: 7.9375, spoutHeightIn: 10.25, profile: "pull-out", finish: "oil-rubbed-bronze" });
  });

  it("maps both active PL-8210 finishes to Pelican’s measured commercial pull-down profile", () => {
    expect(verifiedPelicanFaucetProfile("PL-8210 BN")).toMatchObject({ overallHeightIn: 22.5, spoutLengthIn: 9.75, spoutHeightIn: 7.75, profile: "pull-down", finish: "brushed-nickel" });
    expect(verifiedPelicanFaucetProfile("PL-8210 MB")).toMatchObject({ overallHeightIn: 22.5, spoutLengthIn: 9.75, spoutHeightIn: 7.75, profile: "pull-down", finish: "matte-black" });
  });

  it("maps every active PL-8211 finish to Pelican’s measured pull-down profile", () => {
    for (const [code, finish] of [["PL-8211 BG", "brushed-gold"], ["PL-8211 BN", "brushed-nickel"], ["PL-8211 CHR", "chrome"]] as const) {
      expect(verifiedPelicanFaucetProfile(code)).toMatchObject({ overallHeightIn: 15.6875, spoutLengthIn: 9.4375, spoutHeightIn: 6.625, profile: "pull-down", finish });
    }
  });

  it("maps both active PL-8213 finishes to Pelican’s measured pull-down profile", () => {
    expect(verifiedPelicanFaucetProfile("PL-8213 BN")).toMatchObject({ overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-down", finish: "brushed-nickel" });
    expect(verifiedPelicanFaucetProfile("PL-8213 CHR")).toMatchObject({ overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-down", finish: "chrome" });
  });

  it("maps every active PL-8217 finish to Pelican’s measured pull-down profile", () => {
    for (const [code, finish] of [["PL-8217 BN", "brushed-nickel"], ["PL-8217 CHR", "chrome"], ["PL-8217 ORB", "oil-rubbed-bronze"]] as const) {
      expect(verifiedPelicanFaucetProfile(code)).toMatchObject({ overallHeightIn: 16.8125, spoutLengthIn: 9.375, spoutHeightIn: 7.5625, profile: "pull-down", finish });
    }
  });

  it("maps every active PL-8218 finish to Pelican’s measured pull-down profile", () => {
    for (const [code, finish] of [["PL-8218 BN", "brushed-nickel"], ["PL-8218 CHR", "chrome"], ["PL-8218 MB", "matte-black"]] as const) {
      expect(verifiedPelicanFaucetProfile(code)).toMatchObject({ overallHeightIn: 17.6875, spoutLengthIn: 9.375, spoutHeightIn: 8.375, profile: "pull-down", finish });
    }
  });

  it("maps every active PL-8231 finish to Pelican’s measured Fountain pull-out profile", () => {
    for (const [code, finish] of [["PL-8231 BG", "brushed-gold"], ["PL-8231 BN", "brushed-nickel"], ["PL-8231 CHR", "chrome"], ["PL-8231 MB", "matte-black"]] as const) {
      expect(verifiedPelicanFaucetProfile(code)).toMatchObject({ overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-out", finish });
    }
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

  it("uses the nominal sink-base face width rather than a rotated plan footprint", () => {
    const farmhouse = verifiedPelicanSinkProfile("PL-FC3318SB")!;
    const rotatedFsb36 = { width: 36, depth: 24, rotation: 90 };
    expect(sinkBaseOpeningWidthIn(rotatedFsb36)).toBe(36);
    expect(verifiedPelicanSinkFitsCabinet(farmhouse, sinkBaseOpeningWidthIn(rotatedFsb36))).toBe(true);
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

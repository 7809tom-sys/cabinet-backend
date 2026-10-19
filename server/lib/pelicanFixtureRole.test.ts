import { describe, expect, it } from "vitest";
import { pelicanFixtureRole } from "./pelicanFixtureRole";

describe("pelicanFixtureRole", () => {
  it("corrects a cast-iron sink historically imported in the Faucets subcategory", () => {
    expect(pelicanFixtureRole({
      name: "PL-CI6004 White",
      description: '33" x 22" Cast Iron Drop-In Double Bowl Kitchen Sink with 4 faucet holes in White',
      subCategory: "Faucets",
    })).toBe("sink");
  });

  it("keeps true faucets in the faucet role when no sink evidence is present", () => {
    expect(pelicanFixtureRole({
      name: "PL-KF100 Pull-Down Kitchen Faucet",
      description: "Single-hole kitchen faucet with pull-down sprayer",
      subCategory: "Faucets",
    })).toBe("faucet");
  });

  it("keeps PL-8461 as a source-backed kitchen wall-faucet when a legacy local row calls it shower accessory", () => {
    expect(pelicanFixtureRole({
      pelicanCode: "PL-8461 BN",
      name: "PL-8461 BN",
      description: null,
      subCategory: "Shower Accessories",
    })).toBe("faucet");
  });

  it("excludes accessories and prefabricated counters even when their descriptions mention sinks or faucets", () => {
    expect(pelicanFixtureRole({ name: "Stainless Sink Clip", description: "Mounting clip for undermount sink", subCategory: "Sinks" })).toBeNull();
    expect(pelicanFixtureRole({ name: "Special Order PF-4225FM", description: "Prefabricated countertop with faucet cut-out for sinks", subCategory: "Faucets" })).toBeNull();
  });

  it("excludes the source-verified PL-3099 vanity sink even when a legacy imported name calls it farmhouse", () => {
    expect(pelicanFixtureRole({
      pelicanCode: "PL-3099 Bone",
      name: "StoneCreek Farmhouse Reserve 33\" Farmhouse Apron-Front Single Bowl — Bone White",
      description: "Porcelain vanity sink",
      subCategory: "Sinks",
    })).toBeNull();
  });
});

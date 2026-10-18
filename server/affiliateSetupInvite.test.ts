import { describe, expect, it } from "vitest";
import { buildAffiliateSetupInvite } from "./affiliateSetupInvite";

describe("buildAffiliateSetupInvite", () => {
  it("builds a scoped setup URL without exposing a password", () => {
    const invite = buildAffiliateSetupInvite({
      affiliateName: "Northside Cabinets",
      setupToken: "a".repeat(96),
      origin: "https://cabinetdealz.com/",
    });
    expect(invite.setupUrl).toBe(`https://cabinetdealz.com/affiliate/setup?token=${"a".repeat(96)}`);
    expect(invite.text).toContain("one-time link");
    expect(invite.text).not.toContain("password:");
  });
});

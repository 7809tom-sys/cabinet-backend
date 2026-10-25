import { describe, expect, it } from "vitest";
import { canonicalizeDesignPriceItems, normalizedDesignPriceCode, verifiedLegacyDesignPriceAliases } from "./designPriceAliases";

describe("design price aliases", () => {
  it("normalizes punctuation and case for legacy display codes", () => {
    expect(normalizedDesignPriceCode(" wfr-24_42 ")).toBe("WFR2442");
  });

  it("prices WFR2442 through canonical W-24-42 while preserving the visible requested code", () => {
    expect(canonicalizeDesignPriceItems(
      [{ masterCode: "WFR2442", styleId: 330002, distributorId: 210001 }],
      [{ alias: "WFR2442", canonicalMasterCode: "W-24-42" }],
    )).toEqual([{
      masterCode: "W-24-42",
      requestedMasterCode: "WFR2442",
      styleId: 330002,
      distributorId: 210001,
    }]);
  });

  it("keeps the verified WFR2442 compatibility mapping available when the database alias is absent", () => {
    expect(canonicalizeDesignPriceItems(
      [{ masterCode: "WFR2442", styleId: 330002, distributorId: 210001 }],
      verifiedLegacyDesignPriceAliases,
    )[0]).toMatchObject({ masterCode: "W-24-42", requestedMasterCode: "WFR2442" });
  });

  it("leaves exact catalog codes unchanged when no authoritative alias exists", () => {
    expect(canonicalizeDesignPriceItems(
      [{ masterCode: "W-24-42", styleId: 330002 }],
      [{ alias: "WFR2442", canonicalMasterCode: "W-24-42" }],
    )[0]).toMatchObject({ masterCode: "W-24-42", requestedMasterCode: "W-24-42" });
  });

  it("refuses an ambiguous normalized alias unless the exact authoritative alias matches", () => {
    const aliases = [
      { alias: "WFR-2442", canonicalMasterCode: "W-24-42" },
      { alias: "WFR_2442", canonicalMasterCode: "W-30-36" },
    ];
    expect(canonicalizeDesignPriceItems([{ masterCode: "wfr2442" }], aliases)[0]?.masterCode).toBe("wfr2442");
    expect(canonicalizeDesignPriceItems([{ masterCode: "WFR-2442" }], aliases)[0]?.masterCode).toBe("W-24-42");
  });
});

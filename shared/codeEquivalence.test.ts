import { describe, expect, it } from "vitest";
import { CodeEquivalenceGroups, normalizedEquivalenceCode, resolveSoldCodesInGroup } from "./codeEquivalence";
describe("normalizedEquivalenceCode", () => {
  it("ignores punctuation, spaces and case", () => {
    expect(normalizedEquivalenceCode("w-30-30")).toBe("W3030");
    expect(normalizedEquivalenceCode("ADA B12")).toBe("ADAB12");
    expect(normalizedEquivalenceCode("TK-8(TKC)")).toBe("TK8TKC");
  });
  it("drops a single leading zero on the width only (BT09 = BT9)", () => {
    expect(normalizedEquivalenceCode("BT09")).toBe("BT9");
    expect(normalizedEquivalenceCode("FHB-09")).toBe("FHB9");
    expect(normalizedEquivalenceCode("FHBO9")).toBe("FHBO9");
    expect(normalizedEquivalenceCode("B-9")).toBe("B9");
  });
  it("never strips other zeros", () => {
    expect(normalizedEquivalenceCode("B30")).toBe("B30");
    expect(normalizedEquivalenceCode("W3030")).toBe("W3030");
    expect(normalizedEquivalenceCode("W-0936")).toBe("W936");
    expect(normalizedEquivalenceCode("W0936")).toBe("W936");
    expect(normalizedEquivalenceCode("U189024")).toBe("U189024");
  });
});
describe("CodeEquivalenceGroups", () => {
  it("resolves ERB36 <-> BER36 in both directions from one directed row", () => {
    const groups = new CodeEquivalenceGroups().addLinks([{ aliasCode: "BER36", masterCode: "ERB36" }]);
    expect(groups.sameGroup("ERB36", "BER36")).toBe(true);
    expect(groups.sameGroup("BER36", "ERB36")).toBe(true);
    expect(groups.sameGroup("ERB36", "ERB33")).toBe(false);
    expect(groups.groupKeys("BER36")).toEqual(["BER36", "ERB36"]);
  });
  it("walks chains and cycles into one group", () => {
    const groups = new CodeEquivalenceGroups().addLinks([
      { aliasCode: "B-36FH", masterCode: "B36FH" },
      { aliasCode: "B36FH", masterCode: "BFH36" },
      { aliasCode: "FHB36", masterCode: "B36FH" },
      { aliasCode: "3DB15ADA", masterCode: "ADA-3DB15" },
      { aliasCode: "ADA-3DB15", masterCode: "3DB15ADA" },
    ]);
    expect(groups.groupKeys("BFH36")).toEqual(["B36FH", "BFH36", "FHB36"]);
    expect(groups.groupKeys("ADA-3DB15")).toEqual(["3DB15ADA", "ADA3DB15"]);
  });
  it("does not merge different sizes", () => {
    const groups = new CodeEquivalenceGroups().addLinks([
      { aliasCode: "ERB-33", masterCode: "ERB33" },
      { aliasCode: "ERB-36", masterCode: "ERB36" },
    ]);
    expect(groups.sameGroup("ERB33", "ERB36")).toBe(false);
  });
  it("collects every spelling for SQL lookups", () => {
    const groups = new CodeEquivalenceGroups().addLinks([
      { aliasCode: "BT09", masterCode: "BT9" },
      { aliasCode: "FHBO9", masterCode: "BT9" },
      { aliasCode: "FHB-09", masterCode: "BT9" },
    ]);
    expect(groups.groupSpellings("bt9")).toEqual(["BT09", "BT9", "FHB-09", "FHBO9", "bt9"]);
  });
});
describe("resolveSoldCodesInGroup", () => {
  const groups = new CodeEquivalenceGroups().addLinks([
    { aliasCode: "BER36", masterCode: "ERB36" },
    { aliasCode: "BT09", masterCode: "BT9" },
    { aliasCode: "FHBO9", masterCode: "BT9" },
  ]);
  it("swaps a Skyline ERB36 to the Madison BER36 when only BER36 is sold on the line", () => {
    expect(resolveSoldCodesInGroup(groups, "ERB36", ["BER36", "B36", "LSB36"])).toEqual(["BER36"]);
  });
  it("prefers the exact requested code when the line sells it", () => {
    expect(resolveSoldCodesInGroup(groups, "ERB36", ["BER36", "ERB36"])).toEqual(["ERB36", "BER36"]);
  });
  it("resolves FHBO9 and BT09 to the line's BT9", () => {
    expect(resolveSoldCodesInGroup(groups, "FHBO9", ["BT9"])).toEqual(["BT9"]);
    expect(resolveSoldCodesInGroup(groups, "BT09", ["BT9"])).toEqual(["BT9"]);
  });
  it("returns nothing when the group is unpriced on this line (Part 1 flag fires)", () => {
    expect(resolveSoldCodesInGroup(groups, "ERB36", ["LS3612", "B36"])).toEqual([]);
  });
});

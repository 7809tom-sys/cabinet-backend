import { describe, it, expect } from "vitest";
import {
  requiresFinishMatch,
  finishMatchLabel,
  finishMatchOrderNote,
} from "./finishMatch";

describe("requiresFinishMatch", () => {
  it("flags skin panels by subCategory", () => {
    expect(requiresFinishMatch({ subCategory: "Skin Panel", description: "S-24-96" })).toBe(true);
  });
  it("flags decorative end panels by subCategory", () => {
    expect(requiresFinishMatch({ subCategory: "Decorative End Panel", description: "BDEP" })).toBe(true);
  });
  it("flags dishwasher / refrigerator end panels by description", () => {
    expect(requiresFinishMatch({ description: "Dishwasher End Panel" })).toBe(true);
    expect(requiresFinishMatch({ description: "24\" Refrigerator Decorative End Panel" })).toBe(true);
  });
  it("flags generic skins / island panels", () => {
    expect(requiresFinishMatch({ description: "Island Skin Panel 48x96" })).toBe(true);
  });
  it("does NOT flag ordinary cabinets or molding", () => {
    expect(requiresFinishMatch({ category: "Base", subCategory: "Single Door Base", description: "B24" })).toBe(false);
    expect(requiresFinishMatch({ description: "3/4\" x 96\" Scribe Molding" })).toBe(false);
    expect(requiresFinishMatch({})).toBe(false);
  });
});

describe("finishMatchLabel", () => {
  it("returns a Finish: label when a style is provided", () => {
    expect(finishMatchLabel("Hickory Shaker")).toBe("Finish: Hickory Shaker");
  });
  it("returns null when no style chosen", () => {
    expect(finishMatchLabel("")).toBeNull();
    expect(finishMatchLabel(null)).toBeNull();
  });
});

describe("finishMatchOrderNote", () => {
  it("enumerates finish-match lines + style, deduping codes", () => {
    const note = finishMatchOrderNote(
      [
        { masterCode: "S-24-96", subCategory: "Skin Panel" },
        { masterCode: "BDEP", subCategory: "Decorative End Panel" },
        { masterCode: "S-24-96", subCategory: "Skin Panel" }, // dup
        { masterCode: "B24", category: "Base", subCategory: "Single Door Base" }, // not matched
      ],
      "White Shaker",
    );
    expect(note).not.toBeNull();
    expect(note).toContain("White Shaker");
    expect(note).toContain("S-24-96");
    expect(note).toContain("BDEP");
    // deduped: only one S-24-96 occurrence
    expect(note!.match(/S-24-96/g)!.length).toBe(1);
    // B24 is not a finish-match item
    expect(note).not.toContain("B24");
  });
  it("returns null when no finish-match lines present", () => {
    expect(finishMatchOrderNote([{ masterCode: "B24", category: "Base" }], "Maple")).toBeNull();
    expect(finishMatchOrderNote([], "Maple")).toBeNull();
  });
  it("falls back to a generic phrase when no style chosen", () => {
    const note = finishMatchOrderNote([{ masterCode: "BDEP", subCategory: "Decorative End Panel" }], "");
    expect(note).toContain("the selected door style");
  });
});

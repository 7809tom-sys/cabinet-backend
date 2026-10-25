import { describe, it, expect } from "vitest";
import {
  matchCabinetCodes,
  normalizeCode,
  summarizeMatches,
  type CatalogEntry,
} from "./cabinetCodeMatch";

const catalog: CatalogEntry[] = [
  { id: 0, masterCode: "B-12", description: "Base 12", category: "Base" },
  { id: 1, masterCode: "B-24", description: "Base 24", category: "Base" },
  { id: 2, masterCode: "DB-24-3", description: "Drawer Base 24 (3 drawers)", category: "Base" },
  { id: 3, masterCode: "W-3030", description: "Wall 30x30", category: "Wall" },
  { id: 4, masterCode: "SB-36", description: "Sink Base 36", category: "Base" },
];

describe("normalizeCode", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeCode("b-24")).toBe("B24");
    expect(normalizeCode("DB 24 3")).toBe("DB243");
    expect(normalizeCode("w_3030")).toBe("W3030");
  });
});

describe("matchCabinetCodes", () => {
  it("matches exact codes", () => {
    const [r] = matchCabinetCodes([{ code: "B-24" }], catalog);
    expect(r.matched).toBe(true);
    expect(r.confidence).toBe("exact");
    expect(r.cabinetId).toBe(1);
  });

  it("matches codes that differ only by separators/case", () => {
    const [r] = matchCabinetCodes([{ code: "db243" }], catalog);
    expect(r.matched).toBe(true);
    expect(r.masterCode).toBe("DB-24-3");
    expect(["exact", "normalized"]).toContain(r.confidence);
  });

  it("defaults quantity to 1 and floors/sanitizes bad quantities", () => {
    expect(matchCabinetCodes([{ code: "B-24" }], catalog)[0].quantity).toBe(1);
    expect(matchCabinetCodes([{ code: "B-24", quantity: 3 }], catalog)[0].quantity).toBe(3);
    expect(matchCabinetCodes([{ code: "B-24", quantity: 0 }], catalog)[0].quantity).toBe(1);
    expect(matchCabinetCodes([{ code: "B-24", quantity: 2.7 }], catalog)[0].quantity).toBe(2);
  });

  it("coerces string quantities from the LLM", () => {
    expect(matchCabinetCodes([{ code: "B-24", quantity: "5" }], catalog)[0].quantity).toBe(5);
    expect(matchCabinetCodes([{ code: "B-24", quantity: "abc" }], catalog)[0].quantity).toBe(1);
  });

  it("returns unmatched with candidates for ambiguous codes", () => {
    const [r] = matchCabinetCodes([{ code: "ZZZ99" }], catalog);
    expect(r.matched).toBe(false);
    expect(r.confidence).toBe("none");
    expect(r.cabinetId).toBeNull();
  });

  it("does a unique-prefix fuzzy match", () => {
    // "SB-36X" should still resolve to SB-36 via prefix containment
    const [r] = matchCabinetCodes([{ code: "SB36X" }], catalog);
    expect(r.matched).toBe(true);
    expect(r.confidence).toBe("fuzzy");
    expect(r.masterCode).toBe("SB-36");
  });

  it("skips empty codes", () => {
    expect(matchCabinetCodes([{ code: "" }, { code: "   " }], catalog)).toHaveLength(0);
  });

  it("summarizes matched/unmatched/units", () => {
    const results = matchCabinetCodes(
      [
        { code: "B-24", quantity: 2 },
        { code: "W-3030" },
        { code: "NOPE" },
      ],
      catalog,
    );
    const s = summarizeMatches(results);
    expect(s.total).toBe(3);
    expect(s.matched).toBe(2);
    expect(s.unmatched).toBe(1);
    expect(s.units).toBe(4);
  });

  it("matches the supplied handwritten order format and preserves quantities", () => {
    const results = matchCabinetCodes(
      [
        { code: "B-12", quantity: 3 },
        { code: "B24", quantity: 4 },
        { code: "SB36", quantity: 2 },
        { code: "W2142", quantity: 1 },
      ],
      [...catalog, { id: 5, masterCode: "W-2142", description: "Wall 21 x 42", category: "Wall" }],
    );
    expect(results.every((row) => row.matched)).toBe(true);
    expect(results.map((row) => row.quantity)).toEqual([3, 4, 2, 1]);
    expect(summarizeMatches(results).units).toBe(10);
  });
});

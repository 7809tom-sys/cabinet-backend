import { describe, expect, it } from "vitest";
import {
  canonicalize,
  normalizeCode,
  buildCodeIndex,
  matchCode,
  matchCodes,
  parseOrderCsv,
  type CabinetCodeRecord,
} from "./codeMatch";

const RECORDS: CabinetCodeRecord[] = [
  { id: 1, masterCode: "B-24", description: '24" Base Cabinet', category: "Base" },
  { id: 2, masterCode: "B-30", description: '30" Base Cabinet', category: "Base" },
  { id: 3, masterCode: "W-30-30", description: '30x30 Wall Cabinet', category: "Wall" },
  { id: 4, masterCode: "BBC-45", description: "Blind Base Corner 45", category: "Base" },
  { id: 5, masterCode: "SB-36", description: '36" Sink Base', category: "Base" },
  { id: 6, masterCode: "DB-24-3", description: '24" 3-Drawer Base', category: "Base" },
  { id: 7, masterCode: "ADA-B-24", description: 'ADA 24" Base', category: "ADA" },
];

describe("canonicalize", () => {
  it("strips non-alphanumerics and uppercases", () => {
    expect(canonicalize("db-24-3")).toBe("DB243");
    expect(canonicalize("w 30 30")).toBe("W3030");
    expect(canonicalize("")).toBe("");
  });
});

describe("normalizeCode", () => {
  it("inserts catalog-style dashes for base codes", () => {
    expect(normalizeCode("B24")).toBe("B-24");
    expect(normalizeCode("b 24")).toBe("B-24");
  });
  it("keeps already dash-delimited codes", () => {
    expect(normalizeCode("B-24")).toBe("B-24");
    expect(normalizeCode("DB-24-3")).toBe("DB-24-3");
  });
  it("splits wall double-dimension codes", () => {
    expect(normalizeCode("W3030")).toBe("W-30-30");
  });
  it("handles multi-number drawer base", () => {
    expect(normalizeCode("DB243")).toBe("DB-24-3");
  });
  it("keeps trailing alpha suffix attached", () => {
    expect(normalizeCode("W3030GD")).toBe("W-30-30GD");
  });
});

describe("matchCode", () => {
  const index = buildCodeIndex(RECORDS);

  it("matches an exact master code", () => {
    const m = matchCode("B-24", index);
    expect(m.matched).toBe(true);
    expect(m.cabinetId).toBe(1);
    expect(m.confidence).toBe("exact");
  });

  it("matches shorthand via normalization", () => {
    const m = matchCode("B24", index);
    expect(m.matched).toBe(true);
    expect(m.masterCode).toBe("B-24");
    expect(m.confidence).toBe("normalized");
  });

  it("matches a glued wall code", () => {
    const m = matchCode("W3030", index);
    expect(m.matched).toBe(true);
    expect(m.masterCode).toBe("W-30-30");
  });

  it("matches a blind corner shorthand", () => {
    const m = matchCode("BBC45", index);
    expect(m.matched).toBe(true);
    expect(m.masterCode).toBe("BBC-45");
  });

  it("fuzzy-matches a dropped drawer count", () => {
    const m = matchCode("DB24", index);
    expect(m.matched).toBe(true);
    expect(m.masterCode).toBe("DB-24-3");
    expect(m.confidence).toBe("fuzzy");
  });

  it("returns unmatched for unknown codes", () => {
    const m = matchCode("ZZZ-99", index);
    expect(m.matched).toBe(false);
    expect(m.cabinetId).toBeNull();
    expect(m.confidence).toBe("none");
  });

  it("does not falsely match an ambiguous prefix", () => {
    // "B" alone is a prefix of B-24 and B-30 → ambiguous → no fuzzy match.
    const m = matchCode("B", index);
    expect(m.matched).toBe(false);
  });
});

describe("matchCodes batch", () => {
  it("matches a mixed batch", () => {
    const out = matchCodes(["B24", "nope", "SB36"], RECORDS);
    expect(out).toHaveLength(3);
    expect(out[0].matched).toBe(true);
    expect(out[1].matched).toBe(false);
    expect(out[2].masterCode).toBe("SB-36");
  });
});

describe("parseOrderCsv", () => {
  it("parses code,qty with a header", () => {
    const rows = parseOrderCsv("code,qty\nB24,2\nW3030,1");
    expect(rows).toEqual([
      { code: "B24", qty: 2 },
      { code: "W3030", qty: 1 },
    ]);
  });

  it("defaults qty to 1 when missing", () => {
    const rows = parseOrderCsv("B24\nSB36");
    expect(rows).toEqual([
      { code: "B24", qty: 1 },
      { code: "SB36", qty: 1 },
    ]);
  });

  it("clamps non-positive qty to 1 and ignores blank lines", () => {
    const rows = parseOrderCsv("B24,0\n\nSB36,-3\n");
    expect(rows).toEqual([
      { code: "B24", qty: 1 },
      { code: "SB36", qty: 1 },
    ]);
  });

  it("handles quoted fields and semicolons", () => {
    const rows = parseOrderCsv('"B-24";3\n"W-30-30";1');
    expect(rows).toEqual([
      { code: "B-24", qty: 3 },
      { code: "W-30-30", qty: 1 },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseOrderCsv("")).toEqual([]);
  });
});

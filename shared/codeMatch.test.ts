import { describe, expect, it } from "vitest";
import {
  canonicalize,
  normalizeCode,
  buildCodeIndex,
  matchCode,
  matchCodes,
  parseOrderCsv,
  stripHandedness,
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
  { id: 8, masterCode: "U-24-96-24", description: '24" x 96" Double Door Tall Utility Cabinet', category: "Tall" },
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

describe("pantry / tall-utility prefix aliases", () => {
  const index = buildCodeIndex(RECORDS);
  it("resolves a WP wall-pantry shorthand to the U tall-utility family", () => {
    // "WP2496" -> alias WP->U -> U2496 (prefix of unique U-24-96-24).
    const m = matchCode("WP2496", index);
    expect(m.matched).toBe(true);
    expect(m.masterCode).toBe("U-24-96-24");
  });
  it("resolves a PC pantry-cabinet shorthand to the U tall-utility family", () => {
    const m = matchCode("PC2496", index);
    expect(m.matched).toBe(true);
    expect(m.masterCode).toBe("U-24-96-24");
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

  it("prefers a literal master code over a conflicting normalized spelling", () => {
    const collisionIndex = buildCodeIndex([
      { id: 41, masterCode: "W-2430", description: "Dashed wall", category: "Wall" },
      { id: 42, masterCode: "W2430", description: "Source wall", category: "Wall" },
    ]);

    expect(matchCode("W2430", collisionIndex)).toMatchObject({
      matched: true,
      confidence: "exact",
      cabinetId: 42,
      masterCode: "W2430",
      description: "Source wall",
    });
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

// ─── Real-world trade codes from the user's two Build-an-Order screenshots ─────
// These exercise prefix aliases (RW->AW, WF->F, WDC->DCW, LS->LSB, HB/TFHB->BFH),
// handedness suffixes (-R/-L), and glued/dashed dimension groups.
const CATALOG: CabinetCodeRecord[] = [
  { id: 101, masterCode: "F-3", description: "Wall Filler 3in", category: "Accessory" },
  { id: 102, masterCode: "AW-36-18", description: 'Refrigerator Wall 36x18', category: "Wall" },
  { id: 103, masterCode: "BFH-21", description: "Base Full Height 21in", category: "Base" },
  { id: 104, masterCode: "DCW-24-30", description: "Wall Diagonal Corner 24x30", category: "Wall" },
  { id: 105, masterCode: "LSB-36", description: "Lazy Susan Base 36", category: "Base" },
  { id: 106, masterCode: "W-18-30", description: "Wall 18x30", category: "Wall" },
  { id: 107, masterCode: "B-21", description: '21" Base Cabinet', category: "Base" },
  { id: 108, masterCode: "W-21-30", description: "Wall 21x30", category: "Wall" },
  { id: 109, masterCode: "B-18", description: '18" Base Cabinet', category: "Base" },
];

describe("stripHandedness", () => {
  it("strips trailing -R/-L and glued L/R after a digit", () => {
    expect(stripHandedness("WDC2430-R")).toEqual({ code: "WDC2430", hand: "R" });
    expect(stripHandedness("W1830-L")).toEqual({ code: "W1830", hand: "L" });
    expect(stripHandedness("B21-R")).toEqual({ code: "B21", hand: "R" });
  });
  it("leaves codes without a handedness suffix unchanged", () => {
    expect(stripHandedness("B-24")).toEqual({ code: "B-24", hand: null });
    expect(stripHandedness("W3030")).toEqual({ code: "W3030", hand: null });
  });
});

describe("matchCode — trade codes from order screenshots", () => {
  const index = buildCodeIndex(CATALOG);
  const cases: Array<[string, string]> = [
    ["WF3", "F-3"],          // wall filler alias
    ["RW3618", "AW-36-18"],  // refrigerator wall alias
    ["HB21", "BFH-21"],      // full-height base alias
    ["TFHB21", "BFH-21"],    // tall full-height base alias
    ["WDC2430-R", "DCW-24-30"], // diagonal corner alias + handedness
    ["LS3612-R", "LSB-36"],  // lazy susan alias + handedness
    ["W1830-L", "W-18-30"],  // wall + handedness
    ["B21-R", "B-21"],       // base + handedness
    ["W2130-R", "W-21-30"],  // wall + handedness
    ["B18-L", "B-18"],       // base + handedness
  ];
  for (const [raw, expected] of cases) {
    it(`resolves ${raw} -> ${expected}`, () => {
      const m = matchCode(raw, index);
      expect(m.matched).toBe(true);
      expect(m.masterCode).toBe(expected);
    });
  }
});

describe("matchCode — persisted alias map", () => {
  const index = buildCodeIndex(CATALOG);
  it("resolves a remembered manual fix before fuzzy guessing", () => {
    const aliasMap = new Map([
      [canonicalize("WEIRDCODE99"), CATALOG[6]], // -> B-21
    ]);
    const m = matchCode("weird code 99", index, aliasMap);
    expect(m.matched).toBe(true);
    expect(m.masterCode).toBe("B-21");
    expect(m.cabinetId).toBe(107);
  });
  it("ignores the alias map when no entry matches", () => {
    const aliasMap = new Map([[canonicalize("OTHER"), CATALOG[0]]]);
    const m = matchCode("ZZZ-99", index, aliasMap);
    expect(m.matched).toBe(false);
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

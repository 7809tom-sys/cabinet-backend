import { describe, it, expect } from "vitest";
import {
  buildTrimCartLines,
  trimHasPrice,
  TRIM_MASTER_CODES,
  type ActiveTrim,
  type TrimPrice,
} from "../client/src/lib/trimCart";

// A representative trim price map for one door style (already tier-resolved).
function priceMap(entries: Record<string, TrimPrice>): Map<string, TrimPrice> {
  return new Map(Object.entries(entries));
}

const TK: TrimPrice = { cabinetId: 101, masterCode: "TK-8", description: "Toe Kick 8'", unitPrice: 65 };
const LR: TrimPrice = { cabinetId: 102, masterCode: "LRM-8", description: "Light Rail 8'", unitPrice: 120 };
const BAM: TrimPrice = { cabinetId: 103, masterCode: "BAM", description: "Batten Molding", unitPrice: 60 };
const CROWN: TrimPrice = { cabinetId: 9390046, masterCode: "LCM8", description: 'Crown Molding - 96"', unitPrice: 94.44 };

describe("buildTrimCartLines", () => {
  it("prices active trims that have a SKU for the style, scoped to the design styleId", () => {
    const trims: ActiveTrim[] = [
      { kind: "toeKick", pieces: 2 },
      { kind: "lightRail", pieces: 1 },
    ];
    const lines = buildTrimCartLines(trims, 30063, "Natura Maple", priceMap({ "TK-8": TK, "LRM-8": LR }));
    expect(lines).toHaveLength(2);
    const tk = lines.find((l) => l.masterCode === "TK-8")!;
    expect(tk.qty).toBe(2);
    expect(tk.unitPrice).toBe(65);
    expect(tk.styleId).toBe(30063); // finish scope → color inherits cabinets
    expect(tk.styleLabel).toBe("Natura Maple");
    expect(tk.name).toBe("Toe Kick 8'");
  });

  it("prices crown through the real selected-line LCM8 catalog product", () => {
    expect(TRIM_MASTER_CODES.crown).toBe("LCM8");
    const lines = buildTrimCartLines(
      [{ kind: "crown", pieces: 3 }],
      330002,
      "Aura Cream (Ashford)",
      priceMap({ LCM8: CROWN }),
    );
    expect(lines).toEqual([{
      masterCode: "LCM8",
      name: 'Crown Molding - 96"',
      styleId: 330002,
      styleLabel: "Aura Cream (Ashford)",
      unitPrice: 94.44,
      qty: 3,
    }]);
  });

  it("leaves crown quote-only when the selected line has no published priced LCM8 SKU", () => {
    const lines = buildTrimCartLines(
      [{ kind: "crown", pieces: 3 }],
      999,
      "Unpriced Style",
      priceMap({}),
    );
    expect(lines).toHaveLength(0);
  });

  it("skips trims with no SKU for the selected style (price map miss)", () => {
    // toeKick active but the style has no TK-8 SKU (e.g. brand-new GV door).
    const lines = buildTrimCartLines(
      [{ kind: "toeKick", pieces: 2 }],
      999,
      "Villa Blanc",
      priceMap({}), // no trim SKUs for this style
    );
    expect(lines).toHaveLength(0);
  });

  it("skips trims with zero/negative pieces", () => {
    const lines = buildTrimCartLines(
      [{ kind: "toeKick", pieces: 0 }, { kind: "batten", pieces: -1 }],
      1,
      "X",
      priceMap({ "TK-8": TK, BAM: BAM }),
    );
    expect(lines).toHaveLength(0);
  });

  it("skips a SKU whose resolved price is not positive", () => {
    const zeroTK: TrimPrice = { ...TK, unitPrice: 0 };
    const lines = buildTrimCartLines(
      [{ kind: "toeKick", pieces: 2 }],
      1,
      "X",
      priceMap({ "TK-8": zeroTK }),
    );
    expect(lines).toHaveLength(0);
  });

  it("returns nothing when styleId is null", () => {
    const lines = buildTrimCartLines([{ kind: "toeKick", pieces: 2 }], null, "X", priceMap({ "TK-8": TK }));
    expect(lines).toHaveLength(0);
  });

  it("aggregates multiple trim kinds independently (batten + toe kick)", () => {
    const lines = buildTrimCartLines(
      [{ kind: "toeKick", pieces: 1 }, { kind: "batten", pieces: 4 }],
      5,
      "Slate Echo",
      priceMap({ "TK-8": TK, BAM: BAM }),
    );
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.masterCode === "BAM")!.qty).toBe(4);
  });
});

describe("trimHasPrice", () => {
  it("is true only when a positive-price SKU exists for the trim's code", () => {
    const m = priceMap({ "TK-8": TK, LCM8: CROWN });
    expect(trimHasPrice("toeKick", m)).toBe(true);
    expect(trimHasPrice("lightRail", m)).toBe(false); // no LRM-8 in map
    expect(trimHasPrice("crown", m)).toBe(true);
  });

  it("is false when the SKU price is zero", () => {
    const m = priceMap({ "TK-8": { ...TK, unitPrice: 0 } });
    expect(trimHasPrice("toeKick", m)).toBe(false);
  });
});

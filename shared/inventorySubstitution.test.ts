import { describe, expect, it } from "vitest";
import { SB36_B36_WORKAROUND_NOTE, sb36InventorySubstitutions, type InventorySubstitutionCandidate } from "./inventorySubstitution";

const hickory = (over: Partial<InventorySubstitutionCandidate> & Pick<InventorySubstitutionCandidate, "masterCode">): InventorySubstitutionCandidate => ({
  description: `${over.masterCode} Hickory Shaker cabinet`,
  width: 36,
  placement: "base",
  doorStyleId: 330007,
  onHandQty: 0,
  sinkReady: false,
  customerPrice: 500,
  ...over,
});

describe("Hickory SB36 inventory substitution rule", () => {
  it("suggests an in-stock same-style B36 when SB36 is at zero, with the exact workaround note", () => {
    const suggestions = sb36InventorySubstitutions(
      { masterCode: "SB36", width: 36, doorStyleId: 330007, onHandQty: 0 },
      [
        hickory({ masterCode: "SB36", onHandQty: 0, sinkReady: true }),
        hickory({ masterCode: "B36", onHandQty: 5 }),
        hickory({ masterCode: "SB33", width: 33, onHandQty: 7, sinkReady: true }),
        hickory({ masterCode: "B36", doorStyleId: 999999, onHandQty: 8 }),
      ],
    );

    expect(suggestions.map((item) => item.masterCode)).toEqual(["B36"]);
    expect(suggestions[0]?.note).toBe(SB36_B36_WORKAROUND_NOTE);
    expect(suggestions[0]?.onHandQty).toBe(5);
  });

  it("never auto-swaps, includes no zero/unknown-stock candidate, and never crosses door styles", () => {
    const candidates = [
      hickory({ masterCode: "B36", onHandQty: 0 }),
      hickory({ masterCode: "SB36", onHandQty: null, sinkReady: true }),
      hickory({ masterCode: "B36", onHandQty: 4, doorStyleId: 77 }),
    ];
    const suggestions = sb36InventorySubstitutions(
      { masterCode: "SB36", width: 36, doorStyleId: 330007, onHandQty: 0 },
      candidates,
    );

    expect(suggestions).toEqual([]);
    expect(candidates.find((item) => item.masterCode === "SB36")?.masterCode).toBe("SB36");
  });

  it("does not suggest anything unless the requested SB36 is explicitly at zero", () => {
    expect(sb36InventorySubstitutions(
      { masterCode: "SB36", width: 36, doorStyleId: 330007, onHandQty: null },
      [hickory({ masterCode: "B36", onHandQty: 5 })],
    )).toEqual([]);
    expect(sb36InventorySubstitutions(
      { masterCode: "B36", width: 36, doorStyleId: 330007, onHandQty: 0 },
      [hickory({ masterCode: "B36", onHandQty: 5 })],
    )).toEqual([]);
  });
});

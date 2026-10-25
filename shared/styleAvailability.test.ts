import { describe, it, expect } from "vitest";
import { filterStylesByAvailability, isStyleAvailable } from "./styleAvailability";

const styles = [
  { id: 30044, ourName: "Nimbus White" },
  { id: 120001, ourName: "Villa Blanc" }, // empty line — no available SKUs
  { id: 30010, ourName: "Nova White" },
];

describe("filterStylesByAvailability", () => {
  it("drops styles that have no available SKUs", () => {
    const available = new Set<number>([30044, 30010]); // 120001 missing
    const kept = filterStylesByAvailability(styles, available);
    expect(kept.map((s) => s.id)).toEqual([30044, 30010]);
    expect(kept.find((s) => s.id === 120001)).toBeUndefined();
  });

  it("keeps every style when all are available", () => {
    const available = new Set<number>([30044, 120001, 30010]);
    expect(filterStylesByAvailability(styles, available)).toHaveLength(3);
  });

  it("returns nothing when no style is available", () => {
    expect(filterStylesByAvailability(styles, new Set())).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const available = new Set<number>([30044]);
    filterStylesByAvailability(styles, available);
    expect(styles).toHaveLength(3);
  });
});

describe("isStyleAvailable", () => {
  it("is true only for styles in the available set", () => {
    const available = new Set<number>([30044]);
    expect(isStyleAvailable(30044, available)).toBe(true);
    expect(isStyleAvailable(120001, available)).toBe(false);
  });
});

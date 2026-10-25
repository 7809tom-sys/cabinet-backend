import { describe, expect, it } from "vitest";
import {
  dollarsToCents,
  computeEarning,
  isoWeekParts,
  isoWeekKey,
  isoWeekStart,
  groupByWeek,
} from "./earnings";

describe("dollarsToCents", () => {
  it("converts numbers and numeric strings", () => {
    expect(dollarsToCents(100)).toBe(10000);
    expect(dollarsToCents("100.50")).toBe(10050);
    expect(dollarsToCents("0")).toBe(0);
  });
  it("is defensive about null / junk", () => {
    expect(dollarsToCents(null)).toBe(0);
    expect(dollarsToCents(undefined)).toBe(0);
    expect(dollarsToCents("not-a-number")).toBe(0);
  });
  it("rounds to the nearest cent", () => {
    expect(dollarsToCents(1.01)).toBe(101);
    expect(dollarsToCents(1.234)).toBe(123); // 123.4c → 123
  });
});

describe("computeEarning", () => {
  it("applies the commission rate", () => {
    const e = computeEarning({ customerTotalCents: 1_000_000, commissionRate: 0.05 });
    expect(e.commissionCents).toBe(50_000); // 5% of $10,000 = $500
  });
  it("clamps an out-of-range rate", () => {
    expect(computeEarning({ customerTotalCents: 10000, commissionRate: 2 }).commissionCents).toBe(10000);
    expect(computeEarning({ customerTotalCents: 10000, commissionRate: -1 }).commissionCents).toBe(0);
  });
  it("is defensive about negatives / NaN", () => {
    expect(computeEarning({ customerTotalCents: -500, commissionRate: 0.05 }).commissionCents).toBe(0);
    expect(computeEarning({ customerTotalCents: 10000, commissionRate: NaN }).commissionCents).toBe(0);
  });
});

describe("ISO week helpers", () => {
  it("computes ISO week parts (known anchors)", () => {
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    expect(isoWeekParts(new Date("2026-01-01T12:00:00Z"))).toEqual({ year: 2026, week: 1 });
    // 2026-06-24 (Wednesday) → ISO week 26.
    expect(isoWeekParts(new Date("2026-06-24T00:00:00Z"))).toEqual({ year: 2026, week: 26 });
  });
  it("rolls a Jan-1 that falls in the previous ISO year correctly", () => {
    // 2022-01-01 is a Saturday → belongs to ISO week 52 of 2021.
    expect(isoWeekParts(new Date("2022-01-01T00:00:00Z"))).toEqual({ year: 2021, week: 52 });
  });
  it("formats a zero-padded sortable key", () => {
    expect(isoWeekKey(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(isoWeekKey(new Date("2026-06-24T00:00:00Z"))).toBe("2026-W26");
  });
  it("returns the Monday that starts the week", () => {
    // Week containing Wed 2026-06-24 starts Mon 2026-06-22.
    const start = isoWeekStart(new Date("2026-06-24T00:00:00Z"));
    expect(start.getUTCFullYear()).toBe(2026);
    expect(start.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(start.getUTCDate()).toBe(22);
    expect(start.getUTCDay()).toBe(1); // Monday
  });
});

describe("groupByWeek", () => {
  it("buckets items by ISO week, newest first, summing commission", () => {
    const buckets = groupByWeek([
      { at: new Date("2026-06-24T00:00:00Z"), commissionCents: 50_000 }, // W26
      { at: new Date("2026-06-23T00:00:00Z"), commissionCents: 25_000 }, // W26
      { at: new Date("2026-06-15T00:00:00Z"), commissionCents: 10_000 }, // W25
    ]);
    expect(buckets.length).toBe(2);
    expect(buckets[0].weekKey).toBe("2026-W26");
    expect(buckets[0].count).toBe(2);
    expect(buckets[0].totalCommissionCents).toBe(75_000);
    expect(buckets[1].weekKey).toBe("2026-W25");
    expect(buckets[1].totalCommissionCents).toBe(10_000);
  });
  it("returns an empty array for no items", () => {
    expect(groupByWeek([])).toEqual([]);
  });
});

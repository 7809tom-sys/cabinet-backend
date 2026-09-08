import { describe, expect, it } from "vitest";
import {
  estimateFreight,
  resolveZone,
  normalizeZip,
  totalCartWeight,
  combineStyleFreightGroups,
  type FreightSettings,
  type FreightZoneRate,
} from "./freight";

const ZONES: FreightZoneRate[] = [
  { zoneName: "Zone 1 — Southeast", zipPrefixes: "30,31,32", rateCents: 1500 },
  { zoneName: "Zone 3 — NE/MW", zipPrefixes: "0,1,10,11", rateCents: 2600 },
  { zoneName: "Zone 5 — West", zipPrefixes: "90,91,92", rateCents: 4200 },
  { zoneName: "Atlanta Metro", zipPrefixes: "303", rateCents: 900 }, // more specific
];

const SETTINGS: FreightSettings = {
  enabled: true,
  originZip: "30303",
  rateModel: "per_cwt",
  handlingFeeCents: 0,
  minChargeCents: 8900,
  liftgateFeeCents: 7500,
  residentialFeeCents: 6500,
  insideDeliveryFeeCents: 5000,
  markupBps: 1500,
  damageFeeBps: 0,
  freeFreightThresholdCents: 0,
  defaultCabinetWeightLbs: 45,
};

describe("normalizeZip", () => {
  it("strips ZIP+4 and non-digits", () => {
    expect(normalizeZip("30303-1234")).toBe("30303");
    expect(normalizeZip(" 90210 ")).toBe("90210");
    expect(normalizeZip("abc")).toBe("");
  });
});

describe("resolveZone", () => {
  it("matches by leading prefix", () => {
    expect(resolveZone("31525", ZONES)?.zoneName).toBe("Zone 1 — Southeast");
    expect(resolveZone("10001", ZONES)?.zoneName).toBe("Zone 3 — NE/MW");
  });
  it("longest prefix wins (most specific zone)", () => {
    // 30303 matches both "30" (Zone 1) and "303" (Atlanta Metro); 303 is longer.
    expect(resolveZone("30303", ZONES)?.zoneName).toBe("Atlanta Metro");
  });
  it("returns null when nothing covers the zip", () => {
    expect(resolveZone("59001", ZONES)).toBeNull();
    expect(resolveZone("", ZONES)).toBeNull();
  });
});

describe("estimateFreight — per_cwt", () => {
  it("computes linehaul from billable weight then applies 15% markup", () => {
    // 600 lbs to Zone 1 (1500c/cwt) = 6 cwt * 1500 = 9000c base.
    // 9000 >= minCharge(8900) so no bump. markup 15% = 1350. total 10350.
    const q = estimateFreight(
      { destinationZip: "31525", totalWeightLbs: 600, merchandiseSubtotalCents: 500000 },
      SETTINGS,
      ZONES
    );
    expect(q.available).toBe(true);
    expect(q.zoneName).toBe("Zone 1 — Southeast");
    expect(q.freightBeforeMarkupCents).toBe(9000);
    expect(q.markupCents).toBe(1350);
    expect(q.totalCents).toBe(10350);
  });

  it("enforces the per-shipment minimum charge before markup", () => {
    // 100 lbs to Zone 1 = 1 cwt * 1500 = 1500c; below min 8900 -> bumped to 8900.
    // markup 15% of 8900 = 1335. total 10235.
    const q = estimateFreight(
      { destinationZip: "31525", totalWeightLbs: 100, merchandiseSubtotalCents: 100000 },
      SETTINGS,
      ZONES
    );
    expect(q.freightBeforeMarkupCents).toBe(8900);
    expect(q.markupCents).toBe(1335);
    expect(q.totalCents).toBe(10235);
    expect(q.lines.some((l) => l.label === "Minimum charge adjustment")).toBe(true);
  });

  it("adds accessorial fees when requested", () => {
    const q = estimateFreight(
      {
        destinationZip: "31525",
        totalWeightLbs: 600,
        merchandiseSubtotalCents: 500000,
        accessorials: { liftgate: true, residential: true },
      },
      SETTINGS,
      ZONES
    );
    // base 9000 + liftgate 7500 + residential 6500 = 23000 (above min)
    expect(q.freightBeforeMarkupCents).toBe(23000);
    expect(q.markupCents).toBe(3450); // 15%
    expect(q.totalCents).toBe(26450);
  });
});

describe("estimateFreight — flat model", () => {
  it("uses the zone rate as a flat charge regardless of weight", () => {
    const flat = { ...SETTINGS, rateModel: "flat" as const, minChargeCents: 0 };
    const q = estimateFreight(
      { destinationZip: "10001", totalWeightLbs: 1234, merchandiseSubtotalCents: 100000 },
      flat,
      ZONES
    );
    expect(q.freightBeforeMarkupCents).toBe(2600);
    expect(q.totalCents).toBe(2600 + 390); // +15%
  });
});

describe("estimateFreight — markup + damage + free freight", () => {
  it("applies an optional damage surcharge on the freight subtotal", () => {
    const withDamage = { ...SETTINGS, damageFeeBps: 200 }; // 2%
    const q = estimateFreight(
      { destinationZip: "31525", totalWeightLbs: 600, merchandiseSubtotalCents: 500000 },
      withDamage,
      ZONES
    );
    expect(q.damageFeeCents).toBe(180); // 2% of 9000
    expect(q.totalCents).toBe(9000 + 1350 + 180);
  });

  it("zeroes the total when the free-freight threshold is met", () => {
    const withFree = { ...SETTINGS, freeFreightThresholdCents: 400000 };
    const q = estimateFreight(
      { destinationZip: "31525", totalWeightLbs: 600, merchandiseSubtotalCents: 450000 },
      withFree,
      ZONES
    );
    expect(q.freeFreightApplied).toBe(true);
    expect(q.totalCents).toBe(0);
    // breakdown still shows the underlying freight for transparency
    expect(q.freightBeforeMarkupCents).toBe(9000);
  });

  it("does not apply free freight below the threshold", () => {
    const withFree = { ...SETTINGS, freeFreightThresholdCents: 400000 };
    const q = estimateFreight(
      { destinationZip: "31525", totalWeightLbs: 600, merchandiseSubtotalCents: 399999 },
      withFree,
      ZONES
    );
    expect(q.freeFreightApplied).toBe(false);
    expect(q.totalCents).toBeGreaterThan(0);
  });
});

describe("estimateFreight — unavailable paths", () => {
  it("reports unavailable when disabled", () => {
    const q = estimateFreight(
      { destinationZip: "31525", totalWeightLbs: 600, merchandiseSubtotalCents: 100000 },
      { ...SETTINGS, enabled: false },
      ZONES
    );
    expect(q.available).toBe(false);
  });
  it("reports unavailable for an uncovered ZIP", () => {
    const q = estimateFreight(
      { destinationZip: "59001", totalWeightLbs: 600, merchandiseSubtotalCents: 100000 },
      SETTINGS,
      ZONES
    );
    expect(q.available).toBe(false);
    expect(q.reason).toMatch(/zone/i);
  });
});

describe("totalCartWeight", () => {
  it("sums real weights and falls back to default for missing ones", () => {
    const w = totalCartWeight(
      [
        { weightLbs: 50, qty: 2 }, // 100
        { weightLbs: null, qty: 3 }, // 3 * 45 = 135
        { weightLbs: 0, qty: 1 }, // 0 treated as missing -> 45
      ],
      45
    );
    expect(w).toBe(100 + 135 + 45);
  });
});

describe("combineStyleFreightGroups", () => {
  it("adds separate Plan A style origins and applies Operations markup once", () => {
    const q = combineStyleFreightGroups({
      groups: [
        { key: "1:10", label: "Style A · 30303", originZip: "30303", source: "live", baseAmountCents: 42000 },
        { key: "2:20", label: "Style B · 32801", originZip: "32801", source: "live", baseAmountCents: 38000 },
      ],
      settings: SETTINGS,
      merchandiseSubtotalCents: 300000,
      billableWeightLbs: 1200,
      isKitchen: false,
      kitchenFreightFloorCents: 80000,
    });

    expect(q.available).toBe(true);
    expect(q.rateGroups).toHaveLength(2);
    expect(q.freightBeforeMarkupCents).toBe(80000);
    expect(q.markupCents).toBe(12000);
    expect(q.totalCents).toBe(92000);
    expect(q.lines.map((line) => line.label)).toEqual([
      "Plan A live — Style A · 30303",
      "Plan A live — Style B · 32801",
    ]);
  });

  it("uses Plan B only for the failed style group and itemizes its delivery accessorials", () => {
    const q = combineStyleFreightGroups({
      groups: [
        { key: "1:10", label: "Style A · 30303", originZip: "30303", source: "live", baseAmountCents: 42000 },
        { key: "2:20", label: "Florida Style · 32801", originZip: "32801", source: "plan_b", baseAmountCents: 35000 },
      ],
      settings: SETTINGS,
      accessorials: { residential: true, liftgate: true },
      merchandiseSubtotalCents: 300000,
      billableWeightLbs: 1200,
      isKitchen: false,
      kitchenFreightFloorCents: 80000,
    });

    expect(q.rateGroups?.map((group) => group.source)).toEqual(["live", "plan_b"]);
    expect(q.lines).toContainEqual({ label: "Liftgate service — 1 Plan B shipment", amountCents: 7500 });
    expect(q.lines).toContainEqual({ label: "Residential delivery — 1 Plan B shipment", amountCents: 6500 });
    expect(q.lines.some((line) => line.label.startsWith("Plan B fallback — Florida Style"))).toBe(true);
  });

  it("reports unavailable instead of inventing a rate when no group has Plan A or Plan B", () => {
    const q = combineStyleFreightGroups({
      groups: [],
      settings: SETTINGS,
      merchandiseSubtotalCents: 100000,
      billableWeightLbs: 400,
      isKitchen: false,
      kitchenFreightFloorCents: 80000,
    });

    expect(q.available).toBe(false);
    expect(q.reason).toMatch(/live rate or configured Plan B/i);
  });
});

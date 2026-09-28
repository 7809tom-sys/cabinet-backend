import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public cart freight shipment details", () => {
  const source = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");

  it("returns the actual live-carrier pallet plan with each successful estimate", () => {
    expect(source).toContain("const shipmentGroups: FreightShipmentGroup[] = []");
    expect(source).toContain("totalContentsWeightLbs: plan.totalContentsWeightLbs");
    expect(source).toContain("pallets: plan.pallets.map");
    expect(source).toContain("shipmentGroup.transitDays = live.transitDays");
    expect(source).toContain("shipmentGroup.estimatedDeliveryDate = live.estimatedDeliveryDate");
    expect(source).toContain("return attachFreightQuoteToken({ ...quote, shipmentGroups }, input)");
  });

  it("keeps unavailable carrier responses transparent while retaining the calculated shipment plan", () => {
    expect(source).toContain("shipmentGroups,");
    expect(source).toContain("Carrier shipping is unavailable for");
  });

  it("uses direct UPS or EasyPost parcel rating only after verified carton eligibility and otherwise retains the LTL plan", () => {
    expect(source).toContain("resolveParcelShipmentMode(resolvedGroup.parcelPackages)");
    expect(source).toContain('liveProvider === "ups"');
    expect(source).toContain('parcelDecision.eligibleCarriers.includes("ups")');
    expect(source).toContain('liveProvider === "easypost" && parcelDecision.mode === "parcel"');
    expect(source).toContain("upsParcelQuote({");
    expect(source).toContain("easypostParcelQuote(liveKey");
    expect(source).toContain("eligibleCarriers: parcelDecision.eligibleCarriers");
    expect(source).toContain('transportMode: "parcel"');
    expect(source).toContain('transportMode: "ltl"');
    expect(source).toContain('source: "parcel"');
  });
});

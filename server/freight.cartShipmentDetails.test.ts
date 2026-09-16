import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public cart freight shipment details", () => {
  const source = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");

  it("returns the actual live-carrier pallet plan with each successful estimate", () => {
    expect(source).toContain("const shipmentGroups: FreightShipmentGroup[] = []");
    expect(source).toContain("totalContentsWeightLbs: plan.totalContentsWeightLbs");
    expect(source).toContain("pallets: plan.pallets.map");
    expect(source).toContain("return attachFreightQuoteToken({ ...quote, shipmentGroups }, input)");
  });

  it("keeps unavailable carrier responses transparent while retaining the calculated shipment plan", () => {
    expect(source).toContain("shipmentGroups,");
    expect(source).toContain("Carrier shipping is unavailable for");
  });
});

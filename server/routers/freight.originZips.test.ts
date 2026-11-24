import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizedDoorStyleOriginZips } from "./freight";

describe("Door Style multiple shipping origins", () => {
  it("keeps valid unique saved origins in their configured order", () => {
    expect(normalizedDoorStyleOriginZips(["44326", "44101", "44326"], "44326")).toEqual([
      "44326",
      "44101",
    ]);
  });

  it("keeps a legacy single origin available for unchanged door styles", () => {
    expect(normalizedDoorStyleOriginZips(null, "30303")).toEqual(["30303"]);
  });

  it("does not route freight from an invalid stored origin", () => {
    expect(normalizedDoorStyleOriginZips(["not-a-zip", "60601"], "invalid")).toEqual(["60601"]);
  });

  it("does not keep the first origin when the nearest warehouse cannot be ranked", () => {
    const source = readFileSync(new URL("./freight.ts", import.meta.url), "utf8");
    expect(source).not.toContain("pickNearestWarehouseZip(customer, warehouses) ?? originZips[0]");
    expect(source).toContain("Could not choose the nearest shipping origin for this delivery ZIP.");
  });
});

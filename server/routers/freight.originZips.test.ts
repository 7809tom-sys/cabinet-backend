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
});

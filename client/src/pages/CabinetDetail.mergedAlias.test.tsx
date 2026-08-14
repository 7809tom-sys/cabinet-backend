import { describe, expect, it } from "vitest";
import { canonicalCabinetDetailCode } from "./CabinetDetail";

describe("merged cabinet detail aliases", () => {
  it("routes both retained BEC codes through canonical BA-24 without changing ordinary codes", () => {
    expect(canonicalCabinetDetailCode("BEC-24")).toBe("BA-24");
    expect(canonicalCabinetDetailCode("bec24")).toBe("BA-24");
    expect(canonicalCabinetDetailCode("BMC30")).toBe("BMC30");
  });
});

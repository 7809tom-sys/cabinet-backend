import { describe, expect, it } from "vitest";
import { canonicalCabinetDetailCode } from "./CabinetDetail";

describe("merged cabinet detail aliases", () => {
  it("routes both retained legacy codes through canonical BEC-24 without changing ordinary codes", () => {
    expect(canonicalCabinetDetailCode("BEC-24")).toBe("BEC-24");
    expect(canonicalCabinetDetailCode("BA-24")).toBe("BEC-24");
    expect(canonicalCabinetDetailCode("bec24")).toBe("BEC-24");
    expect(canonicalCabinetDetailCode("BMC30")).toBe("BMC30");
  });
});

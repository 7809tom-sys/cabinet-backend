import { describe, expect, it } from "vitest";
import { proCoversZip } from "./routers/pros";

const PLATFORM_FEE_RATE = 0.15;

describe("proCoversZip", () => {
  const fabricator = {
    serviceZips: ["30301", "30302"],
    baseZip: "30303",
    trades: ["countertop_fabrication"],
  };

  it("matches an explicit service ZIP", () => {
    expect(proCoversZip(fabricator, "30301")).toBe(true);
  });

  it("matches via shared 3-digit base ZIP prefix when not explicitly listed", () => {
    // 30350 is not in serviceZips, but shares prefix 303 with baseZip 30303
    expect(proCoversZip(fabricator, "30350")).toBe(true);
  });

  it("does not match a ZIP outside the explicit list and prefix", () => {
    expect(proCoversZip(fabricator, "10001")).toBe(false);
  });

  it("filters out pros that do not offer the requested trade", () => {
    expect(
      proCoversZip(fabricator, "30301", "installation")
    ).toBe(false);
  });

  it("matches when the requested trade is offered", () => {
    expect(
      proCoversZip(fabricator, "30301", "countertop_fabrication")
    ).toBe(true);
  });

  it("handles a pro with no explicit ZIPs but a base ZIP", () => {
    const installer = {
      serviceZips: null,
      baseZip: "60614",
      trades: ["installation"],
    };
    expect(proCoversZip(installer, "60611")).toBe(true); // 606 prefix
    expect(proCoversZip(installer, "90210")).toBe(false);
  });

  it("trims whitespace on the target ZIP", () => {
    expect(proCoversZip(fabricator, "  30301  ")).toBe(true);
  });
});

describe("platform management fee", () => {
  it("computes 15% of a quoted job", () => {
    const quoted = 4000;
    expect(quoted * PLATFORM_FEE_RATE).toBeCloseTo(600, 2);
  });
});

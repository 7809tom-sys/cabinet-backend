import { describe, expect, it } from "vitest";
import { planCabinetHardwarePosition } from "./PlanCanvas";

const b12 = (overrides: Record<string, unknown> = {}) => ({
  uid: "b12",
  cabinetId: 12,
  masterCode: "B-12",
  description: "12 inch base cabinet",
  placement: "base",
  x: 0,
  y: 0,
  width: 12,
  depth: 24,
  height: 34.5,
  rotation: 0,
  swing: "left",
  ...overrides,
} as never);

describe("Plan and 3D cabinet hardware parity", () => {
  it("retires a legacy centered B-12 handle to the same opposite-hinge side used by 3D", () => {
    expect(planCabinetHardwarePosition(b12({ hardwarePosition: "center" }))).toBe("right");
  });

  it("preserves explicit B-12 handle sides and top-centered hardware", () => {
    expect(planCabinetHardwarePosition(b12({ hardwarePosition: "left" }))).toBe("left");
    expect(planCabinetHardwarePosition(b12({ hardwarePosition: "top-center" }))).toBe("top-center");
  });
});

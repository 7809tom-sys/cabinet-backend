import { describe, expect, it } from "vitest";
import { applyCabinetDoorHardwareToAll, isCabinetDoorHardwareEligible, supportsCenteredTopDoorPull, type PlacedCabinet } from "./design";

function cabinet(overrides: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "cabinet",
    cabinetId: 1,
    masterCode: "B15",
    description: "15-inch base cabinet",
    placement: "base",
    x: 0,
    y: 0,
    width: 15,
    depth: 24,
    height: 34.5,
    rotation: 0,
    numberOfDoors: 1,
    numberOfDrawers: 1,
    ...overrides,
  } as PlacedCabinet;
}

describe("B15/B18 centered top-rail pull", () => {
  it("is offered only to B15 and B18 base cabinets and never spreads through the bulk action", () => {
    const b15 = cabinet({ uid: "b15", masterCode: "B15" });
    const b18 = cabinet({ uid: "b18", masterCode: "B18", width: 18 });
    const b24 = cabinet({ uid: "b24", masterCode: "B24", width: 24, numberOfDoors: 2 });
    const w18 = cabinet({ uid: "w18", masterCode: "W18", placement: "wall", width: 18 });
    expect(supportsCenteredTopDoorPull(b15)).toBe(true);
    expect(supportsCenteredTopDoorPull(b18)).toBe(true);
    expect(supportsCenteredTopDoorPull(b24)).toBe(false);
    expect(supportsCenteredTopDoorPull(w18)).toBe(false);
    expect(isCabinetDoorHardwareEligible(b15, "top-center")).toBe(true);
    expect(isCabinetDoorHardwareEligible(b24, "top-center")).toBe(false);
    expect(applyCabinetDoorHardwareToAll([b15, b18, b24, w18], "top-center").map((item) => item.hardwarePosition ?? null)).toEqual(["top-center", "top-center", null, null]);
  });
});

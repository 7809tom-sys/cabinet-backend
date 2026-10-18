import { describe, expect, it } from "vitest";
import { professionalAefImageFor } from "../scripts/refresh-aef-professional-images";

function sourceCabinet(masterCode: string, category: string) {
  return {
    id: 1,
    masterCode,
    category,
    numberOfDoors: null,
    numberOfDrawers: null,
    height: null,
    depth: null,
  };
}

describe("professionalAefImageFor", () => {
  it("puts all Frameless pantry drawer banks below the tall doors", () => {
    expect(professionalAefImageFor(sourceCabinet("T2DB1884", "Tall"))).toBe("tallOneDoorTwoDrawerBottom");
    expect(professionalAefImageFor(sourceCabinet("T2DB3084", "Tall"))).toBe("tallTwoDoorTwoDrawerBottom");
    expect(professionalAefImageFor(sourceCabinet("T3DB1884", "Tall"))).toBe("tallOneDoorThreeDrawerBottom");
    expect(professionalAefImageFor(sourceCabinet("T3DB3084", "Tall"))).toBe("tallTwoDoorThreeDrawerBottom");
  });

  it("uses the single-door construction illustration for 24-inch-deep refrigerator walls", () => {
    expect(professionalAefImageFor({ ...sourceCabinet("W361224", "Wall"), depth: "24" })).toBe("wallRefrigerator");
  });

  it("keeps the four source-distinct single-door products away from shared-master renders", () => {
    expect(professionalAefImageFor(sourceCabinet("B24S", "Base"))).toBe("baseSingleDoorDrawer");
    expect(professionalAefImageFor(sourceCabinet("SB24S", "Base"))).toBe("baseSingleDoorDrawer");
    expect(professionalAefImageFor(sourceCabinet("W2430S", "Wall"))).toBe("wallSingleDoor");
    expect(professionalAefImageFor(sourceCabinet("VSB24S", "Vanity"))).toBe("vanitySingleDoor");
  });

  it("uses the tall finished-panel illustration for the refrigerator-only TEP3096 source panel", () => {
    expect(professionalAefImageFor(sourceCabinet("TEP3096", "Accessory"))).toBe("accessoryPanel");
  });

  it("uses the neutral product render for all V8.2 mouldings, never a documentation or price-table asset", () => {
    for (const masterCode of ["OCM8", "BM8", "SM8", "TKC", "TKC-PVC", "CORNER-PVC"]) {
      expect(professionalAefImageFor(sourceCabinet(masterCode, "Accessory"))).toBe("accessoryMoulding");
    }
  });
});

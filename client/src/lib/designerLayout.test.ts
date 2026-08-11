import { describe, expect, it } from "vitest";
import { DESIGNER_CANVAS_CONTAINER_CLASS, DESIGNER_CONSULTANT_PLACEMENT } from "./designerLayout";

describe("designer mobile layout contract", () => {
  it("retains a visible canvas height and places the consultant with room controls", () => {
    expect(DESIGNER_CANVAS_CONTAINER_CLASS).toContain("min-h-[300px]");
    expect(DESIGNER_CONSULTANT_PLACEMENT).toBe("room-controls");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DoorStyles.tsx"), "utf8");

describe("Door Styles color rail", () => {
  it("places the six-door color slider above the existing featured cabinet cards", () => {
    expect(source).toContain("Cabinet color line");
    expect(source).toContain("Choose a door color first");
    expect(source).toContain("six door samples at a time");
    expect(source).toContain("Featured cabinet cards remain below the color line.");
    expect(source.indexOf("Cabinet color line")).toBeLessThan(source.indexOf('t("ds_featured")'));
  });

  it("uses the shared light-to-deep ordering and safe directional slider controls", () => {
    expect(source).toContain("orderDoorStylesByColor(featured)");
    expect(source).toContain("DOOR_COLOR_SPECTRUM_PAGE_SIZE");
    expect(source).toContain("AnimatePresence");
    expect(source).toContain("moveColorRail");
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("Show next six cabinet colors");
  });
});

import { describe, expect, it } from "vitest";
import { BATHROOM_STARTER_TEMPLATE, bathroomPlanningGuidance, makeBathroomStarterTemplate } from "./bathroomPlanning";
import { FURNITURE_CATALOG } from "./design";
import { verifiedPelicanBathroomFixtureProfile } from "./pelicanBathroomFixtureProfiles";

describe("Bathroom starter and clearance guidance", () => {
  it("creates movable, non-cartable vanity, toilet, and tub planning zones", () => {
    const starter = makeBathroomStarterTemplate();
    expect(starter.room).toMatchObject({ width: 120, depth: 96, ceilingHeight: 96 });
    expect(starter.furniture.map((item) => item.defId)).toEqual([
      "bathroom-zone-vanity-60",
      "bathroom-zone-toilet",
      "bathroom-zone-tub-60",
    ]);
    expect(starter.furniture.every((item) => !item.pelicanCode && !item.pelicanProductId)).toBe(true);
    expect(FURNITURE_CATALOG.filter((item) => item.category === "bathroom-zone").map((item) => item.id)).toEqual(expect.arrayContaining([
      "bathroom-zone-vanity-60",
      "bathroom-zone-toilet",
      "bathroom-zone-tub-60",
    ]));
    expect(BATHROOM_STARTER_TEMPLATE.id).toBe("bathroom-standard-zones-v1");
  });

  it("makes clearance notes advisory and source-linked rather than collision rules", () => {
    const toilet = bathroomPlanningGuidance(verifiedPelicanBathroomFixtureProfile("PL-12044"));
    const shower = bathroomPlanningGuidance(verifiedPelicanBathroomFixtureProfile("PL-03A42S"));
    expect(toilet).toMatchObject({ title: "Toilet / bidet planning check" });
    expect(toilet?.text).toContain("Advisory");
    expect(shower).toMatchObject({ title: "Shower enclosure planning check" });
    expect(shower?.text).toContain("Nominal visual envelope only");
    expect(shower?.sourceUrl).toContain("PL-03A42S.pdf");
  });
});

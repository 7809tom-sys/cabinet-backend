import { describe, expect, it } from "vitest";
import { BATHROOM_STARTER_TEMPLATE, bathroomFixtureChecklist, bathroomPlanningGuidance, bathroomZoneOverlapWarnings, makeBathroomStarterTemplate } from "./bathroomPlanning";
import { FURNITURE_CATALOG, makeFurniture } from "./design";
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

  it("warns only when a measured fixture enters a different starter zone", () => {
    const starter = makeBathroomStarterTemplate();
    const wrongZoneToilet = { ...makeFurniture("pelican-toilet-pl-12044", 8, 6), uid: "toilet-in-vanity" };
    const correctZoneToilet = { ...makeFurniture("pelican-toilet-pl-12044", 84, 12), uid: "toilet-in-toilet" };

    expect(bathroomZoneOverlapWarnings([...starter.furniture, wrongZoneToilet])).toEqual([
      expect.objectContaining({ fixtureUid: "toilet-in-vanity", fixtureLabel: "PL-12044", zoneKind: "vanity", zoneLabel: "vanity zone" }),
    ]);
    expect(bathroomZoneOverlapWarnings([...starter.furniture, correctZoneToilet])).toEqual([]);
  });

  it("reports source-verified fixture selections without turning the checklist into a clearance rule", () => {
    const furniture = [
      { ...makeFurniture("pelican-toilet-pl-12044", 84, 12), uid: "selected-toilet" },
      { ...makeFurniture("pelican-tub-pl-02849-left", 0, 64), uid: "selected-tub" },
    ];
    const checklist = bathroomFixtureChecklist({
      cabinets: [{ masterCode: "VS30", description: "30 in Vanity Sink Base", subCategory: "Vanity" }],
      sinks: [{ pelicanProfileId: "pelican-pl-3099-pearl-porcelain-undermount-vanity", pelicanFaucetProfileId: "pelican-pl-8112-cascade-vanity-brushed-nickel" }],
      selectedSurfaceCodes: ["PL-8112 BN"],
      furniture,
    });

    expect(checklist.filter((step) => !step.optional).every((step) => step.complete)).toBe(true);
    expect(checklist.find((step) => step.id === "shower")).toMatchObject({ optional: true, complete: false });
  });
});

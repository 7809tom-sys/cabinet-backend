import { describe, expect, it } from "vitest";
import { aefFramelessSpec } from "./aefFramelessSpecs";

describe("AEF Frameless specifications", () => {
  it("maps the printed style families into the catalog fields", () => {
    const torino = aefFramelessSpec("TWP");
    const palermo = aefFramelessSpec("PGW");
    const studio = aefFramelessSpec("ZC");
    expect(torino?.boxConstruction).toContain("18mm plywood");
    expect(torino?.doorPanelType).toContain("melamine");
    expect(palermo?.doorPanelType).toContain("PET laminate");
    expect(studio?.doorPanelType).toContain("7/8");
    expect(studio?.profileNotes).toContain("18–20 business days");
  });

  it("does not create a specification for SCL", () => {
    expect(aefFramelessSpec("SCL")).toBeNull();
  });

  it("fits existing varchar fields", () => {
    for (const code of ["TWP", "PGW", "ZC", "LSR", "SCL"]) {
      const spec = aefFramelessSpec(code);
      if (!spec) continue;
      expect(spec.profileNotes.length).toBeLessThanOrEqual(255);
      expect(spec.profileDescription.length).toBeLessThanOrEqual(255);
      expect(spec.sourceSpecification.length).toBeLessThanOrEqual(255);
      expect(spec.doorPanelType.length).toBeLessThanOrEqual(64);
    }
  });
});

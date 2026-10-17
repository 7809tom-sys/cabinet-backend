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

  it("maps the confirmed Slim Cava SCL finish from the V8.2 source book", () => {
    const scl = aefFramelessSpec("SCL");
    expect(scl?.doorPanelType).toContain("Slim Cava");
    expect(scl?.profileDescription).toContain("Syncron");
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

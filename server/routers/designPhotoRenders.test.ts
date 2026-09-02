import { describe, expect, it } from "vitest";
import { exactPlanPrompt, photoQualityLeadSchema, photoRenderProvenanceSchema, photoRenderProvenanceSummary } from "./designPhotoRenders";

describe("design photo render safeguards", () => {
  it("treats the captured Designer scene as a locked plan and camera reference", () => {
    const prompt = exactPlanPrompt("12 exact placed items. Countertop: Calacatta Oro.");
    expect(prompt).toContain("exact locked CabinetDealz Designer plan and camera composition");
    expect(prompt).toContain("do not add, remove, move, rotate, resize, substitute, merge, hide, or invent");
    expect(prompt).toContain("Do not change the camera angle, crop, viewpoint, or room dimensions");
    expect(prompt).toContain("Use the following reference images only to improve physically plausible surface appearance");
    expect(prompt).toContain("12 exact placed items. Countertop: Calacatta Oro.");
  });

  it("requires immutable exact-plan provenance with real product identities and a source-image hash", () => {
    const provenance = photoRenderProvenanceSchema.parse({
      contractVersion: "exact-plan-v1",
      designId: 42,
      designRevision: "2026-09-02T08:30:00.000Z",
      geometryLock: "locked-current-plan-with-placed-cabinets-and-openings",
      camera: { position: [1, 2, 3], target: [4, 5, 6], zoom: 1.25 },
      materials: [
        { role: "cabinet", productId: 12, name: "Rustic Hickory", materialImageUrl: "https://www.cabinetdealz.com/materials/hickory.webp" },
        { role: "countertop", productId: 21, name: "Calacatta Oro", materialImageUrl: "https://www.cabinetdealz.com/materials/oro.webp" },
        { role: "flooring", productId: 34, name: "Aveline 20mil", materialImageUrl: "https://buildpelican.com/materials/aveline.webp" },
        { role: "backsplash", productId: 55, name: "White tile", materialImageUrl: null },
      ],
      sourceImageHash: "a".repeat(64),
      generationMethod: "manual-final-review-image-service",
    });

    expect(photoRenderProvenanceSummary(provenance)).toContain("Saved design #42 revision 2026-09-02T08:30:00.000Z");
    expect(photoRenderProvenanceSummary(provenance)).toContain("Flooring: Aveline 20mil");
    expect(() => photoRenderProvenanceSchema.parse({ ...provenance, designId: 0 })).toThrow();
    expect(() => photoRenderProvenanceSchema.parse({ ...provenance, sourceImageHash: "not-a-hash" })).toThrow();
    expect(() => photoRenderProvenanceSchema.parse({ ...provenance, materials: provenance.materials.slice(0, 3) })).toThrow();
  });

  it("requires a consented, contactable customer lead shape for customer Photo Quality requests", () => {
    expect(photoQualityLeadSchema.parse({
      name: "Sample Customer",
      email: "customer@example.com",
      phone: "+1 (555) 555-0199",
      followUpConsent: true,
    })).toMatchObject({ phone: "+1 (555) 555-0199", followUpConsent: true });
    expect(() => photoQualityLeadSchema.parse({
      name: "Sample Customer",
      email: "customer@example.com",
      phone: "555-555-0199",
      followUpConsent: false,
    })).toThrow();
  });
});

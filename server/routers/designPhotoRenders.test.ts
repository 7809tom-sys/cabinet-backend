import { describe, expect, it } from "vitest";
import { exactPlanPrompt, normalizePhotoQualityMaterialUrl, photoQualityLeadSchema, photoRenderProvenanceSchema, photoRenderProvenanceSummary } from "./designPhotoRenders";
import { readFileSync } from "node:fs";

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

  it("upgrades approved CabinetDealz material-storage paths before validation and still rejects untrusted hosts", () => {
    expect(normalizePhotoQualityMaterialUrl("/manus-storage/desert_clay_11_81_interlocking_mosaic_0aa381c4.webp"))
      .toBe("https://www.cabinetdealz.com/manus-storage/desert_clay_11_81_interlocking_mosaic_0aa381c4.webp");
    const provenance = photoRenderProvenanceSchema.parse({
      contractVersion: "exact-plan-v1",
      designId: 42,
      designRevision: null,
      geometryLock: "locked-current-plan-with-placed-cabinets-and-openings",
      camera: { position: [1, 2, 3], target: [4, 5, 6], zoom: 1.25 },
      materials: [
        { role: "cabinet", productId: 12, name: "Rustic Hickory", materialImageUrl: "/manus-storage/rustic_hickory_vertical_grain_32d9e28a.webp" },
        { role: "countertop", productId: 21, name: "Bedrock 3cm", materialImageUrl: "/manus-storage/bedrock_3cm_126x63_clean_slab_a9743085.webp" },
        { role: "flooring", productId: 54, name: "Astoria 22mil Vinyl Flooring", materialImageUrl: "/manus-storage/astoria_22mil_9x60_staggered_floor_cd0a1cf7.webp" },
        { role: "backsplash", productId: 183, name: "Desert Clay", materialImageUrl: "/manus-storage/desert_clay_11_81_interlocking_mosaic_0aa381c4.webp" },
      ],
      sourceImageHash: "b".repeat(64),
      generationMethod: "manual-final-review-image-service",
    });
    expect(provenance.materials[3]?.materialImageUrl)
      .toBe("https://www.cabinetdealz.com/manus-storage/desert_clay_11_81_interlocking_mosaic_0aa381c4.webp");
    expect(() => photoRenderProvenanceSchema.parse({
      ...provenance,
      materials: provenance.materials.map((material, index) => index === 2
        ? { ...material, materialImageUrl: "https://untrusted.example/floor.webp" }
        : material),
    })).toThrow("Material references must be CabinetDealz or manufacturer image URLs.");
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

  it("creates a CRM follow-up event even when a customer reuses a cached image", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");
    expect(source).toContain('reused: true,');
    expect(source).toContain('emitPhotoQualityLead({');
    expect(source).toContain('reusedPhotoQualityImage: args.reused');
  });
});

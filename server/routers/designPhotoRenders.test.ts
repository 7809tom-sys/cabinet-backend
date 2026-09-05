import { describe, expect, it } from "vitest";
import { canonicalizeDeterministicRenderProvenance, exactPlanPrompt, normalizePhotoQualityMaterialUrl, photoQualityLeadSchema, photoRenderProvenanceSchema, photoRenderProvenanceSummary, readJpegDimensions } from "./designPhotoRenders";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

describe("design photo render safeguards", () => {
  it("treats the captured Designer scene as a locked plan and camera reference", () => {
    const prompt = exactPlanPrompt("12 exact placed items. Countertop: Calacatta Oro.");
    expect(prompt).toContain("exact locked CabinetDealz Designer plan and camera composition");
    expect(prompt).toContain("not a screenshot, wireframe, illustration, or a copy of the reference pixels");
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
      planFingerprint: "c".repeat(64),
      geometryLock: "locked-current-plan-with-placed-cabinets-and-openings",
      camera: { position: [1, 2, 3], target: [4, 5, 6], zoom: 1.25 },
      materials: [
        { role: "cabinet", productId: 12, name: "Rustic Hickory", materialImageUrl: "https://www.cabinetdealz.com/materials/hickory.webp" },
        { role: "countertop", productId: 21, name: "Calacatta Oro", materialImageUrl: "https://www.cabinetdealz.com/materials/oro.webp" },
        { role: "flooring", productId: 34, name: "Aveline 20mil", materialImageUrl: "https://buildpelican.com/materials/aveline.webp" },
        { role: "backsplash", productId: 55, name: "White tile", materialImageUrl: null },
        { role: "faucet", productId: 71, name: "Pull-down Faucet", materialImageUrl: null },
        { role: "sink", productId: 72, name: "Single Bowl Sink", materialImageUrl: null },
      ],
      sourceImageHash: "a".repeat(64),
      generationMethod: "manual-final-review-image-service",
    });

    expect(photoRenderProvenanceSummary(provenance)).toContain("Saved design #42 revision 2026-09-02T08:30:00.000Z");
    expect(photoRenderProvenanceSummary(provenance)).toContain("Flooring: Aveline 20mil");
    expect(photoRenderProvenanceSchema.parse({ ...provenance, designId: 0 }).designId).toBe(0);
    expect(() => photoRenderProvenanceSchema.parse({ ...provenance, designId: -1 })).toThrow();
    expect(() => photoRenderProvenanceSchema.parse({ ...provenance, sourceImageHash: "not-a-hash" })).toThrow();
    expect(() => photoRenderProvenanceSchema.parse({ ...provenance, materials: provenance.materials.slice(0, 3) })).toThrow();
  });

  it("upgrades approved CabinetDealz material-storage paths before validation and still rejects untrusted hosts", () => {
    expect(normalizePhotoQualityMaterialUrl("/manus-storage/desert_clay_11_81_interlocking_mosaic_0aa381c4.webp"))
      .toBe("https://www.cabinetdealz.com/manus-storage/desert_clay_11_81_interlocking_mosaic_0aa381c4.webp");
    expect(normalizePhotoQualityMaterialUrl("https://3000-preview.manus.space/manus-storage/astoria.webp"))
      .toBe("https://www.cabinetdealz.com/manus-storage/astoria.webp");
    expect(normalizePhotoQualityMaterialUrl("https://3000-preview.manus.space/not-material/astoria.webp"))
      .toBe("https://3000-preview.manus.space/not-material/astoria.webp");
    const provenance = photoRenderProvenanceSchema.parse({
      contractVersion: "exact-plan-v1",
      designId: 42,
      designRevision: null,
      planFingerprint: "d".repeat(64),
      geometryLock: "locked-current-plan-with-placed-cabinets-and-openings",
      camera: { position: [1, 2, 3], target: [4, 5, 6], zoom: 1.25 },
      materials: [
        { role: "cabinet", productId: 12, name: "Rustic Hickory", materialImageUrl: "/manus-storage/rustic_hickory_vertical_grain_32d9e28a.webp" },
        { role: "countertop", productId: 21, name: "Bedrock 3cm", materialImageUrl: "/manus-storage/bedrock_3cm_126x63_clean_slab_a9743085.webp" },
        { role: "flooring", productId: 54, name: "Astoria 22mil Vinyl Flooring", materialImageUrl: "/manus-storage/astoria_22mil_9x60_staggered_floor_cd0a1cf7.webp" },
        { role: "backsplash", productId: 183, name: "Desert Clay", materialImageUrl: "/manus-storage/desert_clay_11_81_interlocking_mosaic_0aa381c4.webp" },
        { role: "faucet", productId: 71, name: "Pull-down Faucet", materialImageUrl: null },
        { role: "sink", productId: 72, name: "Single Bowl Sink", materialImageUrl: null },
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

  it("creates the CRM follow-up event only after the customer phone is verified", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");
    expect(source).toContain('request.verificationStatus === "verified"');
    expect(source).toContain('emitPhotoQualityLead({');
    expect(source).toContain('phoneVerification: "verified_twilio"');
  });

  it("persists a deterministic high-resolution exact-scene render rather than submitting the locked screenshot to an image interpreter", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");
    expect(source).toContain("manual-final-review-deterministic-webgl-v1");
    expect(source).toContain("storagePut(");
    expect(source).toContain("deterministic-webgl-high-resolution-v1");
    expect(source).not.toContain("generateImage(");
  });

  it("keeps the separately approved Google image test administrator-only, saved-plan locked, and outside the customer CRM flow", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");
    expect(source).toContain("startGeminiImageTest: protectedProcedure");
    expect(source).toContain("pollGeminiImageTest: protectedProcedure");
    expect(source).toContain("getGeminiImageTestJob: protectedProcedure");
    expect(source).toContain('if (ctx.user.role !== "admin")');
    expect(source).toContain("Save the current kitchen plan before running a Google image test.");
    expect(source).toContain("validatePhotoProvenanceAgainstSavedDesign(input.provenance, design)");
    expect(source).toContain("startGeminiExactPlanTest({");
    expect(source).toContain("pollGeminiExactPlanTest(job.interactionId)");
    expect(source).toContain("designGeminiImageTestJobs");
    expect(source).toContain("admin-google-image-tests/");
    expect(source).toContain('generationMethod: "manual-final-review-gemini-nano-banana-v1"');
  });

  it("persists the administrator Google image test by saved-plan ID and reopens only the current locked plan revision", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");
    expect(source).toContain("getSavedGeminiImageTest: protectedProcedure");
    expect(source).toContain("eq(designPhotoRenders.kitchenDesignId, design.id)");
    expect(source).toContain('eq(designPhotoRenders.generationMethod, "manual-final-review-gemini-nano-banana-v1")');
    expect(source).toContain("provenance.designRevision !== savedPhotoPlanRevision(design)");
    expect(source).toContain("provenance.planFingerprint !== savedPhotoPlanFingerprint(design)");
    expect(source).toContain("kitchenDesignId: design.id");
    expect(source).toContain("onDuplicateKeyUpdate({");
  });

  it("expires an abandoned pending Google job so the same saved plan can start a new test", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");
    expect(source).toContain("const GEMINI_IMAGE_TEST_STALE_MS = 5 * 60 * 1000");
    expect(source).toContain("The earlier Google image test expired before it completed. You can start a new test.");
    expect(source).toContain("startedAt: job.startedAt");
  });

  it("reads actual deterministic JPEG dimensions instead of trusting a client resolution claim", () => {
    // Minimal JPEG with a baseline SOF0 segment declaring a 2560 × 1440 capture.
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0xa0, 0x0a, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
    expect(readJpegDimensions(bytes)).toEqual({ width: 2560, height: 1440 });
    expect(() => readJpegDimensions(Buffer.from("not-a-jpeg"))).toThrow("must be a JPEG");
  });

  it("stores a canonical server hash for the exact decoded deterministic JPEG when mobile client metadata drifts", () => {
    const provenance = photoRenderProvenanceSchema.parse({
      contractVersion: "exact-plan-v1",
      designId: 0,
      designRevision: null,
      planFingerprint: "e".repeat(64),
      geometryLock: "locked-current-plan-with-placed-cabinets-and-openings",
      camera: { position: [1, 2, 3], target: [4, 5, 6], zoom: 1.25 },
      materials: [
        { role: "cabinet", productId: 12, name: "Rustic Hickory", materialImageUrl: null },
        { role: "countertop", productId: 21, name: "Calacatta Oro", materialImageUrl: null },
        { role: "flooring", productId: 34, name: "Astoria", materialImageUrl: null },
        { role: "backsplash", productId: 55, name: "Desert Clay", materialImageUrl: null },
        { role: "faucet", productId: 71, name: "Pull-down Faucet", materialImageUrl: null },
        { role: "sink", productId: 72, name: "Single Bowl Sink", materialImageUrl: null },
      ],
      sourceImageHash: "f".repeat(64),
      generationMethod: "manual-final-review-deterministic-webgl-v1",
    });
    const exactJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0xa0, 0x0a, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);

    const canonical = canonicalizeDeterministicRenderProvenance(provenance, exactJpegBytes);

    expect(canonical.sourceImageHash).toBe(createHash("sha256").update(exactJpegBytes).digest("hex"));
    expect(canonical.sourceImageHash).not.toBe(provenance.sourceImageHash);
    expect(canonical.geometryLock).toBe(provenance.geometryLock);
    expect(canonical.camera).toEqual(provenance.camera);
    expect(canonical.materials).toEqual(provenance.materials);
  });

  it("does not reject an exact JPEG solely because a client-reported hash differs", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");
    expect(source).toContain("canonicalizeDeterministicRenderProvenance(input.provenance, renderedBytes)");
    expect(source).toContain("storing the canonical byte hash");
    expect(source).not.toContain("The locked deterministic render did not match its recorded source hash");
  });
});

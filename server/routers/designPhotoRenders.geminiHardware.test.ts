import { describe, expect, it } from "vitest";
import { exactPlanPrompt, photoRenderProvenanceSchema } from "./designPhotoRenders";

const hardware = {
  id: "hardware:handles", role: "hardware/handles", label: "Bar Pulls", itemIds: ["b12"],
  referenceUrl: null, referenceSource: "locked-designer-jpeg", provenance: "hardware/handles: Bar Pulls",
};
const product = {
  id: "surface:countertop", role: "countertop", label: "Calacatta Oro", itemIds: ["surface:countertop"],
  referenceUrl: "https://www.cabinetdealz.com/manus-storage/oro.jpg", provenance: "Exact product reference",
};
function request(entries: unknown[]) {
  return {
    contractVersion: "exact-plan-v1", designId: 0, designRevision: null,
    planFingerprint: "a".repeat(64), geometryLock: "locked-designer-plan-geometry",
    camera: { position: [1, 2, 3], target: [0, 0, 0], zoom: 1 },
    materials: ["cabinet", "countertop", "flooring", "backsplash", "faucet", "sink"].map(role => ({ role, productId: null, name: null, materialImageUrl: null })),
    materialManifest: entries, missingMaterialInputs: [], sourceImageHash: "b".repeat(64),
    generationMethod: "manual-final-review-deterministic-webgl-v1",
  };
}

describe("Gemini generic hardware source validation", () => {
  it("accepts and persists locked-view Bar Pulls alongside exact product images", () => {
    const parsed = photoRenderProvenanceSchema.parse(request([product, hardware]));
    expect(parsed.materialManifest[1]).toMatchObject(hardware);
  });
  it("requires an explicit locked-image source if a product has no swatch", () => {
    for (const role of ["countertop", "flooring", "backsplash", "cabinet door/finish"]) {
      expect(photoRenderProvenanceSchema.safeParse(request([{ ...product, role, referenceUrl: null }])).success).toBe(false);
      expect(photoRenderProvenanceSchema.safeParse(request([{ ...product, role, referenceUrl: null, referenceSource: "locked-designer-jpeg" }])).success).toBe(true);
    }
  });
  it("never represents a supplied product swatch as a locked-image prediction", () => {
    expect(photoRenderProvenanceSchema.safeParse(request([{ ...hardware, role: "unsupported" }])).success).toBe(false);
    expect(photoRenderProvenanceSchema.safeParse(request([{ ...hardware, referenceUrl: product.referenceUrl }])).success).toBe(false);
    expect(photoRenderProvenanceSchema.safeParse(request([{ ...hardware, referenceSource: undefined }])).success).toBe(false);
  });
  it("still rejects untrusted product-image hosts", () => {
    expect(photoRenderProvenanceSchema.safeParse(request([{ ...product, referenceUrl: "https://untrusted.example/image.jpg" }])).success).toBe(false);
  });
  it("normalizes legacy long description/URL IDs without losing product identity or creating prefix collisions", () => {
    const prefix = `cabinet:${"Long description ".repeat(15)}|https://www.cabinetdealz.com/manus-storage/`;
    const first = { ...product, id: `${prefix}first.jpg` };
    const second = { ...product, id: `${prefix}second.jpg` };
    const parsed = photoRenderProvenanceSchema.parse(request([first, second]));
    expect(parsed.materialManifest[0].id.length).toBeLessThanOrEqual(160);
    expect(parsed.materialManifest[0].id).not.toBe(parsed.materialManifest[1].id);
    expect(parsed.materialManifest[0]).toMatchObject({ label: first.label, referenceUrl: first.referenceUrl, itemIds: first.itemIds });
    expect(photoRenderProvenanceSchema.parse(request([first])).materialManifest[0].id).toBe(parsed.materialManifest[0].id);
  });
  it("instructs Gemini to preserve depicted hardware rather than invent a product", () => {
    expect(exactPlanPrompt("Kitchen")).toContain("Preserve their exact visible shape, finish, count and placement from the locked Designer image 1");
    expect(exactPlanPrompt("Kitchen")).toContain("do not invent or substitute a hardware product");
  });
});

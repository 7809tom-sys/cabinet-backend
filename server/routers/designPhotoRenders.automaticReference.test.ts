import { describe, expect, it } from "vitest";
import { exactPlanPrompt, photoRenderProvenanceSchema } from "./designPhotoRenders";
const product = {
  id: "surface:countertop", role: "countertop", label: "Selected countertop", itemIds: ["surface:countertop"],
  referenceUrl: "https://www.cabinetdealz.com/manus-storage/selected.jpg", provenance: "Selected product reference",
};
function request(entries: unknown[]) {
  return {
    contractVersion: "exact-plan-v1", designId: 0, designRevision: null,
    planFingerprint: "a".repeat(64), geometryLock: "locked-current-designer-plan-geometry",
    camera: { position: [1, 2, 3], target: [0, 0, 0], zoom: 1 },
    materials: ["cabinet", "countertop", "flooring", "backsplash", "faucet", "sink"].map(role => ({ role, productId: null, name: null, materialImageUrl: null })),
    materialManifest: entries, missingMaterialInputs: [], sourceImageHash: "b".repeat(64),
    generationMethod: "manual-final-review-gemini-nano-banana-v1",
  };
}
describe("Gemini automatic missing-swatch rule", () => {
  it.each(["appliance", "cabinet door/finish", "countertop", "flooring", "backsplash", "sink", "faucet"])("renders %s from the locked image if its swatch is missing", role => {
    const fallback = { ...product, id: `${role}:item`, role, referenceUrl: null, referenceSource: "locked-designer-jpeg" };
    expect(photoRenderProvenanceSchema.parse(request([fallback])).materialManifest[0]).toMatchObject({ ...fallback, provenance: `${role}: ${fallback.label}` });
  });
  it("accepts the exact smooth-top planning cooktop from the screenshot without a fake product", () => {
    const fallback = { ...product, id: "appliance:cooktop", role: "appliance", label: "CATALOG-APPLIANCE-smooth-top — Smooth-glass cooktop layout visual", itemIds: ["sb36:cooktop"], referenceUrl: null, referenceSource: "locked-designer-jpeg" };
    expect(photoRenderProvenanceSchema.parse(request([fallback])).materialManifest[0]).toMatchObject({ ...fallback, provenance: `appliance: ${fallback.label}` });
  });
  it("does not accept unsupported fallback roles, missing item mappings, or absent source-image hashes", () => {
    const fallback = { ...product, referenceUrl: null, referenceSource: "locked-designer-jpeg" };
    expect(photoRenderProvenanceSchema.safeParse(request([{ ...fallback, role: "random scene" }])).success).toBe(false);
    expect(photoRenderProvenanceSchema.safeParse(request([{ ...fallback, itemIds: [] }])).success).toBe(false);
    expect(photoRenderProvenanceSchema.safeParse({ ...request([fallback]), sourceImageHash: "" }).success).toBe(false);
  });
  it("still validates provided swatches and never discards a real product reference", () => {
    expect(photoRenderProvenanceSchema.parse(request([product])).materialManifest[0].referenceUrl).toBe(product.referenceUrl);
    expect(photoRenderProvenanceSchema.safeParse(request([{ ...product, referenceUrl: "https://untrusted.example/fake.jpg" }])).success).toBe(false);
  });
  it("tells Gemini to predict only missing-swatches while preserving layout and using exact supplied swatches", () => {
    const prompt = exactPlanPrompt("Kitchen");
    expect(prompt).toContain("If an item has no swatch");
    expect(prompt).toContain("automatically render its appearance from image 1 and its saved description");
    expect(prompt).toContain("inferred appearance, not a verified product match");
  });
  it("requires every glass stacker above its named parent and never carries a Designer wall into the crop", () => {
    const prompt = exactPlanPrompt("Kitchen", { perimeterCabinets: { name: null, color: null, doorStyle: null, productId: null, materialImageUrl: null }, islandCabinets: null, perimeterCountertop: null, islandCountertop: null, hardware: null, appliances: [], glassStackers: [{ code: "W3612GD", parentCode: "WR3612", frontFlush: true, falseBack: true }] });
    expect(prompt).toContain("wall-free cabinet crop");
    expect(prompt).toContain("W3612GD sits visibly ABOVE WR3612");
    expect(prompt).toContain("false back");
    expect(prompt).toContain("Render each listed glass stacker exactly once");
  });
});

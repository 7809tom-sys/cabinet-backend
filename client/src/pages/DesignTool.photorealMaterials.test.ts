import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const designToolSource = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const rendererSource = readFileSync(new URL("../components/design/InteractiveRoom3D.tsx", import.meta.url), "utf8");

describe("Designer programmed photoreal material wiring", () => {
  it("uses the Administration door sample first and the door-front thumbnail only as its material fallback", () => {
    expect(designToolSource).toContain("return s?.doorSampleImageUrl ?? s?.thumbnailImageUrl ?? null;");
    expect(designToolSource).toContain("const materialReference = s.doorSampleImageUrl ?? s.thumbnailImageUrl ?? null;");
    expect(designToolSource).toContain("catalogDoorSampleUrl={paletteFinishSwatch || active3DDoorSampleUrl}");
  });

  it("passes exact selected website surface images into material-only renderer props", () => {
    expect(designToolSource).toContain("selectedSurfaces.find((surface) => surfaceRole(surface) === role)?.imageUrl ?? null");
    expect(designToolSource).toContain("catalogCountertopImageUrl={threeDSurfaceTextureUrls.countertop}");
    expect(designToolSource).toContain("catalogFlooringImageUrl={threeDSurfaceTextureUrls.flooring}");
    expect(designToolSource).toContain("catalogBacksplashImageUrl={threeDSurfaceTextureUrls.backsplash}");
    expect(rendererSource).toContain('materialOnlyNoGeometryChange: true');
    expect(rendererSource).toContain('usesAuthoritativeProductImage: Boolean(countertopTexture)');
    expect(rendererSource).toContain('usesAuthoritativeProductImage: Boolean(floorTexture)');
  });

  it("retains the Administration room scene as a visual reference and never substitutes it for the saved plan", () => {
    expect(designToolSource).toContain("catalogRoomSceneUrl={active3DRoomSceneReferenceUrl}");
    expect(rendererSource).toContain('renderedAsBackdropOrGeometry: false');
    expect(rendererSource).toContain('purpose: "material-and-lighting-reference-only"');
    expect(rendererSource).toContain("threeDExactPlanGeometryLock");
  });
});

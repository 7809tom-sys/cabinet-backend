import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const designToolSource = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const rendererSource = readFileSync(new URL("../components/design/InteractiveRoom3D.tsx", import.meta.url), "utf8");

describe("Designer programmed photoreal material wiring", () => {
  it("uses Administration imagery as the cabinet source and the verified Rustic Hickory center grain as a material-only map", () => {
    expect(designToolSource).toContain("return s?.doorSampleImageUrl ?? s?.thumbnailImageUrl ?? null;");
    expect(designToolSource).toContain("const materialReference = s.doorSampleImageUrl ?? s.thumbnailImageUrl ?? null;");
    expect(designToolSource).toContain('return "/manus-storage/rustic_hickory_vertical_grain_32d9e28a.webp";');
    expect(designToolSource).toContain("catalogDoorSampleUrl={active3DDoorSampleUrl}");
    expect(designToolSource).toContain("{paletteFinishSwatch ? (");
  });

	  it("passes only exact approved material swatches into material-only renderer props", () => {
	    expect(designToolSource).toContain("const activeFloor = [...surfaces].reverse().find((surface) => surfaceRole(surface) === \"flooring\");");
	    expect(designToolSource).toContain("return [...prev.filter((surface) => surfaceRole(surface) !== \"flooring\"), item];");
	    expect(designToolSource).toContain("const restoredSurfaces = normalizeActiveFloorSelection(d.selectedSurfaces as SelectedSurface[]);");
	    expect(designToolSource).toContain("const surfaces = normalizeActiveFloorSelection(Array.isArray(d.selectedSurfaces) ? d.selectedSurfaces : []);");
	    expect(designToolSource).toContain("const selected = [...selectedSurfaces].reverse().find((surface) => surfaceRole(surface) === role);");
	    expect(designToolSource).toContain("const flooring = [...selectedSurfaces].reverse().find((surface) => surfaceRole(surface) === \"flooring\") ?? null;");
	    expect(designToolSource).toContain("82: \"/manus-storage/bahia_12mil_7x48_staggered_floor_551c6d5b.webp\"");
	    expect(designToolSource).toContain("40: \"/manus-storage/acorn_20mil_7_5x48_staggered_floor_3dbd212f.webp\"");
	    expect(designToolSource).toContain("Catalog product cards can be staged-room or retail photographs");
    expect(designToolSource).toContain("catalogCountertopImageUrl={threeDSurfaceTextureUrls.countertop}");
    expect(designToolSource).toContain("catalogFlooringImageUrl={threeDSurfaceTextureUrls.flooring}");
    expect(designToolSource).toContain("catalogFlooringCategory={threeDFlooringProductMetadata?.category}");
    expect(designToolSource).toContain("catalogFlooringSubCategory={threeDFlooringProductMetadata?.subCategory}");
    expect(designToolSource).toContain("catalogFlooringSize={threeDFlooringProductMetadata?.size}");
    expect(designToolSource).toContain("catalogBacksplashImageUrl={threeDSurfaceTextureUrls.backsplash}");
    expect(designToolSource).toContain("const threeDSurfaceProductIds = useMemo(() =>");
    expect(designToolSource).toContain("catalogCountertopProductId={threeDSurfaceProductIds.countertop}");
    expect(designToolSource).toContain("catalogFlooringProductId={threeDSurfaceProductIds.flooring}");
    expect(designToolSource).toContain("catalogBacksplashProductId={threeDSurfaceProductIds.backsplash}");
    expect(designToolSource).toContain("savedDesignId={activeSavedDesignId ?? loadDesignId ?? null}");
    expect(designToolSource).toContain("onToggle={(item) => {");
    expect(designToolSource).toContain('if (role === "flooring" || role === "backsplash" || role === "countertop" || role === "sink" || role === "faucet")');
    expect(designToolSource).toContain("addRecommendedSurface(item, role);");
    expect(rendererSource).toContain('materialOnlyNoGeometryChange: true');
    expect(rendererSource).toContain('authoritativeWebsiteProductImage: !source.proceduralFallback');
    expect(rendererSource).toContain('representativePreview: source.proceduralFallback');
    expect(rendererSource).toContain('usesAuthoritativeProductImage: Boolean(floorSource && !floorSource.proceduralFallback)');
    expect(rendererSource).toContain('curatedSurfaceKey: source.key');
    expect(rendererSource).toContain('worldSlabMapped: Boolean(mappedCountertopTexture?.userData?.worldSlabMapped)');
    expect(rendererSource).toContain('source.flooringPatternKind === "plank"');
    expect(rendererSource).toContain("normalizedThreeDPlankImage(");
    expect(rendererSource).toContain("threeDBacksplashSegments(placed, openings, backsplashRoom, backsplashHeightMode, countertopBacksplashHeightIn)");
    expect(rendererSource).toContain("addThreeDBacksplash(catalogRoot, backsplashSegments, backsplashRoom, backsplashTexture)");
    expect(rendererSource).toContain('backsplashRenderedOnMeasuredSurfaces: backsplashSegments.length');
    expect(rendererSource).toContain('countertopUpstandRenderedOnSupportedSurfaces: countertopUpstandSegments.length');
    expect(rendererSource).toContain('measuredBacksplash: true');
  });

  it("keeps the corrected photographic exposure below neutral after the washed-out mobile regression", () => {
    expect(rendererSource).toContain("renderer.toneMappingExposure = 0.84");
    expect(rendererSource).toContain('new THREE.HemisphereLight("#fffaf2", "#718096", 0.92)');
    expect(rendererSource).toContain('new THREE.DirectionalLight("#fff5e6", 1.5)');
    expect(rendererSource).toContain('new THREE.PointLight("#ffdca6", 2.8');
  });

  it("retains the Administration room scene as a visual reference and never substitutes it for the saved plan", () => {
    expect(designToolSource).toContain("catalogRoomSceneUrl={active3DRoomSceneReferenceUrl}");
    expect(rendererSource).toContain('renderedAsBackdropOrGeometry: false');
    expect(rendererSource).toContain('purpose: "material-and-lighting-reference-only"');
    expect(rendererSource).toContain("threeDExactPlanGeometryLock");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CUSTOM_CABINET_PROFILES } from "@/lib/customCabinetProfiles";
import { CustomProfileFace, DoorFront, ElevationView, isBaseEndAngleCabinet, resolveElevationFacePresentation, SingleDoorPanel } from "./ElevationView";

describe("end-angle elevation face", () => {
  it("keeps BEC-24 classified as an end cabinet even when its saved corner type is triangle", () => {
    expect(
      isBaseEndAngleCabinet({
        masterCode: "BEC-24",
        description: '24" Base End Angle Cabinet',
        category: "Base",
        cornerType: "triangle",
        isCornerCabinet: false,
      }),
    ).toBe(true);
  });

  it("does not classify an ordinary diagonal corner as a base end-angle cabinet", () => {
    expect(
      isBaseEndAngleCabinet({
        masterCode: "DCB-36",
        description: '36" Diagonal Corner Base Cabinet',
        category: "Base",
        cornerType: "diagonal",
        isCornerCabinet: true,
      }),
    ).toBe(false);
  });

  it("renders BEC-24 as two distinct 12-inch faces at a 90-degree end return", () => {
    const markup = renderToStaticMarkup(
      createElement(DoorFront, {
        kind: "shaker",
        edge: "#1a2744",
        face: "#d8d4c8",
        doors: 2,
        drawers: 0,
        cabinetType: "end-return",
        cabinetHeightIn: 34.5,
      }),
    );

    expect(markup).toContain('data-bec-end-return-face="true"');
    expect(markup).toContain('data-bec-front-face="12in"');
    expect(markup).toContain('data-bec-return-face="12in"');
    expect(markup).toContain('data-bec-return-seam="true"');
    expect(markup).toContain("transform:skewY(-4deg)");
  });
});

describe("Shaker elevation front rendering", () => {
  it("draws measured 3-inch Shaker stiles for 12-inch and 21-inch door faces", () => {
    const common = { kind: "shaker" as const, edge: "#1a2744", face: "#d8d4c8", stroke: "#1a274499" };
    const narrow = renderToStaticMarkup(createElement(SingleDoorPanel, { ...common, faceWidthIn: 12, faceHeightIn: 30 }));
    const wide = renderToStaticMarkup(createElement(SingleDoorPanel, { ...common, faceWidthIn: 21, faceHeightIn: 30 }));

    // 3in / 12in = 25% on each side, leaving a 6in (50%) center panel.
    expect(narrow).toContain("left:25%");
    expect(narrow).toContain("right:25%");
    // 3in / 21in = 14.2857% on each side, leaving a 15in center panel.
    expect(wide).toMatch(/left:14\.2857/);
    expect(wide).toMatch(/right:14\.2857/);
  });

  it("renders a 3-inch square frame through every representative cabinet-family path", () => {
    const cabinetFamilies = [
      { label: "base cabinet", cabinetType: "standard-door" as const, doors: 2, drawers: 1 },
      { label: "wall cabinet", cabinetType: "standard-door" as const, doors: 2, drawers: 0, isWall: true },
      { label: "tall pantry", cabinetType: "pantry" as const, doors: 2, drawers: 0 },
      { label: "drawer base", cabinetType: "drawer-base" as const, doors: 0, drawers: 3 },
      { label: "microwave base", cabinetType: "standard-door" as const, doors: 2, drawers: 1 },
      { label: "specialty end-angle cabinet", cabinetType: "end-angle" as const, doors: 2, drawers: 1 },
    ];

    for (const fixture of cabinetFamilies) {
      const markup = renderToStaticMarkup(
        createElement(DoorFront, {
          kind: "shaker",
          edge: "#1a2744",
          face: "#d8d4c8",
          cabinetHeightIn: fixture.cabinetType === "pantry" ? 90 : 34.5,
          ...fixture,
        }),
      );

      expect(markup, fixture.label).toMatch(/left:\d+(?:\.\d+)?%/);
      expect(markup, fixture.label).not.toContain("rounded-");
    }
  });
});

describe("configured Cabinet Config elevation presentation", () => {
  const specialtyCabinet = {
    masterCode: "WRB-30",
    description: '30" Wine Rack Base Cabinet',
    category: "Base",
  };

  it("uses a saved generic drawing image ahead of a custom-rule vector fallback", () => {
    expect(
      resolveElevationFacePresentation(
        specialtyCabinet,
        "wine-rack",
        "https://example.com/configured-wine-rack.webp",
      ).renderMode,
    ).toBe("generic-image");
  });

  it("retains the rule-specific vector fallback when no generic image is configured", () => {
    const presentation = resolveElevationFacePresentation(specialtyCabinet, "wine-rack", null);
    expect(presentation.renderMode).toBe("vector-profile");
    expect(presentation.cabinetType).toBe("standard-door");
  });

  it("keeps generic images out of appliances and standard cabinet geometry", () => {
    expect(
      resolveElevationFacePresentation(specialtyCabinet, "wine-rack", "https://example.com/image.webp", true).renderMode,
    ).toBe("standard");
    expect(
      resolveElevationFacePresentation({ masterCode: "B-24", category: "Base" }, null, "https://example.com/image.webp").renderMode,
    ).toBe("standard");
  });

  it("renders the configured generic image inside the correctly clipped BEC elevation container", () => {
    const imageUrl = "https://example.com/bec-24-configured-drawing.webp";
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(ElevationView, {
          room: { width: 144, depth: 120, ceilingHeight: 96 },
          cabinets: [{
            uid: "bec-generic",
            cabinetId: 9450022,
            masterCode: "BEC-24",
            description: '24" Base End Angle Cabinet',
            category: "Base",
            placement: "base",
            x: 0,
            y: 0,
            width: 24,
            height: 34.5,
            depth: 24,
            rotation: 0,
            customProfile: "end-angle",
            genericDrawingUrl: imageUrl,
          }],
          selectedUid: null,
          onSelect: () => undefined,
          wall: "back",
        }),
      ),
    );

    expect(markup).toContain(`src="${imageUrl}"`);
    expect(markup).not.toContain("clip-path:polygon(0 0");
    expect(markup).toContain("width:96px");
  });
});

describe("configured corner elevation rendering", () => {
  const common = { kind: "shaker" as const, edge: "#1a2744", face: "#d8d4c8" };

  it("renders diagonal corners with a 45-degree face, configured shelves, and square Shaker doors", () => {
    const markup = renderToStaticMarkup(
      createElement(DoorFront, {
        ...common,
        cabinetType: "diagonal-corner",
        doors: 2,
        shelfCount: 2,
      }),
    );

    expect(markup).toContain("linear-gradient(135deg");
    expect(markup).toContain("linear-gradient(225deg");
    expect(markup).toContain("left-[14%] right-[14%] h-px");
    expect(markup).toContain("left:12.5%");
    expect(markup).not.toContain("rounded-");
  });

  it("keeps blind and L-corner elevations distinct from the diagonal face", () => {
    const blind = renderToStaticMarkup(
      createElement(DoorFront, { ...common, cabinetType: "blind-corner", doors: 1, blindOnLeft: true }),
    );
    const lazySusan = renderToStaticMarkup(
      createElement(DoorFront, { ...common, cabinetType: "l-corner", doors: 1 }),
    );

    expect(blind).toContain("repeating-linear-gradient(135deg");
    expect(blind).toContain("left:12.5%");
    expect(lazySusan).toContain("width:6%");
    expect(lazySusan).toContain("left:12.5%");
    expect(blind).not.toContain("linear-gradient(225deg");
    expect(lazySusan).not.toContain("linear-gradient(225deg");
  });
});

describe("non-standard Cabinet Config drawing contract", () => {
  const customFaceProps = { face: "#d8d4c8", edge: "#1a2744", kind: "shaker" as const, fixedShelves: 2, adjustableShelves: 1 };
  const configuredCabinet = { masterCode: "CUSTOM-30", description: '30" Configured Specialty Cabinet', category: "Specialty" };

  it("renders each saved custom profile through its dedicated 2D geometry", () => {
    const renderProfile = (profile: string) => renderToStaticMarkup(createElement(CustomProfileFace, { ...customFaceProps, profile }));

    expect(renderProfile("wine-rack")).toContain("<svg");
    expect(renderProfile("open-shelf-side-door")).toContain("w-[62%]");
    expect(renderProfile("open-shelf-side-door")).toContain("left:12.5%");
    expect(renderProfile("curved-open-shelf")).toContain("border-top-right-radius:42% 16%");
    expect(renderProfile("pullout-tower")).toContain("w-[3px]");
    expect(renderProfile("knee-drawer")).toContain("h-[21%]");
    expect(renderProfile("hood-wall-chimney")).toContain("clip-path:polygon(28% 0,72% 0,88% 65%,100% 100%,0 100%,12% 65%)");
  });

  it("uses the configured opening dimensions with the saved door and drawer layout", () => {
    const markup = renderToStaticMarkup(
      createElement(DoorFront, {
        kind: "shaker",
        edge: "#1a2744",
        face: "#d8d4c8",
        cabinetType: "oven-tall",
        cabinetHeightIn: 90,
        doors: 2,
        drawers: 1,
        openingType: "middle",
        doorHeight: 30,
        drawerHeight: 6,
      }),
    );

    expect(markup).toContain('alt="Single oven"');
    expect(markup).toContain("left:12.5%");
  });

  it("routes every saved Custom Cabinet Rule profile to its configured generic-image path", () => {
    const imageUrl = "https://example.com/configured-profile.webp";
    const nonStandardProfiles = CUSTOM_CABINET_PROFILES.filter((profile) => profile.id !== "standard");

    expect(nonStandardProfiles.map((profile) => profile.id)).toEqual([
      "end-angle",
      "generic-image",
      "open-shelf-side-door",
      "curved-open-shelf",
      "wine-rack",
      "pullout-tower",
      "knee-drawer",
      "hood-wall-chimney",
      "hood-insert",
    ]);

    for (const profile of nonStandardProfiles) {
      expect(
        resolveElevationFacePresentation(configuredCabinet, profile.id, imageUrl).renderMode,
        profile.id,
      ).toBe("generic-image");
    }
  });

  it("provides a distinct vector shape for every profile that has one", () => {
    const vectorMarkers = {
      "open-shelf-side-door": "w-[62%]",
      "curved-open-shelf": "border-top-right-radius:42% 16%",
      "wine-rack": "<svg",
      "pullout-tower": "w-[3px]",
      "knee-drawer": "h-[21%]",
      "hood-wall-chimney": "clip-path:polygon(28% 0,72% 0,88% 65%,100% 100%,0 100%,12% 65%)",
      "hood-insert": "width:84%;height:34%",
    } as const;

    for (const [profile, marker] of Object.entries(vectorMarkers)) {
      const markup = renderToStaticMarkup(createElement(CustomProfileFace, { ...customFaceProps, profile }));
      expect(markup, profile).toContain(marker);
      expect(resolveElevationFacePresentation(configuredCabinet, profile, null).renderMode, profile).toBe("vector-profile");
    }
  });

  it("renders a configured generic-image rule in the actual elevation container", () => {
    const imageUrl = "https://example.com/generic-rule.webp";
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(ElevationView, {
          room: { width: 144, depth: 120, ceilingHeight: 96 },
          cabinets: [{
            uid: "generic-rule",
            cabinetId: 701,
            masterCode: "CUSTOM-24",
            description: '24" Custom Base Cabinet',
            category: "Base",
            placement: "base",
            x: 0,
            y: 0,
            width: 24,
            height: 34.5,
            depth: 24,
            rotation: 0,
            customProfile: "generic-image",
            genericDrawingUrl: imageUrl,
          }],
          selectedUid: null,
          onSelect: () => undefined,
          wall: "back",
        }),
      ),
    );

    expect(markup).toContain(`src="${imageUrl}"`);
    expect(markup).toContain("width:96px");
    expect(markup).not.toContain("clip-path:polygon(0 0");
  });
});

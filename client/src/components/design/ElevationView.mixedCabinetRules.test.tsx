import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { cabinetDrawingType, resolveDoorDrawerCounts } from "@/lib/cabinetGraphics";
import { type PlacedCabinet } from "@/lib/design";
import { planCornerGeometry } from "./PlanCanvas";
import { DoorFront, ElevationView } from "./ElevationView";

function baseCabinet(overrides: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "cabinet",
    cabinetId: 1,
    masterCode: "B-24",
    description: "24 inch Base Cabinet",
    category: "Base",
    placement: "base",
    x: 0,
    y: 0,
    width: 24,
    height: 34.5,
    depth: 24,
    rotation: 0,
    ...overrides,
  } as PlacedCabinet;
}

describe("mixed Cabinet Config elevation rules", () => {
  it("classifies BMC30 as a microwave base and BA-24 as its configured non-corner end-angle profile", () => {
    const bmc30 = {
      masterCode: "BMC30",
      description: '30" Microwave Base Cabinet',
      category: "Base",
      subCategory: "Microwave Base Cabinet",
      numberOfDoors: 0,
      numberOfDrawers: 1,
      openingType: "top",
    };
    expect(cabinetDrawingType(bmc30)).toBe("microwave-base");
    expect(resolveDoorDrawerCounts(bmc30)).toEqual({ doors: 0, drawers: 1 });

    expect(planCornerGeometry(baseCabinet({
      masterCode: "BA-24",
      description: "Legacy base record",
      subCategory: "Standard Base",
      customProfile: "end-angle",
    }))).toMatchObject({ isEndAngle: true, isCorner: false, isTriangle: false });
  });

  it("renders the mixed BMC30 / BA-24 / FSB-36 run with its authored specialty faces", () => {
    const selectedDoor = "https://example.com/selected-aston-green.webp";
    const cabinets = [
      baseCabinet({
        uid: "bmc30",
        masterCode: "BMC30",
        description: '30" Microwave Base Cabinet',
        subCategory: "Microwave Base Cabinet",
        numberOfDoors: 0,
        numberOfDrawers: 1,
        drawerHeight: 12,
        openingType: "top",
        x: 0,
        width: 30,
      }),
      baseCabinet({
        uid: "ba24",
        masterCode: "BA-24",
        description: '24" Base End Angle Cabinet',
        subCategory: "Base End Cabinet",
        customProfile: "end-angle",
        x: 30,
      }),
      baseCabinet({
        uid: "fsb36",
        cabinetId: 9390043,
        masterCode: "FSB-36",
        description: '36" Farm Sink Base Cabinet',
        subCategory: "Sink Base",
        numberOfDoors: 2,
        x: 54,
        width: 36,
      }),
    ];
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(ElevationView, {
          room: { width: 144, depth: 120, ceilingHeight: 96 },
          cabinets,
          selectedUid: null,
          onSelect: () => undefined,
          wall: "back",
          countertopMaterialId: "white-quartz",
          doorSampleUrlFor: () => selectedDoor,
          drawerSampleUrlFor: () => selectedDoor,
        }),
      ),
    );

    expect(markup).toContain('data-microwave-base-opening="true"');
    expect(markup).toContain('data-microwave-base-drawer="true"');
    expect(markup).toContain('data-bec-angled-end-face="true"');
    expect(markup).toContain('data-bec-45-angle="true"');
    expect(markup).toContain('data-bec-angled-left-door="12in"');
    expect(markup).toContain('data-bec-angled-right-door="12in"');
    expect(markup).toContain('data-farm-sink-apron="true"');
    expect(markup).toContain('data-farm-sink-mounted="countertop"');
    expect(markup).toContain(`url(${selectedDoor})`);
  });

  it("does not invent door panels when a configured appliance opening has zero doors", () => {
    const markup = renderToStaticMarkup(
      createElement(DoorFront, {
        kind: "shaker",
        edge: "#314a35",
        face: "#9ab49a",
        cabinetType: "standard-door",
        doors: 0,
        drawers: 1,
        openingType: "top",
        drawerHeight: 12,
        cabinetWidthIn: 30,
        cabinetHeightIn: 30,
      }),
    );

    expect(markup).not.toContain('data-config-opening-door="true"');
    expect(markup).toContain('data-config-opening-drawer="true"');
  });
});

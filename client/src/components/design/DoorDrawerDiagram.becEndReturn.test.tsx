import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cabinetDrawingType } from "@/lib/cabinetGraphics";
import { DoorDrawerDiagram } from "./DoorDrawerDiagram";

const bec24 = {
  masterCode: "BEC-24",
  description: '24" Base End Cabinet – 45° Angled Front',
  category: "Base",
  subCategory: "Base End Corner",
  graphicType: "base_end_return",
  width: 24,
  height: 34.5,
  depth: 24,
  numberOfDoors: 2,
  numberOfDrawers: 0,
};

describe("DoorDrawerDiagram BEC-24 end-return detail contract", () => {
  it("renders the two-door 45-degree end face rather than a flat rectangular door layout", () => {
    const markup = renderToStaticMarkup(createElement(DoorDrawerDiagram, { cabinet: bec24, width: 220 }));

    expect(cabinetDrawingType(bec24)).toBe("end-return");
    expect(markup).toContain('data-bec-end-return-detail="true"');
    expect(markup).toContain('data-bec-45-angle="true"');
    expect(markup).toContain('data-bec-angled-door="left"');
    expect(markup).toContain('data-bec-angled-door="right"');
    expect(markup).toContain('data-bec-center-seam="true"');
    expect(markup).toContain("45° angled end");
    expect(markup).toContain("two 12&quot; doors");
  });
});

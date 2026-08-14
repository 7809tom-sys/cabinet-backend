import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CabinetImage } from "./CabinetImage";

describe("CabinetImage microwave-base Config authority", () => {
  it("does not display a stale two-door catalog thumbnail for zero-door BMC30", () => {
    const markup = renderToStaticMarkup(
      createElement(CabinetImage, {
        cabinet: {
          masterCode: "BMC30",
          description: '30" Microwave Base Cabinet',
          category: "Base",
          subCategory: "Microwave Base Cabinet",
          numberOfDoors: 0,
          numberOfDrawers: 1,
          openingType: "top",
          drawerHeight: 12,
          catalogImageUrl: "https://example.com/stale-two-door-base.webp",
        },
      }),
    );

    expect(markup).toContain('data-cabinet-drawing="microwave-base"');
    expect(markup).not.toContain("stale-two-door-base.webp");
  });
});

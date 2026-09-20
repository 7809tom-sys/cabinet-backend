import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CabinetImage } from "./CabinetImage";

describe("CabinetImage code-keyed generic drawing authority", () => {
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

  it("uses the Chrome Tray master-code drawing instead of a distributor thumbnail", () => {
    const markup = renderToStaticMarkup(
      createElement(CabinetImage, {
        cabinet: {
          masterCode: "CHROME TRAY 33",
          description: "Chrome Tray Insert for ERB33 Easy-Reach Corner Cabinet",
          category: "Accessory",
          subCategory: "Lazy Susan Insert",
          catalogImageUrl: "https://example.com/wrong-vendor-photo.webp",
        },
        overrideImageUrl: "https://example.com/finish-specific-tray.webp",
      }),
    );

    expect(markup).toContain('data-cabinet-drawing="lazy-susan-tray"');
    expect(markup).not.toContain("wrong-vendor-photo.webp");
    expect(markup).not.toContain("finish-specific-tray.webp");
  });

  it("renders PR3015 as open plate-rack line art rather than a door cabinet", () => {
    const markup = renderToStaticMarkup(
      createElement(CabinetImage, {
        cabinet: {
          masterCode: "PR3015",
          description: '30" × 15" × 12" Wall Plate Rack Cabinet',
          category: "Wall",
          width: 30,
          height: 15,
          depth: 12,
          catalogImageUrl: "https://example.com/incorrect-closed-door-cabinet.webp",
        },
      }),
    );

    expect(markup).toContain('data-cabinet-drawing="plate-rack"');
    expect(markup).not.toContain("incorrect-closed-door-cabinet.webp");
  });
});

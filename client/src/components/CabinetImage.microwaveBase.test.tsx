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

  it("renders the exact code-owned roll-out shelf count as a technical badge", () => {
    const fullHeightMarkup = renderToStaticMarkup(
      createElement(CabinetImage, {
        cabinet: {
          masterCode: "B18FH2RS",
          description: '18" × 34.5" × 24" Full-Height Base Cabinet — No Drawer, 2 Roll-Out Shelves',
          category: "Base",
          subCategory: "Full Height",
          width: 18,
          height: 34.5,
          depth: 24,
          numberOfDoors: 1,
          numberOfDrawers: 0,
        },
      }),
    );
    expect(fullHeightMarkup).toContain('data-rollout-shelf-indicator="true"');
    expect(fullHeightMarkup).toContain('data-rollout-shelf-count="2"');
    expect(fullHeightMarkup).toContain("2 included roll-out shelves");

    const regularBaseMarkup = renderToStaticMarkup(
      createElement(CabinetImage, {
        cabinet: {
          masterCode: "B121RS",
          description: '12" × 34.5" × 24" Base Cabinet — 1 Drawer, 1 Roll-Out Shelf',
          category: "Base",
          width: 12,
          height: 34.5,
          depth: 24,
          numberOfDoors: 1,
          numberOfDrawers: 1,
        },
      }),
    );
    expect(regularBaseMarkup).toContain('data-rollout-shelf-count="1"');

    const standardBaseMarkup = renderToStaticMarkup(
      createElement(CabinetImage, {
        cabinet: { masterCode: "B12", description: '12" Base Cabinet', category: "Base", width: 12 },
      }),
    );
    expect(standardBaseMarkup).not.toContain("data-rollout-shelf-indicator");
  });

  it("renders the same code-keyed ADA drawer front whether ADA is prefix or suffix", () => {
    for (const masterCode of ["ADA-3DB15", "3DB15ADA"]) {
      const markup = renderToStaticMarkup(
        createElement(CabinetImage, {
          cabinet: {
            masterCode,
            description: '15" × 32.5" × 24" ADA Three-Drawer Base Cabinet',
            category: "ADA",
            subCategory: "ADA Base",
            width: 15,
            height: 32.5,
            depth: 24,
            numberOfDoors: 0,
            numberOfDrawers: 3,
            catalogImageUrl: "https://example.com/incorrect-vendor-ada-thumbnail.webp",
          },
        }),
      );
      expect(markup).toContain('data-cabinet-drawing="drawer-base"');
      expect(markup).not.toContain("incorrect-vendor-ada-thumbnail.webp");
    }
  });
});

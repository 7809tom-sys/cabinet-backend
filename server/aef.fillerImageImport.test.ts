import { describe, expect, it } from "vitest";
import { AEF_FILLER_PRODUCT_IMAGES } from "../scripts/import-aef-frameless-fillers";

describe("AEF filler product-image map", () => {
  it("uses product-only renders instead of the retired accessories price chart", () => {
    expect(AEF_FILLER_PRODUCT_IMAGES).toEqual({
      applianceThreePack: "/manus-storage/aef-appliance-filler-three-pack_50708d9c.webp",
      overlayThreeInch: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
      overlaySixInch: "/manus-storage/aef-overlay-filler-6in_1b42acbe.webp",
    });
    for (const imageUrl of Object.values(AEF_FILLER_PRODUCT_IMAGES)) {
      expect(imageUrl).toContain("/manus-storage/");
      expect(imageUrl).not.toContain("aef-accessory-finish");
    }
  });
});

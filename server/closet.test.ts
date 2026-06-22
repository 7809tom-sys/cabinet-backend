import { describe, it, expect } from "vitest";
import {
  CLOSET_PARTS,
  closetPaletteByCategory,
  closetPartPrice,
  isClosetPart,
  closetPartAsDesignCabinet,
} from "../client/src/lib/closet";

describe("closet parts catalog", () => {
  it("exposes a non-empty placeholder catalog", () => {
    expect(CLOSET_PARTS.length).toBeGreaterThan(0);
    for (const p of CLOSET_PARTS) {
      expect(p.masterCode).toMatch(/^CL-/);
      expect(p.priceUsd).toBeGreaterThan(0);
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });

  it("groups the palette by category in a stable order", () => {
    const groups = closetPaletteByCategory();
    expect(groups.length).toBeGreaterThan(0);
    const cats = groups.map((g) => g.category);
    // Panels should come before Accessories.
    expect(cats.indexOf("Panels")).toBeLessThan(cats.indexOf("Accessories"));
    // Every grouped item is shaped as a DesignCabinet with id 0 (synthetic).
    for (const g of groups) {
      for (const item of g.items) {
        expect(item.id).toBe(0);
        expect(item.masterCode).toMatch(/^CL-/);
      }
    }
  });

  it("prices a known part and returns 0 for unknown codes", () => {
    const sample = CLOSET_PARTS[0];
    expect(closetPartPrice(sample.masterCode)).toBe(sample.priceUsd);
    expect(closetPartPrice("NOT-A-CLOSET-PART")).toBe(0);
  });

  it("identifies closet parts vs kitchen cabinet codes", () => {
    expect(isClosetPart(CLOSET_PARTS[0].masterCode)).toBe(true);
    expect(isClosetPart("B24")).toBe(false);
  });

  it("converts a part to a DesignCabinet preserving dimensions", () => {
    const part = CLOSET_PARTS.find((p) => p.key === "drawer-3")!;
    const dc = closetPartAsDesignCabinet(part);
    expect(dc.width).toBe(String(part.width));
    expect(dc.height).toBe(String(part.height));
    expect(dc.placement).toBe(part.placement);
    expect(dc.numberOfDrawers).toBe(part.numberOfDrawers);
  });
});

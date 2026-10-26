import { describe, it, expect } from "vitest";
import {
  CLOSET_PARTS,
  closetPaletteByCategory,
  closetPartPrice,
  isClosetPart,
  closetPartAsDesignCabinet,
} from "../client/src/lib/closet";

describe("MasterTrac closet catalog", () => {
  it("exposes the 454 real, List-priced SKUs without resurrecting placeholder CL products", () => {
    expect(CLOSET_PARTS).toHaveLength(454);
    expect(new Set(CLOSET_PARTS.map((p) => p.sku)).size).toBe(454);
    for (const p of CLOSET_PARTS) {
      expect(p.sku).toMatch(/^\d{6}$/);
      expect(p.listEachUsd).toBeGreaterThan(0);
      expect(p.packQty).toBeGreaterThan(0);
      if (p.placeable) {
        expect(p.widthIn).toBeGreaterThan(0);
        expect(p.heightIn).toBeGreaterThan(0);
        expect(p.depthIn).toBeGreaterThan(0);
      }
    }
  });

  it("groups SKU previews in their source category order without inventing geometry", () => {
    const groups = closetPaletteByCategory();
    const cats = groups.map((g) => g.category);
    expect(cats.indexOf("Panels (Hang)")).toBeLessThan(cats.indexOf("Accessories"));
    expect(cats).toContain("Shelves");
    expect(cats).toContain("Hardware");
    expect(groups.flatMap((g) => g.items)).toHaveLength(454);
    for (const g of groups) {
      for (const item of g.items) {
        expect(item.id).toBe(0);
        expect(item.category).toBe("MasterTrac Closet");
        expect(item.masterCode).toMatch(/^\d{6}$/);
      }
    }
  });

  it("returns the approved List price only for a known SKU, not an old CL placeholder", () => {
    expect(closetPartPrice("432527")).toBe(12.50);
    expect(closetPartPrice("CL-PNL-24")).toBeNull();
    expect(closetPartPrice("NOT-A-CLOSET-PART")).toBeNull();
  });

  it("recognizes real and legacy closet codes without treating kitchen codes as closet products", () => {
    expect(isClosetPart("432527")).toBe(true);
    expect(isClosetPart("CL-PNL-24")).toBe(true); // existing saved plans stay distinguishable and unpriced
    expect(isClosetPart("B24")).toBe(false);
  });

  it("converts an exact shelf SKU to a non-kitchen DesignCabinet with fixed dimensions", () => {
    const part = CLOSET_PARTS.find((p) => p.sku === "432527")!;
    const dc = closetPartAsDesignCabinet(part);
    expect(dc.width).toBe(String(part.widthIn));
    expect(dc.height).toBe(String(part.heightIn));
    expect(dc.depth).toBe(String(part.depthIn));
    expect(dc.placement).toBe(part.placement);
    expect(dc.numberOfDrawers).toBe(0);
  });
});

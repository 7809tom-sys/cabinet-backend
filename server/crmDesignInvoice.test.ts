import { describe, expect, it } from "vitest";
import { groupedDesignInvoiceMaterials } from "./crmDesignInvoice";

describe("groupedDesignInvoiceMaterials", () => {
  it("groups saved cabinet materials and excludes incomplete non-cabinet placement data", () => {
    expect(groupedDesignInvoiceMaterials([
      { cabinetId: 14, masterCode: "B24", description: "24 in Base Cabinet", styleId: 2 },
      { cabinetId: 14, masterCode: "B24", description: "24 in Base Cabinet", styleId: 2 },
      { cabinetId: 22, masterCode: "W30", description: "30 in Wall Cabinet" },
      { masterCode: "RANGE-30", description: "Range" },
    ])).toEqual([
      { description: "24 in Base Cabinet", quantity: 2, styleName: null, color: null },
      { description: "30 in Wall Cabinet", quantity: 1, styleName: null, color: null },
    ]);
  });

  it("names each cabinet with its own style and color, or the design default", () => {
    const styles = new Map<number, { ourName: string; color: string | null }>([
      [390001, { ourName: "Shaker White", color: null }],
      [390009, { ourName: "Treasure Chest", color: "Cherry" }],
    ]);
    expect(groupedDesignInvoiceMaterials([
      { cabinetId: 14, masterCode: "B24", description: "https://cdn.example/b24.jpg", styleId: 390001, catalogImageUrl: "https://cdn.example/b24.jpg" },
      { cabinetId: 22, masterCode: "W30", description: "30 in Wall", styleId: 390009, thumbnailUrl: "https://cdn.example/w30.png" },
      { cabinetId: 30, masterCode: "SB36", description: "Sink base", styleId: null },
    ], styles, 390001)).toEqual([
      { description: "Shaker White", quantity: 1, styleName: "Shaker White", color: null },
      { description: "Shaker White", quantity: 1, styleName: "Shaker White", color: null },
      { description: "Treasure Chest · Cherry", quantity: 1, styleName: "Treasure Chest", color: "Cherry" },
    ]);
  });

  it("does not put a product image into the invoice line", () => {
    const lines = groupedDesignInvoiceMaterials([
      { cabinetId: 1, masterCode: "B12", description: '<img src="https://cdn.example/cab.webp" alt="base"> Base', styleId: 4 },
    ]);
    expect(JSON.stringify(lines)).not.toMatch(/<img|https?:\/\//i);
    expect(lines[0]?.description).toBe("Base");
  });
});

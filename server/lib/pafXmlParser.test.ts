import { describe, it, expect } from "vitest";
import { parsePafXml, mapCategory, mapPlacementType } from "./pafXmlParser";

describe("pafXmlParser", () => {
  describe("parsePafXml", () => {
    it("should parse a valid PAF XML with products", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PAF>
  <PRODUCT>
    <CODE>3DB24</CODE>
    <DESCRIPTION>3 Drawer Base 24</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
    <WIDTH>24</WIDTH>
    <HEIGHT>30</HEIGHT>
    <DEPTH>24</DEPTH>
    <DOORS>0</DOORS>
    <DRAWERS>3</DRAWERS>
    <LIST_PRICE>450.00</LIST_PRICE>
  </PRODUCT>
</PAF>`;

      const result = await parsePafXml(xml);

      expect(result.products).toHaveLength(1);
      expect(result.products[0]).toMatchObject({
        code: "3DB24",
        description: "3 Drawer Base 24",
        category: "Base Cabinet",
        width: 24,
        height: 30,
        depth: 24,
        numberOfDrawers: 3,
        listPrice: 450,
      });
      // 0 values are not stored
      expect(result.products[0].numberOfDoors).toBeUndefined();
      expect(result.errors).toHaveLength(0);
    });

    it("should handle multiple products", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PAF>
  <PRODUCT>
    <CODE>3DB24</CODE>
    <DESCRIPTION>3 Drawer Base 24</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
  </PRODUCT>
  <PRODUCT>
    <CODE>W3036</CODE>
    <DESCRIPTION>Wall 30x36</DESCRIPTION>
    <CATEGORY>Wall Cabinet</CATEGORY>
  </PRODUCT>
</PAF>`;

      const result = await parsePafXml(xml);

      expect(result.products).toHaveLength(2);
      expect(result.products[0].code).toBe("3DB24");
      expect(result.products[1].code).toBe("W3036");
    });

    it("should skip products without code or description", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PAF>
  <PRODUCT>
    <CODE>3DB24</CODE>
    <DESCRIPTION>3 Drawer Base 24</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
  </PRODUCT>
  <PRODUCT>
    <DESCRIPTION>Missing Code</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
  </PRODUCT>
</PAF>`;

      const result = await parsePafXml(xml);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].code).toBe("3DB24");
    });

    it("should return error for invalid XML", async () => {
      const xml = `<invalid>not valid xml</invalid>`;

      const result = await parsePafXml(xml);

      expect(result.products).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe("INVALID_XML");
    });

    it("should handle empty PAF", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PAF>
</PAF>`;

      const result = await parsePafXml(xml);

      expect(result.products).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("mapCategory", () => {
    it("should map wall categories", () => {
      expect(mapCategory("Wall Cabinet")).toBe("Wall");
      expect(mapCategory("wall")).toBe("Wall");
      expect(mapCategory("WALL 36")).toBe("Wall");
    });

    it("should map tall categories", () => {
      expect(mapCategory("Tall Cabinet")).toBe("Tall");
      expect(mapCategory("Pantry")).toBe("Tall");
      expect(mapCategory("Utility")).toBe("Tall");
      expect(mapCategory("Oven Cabinet")).toBe("Tall");
    });

    it("should map base categories", () => {
      expect(mapCategory("Base Cabinet")).toBe("Base");
      expect(mapCategory("Sink Base")).toBe("Base");
    });

    it("should map pantry drawer to Tall, not Base", () => {
      expect(mapCategory("Pantry Drawer")).toBe("Tall");
      expect(mapCategory("Pantry Door")).toBe("Tall");
      expect(mapCategory("Utility Drawer")).toBe("Tall");
    });

    it("should map island categories", () => {
      expect(mapCategory("Island")).toBe("Island");
    });

    it("should map accessory categories", () => {
      expect(mapCategory("Accessory")).toBe("Accessory");
      expect(mapCategory("Trim")).toBe("Accessory");
      expect(mapCategory("Molding")).toBe("Accessory");
      expect(mapCategory("Filler")).toBe("Accessory");
    });

    it("should preserve unrecognized categories with title casing", () => {
      expect(mapCategory("Specialty")).toBe("Specialty");
      expect(mapCategory("Hardware")).toBe("Hardware");
    });

    it("should default to Base for empty categories", () => {
      expect(mapCategory("")).toBe("Base");
    });
  });

  describe("mapPlacementType", () => {
    it("should map wall placement types", () => {
      expect(mapPlacementType("W3036", "Wall Cabinet")).toBe("wall");
    });

    it("should map tall placement types", () => {
      expect(mapPlacementType("T3684", "Tall Cabinet")).toBe("tall");
    });

    it("should map island placement types", () => {
      expect(mapPlacementType("I3636", "Island")).toBe("island");
    });

    it("should map accessory placement types", () => {
      expect(mapPlacementType("CR36", "Trim")).toBe("accessory");
    });

    it("should default to base for unknown types", () => {
      expect(mapPlacementType("B3024", "Unknown")).toBe("base");
    });
  });
});

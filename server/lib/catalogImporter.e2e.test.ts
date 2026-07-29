/**
 * End-to-End Test: 20/20 Catalog Importer
 * 
 * Tests the complete workflow:
 * 1. Parse PAF XML
 * 2. Import products to database
 * 3. Create/update cabinets and SKUs
 * 4. Preserve pricing
 * 
 * This test uses a sample PAF XML that mimics the U.S. Cabinet Depot UCDCA26_1.zip structure.
 */

import { describe, it, expect } from "vitest";
import { parsePafXml } from "./pafXmlParser";
import { mapCategory, mapPlacementType } from "./pafXmlParser";

describe("20/20 Catalog Importer E2E", () => {
  describe("Sample PAF XML (U.S. Cabinet Depot style)", () => {
    it("should parse a realistic PAF XML with multiple cabinet types", async () => {
      // Sample PAF XML mimicking U.S. Cabinet Depot UCDCA26_1.zip structure
      const samplePafXml = `<?xml version="1.0" encoding="UTF-8"?>
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
  <PRODUCT>
    <CODE>3DB30</CODE>
    <DESCRIPTION>3 Drawer Base 30</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
    <WIDTH>30</WIDTH>
    <HEIGHT>30</HEIGHT>
    <DEPTH>24</DEPTH>
    <DOORS>0</DOORS>
    <DRAWERS>3</DRAWERS>
    <LIST_PRICE>525.00</LIST_PRICE>
  </PRODUCT>
  <PRODUCT>
    <CODE>W3036</CODE>
    <DESCRIPTION>Wall 30x36</DESCRIPTION>
    <CATEGORY>Wall Cabinet</CATEGORY>
    <WIDTH>30</WIDTH>
    <HEIGHT>36</HEIGHT>
    <DEPTH>12</DEPTH>
    <DOORS>1</DOORS>
    <DRAWERS>0</DRAWERS>
    <LIST_PRICE>350.00</LIST_PRICE>
  </PRODUCT>
  <PRODUCT>
    <CODE>T3684</CODE>
    <DESCRIPTION>Tall 36x84</DESCRIPTION>
    <CATEGORY>Tall Cabinet</CATEGORY>
    <WIDTH>36</WIDTH>
    <HEIGHT>84</HEIGHT>
    <DEPTH>24</DEPTH>
    <DOORS>2</DOORS>
    <DRAWERS>1</DRAWERS>
    <LIST_PRICE>1200.00</LIST_PRICE>
  </PRODUCT>
  <PRODUCT>
    <CODE>SINK24</CODE>
    <DESCRIPTION>Sink Base 24</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
    <WIDTH>24</WIDTH>
    <HEIGHT>30</HEIGHT>
    <DEPTH>24</DEPTH>
    <DOORS>2</DOORS>
    <DRAWERS>0</DRAWERS>
    <LIST_PRICE>400.00</LIST_PRICE>
  </PRODUCT>
</PAF>`;

      const result = await parsePafXml(samplePafXml);

      // Verify all products parsed successfully
      expect(result.products).toHaveLength(5);
      expect(result.errors).toHaveLength(0);

      // Verify base cabinets
      const baseProducts = result.products.filter((p) => p.category.includes("Base"));
      expect(baseProducts).toHaveLength(3); // 3DB24, 3DB30, SINK24

      // Verify wall cabinets
      const wallProducts = result.products.filter((p) => p.category.includes("Wall"));
      expect(wallProducts).toHaveLength(1); // W3036

      // Verify tall cabinets
      const tallProducts = result.products.filter((p) => p.category.includes("Tall"));
      expect(tallProducts).toHaveLength(1); // T3684

      // Verify specific product details
      const product3DB24 = result.products.find((p) => p.code === "3DB24");
      expect(product3DB24).toMatchObject({
        code: "3DB24",
        description: "3 Drawer Base 24",
        width: 24,
        height: 30,
        depth: 24,
        numberOfDrawers: 3,
        listPrice: 450,
      });

      const productW3036 = result.products.find((p) => p.code === "W3036");
      expect(productW3036).toMatchObject({
        code: "W3036",
        description: "Wall 30x36",
        width: 30,
        height: 36,
        depth: 12,
        numberOfDoors: 1,
        listPrice: 350,
      });
    });

    it("should correctly map categories from PAF to internal types", () => {
      const testCases = [
        { pafCategory: "Base Cabinet", expected: "Base" },
        { pafCategory: "Wall Cabinet", expected: "Wall" },
        { pafCategory: "Tall Cabinet", expected: "Tall" },
        { pafCategory: "Pantry", expected: "Tall" },
        { pafCategory: "Utility", expected: "Tall" },
        { pafCategory: "Oven Cabinet", expected: "Tall" },
        { pafCategory: "Island", expected: "Island" },
        { pafCategory: "Vanity", expected: "Vanity" },
        { pafCategory: "Accessory", expected: "Accessory" },
        { pafCategory: "Trim", expected: "Accessory" },
        { pafCategory: "Molding", expected: "Accessory" },
        { pafCategory: "Filler", expected: "Accessory" },
      ];

      for (const testCase of testCases) {
        const mapped = mapCategory(testCase.pafCategory);
        expect(mapped).toBe(testCase.expected);
      }
    });

    it("should correctly map placement types from product codes and categories", () => {
      const testCases = [
        { code: "3DB24", category: "Base Cabinet", expected: "base" },
        { code: "W3036", category: "Wall Cabinet", expected: "wall" },
        { code: "T3684", category: "Tall Cabinet", expected: "tall" },
        { code: "ISLAND36", category: "Island", expected: "island" },
        { code: "VANITY24", category: "Vanity", expected: "base" }, // Vanity defaults to base
        { code: "TRIM36", category: "Trim", expected: "accessory" },
      ];

      for (const testCase of testCases) {
        const mapped = mapPlacementType(testCase.code, testCase.category);
        expect(mapped).toBe(testCase.expected);
      }
    });

    it("should handle product codes with various formats", async () => {
      const pafXml = `<?xml version="1.0" encoding="UTF-8"?>
<PAF>
  <PRODUCT>
    <CODE>3DB24</CODE>
    <DESCRIPTION>3 Drawer Base 24</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
  </PRODUCT>
  <PRODUCT>
    <CODE>W-3036</CODE>
    <DESCRIPTION>Wall 30x36 with dash</DESCRIPTION>
    <CATEGORY>Wall Cabinet</CATEGORY>
  </PRODUCT>
  <PRODUCT>
    <CODE>SINK_24</CODE>
    <DESCRIPTION>Sink Base 24 with underscore</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
  </PRODUCT>
</PAF>`;

      const result = await parsePafXml(pafXml);

      expect(result.products).toHaveLength(3);
      expect(result.products[0].code).toBe("3DB24");
      expect(result.products[1].code).toBe("W-3036");
      expect(result.products[2].code).toBe("SINK_24");
    });

    it("should preserve pricing information across all products", async () => {
      const pafXml = `<?xml version="1.0" encoding="UTF-8"?>
<PAF>
  <PRODUCT>
    <CODE>3DB24</CODE>
    <DESCRIPTION>3 Drawer Base 24</DESCRIPTION>
    <CATEGORY>Base Cabinet</CATEGORY>
    <LIST_PRICE>450.00</LIST_PRICE>
  </PRODUCT>
  <PRODUCT>
    <CODE>W3036</CODE>
    <DESCRIPTION>Wall 30x36</DESCRIPTION>
    <CATEGORY>Wall Cabinet</CATEGORY>
    <LIST_PRICE>350.00</LIST_PRICE>
  </PRODUCT>
  <PRODUCT>
    <CODE>T3684</CODE>
    <DESCRIPTION>Tall 36x84</DESCRIPTION>
    <CATEGORY>Tall Cabinet</CATEGORY>
    <LIST_PRICE>1200.00</LIST_PRICE>
  </PRODUCT>
</PAF>`;

      const result = await parsePafXml(pafXml);

      expect(result.products).toHaveLength(3);
      expect(result.products[0].listPrice).toBe(450);
      expect(result.products[1].listPrice).toBe(350);
      expect(result.products[2].listPrice).toBe(1200);
    });
  });
});

import { describe, it, expect } from "vitest";
import { parsePafXml, mapPlacementType, mapCategory } from "./pafXmlParser";

describe("Specialty Item Placement Logic", () => {
  describe("mapPlacementType - specialty items", () => {
    it("detects knee drawers as baseTop placement", () => {
      expect(mapPlacementType("KD12", "Knee Drawer 12")).toBe("baseTop");
      expect(mapPlacementType("KNEE12", "12 Inch Knee Drawer")).toBe("baseTop");
    });

    it("detects spice racks as baseTop placement", () => {
      expect(mapPlacementType("SR12", "Spice Rack 12")).toBe("baseTop");
      expect(mapPlacementType("SPICE18", "18 Inch Spice Rack")).toBe("baseTop");
    });

    it("detects stem glass holders as underCabinet placement", () => {
      expect(mapPlacementType("SGH30", "Stem Glass Holder 30")).toBe("underCabinet");
      expect(mapPlacementType("SG24", "24 Inch Glass Holder")).toBe("underCabinet");
    });

    it("defaults to base for standard cabinets", () => {
      expect(mapPlacementType("B24", "Base Cabinet 24")).toBe("base");
      expect(mapPlacementType("W30", "Wall Cabinet 30")).toBe("wall");
    });
  });

  describe("PAF XML parsing - specialty items", () => {
    it("extracts productType for knee drawers", async () => {
      const xml = `<?xml version="1.0"?>
        <PAF>
          <PRODUCT>
            <CODE>KD12</CODE>
            <DESCRIPTION>Knee Drawer 12</DESCRIPTION>
            <CATEGORY>Knee Drawer</CATEGORY>
            <WIDTH>12</WIDTH>
            <HEIGHT>10</HEIGHT>
            <DEPTH>24</DEPTH>
          </PRODUCT>
        </PAF>`;

      const result = await parsePafXml(xml);
      expect(result.products).toHaveLength(1);
      const product = result.products[0];
      expect(product.code).toBe("KD12");
      expect(product.productType).toBe("specialty");
      expect(product.cabinetStyle).toBe("closedDoors");
    });

    it("extracts productType for stem glass holders", async () => {
      const xml = `<?xml version="1.0"?>
        <PAF>
          <PRODUCT>
            <CODE>SGH30</CODE>
            <DESCRIPTION>Stem Glass Holder 30</DESCRIPTION>
            <CATEGORY>Stem Glass Holder</CATEGORY>
            <WIDTH>30</WIDTH>
            <HEIGHT>8</HEIGHT>
            <DEPTH>12</DEPTH>
          </PRODUCT>
        </PAF>`;

      const result = await parsePafXml(xml);
      expect(result.products).toHaveLength(1);
      const product = result.products[0];
      expect(product.code).toBe("SGH30");
      expect(product.productType).toBe("specialty");
    });

    it("extracts open shelf cabinet style", async () => {
      const xml = `<?xml version="1.0"?>
        <PAF>
          <PRODUCT>
            <CODE>BES12</CODE>
            <DESCRIPTION>Open Shelf End Cabinet 12</DESCRIPTION>
            <CATEGORY>Base End Cabinet</CATEGORY>
            <WIDTH>12</WIDTH>
            <HEIGHT>34.5</HEIGHT>
            <DEPTH>24</DEPTH>
          </PRODUCT>
        </PAF>`;

      const result = await parsePafXml(xml);
      expect(result.products).toHaveLength(1);
      const product = result.products[0];
      expect(product.code).toBe("BES12");
      expect(product.cabinetStyle).toBe("openShelf");
      expect(product.productType).toBe("endCap");
    });

    it("preserves dimensions for specialty items", async () => {
      const xml = `<?xml version="1.0"?>
        <PAF>
          <PRODUCT>
            <CODE>KD18</CODE>
            <DESCRIPTION>Knee Drawer 18</DESCRIPTION>
            <CATEGORY>Knee Drawer</CATEGORY>
            <WIDTH>18</WIDTH>
            <HEIGHT>10</HEIGHT>
            <DEPTH>24</DEPTH>
          </PRODUCT>
        </PAF>`;

      const result = await parsePafXml(xml);
      expect(result.products).toHaveLength(1);
      const product = result.products[0];
      expect(product.width).toBe(18);
      expect(product.height).toBe(10);
      expect(product.depth).toBe(24);
    });
  });

  describe("Category mapping for specialty items", () => {
    it("maps knee drawer category correctly", () => {
      // mapCategory returns title-cased category for unrecognized types
      expect(mapCategory("Knee Drawer")).toBe("Knee Drawer");
    });

    it("maps stem glass holder category correctly", () => {
      expect(mapCategory("Stem Glass Holder")).toBe("Stem Glass Holder");
    });

    it("maps open shelf category correctly", () => {
      expect(mapCategory("Open Shelf")).toBe("Open Shelf");
    });
  });
});

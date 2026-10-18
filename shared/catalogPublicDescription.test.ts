import { describe, expect, it } from "vitest";
import {
  catalogPublicCopy,
  compactCatalogProductTitle,
  publicTechnicalDrawingNote,
  sanitizeCatalogPublicDescription,
} from "./catalogPublicDescription";

const TARGET_IMPORTED_DESCRIPTION =
  "24W34.75H24D Three Drawer Base. AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2,p.26.";

describe("catalog public description", () => {
  it("derives a compact public heading and source-free structured description from the actual 3DB24 import text", () => {
    const copy = catalogPublicCopy(TARGET_IMPORTED_DESCRIPTION, "3DB24");

    expect(copy).toEqual({
      title: "Three Drawer Base Cabinet",
      description: "Three Drawer Base Cabinet. Dimensions: 24\" W × 34.75\" H × 24\" D.",
    });
    expect(JSON.stringify(copy)).not.toMatch(/altaeuro|u\.?s\.?\s*cabinet|full\s+spec\s+book|v8\.2|p\.\s*26|source|import|proof/i);
  });

  it("keeps exact fractional dimensions out of the compact heading but inside public descriptive copy", () => {
    const copy = catalogPublicCopy(
      "Sink Base Cabinet - 30\"W x 34-1/2\"H x 24\"D - 2 Doors - 1 False Drawer Faces",
    );

    expect(copy.title).toBe("Sink Base Cabinet - 2 Doors - 1 False Drawer Faces");
    expect(copy.description).toBe(
      "Sink Base Cabinet - 2 Doors - 1 False Drawer Faces. Dimensions: 30\" W × 34-1/2\" H × 24\" D.",
    );
    expect(copy.description).toContain("False Drawer");
  });

  it("retains inner-drawer, door, drawer, and specialty configuration details", () => {
    expect(compactCatalogProductTitle(
      "24\" W × 34.75\" H × 24\" D Two Drawer Base with One Inner Drawer",
    )).toBe("Two Drawer Base Cabinet with One Inner Drawer");
    expect(compactCatalogProductTitle(
      "18\" W × 84\" H × 24\" D Tall Two Door Cabinet with Two Drawers and One Inner Drawer",
    )).toBe("Tall Two Door Cabinet with Two Drawers and One Inner Drawer");
    expect(compactCatalogProductTitle(
      "30\" W × 34 1/2\" H × 24\" D Single Door Sink Base with One False Drawer Front",
    )).toBe("Single Door Sink Base Cabinet with One False Drawer Front");
  });

  it("does not discard a legitimate supplier word unless a known provenance marker is present", () => {
    const legitimate = "AltaEuro-compatible pull-out pantry organizer";
    expect(sanitizeCatalogPublicDescription(legitimate)).toBe(legitimate);
    expect(compactCatalogProductTitle(legitimate)).toBe(legitimate);

    expect(sanitizeCatalogPublicDescription(
      "Three Drawer Base. AltaEuro Collection Full Spec Book V8.2, p. 26.",
    )).toBe("Three Drawer Base");
  });

  it("cleans technical-drawing annotations without changing the source value", () => {
    const source = "Printed V8.2 source geometry and face layout. 36\" W × 34.75\" H × 24\" D; source p. 25.";
    expect(publicTechnicalDrawingNote(source)).toBe("36\" W × 34.75\" H × 24\" D");
    expect(source).toBe("Printed V8.2 source geometry and face layout. 36\" W × 34.75\" H × 24\" D; source p. 25.");
    expect(publicTechnicalDrawingNote("AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2, p. 25.")).toBeNull();
  });
});

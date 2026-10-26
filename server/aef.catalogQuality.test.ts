import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { AEF_EXPANDED_SOURCE_GEOMETRY } from "../shared/aefFramelessExpandedGeometry";
import { aefPrintedGeometryForSku } from "../shared/aefFramelessGeometry";
import {
  EXPECTED_PUBLISHED_MASTERS,
  OFFICIAL_V8_PDF_PATH,
  OFFICIAL_V8_TEXT_PATH,
  auditInventory,
  configDifferences,
  expectedConfigFor,
  isLegacyPageCropImage,
  isPublicProseLeak,
  loadManifest,
} from "../scripts/audit-aef-catalog-quality";

describe("AEF catalog quality audit contracts", () => {
  it("covers every complete-source manifest model through the source resolver without using shared masters", () => {
    const manifest = loadManifest();
    const geometryRows = manifest.filter((row) => row.width !== undefined);
    const emptyAccessories = manifest.filter((row) => row.category === "Accessory" && row.width === undefined);

    expect(EXPECTED_PUBLISHED_MASTERS).toBe(283);
    expect(manifest).toHaveLength(168);
    expect(geometryRows).toHaveLength(157);
    expect(emptyAccessories.map((row) => row.sku).sort()).toEqual(["OCM8", "BM8", "SM8", "TKC", "TKC-PVC", "CORNER-PVC", "FS36", "FS48", "FS60", "TUK", "EB10"].sort());
    expect(Object.keys(AEF_EXPANDED_SOURCE_GEOMETRY)).toHaveLength(157);

    for (const source of geometryRows) {
      expect(aefPrintedGeometryForSku(source.sku)).toMatchObject({
        width: source.width,
        height: source.height,
        depth: source.depth,
        toeKickHeight: source.toeKickHeight ?? null,
      });
    }
    for (const source of emptyAccessories) expect(aefPrintedGeometryForSku(source.sku)).toBeNull();
  });

  it("derives all manifest face expectations from supplier data rather than shared master fields", () => {
    for (const source of loadManifest()) {
      const expected = expectedConfigFor(source);
      expect(expected.numberOfDoors).toBe(source.configuration.doors ?? 0);
      expect(expected.numberOfDrawers).toBe(source.configuration.drawers ?? 0);
      expect(expected.graphicType).toBe(source.configuration.graphic ?? "accessory");
      expect(configDifferences(expected, expected)).toEqual({});
    }
  });

  it("recognizes customer-copy provenance leaks and historical page-crop assets", () => {
    expect(isPublicProseLeak("AltaEuro source: Full Spec Book V8.2")).toBe(true);
    expect(isPublicProseLeak('24" Two Drawer Base')).toBe(false);
    expect(isLegacyPageCropImage("/manus-storage/aef-base-3drawer_e6f7a40c.png")).toBe(true);
    expect(isLegacyPageCropImage("/manus-storage/aef-base-3drawer-render_8a9b4ed4.webp")).toBe(false);
  });

  it("records a per-row source geometry mismatch while excluding shared master dimensions from audit truth", () => {
    const source = loadManifest().find((row) => row.sku === "2DB24")!;
    const result = auditInventory({
      manifest: [source],
      officialText: fs.readFileSync(OFFICIAL_V8_TEXT_PATH, "utf8"),
      masters: [{ id: 1, masterCode: "SHARED-FRAMED-2DB24", width: "99.000", height: "99.000", depth: "99.000", numberOfDoors: 99, description: "clean customer copy" }],
      overrides: [{ cabinetId: 1, width: "24.000", height: "34.750", depth: "24.000", configJson: JSON.stringify(expectedConfigFor(source)) }],
      skuRows: [{ id: 1, cabinetId: 1, distributorSku: "2DB24", styleCode: "LSA", constructionType: "frameless", geometryStatus: "verified", geometryWidth: "23.000", geometryHeight: "34.750", geometryDepth: "24.000", geometryToeKickHeight: "4.50", listPrice: "1702.00", isPublished: true, isAvailable: true, supplierDescription: source.description, imageUrl: "/manus-storage/aef-base-2drawer-render-v2_5d3ab62b.webp" }],
    });
    expect(result.audits).toHaveLength(1);
    expect(result.issues.filter((issue) => issue.kind === "supplier_geometry_mismatch")).toHaveLength(1);
    expect(result.issues.filter((issue) => issue.kind === "manifest_face_configuration_mismatch")).toHaveLength(0);
  });

  it("uses the supplied current manufacturer-linked 61-page source artifacts for evidence only", () => {
    expect(fs.existsSync(OFFICIAL_V8_PDF_PATH)).toBe(true);
    const text = fs.readFileSync(OFFICIAL_V8_TEXT_PATH, "utf8");
    // The extracted text retains a trailing form-feed, so count nonblank pages.
    expect(text.split("\f").filter((page) => page.trim()).length).toBe(61);
    expect(text).toContain("2DB24");
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditDoorStyleImages, formatAuditReport } from "./doorStyleImageAudit";
import { fillRect, paintRgb, type RgbImage } from "./sampleImageCrop";

function woodImage(
  width: number,
  height: number,
  base: [number, number, number]
): RgbImage {
  return paintRgb(width, height, (x, y) => {
    const n = ((x * 17 + y * 13) % 29) - 14;
    return [base[0] + n, base[1] + n - 6, base[2] + n - 12];
  });
}

describe("door style image audit", () => {
  it("flags shared urls, a smeared low-resolution crop, a thin slice, and identical hashes", () => {
    const shared = "/manus-storage/aef-syncron-scn-clean-swatch.png";
    const door = woodImage(180, 260, [160, 120, 80]);
    const copy = woodImage(180, 260, [160, 120, 80]);
    const smeared = woodImage(95, 76, [150, 110, 80]);
    fillRect(smeared, { left: 0, top: 0, width: 95, height: 4 }, () => [
      250, 250, 250,
    ]);
    fillRect(smeared, { left: 83, top: 0, width: 12, height: 76 }, () => [
      228, 224, 216,
    ]);
    const thin = paintRgb(200, 12, (x, y) => [120 + (x % 5), 90, 70 + y]);
    const images = new Map<string, RgbImage>([
      ["/manus-storage/ssm.png", door],
      ["/manus-storage/ssm-copy.png", copy],
      [shared, smeared],
      ["/manus-storage/thin.png", thin],
    ]);
    const report = auditDoorStyleImages(
      [
        {
          id: 1,
          styleCode: "SSM",
          doorSampleImageUrl: "/manus-storage/ssm.png",
          drawerSampleImageUrl: null,
          thumbnailImageUrl: "/manus-storage/ssm.png",
        },
        {
          id: 2,
          styleCode: "SCN",
          doorSampleImageUrl: shared,
          drawerSampleImageUrl: shared,
          thumbnailImageUrl: shared,
        },
        {
          id: 3,
          styleCode: "SCA",
          doorSampleImageUrl: shared,
          drawerSampleImageUrl: null,
          thumbnailImageUrl: null,
        },
        {
          id: 4,
          styleCode: "SCR",
          doorSampleImageUrl: "/manus-storage/thin.png",
          drawerSampleImageUrl: "/manus-storage/ssm-copy.png",
          thumbnailImageUrl: null,
        },
      ],
      images
    );

    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.findings.map(finding => finding.code)).toEqual(
      expect.arrayContaining([
        "shared-url-across-styles",
        "shared-url-across-slots",
        "low-resolution",
        "whitespace",
        "edge-replication",
        "thin-slice",
        "identical-hash",
      ])
    );
    const drawerShare = report.findings.find(
      finding =>
        finding.code === "shared-url-across-slots" &&
        finding.styleCode === "SCN" &&
        finding.slot === "drawer"
    );
    expect(drawerShare?.severity).toBe("error");
    const thumbnailShare = report.findings.find(
      finding =>
        finding.code === "shared-url-across-slots" &&
        finding.styleCode === "SSM"
    );
    expect(thumbnailShare?.severity).toBe("warning");
    expect(formatAuditReport(report)).toContain("Read-only");
  });

  it("reports url duplicates without downloading pictures", () => {
    const report = auditDoorStyleImages([
      {
        id: 10,
        styleCode: "ZSA",
        doorSampleImageUrl: "/manus-storage/zsa.png",
        drawerSampleImageUrl: "/manus-storage/zsa.png",
        thumbnailImageUrl: "/manus-storage/zsa.png",
      },
    ]);
    expect(report.measuredUrlCount).toBe(0);
    expect(report.unmeasuredUrls).toEqual(["/manus-storage/zsa.png"]);
    expect(report.findings.map(finding => finding.code)).toContain(
      "shared-url-across-slots"
    );
    expect(formatAuditReport(report)).toContain("--measure");
  });

  it("keeps the audit script and the TiDB fix free of live writes", () => {
    const script = fs.readFileSync(
      path.resolve("scripts/audit-door-style-images.ts"),
      "utf8"
    );
    expect(script).not.toMatch(/\b(UPDATE|INSERT|DELETE|ALTER|DROP)\b/);
    const sql = fs.readFileSync(
      path.resolve("docs/sql/0238_clear_copied_drawer_swatches.tidb.sql"),
      "utf8"
    );
    expect(sql).toContain("cabinet_dealz.door_styles");
    expect(sql).toContain("cabinet_dealz.distributors");
    expect(sql).not.toMatch(
      /\bAS\s+(key|order|group|rows|value|check|range|status)\b/i
    );
    expect(sql).toContain("drawerSampleImageUrl = NULL");
    expect(sql).toContain("SCN");
  });

  it("keeps the refresh scripts on the verified crop writer", () => {
    const runner = fs.readFileSync(
      path.resolve("scripts/lib/aefCleanSwatchRefresh.ts"),
      "utf8"
    );
    expect(runner).toContain("assignVerifiedSlots");
    expect(runner).toContain("prepareStyleSamples");
    expect(runner).toContain("Refusing to copy");
    expect(runner).not.toContain("item.imageUrl, item.imageUrl, item.imageUrl");
    for (const name of [
      "scripts/refresh-aef-syncron-clean-swatches.ts",
      "scripts/refresh-aef-zenit-clean-swatches.ts",
      "scripts/refresh-aef-luxe-clean-swatches.ts",
    ]) {
      expect(fs.readFileSync(path.resolve(name), "utf8")).toContain(
        "runCleanSwatchRefresh"
      );
    }
  });
});

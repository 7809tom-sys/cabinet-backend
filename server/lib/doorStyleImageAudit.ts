/**
 * Read-only audit of door_styles sample images.
 * Flags low-resolution files, smeared or thin crops, and pictures shared
 * across styles or slots. It does not write to the database.
 */

import {
  type CropFinding,
  type RgbImage,
  LOW_RESOLUTION_SHORT_EDGE,
  fingerprintImage,
  fingerprintsMatch,
  inspectSampleImage,
} from "./sampleImageCrop";

export type DoorStyleImageAuditRow = {
  id: number;
  styleCode: string;
  doorSampleImageUrl?: string | null;
  drawerSampleImageUrl?: string | null;
  thumbnailImageUrl?: string | null;
};

export type AuditFinding = {
  severity: "error" | "warning";
  code:
    | CropFinding["code"]
    | "shared-url-across-styles"
    | "shared-url-across-slots"
    | "identical-hash";
  styleCode: string | null;
  styleId: number | null;
  slot: "door" | "drawer" | "thumbnail" | null;
  url: string | null;
  message: string;
};

export type DoorStyleImageAuditReport = {
  styleCount: number;
  measuredUrlCount: number;
  unmeasuredUrls: string[];
  errorCount: number;
  warningCount: number;
  findings: AuditFinding[];
};

type SlotName = "door" | "drawer" | "thumbnail";

function cleanUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function slotUrl(row: DoorStyleImageAuditRow, slot: SlotName): string | null {
  if (slot === "door") return cleanUrl(row.doorSampleImageUrl);
  if (slot === "drawer") return cleanUrl(row.drawerSampleImageUrl);
  return cleanUrl(row.thumbnailImageUrl);
}

export function auditDoorStyleImages(
  rows: DoorStyleImageAuditRow[],
  images:
    | ReadonlyMap<string, RgbImage>
    | Record<string, RgbImage | undefined> = new Map()
): DoorStyleImageAuditReport {
  const lookup =
    images instanceof Map
      ? images
      : new Map(
          Object.entries(images).filter((entry): entry is [string, RgbImage] =>
            Boolean(entry[1])
          )
        );
  const findings: AuditFinding[] = [];
  const users = new Map<
    string,
    Array<{ id: number; styleCode: string; slot: SlotName }>
  >();
  const seenUrls = new Set<string>();

  for (const row of rows) {
    for (const slot of ["door", "drawer", "thumbnail"] as const) {
      const url = slotUrl(row, slot);
      if (!url) continue;
      seenUrls.add(url);
      const list = users.get(url) ?? [];
      list.push({ id: row.id, styleCode: row.styleCode, slot });
      users.set(url, list);
    }
  }

  for (const [url, list] of users) {
    const styleIds = new Set(list.map(item => item.id));
    if (styleIds.size > 1) {
      const names = [...new Set(list.map(item => item.styleCode))].join(", ");
      findings.push({
        severity: "error",
        code: "shared-url-across-styles",
        styleCode: list[0]?.styleCode ?? null,
        styleId: list[0]?.id ?? null,
        slot: null,
        url,
        message: `${url} is shared by ${styleIds.size} styles (${names}).`,
      });
    }
    const byStyle = new Map<number, { styleCode: string; slots: SlotName[] }>();
    for (const item of list) {
      const group = byStyle.get(item.id) ?? {
        styleCode: item.styleCode,
        slots: [],
      };
      group.slots.push(item.slot);
      byStyle.set(item.id, group);
    }
    for (const [styleId, group] of byStyle) {
      const hasDoor = group.slots.includes("door");
      const hasDrawer = group.slots.includes("drawer");
      const hasThumbnail = group.slots.includes("thumbnail");
      if (hasDoor && hasDrawer) {
        findings.push({
          severity: "error",
          code: "shared-url-across-slots",
          styleCode: group.styleCode,
          styleId,
          slot: "drawer",
          url,
          message: `${group.styleCode} uses the door image in the drawer slot (${url}).`,
        });
      } else if (hasDoor && hasThumbnail) {
        findings.push({
          severity: "warning",
          code: "shared-url-across-slots",
          styleCode: group.styleCode,
          styleId,
          slot: "thumbnail",
          url,
          message: `${group.styleCode} thumbnail reuses the door image (${url}).`,
        });
      }
    }
  }

  const measured: Array<{ url: string; image: RgbImage }> = [];
  const unmeasuredUrls: string[] = [];
  for (const url of seenUrls) {
    const image = lookup.get(url);
    if (!image) {
      unmeasuredUrls.push(url);
      continue;
    }
    measured.push({ url, image });
    const shortEdge = Math.min(image.width, image.height);
    if (shortEdge < LOW_RESOLUTION_SHORT_EDGE) {
      const owner = users.get(url)?.[0];
      findings.push({
        severity: "warning",
        code: "low-resolution",
        styleCode: owner?.styleCode ?? null,
        styleId: owner?.id ?? null,
        slot: owner?.slot ?? null,
        url,
        message: `${url} is ${image.width}x${image.height}, below ${LOW_RESOLUTION_SHORT_EDGE}px on the short edge.`,
      });
    }
    const role =
      users.get(url)?.some(item => item.slot === "drawer") &&
      !users.get(url)?.some(item => item.slot === "door")
        ? "drawer"
        : "door";
    for (const finding of inspectSampleImage(image, role)) {
      const owner = users.get(url)?.[0];
      findings.push({
        severity: finding.severity === "info" ? "warning" : finding.severity,
        code: finding.code,
        styleCode: owner?.styleCode ?? null,
        styleId: owner?.id ?? null,
        slot: owner?.slot ?? null,
        url,
        message: `${url} ${finding.message}`,
      });
    }
  }

  for (let i = 0; i < measured.length; i++) {
    const left = measured[i];
    const leftHash = fingerprintImage(left.image);
    for (let j = i + 1; j < measured.length; j++) {
      const right = measured[j];
      if (left.url === right.url) continue;
      if (!fingerprintsMatch(leftHash, fingerprintImage(right.image))) continue;
      findings.push({
        severity: "error",
        code: "identical-hash",
        styleCode: users.get(left.url)?.[0]?.styleCode ?? null,
        styleId: users.get(left.url)?.[0]?.id ?? null,
        slot: null,
        url: left.url,
        message: `${left.url} and ${right.url} are the same picture.`,
      });
    }
  }

  const errorCount = findings.filter(
    finding => finding.severity === "error"
  ).length;
  const warningCount = findings.filter(
    finding => finding.severity === "warning"
  ).length;
  return {
    styleCount: rows.length,
    measuredUrlCount: measured.length,
    unmeasuredUrls: unmeasuredUrls.sort(),
    errorCount,
    warningCount,
    findings,
  };
}

export function formatAuditReport(report: DoorStyleImageAuditReport): string {
  const lines = [
    `Door style image audit: ${report.styleCount} styles, ${report.measuredUrlCount} pictures measured, ${report.errorCount} errors, ${report.warningCount} warnings.`,
  ];
  if (report.unmeasuredUrls.length > 0) {
    lines.push(
      `${report.unmeasuredUrls.length} URLs were not measured. Re-run with --measure to download them.`
    );
  }
  if (report.findings.length === 0) {
    lines.push(
      "No shared, low-resolution, smeared, or thin sample images found."
    );
    return lines.join("\n");
  }
  for (const finding of report.findings) {
    const where = [finding.styleCode, finding.slot].filter(Boolean).join(" ");
    lines.push(
      `${finding.severity.toUpperCase()} ${finding.code}${where ? ` (${where})` : ""}: ${finding.message}`
    );
  }
  lines.push("Read-only. No door_styles rows were updated.");
  return lines.join("\n");
}

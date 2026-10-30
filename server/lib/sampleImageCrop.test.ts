import { describe, expect, it } from "vitest";
import {
  assignVerifiedSlots,
  cropRegion,
  detectContentRegions,
  encodePng,
  fillRect,
  fingerprintImage,
  fingerprintsMatch,
  formatSampleReport,
  inspectSampleImage,
  paintRgb,
  prepareStyleSample,
  prepareStyleSamples,
  refreshWriteDecision,
  verifyPreparedCrop,
  type CropBox,
  type RgbImage,
} from "./sampleImageCrop";

const PAPER: [number, number, number] = [248, 248, 246];

function wood(
  x: number,
  y: number,
  base: [number, number, number],
  salt = 17
): [number, number, number] {
  const n = ((x * salt + y * 13) % 29) - 14;
  return [base[0] + n, base[1] + n - 6, base[2] + n - 12];
}

function blank(
  width: number,
  height: number,
  color: [number, number, number] = PAPER
): RgbImage {
  return paintRgb(width, height, () => color);
}

function embedDoor(
  page: RgbImage,
  box: CropBox,
  base: [number, number, number],
  salt = 17
): void {
  fillRect(page, box, (x, y) => wood(x, y, base, salt));
}

function pageWithDoor(): { page: RgbImage; door: CropBox } {
  const page = blank(240, 320);
  const door = { left: 30, top: 24, width: 150, height: 230 };
  embedDoor(page, door, [168, 132, 96]);
  return { page, door };
}

describe("content-aware sample crops", () => {
  it("crops a door photo to its bounding box on a white brochure page", () => {
    const { page, door } = pageWithDoor();
    const regions = detectContentRegions(page);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject(door);
    const cropped = cropRegion(page, regions[0]);
    expect(cropped.ok).toBe(true);
    if (!cropped.ok) return;
    expect(inspectSampleImage(cropped.image, "door")).toEqual([]);
  });

  it("finds separate door and drawer photos instead of one fixed slice", () => {
    const page = blank(360, 420);
    const door = { left: 40, top: 30, width: 120, height: 200 };
    const drawer = { left: 200, top: 80, width: 120, height: 70 };
    embedDoor(page, door, [150, 110, 80]);
    embedDoor(page, drawer, [120, 90, 70], 7);
    const regions = detectContentRegions(page);
    expect(regions).toHaveLength(2);
    expect(
      regions.map(region => ({
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
      }))
    ).toEqual([door, drawer]);
  });

  it("rejects a smeared crop that runs past the photo and accepts the trimmed door", async () => {
    const { page, door } = pageWithDoor();
    fillRect(
      page,
      { left: door.left, top: door.top, width: door.width, height: 8 },
      () => [250, 250, 250]
    );
    fillRect(
      page,
      {
        left: door.left + door.width - 12,
        top: door.top,
        width: 12,
        height: door.height,
      },
      (x, y) => [226 + ((x + y) % 3), 223, 216]
    );
    const smeared = cropRegion(page, door);
    expect(smeared.ok).toBe(true);
    if (!smeared.ok) return;
    const rejected = inspectSampleImage(smeared.image, "door");
    expect(rejected.map(finding => finding.code)).toEqual(
      expect.arrayContaining(["whitespace", "edge-replication"])
    );

    const regions = detectContentRegions(page);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      left: door.left,
      top: door.top + 8,
      width: door.width - 12,
      height: door.height - 8,
    });
    const cropped = cropRegion(page, regions[0]);
    expect(cropped.ok).toBe(true);
    if (!cropped.ok) return;
    expect(inspectSampleImage(cropped.image, "door")).toEqual([]);

    const prepared = await prepareStyleSample({
      styleCode: "SCN",
      doorSource: page,
      drawerSource: null,
    });
    expect(prepared.door.ok).toBe(true);
    expect(prepared.door.png).toBeInstanceOf(Buffer);
    expect(prepared.drawer.ok).toBe(false);
    expect(prepared.drawer.png).toBeNull();
    expect(prepared.drawer.findings.map(finding => finding.code)).toContain(
      "missing-drawer"
    );
    expect(formatSampleReport([prepared])).toContain("SCN door accepted");
    expect(formatSampleReport([prepared])).toContain("SCN drawer left empty");
  });

  it("rejects a crop rectangle that extends past the source edge", async () => {
    const { page, door } = pageWithDoor();
    const tight = cropRegion(page, door);
    expect(tight.ok).toBe(true);
    if (!tight.ok) return;
    const extra = 24;
    const extended = paintRgb(
      tight.image.width + extra,
      tight.image.height,
      (x, y) => {
        const sourceX = Math.min(tight.image.width - 1, x);
        const i = (y * tight.image.width + sourceX) * 3;
        return [
          tight.image.data[i],
          tight.image.data[i + 1],
          tight.image.data[i + 2],
        ];
      }
    );
    const box = {
      left: 0,
      top: 0,
      width: tight.image.width + extra,
      height: tight.image.height,
    };
    const verdict = await verifyPreparedCrop({
      source: tight.image,
      box,
      crop: extended,
      role: "door",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.map(finding => finding.code)).toEqual(
      expect.arrayContaining(["past-edge", "edge-replication"])
    );
    expect(cropRegion(tight.image, box).ok).toBe(false);
  });

  it("rejects a fixed slice that is mostly whitespace", async () => {
    const { page } = pageWithDoor();
    const slice = { left: 0, top: 0, width: page.width, height: page.height };
    const verdict = await verifyPreparedCrop({
      source: page,
      box: slice,
      crop: page,
      role: "door",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.map(finding => finding.code)).toContain(
      "whitespace"
    );
  });

  it("rejects a wide thin slice", () => {
    const thin = paintRgb(220, 16, (x, y) => wood(x, y, [140, 100, 70]));
    const findings = inspectSampleImage(thin, "door");
    expect(findings.map(finding => finding.code)).toContain("thin-slice");
    expect(findings.every(finding => finding.severity === "error")).toBe(true);
  });

  it("rejects a stretched crop whose aspect no longer matches the source box", async () => {
    const { page, door } = pageWithDoor();
    const tight = cropRegion(page, door);
    expect(tight.ok).toBe(true);
    if (!tight.ok) return;
    const stretched = paintRgb(
      door.width,
      Math.floor(door.height / 2),
      (x, y) => {
        const sourceY = Math.min(door.height - 1, y * 2);
        const i = (sourceY * tight.image.width + x) * 3;
        return [
          tight.image.data[i],
          tight.image.data[i + 1],
          tight.image.data[i + 2],
        ];
      }
    );
    const verdict = await verifyPreparedCrop({
      source: page,
      box: door,
      crop: stretched,
      role: "door",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.map(finding => finding.code)).toContain(
      "aspect-distortion"
    );
  });

  it("does not write the door crop into the drawer slot", async () => {
    const { page } = pageWithDoor();
    const prepared = await prepareStyleSample({
      styleCode: "SCN",
      doorSource: page,
      drawerSource: page,
    });
    expect(prepared.door.ok).toBe(true);
    expect(prepared.drawer.ok).toBe(false);
    expect(prepared.drawer.png).toBeNull();
    expect(prepared.drawer.findings.map(finding => finding.code)).toContain(
      "duplicate"
    );

    const assignment = assignVerifiedSlots({
      styleCode: "SCN",
      door: {
        url: "/manus-storage/scn-door.png",
        fingerprint: prepared.door.fingerprint!,
      },
      drawer: {
        url: "/manus-storage/scn-door.png",
        fingerprint: prepared.door.fingerprint!,
      },
    });
    expect(assignment.doorSampleImageUrl).toBe("/manus-storage/scn-door.png");
    expect(assignment.thumbnailImageUrl).toBe("/manus-storage/scn-door.png");
    expect(assignment.drawerSampleImageUrl).toBeNull();
    expect(assignment.findings.map(finding => finding.code)).toContain(
      "duplicate"
    );

    const distinctDrawer = blank(200, 80, [40, 40, 40]);
    embedDoor(
      distinctDrawer,
      { left: 8, top: 8, width: 184, height: 64 },
      [90, 70, 50],
      3
    );
    const withDrawer = await prepareStyleSample({
      styleCode: "SCN",
      doorSource: page,
      drawerSource: distinctDrawer,
    });
    expect(withDrawer.drawer.ok).toBe(true);
    expect(
      fingerprintsMatch(
        withDrawer.door.fingerprint!,
        withDrawer.drawer.fingerprint!
      )
    ).toBe(false);
  });

  it("rejects a later style that reuses an accepted crop", async () => {
    const first = pageWithDoor().page;
    const second = pageWithDoor().page;
    const other = blank(220, 300);
    embedDoor(
      other,
      { left: 20, top: 20, width: 140, height: 220 },
      [70, 110, 160],
      5
    );
    const prepared = await prepareStyleSamples([
      { styleCode: "SCN", doorSource: first, drawerSource: null },
      { styleCode: "SCA", doorSource: second, drawerSource: null },
      { styleCode: "SSM", doorSource: other, drawerSource: null },
    ]);
    expect(prepared[0].door.ok).toBe(true);
    expect(prepared[1].door.ok).toBe(false);
    expect(prepared[1].door.findings.map(finding => finding.code)).toContain(
      "duplicate"
    );
    expect(prepared[1].door.png).toBeNull();
    expect(prepared[2].door.ok).toBe(true);
    expect(
      fingerprintsMatch(
        fingerprintImage(prepared[0].door.image!),
        fingerprintImage(prepared[2].door.image!)
      )
    ).toBe(false);
  });

  it("blocks the batch when a door crop is rejected and still leaves a missing drawer empty", () => {
    const blocked = refreshWriteDecision([
      assignVerifiedSlots({ styleCode: "SCN", door: null, drawer: null }),
      assignVerifiedSlots({
        styleCode: "SSM",
        door: {
          url: "/manus-storage/ssm.png",
          fingerprint: {
            dhash: "0".repeat(16),
            meanR: 10,
            meanG: 20,
            meanB: 30,
          },
        },
        drawer: null,
      }),
    ]);
    expect(blocked.write).toBe(false);
    if (blocked.write) return;
    expect(blocked.blocked).toEqual(["SCN"]);

    const allowed = refreshWriteDecision([
      assignVerifiedSlots({
        styleCode: "SSM",
        door: {
          url: "/manus-storage/ssm.png",
          fingerprint: {
            dhash: "0".repeat(16),
            meanR: 10,
            meanG: 20,
            meanB: 30,
          },
        },
        drawer: null,
      }),
    ]);
    expect(allowed.write).toBe(true);
    if (!allowed.write) return;
    expect(allowed.rows).toEqual([
      {
        styleCode: "SSM",
        doorSampleImageUrl: "/manus-storage/ssm.png",
        thumbnailImageUrl: "/manus-storage/ssm.png",
        drawerSampleImageUrl: null,
      },
    ]);
  });

  it("round-trips an accepted crop through PNG bytes", async () => {
    const { page, door } = pageWithDoor();
    const png = await encodePng(page);
    const prepared = await prepareStyleSample({
      styleCode: "LSA",
      doorSource: png,
      drawerSource: null,
    });
    expect(prepared.door.ok).toBe(true);
    expect(prepared.door.box).toMatchObject(door);
    expect(prepared.door.png?.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a"
    );
  });
});

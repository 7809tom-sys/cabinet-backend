/**
 * Shared writer for the AEF clean-swatch refresh scripts.
 *
 * Each style needs a source image in --source-dir (CODE.png, or CODE-door.png).
 * The crop comes from detectContentRegions, then verifyPreparedCrop. A rejected
 * crop is not uploaded and not written. drawerSampleImageUrl is set only from
 * a separate CODE-drawer.png that passes as its own picture. Otherwise it is
 * left empty. --apply is required before any database write.
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { storagePut } from "../../server/storage";
import {
  assignVerifiedSlots,
  formatSampleReport,
  prepareStyleSamples,
  refreshWriteDecision,
  type PreparedStyleSample,
  type SlotAssignment,
} from "../../server/lib/sampleImageCrop";

export type CleanSwatchStyle = {
  styleCode: string;
  finish: string;
  legacyDoorImageUrl: string;
};

type StyleRow = {
  id: number;
  styleCode: string;
  finish: string;
  isActive: number | boolean;
  doorSampleImageUrl: string | null;
  drawerSampleImageUrl: string | null;
  thumbnailImageUrl: string | null;
  cornerSwatchImageUrl: string | null;
  roomSceneImageUrl: string | null;
  doorSampleVerified: number | boolean;
  drawerSampleVerified: number | boolean;
};

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readFirst(dir: string, names: string[]): Buffer | null {
  for (const name of names) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return fs.readFileSync(full);
  }
  return null;
}

function loadSource(
  dir: string | undefined,
  styleCode: string,
  kind: "door" | "drawer"
): Buffer | null {
  if (!dir) return null;
  const folded = styleCode.toLowerCase();
  const names =
    kind === "door"
      ? [
          `${styleCode}.png`,
          `${styleCode}.jpg`,
          `${styleCode}.jpeg`,
          `${styleCode}.webp`,
          `${styleCode}-door.png`,
          `${folded}.png`,
          `${folded}-door.png`,
        ]
      : [
          `${styleCode}-drawer.png`,
          `${styleCode}-drawer.jpg`,
          `${styleCode}-drawer.jpeg`,
          `${styleCode}-drawer.webp`,
          `${folded}-drawer.png`,
        ];
  return readFirst(dir, names);
}

function writeCrop(
  dir: string,
  styleCode: string,
  slot: "door" | "drawer",
  png: Buffer | null
): void {
  if (!png) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${styleCode}-${slot}.png`), png);
}

export async function runCleanSwatchRefresh(input: {
  lineName: string;
  styles: CleanSwatchStyle[];
}): Promise<void> {
  const apply = process.argv.includes("--apply");
  const sourceDir = flag("--source-dir");
  const outDir = flag("--out-dir");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is not set. Nothing was written.");

  const samples = await prepareStyleSamples(
    input.styles.map(style => ({
      styleCode: style.styleCode,
      doorSource: loadSource(sourceDir, style.styleCode, "door"),
      drawerSource: loadSource(sourceDir, style.styleCode, "drawer"),
    }))
  );
  console.log(formatSampleReport(samples));
  if (outDir) {
    for (const sample of samples) {
      writeCrop(outDir, sample.styleCode, "door", sample.door.png);
      writeCrop(outDir, sample.styleCode, "drawer", sample.drawer.png);
    }
  }

  const db = await mysql.createConnection(databaseUrl);
  try {
    const [distributors] = await db.query(
      "SELECT id, code, name FROM distributors WHERE code = 'AEF' LIMIT 1"
    );
    const distributorRows = distributors as Array<{
      id: number;
      code: string;
      name: string;
    }>;
    const aef = distributorRows[0];
    if (!aef) throw new Error("Expected exactly one AEF distributor line.");

    const codes = input.styles.map(style => style.styleCode);
    const [beforeRows] = await db.query(
      `SELECT id, styleCode, finish, isActive, doorSampleImageUrl, drawerSampleImageUrl, thumbnailImageUrl,
              cornerSwatchImageUrl, roomSceneImageUrl, doorSampleVerified, drawerSampleVerified
       FROM door_styles
       WHERE distributorId = ? AND styleCode IN (${codes.map(() => "?").join(",")})
       ORDER BY styleCode`,
      [aef.id, ...codes]
    );
    const before = beforeRows as StyleRow[];
    if (before.length !== codes.length) {
      throw new Error(
        `Expected ${codes.length} AEF ${input.lineName} styles; found ${before.length}.`
      );
    }
    const byCode = new Map(before.map(row => [row.styleCode, row]));
    for (const style of input.styles) {
      const row = byCode.get(style.styleCode);
      if (!row || Number(row.isActive) !== 1 || row.finish !== style.finish) {
        throw new Error(
          `Refusing to update unexpected AEF ${input.lineName} style ${style.styleCode}.`
        );
      }
    }

    const preview = {
      mode: apply ? "apply" : "preflight",
      line: input.lineName,
      distributor: aef,
      sourceDir: sourceDir ?? null,
      blocked: samples
        .filter(sample => !sample.door.ok)
        .map(sample => sample.styleCode),
      drawersLeftEmpty: samples
        .filter(sample => !sample.drawer.ok)
        .map(sample => sample.styleCode),
      legacyDoorImageUrl: Object.fromEntries(
        input.styles.map(style => [style.styleCode, style.legacyDoorImageUrl])
      ),
      before,
    };
    if (!apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    if (
      samples.some(
        sample =>
          !sample.door.ok || !sample.door.png || !sample.door.fingerprint
      )
    ) {
      throw new Error(
        "Refusing to write. One or more door crops failed verification."
      );
    }

    const assignments: SlotAssignment[] = [];
    for (const sample of samples) {
      const doorPng = sample.door.png;
      const doorFingerprint = sample.door.fingerprint;
      if (!doorPng || !doorFingerprint)
        throw new Error(`Missing verified door crop for ${sample.styleCode}.`);
      const publishedDoor = await storagePut(
        `aef-${input.lineName.toLowerCase().replace(/\s+/g, "-")}-${sample.styleCode.toLowerCase()}-door-crop.png`,
        doorPng,
        "image/png"
      );
      let drawer: {
        url: string;
        fingerprint: NonNullable<PreparedStyleSample["drawer"]["fingerprint"]>;
      } | null = null;
      if (sample.drawer.ok && sample.drawer.png && sample.drawer.fingerprint) {
        const publishedDrawer = await storagePut(
          `aef-${input.lineName.toLowerCase().replace(/\s+/g, "-")}-${sample.styleCode.toLowerCase()}-drawer-crop.png`,
          sample.drawer.png,
          "image/png"
        );
        drawer = {
          url: publishedDrawer.url,
          fingerprint: sample.drawer.fingerprint,
        };
      }
      assignments.push(
        assignVerifiedSlots({
          styleCode: sample.styleCode,
          door: { url: publishedDoor.url, fingerprint: doorFingerprint },
          drawer,
          drawerRejected:
            !sample.drawer.ok &&
            sample.drawer.findings.some(
              finding => finding.severity === "error"
            ),
        })
      );
    }

    const decision = refreshWriteDecision(assignments);
    if (!decision.write) {
      throw new Error(
        `Refusing to write. Blocked styles: ${decision.blocked.join(", ")}.`
      );
    }
    for (const row of decision.rows) {
      if (
        row.drawerSampleImageUrl &&
        row.drawerSampleImageUrl === row.doorSampleImageUrl
      ) {
        throw new Error(
          `Refusing to copy ${row.styleCode} door crop into the drawer slot.`
        );
      }
    }

    await db.beginTransaction();
    try {
      for (const row of decision.rows) {
        const style = input.styles.find(
          item => item.styleCode === row.styleCode
        );
        const existing = byCode.get(row.styleCode);
        if (!style || !existing)
          throw new Error(`Missing plan for ${row.styleCode}.`);
        await db.query(
          `UPDATE door_styles
           SET doorSampleImageUrl = ?, thumbnailImageUrl = ?, drawerSampleImageUrl = ?,
               doorSampleVerified = 0, drawerSampleVerified = 0
           WHERE id = ? AND distributorId = ? AND styleCode = ? AND isActive = 1 AND finish = ?`,
          [
            row.doorSampleImageUrl,
            row.thumbnailImageUrl,
            row.drawerSampleImageUrl,
            existing.id,
            aef.id,
            row.styleCode,
            style.finish,
          ]
        );
      }
      const [afterRows] = await db.query(
        `SELECT id, styleCode, finish, isActive, doorSampleImageUrl, drawerSampleImageUrl, thumbnailImageUrl,
                cornerSwatchImageUrl, roomSceneImageUrl, doorSampleVerified, drawerSampleVerified
         FROM door_styles
         WHERE distributorId = ? AND styleCode IN (${codes.map(() => "?").join(",")})
         ORDER BY styleCode`,
        [aef.id, ...codes]
      );
      const after = afterRows as StyleRow[];
      if (after.length !== codes.length)
        throw new Error("Target row count changed during swatch refresh.");
      for (const row of after) {
        const expected = decision.rows.find(
          item => item.styleCode === row.styleCode
        );
        if (
          !expected ||
          row.doorSampleImageUrl !== expected.doorSampleImageUrl ||
          row.thumbnailImageUrl !== expected.thumbnailImageUrl
        ) {
          throw new Error(
            `Clean swatch verification failed for ${row.styleCode}.`
          );
        }
        const drawer = row.drawerSampleImageUrl?.trim()
          ? row.drawerSampleImageUrl
          : null;
        if (drawer !== expected.drawerSampleImageUrl) {
          throw new Error(
            `Drawer slot verification failed for ${row.styleCode}.`
          );
        }
        if (
          Number(row.doorSampleVerified) !== 0 ||
          Number(row.drawerSampleVerified) !== 0
        ) {
          throw new Error(
            `Sample verification flags were left set for ${row.styleCode}.`
          );
        }
      }
      await db.commit();
      console.log(
        JSON.stringify(
          { applied: after, report: formatSampleReport(samples) },
          null,
          2
        )
      );
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

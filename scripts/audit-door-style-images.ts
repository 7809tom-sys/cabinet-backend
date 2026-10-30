/**
 * Read-only audit of door_styles sample pictures.
 *
 *   pnpm audit:door-images
 *   pnpm exec tsx --env-file=.env scripts/audit-door-style-images.ts --measure
 *
 * Prints a report. Does not write to the database. Pixel checks download
 * stored files only when --measure is present. The hand-run data fix is
 * docs/sql/0238_clear_copied_drawer_swatches.tidb.sql.
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { decodeRgb, type RgbImage } from "../server/lib/sampleImageCrop";
import {
  auditDoorStyleImages,
  formatAuditReport,
  type DoorStyleImageAuditRow,
} from "../server/lib/doorStyleImageAudit";

dotenv.config();

const MEASURE = process.argv.includes("--measure");
const BASE_URL = (
  process.env.DOOR_IMAGE_BASE_URL ?? "https://www.cabinetdealz.com"
).replace(/\/+$/, "");

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function refuseMutation(): void {
  const blocked = ["--apply", "--fix", "--write", "--execute"];
  const used = blocked.filter(name => process.argv.includes(name));
  if (used.length === 0) return;
  console.error(
    `This audit only reads. ${used.join(", ")} was ignored. Paste docs/sql/0238_clear_copied_drawer_swatches.tidb.sql by hand if drawers should be cleared.`
  );
  process.exit(1);
}

function absoluteUrl(stored: string): string {
  if (/^https?:\/\//i.test(stored)) return stored;
  if (stored.startsWith("/")) return `${BASE_URL}${stored}`;
  return `${BASE_URL}/${stored}`;
}

async function measureUrls(urls: string[]): Promise<Map<string, RgbImage>> {
  const images = new Map<string, RgbImage>();
  const fromDir = flag("--from-dir");
  for (const url of urls) {
    try {
      let bytes: Buffer;
      if (fromDir) {
        const name = path.basename(url.split("?")[0] ?? url);
        bytes = fs.readFileSync(path.join(fromDir, name));
      } else {
        const response = await fetch(absoluteUrl(url));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
      }
      images.set(url, await decodeRgb(bytes));
    } catch (error) {
      console.error(
        `Could not measure ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return images;
}

async function main(): Promise<void> {
  refuseMutation();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is not set. Nothing was read.");
  const db = await mysql.createConnection(databaseUrl);
  try {
    const [rows] = await db.query(
      `SELECT id, styleCode, doorSampleImageUrl, drawerSampleImageUrl, thumbnailImageUrl
       FROM door_styles
       WHERE doorSampleImageUrl IS NOT NULL
          OR drawerSampleImageUrl IS NOT NULL
          OR thumbnailImageUrl IS NOT NULL
       ORDER BY styleCode, id`
    );
    const styles = rows as DoorStyleImageAuditRow[];
    const urls = new Set<string>();
    for (const row of styles) {
      for (const value of [
        row.doorSampleImageUrl,
        row.drawerSampleImageUrl,
        row.thumbnailImageUrl,
      ]) {
        const trimmed = value?.trim();
        if (trimmed) urls.add(trimmed);
      }
    }
    const images = MEASURE
      ? await measureUrls([...urls])
      : new Map<string, RgbImage>();
    const report = auditDoorStyleImages(styles, images);
    console.log(formatAuditReport(report));
    const out = flag("--out");
    if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

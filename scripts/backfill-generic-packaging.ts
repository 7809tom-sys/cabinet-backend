import { eq } from "drizzle-orm";
import { cabinets } from "../drizzle/schema";
import { getDb } from "../server/db";
import { genericCabinetPackage } from "../shared/genericCabinetPackaging";

const apply = process.argv.includes("--apply");
const replaceMaster = process.argv.includes("--replace-master");
const db = await getDb();
if (!db) throw new Error("Database is unavailable.");

const rows = await db.select({
  id: cabinets.id,
  masterCode: cabinets.masterCode,
  description: cabinets.description,
  category: cabinets.category,
  width: cabinets.width,
  height: cabinets.height,
  depth: cabinets.depth,
  weight: cabinets.weight,
  pkgLength: cabinets.pkgLength,
  pkgWidth: cabinets.pkgWidth,
  pkgHeight: cabinets.pkgHeight,
  pkgWeight: cabinets.pkgWeight,
  isActive: cabinets.isActive,
}).from(cabinets).where(eq(cabinets.isActive, true));

const missing = (value: unknown) => value == null || !Number.isFinite(Number(value)) || Number(value) <= 0;
let changedRows = 0;
let preservedFields = 0;
let filledFields = 0;
let trimRows = 0;
const samples: Array<Record<string, unknown>> = [];

for (const row of rows) {
  const estimate = genericCabinetPackage({
    widthIn: row.width == null ? null : Number(row.width),
    heightIn: row.height == null ? null : Number(row.height),
    depthIn: row.depth == null ? null : Number(row.depth),
    assembledWeightLbs: row.weight == null ? null : Number(row.weight),
    category: row.category,
    description: row.description,
  });
  const candidates = {
    pkgLength: estimate.lengthIn.toFixed(2),
    pkgWidth: estimate.widthIn.toFixed(2),
    pkgHeight: estimate.heightIn.toFixed(2),
    pkgWeight: estimate.weightLbs.toFixed(2),
  };
  const patch: Partial<typeof candidates> = {};
  for (const key of Object.keys(candidates) as Array<keyof typeof candidates>) {
    if (replaceMaster || missing(row[key])) {
      patch[key] = candidates[key];
      filledFields += 1;
    } else {
      preservedFields += 1;
    }
  }
  if (Object.keys(patch).length === 0) continue;
  changedRows += 1;
  if (estimate.isTrim) trimRows += 1;
  if (samples.length < 20) {
    samples.push({
      id: row.id,
      code: row.masterCode,
      category: row.category,
      patch,
      freightClass: estimate.freightClass,
      estimated: estimate.isTrim ? "trim bundled at 2 lb" : "generic flat-pack rule",
    });
  }
  if (apply) {
    await db.update(cabinets).set(patch).where(eq(cabinets.id, row.id));
  }
}

console.log(JSON.stringify({
  mode: apply ? "APPLIED" : "DRY RUN",
  strategy: replaceMaster ? "STANDARDIZE ALL MASTER PACKAGE FIELDS" : "FILL MISSING MASTER PACKAGE FIELDS",
  activeCatalogRows: rows.length,
  changedRows,
  filledFields,
  preservedFields,
  trimRows,
  samples,
}, null, 2));

process.exit(0);

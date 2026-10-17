import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

type SourceRecord = {
  sku: string;
  sourcePage: number;
  description: string;
};

type AefCabinet = {
  id: number;
  masterCode: string;
  category: string | null;
  geometryWidth: string | null;
  geometryHeight: string | null;
  geometryDepth: string | null;
  geometrySourcePage: string | null;
  configJson: string | null;
};

const SOURCE_BOOK = "AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2";
const manifestPath = path.resolve(process.cwd(), "scripts/data/aef-complete-source-manifest.json");
const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SourceRecord[];
const descriptionsBySku = new Map(sourceManifest.map((row) => [row.sku.toUpperCase(), row]));

function quoteDimension(value: string | null): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const whole = Math.floor(parsed);
  const eighths = Math.round((parsed - whole) * 8);
  const fraction = new Map<number, string>([
    [1, "1/8"], [2, "1/4"], [3, "3/8"], [4, "1/2"],
    [5, "5/8"], [6, "3/4"], [7, "7/8"],
  ]).get(eighths);
  if (eighths === 0) return `${whole}\"`;
  if (eighths === 8) return `${whole + 1}\"`;
  return fraction ? `${whole} ${fraction}\"` : `${parsed}\"`;
}

function sourcePageCitation(value: string | null): string {
  if (!value) return "";
  const explicit = value.match(/pp?\.\s*([\d–-]+)/i);
  if (explicit?.[1]) {
    const pages = explicit[1].replace(/\s+/g, " ");
    return `, ${/[-–]/.test(pages) ? "pp." : "p."} ${pages}`;
  }
  const numberOnly = value.match(/^\d+$/);
  return numberOnly ? `, p. ${numberOnly[0]}` : "";
}

function lineSpecificDescription(row: AefCabinet): string {
  const direct = descriptionsBySku.get(row.masterCode.toUpperCase());
  if (direct) return `${direct.description}. ${SOURCE_BOOK}, p. ${direct.sourcePage}.`;

  let config: Record<string, unknown> = {};
  try {
    config = row.configJson ? JSON.parse(row.configJson) as Record<string, unknown> : {};
  } catch {
    config = {};
  }

  const sourceDescription = typeof config.description === "string" && config.description.trim()
    ? config.description.trim()
    : null;
  const layout = typeof config.layoutSpec === "string" && config.layoutSpec.trim()
    ? config.layoutSpec.trim().replace(/;\s*front layout.*$/i, "").replace(/;\s*AltaEuro.*$/i, "")
    : null;
  const dimensions = [quoteDimension(row.geometryWidth), quoteDimension(row.geometryHeight), quoteDimension(row.geometryDepth)]
    .filter((value): value is string => Boolean(value));
  const base = sourceDescription
    ?? (dimensions.length === 3
      ? `${dimensions[0]} W × ${dimensions[1]} H × ${dimensions[2]} D ${layout ?? row.masterCode}`
      : layout ?? row.masterCode);
  const page = sourcePageCitation(row.geometrySourcePage);
  return `${base}. ${SOURCE_BOOK}${page}.`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  const [[line]]: any = await db.query("SELECT id, name FROM distributors WHERE code = 'AEF' LIMIT 1");
  if (!line) throw new Error("No internal AEF distributor line exists.");

  const [cabinets]: [AefCabinet[], unknown] = await db.query(
    `SELECT c.id, c.masterCode, c.category,
            MAX(s.geometryWidth) AS geometryWidth,
            MAX(s.geometryHeight) AS geometryHeight,
            MAX(s.geometryDepth) AS geometryDepth,
            MAX(s.geometrySourcePage) AS geometrySourcePage,
            MAX(o.configJson) AS configJson
       FROM distributor_skus s
       JOIN cabinets c ON c.id = s.cabinetId
       LEFT JOIN distributor_cabinet_overrides o ON o.distributorId = s.distributorId AND o.cabinetId = s.cabinetId
      WHERE s.distributorId = ? AND s.isPublished = 1 AND s.isAvailable = 1
      GROUP BY c.id, c.masterCode, c.category
      ORDER BY c.masterCode`,
    [line.id],
  );
  if (cabinets.length !== 277) {
    throw new Error(`Guard failed: expected 277 published AEF cabinet masters, found ${cabinets.length}.`);
  }

  const assignments = cabinets.map((cabinet) => ({
    cabinetId: cabinet.id,
    masterCode: cabinet.masterCode,
    supplierDescription: lineSpecificDescription(cabinet),
  }));
  const invalid = assignments.filter((row) => !row.supplierDescription || /staged|pending Designer proof/i.test(row.supplierDescription));
  if (invalid.length) throw new Error(`Invalid source descriptions: ${invalid.map((row) => row.masterCode).join(", ")}`);

  console.log(JSON.stringify({
    mode: apply ? "apply" : "preflight",
    distributor: line.name,
    publishedMasters: assignments.length,
    directSourceDescriptions: assignments.filter((row) => descriptionsBySku.has(row.masterCode.toUpperCase())).length,
    configuredSourceDescriptions: assignments.filter((row) => !descriptionsBySku.has(row.masterCode.toUpperCase())).length,
    examples: assignments.filter((row) => ["2DBID36", "B24S", "SB24S", "W2430S", "VSB24S"].includes(row.masterCode)),
  }, null, 2));
  if (!apply) {
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    for (const assignment of assignments) {
      await db.query(
        `UPDATE distributor_skus
            SET supplierDescription = ?
          WHERE distributorId = ? AND cabinetId = ? AND isPublished = 1 AND isAvailable = 1`,
        [assignment.supplierDescription, line.id, assignment.cabinetId],
      );
    }
    const [badRows]: any = await db.query(
      `SELECT DISTINCT c.masterCode, s.supplierDescription
         FROM distributor_skus s JOIN cabinets c ON c.id = s.cabinetId
        WHERE s.distributorId = ? AND s.isPublished = 1 AND s.isAvailable = 1
          AND (s.supplierDescription IS NULL OR s.supplierDescription = '' OR s.supplierDescription LIKE '%staged%' OR s.supplierDescription LIKE '%pending Designer proof%')`,
      [line.id],
    );
    if (badRows.length) throw new Error(`Verification failed for ${badRows.length} source descriptions.`);
    await db.commit();
    console.log(`Applied ${assignments.length} supplier-specific source descriptions to ${line.name}.`);
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

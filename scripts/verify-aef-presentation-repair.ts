import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { createHash } from "node:crypto";

const folder = process.argv.find(arg => arg.startsWith("--output-dir="))?.slice("--output-dir=".length) || "/home/ubuntu/frameless-audit";
const hash = (rows: unknown) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const db = await mysql.createConnection(process.env.DATABASE_URL!);
try {
  const [[line]]: any = await db.query("SELECT id FROM distributors WHERE code='AEF' LIMIT 1");
  const [source]: any = await db.query(`SELECT s.id, s.cabinetId, c.masterCode, s.styleId, s.supplierDescription, s.imageUrl, s.geometryWidth, s.geometryHeight, s.geometryDepth, s.geometryStatus, s.constructionType, s.isPublished, s.isAvailable, s.listPrice, s.yourCost, s.homeownerPrice FROM distributor_skus s JOIN cabinets c ON c.id=s.cabinetId WHERE s.distributorId=? ORDER BY s.id`, [line.id]);
  const [overrides]: any = await db.query("SELECT cabinetId,width,height,depth,configJson,imageUrl,note FROM distributor_cabinet_overrides WHERE distributorId=? ORDER BY cabinetId", [line.id]);
  const [masters]: any = await db.query("SELECT c.* FROM cabinets c WHERE c.id IN (SELECT cabinetId FROM distributor_skus WHERE distributorId=?) ORDER BY c.id", [line.id]);
  const [others]: any = await db.query("SELECT COUNT(*) AS rowsCount, SUM(CRC32(CONCAT_WS('|',id,cabinetId,styleId,COALESCE(imageUrl,''),COALESCE(supplierDescription,''),COALESCE(listPrice,''),COALESCE(yourCost,''),COALESCE(homeownerPrice,''),isPublished,isAvailable,COALESCE(geometryWidth,''),COALESCE(geometryHeight,''),COALESCE(geometryDepth,'')))) AS checksum FROM distributor_skus WHERE distributorId<>?", [line.id]);
  const protectedSource = source.map(({ supplierDescription, imageUrl, ...rest }: any) => rest);
  const protectedOverrides = overrides.map(({ imageUrl, note, ...rest }: any) => rest);
  const eligible = source.filter((s: any) => s.isPublished && s.isAvailable);
  const result = {
    allSourceRows: source.length,
    eligibleSourceRows: eligible.length,
    eligibleMasters: new Set(eligible.map((s: any) => s.cabinetId)).size,
    protectedSourceHash: hash(protectedSource),
    protectedOverridesHash: hash(protectedOverrides),
    sharedMasterHash: hash(masters),
    otherSupplierHash: hash(others),
    sourceTextLeaks: eligible.filter((s: any) => /Full Spec Book|Spec Book|source\s*p\.|AltaEuro\s*\//i.test(s.supplierDescription ?? "")).length,
    sourcesWithoutImages: eligible.filter((s: any) => !s.imageUrl).length,
    distinctImages: new Set(eligible.map((s: any) => s.imageUrl)).size,
  };
  fs.mkdirSync(folder, { recursive: true });
  if (process.argv.includes("--snapshot")) {
    fs.writeFileSync(path.join(folder, "presentation-before.json"), JSON.stringify({ result, source, overrides }, null, 2) + "\n");
  } else {
    const before = JSON.parse(fs.readFileSync(path.join(folder, "presentation-before.json"), "utf8")).result;
    for (const key of ["allSourceRows", "eligibleSourceRows", "eligibleMasters", "protectedSourceHash", "protectedOverridesHash", "sharedMasterHash", "otherSupplierHash"]) {
      if (result[key as keyof typeof result] !== before[key]) throw new Error(`Protected invariant changed: ${key}`);
    }
    fs.writeFileSync(path.join(folder, "presentation-after.json"), JSON.stringify({ ...result, protectedDataUnchanged: true }, null, 2) + "\n");
  }
  console.log(JSON.stringify(result, null, 2));
} finally { await db.end(); }

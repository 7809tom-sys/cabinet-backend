import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import mysql from "mysql2/promise";

const MANIFEST = "/home/ubuntu/hardware-resource-import-review/hardware-resources-catalog-ready-import.csv";
const LINE_CODE = "HRDW";
const EXPECTED_ROWS = 503;
const EXPECTED_COLLECTIONS = 57;
const EXPECTED_CONFIGURATIONS = 236;

type SourceRow = {
  vendor_sku: string;
  name: string;
  description: string;
  manufacturer: string;
  collection: string;
  finish: string;
  product_type: string;
  category: string;
  customer_list_price: string;
  dealer_broken_carton_cost: string;
  dealer_full_carton_cost: string;
  availability_status: string;
  public_image_rights: string;
  managed_image_url: string;
  shipping_sale_status: string;
  source_price_effective_date: string;
  hardwareConfigurationKey?: string;
  hardwareConfigurationLabel?: string;
};

function money(value: string, field: string, sku: string): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${sku}: invalid ${field}`);
  return number.toFixed(2);
}

function publicCopy(value: string): string {
  return value
    .replace(/\*{1,3}[A-Z]{2,16}\*{1,3}\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeKeyPart(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function configurationLabel(description: string): string {
  const label = description.replace(/\s*Finish\s*:\s*[^.]+\.?\s*$/i, "").trim();
  if (!label) throw new Error("Missing finish-independent hardware configuration label");
  return label;
}

// The supplied manufacturer data distinguishes these otherwise text-identical
// configurations by physical dimensions (for example width and base length).
// Keep those reviewed source families separate; never use SKU text as a general
// grouping rule and never offer two different SKUs under one finish choice.
const CONFIGURATION_FAMILY_OVERRIDES: Record<string, string> = {
  "745-128BLK": "belfast-745-128",
  "745-128SN": "belfast-745-128",
  "776-128BLK": "belfast-776-128",
  "776-128SN": "belfast-776-128",
  "317BNBDL": "lafayette-317",
  "417BNBDL": "lafayette-417",
};

function configurationKey(row: SourceRow, sourceDescription = row.description): string {
  const label = configurationLabel(sourceDescription);
  const reviewedFamily = CONFIGURATION_FAMILY_OVERRIDES[row.vendor_sku] ?? "standard";
  const sourceIdentity = [
    normalizeKeyPart(row.collection),
    normalizeKeyPart(row.product_type),
    normalizeKeyPart(label),
    reviewedFamily,
  ].join("|");
  return createHash("sha256").update(sourceIdentity).digest("hex").slice(0, 24);
}

function loadManifest(): SourceRow[] {
  if (!fs.existsSync(MANIFEST)) throw new Error(`Missing catalog manifest: ${MANIFEST}`);
  const rows = parse(fs.readFileSync(MANIFEST, "utf8"), { columns: true, skip_empty_lines: true, trim: true }) as SourceRow[];
  if (rows.length !== EXPECTED_ROWS) throw new Error(`Expected ${EXPECTED_ROWS} records; received ${rows.length}`);
  const seen = new Set<string>();
  const configurationFinishes = new Map<string, Set<string>>();
  const collections = new Set<string>();
  for (const row of rows) {
    row.vendor_sku = row.vendor_sku?.trim().toUpperCase();
    if (!row.vendor_sku || seen.has(row.vendor_sku)) throw new Error(`Duplicate or blank hardware SKU: ${row.vendor_sku || "(blank)"}`);
    seen.add(row.vendor_sku);
    const sourceDescription = row.description ?? "";
    row.name = publicCopy(row.name ?? "");
    row.description = publicCopy(row.description ?? "");
    if (!row.name || row.name.length > 255 || !row.description) throw new Error(`${row.vendor_sku}: missing or oversized customer product copy`);
    if (!row.collection?.trim() || !row.finish?.trim() || !row.product_type?.trim()) throw new Error(`${row.vendor_sku}: missing source collection, finish, or product type`);
    if (row.category !== "Decorative Hardware") throw new Error(`${row.vendor_sku}: unsupported category ${row.category}`);
    if (row.public_image_rights !== "APPROVED — supplied manufacturer images approved for public catalog use") throw new Error(`${row.vendor_sku}: manufacturer image rights are not approved`);
    if (!row.managed_image_url?.startsWith("/manus-storage/")) throw new Error(`${row.vendor_sku}: managed supplier image is missing`);
    if (!row.availability_status?.startsWith("In Stock — assumed by default policy")) throw new Error(`${row.vendor_sku}: approved default availability policy is absent`);
    if (row.shipping_sale_status !== "CATALOG_ONLY_PENDING_HARDWARE_SHIPPING_PROFILE") throw new Error(`${row.vendor_sku}: unexpected shipping state`);
    const broken = money(row.dealer_broken_carton_cost, "broken-carton cost", row.vendor_sku);
    const full = money(row.dealer_full_carton_cost, "full-carton cost", row.vendor_sku);
    if (broken !== full) throw new Error(`${row.vendor_sku}: current schema cannot preserve unequal broken/full carton cost`);
    money(row.customer_list_price, "list price", row.vendor_sku);
    const key = configurationKey(row, sourceDescription);
    const finishKey = normalizeKeyPart(row.finish);
    const finishes = configurationFinishes.get(key) ?? new Set<string>();
    if (finishes.has(finishKey)) throw new Error(`${row.vendor_sku}: duplicate finish in one reviewed hardware configuration`);
    finishes.add(finishKey);
    configurationFinishes.set(key, finishes);
    collections.add(normalizeKeyPart(row.collection));
    row.hardwareConfigurationKey = key;
    row.hardwareConfigurationLabel = configurationLabel(row.description);
  }
  if (collections.size !== EXPECTED_COLLECTIONS) throw new Error(`Expected ${EXPECTED_COLLECTIONS} source style collections; received ${collections.size}`);
  if (configurationFinishes.size !== EXPECTED_CONFIGURATIONS) throw new Error(`Expected ${EXPECTED_CONFIGURATIONS} reviewed hardware configurations; received ${configurationFinishes.size}`);
  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = loadManifest();
  const sample = rows.find((row) => row.vendor_sku === "972-128SN");
  console.log(JSON.stringify({
    mode: apply ? "apply" : "preflight",
    lineCode: LINE_CODE,
    rows: rows.length,
    styleCollections: [...new Set(rows.map((row) => row.collection.trim()))].length,
    configurations: new Set(rows.map((row) => row.hardwareConfigurationKey)).size,
    categories: [...new Set(rows.map((row) => row.product_type))].sort(),
    explicitCheckoutState: rows[0]?.shipping_sale_status,
    sample972Image: sample?.managed_image_url,
  }, null, 2));
  if (!apply) return;

  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    await db.beginTransaction();
    await db.execute(
      `INSERT INTO distributors (code, name, initials, costMultiplier, tariffRate, shippingRate, isActive, retailPriceBasis, displayMode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), initials = VALUES(initials), costMultiplier = VALUES(costMultiplier), isActive = VALUES(isActive), retailPriceBasis = VALUES(retailPriceBasis)`,
      [LINE_CODE, "Hardware Resources", "HR", "0.5000", "0", "0", true, "source_list", "branded"],
    );
    const [lineRows] = await db.execute<mysql.RowDataPacket[]>("SELECT id FROM distributors WHERE code = ? LIMIT 1", [LINE_CODE]);
    const lineId = Number(lineRows[0]?.id);
    if (!lineId) throw new Error("Hardware Resources distributor line was not created");

    let insertedOrUpdated = 0;
    for (const row of rows) {
      await db.execute(
        `INSERT INTO vendor_products (distributorId, vendorSku, name, description, category, hardwareCollection, hardwareProductType, hardwareFinish, hardwareConfigurationKey, hardwareConfigurationLabel, listPrice, yourCost, imageUrl, isAvailable, status, isPublished)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'approved', 1)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), description = VALUES(description), category = VALUES(category),
           hardwareCollection = VALUES(hardwareCollection), hardwareProductType = VALUES(hardwareProductType),
           hardwareFinish = VALUES(hardwareFinish), hardwareConfigurationKey = VALUES(hardwareConfigurationKey),
           hardwareConfigurationLabel = VALUES(hardwareConfigurationLabel),
           listPrice = VALUES(listPrice), yourCost = VALUES(yourCost), imageUrl = VALUES(imageUrl),
           isAvailable = VALUES(isAvailable), status = VALUES(status), isPublished = VALUES(isPublished)`,
        [lineId, row.vendor_sku, row.name, row.description, row.category, row.collection.trim(), row.product_type.trim(), row.finish.trim(), row.hardwareConfigurationKey, row.hardwareConfigurationLabel, money(row.customer_list_price, "list price", row.vendor_sku), money(row.dealer_broken_carton_cost, "broken-carton cost", row.vendor_sku), row.managed_image_url],
      );
      insertedOrUpdated += 1;
    }
    const [counts] = await db.execute<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS total, SUM(isPublished = 1 AND status = 'approved' AND isAvailable = 1) AS publicTotal FROM vendor_products WHERE distributorId = ?",
      [lineId],
    );
    if (Number(counts[0]?.total) !== EXPECTED_ROWS || Number(counts[0]?.publicTotal) !== EXPECTED_ROWS) {
      throw new Error(`Post-write count mismatch: ${JSON.stringify(counts[0])}`);
    }
    await db.commit();
    console.log(JSON.stringify({ applied: insertedOrUpdated, lineId, total: Number(counts[0].total), publicTotal: Number(counts[0].publicTotal) }, null, 2));
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

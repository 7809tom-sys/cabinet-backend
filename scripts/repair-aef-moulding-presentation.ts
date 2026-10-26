import mysql from "mysql2/promise";
import { pathToFileURL } from "node:url";

/**
 * Repairs six U.S. Cabinet Depot Frameless moulding records that were
 * incorrectly assigned a V8.2 pricing-page screenshot as catalog/spec art.
 *
 * It deliberately changes no price, cost, multiplier, availability, package,
 * geometry, shared framed-master artwork, or customer/order data.
 *
 * Run: pnpm exec tsx scripts/repair-aef-moulding-presentation.ts [--apply]
 */

const USCD_DISTRIBUTOR_CODE = "AEF";
const BAD_PRICE_TABLE_IMAGE = "/manus-storage/aef-accessory-moulding_56f3c613.png";
const NEUTRAL_MOULDING_RENDER = "/manus-storage/aef-accessory-moulding-render_fbee12a3.webp";

const MOULDINGS = [
  { code: "OCM8", description: "Outside Corner Moulding", sharedMaster: true },
  { code: "BM8", description: "Base Moulding", sharedMaster: false },
  { code: "SM8", description: "Scribe Moulding", sharedMaster: true },
  { code: "TKC", description: "Toe Kick", sharedMaster: true },
  { code: "TKC-PVC", description: "PVC Toe Kick", sharedMaster: false },
  { code: "CORNER-PVC", description: "PVC Corner", sharedMaster: false },
] as const;

type MouldingCode = (typeof MOULDINGS)[number]["code"];

type Row = {
  id: number;
  masterCode: MouldingCode;
  description: string | null;
  specImageUrl: string | null;
  overrideId: number | null;
  overrideImageUrl: string | null;
  configJson: string | null;
  skuCount: number;
  priceTableSkuCount: number;
};

function cleanOverrideConfig(raw: string | null, description: string): string {
  let config: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed as Record<string, unknown>;
    } catch {
      // The row is rejected by the preflight if it cannot be normalized safely.
      throw new Error("Moulding override contains invalid config JSON.");
    }
  }
  config.description = description;
  config.layoutSpec = description;
  // A pricing-and-availability table is not a technical drawing and must never
  // be inherited into the public product detail view.
  delete config.specImageUrl;
  delete config.specNotes;
  return JSON.stringify(config);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  const expectedCodes = MOULDINGS.map((item) => item.code);

  try {
    const [[line]]: any = await db.query(
      "SELECT id, name, code, retailPriceBasis, costMultiplier FROM distributors WHERE code = ? LIMIT 1",
      [USCD_DISTRIBUTOR_CODE],
    );
    if (!line || line.name !== "US Cabinet Depot Frameless" || line.retailPriceBasis !== "cost_plus_tier") {
      throw new Error("Guard failed: expected the active US Cabinet Depot Frameless cost-plus-tier line.");
    }

    const [rows] = await db.query<Row[]>(
      `SELECT c.id, c.masterCode, c.description, c.specImageUrl,
              o.id AS overrideId, o.imageUrl AS overrideImageUrl, o.configJson,
              COUNT(s.id) AS skuCount,
              SUM(s.imageUrl = ?) AS priceTableSkuCount
         FROM cabinets c
         JOIN distributor_skus s
           ON s.cabinetId = c.id AND s.distributorId = ? AND s.isPublished = 1 AND s.isAvailable = 1
         LEFT JOIN distributor_cabinet_overrides o
           ON o.distributorId = s.distributorId AND o.cabinetId = c.id
        WHERE c.masterCode IN (${expectedCodes.map(() => "?").join(", ")})
        GROUP BY c.id, c.masterCode, c.description, c.specImageUrl, o.id, o.imageUrl, o.configJson
        ORDER BY c.masterCode`,
      [BAD_PRICE_TABLE_IMAGE, line.id, ...expectedCodes],
    );

    if (rows.length !== MOULDINGS.length || rows.some((row) => row.overrideId == null || Number(row.skuCount) <= 0)) {
      throw new Error("Guard failed: expected exactly six active USCD moulding masters with line overrides.");
    }
    if (rows.some((row) => row.configJson == null)) {
      throw new Error("Guard failed: each USCD moulding must have an existing line-scoped configuration.");
    }

    const preview = rows.map((row) => {
      const definition = MOULDINGS.find((item) => item.code === row.masterCode)!;
      return {
        masterCode: row.masterCode,
        sourceRows: Number(row.skuCount),
        oldDescription: row.description,
        newDescription: definition.description,
        oldOverrideImageUrl: row.overrideImageUrl,
        newOverrideImageUrl: NEUTRAL_MOULDING_RENDER,
        priceTableSkuRowsToReplace: Number(row.priceTableSkuCount),
        clearMasterSpecImage: !definition.sharedMaster,
      };
    });

    console.log(JSON.stringify({
      mode: apply ? "apply" : "preflight",
      distributor: { id: line.id, name: line.name, code: line.code, retailPriceBasis: line.retailPriceBasis, costMultiplier: line.costMultiplier },
      pricePolicy: "unchanged: USCD landed cost × configured homeowner tier",
      affected: preview,
    }, null, 2));

    if (!apply) return;

    await db.beginTransaction();
    try {
      for (const row of rows) {
        const definition = MOULDINGS.find((item) => item.code === row.masterCode)!;
        const configJson = cleanOverrideConfig(row.configJson, definition.description);

        await db.query(
          `UPDATE distributor_cabinet_overrides
              SET imageUrl = ?, configJson = ?,
                  note = CONCAT(COALESCE(note, ''), CASE WHEN COALESCE(note, '') LIKE '%USCD moulding presentation corrected%' THEN '' ELSE '\nUSCD moulding presentation corrected: neutral product render; price-sheet artwork removed.' END)
            WHERE id = ? AND distributorId = ?`,
          [NEUTRAL_MOULDING_RENDER, configJson, row.overrideId, line.id],
        );
        await db.query(
          `UPDATE distributor_skus
              SET imageUrl = ?, supplierDescription = ?
            WHERE distributorId = ? AND cabinetId = ? AND isPublished = 1 AND isAvailable = 1`,
          [NEUTRAL_MOULDING_RENDER, definition.description, line.id, row.id],
        );
        if (!definition.sharedMaster) {
          await db.query(
            "UPDATE cabinets SET description = ?, specImageUrl = NULL, specNotes = NULL WHERE id = ?",
            [definition.description, row.id],
          );
        }
      }

      const [remaining] = await db.query<Array<{ count: number }>>(
        `SELECT COUNT(*) AS count
           FROM distributor_skus s
           JOIN cabinets c ON c.id = s.cabinetId
          WHERE s.distributorId = ? AND c.masterCode IN (${expectedCodes.map(() => "?").join(", ")})
            AND s.imageUrl = ?`,
        [line.id, ...expectedCodes, BAD_PRICE_TABLE_IMAGE],
      );
      if (Number(remaining[0]?.count ?? 0) !== 0) throw new Error("Verification failed: a price-table image remains on a USCD moulding SKU.");

      await db.commit();
      console.log(`Applied the USCD moulding presentation repair to ${MOULDINGS.length} masters without changing price data.`);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

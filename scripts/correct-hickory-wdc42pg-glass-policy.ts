/*
 * Source-scoped repair for the published Hickory Shaker WDC42PG glass policy.
 *
 * Evidence: the supplier record identifies HS-WDC42PG as a full diagonal wall
 * cabinet with its plain glass door included. This is an exception to the
 * distributor-wide glass policy and must not change any other Hickory SKU.
 *
 * Preview:
 *   pnpm exec tsx scripts/correct-hickory-wdc42pg-glass-policy.ts
 * Apply after preview:
 *   pnpm exec tsx scripts/correct-hickory-wdc42pg-glass-policy.ts --apply
 */
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const DISTRIBUTOR_ID = 210001;
const CABINET_ID = 9390175;
const MASTER_CODE = "WDC42PG";
const SUPPLIER_SKU = "HS-WDC42PG";

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[distributor]] = await db.query<Array<{ id: number; code: string; name: string }>>(
      "SELECT id, code, name FROM distributors WHERE id = ? LIMIT 1",
      [DISTRIBUTOR_ID],
    );
    if (!distributor || distributor.code !== "CS") {
      throw new Error(`Expected Hickory source distributor CS (${DISTRIBUTOR_ID}); found ${JSON.stringify(distributor ?? null)}`);
    }

    const [[cabinet]] = await db.query<Array<{
      id: number;
      masterCode: string;
      category: string;
      subCategory: string;
      placementType: string;
      description: string | null;
      isActive: number;
      showInDesigner: number;
    }>>(
      `SELECT id, masterCode, category, subCategory, placementType, description, isActive, showInDesigner
       FROM cabinets WHERE id = ? AND masterCode = ? LIMIT 1`,
      [CABINET_ID, MASTER_CODE],
    );
    if (!cabinet || cabinet.category !== "Wall" || cabinet.placementType !== "wall" || !/glass included/i.test(cabinet.description ?? "")) {
      throw new Error(`WDC42PG source identity no longer matches the verified included-glass cabinet: ${JSON.stringify(cabinet ?? null)}`);
    }

    const [[sku]] = await db.query<Array<{
      id: number;
      platformSku: string;
      distributorSku: string;
      styleId: number;
      isAvailable: number;
      isPublished: number;
      status: string;
    }>>(
      `SELECT id, platformSku, distributorSku, styleId, isAvailable, isPublished, status
       FROM distributor_skus
       WHERE distributorId = ? AND cabinetId = ? AND distributorSku = ? LIMIT 1`,
      [DISTRIBUTOR_ID, CABINET_ID, SUPPLIER_SKU],
    );
    if (!sku || !sku.isAvailable || !sku.isPublished || sku.status !== "approved") {
      throw new Error(`WDC42PG source SKU is not the expected published record: ${JSON.stringify(sku ?? null)}`);
    }

    const [[existing]] = await db.query<Array<{ configJson: string | null }>>(
      "SELECT configJson FROM distributor_cabinet_overrides WHERE distributorId = ? AND cabinetId = ? LIMIT 1",
      [DISTRIBUTOR_ID, CABINET_ID],
    );
    const parsed = existing?.configJson ? JSON.parse(existing.configJson) : {};
    const next = { ...parsed, glassIncluded: true };

    const report = {
      apply: APPLY,
      distributor: { id: distributor.id, code: distributor.code, name: distributor.name },
      cabinet: { id: cabinet.id, masterCode: cabinet.masterCode, description: cabinet.description },
      sku,
      previousGlassIncludedOverride: parsed.glassIncluded ?? null,
      nextGlassIncludedOverride: true,
      scope: "one distributor_cabinet_overrides row; no shared cabinet, price, image, availability, or other SKU update",
    };
    console.log(JSON.stringify(report, null, 2));
    if (!APPLY) return;

    await db.beginTransaction();
    try {
      await db.query(
        `INSERT INTO distributor_cabinet_overrides (distributorId, cabinetId, configJson, note)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE configJson = VALUES(configJson), note = VALUES(note)`,
        [
          DISTRIBUTOR_ID,
          CABINET_ID,
          JSON.stringify(next),
          "Source repair: HS-WDC42PG is a complete diagonal wall cabinet with plain glass included; source supplier record verified 2026-10-18.",
        ],
      );
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

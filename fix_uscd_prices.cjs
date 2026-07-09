"use strict";
/**
 * USCD Price Fix + SKU Normalization Script
 * 1. Normalizes hyphenated masterCode in cabinets table (B-12 → B12)
 * 2. Updates wrong list prices in distributor_skus to match V6 P&A
 */
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const STYLE_TO_COL = {
  SW: "col0", SA: "col0", SD: "col0", SG: "col0", SU: "col0",
  SI: "col1", SN: "col1", SB: "col1", SH: "col1", SC: "col1", EW: "col1",
  OW: "col2", OC: "col2", OS: "col2", CW: "col2", CS: "col2", HD: "col2",
  OM: "col3", OT: "col3", HE: "col3", SEO: "col3",
};

const COL_KEYS = {
  col0: "col0_SW_SA_SD_SG_SU",
  col1: "col1_SI_SN_SB_SH_SC_EW",
  col2: "col2_OW_OC_OS_CW_CS_HD",
  col3: "col3_OM_OT_HE_SEO",
};

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Load V6 prices
  const v6 = JSON.parse(fs.readFileSync("/home/ubuntu/uscd_v6_prices.json", "utf8"));
  const v6Map = {};
  for (const row of v6) {
    v6Map[row.sku] = row;
  }

  // ─── Step 1: Normalize hyphenated masterCodes in cabinets table ───────────
  console.log("Step 1: Normalizing hyphenated masterCodes...");
  
  // Get all cabinets with hyphens in masterCode that belong to USCD (distributorId=1)
  const [hyphenatedCabinets] = await conn.execute(`
    SELECT DISTINCT c.id, c.masterCode
    FROM cabinets c
    JOIN distributor_skus ds ON ds.cabinetId = c.id
    WHERE ds.distributorId = 1
      AND c.masterCode LIKE '%-%'
  `);
  
  console.log(`Found ${hyphenatedCabinets.length} cabinets with hyphenated masterCodes`);
  
  let normalizedCount = 0;
  for (const cab of hyphenatedCabinets) {
    const newCode = cab.masterCode.replace(/-/g, "");
    // Only update if the new code exists in V6 (to avoid wrong normalizations)
    if (v6Map[newCode]) {
      await conn.execute(
        "UPDATE cabinets SET masterCode = ? WHERE id = ?",
        [newCode, cab.id]
      );
      normalizedCount++;
    }
  }
  console.log(`Normalized ${normalizedCount} masterCodes to match V6 format`);

  // ─── Step 2: Fix wrong prices ──────────────────────────────────────────────
  console.log("\nStep 2: Correcting wrong prices...");

  // Re-query with updated masterCodes
  const [dbRows] = await conn.execute(`
    SELECT 
      ds.id,
      c.masterCode AS master_code,
      ds.listPrice AS list_price,
      dst.styleCode AS door_style_code
    FROM distributor_skus ds
    JOIN cabinets c ON ds.cabinetId = c.id
    JOIN door_styles dst ON ds.styleId = dst.id
    WHERE ds.distributorId = 1
    ORDER BY c.masterCode, dst.styleCode
  `);

  let priceFixCount = 0;
  let skipped = 0;

  for (const row of dbRows) {
    const masterCode = row.master_code;
    const styleCode = row.door_style_code;
    const dbPrice = parseFloat(row.list_price);

    const v6Row = v6Map[masterCode];
    if (!v6Row) { skipped++; continue; }

    const colKey = STYLE_TO_COL[styleCode];
    if (!colKey) continue;

    const v6Price = v6Row[COL_KEYS[colKey]];
    if (v6Price === null || v6Price === undefined) continue;

    const diff = Math.abs(dbPrice - v6Price);
    if (diff > 0.5) {
      await conn.execute(
        "UPDATE distributor_skus SET listPrice = ? WHERE id = ?",
        [v6Price, row.id]
      );
      priceFixCount++;
    }
  }

  console.log(`Fixed ${priceFixCount} wrong prices`);
  console.log(`Skipped ${skipped} rows (masterCode not in V6)`);

  // ─── Step 3: Summary ──────────────────────────────────────────────────────
  console.log("\nDone! Summary:");
  console.log(`  Normalized masterCodes: ${normalizedCount}`);
  console.log(`  Price corrections applied: ${priceFixCount}`);

  await conn.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

"use strict";
/**
 * USCD Catalog Audit Script
 * Compares the V6 P&A pricing against the database.
 * Outputs:
 *   - wrong_prices.json: SKUs with incorrect list prices
 *   - missing_skus.json: SKUs in V6 but not in DB
 *   - extra_skus.json: SKUs in DB but not in V6 (potentially discontinued)
 *   - audit_summary.txt: human-readable summary
 */
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

// Load env
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Style code → column index in V6 data
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

  // Get all USCD distributor_skus (distributorId = 1 = US Cabinet Depot)
  // distributor_skus has: id, cabinetId, distributorId, styleId, platformSku, distributorSku, listPrice...
  // cabinets has: id, masterCode, ...
  // door_styles has: id, styleCode (the 2-3 letter code like SW, OW, etc.)
  const [dbRows] = await conn.execute(`
    SELECT 
      ds.id,
      c.masterCode AS master_code,
      ds.listPrice AS list_price,
      ds.isPublished AS is_published,
      ds.isAvailable AS is_available,
      dst.styleCode AS door_style_code
    FROM distributor_skus ds
    JOIN cabinets c ON ds.cabinetId = c.id
    JOIN door_styles dst ON ds.styleId = dst.id
    WHERE ds.distributorId = 1
    ORDER BY c.masterCode, dst.styleCode
  `);

  console.log(`DB rows: ${dbRows.length}`);

  const wrongPrices = [];
  const dbSkuSet = new Set();
  const dbStyleSkus = {}; // masterCode -> Set of style codes in DB

  for (const row of dbRows) {
    const masterCode = row.master_code;
    const styleCode = row.door_style_code; // e.g. SW, OW, OC, SU
    const dbPrice = parseFloat(row.list_price);

    dbSkuSet.add(`${masterCode}__${styleCode}`);
    if (!dbStyleSkus[masterCode]) dbStyleSkus[masterCode] = new Set();
    dbStyleSkus[masterCode].add(styleCode);

    // Look up V6 price
    const v6Row = v6Map[masterCode];
    if (!v6Row) continue; // will be caught in extra_skus

    const colKey = STYLE_TO_COL[styleCode];
    if (!colKey) continue; // unknown style code

    const v6Price = v6Row[COL_KEYS[colKey]];
    if (v6Price === null || v6Price === undefined) continue;

    const diff = Math.abs(dbPrice - v6Price);
    if (diff > 0.5) {
      wrongPrices.push({
        id: row.id,
        masterCode,
        styleCode,
        dbPrice,
        v6Price,
        diff: +(dbPrice - v6Price).toFixed(2),
      });
    }
  }

  // Find missing SKUs: in V6 but not in DB (for each style)
  const missingSKUs = [];
  for (const [masterCode, v6Row] of Object.entries(v6Map)) {
    // For each style that should have this SKU
    for (const [styleCode, colKey] of Object.entries(STYLE_TO_COL)) {
      const v6Price = v6Row[COL_KEYS[colKey]];
      if (!v6Price) continue; // not available in this style

      const key = `${masterCode}__${styleCode}`;
      if (!dbSkuSet.has(key)) {
        missingSKUs.push({ masterCode, styleCode, v6Price });
      }
    }
  }

  // Find extra SKUs: in DB but not in V6 (potentially discontinued)
  const extraSKUs = [];
  for (const row of dbRows) {
    const masterCode = row.master_code;
    if (!v6Map[masterCode]) {
      extraSKUs.push({
        id: row.id,
        masterCode,
        styleCode: row.door_style_code,
        listPrice: parseFloat(row.list_price),
      });
    }
  }

  // Deduplicate extra SKUs by masterCode
  const extraMasterCodes = [...new Set(extraSKUs.map(r => r.masterCode))];

  // Save results
  fs.writeFileSync("/home/ubuntu/wrong_prices.json", JSON.stringify(wrongPrices, null, 2));
  fs.writeFileSync("/home/ubuntu/missing_skus.json", JSON.stringify(missingSKUs, null, 2));
  fs.writeFileSync("/home/ubuntu/extra_skus.json", JSON.stringify(extraSKUs, null, 2));

  // Summary
  const summary = [
    `USCD V6 Catalog Audit Summary`,
    `==============================`,
    `V6 unique master SKUs: ${Object.keys(v6Map).length}`,
    `DB rows (USCD): ${dbRows.length}`,
    ``,
    `WRONG PRICES: ${wrongPrices.length} rows`,
    wrongPrices.slice(0, 20).map(r => `  ${r.masterCode} (${r.styleCode}): DB=$${r.dbPrice} V6=$${r.v6Price} diff=${r.diff}`).join("\n"),
    ``,
    `MISSING SKUs (in V6, not in DB): ${missingSKUs.length} rows`,
    missingSKUs.slice(0, 20).map(r => `  ${r.masterCode} (${r.styleCode}): $${r.v6Price}`).join("\n"),
    ``,
    `EXTRA/DISCONTINUED SKUs (in DB, not in V6): ${extraSKUs.length} rows across ${extraMasterCodes.length} master codes`,
    extraMasterCodes.slice(0, 30).map(c => `  ${c}`).join("\n"),
  ].join("\n");

  fs.writeFileSync("/home/ubuntu/audit_summary.txt", summary);
  console.log(summary);

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });

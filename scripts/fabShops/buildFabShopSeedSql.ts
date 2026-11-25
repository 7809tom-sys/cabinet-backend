// Builds docs/sql/0291 (TiDB SQL editor): the two fabrication shop tables plus
// one state's shop list, using the same row rules as the admin "Fabrication
// Shops" upload button (shared/fabricationShops.ts). Writes SQL to stdout and
// runs nothing.
//
//   npx tsx scripts/fabShops/buildFabShopSeedSql.ts <file.csv> <defaultState> "<source doc>" > docs/sql/0291_fabrication_shops_countertop_zip.tidb.sql
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { guessFabShopColumnMapping, mapFabShopRows, planFabShopImport } from "../../shared/fabricationShops";

const [file, defaultState, sourceDoc] = process.argv.slice(2);
if (!file || !defaultState || !sourceDoc) throw new Error("usage: <file.csv> <defaultState> <sourceDoc>");

const records = parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""), { relax_column_count: true }) as string[][];
const [header, ...body] = records;
const rows = mapFabShopRows(body, guessFabShopColumnMapping(header ?? []));
const plan = planFabShopImport(rows, [], { sourceDoc, defaultState });

const q = (value: string | number | null) =>
  value == null ? "NULL" : typeof value === "number" ? String(value) : `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\r?\n/g, " ")}'`;
const BATCH = 100;
const batches = Math.ceil(plan.toInsert.length / BATCH);
const withZip = plan.toInsert.filter((shop) => shop.zip).length;
const out: string[] = [
  `-- TiDB SQL editor version. Numbered 0291. Run after 0288. It does not depend on 0289 or 0290.`,
  `-- NOT RUN. Paste each numbered block on its own. Add-only and safe to run twice.`,
  `--`,
  `-- What it does: adds TWO new tables for countertop fabrication shops and loads the`,
  `-- "${sourceDoc}" list (${plan.toInsert.length} shops, state ${plan.byState.map((s) => s.state).join(", ")}).`,
  `--   fabrication_shops           one row per shop; matched to countertop quotes by ZIP`,
  `--   countertop_quote_fab_shops  the shops saved on each countertop quote, with a follow-up status`,
  `-- No existing table or row is changed. Until blocks 1 and 2 are run, the admin`,
  `-- Countertop Quotes tab still works and just shows "shop list not set up yet".`,
  `-- ${withZip} of ${plan.toInsert.length} shops have a ZIP (${plan.zipFromCity} of those borrow the ZIP of another shop in the`,
  `-- same city because their address has none); ${plan.noZip} have no ZIP and only match by state.`,
  `-- Left out by the builder: ${plan.skipped.length} rows (${plan.skipped.map((s) => s.reason).join(", ") || "none"}); ${plan.duplicates.length} in-file duplicates`,
  `-- (same name in the same ZIP or city, or the same website in the same city).`,
  `-- A shop already in fabrication_shops with the same name, state, ZIP and city is not inserted again.`,
  `-- Run order: 1, 2 (tables), 3-${batches + 2} (shops, in order), ${batches + 3} (read-only check).`,
  ``,
  `-- 1. Fabrication shops.`,
  `CREATE TABLE IF NOT EXISTS cabinet_dealz.fabrication_shops (`,
  `  id INT NOT NULL AUTO_INCREMENT,`,
  `  name VARCHAR(256) NOT NULL,`,
  `  state VARCHAR(2) NOT NULL,`,
  `  zip VARCHAR(10) NULL,`,
  `  zip3 VARCHAR(3) NULL,`,
  `  zipSource VARCHAR(16) NULL,`,
  `  city VARCHAR(128) NULL,`,
  `  address VARCHAR(512) NULL,`,
  `  region VARCHAR(128) NULL,`,
  `  phone VARCHAR(32) NULL,`,
  `  email VARCHAR(320) NULL,`,
  `  website VARCHAR(512) NULL,`,
  `  googleRating DECIMAL(2,1) NULL,`,
  `  reviewCount INT NULL,`,
  `  confidence VARCHAR(8) NULL,`,
  `  lat DECIMAL(9,6) NULL,`,
  `  lng DECIMAL(9,6) NULL,`,
  `  source TEXT NULL,`,
  `  sourceDoc VARCHAR(200) NULL,`,
  `  isActive TINYINT(1) NOT NULL DEFAULT 1,`,
  `  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,`,
  `  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,`,
  `  PRIMARY KEY (id),`,
  `  KEY fabrication_shops_state_idx (state),`,
  `  KEY fabrication_shops_zip3_idx (zip3)`,
  `);`,
  ``,
  `-- 2. Shops saved on each countertop quote.`,
  `CREATE TABLE IF NOT EXISTS cabinet_dealz.countertop_quote_fab_shops (`,
  `  id INT NOT NULL AUTO_INCREMENT,`,
  `  quoteId INT NOT NULL,`,
  `  fabShopId INT NOT NULL,`,
  `  distanceMiles DECIMAL(7,1) NULL,`,
  `  matchMethod VARCHAR(16) NOT NULL,`,
  `  status ENUM('matched','contacted','quoted','declined') NOT NULL DEFAULT 'matched',`,
  `  note VARCHAR(500) NULL,`,
  `  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,`,
  `  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,`,
  `  PRIMARY KEY (id),`,
  `  UNIQUE KEY countertop_quote_fab_shops_quote_shop_uq (quoteId, fabShopId),`,
  `  KEY countertop_quote_fab_shops_quote_idx (quoteId)`,
  `);`,
  ``,
];
const COLS = ["name", "state", "zip", "zip3", "zipSource", "city", "address", "region", "phone", "email", "website", "googleRating", "reviewCount", "confidence", "source", "sourceDoc"] as const;
for (let i = 0; i < plan.toInsert.length; i += BATCH) {
  const chunk = plan.toInsert.slice(i, i + BATCH);
  out.push(`-- ${i / BATCH + 3}. Shops ${i + 1}-${i + chunk.length}.`);
  out.push(`INSERT INTO cabinet_dealz.fabrication_shops (${COLS.join(", ")})`);
  out.push(`SELECT ${COLS.map((c) => `v.${c}`).join(", ")}`);
  out.push(`FROM (`);
  chunk.forEach((shop, j) => {
    const cols = COLS.map((c) => `${q(shop[c] as string | number | null)} AS ${c}`).join(", ");
    out.push(`  ${j === 0 ? "SELECT" : "UNION ALL SELECT"} ${cols}`);
  });
  out.push(`) v`);
  out.push(`WHERE NOT EXISTS (`);
  out.push(`  SELECT 1 FROM cabinet_dealz.fabrication_shops f`);
  out.push(`  WHERE f.name = v.name AND f.state = v.state AND f.zip <=> v.zip AND f.city <=> v.city`);
  out.push(`);`);
  out.push(``);
}
out.push(
  `-- ${batches + 3}. Read-only check. tablesPresent = 2 and ${defaultState.toUpperCase()} shops = ${plan.toInsert.length} on a fresh run.`,
  `SELECT`,
  `  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'cabinet_dealz' AND table_name IN ('fabrication_shops', 'countertop_quote_fab_shops')) AS tablesPresent,`,
  `  (SELECT COUNT(*) FROM cabinet_dealz.fabrication_shops WHERE state = ${q(defaultState.toUpperCase())}) AS shops,`,
  `  (SELECT COUNT(*) FROM cabinet_dealz.fabrication_shops WHERE state = ${q(defaultState.toUpperCase())} AND zip IS NOT NULL) AS shopsWithZip;`,
  ``,
);
process.stdout.write(out.join("\n"));

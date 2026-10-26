// Import the "Brand Attributes" tab of the 2026-10-03 master sheet into cabinet_brand_attributes.
// OWNER RULE: no pricing. The distributorBookPrice / priceSource columns are NOT imported and any
// "$" figures inside brandValue/note are redacted so no price text lands in the catalog.
import "dotenv/config";
import mysql from "mysql2/promise";
import ExcelJS from "exceljs";
const str = (v) => (v == null ? null : (typeof v === "object" && v.richText ? v.richText.map((r) => r.text).join("") : String(v)).trim() || null);
const noPrice = (s) => s == null ? null : s.replace(/\$\s?[\d,]+(\.\d+)?(\s*(\/|-|–)\s*\$?\s?[\d,]+(\.\d+)?)*(\s*\/\s*n\/a)*/g, "[price omitted]");
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile("/home/ubuntu/upload/cabinetdealz_master_UPDATED_2026-10-03.xlsx");
const ws = wb.getWorksheet("Brand Attributes");
const h = ws.getRow(1).values.slice(1).map(str); const ci = (n) => h.findIndex((x) => x && x.startsWith(n)) + 1;
const rows = [];
ws.eachRow((r, i) => { if (i === 1) return; const g = (n) => str(r.getCell(ci(n)).value);
  rows.push([g("brand"), g("appliesTo"), g("attribute"), noPrice(g("brandValue")) ?? "", g("masterValue"), g("source"), noPrice(g("note")), g("distributor"), g("nativeCode")]); });
const c = await mysql.createConnection(process.env.DATABASE_URL);
await c.query("DELETE FROM cabinet_brand_attributes");
await c.query("INSERT INTO cabinet_brand_attributes (brand, appliesTo, attribute, brandValue, masterValue, source, note, distributor, nativeCode) VALUES ?", [rows]);
const [[{ n }]] = await c.query("SELECT COUNT(*) n FROM cabinet_brand_attributes"); const [[{ p }]] = await c.query("SELECT COUNT(*) p FROM cabinet_brand_attributes WHERE brandValue LIKE '%$%' OR note LIKE '%$%'");
console.log("imported", n, "rows; rows still containing $:", p); await c.end();

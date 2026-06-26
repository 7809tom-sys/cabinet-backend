import mysql from "mysql2/promise";
import { baseSubGroup } from "../client/src/lib/cabinetGraphics.ts";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query("SELECT masterCode, category, subCategory, description, numberOfDoors, numberOfDrawers, width, height, isCornerCabinet FROM cabinets WHERE placementType='ada base'");
await conn.end();
const g = {};
for (const r of rows) { const sg = baseSubGroup({...r, isCornerCabinet: !!r.isCornerCabinet}); (g[sg] ||= []).push(r.masterCode); }
for (const k of Object.keys(g)) console.log(`${k} (${g[k].length}): ${g[k].join(", ")}`);

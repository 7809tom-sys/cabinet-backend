import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(
  `SELECT c.id, c.masterCode, c.description, c.category, c.subCategory, c.placementType, c.width, c.height
   FROM cabinets c
   WHERE c.isActive=1
     AND EXISTS (SELECT 1 FROM distributor_skus s WHERE s.cabinetId=c.id AND s.isAvailable=1 AND s.isPublished=1)
     AND (LOWER(c.category)='accessory'
          OR LOWER(c.placementType) LIKE '%accessory%'
          OR LOWER(c.placementType) LIKE '%trim%')
   ORDER BY c.subCategory, c.masterCode`
);
console.log("ACCESSORY/TRIM (available) COUNT:", rows.length);
console.log("\nmasterCode | category | placementType | subCategory");
for (const r of rows) {
  console.log([r.masterCode, r.category, r.placementType, r.subCategory].join(" | "));
}

// Distinct subcategories for grouping
const [subs] = await conn.query(
  `SELECT c.subCategory, COUNT(*) n
   FROM cabinets c
   WHERE c.isActive=1
     AND EXISTS (SELECT 1 FROM distributor_skus s WHERE s.cabinetId=c.id AND s.isAvailable=1 AND s.isPublished=1)
     AND LOWER(c.category)='accessory'
   GROUP BY c.subCategory ORDER BY n DESC`
);
console.log("\nSUBCATEGORIES (category=Accessory):");
for (const s of subs) console.log(`  ${s.subCategory || "(null)"} — ${s.n}`);

await conn.end();

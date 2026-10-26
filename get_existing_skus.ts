import { getDb } from "./server/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }

  // Get all existing Skyline SKUs with their style codes and masterCabinetId
  const rows = await db.execute(sql`
    SELECT 
      ds.platformSku,
      ds.styleId,
      dst.styleCode,
      ds.masterCabinetId,
      c.masterCode,
      ds.isPublished,
      ds.homeownerPrice
    FROM distributor_skus ds
    JOIN door_styles dst ON dst.id = ds.styleId
    LEFT JOIN cabinets c ON c.id = ds.masterCabinetId
    WHERE ds.distributorId = 3
  `);

  // Get all door styles for Skyline
  const styles = await db.execute(sql`
    SELECT id, styleCode, ourName FROM door_styles WHERE distributorId = 3 ORDER BY styleCode
  `);

  // Get all cabinets linked to Skyline
  const cabs = await db.execute(sql`
    SELECT DISTINCT c.id, c.masterCode 
    FROM cabinets c
    WHERE EXISTS (SELECT 1 FROM distributor_skus ds WHERE ds.masterCabinetId = c.id AND ds.distributorId = 3)
    ORDER BY c.masterCode
  `);

  const data = {
    existingSkus: (rows[0] as any[]).map(r => ({
      platformSku: r.platformSku,
      styleCode: r.styleCode,
      styleId: r.styleId,
      masterCabinetId: r.masterCabinetId,
      masterCode: r.masterCode,
      isPublished: r.isPublished,
      homeownerPrice: r.homeownerPrice
    })),
    styles: (styles[0] as any[]).map(r => ({ id: r.id, styleCode: r.styleCode, ourName: r.ourName })),
    cabinets: (cabs[0] as any[]).map(r => ({ id: r.id, masterCode: r.masterCode }))
  };

  fs.writeFileSync('/home/ubuntu/skyline_existing.json', JSON.stringify(data, null, 2));
  console.log(`Existing SKUs: ${data.existingSkus.length}`);
  console.log(`Door styles: ${data.styles.length}`);
  console.log(`Linked cabinets: ${data.cabinets.length}`);
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

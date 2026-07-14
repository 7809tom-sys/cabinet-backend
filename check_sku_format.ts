import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }

  // Show actual platformSku values for BBC36 to understand the format
  const rows = await db.execute(sql`
    SELECT platformSku, listPrice, yourCost FROM distributor_skus 
    WHERE distributorId = 3 AND platformSku LIKE 'BBC36%'
    LIMIT 15
  `);
  console.log("BBC36 SKUs in DB:");
  for (const r of (rows[0] as any[])) {
    console.log(`  "${r.platformSku}": list=${r.listPrice}, cost=${r.yourCost}`);
  }

  // Also check DCW2430
  const rows2 = await db.execute(sql`
    SELECT platformSku, listPrice, yourCost FROM distributor_skus 
    WHERE distributorId = 3 AND platformSku LIKE 'DCW2430%'
    LIMIT 5
  `);
  console.log("\nDCW2430 SKUs in DB:");
  for (const r of (rows2[0] as any[])) {
    console.log(`  "${r.platformSku}": list=${r.listPrice}, cost=${r.yourCost}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

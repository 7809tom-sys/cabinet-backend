import { getDb } from "../server/db.ts";
import { cabinets } from "../drizzle/schema.ts";
import { like, or, sql } from "drizzle-orm";

const db = await getDb();
if (!db) { console.log('No DB'); process.exit(1); }

// Find fridge/refrigerator related cabinets
const fridgeCabs = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description, width: cabinets.width, height: cabinets.height, depth: cabinets.depth })
  .from(cabinets)
  .where(or(
    sql`LOWER(${cabinets.description}) LIKE '%refrigerator%'`,
    sql`LOWER(${cabinets.description}) LIKE '%fridge%'`,
    sql`LOWER(${cabinets.description}) LIKE '%end panel%'`,
    sql`LOWER(${cabinets.description}) LIKE '%side panel%'`,
    sql`LOWER(${cabinets.description}) LIKE '%bridge%'`,
    sql`LOWER(${cabinets.masterCode}) LIKE '%fridge%'`,
    sql`LOWER(${cabinets.masterCode}) LIKE '%repv%'`,
    sql`LOWER(${cabinets.masterCode}) LIKE '%wsv%'`,
  ))
  .limit(30);
console.log("Fridge/panel related cabinets:", JSON.stringify(fridgeCabs, null, 2));

// Find wall cabinets with depth info
const wallCabs = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description, width: cabinets.width, height: cabinets.height, depth: cabinets.depth })
  .from(cabinets)
  .where(or(
    like(cabinets.masterCode, 'W%'),
    sql`LOWER(${cabinets.description}) LIKE '%wall%'`,
  ))
  .limit(20);
console.log("\nWall cabinets sample:", JSON.stringify(wallCabs, null, 2));

// Find tall cabinets
const tallCabs = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description, width: cabinets.width, height: cabinets.height, depth: cabinets.depth })
  .from(cabinets)
  .where(or(
    like(cabinets.masterCode, 'U%'),
    sql`LOWER(${cabinets.description}) LIKE '%pantry%'`,
    sql`LOWER(${cabinets.description}) LIKE '%tall%'`,
  ))
  .limit(20);
console.log("\nTall/pantry cabinets sample:", JSON.stringify(tallCabs, null, 2));

process.exit(0);

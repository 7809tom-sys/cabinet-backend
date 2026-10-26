import { getDb } from "../server/db.ts";
import { cabinets } from "../drizzle/schema.ts";
import { sql, and, eq } from "drizzle-orm";
import { distributorSkus } from "../drizzle/schema.ts";

const db = await getDb();
if (!db) { console.log('No DB'); process.exit(1); }

// Find ALL distinct masterCode patterns for wall cabinets (W prefix variants)
const wallPatterns = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description, width: cabinets.width, height: cabinets.height, depth: cabinets.depth })
  .from(cabinets)
  .where(sql`${cabinets.masterCode} REGEXP '^[A-Z0-9-]*W[0-9]'`)
  .limit(40);
console.log("Wall cabinet patterns (W prefix):", JSON.stringify(wallPatterns.map(r => r.masterCode), null, 2));

// Find deep (24" depth) wall cabinets
const deepWall = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description, width: cabinets.width, height: cabinets.height, depth: cabinets.depth })
  .from(cabinets)
  .where(sql`${cabinets.depth} = 24 AND LOWER(${cabinets.description}) LIKE '%wall%'`)
  .limit(20);
console.log("\nDeep (24\") wall cabinets:", JSON.stringify(deepWall, null, 2));

// Find bridge/short wall cabinets (height <= 18)
const bridgeWall = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description, width: cabinets.width, height: cabinets.height, depth: cabinets.depth })
  .from(cabinets)
  .where(sql`CAST(${cabinets.height} AS DECIMAL) <= 18 AND LOWER(${cabinets.description}) LIKE '%bridge%'`)
  .limit(20);
console.log("\nBridge wall cabinets (height<=18):", JSON.stringify(bridgeWall, null, 2));

// Find end panels (REPV, TDEP, etc.)
const endPanels = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description, width: cabinets.width, height: cabinets.height, depth: cabinets.depth })
  .from(cabinets)
  .where(sql`LOWER(${cabinets.description}) LIKE '%end panel%' OR LOWER(${cabinets.description}) LIKE '%refrigerator%'`)
  .limit(20);
console.log("\nEnd panels / refrigerator cabinets:", JSON.stringify(endPanels, null, 2));

// Find smooth skin panels (USV, WSV)
const skinPanels = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description, width: cabinets.width, height: cabinets.height, depth: cabinets.depth })
  .from(cabinets)
  .where(sql`LOWER(${cabinets.description}) LIKE '%skin%' OR LOWER(${cabinets.description}) LIKE '%veneer%'`)
  .limit(20);
console.log("\nSkin/veneer panels:", JSON.stringify(skinPanels, null, 2));

process.exit(0);

import { getDb } from "../server/db.ts";
import { cabinets } from "../drizzle/schema.ts";
import { sql } from "drizzle-orm";

const db = await getDb();
if (!db) { console.log('No DB'); process.exit(1); }

// Count all cabinets
const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(cabinets);
console.log("Total cabinets:", countResult.count);

// Get a sample of master codes
const sample = await db
  .select({ masterCode: cabinets.masterCode, description: cabinets.description })
  .from(cabinets)
  .limit(20);
console.log("Sample master codes:", JSON.stringify(sample, null, 2));

process.exit(0);

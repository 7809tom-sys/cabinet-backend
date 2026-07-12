import { getDb } from "../server/db.ts";
import { cabinets } from "../drizzle/schema.ts";
import { like, or } from "drizzle-orm";

const db = await getDb();
if (!db) { console.log('No DB'); process.exit(1); }
const rows = await db
  .select({
    id: cabinets.id,
    masterCode: cabinets.masterCode,
    description: cabinets.description,
    width: cabinets.width,
    height: cabinets.height,
    depth: cabinets.depth,
  })
  .from(cabinets)
  .where(
    or(
      like(cabinets.masterCode, "REPV-%"),
      like(cabinets.masterCode, "WSV-%"),
      like(cabinets.masterCode, "W-%-24"),
      like(cabinets.masterCode, "FRIDGE-%"),
    )
  )
  .limit(30);

console.log("Fridge/panel cabinet rows:", JSON.stringify(rows, null, 2));

// Also check what wall cabinet codes look like
const wallSample = await (db as NonNullable<typeof db>)
  .select({
    id: cabinets.id,
    masterCode: cabinets.masterCode,
    description: cabinets.description,
    width: cabinets.width,
    height: cabinets.height,
    depth: cabinets.depth,
  })
  .from(cabinets)
  .where(like(cabinets.masterCode, "W-%"))
  .limit(20);

console.log("\nWall cabinet sample:", JSON.stringify(wallSample, null, 2));

process.exit(0);

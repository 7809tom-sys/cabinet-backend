import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }
  
  try {
    const r = await db.execute(sql`DESCRIBE distributor_skus`);
    console.log("distributor_skus columns:", JSON.stringify((r[0] as any[]).map((c: any) => c.Field), null, 2));
  } catch(e: any) { console.error("distributor_skus error:", e.message); }
  
  try {
    const r = await db.execute(sql`DESCRIBE door_styles`);
    console.log("door_styles columns:", JSON.stringify((r[0] as any[]).map((c: any) => c.Field), null, 2));
  } catch(e: any) { console.error("door_styles error:", e.message); }
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

import { describe, it } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";
describe("midnight glass lookup", () => {
  it("finds MG / Midnight Glass / Nocturne Glass", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(doorStyles).where(
      sql`(${doorStyles.styleCode} = 'MG' OR ${doorStyles.ourName} LIKE '%Nocturne%' OR ${doorStyles.distributorName} LIKE '%Midnight Glass%' OR ${doorStyles.ourName} LIKE '%Glass%' OR ${doorStyles.distributorName} LIKE '%Glass%')`
    );
    console.log("ROWCOUNT:", rows.length);
    for (const r of rows) console.log("ROW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, distributorId: r.distributorId, verified: r.doorSampleVerified, img: r.doorSampleImageUrl }));
  }, 30000);
});

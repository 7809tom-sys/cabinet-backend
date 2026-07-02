import { describe, it } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";
describe("high gloss gray lookup", () => {
  it("finds HG / High Glossy Gray / Glace Cinder", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(doorStyles).where(
      sql`(${doorStyles.styleCode} = 'HG' OR ${doorStyles.ourName} LIKE '%Glace%' OR ${doorStyles.distributorName} LIKE '%High Glossy Gray%' OR ${doorStyles.distributorName} LIKE '%Glossy%' OR ${doorStyles.ourName} LIKE '%Cinder%')`
    );
    console.log("ROWCOUNT:", rows.length);
    for (const r of rows) console.log("ROW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, distributorId: r.distributorId, color: r.color, verified: r.doorSampleVerified, img: r.doorSampleImageUrl }));
  }, 30000);
});

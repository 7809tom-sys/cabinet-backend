import { describe, it } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";
describe("matte ivory lookup", () => {
  it("finds MI / Matte Ivory / Vellum Crema", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(doorStyles).where(
      sql`(${doorStyles.styleCode} = 'MI' OR ${doorStyles.ourName} LIKE '%Vellum%' OR ${doorStyles.distributorName} LIKE '%Matte Ivory%' OR ${doorStyles.distributorName} LIKE '%Matt Ivory%' OR ${doorStyles.ourName} LIKE '%Crema%' OR ${doorStyles.ourName} LIKE '%Ivory%')`
    );
    console.log("ROWCOUNT:", rows.length);
    for (const r of rows) console.log("ROW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, distributorId: r.distributorId, verified: r.doorSampleVerified, img: r.doorSampleImageUrl }));
  }, 30000);
});

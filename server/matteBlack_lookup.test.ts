import { describe, it } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";
describe("matte black lookup", () => {
  it("finds MB / Matte Black / Vellum Noir", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(doorStyles).where(
      sql`(${doorStyles.styleCode} = 'MB' OR ${doorStyles.ourName} LIKE '%Noir%' OR ${doorStyles.distributorName} LIKE '%Matte Black%' OR ${doorStyles.distributorName} LIKE '%Matt Black%')`
    );
    console.log("ROWCOUNT:", rows.length);
    for (const r of rows) console.log("ROW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, distributorId: r.distributorId, verified: r.doorSampleVerified, img: r.doorSampleImageUrl }));
  }, 30000);
});

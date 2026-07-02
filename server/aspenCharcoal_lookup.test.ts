import { describe, it } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";
describe("aspen charcoal lookup", () => {
  it("finds AC / Aspen Charcoal / Carbon Frost", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(doorStyles).where(
      sql`(${doorStyles.styleCode} = 'AC' OR ${doorStyles.ourName} LIKE '%Carbon Frost%' OR ${doorStyles.distributorName} LIKE '%Aspen Charcoal%')`
    );
    console.log("ROWCOUNT:", rows.length);
    for (const r of rows) console.log("ROW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, doorPanelType: r.doorPanelType, distributorId: r.distributorId, color: r.color, verified: r.doorSampleVerified, img: r.doorSampleImageUrl }));
  }, 30000);
});

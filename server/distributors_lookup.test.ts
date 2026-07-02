import { describe, it } from "vitest";
import { getDb } from "./db";
import { distributors, doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";
describe("distributors + aspen white lookup", () => {
  it("lists distributors and all Aspen White rows", async () => {
    const db = await getDb();
    if (!db) return;
    const dists = await db.select().from(distributors);
    console.log("DISTRIBUTORS:", dists.length);
    for (const d of dists) console.log("DIST:" + JSON.stringify({ id: d.id, name: d.name }));
    const rows = await db.select().from(doorStyles).where(
      sql`(${doorStyles.styleCode} = 'AW' OR ${doorStyles.distributorName} LIKE '%Aspen White%' OR ${doorStyles.ourName} LIKE '%Lumina%')`
    );
    console.log("AWROWS:", rows.length);
    for (const r of rows) console.log("AW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, distributorId: r.distributorId, color: r.color, verified: r.doorSampleVerified }));
  }, 30000);
});

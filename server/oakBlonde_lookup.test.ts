import { describe, it } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";

describe("oak blonde lookup", () => {
  it("finds OB / Oak Blonde / Solis Oak", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(doorStyles).where(
      sql`(${doorStyles.styleCode} = 'OB' OR ${doorStyles.ourName} LIKE '%Oak Blonde%' OR ${doorStyles.distributorName} LIKE '%Solis%' OR ${doorStyles.distributorName} LIKE '%Oak Blonde%' OR ${doorStyles.ourName} LIKE '%Solis%' OR ${doorStyles.ourName} LIKE '%Blonde%')`
    );
    console.log("ROWCOUNT:", rows.length);
    for (const r of rows) {
      console.log("ROW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, distributorId: r.distributorId, verified: r.doorSampleVerified, img: r.doorSampleImageUrl }));
    }
  }, 30000);
});

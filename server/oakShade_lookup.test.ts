import { describe, it } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";

describe("oak shade lookup", () => {
  it("finds OS / Oak Shade / Umbra Oak", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(doorStyles).where(
      sql`(${doorStyles.styleCode} = 'OS' OR ${doorStyles.ourName} LIKE '%Oak Shade%' OR ${doorStyles.distributorName} LIKE '%Umbra%' OR ${doorStyles.distributorName} LIKE '%Oak Shade%' OR ${doorStyles.ourName} LIKE '%Umbra%')`
    );
    console.log("ROWCOUNT:", rows.length);
    for (const r of rows) {
      console.log("ROW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, distributorId: r.distributorId, builder: r.isBuilderGrade, hw: r.hardware, verified: r.doorSampleVerified, img: r.doorSampleImageUrl }));
    }
  }, 30000);
});

import { describe, it } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { sql } from "drizzle-orm";
describe("skyline review", () => {
  it("lists all Skyline (distributorId=3) door styles by category", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(doorStyles).where(sql`${doorStyles.distributorId} = 3`).orderBy(doorStyles.doorStyle, doorStyles.styleCode);
    console.log("ROWCOUNT:", rows.length);
    for (const r of rows) console.log("ROW:" + JSON.stringify({ id: r.id, code: r.styleCode, ourName: r.ourName, distributorName: r.distributorName, doorStyle: r.doorStyle, panel: r.doorPanelType, verified: r.doorSampleVerified }));
  }, 30000);
});

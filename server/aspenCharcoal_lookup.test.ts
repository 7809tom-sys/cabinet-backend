import { describe, expect, it } from "vitest";
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
    const carbonFrost = rows.find((row) => row.id === 390012);
    expect(carbonFrost).toMatchObject({
      styleCode: "AC",
      ourName: "Aspen Charcoal",
      doorStyle: "Raised Panel",
      doorPanelType: "Raised Panel",
      panelConstruction: "raised",
      bevelWidth: "0.50",
      bevelDepth: "0.18",
      insideEdgeProfile: "beveled ogee",
      drawerFrontType: "five-piece-raised",
      grainDirection: "vertical-stiles-horizontal-rails",
      finishSheen: "satin",
    });
    expect(carbonFrost?.doorSampleImageUrl).toContain("aspen-charcoal-ac-door-reference");
  }, 30000);
});

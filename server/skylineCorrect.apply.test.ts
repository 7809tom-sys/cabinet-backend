// Apply the 14 owner-approved Skyline-catalog corrections. Idempotent:
// re-running produces the same final state. Runs under vitest for DB env.
//
// Corrections (source: Skyline / Spring Forest 20-20 catalog cross-check):
//  - WRC-*  : "Refrigerator Wall Cabinet" was a MISLABEL; WRC = Wine Rack Cabinet.
//  - U-18-* : tall pantry is a stacked 2-door (upper+lower), not single door.
//  - U-24-*, U-30-* : tall pantry is a stacked 4-door (2 upper + 2 lower), not 2-door.
//  - ERB-*  : Easy Reach base includes a Lazy Susan (add the detail).
import { describe, it, expect } from "vitest";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

const SRC = "Skyline Catalog Correction";

// masterCode -> { description, numberOfDoors }
const FIX: Record<string, { description: string; numberOfDoors: number }> = {
  "WRC-24-30": { description: '24" Wall Wine Rack Cabinet', numberOfDoors: 0 },
  "WRC-30-15": { description: '30" Wall Wine Rack Cabinet', numberOfDoors: 0 },
  "WRC-30-18": { description: '30" Wall Wine Rack Cabinet', numberOfDoors: 0 },

  "U-18-84-24": { description: '18" x 84" Tall Utility/Pantry Cabinet - 2 Doors (stacked upper & lower) with 1 Fixed Shelf and 4 Adjustable Shelves', numberOfDoors: 2 },
  "U-18-90-24": { description: '18" x 90" Tall Utility/Pantry Cabinet - 2 Doors (stacked upper & lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 2 },
  "U-18-96-24": { description: '18" x 96" Tall Utility/Pantry Cabinet - 2 Doors (stacked upper & lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 2 },

  "U-24-84-24": { description: '24" x 84" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 4 Adjustable Shelves', numberOfDoors: 4 },
  "U-24-90-24": { description: '24" x 90" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 4 },
  "U-24-96-24": { description: '24" x 96" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 4 },
  "U-30-84-24": { description: '30" x 84" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 4 Adjustable Shelves', numberOfDoors: 4 },
  "U-30-90-24": { description: '30" x 90" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 4 },
  "U-30-96-24": { description: '30" x 96" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 4 },

  "ERB-33": { description: '33" Base Easy Reach Corner Cabinet w/Lazy Susan', numberOfDoors: 1 },
  "ERB-36": { description: '36" Base Easy Reach Corner Cabinet w/Lazy Susan', numberOfDoors: 1 },
};

function esc(s: string) {
  return s.replace(/'/g, "''");
}

describe("apply skyline conflict corrections", () => {
  it("updates the 14 rows and verifies", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    for (const [code, fix] of Object.entries(FIX)) {
      await db.execute(
        sql.raw(
          `UPDATE cabinets
             SET description = '${esc(fix.description)}',
                 numberOfDoors = ${fix.numberOfDoors},
                 descriptionSource = '${esc(SRC)}'
           WHERE masterCode = '${esc(code)}'`
        )
      );
    }

    const codes = Object.keys(FIX).map((c) => `'${esc(c)}'`).join(",");
    const res = (await db.execute(
      sql.raw(
        `SELECT masterCode, description, numberOfDoors, descriptionSource
           FROM cabinets WHERE masterCode IN (${codes}) ORDER BY masterCode`
      )
    )) as any;
    const rows = res[0] as any[];
    expect(rows.length).toBe(14);

    for (const r of rows) {
      const want = FIX[r.masterCode];
      expect(r.description).toBe(want.description);
      expect(Number(r.numberOfDoors)).toBe(want.numberOfDoors);
      expect(r.descriptionSource).toBe(SRC);
      // eslint-disable-next-line no-console
      console.log(`OK ${r.masterCode} | doors=${r.numberOfDoors} | ${r.description}`);
    }

    // sanity: no WRC row still says "Refrigerator"
    const stray = rows.filter((r) => /refrigerator/i.test(r.description));
    expect(stray.length).toBe(0);
  }, 60000);
});

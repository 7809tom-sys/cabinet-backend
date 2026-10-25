// Verify the owner-approved Skyline-catalog identity corrections without
// mutating production data. The record updates are applied through the
// approved database migration action, then guarded here against regression.
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

// Active masterCode -> approved identity fields.  The WRC and ERB records
// are the current Design Tool/catalog masters, not their inactive legacy
// hyphenated duplicates.
const FIX: Record<string, { description: string; numberOfDoors: number; subCategory?: string }> = {
  WRC2430: { description: '24" Wine Rack Wall Cabinet (Fully Assembled)', numberOfDoors: 0, subCategory: "Wine Rack / Open Display" },
  WRC3015: { description: '30" Wine Rack Wall Cabinet (Fully Assembled)', numberOfDoors: 0, subCategory: "Wine Rack / Open Display" },
  WRC3018: { description: '30" Wine Rack Wall Cabinet (Fully Assembled)', numberOfDoors: 0, subCategory: "Wine Rack / Open Display" },

  "U-18-84-24": { description: '18" x 84" Tall Utility/Pantry Cabinet - 2 Doors (stacked upper & lower) with 1 Fixed Shelf and 4 Adjustable Shelves', numberOfDoors: 2 },
  "U-18-90-24": { description: '18" x 90" Tall Utility/Pantry Cabinet - 2 Doors (stacked upper & lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 2 },
  "U-18-96-24": { description: '18" x 96" Tall Utility/Pantry Cabinet - 2 Doors (stacked upper & lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 2 },

  "U-24-84-24": { description: '24" x 84" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 4 Adjustable Shelves', numberOfDoors: 4 },
  "U-24-90-24": { description: '24" x 90" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 4 },
  "U-24-96-24": { description: '24" x 96" Tall Utility/Pantry Cabinet - 4 Doors (2 upper & 2 lower) with 1 Fixed Shelf and 5 Adjustable Shelves', numberOfDoors: 4 },
  U308424: { description: '30" x 84" Tall Utility / Pantry Cabinet', numberOfDoors: 4 },
  U309024: { description: '30" x 90" Tall Utility / Pantry Cabinet', numberOfDoors: 4 },
  U309624: { description: '30" x 96" Tall Utility / Pantry Cabinet', numberOfDoors: 4 },

  ERB33: { description: '33" Easy Reach Base Cabinet with Lazy Susan', numberOfDoors: 1, subCategory: "Lazy Susan / Easy Reach" },
  ERB36: { description: '36" Easy Reach Base Cabinet with Lazy Susan', numberOfDoors: 1, subCategory: "Lazy Susan / Easy Reach" },
};

function dimensionsEncodedByMasterCode(masterCode: string): { width: number; height: number } | null {
  const wallOrWineRack = /^(?:W|WRC)(\d{2})(\d{2})$/.exec(masterCode);
  if (wallOrWineRack) return { width: Number(wallOrWineRack[1]), height: Number(wallOrWineRack[2]) };

  const pantry = /^U-(\d{2})-(\d{2})-\d{2}$/.exec(masterCode);
  if (pantry) return { width: Number(pantry[1]), height: Number(pantry[2]) };

  const compactPantry = /^U(\d{2})(\d{2})\d{2}$/.exec(masterCode);
  if (compactPantry) return { width: Number(compactPantry[1]), height: Number(compactPantry[2]) };

  return null;
}

describe("approved Skyline identity corrections", () => {
  it("keeps the active wine-rack, pantry, and easy-reach records source-aligned without changing commercial data", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    const codes = Object.keys(FIX).map((code) => `'${code}'`).join(",");
    const res = (await db.execute(
      sql.raw(
        `SELECT masterCode, description, numberOfDoors, subCategory, descriptionSource, width, height,
                isActive, isCornerCabinet, corner_type, cabinet_square, graphicType
           FROM cabinets WHERE masterCode IN (${codes}) ORDER BY masterCode`
      )
    )) as any;
    const rows = res[0] as any[];
    expect(rows.length).toBe(14);

    for (const r of rows) {
      const want = FIX[r.masterCode];
      expect(r.description).toBe(want.description);
      expect(Number(r.numberOfDoors)).toBe(want.numberOfDoors);
      expect(Number(r.isActive)).toBe(1);
      if (want.subCategory) {
        expect(r.subCategory).toBe(want.subCategory);
        expect(r.descriptionSource).toBe(SRC);
      }

      const encodedDimensions = dimensionsEncodedByMasterCode(r.masterCode);
      if (encodedDimensions) {
        expect(Number(r.width)).toBe(encodedDimensions.width);
        expect(Number(r.height)).toBe(encodedDimensions.height);
      }
    }

    const wineRacks = rows.filter((row) => row.masterCode.startsWith("WRC"));
    expect(wineRacks).toHaveLength(3);
    const stray = wineRacks.filter((row) => /refrigerator/i.test(`${row.description} ${row.subCategory}`));
    expect(stray.length).toBe(0);

    for (const masterCode of ["ERB33", "ERB36"]) {
      const row = rows.find((candidate) => candidate.masterCode === masterCode);
      expect(row).toMatchObject({ isCornerCabinet: 1, graphicType: "base_easy_reach" });
    }
  }, 60000);
});

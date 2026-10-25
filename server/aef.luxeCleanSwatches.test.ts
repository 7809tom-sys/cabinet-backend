import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { distributors, doorStyles } from "../drizzle/schema";
import { getDb } from "./db";

const CLEAN_SWATCHES = {
  LSA: { finish: "Luxe Classic", imageUrl: "/manus-storage/aef-luxe-lsa-clean-swatch_4154dedb.png" },
  LSC: { finish: "Luxe Classic", imageUrl: "/manus-storage/aef-luxe-lsc-clean-swatch_c92285a6.png" },
  LSN: { finish: "Luxe Classic", imageUrl: "/manus-storage/aef-luxe-lsn-clean-swatch_00031ec3.png" },
  LSP: { finish: "Luxe Select", imageUrl: "/manus-storage/aef-luxe-lsp-clean-swatch_7c5b26bf.png" },
  LSR: { finish: "Luxe Select", imageUrl: "/manus-storage/aef-luxe-lsr-clean-swatch_c47e44e1.png" },
} as const;

const CODES = Object.keys(CLEAN_SWATCHES) as Array<keyof typeof CLEAN_SWATCHES>;

describe("AEF Luxe clean door swatches", () => {
  it("maps every supplied Luxe color or woodgrain to its matching clean source door sample", async () => {
    const db = await getDb();
    if (!db) return;

    const [aef] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, "AEF")).limit(1);
    expect(aef).toBeDefined();

    const rows = await db
      .select({
        styleCode: doorStyles.styleCode,
        finish: doorStyles.finish,
        active: doorStyles.isActive,
        verified: doorStyles.doorSampleVerified,
        door: doorStyles.doorSampleImageUrl,
        drawer: doorStyles.drawerSampleImageUrl,
        thumbnail: doorStyles.thumbnailImageUrl,
      })
      .from(doorStyles)
      .where(and(eq(doorStyles.distributorId, aef!.id), inArray(doorStyles.styleCode, CODES)));

    expect(rows).toHaveLength(CODES.length);
    expect(rows.map((row) => row.styleCode).sort()).toEqual([...CODES].sort());
    for (const row of rows) {
      const expected = CLEAN_SWATCHES[row.styleCode as keyof typeof CLEAN_SWATCHES];
      expect(row).toMatchObject({
        finish: expected.finish,
        active: true,
        verified: true,
        door: expected.imageUrl,
        drawer: expected.imageUrl,
        thumbnail: expected.imageUrl,
      });
    }
  });
});

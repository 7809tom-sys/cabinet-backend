import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { distributors, doorStyles } from "../drizzle/schema";
import { getDb } from "./db";

const CLEAN_SWATCHES = {
  ZSA: "/manus-storage/aef-zenit-zsa-clean-swatch_1d3dfdf1.png",
  ZSB: "/manus-storage/aef-zenit-zsb-clean-swatch_b59c0c68.png",
  ZSC: "/manus-storage/aef-zenit-zsc-clean-swatch_3c75174f.png",
  ZSI: "/manus-storage/aef-zenit-zsi-clean-swatch_e58dc58e.png",
  ZSK: "/manus-storage/aef-zenit-zsk-clean-swatch_5acee2dc.png",
  ZSL: "/manus-storage/aef-zenit-zsl-clean-swatch_4ae2f56c.png",
  ZSM: "/manus-storage/aef-zenit-zsm-clean-swatch_1f6daaeb.png",
  ZSN: "/manus-storage/aef-zenit-zsn-clean-swatch_77c31db4.png",
  ZSO: "/manus-storage/aef-zenit-zso-clean-swatch_fffeba8e.png",
  ZSP: "/manus-storage/aef-zenit-zsp-clean-swatch_86a61609.png",
  ZSU: "/manus-storage/aef-zenit-zsu-clean-swatch_a7f28bb7.png",
  ZSV: "/manus-storage/aef-zenit-zsv-clean-swatch_776313e5.png",
  ZSW: "/manus-storage/aef-zenit-zsw-clean-swatch_d505cf05.png",
} as const;

const CODES = Object.keys(CLEAN_SWATCHES) as Array<keyof typeof CLEAN_SWATCHES>;

describe("AEF Zenit Classic clean door swatches", () => {
  it("maps every supplied Zenit color to its matching clean swatch without changing any other AEF finish", async () => {
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
        finish: "Zenit Classic",
        active: true,
        verified: true,
        door: expected,
        drawer: expected,
        thumbnail: expected,
      });
    }
  });
});

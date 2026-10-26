import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { PELICAN_QUARTZ_MATERIAL_MAPS, pelicanQuartzMaterialMap } from "../../client/src/lib/pelicanQuartzMaterialMaps";

describe("Pelican Quartz source-qualified material map catalog update", () => {
  it("assigns the exact approved official slab crop to every current priced quartz variant without altering catalog identity", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select({
      id: pelicanProducts.id,
      code: pelicanProducts.pelicanCode,
      category: pelicanProducts.category,
      active: pelicanProducts.isActive,
      sellPrice: pelicanProducts.listPrice,
      materialImageUrl: pelicanProducts.materialImageUrl,
    }).from(pelicanProducts).where(eq(pelicanProducts.category, "Quartz Slabs (Countertops)"));

    const officialCodes = PELICAN_QUARTZ_MATERIAL_MAPS.flatMap((map) => map.codes);
    expect(officialCodes).toHaveLength(30);
    const byCode = new Map(rows.map((row) => [row.code.toLowerCase().trim(), row]));

    for (const code of officialCodes) {
      const row = byCode.get(code.toLowerCase());
      const map = pelicanQuartzMaterialMap(code);
      expect(row, code).toBeDefined();
      expect(row?.category, code).toBe("Quartz Slabs (Countertops)");
      expect(row?.active, code).toBe(true);
      expect(Number(row?.sellPrice ?? 0), code).toBeGreaterThan(0);
      expect(row?.materialImageUrl, code).toBe(map?.materialImageUrl);
    }
  });
});

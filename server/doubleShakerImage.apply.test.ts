// Idempotent correction: the two Double Shaker door styles had wrong door-sample
// images. Repoint them at accurate double-shaker renders (two stacked recessed
// shaker panels with a center rail) and mark verified.
import { describe, it, expect } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const DUAL_WHITE_ID = 30025; // "Dual White" / Double Dove White
const DUAL_GRAY_ID = 30024; // "Dual Dusk" / Double Smokey Gray

const WHITE_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-dual-shaker-white-YxF5p23mwRrwVBiLixMXz8.webp";
const GRAY_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-dual-shaker-gray-ghR7qr7qSF7WzonUv5JRzu.webp";

describe("Double Shaker image correction", () => {
  it("repoints Dual White + Dual Dusk to accurate double-shaker renders", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    await db
      .update(doorStyles)
      .set({ doorSampleImageUrl: WHITE_IMG, thumbnailImageUrl: WHITE_IMG, doorSampleVerified: true })
      .where(eq(doorStyles.id, DUAL_WHITE_ID));

    await db
      .update(doorStyles)
      .set({ doorSampleImageUrl: GRAY_IMG, thumbnailImageUrl: GRAY_IMG, doorSampleVerified: true })
      .where(eq(doorStyles.id, DUAL_GRAY_ID));

    const rows = await db
      .select()
      .from(doorStyles)
      .where(inArray(doorStyles.id, [DUAL_WHITE_ID, DUAL_GRAY_ID]));

    expect(rows.length).toBe(2);
    const white = rows.find((r) => r.id === DUAL_WHITE_ID)!;
    const gray = rows.find((r) => r.id === DUAL_GRAY_ID)!;
    expect(white.doorSampleImageUrl).toBe(WHITE_IMG);
    expect(gray.doorSampleImageUrl).toBe(GRAY_IMG);
    expect(white.doorStyle).toBe("Double Shaker");
    expect(gray.doorStyle).toBe("Double Shaker");
    for (const r of rows) {
      expect(r.doorSampleVerified).toBe(true);
      expect(r.doorSampleImageUrl).toMatch(/dual-shaker/);
    }
  }, 30000);
});

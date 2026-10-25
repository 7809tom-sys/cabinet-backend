// Idempotent correction: the two "Double Shaker" door styles (Dual White / Dual
// Dusk) previously had WRONG door-sample images (two stacked recessed panels).
// The correct door, per the manufacturer references (11_DSG gray, 13_DDW white),
// is a SINGLE-PANEL shaker with a stepped/beveled reveal around the recessed
// panel. Repoint both styles at the corrected v2 renders and mark verified.
import { describe, it, expect } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const DUAL_WHITE_ID = 30025; // "Dual White" / Double Dove White
const DUAL_GRAY_ID = 30024; // "Dual Dusk" / Double Smokey Gray

const WHITE_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-dual-shaker-white-v2-LufcV4vf6h7Gkf7K5gxXGd.webp";
const GRAY_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-dual-shaker-gray-v2-nVZBuREa8k8nt6VYF9BLqZ.webp";

describe("Double Shaker image correction", () => {
  it("repoints Dual White + Dual Dusk to corrected single-panel stepped shaker renders", async () => {
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
    expect(white.thumbnailImageUrl).toBe(WHITE_IMG);
    expect(gray.thumbnailImageUrl).toBe(GRAY_IMG);
    expect(white.doorStyle).toBe("Double Shaker");
    expect(gray.doorStyle).toBe("Double Shaker");
    for (const r of rows) {
      expect(r.doorSampleVerified).toBe(true);
      expect(r.doorSampleImageUrl).toMatch(/dual-shaker-(white|gray)-v2/);
    }
  }, 30000);
});

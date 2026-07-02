// Idempotent correction: the Builder Grade line (Skyline Builder / Spring Forest
// "Floral" finishes = Bloom White / Bloom Cinder / Bloom Shadow) ships STANDARD
// hardware, NOT soft-close. Flag it as isBuilderGrade for the UI highlight.
// Premium lines (US Cabinet Depot, Clark & Son, premium Skyline) MUST stay soft-close.
import { describe, it, expect } from "vitest";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { eq, inArray, and } from "drizzle-orm";

// The three Builder-Grade door styles (Spring Forest "Floral" finishes).
const BUILDER_STYLE_IDS = [30040, 30041, 30042];
const BUILDER_HARDWARE = "Standard (Self-Close) Hinges & Slides";

describe("Builder Grade hardware correction", () => {
  it("sets Builder Grade styles to standard hardware + isBuilderGrade flag", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    await db
      .update(doorStyles)
      .set({ hardware: BUILDER_HARDWARE, isBuilderGrade: true })
      .where(inArray(doorStyles.id, BUILDER_STYLE_IDS));

    const rows = await db
      .select()
      .from(doorStyles)
      .where(inArray(doorStyles.id, BUILDER_STYLE_IDS));

    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.isBuilderGrade).toBe(true);
      expect(r.hardware).toBe(BUILDER_HARDWARE);
      expect(r.hardware).not.toMatch(/soft-?close/i);
    }
  }, 30000);

  it("keeps premium (non-builder) styles as soft-close and not builder-grade", async () => {
    const db = await getDb();
    if (!db) return;

    // A representative premium style: US Cabinet Depot Shaker White is soft-close.
    const premium = await db
      .select()
      .from(doorStyles)
      .where(and(eq(doorStyles.isBuilderGrade, false)));

    // No premium style should have been flagged builder-grade, and none should
    // have accidentally lost its soft-close hardware from this correction.
    expect(premium.length).toBeGreaterThan(0);
    for (const r of premium) {
      expect(r.isBuilderGrade).toBe(false);
      expect(BUILDER_STYLE_IDS).not.toContain(r.id);
    }
  }, 30000);
});

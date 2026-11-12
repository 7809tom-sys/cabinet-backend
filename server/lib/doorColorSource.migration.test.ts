import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const SQL = "docs/sql/0280_door_color_source.tidb.sql";

describe("0280 door color source migration", () => {
  it("adds the three columns with IF NOT EXISTS, one ALTER each", () => {
    const sql = read(SQL);
    expect(sql).toContain("ALTER TABLE cabinet_dealz.door_styles");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS doorColorSource VARCHAR(32) NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS doorColorSourceValue JSON NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS doorColorSourceUpdatedAt TIMESTAMP NULL");
  });

  it("only adds columns, so it can never destroy catalog data or backfill a default", () => {
    const sql = read(SQL);
    const executable = sql
      .split("\n")
      .map((line) => line.replace(/--.*$/, "").trim())
      .join("\n");
    expect(executable).not.toMatch(/\bINSERT\b/i);
    expect(executable).not.toMatch(/\bUPDATE\b/i);
    expect(executable).not.toMatch(/\bDELETE\b/i);
    expect(executable).not.toMatch(/\bDROP\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDEFAULT\b/i);
    const alters = executable.match(/ALTER TABLE[^;]*/gi) ?? [];
    expect(alters).toHaveLength(3);
    for (const statement of alters) expect(statement).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });

  it("is a hand-run TiDB script with one statement per numbered block", () => {
    const sql = read(SQL);
    expect(sql).toContain("-- TiDB SQL editor version");
    expect(sql).toContain("cabinet_dealz.door_styles");
    expect(sql).not.toContain("--> statement-breakpoint");
    const blocks = sql.split(/\n-- \d+[^\n]*\n/).slice(1);
    expect(blocks).toHaveLength(5);
    for (const block of blocks) {
      const statements = block
        .split("\n")
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      expect(statements).toHaveLength(1);
    }
  });

  it("says existing rows stay NULL and keep their current color order", () => {
    const sql = read(SQL);
    expect(sql).toMatch(/no backfill/i);
    expect(sql).toMatch(/keep their\n-- current color order|keep their current color order/i);
    expect(sql).toMatch(/Do not\n-- force them onto the supplier photo|Do not force them onto the supplier photo/i);
    expect(sql).toMatch(/Run this BEFORE deploying/);
  });

  it("keeps every statement inside the cabinet_dealz schema", () => {
    const sql = read(SQL);
    const executable = sql.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
    expect(executable).not.toMatch(/ALTER TABLE (?!cabinet_dealz\.)/i);
  });

  it("documents the allowed modes and that only confirmed choices are stored", () => {
    const sql = read(SQL);
    expect(sql).toContain("'original-image'");
    expect(sql).toContain("'approved-ai-image'");
    expect(sql).toContain("'sherwin-williams'");
    expect(sql).toContain("'hex'");
    expect(sql).toMatch(/Only confirmed choices are ever written/i);
  });
});

describe("doorStyles read/write surfaces carry the confirmed color source", () => {
  const source = read("server/routers/catalog.ts");
  const schema = read("drizzle/schema.ts");

  it("keeps the three columns OFF the main doorStyles table (they are read through doorColorSourceColumns.ts)", () => {
    const table = schema.slice(schema.indexOf('export const doorStyles = mysqlTable("door_styles"'));
    const body = table.slice(0, table.indexOf("export const", 1));
    expect(body).not.toContain('doorColorSource: varchar("doorColorSource"');
    const side = read("server/lib/doorColorSourceColumns.ts");
    expect(side).toContain('doorColorSource: varchar("doorColorSource", { length: 32 })');
    expect(side).toContain('doorColorSourceValue: json("doorColorSourceValue")');
    expect(side).toContain('doorColorSourceUpdatedAt: timestamp("doorColorSourceUpdatedAt")');
  });

  it("doorStyles.list and listForAdmin attach the three columns through the tolerant reader", () => {
    const listStart = source.indexOf("  list: publicProcedure");
    const listBody = source.slice(listStart, source.indexOf("  specificationReferences:", listStart));
    expect(listBody).toContain("withDoorColorSourceColumns(db,");
    expect(listBody).not.toContain("doorStyles.doorColorSource");

    const adminStart = source.indexOf("  listForAdmin: adminProcedure");
    const adminBody = source.slice(adminStart, source.indexOf("  setFeatured:", adminStart));
    expect(adminBody).toContain("withDoorColorSourceColumns(db, rows)");
    // The Approved AI option in the editor needs these; listForAdmin did not project them.
    expect(adminBody).toContain("approvedVersionId: doorStyles.approvedVersionId");
    expect(adminBody).toContain("approvedReferenceImageUrl: doorStyles.approvedReferenceImageUrl");
  });

  it("adminUpdateDoorStyle is the only write, and it is admin-only", () => {
    const updateStart = source.indexOf("  adminUpdateDoorStyle: adminProcedure");
    expect(updateStart).toBeGreaterThan(0);
    const updateEnd = source.indexOf("  addRoomScene:", updateStart);
    const updateBody = source.slice(updateStart, updateEnd);
    expect(updateBody).toContain("doorColorSourceSelection: doorColorSourceSelectionInput.nullable().optional()");
    expect(updateBody).toContain("selectionToColumns");
    expect(updateBody).toContain("EMPTY_DOOR_COLOR_SOURCE_COLUMNS");
    expect(updateBody).toContain("fields.doorColorSourceSelection !== undefined");
    // No other procedure accepts or writes the payload field.
    const inputFields = [...source.matchAll(/doorColorSourceSelection:/g)];
    expect(inputFields).toHaveLength(1);
    expect(inputFields[0].index).toBeGreaterThan(updateStart);
    expect(inputFields[0].index).toBeLessThan(updateEnd);
    expect(source.slice(0, updateStart)).not.toMatch(/adminUpdateDoorStyle: (public|protected)Procedure/);
  });
});

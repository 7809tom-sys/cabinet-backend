import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("0245 door style accepted run migration", () => {
  it("adds the four accepted-run columns with IF NOT EXISTS", () => {
    const sql = read("docs/sql/0245_door_style_accepted_run.tidb.sql");
    expect(sql).toContain("ALTER TABLE cabinet_dealz.door_styles");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS renderHex VARCHAR(7) NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS approvedReferenceImageUrl VARCHAR(512) NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS approvedVersionId INT NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS approvedAt TIMESTAMP NULL");
  });

  it("only adds columns, so it can never destroy catalog data", () => {
    const sql = read("docs/sql/0245_door_style_accepted_run.tidb.sql");
    const executable = sql
      .split("\n")
      .map((line) => line.replace(/--.*$/, "").trim())
      .join("\n");
    expect(executable).not.toMatch(/\bINSERT\b/i);
    expect(executable).not.toMatch(/\bUPDATE\b/i);
    expect(executable).not.toMatch(/\bDELETE\b/i);
    expect(executable).not.toMatch(/\bDROP\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    // Every write is an ADD COLUMN, and every one of them is IF NOT EXISTS.
    const alters = executable.match(/ALTER TABLE[^;]*/gi) ?? [];
    expect(alters).toHaveLength(4);
    for (const statement of alters) expect(statement).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });

  it("is a hand-run TiDB script with one statement per numbered block", () => {
    const sql = read("docs/sql/0245_door_style_accepted_run.tidb.sql");
    expect(sql).toContain("-- TiDB SQL editor version");
    expect(sql).toContain("cabinet_dealz.door_styles");
    expect(sql).not.toContain("--> statement-breakpoint");
    const blocks = sql.split(/\n-- \d+[^\n]*\n/).slice(1);
    expect(blocks).toHaveLength(6);
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

  it("says renderHex already exists from 0233 and is widened, not redefined", () => {
    const sql = read("docs/sql/0245_door_style_accepted_run.tidb.sql");
    expect(sql).toMatch(/renderHex may already exist from 0233/);
    expect(sql).toMatch(/IF NOT EXISTS, so running it over an existing column changes nothing/);
  });

  it("keeps every statement inside the cabinet_dealz schema", () => {
    const sql = read("docs/sql/0245_door_style_accepted_run.tidb.sql");
    const executable = sql.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
    expect(executable).not.toMatch(/ALTER TABLE (?!cabinet_dealz\.)/i);
  });
});

describe("the accepted-run writeback is wired into the one decision path", () => {
  const source = read("server/routers/doorRenderingAudit.ts");

  it("recordDecision is what writes the accepted run back to the door style", () => {
    expect(source).toContain("writeAcceptedAppearanceToStyle");
    const recordDecision = source.slice(source.indexOf("async function recordDecision"));
    const body = recordDecision.slice(0, recordDecision.indexOf("export const doorRenderingAuditRouter"));
    expect(body).toContain("syncAcceptedAppearanceToStyle");
    // Accept, revert, and revoke all reach it; a reject leaves the approval alone.
    expect(body).toContain('action === "revoked"');
  });

  it("derives the color from the render image rather than copying a hex", () => {
    expect(source).not.toMatch(/renderHex:\s*accepted\.renderHex/);
    expect(read("server/lib/acceptedDoorAppearance.ts")).toContain("deriveRenderImageHex");
  });

  it("a writeback failure is logged and never fails the approval", () => {
    const lib = read("server/lib/acceptedDoorAppearance.ts");
    expect(lib).toContain("accepted appearance writeback failed");
    expect(lib).not.toMatch(/throw new TRPCError\([\s\S]{0,200}writeback/);
  });
});

describe("doorStyles.list carries the accepted appearance to the Designer", () => {
  const source = read("server/routers/catalog.ts");
  const listStart = source.indexOf("  list: publicProcedure");
  const listBody = source.slice(listStart, source.indexOf("  specificationReferences:", listStart));

  it("projects the approved image and the approval marker", () => {
    expect(listBody).toContain("renderHex: doorStyles.renderHex");
    expect(listBody).toContain("approvedReferenceImageUrl: doorStyles.approvedReferenceImageUrl");
    expect(listBody).toContain("approvedVersionId: doorStyles.approvedVersionId");
  });
});

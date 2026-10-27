import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CABINET_CONFLICT_FLAGS,
  changedLockableFields,
  formatConflictReason,
  locksAfterResolve,
  omitImportLockedFields,
  parseResolvedFields,
  PUBLIC_CATALOG_REVIEW_STATUS,
} from "./cabinetConflictFlags";

const migration = readFileSync(new URL("../drizzle/0206_public_cabinet_conflict_reviews.sql", import.meta.url), "utf8");

describe("public cabinet conflict flags", () => {
  it("flags the workbook rows without hiding them", () => {
    expect(CABINET_CONFLICT_FLAGS.map((flag) => [flag.masterCode, flag.sheetRow])).toEqual([
      ["PGWDC30", 69],
      ["PGWDC36", 70],
      ["PGWDC42", 71],
      ["SPW", 330],
      ["SGH30", 90],
      ["B30", 189],
    ]);
    expect(PUBLIC_CATALOG_REVIEW_STATUS).toBe("review");
    for (const flag of CABINET_CONFLICT_FLAGS) {
      const reason = formatConflictReason(flag);
      expect(reason).toContain(`Issue: ${flag.issue}`);
      expect(reason).toContain(`Current value: ${flag.currentValue}`);
      expect(reason).toContain(`Source: ${flag.source}`);
      expect(reason).toContain(`Needed: ${flag.needed}`);
      expect(parseResolvedFields(reason)).toEqual(flag.resolvedFields);
    }
  });

  it("seeds review status in a migration and does not unpublish rows", () => {
    expect(migration).toContain("ADD `importLockedFields` json");
    expect(migration).not.toMatch(/showInCatalog|showInDesigner|showIn2020|isActive/);
    expect(migration).not.toMatch(/SET[\s\S]{0,80}conflictStatus` = 'conflict'/);
    for (const flag of CABINET_CONFLICT_FLAGS) {
      expect(migration).toContain(`WHERE \`masterCode\` = '${flag.masterCode}'`);
      expect(migration).toContain("`conflictStatus` = 'review'");
      const escaped = formatConflictReason(flag).replace(/'/g, "''").replace(/\n/g, "\\n");
      expect(migration).toContain(escaped);
    }
  });

  it("locks a resubmitted field only when the value changed", () => {
    expect(changedLockableFields(
      { description: "Same", depth: "1.000", numberOfDrawers: 2 },
      { description: "Same", depth: "1", numberOfDrawers: 1, category: "Base" },
    )).toEqual(["category", "numberOfDrawers"]);
  });

  it("locks declared and edited fields when a review is resolved", () => {
    const reason = formatConflictReason(CABINET_CONFLICT_FLAGS.find((flag) => flag.masterCode === "B30")!);
    expect(locksAfterResolve({ existingLocks: null, conflictReason: reason })).toEqual([
      "description",
      "numberOfDrawers",
    ]);
    expect(locksAfterResolve({
      existingLocks: ["depth"],
      conflictReason: reason,
      editedFields: ["width", "notAColumn"],
    })).toEqual(["depth", "description", "numberOfDrawers", "width"]);
  });

  it("keeps resolved catalog fields when a later spreadsheet import sends new values", () => {
    const patch = omitImportLockedFields({
      description: "Imported description",
      depth: "24",
      numberOfDrawers: 2,
      category: "Base",
    }, ["description", "numberOfDrawers"]);
    expect(patch).toEqual({ depth: "24", category: "Base" });
    expect(omitImportLockedFields({ description: "x" }, null)).toEqual({ description: "x" });
  });
});

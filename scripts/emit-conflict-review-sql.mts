import { writeFileSync } from "node:fs";
import { CABINET_CONFLICT_FLAGS, formatConflictReason } from "../shared/cabinetConflictFlags.ts";

function sqlString(value: string): string {
  return `'${value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}'`;
}

const lines: string[] = [
  "-- Public cabinet-conflict reviews (workbook 2026-10-26).",
  "-- Status 'review' is listed in the admin Conflicts tab and is NOT excluded",
  "-- by the public catalog predicate (that predicate only excludes 'conflict').",
  "-- Does not change publication, visibility, prices, or SKUs.",
  "-- Rows already held as hidden conflicts keep that hold; the review note is appended.",
  "-- Rows with no conflict are flagged as public reviews.",
  "",
  "ALTER TABLE `cabinets` ADD `importLockedFields` json;",
  "",
];

for (const flag of CABINET_CONFLICT_FLAGS) {
  const reason = sqlString(formatConflictReason(flag));
  const code = sqlString(flag.masterCode);
  lines.push(
    "UPDATE `cabinets`",
    "SET",
    "  `conflictReason` = CONCAT(IFNULL(CONCAT(`conflictReason`, '\\n\\n'), ''), " + reason + "),",
    "  `conflictedAt` = NOW()",
    "WHERE `masterCode` = " + code,
    "  AND `conflictStatus` = 'conflict'",
    "  AND (`conflictReason` IS NULL OR `conflictReason` NOT LIKE 'Issue:%');",
    "",
    "UPDATE `cabinets`",
    "SET",
    "  `conflictStatus` = 'review',",
    "  `conflictReason` = " + reason + ",",
    "  `conflictedAt` = NOW()",
    "WHERE `masterCode` = " + code,
    "  AND `conflictStatus` = 'none';",
    "",
  );
}

writeFileSync(new URL("../drizzle/0206_public_cabinet_conflict_reviews.sql", import.meta.url), lines.join("\n"));

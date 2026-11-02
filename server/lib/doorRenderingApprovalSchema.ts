import { sql, type SQL } from "drizzle-orm";

/**
 * door_rendering_versions was created by migration 0223. The shared approval
 * columns (source, renderHex, approvedDoorImageUrl, approvedDrawerImageUrl)
 * and the 'revoked' event action exist in the Drizzle schema and in
 * docs/sql/0241_door_shared_approval.tidb.sql, but that file is not in the
 * Drizzle journal and the server does not run migrations on boot.
 *
 * An insert that names those columns then fails inside TiDB. Drizzle reports
 * only "Failed query: insert into door_rendering_versions ...", hiding
 * "Unknown column 'source'" (columns never added) or "Data truncated for
 * column 'source'" (enum added without 'featured').
 *
 * These statements are the same change as 0241, written so the app can apply
 * them idempotently. They are safe to re-run.
 */
export const DOOR_RENDERING_APPROVAL_MIGRATION =
  "docs/sql/0241_door_shared_approval.tidb.sql";

export const DOOR_RENDERING_APPROVAL_ALTERS = [
  "ALTER TABLE `door_rendering_versions` ADD COLUMN IF NOT EXISTS `source` ENUM('audit','designer','featured') NOT NULL DEFAULT 'audit'",
  "ALTER TABLE `door_rendering_versions` ADD COLUMN IF NOT EXISTS `renderHex` VARCHAR(16) NULL",
  "ALTER TABLE `door_rendering_versions` ADD COLUMN IF NOT EXISTS `approvedDoorImageUrl` VARCHAR(512) NULL",
  "ALTER TABLE `door_rendering_versions` ADD COLUMN IF NOT EXISTS `approvedDrawerImageUrl` VARCHAR(512) NULL",
  "ALTER TABLE `door_rendering_versions` MODIFY COLUMN `source` ENUM('audit','designer','featured') NOT NULL DEFAULT 'audit'",
  "ALTER TABLE `door_rendering_version_events` MODIFY COLUMN `action` ENUM('accepted','rejected','reverted','revoked') NOT NULL",
] as const;

export const DOOR_RENDERING_APPROVAL_PROBE = `
SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'door_rendering_versions' AND COLUMN_NAME IN ('source','renderHex','approvedDoorImageUrl','approvedDrawerImageUrl'))
    OR (TABLE_NAME = 'door_rendering_version_events' AND COLUMN_NAME = 'action')
  )
`;

const VERSION_COLUMNS = [
  "source",
  "renderHex",
  "approvedDoorImageUrl",
  "approvedDrawerImageUrl",
] as const;

const PRESENT_TTL_MS = 5 * 60 * 1000;
const MISSING_TTL_MS = 30 * 1000;

type CacheEntry = {
  versionsReady: boolean;
  eventsReady: boolean;
  expiresAt: number;
};

let cache: CacheEntry | null = null;

export function resetDoorRenderingApprovalSchemaCache(): void {
  cache = null;
}

type SchemaErrorRow = {
  code?: unknown;
  errno?: unknown;
  message?: unknown;
  sqlMessage?: unknown;
  cause?: unknown;
};

function errorChain(error: unknown): SchemaErrorRow[] {
  const rows: SchemaErrorRow[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    rows.push(current as SchemaErrorRow);
    current = (current as SchemaErrorRow).cause;
  }
  if (typeof error === "string") rows.push({ message: error });
  return rows;
}

/** The MySQL/TiDB message under Drizzle's "Failed query" wrapper. */
export function databaseErrorDetail(error: unknown): string {
  for (const row of errorChain(error)) {
    const sqlMessage =
      typeof row.sqlMessage === "string" ? row.sqlMessage.trim() : "";
    if (sqlMessage) return sqlMessage;
    const message = typeof row.message === "string" ? row.message.trim() : "";
    if (message && !message.startsWith("Failed query:")) return message;
  }
  return error instanceof Error ? error.message : "unknown database error";
}

export function isMissingDoorRenderingApprovalColumn(error: unknown): boolean {
  for (const row of errorChain(error)) {
    const errno =
      typeof row.errno === "number"
        ? row.errno
        : typeof row.errno === "string" && /^\d+$/.test(row.errno)
          ? Number(row.errno)
          : null;
    const codeMatches =
      row.code === "ER_BAD_FIELD_ERROR" || errno === 1054 || errno === 1265;
    const text = [row.message, row.sqlMessage]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    const textMatches =
      /unknown column|ER_BAD_FIELD_ERROR|data truncated for column/i.test(text);
    if (
      (codeMatches || textMatches) &&
      /source|renderHex|approvedDoorImageUrl|approvedDrawerImageUrl/i.test(text)
    )
      return true;
  }
  return false;
}

function field(row: Record<string, unknown>, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() !== target || value == null) continue;
    return String(value);
  }
  return "";
}

export function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object")
      return result as Array<Record<string, unknown>>;
  }
  return [];
}

export function doorRenderingApprovalSchemaState(
  rows: Array<Record<string, unknown>>
): {
  versionsReady: boolean;
  eventsReady: boolean;
} {
  const versionTypes = new Map<string, string>();
  let actionType = "";
  for (const row of rows) {
    const table = field(row, "tableName");
    const column = field(row, "columnName");
    const type = field(row, "columnType");
    if (table === "door_rendering_versions") versionTypes.set(column, type);
    if (table === "door_rendering_version_events" && column === "action")
      actionType = type;
  }
  const sourceType = versionTypes.get("source") ?? "";
  const versionsReady =
    VERSION_COLUMNS.every(name => versionTypes.has(name)) &&
    /featured/i.test(sourceType);
  const eventsReady = /revoked/i.test(actionType);
  return { versionsReady, eventsReady };
}

type Executor = { execute: (query: SQL) => Promise<unknown> };

async function probe(
  db: Executor
): Promise<{ versionsReady: boolean; eventsReady: boolean } | null> {
  try {
    const result = await db.execute(sql.raw(DOOR_RENDERING_APPROVAL_PROBE));
    return doorRenderingApprovalSchemaState(rowsFrom(result));
  } catch (error) {
    console.error(
      "[door-rendering-versions] could not read information_schema.",
      databaseErrorDetail(error)
    );
    return null;
  }
}

function remember(
  state: { versionsReady: boolean; eventsReady: boolean },
  now = Date.now()
): void {
  const ready = state.versionsReady && state.eventsReady;
  cache = {
    versionsReady: state.versionsReady,
    eventsReady: state.eventsReady,
    expiresAt: now + (ready ? PRESENT_TTL_MS : MISSING_TTL_MS),
  };
}

/**
 * Add the 0241 columns when they are missing, and widen a source enum that
 * was created without 'featured'. Returns whether a featured version row can
 * be inserted. Never throws: a database that cannot ALTER stays on the old
 * shape and the caller decides whether that blocks the door-style save.
 */
export async function ensureDoorRenderingApprovalColumns(
  db: Executor
): Promise<boolean> {
  const now = Date.now();
  if (cache && cache.expiresAt > now && cache.versionsReady) return true;
  const before = await probe(db);
  if (before?.versionsReady && before.eventsReady) {
    remember(before, now);
    return true;
  }
  if (!before?.versionsReady) {
    for (const statement of DOOR_RENDERING_APPROVAL_ALTERS.slice(0, 5)) {
      try {
        await db.execute(sql.raw(statement));
      } catch (error) {
        console.error(
          `[door-rendering-versions] Could not apply ${DOOR_RENDERING_APPROVAL_MIGRATION}.`,
          databaseErrorDetail(error)
        );
      }
    }
  }
  if (!before?.eventsReady) {
    try {
      await db.execute(sql.raw(DOOR_RENDERING_APPROVAL_ALTERS[5]));
    } catch (error) {
      console.error(
        `[door-rendering-versions] Could not add the revoked approval action. ${DOOR_RENDERING_APPROVAL_MIGRATION}`,
        databaseErrorDetail(error)
      );
    }
  }
  const after = await probe(db);
  if (after) remember(after);
  return after?.versionsReady ?? false;
}

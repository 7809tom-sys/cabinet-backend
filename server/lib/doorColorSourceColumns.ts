/**
 * Optional door color source columns on door_styles (Tom, Nov 12 2026).
 *
 * docs/sql/0280_door_color_source.tidb.sql adds doorColorSource,
 * doorColorSourceValue and doorColorSourceUpdatedAt BY HAND. Until it has run,
 * any query that names those columns fails with "Unknown column", and that took
 * down doorStyles.list, featured, byCode and every other door style read on Nov 12
 * 2026 (no door colors in the Designer). So these columns are deliberately NOT
 * part of the main `doorStyles` table object in drizzle/schema.ts: a plain
 * `select().from(doorStyles)` or an insert must never depend on 0280.
 *
 * They live on this narrow table object instead and are only read or written
 * after `doorColorSourceColumnsAvailable` has seen them in information_schema.
 * Missing columns read as "nothing chosen" (all NULL), so every door keeps its
 * current color order.
 */
import { inArray, sql } from "drizzle-orm";
import { int, json, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { EMPTY_DOOR_COLOR_SOURCE_COLUMNS, type DoorColorSourceColumns, type DoorColorSourceOption } from "./doorColorSourceSelection";

/** Same physical table as `doorStyles`; only the id and the three 0280 columns. */
export const doorStyleColorSources = mysqlTable("door_styles", {
  id: int("id").primaryKey(),
  doorColorSource: varchar("doorColorSource", { length: 32 }),
  doorColorSourceValue: json("doorColorSourceValue").$type<Record<string, unknown> | null>(),
  doorColorSourceUpdatedAt: timestamp("doorColorSourceUpdatedAt"),
});

export const DOOR_COLOR_SOURCE_COLUMN_NAMES = ["doorColorSource", "doorColorSourceValue", "doorColorSourceUpdatedAt"] as const;

/** How long a "columns missing" answer is trusted before information_schema is asked again. */
export const MISSING_COLUMNS_RECHECK_MS = 60_000;

type ExecDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

let cache: { available: boolean; checkedAt: number } | null = null;

export function resetDoorColorSourceColumnsCache(): void {
  cache = null;
}

function countFromExecuteResult(result: unknown): number {
  // mysql2 drizzle returns [rows, fields]; other drivers return rows directly.
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first || typeof first !== "object") return 0;
  const value = (first as Record<string, unknown>).columnCount ?? Object.values(first as Record<string, unknown>)[0];
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * True once all three 0280 columns exist on door_styles. A true answer is cached
 * for the life of the process; a false answer is rechecked every minute, so the
 * feature turns on by itself shortly after Tom runs 0280, with no redeploy.
 * Any probe error reads as "not available" and never throws.
 */
export async function doorColorSourceColumnsAvailable(db: ExecDb, now: number = Date.now()): Promise<boolean> {
  if (cache?.available) return true;
  if (cache && now - cache.checkedAt < MISSING_COLUMNS_RECHECK_MS) return false;
  let available = false;
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS columnCount
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'door_styles'
        AND column_name IN ('doorColorSource', 'doorColorSourceValue', 'doorColorSourceUpdatedAt')
    `);
    available = countFromExecuteResult(result) >= DOOR_COLOR_SOURCE_COLUMN_NAMES.length;
  } catch (error) {
    console.warn("[door color source] column probe failed; treating columns as missing", error);
    available = false;
  }
  cache = { available, checkedAt: now };
  return available;
}

function isUnknownColumnError(error: unknown): boolean {
  const text = String((error as { message?: unknown })?.message ?? error) + String((error as { cause?: { message?: unknown } })?.cause?.message ?? "");
  const code = (error as { code?: unknown; cause?: { code?: unknown } })?.code ?? (error as { cause?: { code?: unknown } })?.cause?.code;
  return code === "ER_BAD_FIELD_ERROR" || /unknown column/i.test(text);
}

type ColorSourceDb = ExecDb & {
  select: (...args: any[]) => any;
};

/**
 * Add the three color source fields to each style row. When the columns are
 * missing (0280 not run) or the read fails, every row gets NULLs, which means
 * "nothing chosen" and the door keeps its current color order. Never throws.
 */
export async function withDoorColorSourceColumns<T extends { id: number }>(
  db: ColorSourceDb,
  rows: T[],
): Promise<Array<T & DoorColorSourceColumns>> {
  const empty = () => rows.map((row) => ({ ...row, ...EMPTY_DOOR_COLOR_SOURCE_COLUMNS }));
  if (rows.length === 0) return [];
  if (!(await doorColorSourceColumnsAvailable(db))) return empty();
  try {
    const ids = Array.from(new Set(rows.map((row) => row.id)));
    const stored: Array<{ id: number; doorColorSource: string | null; doorColorSourceValue: Record<string, unknown> | null; doorColorSourceUpdatedAt: Date | null }> = [];
    for (let start = 0; start < ids.length; start += 1000) {
      const chunk = ids.slice(start, start + 1000);
      const part = await db
        .select({
          id: doorStyleColorSources.id,
          doorColorSource: doorStyleColorSources.doorColorSource,
          doorColorSourceValue: doorStyleColorSources.doorColorSourceValue,
          doorColorSourceUpdatedAt: doorStyleColorSources.doorColorSourceUpdatedAt,
        })
        .from(doorStyleColorSources)
        .where(inArray(doorStyleColorSources.id, chunk));
      stored.push(...part);
    }
    const byId = new Map(stored.map((row) => [row.id, row]));
    return rows.map((row) => {
      const hit = byId.get(row.id);
      return {
        ...row,
        doorColorSource: (hit?.doorColorSource ?? null) as DoorColorSourceOption | null,
        doorColorSourceValue: hit?.doorColorSourceValue ?? null,
        doorColorSourceUpdatedAt: hit?.doorColorSourceUpdatedAt ?? null,
      };
    });
  } catch (error) {
    if (isUnknownColumnError(error)) resetDoorColorSourceColumnsCache();
    console.warn("[door color source] read failed; doors keep their current color order", error);
    return empty();
  }
}

/** Thrown message when an admin saves a choice before 0280 has run. */
export const DOOR_COLOR_SOURCE_NOT_READY_MESSAGE =
  "The door color source columns are not in the database yet. Run docs/sql/0280_door_color_source.tidb.sql, then save again. Nothing else on this door was blocked.";

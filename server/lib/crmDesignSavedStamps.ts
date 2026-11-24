/**
 * Automatic "first design saved" / "last design saved" dates on CRM contacts
 * (Tom, Nov 23 2026: "every contact gets a date stamp whenever an initial design
 * is saved, and all those dates are stamped automatically").
 *
 * A CRM contact is a crm_deals row (contactName / contactEmail / contactPhone).
 * docs/sql/0284_crm_design_saved_stamps.tidb.sql adds two nullable columns BY
 * HAND:
 *   firstDesignSavedAt  set once, the first time a design is saved for the
 *                       contact, and never overwritten afterwards
 *   lastDesignSavedAt   moved forward on every save
 *
 * Both are always written with the DATABASE clock (NOW()), never a browser time.
 *
 * Like doorColorSourceColumns.ts, these columns are deliberately NOT part of the
 * main `crmDeals` table object in drizzle/schema.ts: a plain
 * `select().from(crmDeals)` or a deal insert must never depend on 0284 having
 * run. Every read and write here first checks information_schema; when the
 * columns are missing, stamping is skipped and reads return NULL. Nothing here
 * ever throws into a design save.
 *
 * The stamp statements also assign `updatedAt = updatedAt`, so stamping a date
 * does not bump the deal's ON UPDATE updatedAt (which drives board order and the
 * "Last activity" fallback). The save itself still updates the deal as before.
 */
import { inArray, sql } from "drizzle-orm";
import { int, mysqlTable, timestamp } from "drizzle-orm/mysql-core";

/** Same physical table as `crmDeals`; only the id and the two 0284 columns. */
export const crmDealDesignSavedStamps = mysqlTable("crm_deals", {
  id: int("id").primaryKey(),
  firstDesignSavedAt: timestamp("firstDesignSavedAt"),
  lastDesignSavedAt: timestamp("lastDesignSavedAt"),
});

export const CRM_DESIGN_STAMP_COLUMN_NAMES = ["firstDesignSavedAt", "lastDesignSavedAt"] as const;

/** How long a "columns missing" answer is trusted before information_schema is asked again. */
export const MISSING_STAMP_COLUMNS_RECHECK_MS = 60_000;

export type DesignSavedStamps = {
  firstDesignSavedAt: Date | null;
  lastDesignSavedAt: Date | null;
};

export const EMPTY_DESIGN_SAVED_STAMPS: DesignSavedStamps = { firstDesignSavedAt: null, lastDesignSavedAt: null };

type ExecDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
type StampDb = ExecDb & { select: (...args: any[]) => any };

let cache: { available: boolean; checkedAt: number } | null = null;

export function resetCrmDesignStampColumnsCache(): void {
  cache = null;
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : [];
}

function validIds(ids: readonly (number | null | undefined)[]): number[] {
  return Array.from(new Set(ids.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)));
}

/**
 * True once both 0284 columns exist on crm_deals. A true answer is cached for the
 * life of the process; a false answer is rechecked every minute, so stamping
 * turns on by itself shortly after Tom runs 0284, with no redeploy. Any probe
 * error reads as "not available" and never throws.
 */
export async function crmDesignStampColumnsAvailable(db: ExecDb, now: number = Date.now()): Promise<boolean> {
  if (cache?.available) return true;
  if (cache && now - cache.checkedAt < MISSING_STAMP_COLUMNS_RECHECK_MS) return false;
  let available = false;
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS columnCount
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'crm_deals'
        AND column_name IN ('firstDesignSavedAt', 'lastDesignSavedAt')
    `);
    const count = Number(rowsOf(result)[0]?.columnCount ?? 0);
    available = Number.isFinite(count) && count >= CRM_DESIGN_STAMP_COLUMN_NAMES.length;
  } catch (error) {
    console.warn("[crm design stamps] column probe failed; treating columns as missing", error);
    available = false;
  }
  cache = { available, checkedAt: now };
  return available;
}

/**
 * A design was just saved for these CRM contacts. Sets firstDesignSavedAt once
 * (only while it is still NULL) and moves lastDesignSavedAt to now, both from
 * the database clock. Returns how many deal ids were stamped (0 when the
 * columns are missing or the write failed). Never throws.
 */
export async function stampCrmDealsDesignSaved(db: ExecDb, dealIds: readonly (number | null | undefined)[]): Promise<number> {
  const ids = validIds(dealIds);
  if (ids.length === 0) return 0;
  if (!(await crmDesignStampColumnsAvailable(db))) return 0;
  try {
    await db.execute(sql`
      UPDATE crm_deals
      SET firstDesignSavedAt = COALESCE(firstDesignSavedAt, NOW()),
          lastDesignSavedAt = NOW(),
          updatedAt = updatedAt
      WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);
    return ids.length;
  } catch (error) {
    console.warn("[crm design stamps] could not stamp design-saved dates", error);
    return 0;
  }
}

/**
 * A saved design changed (manual save, autosave, revert, assisted revision).
 * Stamps every CRM contact the design is linked to through crm_deal_designs.
 * Never throws.
 */
export async function stampCrmDealsForDesignSave(db: ExecDb, designId: number | null | undefined): Promise<number> {
  if (typeof designId !== "number" || !Number.isInteger(designId) || designId <= 0) return 0;
  if (!(await crmDesignStampColumnsAvailable(db))) return 0;
  try {
    const result = await db.execute(sql`SELECT DISTINCT dealId FROM crm_deal_designs WHERE designId = ${designId}`);
    const dealIds = rowsOf(result).map((row) => Number(row.dealId));
    return await stampCrmDealsDesignSaved(db, dealIds);
  } catch (error) {
    console.warn("[crm design stamps] could not look up deals for a saved design", error);
    return 0;
  }
}

/**
 * A saved design was just LINKED to these contacts (not saved). The stamps are
 * taken from the linked designs' own server-side save times: first is filled
 * from the earliest linked design's createdAt only while it is still NULL, and
 * last moves forward to the newest linked design's updatedAt if that is later.
 * Same statement shape as the 0284 backfill. Never throws.
 */
export async function stampCrmDealsFromLinkedDesigns(db: ExecDb, dealIds: readonly (number | null | undefined)[]): Promise<number> {
  const ids = validIds(dealIds);
  if (ids.length === 0) return 0;
  if (!(await crmDesignStampColumnsAvailable(db))) return 0;
  try {
    await db.execute(sql`
      UPDATE crm_deals d
      JOIN (
        SELECT l.dealId AS dealId,
               MIN(kd.createdAt) AS firstAt,
               MAX(GREATEST(kd.createdAt, kd.updatedAt)) AS lastAt
        FROM crm_deal_designs l
        JOIN kitchen_designs kd ON kd.id = l.designId
        WHERE l.dealId IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        GROUP BY l.dealId
      ) s ON s.dealId = d.id
      SET d.firstDesignSavedAt = COALESCE(d.firstDesignSavedAt, s.firstAt),
          d.lastDesignSavedAt = CASE
            WHEN d.lastDesignSavedAt IS NULL OR s.lastAt > d.lastDesignSavedAt THEN s.lastAt
            ELSE d.lastDesignSavedAt
          END,
          d.updatedAt = d.updatedAt
    `);
    return ids.length;
  } catch (error) {
    console.warn("[crm design stamps] could not stamp dates from linked designs", error);
    return 0;
  }
}

/**
 * Adds firstDesignSavedAt / lastDesignSavedAt to each deal row for the CRM
 * screens. When the columns are missing (0284 not run) or the read fails, every
 * row gets NULLs. Never throws.
 */
export async function withCrmDesignSavedStamps<T extends { id: number }>(
  db: StampDb,
  rows: T[],
): Promise<Array<T & DesignSavedStamps>> {
  const empty = () => rows.map((row) => ({ ...row, ...EMPTY_DESIGN_SAVED_STAMPS }));
  if (rows.length === 0) return [];
  if (!(await crmDesignStampColumnsAvailable(db))) return empty();
  try {
    const ids = validIds(rows.map((row) => row.id));
    const byId = new Map<number, DesignSavedStamps>();
    for (let start = 0; start < ids.length; start += 1000) {
      const chunk = ids.slice(start, start + 1000);
      const part: Array<{ id: number } & DesignSavedStamps> = await db
        .select({
          id: crmDealDesignSavedStamps.id,
          firstDesignSavedAt: crmDealDesignSavedStamps.firstDesignSavedAt,
          lastDesignSavedAt: crmDealDesignSavedStamps.lastDesignSavedAt,
        })
        .from(crmDealDesignSavedStamps)
        .where(inArray(crmDealDesignSavedStamps.id, chunk));
      for (const row of part) {
        byId.set(Number(row.id), {
          firstDesignSavedAt: row.firstDesignSavedAt ?? null,
          lastDesignSavedAt: row.lastDesignSavedAt ?? null,
        });
      }
    }
    return rows.map((row) => ({ ...row, ...(byId.get(row.id) ?? EMPTY_DESIGN_SAVED_STAMPS) }));
  } catch (error) {
    console.warn("[crm design stamps] could not read design-saved dates", error);
    return empty();
  }
}

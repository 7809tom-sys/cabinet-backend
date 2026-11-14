/**
 * The human lead time for a supplier line ("6-8 weeks" for a special-order line).
 *
 * `distributors.leadTimeDays` is one integer, which cannot say "6 to 8 weeks" and
 * cannot carry the uncertainty a customer needs to plan around. Tom, Nov 14 2026:
 * the frameless line is special order, "6 to 8 weeks", and it should read that way
 * everywhere a lead time is shown rather than as "56 days".
 *
 * docs/sql/0282_distributor_lead_time_label.tidb.sql adds leadTimeLabel BY HAND, so
 * - exactly like the 0280 and 0281 columns - it is never declared on the main
 * distributors table and is only read after a probe has seen it. Missing reads as
 * absent, and every surface falls back to the numeric days.
 */
import { inArray, sql } from "drizzle-orm";
import { int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

/** Same physical table as `distributors`; only the id and the 0282 column. */
export const distributorLeadTimes = mysqlTable("distributors", {
  id: int("id").primaryKey(),
  leadTimeLabel: varchar("leadTimeLabel", { length: 48 }),
});

export const DISTRIBUTOR_LEAD_TIME_LABEL_COLUMN = "leadTimeLabel";

export const MISSING_LEAD_TIME_LABEL_RECHECK_MS = 60_000;

type ExecDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

let cache: { available: boolean; checkedAt: number } | null = null;

export function resetLeadTimeLabelCache(): void {
  cache = null;
}

function firstRow(result: unknown): Record<string, unknown> | null {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  const first = Array.isArray(rows) ? rows[0] : null;
  return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
}

/** True once 0282's column exists. A false answer is rechecked every minute. */
export async function leadTimeLabelColumnAvailable(db: ExecDb, now: number = Date.now()): Promise<boolean> {
  if (cache?.available) return true;
  if (cache && now - cache.checkedAt < MISSING_LEAD_TIME_LABEL_RECHECK_MS) return false;
  let available = false;
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS columnCount
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'distributors'
        AND column_name = 'leadTimeLabel'
    `);
    const count = Number(firstRow(result)?.columnCount ?? 0);
    available = Number.isFinite(count) && count > 0;
  } catch (error) {
    console.warn("[distributor lead time] column probe failed; falling back to days", error);
    available = false;
  }
  cache = { available, checkedAt: now };
  return available;
}

/**
 * The label for each distributor id, or an empty map when 0282 has not run. Never
 * throws: a failed read leaves every line on its numeric days.
 */
export async function leadTimeLabelsById(
  db: ExecDb & { select: (...args: any[]) => any },
  ids: readonly number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const wanted = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (wanted.length === 0) return map;
  if (!(await leadTimeLabelColumnAvailable(db))) return map;
  try {
    const rows = await db
      .select({ id: distributorLeadTimes.id, leadTimeLabel: distributorLeadTimes.leadTimeLabel })
      .from(distributorLeadTimes)
      .where(inArray(distributorLeadTimes.id, wanted));
    for (const row of rows as Array<{ id: number; leadTimeLabel: string | null }>) {
      const label = (row.leadTimeLabel ?? "").trim();
      if (Number.isInteger(Number(row.id)) && label) map.set(Number(row.id), label);
    }
  } catch (error) {
    console.warn("[distributor lead time] label read failed; falling back to days", error);
    if (/unknown column/i.test(String((error as { message?: unknown })?.message ?? ""))) resetLeadTimeLabelCache();
  }
  return map;
}

/**
 * Optional AI door profile columns on door_styles (Tom, Nov 13 2026).
 *
 * "Choose as official" kept the winning AI description and its generated image
 * in the browser only: the choice vanished on another machine and never reached
 * the Designer running anywhere else. Tom: "its not save the AI Generated images
 * even if i save".
 *
 * docs/sql/0281_ai_door_profile.tidb.sql adds aiProfileModel, aiProfileText and
 * aiProfileImageUrl BY HAND. The 0280 episode proved that declaring hand-added
 * columns on the main `doorStyles` table breaks every door style read until the
 * migration runs, so they live on this narrow table object and are only touched
 * after the probe has seen them.
 */
import { inArray, sql } from "drizzle-orm";
import { int, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

/** Same physical table as `doorStyles`; only the id and the three 0281 columns. */
export const doorStyleAiProfiles = mysqlTable("door_styles", {
  id: int("id").primaryKey(),
  aiProfileModel: varchar("aiProfileModel", { length: 32 }),
  aiProfileText: text("aiProfileText"),
  aiProfileImageUrl: varchar("aiProfileImageUrl", { length: 1024 }),
});

export const AI_DOOR_PROFILE_COLUMN_NAMES = ["aiProfileModel", "aiProfileText", "aiProfileImageUrl"] as const;

export const MISSING_AI_PROFILE_RECHECK_MS = 60_000;

type ExecDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

let cache: { available: boolean; checkedAt: number } | null = null;

export function resetAiDoorProfileColumnsCache(): void {
  cache = null;
}

function firstRow(result: unknown): Record<string, unknown> | null {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  const first = Array.isArray(rows) ? rows[0] : null;
  return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
}

/** True once all three 0281 columns exist. A false answer is rechecked every minute. */
export async function aiDoorProfileColumnsAvailable(db: ExecDb, now: number = Date.now()): Promise<boolean> {
  if (cache?.available) return true;
  if (cache && now - cache.checkedAt < MISSING_AI_PROFILE_RECHECK_MS) return false;
  let available = false;
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS columnCount
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'door_styles'
        AND column_name IN ('aiProfileModel', 'aiProfileText', 'aiProfileImageUrl')
    `);
    const count = Number(firstRow(result)?.columnCount ?? 0);
    available = Number.isFinite(count) && count >= AI_DOOR_PROFILE_COLUMN_NAMES.length;
  } catch (error) {
    console.warn("[ai door profile] column probe failed; treating columns as missing", error);
    available = false;
  }
  cache = { available, checkedAt: now };
  return available;
}

function isUnknownColumnError(error: unknown): boolean {
  const text = String((error as { message?: unknown })?.message ?? error);
  const code = (error as { code?: unknown })?.code;
  return code === "ER_BAD_FIELD_ERROR" || /unknown column/i.test(text);
}

export type StoredAiDoorProfile = {
  aiProfileModel: string | null;
  aiProfileText: string | null;
  aiProfileImageUrl: string | null;
};

export const EMPTY_AI_DOOR_PROFILE: StoredAiDoorProfile = {
  aiProfileModel: null,
  aiProfileText: null,
  aiProfileImageUrl: null,
};

type ProfileDb = ExecDb & { select: (...args: any[]) => any };

/** Add the AI profile fields to each style row. Never throws; missing reads as empty. */
export async function withAiDoorProfileColumns<T extends { id: number }>(
  db: ProfileDb,
  rows: T[],
): Promise<Array<T & StoredAiDoorProfile>> {
  const empty = () => rows.map((row) => ({ ...row, ...EMPTY_AI_DOOR_PROFILE }));
  if (rows.length === 0) return [];
  if (!(await aiDoorProfileColumnsAvailable(db))) return empty();
  try {
    const ids = Array.from(new Set(rows.map((row) => row.id)));
    const stored: Array<{ id: number } & StoredAiDoorProfile> = [];
    for (let start = 0; start < ids.length; start += 500) {
      const chunk = ids.slice(start, start + 500);
      const part = await db
        .select({
          id: doorStyleAiProfiles.id,
          aiProfileModel: doorStyleAiProfiles.aiProfileModel,
          aiProfileText: doorStyleAiProfiles.aiProfileText,
          aiProfileImageUrl: doorStyleAiProfiles.aiProfileImageUrl,
        })
        .from(doorStyleAiProfiles)
        .where(inArray(doorStyleAiProfiles.id, chunk));
      stored.push(...part);
    }
    const byId = new Map(stored.map((row) => [row.id, row]));
    return rows.map((row) => {
      const hit = byId.get(row.id);
      return {
        ...row,
        aiProfileModel: hit?.aiProfileModel ?? null,
        aiProfileText: hit?.aiProfileText ?? null,
        aiProfileImageUrl: hit?.aiProfileImageUrl ?? null,
      };
    });
  } catch (error) {
    if (isUnknownColumnError(error)) resetAiDoorProfileColumnsCache();
    console.warn("[ai door profile] read failed; the door keeps its catalog data", error);
    return empty();
  }
}

export const AI_DOOR_PROFILE_NOT_READY_MESSAGE =
  "The AI door profile columns are not in the database yet. Run docs/sql/0281_ai_door_profile.tidb.sql, then choose the profile again. Nothing else on this door was blocked.";

/** Persist the chosen AI profile on the style. Throws the specific not-ready message when 0281 has not run. */
export async function writeAiDoorProfile(
  db: ExecDb & { insert?: unknown },
  styleId: number,
  profile: { model: string | null; text: string | null; imageUrl: string | null },
): Promise<void> {
  if (!(await aiDoorProfileColumnsAvailable(db))) {
    throw new Error(AI_DOOR_PROFILE_NOT_READY_MESSAGE);
  }
  try {
    await db.execute(sql`
      UPDATE door_styles
      SET aiProfileModel = ${profile.model},
          aiProfileText = ${profile.text},
          aiProfileImageUrl = ${profile.imageUrl}
      WHERE id = ${styleId}
    `);
  } catch (error) {
    if (isUnknownColumnError(error)) {
      resetAiDoorProfileColumnsCache();
      throw new Error(AI_DOOR_PROFILE_NOT_READY_MESSAGE);
    }
    throw error;
  }
}

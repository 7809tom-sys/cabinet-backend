/**
 * Optional AI door profile columns on door_styles (Tom, Nov 13 2026).
 *
 * "Choose as official" kept the winning AI description and its generated image
 * in the browser only: the choice vanished on another machine and never reached
 * the Designer running anywhere else. Tom: "its not save the AI Generated images
 * even if i save".
 *
 * docs/sql/0281_ai_door_profile.tidb.sql adds aiProfileModel, aiProfileText,
 * aiProfileImageUrl, aiProfileRenderHex and aiColumns BY HAND. The 0280 episode
 * proved that declaring hand-added columns on the main `doorStyles` table breaks
 * every door style read until the migration runs, so they live on this narrow
 * table object and are only touched after the probe has seen them.
 *
 * The original three profile columns and the two later columns are probed
 * together and gated separately. A database that already has the profile text
 * and image keeps serving them when aiColumns or aiProfileRenderHex is not
 * there yet. aiColumns reads as null, and the admin list does not throw.
 */
import { inArray, sql } from "drizzle-orm";
import { int, json, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

export const AI_DOOR_COLUMN_KEYS = ["gpt", "claude", "gemini"] as const;
export type AiDoorColumnKey = (typeof AI_DOOR_COLUMN_KEYS)[number];

/** One provider column inside door_styles.aiColumns. */
export type AiDoorColumn = {
  imageUrl: string | null;
  model: string | null;
  text: string | null;
  renderHex: string | null;
  generatedAt: string;
};

/** `{ gpt?: Col, claude?: Col, gemini?: Col }`. Absent keys are omitted. */
export type AiDoorColumns = Partial<Record<AiDoorColumnKey, AiDoorColumn>>;

/** Same physical table as `doorStyles`; only the id and the 0281 columns. */
export const doorStyleAiProfiles = mysqlTable("door_styles", {
  id: int("id").primaryKey(),
  aiProfileModel: varchar("aiProfileModel", { length: 32 }),
  aiProfileText: text("aiProfileText"),
  aiProfileImageUrl: varchar("aiProfileImageUrl", { length: 1024 }),
  aiProfileRenderHex: varchar("aiProfileRenderHex", { length: 16 }),
  aiColumns: json("aiColumns").$type<AiDoorColumns | null>(),
});

export const AI_DOOR_PROFILE_COLUMN_NAMES = [
  "aiProfileModel",
  "aiProfileText",
  "aiProfileImageUrl",
] as const;

/** Every column 0281 adds. The probe asks for this exact set. */
export const AI_DOOR_PROFILE_PROBE_COLUMN_NAMES = [
  ...AI_DOOR_PROFILE_COLUMN_NAMES,
  "aiProfileRenderHex",
  "aiColumns",
] as const;

export const MISSING_AI_PROFILE_RECHECK_MS = 60_000;

export const AI_DOOR_PROFILE_NOT_READY_MESSAGE =
  "The AI door profile columns are not in the database yet. Run docs/sql/0281_ai_door_profile.tidb.sql, then choose the profile again. Nothing else on this door was blocked.";

export const AI_DOOR_COLUMNS_NOT_READY_MESSAGE =
  "The AI door columns are not in the database yet. Run docs/sql/0281_ai_door_profile.tidb.sql.";

export const AI_DOOR_STYLE_NOT_FOUND_MESSAGE = "Door style not found.";

type ExecDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

export type AiDoorProfileColumnPresence = {
  /** The original three profile columns are all present. */
  profile: boolean;
  /** aiProfileRenderHex is present. */
  renderHex: boolean;
  /** aiColumns is present. */
  aiColumns: boolean;
};

const NO_COLUMNS: AiDoorProfileColumnPresence = {
  profile: false,
  renderHex: false,
  aiColumns: false,
};

let cache: { presence: AiDoorProfileColumnPresence; checkedAt: number } | null =
  null;

export function resetAiDoorProfileColumnsCache(): void {
  cache = null;
}

function firstRow(result: unknown): Record<string, unknown> | null {
  const rows =
    Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  const first = Array.isArray(rows) ? rows[0] : null;
  return first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : null;
}

function resultRows(result: unknown): Array<Record<string, unknown>> {
  const rows =
    Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row)
  );
}

function asCount(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

function flag(row: Record<string, unknown> | null, name: string): boolean {
  if (!row) return false;
  if (Object.prototype.hasOwnProperty.call(row, name))
    return asCount(row[name]) >= 1;
  const match = Object.entries(row).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  );
  return asCount(match?.[1]) >= 1;
}

function presenceFromRow(
  row: Record<string, unknown> | null
): AiDoorProfileColumnPresence {
  return {
    profile: AI_DOOR_PROFILE_COLUMN_NAMES.every(name => flag(row, name)),
    renderHex: flag(row, "aiProfileRenderHex"),
    aiColumns: flag(row, "aiColumns"),
  };
}

/** A column that has been seen stays seen. A missing one is asked again after the recheck interval. */
function mergePresence(
  previous: AiDoorProfileColumnPresence | null,
  next: AiDoorProfileColumnPresence
): AiDoorProfileColumnPresence {
  if (!previous) return next;
  return {
    profile: previous.profile || next.profile,
    renderHex: previous.renderHex || next.renderHex,
    aiColumns: previous.aiColumns || next.aiColumns,
  };
}

/**
 * Which 0281 columns exist. A complete answer is cached for the life of the
 * process. A partial answer is rechecked every minute, so a column Tom adds
 * later turns on without a redeploy. Any probe error keeps the last answer
 * and never throws.
 */
export async function aiDoorProfileColumnPresence(
  db: ExecDb,
  now: number = Date.now()
): Promise<AiDoorProfileColumnPresence> {
  if (cache) {
    const { presence } = cache;
    if (presence.profile && presence.renderHex && presence.aiColumns)
      return presence;
    if (now - cache.checkedAt < MISSING_AI_PROFILE_RECHECK_MS) return presence;
  }
  try {
    const result = await db.execute(sql`
      SELECT
        SUM(column_name = 'aiProfileModel') AS aiProfileModel,
        SUM(column_name = 'aiProfileText') AS aiProfileText,
        SUM(column_name = 'aiProfileImageUrl') AS aiProfileImageUrl,
        SUM(column_name = 'aiProfileRenderHex') AS aiProfileRenderHex,
        SUM(column_name = 'aiColumns') AS aiColumns
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'door_styles'
        AND column_name IN ('aiProfileModel', 'aiProfileText', 'aiProfileImageUrl', 'aiProfileRenderHex', 'aiColumns')
    `);
    const presence = mergePresence(
      cache?.presence ?? null,
      presenceFromRow(firstRow(result))
    );
    cache = { presence, checkedAt: now };
    return presence;
  } catch (error) {
    console.warn(
      "[ai door profile] column probe failed; keeping the last answer",
      error
    );
    const presence = cache?.presence ?? NO_COLUMNS;
    cache = { presence, checkedAt: now };
    return presence;
  }
}

/** True once aiProfileModel, aiProfileText and aiProfileImageUrl all exist. */
export async function aiDoorProfileColumnsAvailable(
  db: ExecDb,
  now: number = Date.now()
): Promise<boolean> {
  return (await aiDoorProfileColumnPresence(db, now)).profile;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      message?: unknown;
      sqlMessage?: unknown;
      cause?: unknown;
    };
    if (typeof record.message === "string") parts.push(record.message);
    if (typeof record.sqlMessage === "string") parts.push(record.sqlMessage);
    current = record.cause;
  }
  if (parts.length === 0) parts.push(String(error));
  return parts.join(" ");
}

function isUnknownColumnError(error: unknown): boolean {
  const record = error as { code?: unknown; cause?: { code?: unknown } };
  const code = record?.code ?? record?.cause?.code;
  return (
    code === "ER_BAD_FIELD_ERROR" || /unknown column/i.test(errorText(error))
  );
}

export type StoredAiDoorProfile = {
  aiProfileModel: string | null;
  aiProfileText: string | null;
  aiProfileImageUrl: string | null;
  aiProfileRenderHex: string | null;
  aiColumns: AiDoorColumns | null;
};

export const EMPTY_AI_DOOR_PROFILE: StoredAiDoorProfile = {
  aiProfileModel: null,
  aiProfileText: null,
  aiProfileImageUrl: null,
  aiProfileRenderHex: null,
  aiColumns: null,
};

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseJsonValue(value: unknown): unknown {
  let current = value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(current))
    current = current.toString("utf8");
  for (
    let attempt = 0;
    attempt < 2 && typeof current === "string";
    attempt += 1
  ) {
    const trimmed = current.trim();
    if (!trimmed) return null;
    try {
      current = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  return current;
}

function parseAiDoorColumn(value: unknown): AiDoorColumn | null {
  const raw = parseJsonValue(value);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const column: AiDoorColumn = {
    imageUrl: nullableString(row.imageUrl),
    model: nullableString(row.model),
    text: nullableString(row.text),
    renderHex: nullableString(row.renderHex),
    generatedAt: nullableString(row.generatedAt) ?? "",
  };
  const hasPayload =
    column.imageUrl ||
    column.model ||
    column.text ||
    column.renderHex ||
    column.generatedAt;
  return hasPayload ? column : null;
}

/** Read aiColumns. Null when the value is missing, empty, or not the agreed object. Never throws. */
export function parseAiDoorColumns(value: unknown): AiDoorColumns | null {
  const raw = parseJsonValue(value);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const columns: AiDoorColumns = {};
  for (const key of AI_DOOR_COLUMN_KEYS) {
    const column = parseAiDoorColumn(source[key]);
    if (column) columns[key] = column;
  }
  return Object.keys(columns).length > 0 ? columns : null;
}

export function cleanNullableText(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** `#rrggbb` when the value is a 6-digit hex. Any other non-empty string is kept trimmed. */
export function cleanRenderHex(
  value: string | null | undefined
): string | null {
  const trimmed = cleanNullableText(value);
  if (!trimmed) return null;
  const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : trimmed;
}

function catalogRenderHex(value: string | null): string | null {
  return value && /^#[0-9a-f]{6}$/.test(value) ? value : null;
}

type ProfileDb = ExecDb & { select: (...args: any[]) => any };

function withEmptyProfile<T extends { id: number }>(
  rows: T[]
): Array<T & StoredAiDoorProfile> {
  return rows.map(row => ({ ...row, ...EMPTY_AI_DOOR_PROFILE }));
}

/** Add the AI profile fields to each style row. Never throws; missing reads as empty. */
export async function withAiDoorProfileColumns<T extends { id: number }>(
  db: ProfileDb,
  rows: T[]
): Promise<Array<T & StoredAiDoorProfile>> {
  if (rows.length === 0) return [];
  const presence = await aiDoorProfileColumnPresence(db);
  if (!presence.profile && !presence.renderHex && !presence.aiColumns)
    return withEmptyProfile(rows);
  try {
    const ids = Array.from(new Set(rows.map(row => row.id)));
    const stored: Array<Record<string, unknown> & { id: number }> = [];
    const shape: Record<string, unknown> = { id: doorStyleAiProfiles.id };
    if (presence.profile) {
      shape.aiProfileModel = doorStyleAiProfiles.aiProfileModel;
      shape.aiProfileText = doorStyleAiProfiles.aiProfileText;
      shape.aiProfileImageUrl = doorStyleAiProfiles.aiProfileImageUrl;
    }
    if (presence.renderHex)
      shape.aiProfileRenderHex = doorStyleAiProfiles.aiProfileRenderHex;
    if (presence.aiColumns) shape.aiColumns = doorStyleAiProfiles.aiColumns;
    for (let start = 0; start < ids.length; start += 500) {
      const chunk = ids.slice(start, start + 500);
      const part = await db
        .select(shape)
        .from(doorStyleAiProfiles)
        .where(inArray(doorStyleAiProfiles.id, chunk));
      stored.push(...(part as Array<Record<string, unknown> & { id: number }>));
    }
    const byId = new Map(stored.map(row => [Number(row.id), row]));
    return rows.map(row => {
      const hit = byId.get(row.id);
      return {
        ...row,
        aiProfileModel: presence.profile
          ? nullableString(hit?.aiProfileModel)
          : null,
        aiProfileText: presence.profile
          ? nullableString(hit?.aiProfileText)
          : null,
        aiProfileImageUrl: presence.profile
          ? nullableString(hit?.aiProfileImageUrl)
          : null,
        aiProfileRenderHex: presence.renderHex
          ? nullableString(hit?.aiProfileRenderHex)
          : null,
        aiColumns: presence.aiColumns
          ? parseAiDoorColumns(hit?.aiColumns)
          : null,
      };
    });
  } catch (error) {
    if (isUnknownColumnError(error)) resetAiDoorProfileColumnsCache();
    console.warn(
      "[ai door profile] read failed; the door keeps its catalog data",
      error
    );
    return withEmptyProfile(rows);
  }
}

/** Persist the chosen AI profile on the style. Throws the specific not-ready message when the profile columns are absent. */
export async function writeAiDoorProfile(
  db: ExecDb,
  styleId: number,
  profile: {
    model: string | null;
    text: string | null;
    imageUrl: string | null;
    renderHex?: string | null;
  }
): Promise<void> {
  const presence = await aiDoorProfileColumnPresence(db);
  if (!presence.profile) throw new Error(AI_DOOR_PROFILE_NOT_READY_MESSAGE);
  const hexProvided = profile.renderHex !== undefined;
  const storedHex = hexProvided ? cleanRenderHex(profile.renderHex) : null;
  const paintedHex = catalogRenderHex(storedHex);
  try {
    if (presence.renderHex && hexProvided) {
      await db.execute(sql`
        UPDATE door_styles
        SET aiProfileModel = ${profile.model},
            aiProfileText = ${profile.text},
            aiProfileImageUrl = ${profile.imageUrl},
            aiProfileRenderHex = ${storedHex},
            renderHex = COALESCE(${paintedHex}, renderHex)
        WHERE id = ${styleId}
      `);
      return;
    }
    await db.execute(sql`
      UPDATE door_styles
      SET aiProfileModel = ${profile.model},
          aiProfileText = ${profile.text},
          aiProfileImageUrl = ${profile.imageUrl},
          renderHex = COALESCE(${paintedHex}, renderHex)
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

function columnJsonPath(column: AiDoorColumnKey): ReturnType<typeof sql.raw> {
  switch (column) {
    case "gpt":
      return sql.raw("'$.gpt'");
    case "claude":
      return sql.raw("'$.claude'");
    case "gemini":
      return sql.raw("'$.gemini'");
  }
}

function columnCell(input: {
  imageUrl?: string | null;
  model?: string | null;
  text?: string | null;
  renderHex?: string | null;
  generatedAt?: string;
}): AiDoorColumn {
  return {
    imageUrl: cleanNullableText(input.imageUrl),
    model: cleanNullableText(input.model),
    text: cleanNullableText(input.text),
    renderHex: cleanRenderHex(input.renderHex),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

/**
 * Merge one provider column into door_styles.aiColumns. The other providers
 * stay as they are. Throws when aiColumns has not been added yet.
 */
export async function writeAiDoorColumn(
  db: ExecDb,
  styleId: number,
  input: {
    column: AiDoorColumnKey;
    imageUrl?: string | null;
    model?: string | null;
    text?: string | null;
    renderHex?: string | null;
    generatedAt?: string;
  }
): Promise<AiDoorColumns> {
  const presence = await aiDoorProfileColumnPresence(db);
  if (!presence.aiColumns) throw new Error(AI_DOOR_COLUMNS_NOT_READY_MESSAGE);
  const cell = columnCell(input);
  const payload = JSON.stringify(cell);
  try {
    const existing = resultRows(
      await db.execute(sql`
      SELECT id, aiColumns
      FROM door_styles
      WHERE id = ${styleId}
      LIMIT 1
    `)
    );
    if (existing.length === 0) throw new Error(AI_DOOR_STYLE_NOT_FOUND_MESSAGE);
    await db.execute(sql`
      UPDATE door_styles
      SET aiColumns = JSON_SET(COALESCE(aiColumns, JSON_OBJECT()), ${columnJsonPath(input.column)}, CAST(${payload} AS JSON))
      WHERE id = ${styleId}
    `);
    const after = resultRows(
      await db.execute(sql`
      SELECT aiColumns
      FROM door_styles
      WHERE id = ${styleId}
      LIMIT 1
    `)
    );
    return {
      ...(parseAiDoorColumns(after[0]?.aiColumns) ?? {}),
      [input.column]: cell,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === AI_DOOR_STYLE_NOT_FOUND_MESSAGE
    )
      throw error;
    if (isUnknownColumnError(error)) {
      resetAiDoorProfileColumnsCache();
      throw new Error(AI_DOOR_COLUMNS_NOT_READY_MESSAGE);
    }
    throw error;
  }
}

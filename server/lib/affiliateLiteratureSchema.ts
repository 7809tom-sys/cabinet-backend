/**
 * `cabinet_dealz.affiliate_literature` carries four columns that the server
 * never creates itself: `visibility`, `affiliateToggledAt`,
 * `affiliateToggledBy` and `affiliateToggledByName`. They are added by hand in
 * docs/sql/0255 and docs/sql/0269, and the deploy does not wait for them.
 *
 * Drizzle's `select()` names every column on the table, so a deploy that lands
 * before the ALTERs makes every library read fail inside TiDB with
 * "Unknown column 'affiliate_literature.visibility' in 'field list'"
 * (ER_BAD_FIELD_ERROR / errno 1054). tRPC has no logger of its own, so that
 * answer reached the admin library as a bare HTTP 500 with nothing in the
 * runtime log to explain it.
 *
 * This module is the one place that knows which library columns are optional.
 * A read asks only for the columns that exist, drops the ones TiDB reports
 * absent, and fills the documented default: internal, never toggled. When the
 * columns are present, every value is passed through untouched, so the library
 * reads exactly as it did before the columns were introduced.
 */
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import {
  isLibraryVisibility,
  normalizeLibraryVisibility,
  type LibraryVisibility,
} from "@shared/libraryVisibility";
import { affiliateLiterature } from "../../drizzle/schema";

/** The file that adds the four columns. Tom runs it; the server never does. */
export const LIBRARY_VISIBILITY_MIGRATION =
  "docs/sql/0269_library_visibility_columns.tidb.sql";

/** Shown to an admin who asks for a column TiDB does not have yet. */
export const LIBRARY_VISIBILITY_MESSAGE =
  `The library visibility columns are missing from affiliate_literature. Run ${LIBRARY_VISIBILITY_MIGRATION} in TiDB, then try again.`;

export const LIBRARY_OPTIONAL_COLUMNS = [
  "visibility",
  "affiliateToggledAt",
  "affiliateToggledBy",
  "affiliateToggledByName",
] as const;

export type LibraryOptionalColumn = (typeof LIBRARY_OPTIONAL_COLUMNS)[number];

const COLUMN_LABELS: Record<LibraryOptionalColumn, string> = {
  visibility: "visibility",
  affiliateToggledAt: "affiliateToggledAt",
  affiliateToggledBy: "affiliateToggledBy",
  affiliateToggledByName: "affiliateToggledByName",
};

/**
 * Every column that has existed since the table was created. These are never
 * treated as optional: if one of them is missing, the library really is broken
 * and the driver error must surface.
 */
const BASE_COLUMNS: Record<string, MySqlColumn> = {
  id: affiliateLiterature.id,
  title: affiliateLiterature.title,
  description: affiliateLiterature.description,
  category: affiliateLiterature.category,
  filename: affiliateLiterature.filename,
  fileKey: affiliateLiterature.fileKey,
  url: affiliateLiterature.url,
  mimeType: affiliateLiterature.mimeType,
  sizeBytes: affiliateLiterature.sizeBytes,
  isPublished: affiliateLiterature.isPublished,
  sortOrder: affiliateLiterature.sortOrder,
  uploadedBy: affiliateLiterature.uploadedBy,
  createdAt: affiliateLiterature.createdAt,
  updatedAt: affiliateLiterature.updatedAt,
};

const OPTIONAL_COLUMN_DEFINITIONS: Record<LibraryOptionalColumn, MySqlColumn> = {
  visibility: affiliateLiterature.visibility,
  affiliateToggledAt: affiliateLiterature.affiliateToggledAt,
  affiliateToggledBy: affiliateLiterature.affiliateToggledBy,
  affiliateToggledByName: affiliateLiterature.affiliateToggledByName,
};

/**
 * The projection for a read. Asking for named columns instead of `*` is what
 * lets the optional four be left out; the base fourteen are always included so
 * the row still carries every field the admin page and the affiliate read use.
 */
export function literatureColumns(
  include: readonly LibraryOptionalColumn[] = LIBRARY_OPTIONAL_COLUMNS,
): Record<string, MySqlColumn> {
  const columns = { ...BASE_COLUMNS };
  for (const name of include) columns[name] = OPTIONAL_COLUMN_DEFINITIONS[name];
  return columns;
}

/** One library row, always fully shaped: a missing optional column reads as its default. */
export type LibraryDocumentRow = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  filename: string;
  fileKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  isPublished: boolean;
  sortOrder: number;
  uploadedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  visibility: LibraryVisibility;
  affiliateToggledAt: Date | null;
  affiliateToggledBy: number | null;
  affiliateToggledByName: string | null;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * A `visibility` value the column cannot hold is treated as internal, which is
 * what `normalizeLibraryVisibility` already does everywhere else: a hand-edited
 * row can hide a document from affiliates but never widen access.
 */
function asVisibility(value: unknown): LibraryVisibility {
  return isLibraryVisibility(value) ? value : normalizeLibraryVisibility(value);
}

export function toLibraryDocumentRow(
  row: Record<string, unknown>,
  missing: readonly LibraryOptionalColumn[] = [],
): LibraryDocumentRow {
  const absent = new Set<LibraryOptionalColumn>(missing);
  const now = new Date(0);
  return {
    id: asNumber(row.id) ?? 0,
    title: asText(row.title, ""),
    description: typeof row.description === "string" ? row.description : null,
    category: asText(row.category, "General"),
    filename: asText(row.filename, ""),
    fileKey: asText(row.fileKey, ""),
    url: asText(row.url, ""),
    mimeType: asText(row.mimeType, "application/pdf"),
    sizeBytes: asNumber(row.sizeBytes),
    isPublished: row.isPublished === true || asNumber(row.isPublished) === 1,
    sortOrder: asNumber(row.sortOrder) ?? 0,
    uploadedBy: asNumber(row.uploadedBy),
    createdAt: asDate(row.createdAt, now),
    updatedAt: asDate(row.updatedAt, now),
    visibility: absent.has("visibility") ? "internal" : asVisibility(row.visibility),
    affiliateToggledAt: absent.has("affiliateToggledAt") ? null : toNullableDate(row.affiliateToggledAt),
    affiliateToggledBy: absent.has("affiliateToggledBy") ? null : asNumber(row.affiliateToggledBy),
    affiliateToggledByName: absent.has("affiliateToggledByName")
      ? null
      : typeof row.affiliateToggledByName === "string"
        ? row.affiliateToggledByName
        : null,
  };
}

function toNullableDate(value: unknown): Date | null {
  if (value == null) return null;
  const parsed = asDate(value, new Date(Number.NaN));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ─── Detecting the missing columns ───────────────────────────────────────────

type SchemaErrorRow = {
  code?: unknown;
  errno?: unknown;
  sqlState?: unknown;
  message?: unknown;
  sqlMessage?: unknown;
  cause?: unknown;
};

function schemaErrorRows(error: unknown): SchemaErrorRow[] {
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

function errnoOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

/**
 * Which optional library columns the driver named in an "unknown column" error.
 * Empty means this was not that kind of failure, so the caller must rethrow.
 */
export function missingLiteratureColumns(error: unknown): LibraryOptionalColumn[] {
  const found = new Set<LibraryOptionalColumn>();
  for (const row of schemaErrorRows(error)) {
    const errno = errnoOf(row.errno);
    const isBadField =
      row.code === "ER_BAD_FIELD_ERROR" ||
      errno === 1054 ||
      row.sqlState === "42S22" ||
      /unknown column|ER_BAD_FIELD_ERROR|no such column/i.test(
        [row.message, row.sqlMessage]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    if (!isBadField) continue;
    const text = [row.message, row.sqlMessage]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    for (const name of LIBRARY_OPTIONAL_COLUMNS) {
      if (new RegExp(`\\b${COLUMN_LABELS[name]}\\b`, "i").test(text)) found.add(name);
    }
  }
  return Array.from(found);
}

export function isMissingLiteratureColumnError(error: unknown): boolean {
  return missingLiteratureColumns(error).length > 0;
}

// ─── Remembering what this process has learned ───────────────────────────────

const PRESENT_TTL_MS = 5 * 60 * 1000;
const MISSING_TTL_MS = 30 * 1000;

type CacheEntry = { missing: LibraryOptionalColumn[]; expiresAt: number };

let cache: CacheEntry | null = null;

export function resetAffiliateLiteratureSchemaCache(): void {
  cache = null;
}

export function knownMissingLiteratureColumns(now = Date.now()): LibraryOptionalColumn[] {
  if (!cache || cache.expiresAt <= now) return [];
  return Array.from(cache.missing);
}

/**
 * A miss is remembered briefly so an unapplied ALTER costs one failed statement
 * rather than one per request, and a hit is remembered longer because dropping
 * a column mid-flight is not something this app does.
 */
export function rememberMissingLiteratureColumns(
  missing: readonly LibraryOptionalColumn[],
  now = Date.now(),
): void {
  const unique = LIBRARY_OPTIONAL_COLUMNS.filter((name) => missing.includes(name));
  cache = {
    missing: unique,
    expiresAt: now + (unique.length ? MISSING_TTL_MS : PRESENT_TTL_MS),
  };
}

function describe(columns: readonly LibraryOptionalColumn[]): string {
  return columns.map((name) => COLUMN_LABELS[name]).join(", ");
}

// ─── Reading ─────────────────────────────────────────────────────────────────

type LiteratureQuery = (fields: Record<string, MySqlColumn>) => Promise<Array<Record<string, unknown>>>;

/**
 * Read the whole library. A column TiDB does not have is dropped from the
 * statement and read as its default, so the admin list keeps working through a
 * deploy-before-migration window instead of answering 500.
 */
export async function readLiteratureRows(
  query: LiteratureQuery,
  now = Date.now(),
): Promise<LibraryDocumentRow[]> {
  const missing = new Set<LibraryOptionalColumn>(knownMissingLiteratureColumns(now));
  // One attempt, plus one per optional column, is enough to drop them all.
  for (let attempt = 0; attempt <= LIBRARY_OPTIONAL_COLUMNS.length; attempt += 1) {
    const include = LIBRARY_OPTIONAL_COLUMNS.filter((name) => !missing.has(name));
    try {
      const rows = await query(literatureColumns(include));
      if (missing.size) rememberMissingLiteratureColumns(Array.from(missing), now);
      return rows.map((row) => toLibraryDocumentRow(row, Array.from(missing)));
    } catch (error) {
      const discovered = missingLiteratureColumns(error).filter((name) => !missing.has(name));
      if (!discovered.length) throw error;
      for (const name of discovered) missing.add(name);
      console.warn(
        `[affiliate-literature] affiliate_literature is missing ${describe(discovered)}. ` +
          `Reading the library without it and defaulting to internal. Run ${LIBRARY_VISIBILITY_MIGRATION}.`,
      );
    }
  }
  throw new Error(
    `affiliate_literature is still unreadable after dropping ${describe(LIBRARY_OPTIONAL_COLUMNS)}. Run ${LIBRARY_VISIBILITY_MIGRATION}.`,
  );
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export type LibraryOptionalWrite = {
  visibility?: LibraryVisibility;
  affiliateToggledAt?: Date | null;
  affiliateToggledBy?: number | null;
  affiliateToggledByName?: string | null;
};

/** The same values, minus any key the database has said it cannot store. */
export function stripMissingLibraryColumns<T extends Record<string, unknown> & LibraryOptionalWrite>(
  values: T,
  missing: readonly LibraryOptionalColumn[],
): T {
  const next = { ...values };
  for (const name of missing) delete next[name];
  return next;
}

/** Thrown when the write needs a column TiDB does not have. */
export class LibrarySchemaError extends Error {
  readonly columns: LibraryOptionalColumn[];

  constructor(columns: readonly LibraryOptionalColumn[]) {
    super(LIBRARY_VISIBILITY_MESSAGE);
    this.name = "LibrarySchemaError";
    this.columns = Array.from(columns);
  }
}

/**
 * Run an insert or an update, retrying once per column TiDB reports missing.
 * `requireColumns` names the columns the caller's intent depends on: if one of
 * those has to be dropped, nothing is written and `LibrarySchemaError` is thrown
 * so the admin sees which SQL file to run instead of a silent no-op.
 *
 * A failed insert or update is not applied, so the retry cannot double-write.
 */
export async function writeLiteratureRow<T>(
  options: {
    procedure: string;
    values: Record<string, unknown> & LibraryOptionalWrite;
    requireColumns?: readonly LibraryOptionalColumn[];
    write: (values: Record<string, unknown> & LibraryOptionalWrite) => Promise<T>;
    now?: number;
  },
): Promise<T> {
  const now = options.now ?? Date.now();
  const required = new Set(options.requireColumns ?? []);
  const missing = new Set<LibraryOptionalColumn>(knownMissingLiteratureColumns(now));
  for (let attempt = 0; attempt <= LIBRARY_OPTIONAL_COLUMNS.length; attempt += 1) {
    const missingRequired = Array.from(required).filter((name) => missing.has(name));
    if (missingRequired.length) throw new LibrarySchemaError(missingRequired);
    try {
      const written = await options.write(stripMissingLibraryColumns(options.values, Array.from(missing)));
      // A write that had to leave a column out proves the column is still absent.
      if (missing.size) rememberMissingLiteratureColumns(Array.from(missing), now);
      return written;
    } catch (error) {
      const discovered = missingLiteratureColumns(error).filter((name) => !missing.has(name));
      if (!discovered.length) throw error;
      for (const name of discovered) missing.add(name);
      console.warn(
        `[affiliate-literature] ${options.procedure} could not write ${describe(discovered)}; ` +
          `affiliate_literature does not have it yet. Run ${LIBRARY_VISIBILITY_MIGRATION}.`,
      );
    }
  }
  throw new LibrarySchemaError(Array.from(missing));
}

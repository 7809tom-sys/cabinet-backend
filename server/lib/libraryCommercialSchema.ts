/** The file the owner pastes. The server never runs it. */
export const LIBRARY_COMMERCIALS_MIGRATION = "docs/sql/0273_library_commercials_content_hash.tidb.sql";

export const LIBRARY_DUPLICATE_QUERY = "docs/sql/0274_library_duplicate_files_readonly.tidb.sql";

/**
 * Thrown when a commercials action needs the hand-run SQL and it is not there.
 * Callers turn this into PRECONDITION_FAILED. It is never a reason to delete a file.
 */
export class LibraryCommercialSchemaError extends Error {
  constructor() {
    super(
      `The commercials library is not set up yet. Run ${LIBRARY_COMMERCIALS_MIGRATION} in TiDB. Nothing was posted and no file was deleted.`,
    );
    this.name = "LibraryCommercialSchemaError";
  }
}

type SchemaErrorRow = {
  code?: unknown;
  errno?: unknown;
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

function errorText(error: unknown): string {
  return schemaErrorRows(error)
    .flatMap((row) => [row.message, row.sqlMessage, row.code])
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function errnoOf(error: unknown): number | null {
  for (const row of schemaErrorRows(error)) {
    if (typeof row.errno === "number") return row.errno;
    if (typeof row.errno === "string" && /^\d+$/.test(row.errno)) return Number(row.errno);
  }
  return null;
}

/** True when TiDB named this column as unknown. A deadlock or a missing base column is not this. */
export function isUnknownNamedColumn(error: unknown, column: string): boolean {
  const text = errorText(error);
  const errno = errnoOf(error);
  const badField = errno === 1054 || /unknown column|ER_BAD_FIELD_ERROR/i.test(text);
  if (!badField) return false;
  return new RegExp(`\\b${column}\\b`, "i").test(text);
}

/** True for a missing commercials column or a missing commercials table. */
export function isCommercialSchemaMiss(error: unknown): boolean {
  const text = errorText(error);
  const errno = errnoOf(error);
  if (errno === 1054 || errno === 1146) return true;
  if (/ER_BAD_FIELD_ERROR|ER_NO_SUCH_TABLE|unknown column/i.test(text)) return true;
  return /table/i.test(text) && /doesn't exist|does not exist/i.test(text);
}

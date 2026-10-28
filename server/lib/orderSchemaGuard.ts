import { TRPCError } from "@trpc/server";

/**
 * Messages returned to admins when a distributor-order action needs the SQL
 * that adds order trail columns, order_distributor_emails, or crm_deals.stage
 * 'new_sale'. Live reads and checkout do not throw these.
 */
export const ORDER_SCHEMA_MESSAGES = {
  trail:
    "Order status columns are missing on order_requests. Run the distributor order email SQL before marking an order verified, shipped, or signed.",
  newSale:
    "crm_deals.stage does not include new_sale yet. Run the distributor order email SQL before using New Sale.",
  distributorEmails:
    "The order_distributor_emails table is missing. Run the distributor order email SQL. The distributor email can still be sent; the per-distributor log is stored after that SQL.",
} as const;

export type OrderSchemaActionResult =
  | { ok: true }
  | { ok: false; schemaMissing: boolean; message: string };

export function schemaErrorMessage(error: unknown): string {
  const parts: string[] = [];
  for (const row of schemaErrorRows(error)) {
    if (typeof row.message === "string" && row.message.trim()) parts.push(row.message.trim());
    if (typeof row.sqlMessage === "string" && row.sqlMessage.trim()) parts.push(row.sqlMessage.trim());
  }
  if (parts.length > 0) return parts[0];
  return error instanceof Error ? error.message : String(error);
}

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

const MISSING_SCHEMA_TEXT = /unknown column|ER_BAD_FIELD_ERROR|ER_NO_SUCH_TABLE|doesn't exist|does not exist|no such table|no such column/i;
const MISSING_SCHEMA_CODES = new Set(["ER_BAD_FIELD_ERROR", "ER_NO_SUCH_TABLE"]);
const MISSING_SCHEMA_ERRNOS = new Set([1054, 1146]);
const MISSING_SCHEMA_STATES = new Set(["42S22", "42S02"]);

/**
 * True when MySQL/TiDB rejected a statement because a column or table from an
 * unapplied migration is absent. Walks Drizzle's Failed-query wrapper into the
 * driver error, which keeps the code and sqlMessage on `cause`.
 */
export function isMissingSchemaError(error: unknown): boolean {
  for (const row of schemaErrorRows(error)) {
    if (typeof row.code === "string" && MISSING_SCHEMA_CODES.has(row.code)) return true;
    const errno = errnoOf(row.errno);
    if (errno != null && MISSING_SCHEMA_ERRNOS.has(errno)) return true;
    if (typeof row.sqlState === "string" && MISSING_SCHEMA_STATES.has(row.sqlState)) return true;
    const text = [row.message, row.sqlMessage].filter((part): part is string => typeof part === "string").join(" ");
    if (MISSING_SCHEMA_TEXT.test(text)) return true;
  }
  return false;
}

const ENUM_VALUE_TEXT = /data truncated|incorrect (string |integer |enum )?value|invalid enum|enum value/i;
const ENUM_VALUE_CODES = new Set([
  "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD",
  "WARN_DATA_TRUNCATED",
  "ER_TRUNCATED_WRONG_VALUE",
  "ER_WRONG_VALUE_FOR_TYPE",
]);
const ENUM_VALUE_ERRNOS = new Set([1265, 1366]);

/**
 * True when a stage write was rejected because the value is not in the live
 * enum. Used to avoid treating that rejection as an unexpected 500.
 */
export function isEnumValueError(error: unknown): boolean {
  for (const row of schemaErrorRows(error)) {
    if (typeof row.code === "string" && ENUM_VALUE_CODES.has(row.code)) return true;
    const errno = errnoOf(row.errno);
    if (errno != null && ENUM_VALUE_ERRNOS.has(errno)) return true;
    const text = [row.message, row.sqlMessage].filter((part): part is string => typeof part === "string").join(" ");
    if (ENUM_VALUE_TEXT.test(text)) return true;
  }
  return false;
}

/** Admin procedures throw this. Background order flows keep the result instead. */
export function orderSchemaProcedureError(result: OrderSchemaActionResult): TRPCError | null {
  if (result.ok) return null;
  return new TRPCError({
    code: result.schemaMissing ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR",
    message: result.message,
  });
}

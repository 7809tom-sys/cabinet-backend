import { sql, type SQLWrapper } from "drizzle-orm";

/**
 * One cached look at information_schema so catalog and order code can tell
 * whether the distributor-order SQL has been applied. A complete result is
 * kept for several minutes. A missing or failed look is kept briefly so the
 * next request sees the columns soon after the SQL is run, without probing
 * on every admin page load.
 */
export const ORDER_SCHEMA_PRESENT_TTL_MS = 5 * 60 * 1000;
export const ORDER_SCHEMA_MISSING_TTL_MS = 30 * 1000;

export const ORDER_REQUEST_PROBE_COLUMNS = [
  "id",
  "distributorEmailStatus",
  "distributorEmailSentAt",
  "distributorEmailTo",
  "distributorEmailError",
  "orderVerifiedAt",
  "orderVerifiedBy",
  "orderShippedAt",
  "orderShippedBy",
  "shipmentCarrier",
  "shipmentTracking",
  "orderSignedAt",
  "orderSignedBy",
  "signerName",
  "crmSyncStatus",
  "crmSyncError",
  "crmDealId",
  "imageGeneratedCount",
  "lastImageGeneratedAt",
] as const;

export const ORDER_TRAIL_COLUMNS = ORDER_REQUEST_PROBE_COLUMNS.filter((column) => column !== "id");

export type OrderSchemaSupport = {
  columns: ReadonlySet<string>;
  stageType: string | null;
};

type CacheEntry = { support: OrderSchemaSupport | null; expiresAt: number };

let cache: CacheEntry | null = null;

export function resetOrderSchemaSupportCache(): void {
  cache = null;
}

function inList(values: readonly string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

const PROBE = sql`
  SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND (
      (TABLE_NAME = 'order_requests' AND COLUMN_NAME IN (${inList(ORDER_REQUEST_PROBE_COLUMNS)}))
      OR (TABLE_NAME = 'order_distributor_emails' AND COLUMN_NAME = 'orderRequestId')
      OR (TABLE_NAME = 'crm_deals' AND COLUMN_NAME IN ('stage', 'saleRefundedAt'))
    )
`;

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object") return result as Array<Record<string, unknown>>;
  }
  return [];
}

function field(row: Record<string, unknown>, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() !== target || value == null) continue;
    return String(value);
  }
  return "";
}

/**
 * Returns null when the probe did not see order_requests at all (wrong
 * database, or information_schema returned nothing). Callers then try the
 * real statement and catch a missing column, instead of treating every
 * feature as absent.
 */
export function orderSchemaSupportFromColumnRows(rows: Array<Record<string, unknown>>): OrderSchemaSupport | null {
  const columns = new Set<string>();
  let stageType: string | null = null;
  let sawOrderRequests = false;
  for (const row of rows) {
    const table = field(row, "tableName").toLowerCase();
    const column = field(row, "columnName").toLowerCase();
    if (!table || !column) continue;
    columns.add(`${table}.${column}`);
    if (table === "order_requests") sawOrderRequests = true;
    if (table === "crm_deals" && column === "stage") stageType = field(row, "columnType");
  }
  if (!sawOrderRequests) return null;
  return { columns, stageType };
}

export function columnPresent(support: OrderSchemaSupport, table: string, column: string): boolean {
  return support.columns.has(`${table}.${column}`.toLowerCase());
}

export function hasAllColumns(support: OrderSchemaSupport, table: string, columns: readonly string[]): boolean {
  return columns.every((column) => columnPresent(support, table, column));
}

export function newSaleStagePresent(support: OrderSchemaSupport): boolean {
  return /'new_sale'/i.test(support.stageType ?? "");
}

export function orderSchemaSupportIsComplete(support: OrderSchemaSupport): boolean {
  return hasAllColumns(support, "order_requests", ORDER_TRAIL_COLUMNS)
    && columnPresent(support, "order_distributor_emails", "orderRequestId")
    && newSaleStagePresent(support)
    && columnPresent(support, "crm_deals", "saleRefundedAt");
}

export async function readOrderSchemaSupport(
  db: { execute: (query: SQLWrapper) => Promise<unknown> },
  now = Date.now(),
): Promise<OrderSchemaSupport | null> {
  if (cache && cache.expiresAt > now) return cache.support;
  try {
    const support = orderSchemaSupportFromColumnRows(rowsFrom(await db.execute(PROBE)));
    const complete = support != null && orderSchemaSupportIsComplete(support);
    cache = {
      support,
      expiresAt: now + (complete ? ORDER_SCHEMA_PRESENT_TTL_MS : ORDER_SCHEMA_MISSING_TTL_MS),
    };
    return support;
  } catch (error) {
    cache = { support: null, expiresAt: now + ORDER_SCHEMA_MISSING_TTL_MS };
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[OrderSchema] Could not read information_schema. Queries will fall back to the live statement. ${message}`);
    return null;
  }
}

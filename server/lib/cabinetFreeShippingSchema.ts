/**
 * cabinets.freeShipping is selected by catalog, storefront, Designer, order
 * pricing, freight, and the generic-cabinet admin, and Drizzle also includes
 * it in every full cabinet read once it is on the table. This guard lets those
 * reads return freeShipping=false until the column exists, and turns an admin
 * save of the flag into a clear error.
 */

export const CABINET_FREE_SHIPPING_MIGRATION_MESSAGE =
  "cabinets.freeShipping is missing. Run the free-shipping item SQL before saving Free shipping.";

export const CABINET_FREE_SHIPPING_PRESENT_TTL_MS = 5 * 60 * 1000;
export const CABINET_FREE_SHIPPING_MISSING_TTL_MS = 30 * 1000;

export class CabinetFreeShippingSchemaError extends Error {
  constructor() {
    super(CABINET_FREE_SHIPPING_MIGRATION_MESSAGE);
    this.name = "CabinetFreeShippingSchemaError";
  }
}

export type CabinetFreeShippingColumnState = "present" | "missing" | "unknown";

type CacheEntry = { state: Exclude<CabinetFreeShippingColumnState, "unknown">; expiresAt: number };

let cache: CacheEntry | null = null;

const FREE_SHIPPING_IDENTIFIER = /`(?:[A-Za-z0-9_]+`\.)?freeShipping`/;

export function resetCabinetFreeShippingColumnCache(): void {
  cache = null;
}

export function cabinetFreeShippingColumnState(now = Date.now()): CabinetFreeShippingColumnState {
  if (!cache || cache.expiresAt <= now) return "unknown";
  return cache.state;
}

export function rememberCabinetFreeShippingColumn(present: boolean, now = Date.now()): void {
  cache = {
    state: present ? "present" : "missing",
    expiresAt: now + (present ? CABINET_FREE_SHIPPING_PRESENT_TTL_MS : CABINET_FREE_SHIPPING_MISSING_TTL_MS),
  };
}

function field(row: Record<string, unknown>, name: string): string {
  const target = name.toLowerCase().replace(/_/g, "");
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase().replace(/_/g, "") !== target || value == null) continue;
    return String(value);
  }
  return "";
}

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object") return result as Array<Record<string, unknown>>;
  }
  return [];
}

/** Null means the probe did not see the cabinets table, so the caller should try the real statement. */
export function cabinetFreeShippingStateFromProbe(rows: Array<Record<string, unknown>>): CabinetFreeShippingColumnState {
  let sawId = false;
  let sawFlag = false;
  for (const row of rows) {
    const name = field(row, "columnName").toLowerCase();
    if (name === "id") sawId = true;
    if (name === "freeshipping") sawFlag = true;
  }
  if (!sawId) return "unknown";
  return sawFlag ? "present" : "missing";
}

export function sqlMentionsFreeShippingColumn(sqlText: string): boolean {
  return FREE_SHIPPING_IDENTIFIER.test(sqlText);
}

/** Keeps the selected column position and yields 0, which Drizzle maps to false. */
export function rewriteSelectWithoutFreeShipping(sqlText: string): string {
  return sqlText.replace(/`(?:[A-Za-z0-9_]+`\.)?freeShipping`/g, "0");
}

type SchemaErrorRow = { code?: unknown; errno?: unknown; message?: unknown; sqlMessage?: unknown; cause?: unknown };

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

export function isMissingFreeShippingColumn(error: unknown): boolean {
  if (error instanceof CabinetFreeShippingSchemaError) return true;
  for (const row of schemaErrorRows(error)) {
    const errno = typeof row.errno === "number" ? row.errno : typeof row.errno === "string" && /^\d+$/.test(row.errno) ? Number(row.errno) : null;
    const codeMatches = row.code === "ER_BAD_FIELD_ERROR" || errno === 1054;
    const text = [row.message, row.sqlMessage].filter((part): part is string => typeof part === "string").join(" ");
    const textMatches = /unknown column|ER_BAD_FIELD_ERROR|no such column/i.test(text);
    if ((codeMatches || textMatches) && /freeShipping/i.test(text)) return true;
  }
  return false;
}

/**
 * Include the column only when it can be written. A missing column and an
 * explicit false are the same offer (standard freight), so the rest of the
 * cabinet save still proceeds. Turning the flag on requires the SQL.
 */
export function freeShippingWrite(
  columnState: CabinetFreeShippingColumnState,
  requested: boolean | undefined,
): { freeShipping?: boolean } | { error: string } {
  if (requested == null) return {};
  if (columnState === "missing" || (columnState === "unknown" && requested === false)) {
    if (requested) return { error: CABINET_FREE_SHIPPING_MIGRATION_MESSAGE };
    return {};
  }
  return { freeShipping: requested };
}

export async function runWithCabinetFreeShippingFallback<T>(
  sqlText: string,
  run: (sqlText: string) => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const mentions = sqlMentionsFreeShippingColumn(sqlText);
  const select = /^\s*(select|with)\b/i.test(sqlText);
  if (mentions && cabinetFreeShippingColumnState(now) === "missing") {
    if (select) return run(rewriteSelectWithoutFreeShipping(sqlText));
    throw new CabinetFreeShippingSchemaError();
  }
  try {
    const result = await run(sqlText);
    if (mentions && select) rememberCabinetFreeShippingColumn(true, now);
    return result;
  } catch (error) {
    if (!isMissingFreeShippingColumn(error)) throw error;
    rememberCabinetFreeShippingColumn(false, now);
    if (select) {
      const rewritten = rewriteSelectWithoutFreeShipping(sqlText);
      if (rewritten !== sqlText) return run(rewritten);
    }
    throw new CabinetFreeShippingSchemaError();
  }
}

const wrappedClients = new WeakSet<object>();

function sqlTextOf(sql: unknown): string {
  if (typeof sql === "string") return sql;
  if (sql && typeof sql === "object" && "sql" in sql && typeof (sql as { sql?: unknown }).sql === "string") {
    return (sql as { sql: string }).sql;
  }
  return "";
}

function withSql(sql: unknown, next: string): unknown {
  if (typeof sql === "string") return next;
  if (sql && typeof sql === "object") return { ...(sql as Record<string, unknown>), sql: next };
  return next;
}

export function installCabinetFreeShippingGuard(client: {
  query: (...args: any[]) => any;
  execute?: (...args: any[]) => any;
  getConnection?: (...args: any[]) => any;
}): void {
  if (wrappedClients.has(client)) return;
  wrappedClients.add(client);
  const originalQuery = client.query.bind(client);
  client.query = (sql: unknown, values?: unknown) => runWithCabinetFreeShippingFallback(
    sqlTextOf(sql),
    (next) => originalQuery(withSql(sql, next), values),
  );
  if (typeof client.execute === "function") {
    const originalExecute = client.execute.bind(client);
    client.execute = (sql: unknown, values?: unknown) => runWithCabinetFreeShippingFallback(
      sqlTextOf(sql),
      (next) => originalExecute(withSql(sql, next), values),
    );
  }
  if (typeof client.getConnection === "function") {
    const originalGetConnection = client.getConnection.bind(client);
    client.getConnection = async () => {
      const connection = await originalGetConnection();
      installCabinetFreeShippingGuard(connection);
      return connection;
    };
  }
}

/**
 * Drizzle opens the callback mysql2 pool and every promise wrapper calls back
 * into it, including transactions and direct `$client.promise()` reads.
 */
export function installMysqlPoolFreeShippingGuard(pool: {
  query: (...args: any[]) => any;
  execute?: (...args: any[]) => any;
  getConnection?: (...args: any[]) => any;
}): void {
  if (wrappedClients.has(pool)) return;
  wrappedClients.add(pool);
  wrapCallbackQuery(pool, "query");
  wrapCallbackQuery(pool, "execute");
  if (typeof pool.getConnection !== "function") return;
  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = (callback?: (err: unknown, connection?: any) => void) => {
    if (typeof callback !== "function") return originalGetConnection(callback);
    return originalGetConnection((err: unknown, connection?: any) => {
      if (connection) installMysqlPoolFreeShippingGuard(connection);
      callback(err, connection);
    });
  };
}

function wrapCallbackQuery(target: { query?: (...args: any[]) => any; execute?: (...args: any[]) => any }, method: "query" | "execute"): void {
  const original = target[method];
  if (typeof original !== "function") return;
  const bound = original.bind(target);
  target[method] = (sql: unknown, values?: unknown, callback?: unknown) => {
    let params = values;
    let done = callback;
    if (typeof values === "function") {
      done = values;
      params = undefined;
    }
    if (typeof done !== "function") {
      return params === undefined ? bound(sql) : bound(sql, params, callback);
    }
    const finish = done as (err: unknown, rows?: unknown, fields?: unknown) => void;
    const run = (next: string) => new Promise((resolve, reject) => {
      const onDone = (err: unknown, rows?: unknown, fields?: unknown) => {
        if (err) reject(err);
        else resolve([rows, fields]);
      };
      if (params !== undefined) bound(withSql(sql, next), params, onDone);
      else bound(withSql(sql, next), onDone);
    });
    runWithCabinetFreeShippingFallback(sqlTextOf(sql), run).then(
      (result) => {
        const [rows, fields] = result as [unknown, unknown];
        finish(null, rows, fields);
      },
      (err) => finish(err),
    );
  };
}

const COLUMN_PROBE = "SELECT COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cabinets' AND COLUMN_NAME IN ('id', 'freeShipping')";

export async function primeCabinetFreeShippingColumn(client: { query: (sql: string) => Promise<unknown> }, now = Date.now()): Promise<void> {
  if (cabinetFreeShippingColumnState(now) !== "unknown") return;
  try {
    const state = cabinetFreeShippingStateFromProbe(rowsFrom(await client.query(COLUMN_PROBE)));
    if (state === "present" || state === "missing") rememberCabinetFreeShippingColumn(state === "present", now);
  } catch {
    // The next cabinet read still falls back if the column is missing.
  }
}

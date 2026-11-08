/**
 * Test-only interpreter for the Drizzle where-clauses the store-isolation tests
 * exercise (eq, isNull, inArray, and) plus a minimal chainable query mock.
 *
 * The real routers run against in-memory rows, so the store boundary is
 * asserted on every machine — with or without a database.
 */
type Token =
  | { kind: "column"; name: string }
  | { kind: "text"; value: string }
  | { kind: "param"; value: unknown }
  | { kind: "list"; values: unknown[] };

export type Row = Record<string, unknown>;

function collectTokens(node: unknown, out: Token[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    // Drizzle's inArray embeds the value list as a raw JS array chunk, not as a
    // Param. Keep it whole so `id IN (1, 2)` is read as two values.
    if (node.length > 0 && node.every((entry) => entry == null || typeof entry !== "object")) {
      out.push({ kind: "list", values: node });
      return;
    }
    for (const entry of node) collectTokens(entry, out);
    return;
  }
  if (typeof node !== "object") return;
  const name = (node as { constructor?: { name?: string } }).constructor?.name ?? "";
  if (name === "SQL") {
    collectTokens((node as { queryChunks?: unknown[] }).queryChunks, out);
    return;
  }
  if (name === "StringChunk") {
    const raw = (node as { value?: string[] }).value;
    out.push({ kind: "text", value: Array.isArray(raw) ? raw.join("") : String(raw ?? "") });
    return;
  }
  if (name === "Param") {
    out.push({ kind: "param", value: (node as { value?: unknown }).value });
    return;
  }
  if (typeof (node as { name?: unknown }).name === "string") {
    out.push({ kind: "column", name: (node as { name: string }).name });
    return;
  }
}

type Condition = { column: string; op: "eq" | "null" | "notNull" | "in"; value?: unknown };

function readConditions(where: unknown): Condition[] {
  const tokens: Token[] = [];
  collectTokens(where, tokens);
  const conditions: Condition[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "column") continue;
    const operator = tokens[index + 1];
    if (!operator || operator.kind !== "text") continue;
    const text = operator.value.toLowerCase();
    if (text.includes(" is not null")) {
      conditions.push({ column: token.name, op: "notNull" });
      continue;
    }
    if (text.includes(" is null")) {
      conditions.push({ column: token.name, op: "null" });
      continue;
    }
    const operand = tokens[index + 2];
    if (text.includes(" in ")) {
      const value =
        operand?.kind === "list"
          ? operand.values
          : operand?.kind === "param" && Array.isArray(operand.value)
            ? operand.value
            : operand?.kind === "param"
              ? [operand.value]
              : undefined;
      conditions.push({ column: token.name, op: "in", value });
      continue;
    }
    if (text.includes("=") && operand?.kind === "param") {
      conditions.push({ column: token.name, op: "eq", value: operand.value });
    }
  }
  return conditions;
}

export function matchesWhere(where: unknown, row: Row): boolean {
  if (where == null) return true;
  return readConditions(where).every((condition) => {
    const actual = row[condition.column];
    if (condition.op === "null") return actual == null;
    if (condition.op === "notNull") return actual != null;
    if (condition.op === "in") {
      const list = Array.isArray(condition.value) ? condition.value : [];
      return list.includes(actual);
    }
    return actual === condition.value;
  });
}

/** One table store shared by every query the mock builds. */
export function memoryStore(tables: Map<unknown, Row[]>) {
  function matching(table: unknown, where: unknown): Row[] {
    return (tables.get(table) ?? []).filter((row) => matchesWhere(where, row));
  }

  type Builder = Promise<Row[]> & {
    where: (next: unknown) => Builder;
    limit: (count: number) => Promise<Row[]>;
    orderBy: (...args: unknown[]) => Builder;
  };

  function builder(table: unknown, where?: unknown): Builder {
    const rows = matching(table, where);
    const promise = Promise.resolve(rows);
    const api = {
      where: (next: unknown) => builder(table, next),
      limit: (count: number) => Promise.resolve(rows.slice(0, count)),
      orderBy: () => builder(table, where),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        promise.then(resolve, reject),
      catch: (reject: (reason: unknown) => unknown) => promise.catch(reject),
    };
    return api as Builder;
  }

  return {
    select: () => ({ from: (table: unknown) => builder(table) }),
    insert: (table: unknown) => ({
      values: (values: Row) => {
        const row = { id: ((tables.get(table) ?? []).length || 0) + 1_000_000, ...values };
        tables.set(table, [...(tables.get(table) ?? []), row]);
        const result = [{ insertId: row.id, affectedRows: 1 }] as unknown as Row[] & { insertId: number };
        (result as { insertId: number }).insertId = row.id as number;
        return Promise.resolve(result);
      },
    }),
    update: (table: unknown) => ({
      set: (patch: Row) => ({
        where: (where: unknown) => {
          let affectedRows = 0;
          const next = (tables.get(table) ?? []).map((row) => {
            if (!matchesWhere(where, row)) return row;
            affectedRows += 1;
            return { ...row, ...patch };
          });
          tables.set(table, next);
          return Promise.resolve([{ affectedRows }]);
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: unknown) =>
        Promise.resolve([
          {
            affectedRows: (() => {
              const keep = (tables.get(table) ?? []).filter((row) => !matchesWhere(where, row));
              const removed = (tables.get(table) ?? []).length - keep.length;
              tables.set(table, keep);
              return removed;
            })(),
          },
        ]),
    }),
    transaction: async (work: (tx: unknown) => Promise<unknown>) => work(memoryStore(tables)),
  };
}

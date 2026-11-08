/**
 * A tiny in-memory stand-in for the drizzle database, just big enough for the
 * membership billing paths: select with an equality WHERE, limit, orderBy,
 * insert (returns insertId) and update.
 *
 * Conditions are read from the drizzle SQL tree (column name + bound value), so
 * a real `eq(...)` / `and(...)` is what gets exercised rather than a hand-rolled
 * mock of the query builder.
 */

type Row = Record<string, unknown>;

export interface FakeTable {
  rows: Row[];
  nextId: number;
  /** Column names that the fake database does not have yet. */
  missingColumns: Set<string>;
}

export class FakeDb {
  readonly tables = new Map<unknown, FakeTable>();
  /** Set to true to make every write fail, for the "columns missing" path. */
  failWritesOnMissingColumns = true;

  constructor(spec: { table: unknown; rows?: Row[]; missingColumns?: string[] }[]) {
    for (const entry of spec) {
      const rows = (entry.rows ?? []).map((row) => ({ ...row }));
      const maxId = rows.reduce((max, row) => Math.max(max, Number(row.id ?? 0)), 0);
      this.tables.set(entry.table, {
        rows,
        nextId: maxId + 1,
        missingColumns: new Set(entry.missingColumns ?? []),
      });
    }
  }

  rows(table: unknown): Row[] {
    const entry = this.tables.get(table);
    if (!entry) throw new Error("Unknown table in fake database");
    return entry.rows;
  }

  private tableEntry(table: unknown): FakeTable {
    const entry = this.tables.get(table);
    if (!entry) throw new Error("Unknown table in fake database");
    return entry;
  }

  /** Throw the same shape of error MySQL/TiDB throws for a missing column. */
  private assertColumnsPresent(entry: FakeTable, names: string[]): void {
    for (const name of names) {
      if (entry.missingColumns.has(name)) {
        const error = Object.assign(new Error(`Failed query: select \`${name}\``), {
          cause: {
            code: "ER_BAD_FIELD_ERROR",
            errno: 1054,
            sqlMessage: `Unknown column '${name}' in 'field list'`,
          },
        });
        throw error;
      }
    }
  }

  private selectedNames(selectArg: unknown): string[] {
    if (!selectArg || typeof selectArg !== "object") return [];
    return Object.values(selectArg as Record<string, unknown>)
      .map((column) => (column as { name?: unknown }).name)
      .filter((name): name is string => typeof name === "string");
  }

  private rowToResult(row: Row, selectArg: unknown): Row {
    const names = this.selectedNames(selectArg);
    if (names.length === 0) return { ...row };
    const out: Row = {};
    for (const name of names) out[name] = row[name] ?? null;
    return out;
  }

  /** Column name → value pairs from an equality-only condition tree. */
  private conditionPairs(condition: unknown): { name: string; value: unknown }[] {
    const pairs: { name: string; value: unknown }[] = [];
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const asAny = node as { queryChunks?: unknown[]; constructor?: { name?: string }; name?: string; value?: unknown };
      if (asAny.constructor?.name === "Param") {
        pairs.push({ name: "__param", value: asAny.value });
        return;
      }
      if (typeof asAny.name === "string" && !asAny.queryChunks) {
        pairs.push({ name: asAny.name, value: undefined });
        return;
      }
      for (const chunk of asAny.queryChunks ?? []) visit(chunk);
    };
    visit(condition);
    // Pair each column name with the parameter that follows it.
    const resolved: { name: string; value: unknown }[] = [];
    let pendingName: string | null = null;
    for (const pair of pairs) {
      if (pair.name === "__param") {
        if (pendingName) {
          resolved.push({ name: pendingName, value: pair.value });
          pendingName = null;
        }
        continue;
      }
      pendingName = pair.name;
    }
    return resolved;
  }

  private matches(row: Row, condition: unknown): boolean {
    if (!condition) return true;
    return this.conditionPairs(condition).every(({ name, value }) => row[name] === value);
  }

  readonly select = (selectArg?: unknown) => {
    const self = this;
    let fromTable: unknown = null;
    const run = async (condition: unknown, limit?: number): Promise<Row[]> => {
      const entry = self.tableEntry(fromTable);
      self.assertColumnsPresent(entry, self.selectedNames(selectArg));
      const rows = entry.rows.filter((row) => self.matches(row, condition));
      const limited = limit != null ? rows.slice(0, limit) : rows;
      return limited.map((row) => self.rowToResult(row, selectArg));
    };
    const builder = {
      from: (table: unknown) => {
        fromTable = table;
        return builder;
      },
      where: (condition: unknown) => ({
        orderBy: () => ({
          limit: (n: number) => run(condition, n),
          then: (resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) =>
            run(condition).then(resolve, reject),
        }),
        limit: (n: number) => run(condition, n),
        then: (resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) =>
          run(condition).then(resolve, reject),
      }),
      orderBy: () => ({
        limit: (n: number) => run(undefined, n),
        then: (resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) =>
          run(undefined).then(resolve, reject),
      }),
      limit: (n: number) => run(undefined, n),
      then: (resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) =>
        run(undefined).then(resolve, reject),
    };
    return builder;
  };

  readonly insert = (table: unknown) => {
    const self = this;
    return {
      values: async (values: Row) => {
        const entry = self.tableEntry(table);
        self.assertColumnsPresent(entry, Object.keys(values));
        const id = entry.nextId;
        entry.nextId += 1;
        entry.rows.push({ ...values, id, createdAt: new Date(), updatedAt: new Date() });
        return [{ insertId: id }];
      },
    };
  };

  readonly update = (table: unknown) => {
    const self = this;
    return {
      set: (values: Row) => ({
        where: async (condition: unknown) => {
          const entry = self.tableEntry(table);
          self.assertColumnsPresent(entry, Object.keys(values));
          let affected = 0;
          for (const row of entry.rows) {
            if (self.matches(row, condition)) {
              Object.assign(row, values);
              affected += 1;
            }
          }
          return [{ affectedRows: affected }];
        },
      }),
    };
  };
}

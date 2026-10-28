import { afterEach, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { cabinets } from "../../drizzle/schema";
import { EMPTY_CATALOG_FREE_SHIPPING_INDEX } from "@shared/freeShippingItem";
import { loadCatalogFreeShippingIndex } from "./catalogFreeShipping";
import {
  CABINET_FREE_SHIPPING_MIGRATION_MESSAGE,
  CABINET_FREE_SHIPPING_MISSING_TTL_MS,
  CabinetFreeShippingSchemaError,
  cabinetFreeShippingColumnState,
  cabinetFreeShippingStateFromProbe,
  freeShippingWrite,
  installCabinetFreeShippingGuard,
  rememberCabinetFreeShippingColumn,
  resetCabinetFreeShippingColumnCache,
  rewriteSelectWithoutFreeShipping,
  runWithCabinetFreeShippingFallback,
  sqlMentionsFreeShippingColumn,
} from "./cabinetFreeShippingSchema";

afterEach(() => {
  resetCabinetFreeShippingColumnCache();
});

function missingColumn(): Error {
  const error = new Error("Failed query: select `cabinets`.`freeShipping`");
  (error as { cause?: unknown }).cause = {
    code: "ER_BAD_FIELD_ERROR",
    errno: 1054,
    sqlMessage: "Unknown column 'freeShipping' in 'field list'",
  };
  return error;
}

describe("cabinet free shipping without the column", () => {
  it("reads the probe as missing until both the table and the flag are visible", () => {
    expect(cabinetFreeShippingStateFromProbe([])).toBe("unknown");
    expect(cabinetFreeShippingStateFromProbe([{ COLUMN_NAME: "id" }])).toBe("missing");
    expect(cabinetFreeShippingStateFromProbe([
      { columnName: "id" },
      { columnName: "freeShipping" },
    ])).toBe("present");
  });

  it("rewrites a real Drizzle cabinet select to a false flag and leaves other SQL alone", async () => {
    const pool = mysql.createPool({ host: "127.0.0.1", user: "unused", database: "unused", connectionLimit: 1 });
    try {
      const db = drizzle(pool);
      const selected = db.select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        freeShipping: cabinets.freeShipping,
      }).from(cabinets).toSQL();
      const full = db.select().from(cabinets).limit(1).toSQL();
      expect(sqlMentionsFreeShippingColumn(selected.sql)).toBe(true);
      expect(sqlMentionsFreeShippingColumn(full.sql)).toBe(true);
      for (const built of [selected, full]) {
        const rewritten = rewriteSelectWithoutFreeShipping(built.sql);
        expect(rewritten).not.toMatch(/`freeShipping`/);
        expect(rewritten).toContain("0");
        expect(rewritten).toContain("`id`");
      }
      const update = db.update(cabinets).set({ description: "Base", freeShipping: true }).where(eq(cabinets.id, 4)).toSQL();
      expect(sqlMentionsFreeShippingColumn(update.sql)).toBe(true);
      expect(/^\s*select\b/i.test(update.sql)).toBe(false);
    } finally {
      await pool.end();
    }
  });

  it("retries a select as freeShipping=false and caches the miss", async () => {
    const seen: string[] = [];
    const rows = await runWithCabinetFreeShippingFallback(
      "select `cabinets`.`id`, `cabinets`.`freeShipping` from `cabinets`",
      async (sqlText) => {
        seen.push(sqlText);
        if (sqlText.includes("`freeShipping`")) throw missingColumn();
        return [{ id: 4, freeShipping: 0 }];
      },
    );
    expect(rows).toEqual([{ id: 4, freeShipping: 0 }]);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain("0");
    expect(cabinetFreeShippingColumnState()).toBe("missing");
  });

  it("does not ask for the column again until the short cache expires", async () => {
    rememberCabinetFreeShippingColumn(false, 1_000);
    const run = vi.fn(async (sqlText: string) => sqlText);
    await runWithCabinetFreeShippingFallback("select `cabinets`.`freeShipping` from `cabinets`", run, 1_000 + 1_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).not.toContain("`freeShipping`");
    resetCabinetFreeShippingColumnCache();
    rememberCabinetFreeShippingColumn(false, 1_000);
    await runWithCabinetFreeShippingFallback(
      "select `cabinets`.`freeShipping` from `cabinets`",
      run,
      1_000 + CABINET_FREE_SHIPPING_MISSING_TTL_MS + 1,
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][0]).toContain("`freeShipping`");
  });

  it("refuses a write of the flag when the column is missing", async () => {
    rememberCabinetFreeShippingColumn(false);
    const run = vi.fn(async () => []);
    await expect(runWithCabinetFreeShippingFallback(
      "update `cabinets` set `freeShipping` = ? where `id` = ?",
      run,
    )).rejects.toBeInstanceOf(CabinetFreeShippingSchemaError);
    expect(run).not.toHaveBeenCalled();
  });

  it("saves the rest of a cabinet when the flag is off, and names the SQL when it is turned on", () => {
    expect(freeShippingWrite("missing", undefined)).toEqual({});
    expect(freeShippingWrite("missing", false)).toEqual({});
    expect(freeShippingWrite("missing", true)).toEqual({ error: CABINET_FREE_SHIPPING_MIGRATION_MESSAGE });
    expect(freeShippingWrite("unknown", false)).toEqual({});
    expect(freeShippingWrite("present", true)).toEqual({ freeShipping: true });
    expect(freeShippingWrite("present", false)).toEqual({ freeShipping: false });
    expect(CABINET_FREE_SHIPPING_MIGRATION_MESSAGE).toContain("free-shipping item SQL");
  });

  it("returns an empty freight index when the cabinet read reports a missing column", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => {
            throw missingColumn();
          },
        }),
      }),
    };
    await expect(loadCatalogFreeShippingIndex(db as never, [{ cabinetId: 42, masterCode: "B24" }]))
      .resolves.toEqual(EMPTY_CATALOG_FREE_SHIPPING_INDEX);
  });

  it("rewrites pool selects and transaction selects after the column is known to be missing", async () => {
    rememberCabinetFreeShippingColumn(false);
    const seen: string[] = [];
    const connection = {
      query: async (sql: { sql: string } | string) => {
        seen.push(typeof sql === "string" ? sql : sql.sql);
        return [[]];
      },
      execute: async (sql: string) => {
        seen.push(sql);
        return [[]];
      },
    };
    const pool = {
      query: async (sql: { sql: string } | string) => {
        seen.push(typeof sql === "string" ? sql : sql.sql);
        return [[]];
      },
      execute: async (sql: string) => {
        seen.push(sql);
        return [[]];
      },
      getConnection: async () => connection,
    };
    installCabinetFreeShippingGuard(pool);
    await pool.query({ sql: "select `cabinets`.`id`, `cabinets`.`freeShipping` from `cabinets`", rowsAsArray: true }, []);
    const tx = await pool.getConnection();
    await tx.execute("select `freeShipping` from `cabinets`");
    expect(seen.every((sqlText) => !sqlText.includes("`freeShipping`"))).toBe(true);
    expect(seen.every((sqlText) => sqlText.includes("0"))).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { doorStyles } from "../../drizzle/schema";
import {
  DOOR_COLOR_SOURCE_NOT_READY_MESSAGE,
  MISSING_COLUMNS_RECHECK_MS,
  doorColorSourceColumnsAvailable,
  doorColorSourceNotReadyMessage,
  resetDoorColorSourceColumnsCache,
  withDoorColorSourceColumns,
} from "./doorColorSourceColumns";

// Nov 12 2026: PR 100 declared the 0280 columns on `doorStyles` and went live before
// 0280 ran, so every door style read failed with "Unknown column" and the Designer
// showed no door colors. These tests pin the tolerant behavior.

function fakeDb(opts: { columnCount: number; stored?: Array<Record<string, unknown>>; readError?: Error }) {
  const execute = vi.fn(async () => [[{ columnCount: opts.columnCount }], []]);
  const where = vi.fn(async () => {
    if (opts.readError) throw opts.readError;
    return opts.stored ?? [];
  });
  const select = vi.fn(() => ({ from: () => ({ where }) }));
  return { execute, select, where };
}

beforeEach(() => resetDoorColorSourceColumnsCache());

describe("door_styles schema never depends on 0280", () => {
  it("does not declare the hand-added color source columns on the main table", () => {
    const columns = Object.keys(getTableColumns(doorStyles));
    expect(columns).not.toContain("doorColorSource");
    expect(columns).not.toContain("doorColorSourceValue");
    expect(columns).not.toContain("doorColorSourceUpdatedAt");
  });

  it("no door style query in the catalog router names the columns on doorStyles", () => {
    const source = readFileSync("server/routers/catalog.ts", "utf8");
    expect(source).not.toMatch(/doorStyles\.doorColorSource/);
  });
});

describe("withDoorColorSourceColumns", () => {
  it("columns missing (0280 not run): rows come back intact with NULL choice, no column read", async () => {
    const db = fakeDb({ columnCount: 0 });
    const rows = await withDoorColorSourceColumns(db, [{ id: 1, renderHex: "#aabbcc" }, { id: 2, renderHex: null }]);
    expect(rows).toEqual([
      { id: 1, renderHex: "#aabbcc", doorColorSource: null, doorColorSourceValue: null, doorColorSourceUpdatedAt: null },
      { id: 2, renderHex: null, doorColorSource: null, doorColorSourceValue: null, doorColorSourceUpdatedAt: null },
    ]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("columns present: merges the stored choice by id", async () => {
    const at = new Date("2026-11-12T19:00:00Z");
    const db = fakeDb({
      columnCount: 3,
      stored: [{ id: 2, doorColorSource: "hex", doorColorSourceValue: { hex: "#224466" }, doorColorSourceUpdatedAt: at }],
    });
    const rows = await withDoorColorSourceColumns(db, [{ id: 1 }, { id: 2 }]);
    expect(rows[0]).toMatchObject({ id: 1, doorColorSource: null });
    expect(rows[1]).toMatchObject({ id: 2, doorColorSource: "hex", doorColorSourceValue: { hex: "#224466" }, doorColorSourceUpdatedAt: at });
  });

  it("a failing read never throws; rows keep their current color order", async () => {
    const db = fakeDb({ columnCount: 3, readError: Object.assign(new Error("Unknown column 'doorColorSource'"), { code: "ER_BAD_FIELD_ERROR" }) });
    const rows = await withDoorColorSourceColumns(db, [{ id: 7 }]);
    expect(rows).toEqual([{ id: 7, doorColorSource: null, doorColorSourceValue: null, doorColorSourceUpdatedAt: null }]);
  });
});

describe("doorColorSourceColumnsAvailable", () => {
  it("rechecks a missing answer after a minute so running 0280 turns it on without a redeploy", async () => {
    let count = 0;
    const db = { execute: vi.fn(async () => [[{ columnCount: count }], []]) };
    expect(await doorColorSourceColumnsAvailable(db, 0)).toBe(false);
    count = 3;
    expect(await doorColorSourceColumnsAvailable(db, 1_000)).toBe(false);
    expect(await doorColorSourceColumnsAvailable(db, MISSING_COLUMNS_RECHECK_MS + 1)).toBe(true);
    expect(await doorColorSourceColumnsAvailable(db, MISSING_COLUMNS_RECHECK_MS + 2)).toBe(true);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("a probe error reads as missing", async () => {
    const db = { execute: vi.fn(async () => { throw new Error("boom"); }) };
    expect(await doorColorSourceColumnsAvailable(db, 0)).toBe(false);
  });
});

describe("doorColorSourceNotReadyMessage", () => {
  it("names the database that was checked and the schema the column really lives in", async () => {
    const probeDb = { execute: vi.fn(async () => [[{ dbName: "cabinet_dealz_live", columnCount: 0 }], []]) };
    expect(await doorColorSourceColumnsAvailable(probeDb, 0)).toBe(false);
    const messageDb = { execute: vi.fn(async () => [[{ schemaName: "cabinet_dealz_live" }, { schemaName: "cabinet_dealz" }], []]) };
    const message = await doorColorSourceNotReadyMessage(messageDb);
    expect(message).toContain("Run docs/sql/0280");
    expect(message).toContain("cabinet_dealz_live");
    expect(message).toContain("0 of 3 columns");
    expect(message).toContain("cabinet_dealz");
  });

  it("asks for the count when the column exists nowhere else", async () => {
    const probeDb = { execute: vi.fn(async () => [[{ dbName: "cabinet_dealz", columnCount: 1 }], []]) };
    expect(await doorColorSourceColumnsAvailable(probeDb, 0)).toBe(false);
    const messageDb = { execute: vi.fn(async () => [[], []]) };
    const message = await doorColorSourceNotReadyMessage(messageDb);
    expect(message).toContain("1 of 3 columns");
    expect(message).toContain("SELECT COUNT(*) FROM information_schema.columns");
  });

  it("falls back to the plain refusal when no probe has run, and never throws on a failed lookup", async () => {
    resetDoorColorSourceColumnsCache();
    const failing = { execute: vi.fn(async () => { throw new Error("boom"); }) };
    expect(await doorColorSourceNotReadyMessage(failing)).toBe(DOOR_COLOR_SOURCE_NOT_READY_MESSAGE);
    const probeDb = { execute: vi.fn(async () => [[{ dbName: "cabinet_dealz", columnCount: 0 }], []]) };
    await doorColorSourceColumnsAvailable(probeDb, 0);
    expect(await doorColorSourceNotReadyMessage(failing)).toContain("cabinet_dealz");
  });
});

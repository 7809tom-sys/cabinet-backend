/**
 * AI door profile columns (docs/sql/0281_ai_door_profile.tidb.sql).
 *
 * The official profile and the per-provider aiColumns live on door_styles, but
 * only after Tom runs that file by hand. Until then the admin list still
 * returns, with aiColumns null, and the saves name the file instead of
 * throwing an unknown-column error.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("../db", async importOriginal => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: (...args: unknown[]) => getDbMock(...args) };
});

import { appRouter } from "../routers";
import { NOT_ADMIN_ERR_MSG } from "../../shared/const";
import { resetDoorColorSourceColumnsCache } from "./doorColorSourceColumns";
import {
  AI_DOOR_COLUMNS_NOT_READY_MESSAGE,
  AI_DOOR_PROFILE_NOT_READY_MESSAGE,
  AI_DOOR_PROFILE_PROBE_COLUMN_NAMES,
  AI_DOOR_STYLE_NOT_FOUND_MESSAGE,
  aiDoorProfileColumnPresence,
  parseAiDoorColumns,
  resetAiDoorProfileColumnsCache,
  withAiDoorProfileColumns,
  writeAiDoorColumn,
  writeAiDoorProfile,
  type AiDoorColumn,
} from "./aiDoorProfileColumns";

const SQL_PATH = "docs/sql/0281_ai_door_profile.tidb.sql";
const GENERATED_AT = "2026-11-24T16:00:00.000Z";

const claudeColumn: AiDoorColumn = {
  imageUrl: "/manus-storage/door-style-images/ai-generated/claude.png",
  model: "claude-sonnet",
  text: "Oak shaker.",
  renderHex: "#8d5a2b",
  generatedAt: "2026-11-01T00:00:00.000Z",
};

type Flags = { profile: boolean; renderHex: boolean; aiColumns: boolean };

type StyleRow = {
  id: number;
  aiColumns: unknown;
  aiProfileModel?: string | null;
  aiProfileText?: string | null;
  aiProfileImageUrl?: string | null;
  aiProfileRenderHex?: string | null;
};

function sqlParts(query: unknown): { text: string; params: unknown[] } {
  const text: string[] = [];
  const params: unknown[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown) => {
    if (node == null) {
      params.push(node);
      return;
    }
    if (
      typeof node === "string" ||
      typeof node === "number" ||
      typeof node === "boolean" ||
      typeof node === "bigint"
    ) {
      params.push(node);
      return;
    }
    if (
      node instanceof String ||
      node instanceof Number ||
      node instanceof Boolean ||
      node instanceof Date
    ) {
      params.push(node.valueOf());
      return;
    }
    if (typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const record = node as { value?: unknown; queryChunks?: unknown[] };
    if (Array.isArray(record.queryChunks)) {
      for (const chunk of record.queryChunks) visit(chunk);
      return;
    }
    if (
      Array.isArray(record.value) &&
      record.value.every(part => typeof part === "string")
    ) {
      text.push(record.value.join(""));
      return;
    }
    if ("value" in record && record.value !== undefined)
      params.push(record.value);
  };
  visit(query);
  return { text: text.join(""), params };
}

function createDb(options: {
  flags: Flags;
  styles?: StyleRow[];
  probeError?: Error | null;
  failRead?: Error | null;
  selectError?: Error | null;
}) {
  const styles = new Map(
    (options.styles ?? []).map(style => [style.id, { ...style }])
  );
  const live = {
    flags: { ...options.flags },
    probeError: options.probeError ?? null,
    failRead: options.failRead ?? null,
    selectError: options.selectError ?? null,
  };
  const calls: unknown[] = [];
  const selects: string[][] = [];
  let probes = 0;
  const db = {
    calls,
    selects,
    styles,
    get flags() {
      return live.flags;
    },
    set flags(flags: Flags) {
      live.flags = flags;
    },
    get probeError() {
      return live.probeError;
    },
    set probeError(error: Error | null) {
      live.probeError = error;
    },
    probes: () => probes,
    async execute(query: unknown) {
      calls.push(query);
      const { text, params } = sqlParts(query);
      if (text.includes("information_schema")) {
        probes += 1;
        if (live.probeError) throw live.probeError;
        if (text.includes("doorColorSource"))
          return [[{ dbName: "cabinet_dealz", columnCount: 0 }]];
        return [
          [
            {
              aiProfileModel: live.flags.profile ? 1 : 0,
              aiProfileText: live.flags.profile ? 1 : 0,
              aiProfileImageUrl: live.flags.profile ? 1 : 0,
              aiProfileRenderHex: live.flags.renderHex ? 1 : 0,
              aiColumns: live.flags.aiColumns ? 1 : 0,
            },
          ],
        ];
      }
      if (live.failRead && text.includes("SELECT")) throw live.failRead;
      if (text.includes("JSON_SET")) {
        const payload = params.find(
          value => typeof value === "string" && value.trim().startsWith("{")
        );
        const id = params.find(
          (value): value is number => typeof value === "number"
        );
        const style = id == null ? undefined : styles.get(id);
        if (style && typeof payload === "string") {
          const key = text.includes("$.gpt")
            ? "gpt"
            : text.includes("$.claude")
              ? "claude"
              : "gemini";
          const current =
            style.aiColumns &&
            typeof style.aiColumns === "object" &&
            !Array.isArray(style.aiColumns)
              ? { ...(style.aiColumns as Record<string, unknown>) }
              : {};
          style.aiColumns = { ...current, [key]: JSON.parse(payload) };
        }
        return [{ affectedRows: style ? 1 : 0 }];
      }
      if (text.includes("SELECT")) {
        const id = params.find(
          (value): value is number => typeof value === "number"
        );
        const style = id == null ? undefined : styles.get(id);
        if (!style) return [[]];
        return [[{ id: style.id, aiColumns: style.aiColumns }]];
      }
      return [{ affectedRows: 1 }];
    },
    select(shape?: Record<string, unknown>) {
      if (live.selectError) throw live.selectError;
      const keys = shape ? Object.keys(shape) : [];
      selects.push(keys);
      const rows = rowsFor(keys, styles);
      const query = {
        from: () => query,
        leftJoin: () => query,
        innerJoin: () => query,
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        then: (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => Promise.resolve(rows).then(onFulfilled, onRejected),
      };
      return query;
    },
  };
  return db;
}

function rowsFor(keys: string[], styles: Map<number, StyleRow>): unknown[] {
  if (keys.includes("ourName")) {
    return [...styles.values()].map(style => ({
      id: style.id,
      ourName: "Slate Gray",
      warehouseZip: null,
      warehouseZips: null,
      distributorWarehouseZips: null,
    }));
  }
  if (keys.some(key => key.startsWith("aiProfile") || key === "aiColumns")) {
    return [...styles.values()].map(style => ({
      id: style.id,
      aiProfileModel: style.aiProfileModel ?? null,
      aiProfileText: style.aiProfileText ?? null,
      aiProfileImageUrl: style.aiProfileImageUrl ?? null,
      aiProfileRenderHex: style.aiProfileRenderHex ?? null,
      aiColumns: style.aiColumns,
    }));
  }
  return [];
}

const ready: Flags = { profile: true, renderHex: true, aiColumns: true };
const admin = { id: 1, email: "admin@example.com", role: "admin" } as never;
const shopper = { id: 2, email: "person@example.com", role: "user" } as never;

function callerFor(user: unknown, db: ReturnType<typeof createDb> | null) {
  getDbMock.mockResolvedValue(db);
  return appRouter.createCaller({ user } as never);
}

beforeEach(() => {
  resetAiDoorProfileColumnsCache();
  resetDoorColorSourceColumnsCache();
  getDbMock.mockReset();
});

describe("0281 AI door profile migration", () => {
  const sql = readFileSync(SQL_PATH, "utf8");
  const executable = sql
    .split("\n")
    .map(line => line.replace(/--.*$/, "").trim())
    .join("\n");

  it("adds the five columns the probe recognizes, idempotently, on cabinet_dealz.door_styles", () => {
    expect(sql).toContain("ALTER TABLE cabinet_dealz.door_styles");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS aiProfileModel VARCHAR(32) NULL"
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS aiProfileText TEXT NULL");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS aiProfileImageUrl VARCHAR(1024) NULL"
    );
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS aiProfileRenderHex VARCHAR(16) NULL"
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS aiColumns JSON NULL");
    const added = [...sql.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map(
      match => match[1]
    );
    expect(added).toEqual([...AI_DOOR_PROFILE_PROBE_COLUMN_NAMES]);
  });

  it("only adds columns, so a second run cannot change a saved profile", () => {
    expect(executable).not.toMatch(/\bINSERT\b/i);
    expect(executable).not.toMatch(/\bUPDATE\b/i);
    expect(executable).not.toMatch(/\bDELETE\b/i);
    expect(executable).not.toMatch(/\bDROP\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDEFAULT\b/i);
    expect(sql).toMatch(/no backfill/i);
    const alters = executable.match(/ALTER TABLE[^;]*/gi) ?? [];
    expect(alters).toHaveLength(5);
    for (const statement of alters)
      expect(statement).toMatch(/ADD COLUMN IF NOT EXISTS/i);
    expect(executable).not.toMatch(/ALTER TABLE (?!cabinet_dealz\.)/i);
  });

  it("is one statement per numbered block, for the TiDB SQL editor", () => {
    expect(sql).toContain("Paste each numbered block on its own");
    expect(sql).not.toContain("--> statement-breakpoint");
    const blocks = sql.split(/\n-- \d+[^\n]*\n/).slice(1);
    expect(blocks).toHaveLength(7);
    for (const block of blocks) {
      const statements = block
        .split("\n")
        .map(line => line.replace(/--.*$/, ""))
        .join("\n")
        .split(";")
        .map(part => part.trim())
        .filter(Boolean);
      expect(statements).toHaveLength(1);
    }
  });

  it("keeps the columns off the main doorStyles table object", () => {
    const schema = readFileSync("drizzle/schema.ts", "utf8");
    const table = schema.slice(
      schema.indexOf('export const doorStyles = mysqlTable("door_styles"')
    );
    const body = table.slice(0, table.indexOf("export const", 1));
    expect(body).not.toContain("aiColumns: json(");
    expect(body).not.toContain("aiProfileModel: varchar(");
    expect(body).not.toContain("aiProfileRenderHex: varchar(");
    const side = readFileSync("server/lib/aiDoorProfileColumns.ts", "utf8");
    for (const name of AI_DOOR_PROFILE_PROBE_COLUMN_NAMES) {
      expect(side).toContain(`SUM(column_name = '${name}')`);
      expect(side).toContain(`'${name}'`);
    }
  });
});

describe("column probe", () => {
  it("treats each new column as its own gate and rechecks only while one is missing", async () => {
    const db = createDb({
      flags: { profile: true, renderHex: false, aiColumns: false },
    });
    await expect(aiDoorProfileColumnPresence(db, 1_000)).resolves.toEqual({
      profile: true,
      renderHex: false,
      aiColumns: false,
    });
    db.flags = { profile: false, renderHex: true, aiColumns: true };
    await expect(
      aiDoorProfileColumnPresence(db, 1_000 + 1_000)
    ).resolves.toEqual({
      profile: true,
      renderHex: false,
      aiColumns: false,
    });
    expect(db.probes()).toBe(1);
    await expect(
      aiDoorProfileColumnPresence(db, 1_000 + 60_000)
    ).resolves.toEqual({
      profile: true,
      renderHex: true,
      aiColumns: true,
    });
    expect(db.probes()).toBe(2);
  });

  it("keeps the last answer when information_schema cannot be read", async () => {
    const db = createDb({ flags: ready });
    await aiDoorProfileColumnPresence(db, 1_000);
    db.probeError = new Error("connection reset");
    await expect(
      aiDoorProfileColumnPresence(db, 1_000 + 60_000)
    ).resolves.toEqual(ready);
  });
});

describe("aiColumns", () => {
  it("parses the agreed object and drops anything else", () => {
    expect(parseAiDoorColumns(null)).toBeNull();
    expect(parseAiDoorColumns("{}")).toBeNull();
    expect(parseAiDoorColumns("not json")).toBeNull();
    expect(parseAiDoorColumns([])).toBeNull();
    const parsed = parseAiDoorColumns(
      JSON.stringify({
        gpt: {
          imageUrl: "/g.png",
          model: "gpt-image-1",
          text: "Slab.",
          renderHex: "#aabbcc",
          generatedAt: GENERATED_AT,
        },
        other: { imageUrl: "/no.png", generatedAt: GENERATED_AT },
        claude: "nope",
      })
    );
    expect(parsed).toEqual({
      gpt: {
        imageUrl: "/g.png",
        model: "gpt-image-1",
        text: "Slab.",
        renderHex: "#aabbcc",
        generatedAt: GENERATED_AT,
      },
    });
  });

  it("merges one provider into the stored object and returns every column", async () => {
    const db = createDb({
      flags: ready,
      styles: [{ id: 15, aiColumns: { claude: claudeColumn } }],
    });
    const aiColumns = await writeAiDoorColumn(db, 15, {
      column: "gpt",
      imageUrl: "  /manus-storage/door-style-images/ai-generated/gpt.png  ",
      model: "gpt-image-1",
      text: "  Painted shaker.  ",
      renderHex: "#AABBCC",
      generatedAt: GENERATED_AT,
    });
    const update = sqlParts(
      db.calls.find(call => sqlParts(call).text.includes("JSON_SET")) ?? {}
    );
    expect(update.text).toContain(
      "JSON_SET(COALESCE(aiColumns, JSON_OBJECT())"
    );
    expect(update.text).toContain("'$.gpt'");
    expect(update.text).toContain("CAST(");
    expect(update.text).not.toContain("$.claude");
    const payload = update.params.find(
      value => typeof value === "string" && value.startsWith("{")
    );
    expect(JSON.parse(String(payload))).toEqual({
      imageUrl: "/manus-storage/door-style-images/ai-generated/gpt.png",
      model: "gpt-image-1",
      text: "Painted shaker.",
      renderHex: "#aabbcc",
      generatedAt: GENERATED_AT,
    });
    expect(JSON.parse(String(payload))).not.toHaveProperty("claude");
    expect(aiColumns.claude).toEqual(claudeColumn);
    expect(aiColumns.gpt?.renderHex).toBe("#aabbcc");
    expect(db.styles.get(15)?.aiColumns).toMatchObject({
      claude: claudeColumn,
      gpt: { renderHex: "#aabbcc" },
    });
  });

  it("refuses with the agreed message and does not write when aiColumns is missing", async () => {
    const db = createDb({
      flags: { profile: true, renderHex: true, aiColumns: false },
      styles: [{ id: 15, aiColumns: null }],
    });
    await expect(
      writeAiDoorColumn(db, 15, { column: "gemini", imageUrl: "/g.png" })
    ).rejects.toThrow(AI_DOOR_COLUMNS_NOT_READY_MESSAGE);
    expect(db.calls.map(call => sqlParts(call).text).join("\n")).not.toContain(
      "JSON_SET"
    );
    expect(AI_DOOR_COLUMNS_NOT_READY_MESSAGE).toBe(
      "The AI door columns are not in the database yet. Run docs/sql/0281_ai_door_profile.tidb.sql."
    );
  });

  it("turns a stale probe into the same message when the column was removed", async () => {
    const removed = new Error("Unknown column 'aiColumns' in 'field list'");
    (removed as { code?: string }).code = "ER_BAD_FIELD_ERROR";
    const db = createDb({
      flags: ready,
      styles: [{ id: 15, aiColumns: null }],
      failRead: removed,
    });
    await expect(writeAiDoorColumn(db, 15, { column: "gpt" })).rejects.toThrow(
      AI_DOOR_COLUMNS_NOT_READY_MESSAGE
    );
    db.flags = { profile: true, renderHex: true, aiColumns: false };
    await expect(
      aiDoorProfileColumnPresence(db, Date.now())
    ).resolves.toMatchObject({ aiColumns: false });
  });

  it("says the style is missing without blaming the migration", async () => {
    const db = createDb({ flags: ready, styles: [] });
    await expect(
      writeAiDoorColumn(db, 404, { column: "gpt", text: "missing" })
    ).rejects.toThrow(AI_DOOR_STYLE_NOT_FOUND_MESSAGE);
    expect(db.calls.map(call => sqlParts(call).text).join("\n")).not.toContain(
      "JSON_SET"
    );
  });

  it("does not disguise a real database failure as a missing column", async () => {
    const db = createDb({
      flags: ready,
      styles: [{ id: 15, aiColumns: null }],
      failRead: new Error("connection reset"),
    });
    await expect(writeAiDoorColumn(db, 15, { column: "gpt" })).rejects.toThrow(
      "connection reset"
    );
  });

  it("reads null when the column is missing and the stored object when it is present", async () => {
    const missing = createDb({
      flags: { profile: true, renderHex: false, aiColumns: false },
      styles: [
        {
          id: 15,
          aiColumns: { gpt: claudeColumn },
          aiProfileModel: "claude",
          aiProfileText: "Oak shaker.",
          aiProfileImageUrl: "/official.png",
        },
      ],
    });
    const hidden = await withAiDoorProfileColumns(missing, [
      { id: 15, ourName: "Slate Gray" },
    ]);
    expect(hidden[0]).toMatchObject({
      ourName: "Slate Gray",
      aiProfileModel: "claude",
      aiProfileText: "Oak shaker.",
      aiProfileImageUrl: "/official.png",
      aiProfileRenderHex: null,
      aiColumns: null,
    });
    expect(missing.selects.some(keys => keys.includes("aiColumns"))).toBe(
      false
    );
    expect(
      missing.selects.some(keys => keys.includes("aiProfileRenderHex"))
    ).toBe(false);

    resetAiDoorProfileColumnsCache();
    const present = createDb({
      flags: ready,
      styles: [
        {
          id: 15,
          aiColumns: JSON.stringify({
            gemini: { ...claudeColumn, imageUrl: "/gem.png" },
            extra: true,
          }),
          aiProfileModel: "gemini",
          aiProfileText: "Slab.",
          aiProfileImageUrl: "/official.png",
          aiProfileRenderHex: "#112233",
        },
      ],
    });
    const shown = await withAiDoorProfileColumns(present, [{ id: 15 }]);
    expect(shown[0].aiColumns).toEqual({
      gemini: { ...claudeColumn, imageUrl: "/gem.png" },
    });
    expect(shown[0].aiProfileRenderHex).toBe("#112233");
    expect(present.selects.at(-1)).toEqual(
      expect.arrayContaining(["aiColumns", "aiProfileRenderHex"])
    );
  });

  it("returns the door row with null AI fields when the read fails", async () => {
    const db = createDb({
      flags: ready,
      styles: [{ id: 15, aiColumns: { gpt: claudeColumn } }],
      selectError: new Error("Unknown column 'aiColumns' in 'field list'"),
    });
    const rows = await withAiDoorProfileColumns(db, [
      { id: 15, ourName: "Slate Gray" },
    ]);
    expect(rows).toEqual([
      {
        id: 15,
        ourName: "Slate Gray",
        aiProfileModel: null,
        aiProfileText: null,
        aiProfileImageUrl: null,
        aiProfileRenderHex: null,
        aiColumns: null,
      },
    ]);
  });
});

describe("saveAiProfile renderHex", () => {
  const profile = {
    model: "gpt" as const,
    text: "Painted shaker.",
    imageUrl: "/manus-storage/door-style-images/ai-generated/gpt.png",
  };

  it("stores the sampled colour on aiProfileRenderHex and on the Designer renderHex", async () => {
    const db = createDb({ flags: ready });
    await writeAiDoorProfile(db, 15, { ...profile, renderHex: "#AABBCC" });
    const update = sqlParts(
      db.calls.find(call => sqlParts(call).text.includes("UPDATE")) ?? {}
    );
    expect(update.text).toContain("aiProfileRenderHex =");
    expect(update.text).toContain("renderHex = COALESCE(");
    expect(update.params).toEqual([
      profile.model,
      profile.text,
      profile.imageUrl,
      "#aabbcc",
      "#aabbcc",
      15,
    ]);
  });

  it("still paints renderHex when the dedicated column has not been added", async () => {
    const db = createDb({
      flags: { profile: true, renderHex: false, aiColumns: false },
    });
    await writeAiDoorProfile(db, 15, { ...profile, renderHex: "112233" });
    const update = sqlParts(
      db.calls.find(call => sqlParts(call).text.includes("UPDATE")) ?? {}
    );
    expect(update.text).not.toContain("aiProfileRenderHex");
    expect(update.text).toContain("renderHex = COALESCE(");
    expect(update.params).toContain("#112233");
  });

  it("leaves a stored hex alone when the caller does not send one", async () => {
    const db = createDb({ flags: ready });
    await writeAiDoorProfile(db, 15, profile);
    const update = sqlParts(
      db.calls.find(call => sqlParts(call).text.includes("UPDATE")) ?? {}
    );
    expect(update.text).not.toContain("aiProfileRenderHex");
    expect(update.params).toEqual([
      profile.model,
      profile.text,
      profile.imageUrl,
      null,
      15,
    ]);
  });

  it("uses the profile not-ready message, which is not the aiColumns message", async () => {
    const db = createDb({
      flags: { profile: false, renderHex: false, aiColumns: true },
    });
    await expect(
      writeAiDoorProfile(db, 15, { ...profile, renderHex: "#112233" })
    ).rejects.toThrow(AI_DOOR_PROFILE_NOT_READY_MESSAGE);
    expect(AI_DOOR_PROFILE_NOT_READY_MESSAGE).not.toBe(
      AI_DOOR_COLUMNS_NOT_READY_MESSAGE
    );
  });
});

describe("doorStyles admin API", () => {
  const input = {
    doorStyleId: 15,
    column: "gpt" as const,
    imageUrl: "/manus-storage/door-style-images/ai-generated/gpt.png",
    model: "gpt-image-1",
    text: "Painted shaker.",
    renderHex: "#445566",
  };

  it("mounts saveAiColumn as an admin mutation with the agreed input", () => {
    expect(Object.keys(appRouter._def.procedures)).toContain(
      "doorStyles.saveAiColumn"
    );
    const source = readFileSync("server/routers/catalog.ts", "utf8");
    const start = source.indexOf("  saveAiColumn: adminProcedure");
    const body = source.slice(
      start,
      source.indexOf("  importSupplierSamples:", start)
    );
    expect(body).toContain("doorStyleId: z.number().int().positive()");
    expect(body).toContain('column: z.enum(["gpt", "claude", "gemini"])');
    expect(body).toContain("return { ok: true as const, aiColumns }");
    expect(body).toContain('code: "PRECONDITION_FAILED"');
    const profile = source.slice(
      source.indexOf("  saveAiProfile: adminProcedure"),
      start
    );
    expect(profile).toContain(
      "renderHex: z.string().max(16).nullable().optional()"
    );
    expect(profile).toContain("renderHex: input.renderHex");
    const adminStart = source.indexOf("  listForAdmin: adminProcedure");
    const adminBody = source.slice(
      adminStart,
      source.indexOf("  setFeatured:", adminStart)
    );
    expect(adminBody).toContain(
      "withAiDoorProfileColumns(db, withColorSource)"
    );
    expect(adminBody).not.toContain("doorStyles.aiColumns");
  });

  it("rejects a shopper before touching the database", async () => {
    const db = createDb({
      flags: ready,
      styles: [{ id: 15, aiColumns: null }],
    });
    await expect(
      callerFor(shopper, db).doorStyles.saveAiColumn(input)
    ).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(db.calls).toHaveLength(0);
  });

  it("returns the merged aiColumns from saveAiColumn", async () => {
    const db = createDb({
      flags: ready,
      styles: [{ id: 15, aiColumns: { claude: claudeColumn } }],
    });
    const result = await callerFor(admin, db).doorStyles.saveAiColumn(input);
    expect(result.ok).toBe(true);
    expect(result.aiColumns.claude).toEqual(claudeColumn);
    expect(result.aiColumns.gpt).toMatchObject({
      imageUrl: input.imageUrl,
      model: input.model,
      text: input.text,
      renderHex: "#445566",
    });
    expect(
      Number.isNaN(Date.parse(result.aiColumns.gpt?.generatedAt ?? ""))
    ).toBe(false);
  });

  it("answers PRECONDITION_FAILED with the exact migration sentence", async () => {
    const db = createDb({
      flags: { profile: false, renderHex: false, aiColumns: false },
    });
    await expect(
      callerFor(admin, db).doorStyles.saveAiColumn(input)
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "The AI door columns are not in the database yet. Run docs/sql/0281_ai_door_profile.tidb.sql.",
    });
  });

  it("answers NOT_FOUND when the style id does not exist", async () => {
    const db = createDb({ flags: ready, styles: [] });
    await expect(
      callerFor(admin, db).doorStyles.saveAiColumn(input)
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: AI_DOOR_STYLE_NOT_FOUND_MESSAGE,
    });
  });

  it("persists renderHex from saveAiProfile", async () => {
    const db = createDb({
      flags: ready,
      styles: [{ id: 15, aiColumns: null }],
    });
    const result = await callerFor(admin, db).doorStyles.saveAiProfile({
      id: 15,
      model: "claude",
      text: "Oak shaker.",
      imageUrl: claudeColumn.imageUrl,
      renderHex: "#ABCDEF",
    });
    expect(result).toEqual({ ok: true });
    const update = sqlParts(
      db.calls.find(call => sqlParts(call).text.includes("UPDATE")) ?? {}
    );
    expect(update.text).toContain("aiProfileRenderHex =");
    expect(update.params).toContain("#abcdef");
  });

  it("includes aiColumns on listForAdmin and null when the column is missing", async () => {
    const present = createDb({
      flags: ready,
      styles: [
        {
          id: 15,
          aiColumns: { gpt: { ...claudeColumn, imageUrl: "/gpt.png" } },
          aiProfileModel: "gpt",
          aiProfileText: "Painted shaker.",
          aiProfileImageUrl: "/official.png",
          aiProfileRenderHex: "#445566",
        },
      ],
    });
    const rows = await callerFor(admin, present).doorStyles.listForAdmin();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 15,
      aiProfileModel: "gpt",
      aiProfileRenderHex: "#445566",
      aiColumns: { gpt: { imageUrl: "/gpt.png", renderHex: "#8d5a2b" } },
    });

    resetAiDoorProfileColumnsCache();
    resetDoorColorSourceColumnsCache();
    const missing = createDb({
      flags: { profile: true, renderHex: false, aiColumns: false },
      styles: [
        {
          id: 15,
          aiColumns: { gpt: claudeColumn },
          aiProfileModel: "gpt",
          aiProfileText: "kept",
          aiProfileImageUrl: "/official.png",
        },
      ],
    });
    const hidden = await callerFor(admin, missing).doorStyles.listForAdmin();
    expect(hidden[0]).toMatchObject({
      id: 15,
      aiProfileModel: "gpt",
      aiColumns: null,
    });
    expect(missing.selects.some(keys => keys.includes("aiColumns"))).toBe(
      false
    );
  });

  it("still lists styles when the column probe fails", async () => {
    const db = createDb({
      flags: ready,
      styles: [{ id: 15, aiColumns: { gpt: claudeColumn } }],
      probeError: new Error("information_schema unavailable"),
    });
    const rows = await callerFor(admin, db).doorStyles.listForAdmin();
    expect(rows.map(row => ({ id: row.id, aiColumns: row.aiColumns }))).toEqual(
      [{ id: 15, aiColumns: null }]
    );
  });
});
